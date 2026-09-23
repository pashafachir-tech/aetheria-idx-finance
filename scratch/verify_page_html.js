async function main() {
  try {
    const res = await fetch('http://localhost:3000/');
    const html = await res.text();
    console.log('Status:', res.status);
    console.log('HTML Length:', html.length);

    const checks = [
      'Morning Hub',
      'Katalis Makro &amp; Tematik Riil',
      '4 Matriks Screener BEI &amp; Quant Radar',
      'TREND SWING',
      'ARA HUNTER',
      'BSJP OVERNIGHT',
      'SUPPORT REBOUND',
    ];

    console.log('\nUI Element Checks:');
    checks.forEach(str => {
      console.log(`- Contains "${str}": ${html.includes(str) ? 'YES' : 'NO'}`);
    });

    const forbidden = [
      'Disrupsi Distribusi Energi',
      'Uji Support Kunci',
      'Normalisasi harga gandum',
      'Data historis terbatas',
      '55%',
      '45%',
      'TradingView',
      'tradingview'
    ];
    console.log('\nForbidden String Checks in HTML:');
    forbidden.forEach(str => {
      console.log(`- Contains "${str}": ${html.includes(str) ? 'FAIL' : 'CLEAN'}`);
    });
  } catch (err) {
    console.error('HTML fetch error:', err);
  }
}
main();
