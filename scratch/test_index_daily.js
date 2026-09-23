const fs = require('fs');
const env = fs.readFileSync('apps/web/.env.local', 'utf-8');
const keyMatch = env.match(/SECTORS_API_KEY=([^\r\n]+)/);
const key = keyMatch ? keyMatch[1].replace(/["']/g, '').trim() : '';

async function run() {
  const r = await fetch('https://api.sectors.app/v2/index-daily/', {
    headers: { Authorization: key }
  });
  console.log('Status:', r.status);
  const data = await r.json();
  console.log('Type of data:', typeof data, Array.isArray(data) ? `Array length: ${data.length}` : Object.keys(data));
  if (Array.isArray(data)) {
    console.log('First 5 items:', data.slice(0, 5));
  } else if (data.results) {
    console.log('Results length:', data.results.length, 'First 5:', data.results.slice(0, 5));
  } else {
    console.log('Keys:', Object.keys(data));
  }
}

run();
