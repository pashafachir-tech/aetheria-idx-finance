const fs = require('fs');
const { IDX_UNIVERSE } = require('./apps/web/lib/idx-universe.ts');

const tickers = ['BSSR', 'PACK', 'MGLV', 'BUMI', 'BBCA', 'RISE', 'BYAN'];
for (const t of tickers) {
  const item = IDX_UNIVERSE.find(x => x.ticker === t);
  console.log(t, '->', item?.sector);
}
