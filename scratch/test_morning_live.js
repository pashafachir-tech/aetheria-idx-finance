async function run() {
  const r = await fetch('http://localhost:3000/api/morning-scan?refresh=true');
  const d = await r.json();

  console.log('Total leaders:', d.leaders?.length);
  console.log('Catalysts count:', d.catalysts?.length);
  if (d.catalysts) {
    d.catalysts.forEach((c, idx) => {
      console.log(`\n--- Catalyst ${idx + 1} ---`);
      console.log('Title:', c.title);
      console.log('Theme:', c.theme);
      console.log('Sector:', c.sectorLabel);
      console.log('Narrative:', c.narrative);
      console.log('Top Mover:', c.primaryTicker, c.metrics);
      console.log('Signals:', c.technicalSetup?.signals);
      console.log('Affected:', c.affectedTickers);
    });
  }
  if (d.leaders) {
    const matchCounts = {
      swing: d.leaders.filter(l => l.strategyMatches?.swing).length,
      ara: d.leaders.filter(l => l.strategyMatches?.ara_hunter).length,
      bsjp: d.leaders.filter(l => l.strategyMatches?.bsjp).length,
      bpjs: d.leaders.filter(l => l.strategyMatches?.bpjs).length,
    };
    console.log('\n=== Screener Tab Counts ===');
    console.log(matchCounts);
    console.log('\nSample ARA Hunter:', d.leaders.filter(l => l.strategyMatches?.ara_hunter).slice(0, 5).map(l => ({ ticker: l.ticker, change1d: l.change1d, lastPrice: l.lastPrice })));
    console.log('\nSample Trend Swing:', d.leaders.filter(l => l.strategyMatches?.swing).slice(0, 5).map(l => ({ ticker: l.ticker, turnover: l.turnoverText, lastPrice: l.lastPrice })));
    console.log('\nSample BSJP:', d.leaders.filter(l => l.strategyMatches?.bsjp).slice(0, 5).map(l => ({ ticker: l.ticker, change1d: l.change1d, volumeLots: l.volumeLots })));
    console.log('\nSample Support Rebound (BPJS):', d.leaders.filter(l => l.strategyMatches?.bpjs).slice(0, 5).map(l => ({ ticker: l.ticker, change1d: l.change1d, rsi: l.rsi })));
  }
}

run().catch(e => console.error(e));
