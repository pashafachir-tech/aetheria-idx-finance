const fs = require('fs');

let key = process.env.SECTORS_API_KEY || '';
if (!key) {
  try {
    const env = fs.readFileSync('.env', 'utf-8');
    const keyMatch = env.match(/SECTORS_API_KEY=([^\r\n]+)/);
    if (keyMatch) key = keyMatch[1].replace(/["']/g, '').trim();
  } catch (e) {}
}

async function test() {
  console.log('Using key prefix:', key.slice(0, 6) + '...');
  for (const ep of ['most-traded', 'top-gainers', 'top-losers', 'sectors']) {
    try {
      const res = await fetch(`https://api.sectors.app/v2/${ep}/`, {
        headers: { Authorization: key }
      });
      console.log(`\n=== ${ep} status: ${res.status} ===`);
      const text = await res.text();
      console.log(`Sample (first 400 chars): ${text.slice(0, 400)}`);
      try {
        const json = JSON.parse(text);
        if (Array.isArray(json)) {
          console.log(`Array count: ${json.length}, first item:`, JSON.stringify(json[0]));
        } else if (typeof json === 'object') {
          console.log(`Object keys:`, Object.keys(json));
          const firstKey = Object.keys(json)[0];
          console.log(`Key "${firstKey}" type:`, typeof json[firstKey], Array.isArray(json[firstKey]) ? `length ${json[firstKey].length}` : '');
          if (Array.isArray(json[firstKey])) {
            console.log(`First item of ${firstKey}:`, JSON.stringify(json[firstKey][0]));
          }
        }
      } catch (e) {}
    } catch (e) {
      console.error(ep, 'fetch error:', e.message);
    }
  }
}

test();
