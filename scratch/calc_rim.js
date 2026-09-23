const bv0 = 2196;
const roe = 0.1712;
const r = 0.10;
const k = 0.50;
const g = 0.05;

let b = bv0, pv = 0, lastRI = 0;
for(let t=1; t<=5; t++) {
  const ri = (roe - r) * b;
  pv += ri / Math.pow(1 + r, t);
  lastRI = ri;
  b += (b * roe) * (1 - k);
}
console.log("pvSum:", pv.toFixed(1), "lastRI:", lastRI.toFixed(1));

// If terminal value fades or g = 0.02
for (const gVal of [0.01, 0.02, 0.03, 0.04, 0.05]) {
  const tv = (lastRI * (1 + gVal)) / (r - gVal);
  const pvTv = tv / Math.pow(1 + r, 5);
  console.log(`g: ${(gVal*100).toFixed(0)}% -> Fair Value: ${(bv0 + pv + pvTv).toFixed(0)}, PBV: ${((bv0 + pv + pvTv)/bv0).toFixed(2)}x`);
}

// If Ohlson persistence omega is used (where ROE decays to r):
// TV = lastRI / (1 + r - omega)
for (const omega of [0.5, 0.6, 0.7, 0.75, 0.8, 0.85]) {
  const tv = (lastRI * omega) / (1 + r - omega);
  const pvTv = tv / Math.pow(1 + r, 5);
  console.log(`omega: ${omega} -> Fair Value: ${(bv0 + pv + pvTv).toFixed(0)}, PBV: ${((bv0 + pv + pvTv)/bv0).toFixed(2)}x`);
}

// What if Cost of Equity r is 11% (as in live data r = 11%)?
console.log("With r = 11% (0.11):");
const r11 = 0.11;
let b11 = bv0, pv11 = 0, lastRI11 = 0;
for(let t=1; t<=5; t++) {
  const ri = (roe - r11) * b11;
  pv11 += ri / Math.pow(1 + r11, t);
  lastRI11 = ri;
  b11 += (b11 * roe) * (1 - k);
}
for (const gVal of [0.03, 0.04, 0.05]) {
  const tv = (lastRI11 * (1 + gVal)) / (r11 - gVal);
  const pvTv = tv / Math.pow(1 + r11, 5);
  console.log(`r=11%, g: ${(gVal*100).toFixed(0)}% -> Fair Value: ${(bv0 + pv11 + pvTv).toFixed(0)}, PBV: ${((bv0 + pv11 + pvTv)/bv0).toFixed(2)}x`);
}
