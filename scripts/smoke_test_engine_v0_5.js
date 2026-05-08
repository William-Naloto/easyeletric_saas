const sqrt3 = Math.sqrt(3);
function current(power, voltage, pf, phase){ return phase === "3F" || phase === "3F+N" ? power/(sqrt3*voltage*pf) : power/(voltage*pf); }
function approx(a,b,tol=0.02){ return Math.abs(a-b) <= tol; }
const tests = [
  ["1F current", approx(current(1270,127,1,"1F+N"),10)],
  ["2F current", approx(current(2200,220,1,"2F"),10)],
  ["3F current", approx(current(3800,380,1,"3F"),5.77,0.05)]
];
for (const [name, ok] of tests){ console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if(!ok) process.exitCode = 1; }
