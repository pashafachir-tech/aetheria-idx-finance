const fs = require('fs');
const content = fs.readFileSync('apps/web/lib/idx-universe.ts', 'utf-8');

const tickers = ['BSSR', 'PACK', 'MGLV', 'BUMI', 'BBCA', 'RISE', 'BYAN', 'MEDC', 'AKRA', 'PGAS'];
for (const t of tickers) {
  const m = content.match(new RegExp(`ticker:\\s*"${t}",\\s*name:\\s*"([^"]+)",\\s*sector:\\s*"([^"]+)"`));
  if (m) {
    console.log(t, '->', m[2], `(${m[1]})`);
  } else {
    console.log(t, '-> NOT FOUND');
  }
}
