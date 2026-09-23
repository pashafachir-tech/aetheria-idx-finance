const fs = require('fs');
const env = fs.readFileSync('apps/web/.env.local', 'utf-8');
const keyMatch = env.match(/SECTORS_API_KEY=([^\r\n]+)/);
const key = keyMatch ? keyMatch[1].replace(/["']/g, '').trim() : '';

async function probe(path) {
  const url = `https://api.sectors.app${path}`;
  try {
    const r = await fetch(url, { headers: { Authorization: key } });
    console.log(`[${r.status}] ${path}`);
    if (r.ok) {
      const data = await r.json();
      console.log('Sample:', JSON.stringify(data).slice(0, 200));
    }
  } catch (err) {
    console.log(`[ERR] ${path}:`, err.message);
  }
}

async function run() {
  await probe('/v2/subsectors/');
  await probe('/v2/subsector/report/banks/');
  await probe('/v2/subsector/report/oil-gas-coal/');
  await probe('/v2/subsector/report/telecommunication/');
  await probe('/v2/index-daily/');
}

run();
