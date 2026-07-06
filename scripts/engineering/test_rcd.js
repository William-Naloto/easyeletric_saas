/* ================================================================
 * Testes do Motor de Seleção de DR — Node.js:
 *
 *     node scripts/engineering/test_rcd.js
 * ================================================================ */
"use strict";
const R = require("./rcd.js");

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    if (fn()) { passed++; console.log(`PASS  ${name}`); }
    else { failed++; console.error(`FAIL  ${name}`); }
  } catch (err) {
    failed++; console.error(`ERR   ${name} — ${err.message}`);
  }
}

/* ---------------- Obrigatoriedade e sensibilidade ---------------- */
test("Tomadas: DR 30 mA obrigatório (§5.1.3.2.2)", () => {
  const r = R.selectCircuitRCD({ type: "tomadas", breakerIn: 16 });
  return r.required && r.sensitivityMa === 30;
});
test("Chuveiro (aquecimento): 30 mA obrigatório — área molhada", () => {
  const r = R.selectCircuitRCD({ type: "aquecimento", breakerIn: 25, wiringType: "A+B" });
  return r.required && r.sensitivityMa === 30;
});
test("Iluminação fixa: 30 mA dispensável, 300 mA via geral", () => {
  const r = R.selectCircuitRCD({ type: "iluminacao", breakerIn: 10 });
  return !r.required && r.sensitivityMa === 300;
});
test("Iluminação EXTERNA: 30 mA obrigatório", () => {
  const r = R.selectCircuitRCD({ type: "iluminacao", breakerIn: 10, isOutdoor: true });
  return r.required && r.sensitivityMa === 30;
});

/* ---------------- Tipo (IEC 62423) ---------------- */
test("Chuveiro resistivo → tipo AC | tomadas → tipo A", () =>
  R.selectCircuitRCD({ type: "aquecimento", breakerIn: 25 }).type === "AC" &&
  R.selectCircuitRCD({ type: "tomadas", breakerIn: 16 }).type === "A");
test("Climatização (inverter) → tipo F", () =>
  R.selectCircuitRCD({ type: "climatizacao", breakerIn: 20 }).type === "F");
test("VFD trifásico → tipo B", () =>
  R.selectCircuitRCD({ type: "motor", breakerIn: 32, wiringType: "A+B+C", hasVFD: true }).type === "B");
test("VFD monofásico → tipo F (não B)", () =>
  R.selectCircuitRCD({ type: "motor", breakerIn: 20, wiringType: "A+N", hasVFD: true }).type === "F");
test("Hierarquia de tipos: B > F > A > AC", () =>
  R.strictestType("AC", "A") === "A" && R.strictestType("F", "A") === "F" &&
  R.strictestType("B", "F") === "B" && R.strictestType("A", "A") === "A");
test("Tipos rejeitados são explicados (decisão auditável)", () => {
  const r = R.selectCircuitRCD({ type: "climatizacao", breakerIn: 20 });
  const d = r.decisions.find(x => x.decision === "DR tipo F");
  return d && d.rejected.length === 2 && d.rejected.every(x => x.reason);
});

/* ---------------- Corrente nominal ---------------- */
test("Corrente do DR ≥ In do disjuntor: 16→25 | 25→25 | 32→40 | 63→63", () =>
  R.ratingFor(16) === 25 && R.ratingFor(25) === 25 &&
  R.ratingFor(32) === 40 && R.ratingFor(63) === 63);
test("Acima do catálogo satura no maior DR (125 A)", () =>
  R.ratingFor(150) === 125);
test("Polos: mono/bi → 2P | trifásico → 4P", () =>
  R.selectCircuitRCD({ type: "tomadas", breakerIn: 16, wiringType: "A+N" }).poles === 2 &&
  R.selectCircuitRCD({ type: "motor", breakerIn: 20, wiringType: "A+B+C" }).poles === 4);

/* ---------------- DR geral e seletividade ---------------- */
test("DRs terminais presentes → geral seletivo tipo S 300 mA", () => {
  const r = R.selectMainRCD({ mainIn: 63, supplyType: "trifasico", branchesHaveRcd: true });
  return r.selective && r.sensitivityMa === 300 && r.poles === 4;
});
test("Sem DRs terminais → geral 30 mA (proteção de pessoas)", () => {
  const r = R.selectMainRCD({ mainIn: 40, supplyType: "monofasico", branchesHaveRcd: false });
  return !r.selective && r.sensitivityMa === 30 && r.poles === 2;
});
test("Geral herda o tipo mais exigente dos circuitos (F de inverter)", () => {
  const r = R.selectMainRCD({
    mainIn: 63, supplyType: "trifasico", branchesHaveRcd: true,
    circuits: [{ type: "tomadas" }, { type: "climatizacao" }]
  });
  return r.type === "F";
});
test("Geral tipo B com VFD trifásico a jusante", () => {
  const r = R.selectMainRCD({
    mainIn: 63, supplyType: "trifasico", branchesHaveRcd: true,
    circuits: [{ type: "motor", wiringType: "A+B+C", hasVFD: true }]
  });
  return r.type === "B";
});
test("Corrente do geral ≥ In do disjuntor geral (63 A → DR 63 A)", () =>
  R.selectMainRCD({ mainIn: 63, supplyType: "trifasico" }).ratingA === 63);
test("Seletividade explicada com alternativa rejeitada", () => {
  const r = R.selectMainRCD({ mainIn: 63, supplyType: "trifasico", branchesHaveRcd: true });
  const d = r.decisions[0];
  return d.rejected && d.rejected.length === 1 && /seletividade/.test(d.rejected[0].reason);
});
test("Toda decisão traz referência normativa", () => {
  const c = R.selectCircuitRCD({ type: "tomadas", breakerIn: 16 });
  const m = R.selectMainRCD({ mainIn: 63, supplyType: "trifasico", branchesHaveRcd: true });
  return c.decisions.every(d => d.reference) && m.decisions.every(d => d.reference);
});

console.log(`\n${passed}/${passed + failed} testes aprovados${failed ? ` — ${failed} FALHARAM` : ""}`);
if (failed) process.exitCode = 1;
