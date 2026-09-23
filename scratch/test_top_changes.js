const fs = require('fs');
const env = fs.readFileSync('apps/web/.env.local', 'utf-8');
const keyMatch = env.match(/SECTORS_API_KEY=([^\r\n]+)/);
const key = keyMatch ? keyMatch[1].replace(/["']/g, '').trim() : '';

async function run() {
  const url = 'https://api.sectors.app/v2/companies/top-changes/?classifications=top_gainers,top_losers&periods=1d&n_stock=10';
  console.log('Calling:', url);
  const r = await fetch(url, { headers: { Authorization: key } });
  console.log('Status:', r.status);
  const data = await r.json();
  console.log('Data:', JSON.stringify(data, null, 2));
}

run();
