const fs = require('fs');

const env = fs.readFileSync('apps/web/.env.local', 'utf-8');
const keyMatch = env.match(/SECTORS_API_KEY=([^\r\n]+)/);
const key = keyMatch ? keyMatch[1].replace(/["']/g, '').trim() : '';

const endpoints = [
  'most-traded/',
  'top-gainers/',
  'top-losers/',
  'sectors/',
  'subsectors/',
  'top-company-movers/',
  'movers/',
  'market-summary/',
  'idx-market-summary/',
  'news/',
  'companies/'
];

async function probe() {
  console.log('Testing with key:', key.slice(0, 8) + '...');
  for (const ep of endpoints) {
    try {
      const res = await fetch(`https://api.sectors.app/v2/${ep}`, {
        headers: { Authorization: key }
      });
      console.log(`\nEndpoint: /v2/${ep} -> Status: ${res.status}`);
      const text = await res.text();
      console.log(`Response preview: ${text.slice(0, 300)}`);
    } catch (e) {
      console.log(`Endpoint: /v2/${ep} -> Error: ${e.message}`);
    }
  }
}

probe();
