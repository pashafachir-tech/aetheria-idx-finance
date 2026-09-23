const fs = require('fs');

const env = fs.readFileSync('apps/web/.env.local', 'utf-8');
const keyMatch = env.match(/SECTORS_API_KEY=([^\r\n]+)/);
const key = keyMatch ? keyMatch[1].replace(/["']/g, '').trim() : '';

const candidates = [
  'most-traded/?n_stock=50',
  'most-traded/?type=gainers',
  'gainers/',
  'losers/',
  'top-gainers-losers/',
  'market/movers/',
  'market/gainers/',
  'market/most-traded/',
  'sector/report/',
  'sector/report/energy/',
  'subsector/report/banks/',
  'subsectors/',
  'industries/',
  'sectors/overview/',
  'sectors/list/',
  'daily/',
  'daily/BBCA/',
  'performance/',
  'market-overview/',
  'statistics/',
];

async function probe() {
  for (const c of candidates) {
    try {
      const res = await fetch(`https://api.sectors.app/v2/${c}`, {
        headers: { Authorization: key }
      });
      if (res.status !== 404) {
        console.log(`Endpoint: /v2/${c} -> Status: ${res.status}`);
        const text = await res.text();
        console.log(`Preview: ${text.slice(0, 200)}\n`);
      }
    } catch (e) {
      console.log(`Error on ${c}:`, e.message);
    }
  }
}

probe();
