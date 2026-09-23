const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const key = env.match(/SECTORS_API_KEY=(.*)/)?.[1]?.trim();

async function test() {
  for (const sym of ['BBRI', 'AKRA', 'BBCA', 'BMRI']) {
    console.log(`\n--- Testing ${sym} ---`);
    const paths = [
      `/v2/company-quarterly-financials/${sym}/`,
      `/v2/company/quarterly-financials/${sym}/`,
      `/v2/company/report/${sym}/`,
      `/v2/top-buyers-sellers/?symbol=${sym}`,
      `/v2/top-buyers-sellers/${sym}/`,
      `/v2/broker-activity/?symbol=${sym}`,
      `/v2/daily-net-foreign-inflow/?symbol=${sym}`,
      `/v2/shareholders-composition/${sym}/`,
    ];
    for (const p of paths) {
      try {
        const r = await fetch('https://api.sectors.app' + p, { headers: { Authorization: key } });
        if (r.status === 200) {
          const d = await r.json();
          console.log(`[200 OK] ${p} ->`, Array.isArray(d) ? `Array(${d.length})` : Object.keys(d));
        } else {
          console.log(`[${r.status}] ${p}`);
        }
      } catch (e) {
        console.error(p, e.message);
      }
    }
  }
}
test();
