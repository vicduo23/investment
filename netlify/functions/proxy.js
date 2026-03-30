const https = require('https');
const http = require('http');

const FINNHUB_KEY = 'd74uff1r01qg1eo6u5l0d74uff1r01qg1eo6u5lg';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const params = event.queryStringParameters || {};
  const type = params.type;
  const symbol = (params.symbol || '').toUpperCase();

  try {
    let data;
    const isNonUS = symbol.includes('.');

    if (type === 'quote') {
      if (isNonUS) {
        // Yahoo Finance for HK/JP/CN stocks
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
        const raw = await fetchUrl(url);
        const meta = raw?.chart?.result?.[0]?.meta;
        if (!meta) throw new Error('No data from Yahoo');
        const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
        const price = meta.regularMarketPrice;
        data = {
          c: price,
          d: price - prev,
          dp: prev ? ((price - prev) / prev * 100) : 0,
          h: meta.regularMarketDayHigh,
          l: meta.regularMarketDayLow,
          o: meta.regularMarketOpen,
          pc: prev,
          name: meta.longName || meta.shortName || symbol,
          currency: meta.currency,
          exchange: meta.exchangeName,
          high52: meta.fiftyTwoWeekHigh,
          low52: meta.fiftyTwoWeekLow,
          pe: meta.trailingPE || null,
        };
      } else {
        data = await fetchUrl(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`);
      }
    } else if (type === 'profile') {
      data = await fetchUrl(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_KEY}`);
    } else if (type === 'metric') {
      data = await fetchUrl(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB_KEY}`);
    } else if (type === 'news') {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      data = await fetchUrl(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_KEY}`);
    } else if (type === 'recommend') {
      data = await fetchUrl(`https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${FINNHUB_KEY}`);
    } else if (type === 'index') {
      // Market indices
      const indexMap = {
        'SPX': '^GSPC', 'HSI': '^HSI', 'N225': '^N225',
      };
      const sym = indexMap[symbol] || symbol;
      data = await fetchUrl(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`);
    } else if (type === 'cn_index') {
      // A-share index via East Money
      const raw = await fetchUrl('https://push2.eastmoney.com/api/qt/stock/get?secid=1.000001&fields=f43,f169,f170');
      const d = raw?.data;
      data = d ? { price: (d.f43/100).toFixed(2), chgPct: (d.f170/100).toFixed(2) } : { price: '--', chgPct: '0' };
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown type' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
