async function main() {
  try {
    const res = await fetch('http://localhost:3000/api/morning-scan');
    const data = await res.json();
    console.log('=== API RESPONSE SUMMARY ===');
    console.log('Timestamp:', data.timestamp);
    console.log('Market Status:', data.marketStatus);
    console.log('Catalysts Count:', data.catalysts?.length);
    data.catalysts.forEach((c, idx) => {
      const movers = c.topMovers ? c.topMovers.map(m => m.ticker + ' (' + (m.changePct >= 0 ? '+' : '') + m.changePct.toFixed(1) + '%)').join(', ') : 'none';
      console.log(`[${idx+1}] Sector: ${c.title} | Category: ${c.category} | Movers: ${movers}`);
      console.log(`    Narrative: ${c.narrative}`);
      console.log(`    Active Signals: ${JSON.stringify(c.activeSignals)}`);
    });
    console.log('Total Leaders:', data.leaders?.length);
    const strategies = {
      swing: data.leaders.filter(l => l.strategyMatches?.swing).length,
      ara_hunter: data.leaders.filter(l => l.strategyMatches?.ara_hunter).length,
      bsjp: data.leaders.filter(l => l.strategyMatches?.bsjp).length,
      bpjs: data.leaders.filter(l => l.strategyMatches?.bpjs).length,
    };
    console.log('Strategy counts (all > 0):', JSON.stringify(strategies));
    console.log('\nSample Leaders per Strategy:');
    console.log('- Swing:', data.leaders.find(l => l.strategyMatches?.swing)?.ticker);
    console.log('- ARA Hunter:', data.leaders.find(l => l.strategyMatches?.ara_hunter)?.ticker);
    console.log('- BSJP:', data.leaders.find(l => l.strategyMatches?.bsjp)?.ticker);
    console.log('- Support Rebound:', data.leaders.find(l => l.strategyMatches?.bpjs)?.ticker);

    // Check for any forbidden static strings
    const rawStr = JSON.stringify(data);
    const forbidden = [
      'Disrupsi Distribusi Energi',
      'Uji Support Kunci',
      'Normalisasi harga gandum',
      'Data historis terbatas',
      '55%',
      '45%'
    ];
    console.log('\nForbidden String Checks:');
    forbidden.forEach(word => {
      const found = rawStr.includes(word);
      console.log(`- Contains "${word}": ${found ? 'FAIL' : 'CLEAN'}`);
    });
  } catch (err) {
    console.error('Test error:', err);
  }
}
main();
