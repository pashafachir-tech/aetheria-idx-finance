const http = require("http");

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on("error", reject);
    if (options.body) req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

async function verifyTicker(ticker) {
  console.log(`\n======================================================`);
  console.log(`VERIFYING ON-DEMAND RUNTIME FOR TICKER: ${ticker}`);
  console.log(`======================================================`);

  const res = await fetchJson("http://localhost:3000/api/research", {
    method: "POST",
    body: { ticker },
  });

  if (res.status !== 200) {
    console.error(`FAILED with HTTP ${res.status}:`, res.data || res.raw);
    return false;
  }

  const pres = res.data.presentation;
  console.log(`✓ HTTP 200 OK`);
  console.log(`  - Company Name: ${pres.companyName}`);
  console.log(`  - Sector / Subsector: ${pres.sector} / ${pres.subsector}`);
  console.log(`  - Authentic Market Price: Rp ${pres.marketPrice?.toLocaleString("id-ID")}`);
  console.log(`  - Shares Outstanding: ${pres.modelInputs?.sharesOutstanding?.toLocaleString("id-ID") || "N/A"}`);
  console.log(`  - Historical Daily Candles: ${pres.historicalPriceSeries?.length || 0} sessions`);

  if (pres.historicalPriceSeries && pres.historicalPriceSeries.length > 0) {
    const first = pres.historicalPriceSeries[0];
    const last = pres.historicalPriceSeries[pres.historicalPriceSeries.length - 1];
    console.log(`    * Earliest Candle: ${first.date} Close=Rp ${first.close.toLocaleString("id-ID")}`);
    console.log(`    * Latest Candle:   ${last.date} Close=Rp ${last.close.toLocaleString("id-ID")}, Volume=${last.volume.toLocaleString("id-ID")}`);
  }

  if (pres.bankMetrics) {
    console.log(`  - Banking Prudential Metrics (Real Sectors API):`);
    console.log(`    * NIM: ${((pres.bankMetrics.netInterestMargin?.value || 0) * 100).toFixed(2)}%`);
    console.log(`    * ROE: ${((pres.bankMetrics.roe?.value || 0) * 100).toFixed(2)}%`);
    console.log(`    * NPL: ${((pres.bankMetrics.nonPerformingLoan?.value || 0) * 100).toFixed(2)}%`);
    console.log(`    * BVPS: Rp ${pres.bankMetrics.bookValuePerShare?.value?.toLocaleString("id-ID")}`);
  }

  if (pres.residualIncome) {
    console.log(`  - Residual Income Fair Value: Rp ${pres.residualIncome.fairValuePerShare?.toLocaleString("id-ID")}`);
  }

  if (pres.reverseDcf) {
    console.log(`  - Reverse DCF Market Implied Growth: ${(pres.reverseDcf.impliedGrowth * 100).toFixed(1)}%`);
  }

  if (pres.subsectorReport) {
    console.log(`  - Subsector Peers Count: ${pres.subsectorReport.company_count}`);
  }

  if (pres.quarterlyFinancials) {
    console.log(`  - Quarterly Seasonality Badge: ${pres.quarterlyFinancials.window_dressing_badge}`);
    console.log(`  - Quarterly Records Count: ${pres.quarterlyFinancials.quarterly_records?.length || 0}`);
  }

  return true;
}

async function runAll() {
  const tickers = ["BMRI", "BUMI", "AKRA", "CUAN", "DFAM"];
  for (const t of tickers) {
    await verifyTicker(t);
  }
}

runAll().catch(console.error);
