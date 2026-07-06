/* ================================================================
 * Testes do Motor de Balanceamento de Fases — Node.js:
 *
 *     node scripts/engineering/test_phase_balance.js
 * ================================================================ */
"use strict";
const PB = require("./phase_balance.js");

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    if (fn()) { passed++; console.log(`PASS  ${name}`); }
    else { failed++; console.error(`FAIL  ${name}`); }
  } catch (err) {
    failed++; console.error(`ERR   ${name} — ${err.message}`);
  }
}
const approx = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

const SITE = { Vfn: 127, Vll: 220, supplyType: "trifasico" };

/* ---------------- Corrente de neutro (soma fasorial) ---------------- */
test("Neutro 3F equilibrado (10/10/10A) = 0", () =>
  approx(PB.neutralCurrent({ A: 10, B: 10, C: 10 }, ["A", "B", "C"]), 0));
test("Neutro 3F com uma fase (10/0/0A) = 10A", () =>
  approx(PB.neutralCurrent({ A: 10, B: 0, C: 0 }, ["A", "B", "C"]), 10));
test("Neutro 3F duas fases iguais (10/10/0A) = 10A (120°)", () =>
  approx(PB.neutralCurrent({ A: 10, B: 10, C: 0 }, ["A", "B", "C"]), 10));
test("Neutro 2F iguais (10/10A) = 10A (fases a 120°)", () =>
  approx(PB.neutralCurrent({ A: 10, B: 10 }, ["A", "B"]), 10));
test("Neutro 1F = corrente da fase", () =>
  approx(PB.neutralCurrent({ A: 17.3 }, ["A"]), 17.3));

/* ---------------- Desequilíbrio e score ---------------- */
test("Desequilíbrio (30/20/10A) = 66,7%", () =>
  approx(PB.imbalancePct({ A: 30, B: 20, C: 10 }, ["A", "B", "C"]), 66.67, 0.1));
test("Desequilíbrio zero com fases iguais", () =>
  PB.imbalancePct({ A: 15, B: 15, C: 15 }, ["A", "B", "C"]) === 0);
test("Score 100 com equilíbrio perfeito e neutro nulo", () =>
  PB.balanceScore(0, 0, 30) === 100);
test("Score penaliza neutro elevado mesmo sem desequilíbrio de módulo", () =>
  PB.balanceScore(0, 15, 30) < 100);
test("Score nunca negativo", () =>
  PB.balanceScore(150, 50, 10) === 0);
test("Notas: 3%→Excelente | 8%→Bom | 15%→Aceitável | 40%→Crítico", () =>
  PB.gradeOf(3) === "Excelente" && PB.gradeOf(8) === "Bom" &&
  PB.gradeOf(15) === "Aceitável" && PB.gradeOf(40) === "Crítico");

/* ---------------- Análise ---------------- */
test("Análise usa demanda diversificada (corrente < instalada)", () => {
  const loads = [
    { power: 2000, pf: 1, type: "tomadas", wiringType: "A+N" },
    { power: 2000, pf: 1, type: "tomadas", wiringType: "B+N" },
    { power: 2000, pf: 1, type: "tomadas", wiringType: "C+N" }
  ];
  const a = PB.analyze(loads, SITE);
  // 6kW ilum+TUG → fator progressivo < 1 ⇒ corrente por fase < 2000/127
  return a.Iphase.A < 2000 / 127 && a.Iphase.A > 0 && approx(a.imbalancePct, 0);
});
test("Análise: F+F soma corrente de linha nas duas fases, sem neutro", () => {
  const loads = [{ power: 5500, pf: 1, type: "aquecimento", wiringType: "A+B" }];
  const a = PB.analyze(loads, SITE);
  return approx(a.Iphase.A, 25, 0.1) && approx(a.Iphase.B, 25, 0.1) &&
    a.neutralA === 0;
});
test("Análise: tudo em A ⇒ desequilíbrio 100%, grade Crítico", () => {
  const loads = [
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" }
  ];
  const a = PB.analyze(loads, SITE);
  return a.imbalancePct === 100 && a.grade === "Crítico" && a.neutralA > 0;
});

