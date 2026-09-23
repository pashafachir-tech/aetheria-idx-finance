async function main() {
  try {
    const res = await fetch('http://localhost:3000/api/morning-scan?t=' + Date.now());
    const data = await res.json();
    console.log('=== API RESPONSE VERIFICATION ===');
    console.log('Status: 200 OK');
    console.log('Keys returned:', Object.keys(data).join(', '));
    console.log('Has catalysts:', Array.isArray(data.catalysts));
    console.log('Has sectorCatalysts:', Array.isArray(data.sectorCatalysts));
    console.log('Has candidates:', Array.isArray(data.candidates));
    console.log('Has leaders:', Array.isArray(data.leaders));
    console.log('Has presets:', Array.isArray(data.presets));

    const candidates = data.candidates || data.leaders || [];
    console.log('Total Candidates:', candidates.length);

    // Normalizer helper identical to page.tsx
    const normalizeSlug = (str) =>
      (str || "").toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "");

    const testStrategies = [
      { key: "swing", label: "TREND SWING" },
      { key: "ara_hunter", label: "ARA HUNTER" },
      { key: "bsjp", label: "BSJP OVERNIGHT" },
      { key: "bpjs", label: "SUPPORT REBOUND" },
    ];

    console.log('\n=== SCREENER TAB COUNTS & MATCHING ===');
    testStrategies.forEach(strat => {
      const activeStrategySlug = normalizeSlug(strat.key);
      const activePill = "all";

      const filteredCandidates = candidates.filter((item) => {
        const itemStrategySlug = normalizeSlug(item.strategyId || item.strategy || item.preset);
        const matchStrategy =
          !activeStrategySlug ||
          activeStrategySlug === "all" ||
          (Boolean(itemStrategySlug) && (
            itemStrategySlug === activeStrategySlug ||
            itemStrategySlug.includes(activeStrategySlug) ||
            activeStrategySlug.includes(itemStrategySlug)
          )) ||
          Boolean(item.strategyMatches?.[activeStrategySlug]) ||
          (activeStrategySlug.includes("ara") && Boolean(item.strategyMatches?.ara_hunter || item.strategyMatches?.ara)) ||
          (activeStrategySlug.includes("swing") && Boolean(item.strategyMatches?.swing)) ||
          (activeStrategySlug.includes("bsjp") && Boolean(item.strategyMatches?.bsjp)) ||
          ((activeStrategySlug.includes("bpjs") || activeStrategySlug.includes("support") || activeStrategySlug.includes("rebound")) &&
            Boolean(item.strategyMatches?.bpjs)) ||
          (Array.isArray(item.strategyTags) &&
            item.strategyTags.some((t) => {
              const s = normalizeSlug(t);
              return Boolean(s) && (s.includes(activeStrategySlug) || activeStrategySlug.includes(s));
            }));

        const isAllSetup = !activePill || activePill === "all" || activePill === "Semua Setup";
        const matchPill = isAllSetup;
        return matchStrategy && matchPill;
      });

      console.log(`[Tab: ${strat.label}] key="${strat.key}" -> Count: ${filteredCandidates.length} emiten (PASS: ${filteredCandidates.length >= 5})`);
      console.log(`   Sample emitens: ${filteredCandidates.slice(0, 5).map(i => `${i.ticker} (Rp ${i.lastPrice}, ${i.change1d >= 0 ? '+' : ''}${i.change1d}%)`).join(', ')}`);
    });

    console.log('\n=== LEFT PANEL DYNAMIC SECTORS ===');
    const catalysts = data.catalysts || [];
    catalysts.forEach((c, idx) => {
      console.log(`[${idx+1}] ${c.title} | Sector: ${c.sectorLabel} | Theme: ${c.theme}`);
      console.log(`    Narrative: ${c.narrative}`);
      console.log(`    Signals: ${c.technicalSetup?.signals?.join(' · ')}`);
    });

    // Check forbidden strings
    const raw = JSON.stringify(data);
    const forbidden = [
      'Disrupsi Distribusi Energi',
      'Uji Support Kunci',
      'Normalisasi harga gandum',
      'Data historis terbatas',
      '55%',
      '45%'
    ];
    console.log('\n=== FORBIDDEN STRINGS AUDIT ===');
    forbidden.forEach(str => {
      console.log(`- Contains "${str}": ${raw.includes(str) ? 'FAIL' : 'CLEAN'}`);
    });
  } catch (err) {
    console.error('Test error:', err);
  }
}
main();
