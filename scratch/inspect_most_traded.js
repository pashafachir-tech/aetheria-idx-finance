const fs = require('fs');
const env = fs.readFileSync('apps/web/.env.local', 'utf-8');
const keyMatch = env.match(/SECTORS_API_KEY=([^\r\n]+)/);
const key = keyMatch ? keyMatch[1].replace(/["']/g, '').trim() : '';

async function run() {
  const url = 'https://api.sectors.app/v2/most-traded/?n_stock=50';
  const r = await fetch(url, { headers: { Authorization: key } });
  const data = await r.json();
  const dates = Object.keys(data).sort();
  console.log('Most traded dates:', dates);
  const latestDate = dates[dates.length - 1];
  console.log('Latest date:', latestDate, 'Items count:', data[latestDate]?.length);
  console.log('Top 5 items on latest date:', data[latestDate]?.slice(0, 5));
}

run();