/* ---------------- Otimizador ---------------- */
test("Otimizador: tudo em A → redistribui e melhora o score", () => {
  const loads = [
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" }
  ];
  const r = PB.optimize(loads, SITE);
  return r.improved && r.moves.length === 2 &&
    r.after.imbalancePct < 1 && r.after.score > r.before.score;
});
test("Otimizador: distribuição já ótima ⇒ nenhum movimento", () => {
  const loads = [
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "B+N" },
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "C+N" }
  ];
  const r = PB.optimize(loads, SITE);
  return r.moves.length === 0 && r.after.score === r.before.score;
});
test("Otimizador: circuitos F+F e 3F permanecem fixos", () => {
  const loads = [
    { power: 5500, pf: 1, type: "aquecimento", wiringType: "A+B" },
    { power: 6000, pf: 0.92, type: "motor", wiringType: "A+B+C" },
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" }
  ];
  const r = PB.optimize(loads, SITE);
  return r.moves.every(m => m.index === 2);
});
test("Otimizador compensa carga bifásica fixa com os monofásicos", () => {
  // A+B carrega A e B ⇒ monofásicos devem preferir a fase C
  const loads = [
    { power: 5500, pf: 1, type: "aquecimento", wiringType: "A+B" },
    { power: 2000, pf: 0.92, type: "tomadas", wiringType: "A+N" }
  ];
  const r = PB.optimize(loads, SITE);
  const m = r.moves.find(x => x.index === 1);
  return m && m.toPhase === "C" && r.after.imbalancePct < r.before.imbalancePct;
});
test("Otimizador bifásico usa apenas fases A e B", () => {
  const loads = [
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" }
  ];
  const r = PB.optimize(loads, { ...SITE, supplyType: "bifasico" });
  return r.moves.length === 1 && r.moves[0].toPhase === "B" &&
    r.after.imbalancePct < 1;
});
test("Otimizador monofásico: move tudo para A+N, sem otimização", () => {
  const loads = [{ power: 1500, pf: 0.92, type: "tomadas", wiringType: "B+N" }];
  const r = PB.optimize(loads, { ...SITE, supplyType: "monofasico" });
  return r.moves.length === 1 && r.moves[0].toWiring === "A+N";
});
test("Otimizador é determinístico (mesma entrada → mesmos movimentos)", () => {
  const loads = [
    { power: 1000, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 2000, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 3000, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 1200, pf: 0.95, type: "iluminacao", wiringType: "A+N" },
    { power: 800, pf: 0.95, type: "iluminacao", wiringType: "A+N" }
  ];
  const a = PB.optimize(loads, SITE), b = PB.optimize(loads, SITE);
  return JSON.stringify(a.moves) === JSON.stringify(b.moves);
});
test("Otimizador NÃO muta a entrada; applyTo aplica explicitamente", () => {
  const loads = [
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" }
  ];
  const r = PB.optimize(loads, SITE);
  const untouched = loads.every(l => l.wiringType === "A+N");
  r.applyTo(loads);
  const applied = r.moves.every(m => loads[m.index].wiringType === m.toWiring);
  return untouched && applied && r.moves.length >= 1;
});
test("Cenário residencial completo: desequilíbrio final ≤ 10%", () => {
  const loads = [
    { power: 660, pf: 0.95, type: "iluminacao", wiringType: "A+N" },
    { power: 500, pf: 0.95, type: "iluminacao", wiringType: "A+N" },
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 1200, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 1800, pf: 0.85, type: "climatizacao", wiringType: "A+N" },
    { power: 5500, pf: 1, type: "aquecimento", wiringType: "A+B" }
  ];
  const r = PB.optimize(loads, SITE);
  // Score < 100 mesmo equilibrado: neutro fasorial real (cargas F+N
  // pesadas) é penalizado por projeto — ver NEUTRAL_PENALTY_WEIGHT.
  return r.after.imbalancePct <= 10 && r.after.score >= 80 &&
    r.after.score <= 100 - r.after.imbalancePct;
});
test("Relatório antes/depois traz correntes por fase e neutro", () => {
  const loads = [
    { power: 2000, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 2000, pf: 0.92, type: "tomadas", wiringType: "A+N" }
  ];
  const r = PB.optimize(loads, SITE);
  return typeof r.before.neutralA === "number" &&
    typeof r.after.neutralA === "number" &&
    r.after.neutralA <= r.before.neutralA &&
    r.before.Iphase && r.after.Iphase && typeof r.scoreDelta === "number";
});

console.log(`\n${passed}/${passed + failed} testes aprovados${failed ? ` — ${failed} FALHARAM` : ""}`);
if (failed) process.exitCode = 1;
