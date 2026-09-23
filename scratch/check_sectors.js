const fs = require('fs');
const content = fs.readFileSync('apps/web/lib/idx-universe.ts', 'utf-8');
const matches = [...content.matchAll(/sector:\s*"([^"]+)"/g)].map(m => m[1]);
console.log('Sectors:', [...new Set(matches)]);
