/* ================================================================
 * Testes do Registro de Decisões de Engenharia — Node.js:
 *
 *     node scripts/engineering/test_decision_log.js
 * ================================================================ */
"use strict";
const E = require("../nbr5410_engine.js");
const D = require("./decision_log.js");
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

const SITE = { Vfn: 127, Vll: 220, Ta: 30, insulation: "PVC", groupedCircuits: 3, maxDropPct: 4, supplyType: "trifasico" };
const HOUSE = [
  { power: 660, pf: 0.95, type: "iluminacao", wiringType: "A+N" },
  { power: 1500, pf: 0.92, type: "tomadas", wiringType: "B+N" },
  { power: 5500, pf: 1, type: "aquecimento", wiringType: "A+B" },
  { power: 1800, pf: 0.85, type: "climatizacao", wiringType: "C+N" }
];

/* ---------------- Log de circuito ---------------- */
const shower = E.sizeCircuit({ power: 5500, pf: 1, distance: 12, type: "aquecimento", method: "B1", wiringType: "A+B" }, SITE);
const showerLog = D.fromCircuit(shower);

test("Log de circuito cobre Ib, fatores, condutor, PE, disjuntor, Icn e DR", () => {
  const ids = showerLog.map(e => e.id);
  return ["ib", "fatores", "condutor", "pe", "disjuntor", "icn", "dr"].every(id => ids.includes(id));
});
test("Toda entrada tem decision, reason e reference", () =>
  showerLog.every(e => e.decision && e.reason && e.reference));
test("Seções rejeitadas vêm da trilha do motor com o motivo", () => {
  const c = showerLog.find(e => e.id === "condutor");
  // chuveiro 25A com Fg=0,7: 2,5 e 4 mm² reprovam por ampacidade
  return c.rejected.length >= 2 &&
    c.rejected.some(x => x.option === "2,5 mm²") &&
    c.rejected.every(x => /Izc|mínima|ΔV/.test(x.reason));
});
test("Disjuntores rejeitados com motivo (abaixo de Ib / acima de Izc)", () => {
  const b = showerLog.find(e => e.id === "disjuntor");
  return b.rejected.some(x => /In < Ib/.test(x.reason)) &&
    b.rejected.some(x => /Izc/.test(x.reason)) && b.value === 25;
});
test("Exemplo da especificação: Ib=24,8A → cabo 4mm², 25A; 20A e 32A rejeitados", () => {
  // 24,8A: climatização 2900VA/127V/FP0,92 ≈ 24,8A, sem agrupamento.
  // Equipamento fixo/dedicado → estratégia "min" (In ≈ Ib), que é o
  // cenário que este exemplo da especificação sempre documentou.
  // (Para circuitos de tomada, ver a estratégia "max" nos testes do
  // motor: o disjuntor usa a folga do condutor, não o menor In≥Ib.)
  const r = E.sizeCircuit({ power: 2900, pf: 0.92, distance: 10, type: "climatizacao", method: "B1", wiringType: "A+N" },
    { ...SITE, groupedCircuits: 1 });
  const log = D.fromCircuit(r);
  const c = log.find(e => e.id === "condutor"), b = log.find(e => e.id === "disjuntor");
  return c.value === 4 && b.value === 25 &&
    c.rejected.some(x => x.option === "2,5 mm²") &&
    b.rejected.some(x => x.option === "20 A") &&
    b.rejected.some(x => x.option === "32 A");
});
test("Upsize por coordenação explicado na decisão do disjuntor", () => {
  const r = E.sizeCircuit({ power: 1800, pf: 0.85, distance: 15, type: "climatizacao", method: "B1", wiringType: "C+N" }, SITE);
  const b = D.fromCircuit(r).find(e => e.id === "disjuntor");
  return r.upsizedForBreaker && /seção elevada/i.test(b.reason);
});

/* ---------------- Log do QDF ---------------- */
const qdf = E.sizeFeederAndMain(HOUSE, SITE);
const qdfLog = D.fromFeeder(qdf);

test("Log do QDF cobre demanda, Ib, cabo, geral e equilíbrio", () => {
  const ids = qdfLog.map(e => e.id);
  return ["demanda", "ib-alim", "cabo-alim", "geral", "equilibrio"].every(id => ids.includes(id));
});
test("Demanda rejeita explicitamente a soma de disjuntores", () => {
  const d = qdfLog.find(e => e.id === "demanda");
  const g = qdfLog.find(e => e.id === "geral");
  return d.rejected.some(x => /instalada|disjuntores/.test(x.option)) &&
    g.rejected.some(x => /Σ In/.test(x.option));
});
test("Corrente do alimentador explica as três fases", () => {
  const e = qdfLog.find(x => x.id === "ib-alim");
  return /A=/.test(e.reason) && /B=/.test(e.reason) && /C=/.test(e.reason);
});
test("Cabo do alimentador cita reserva de expansão e critério governante", () => {
  const e = qdfLog.find(x => x.id === "cabo-alim");
  return /reserva/.test(e.reason) && /governante/i.test(e.reason);
});

/* ---------------- Log de projeto consolidado ---------------- */
test("fromProject agrega circuitos + QDF + módulos externos", () => {
  const circuits = HOUSE.map(l => E.sizeCircuit({ ...l, distance: 10, method: "B1" }, SITE));
  const rcdMain = R.selectMainRCD({ mainIn: qdf.main.In, supplyType: "trifasico", branchesHaveRcd: true, circuits: HOUSE });
  const proj = D.fromProject({
    circuits, feeder: qdf,
    extraDecisions: [{ scope: "DR Geral", decisions: rcdMain.decisions }]
  });
  return proj.length === HOUSE.length + 2 &&
    proj[HOUSE.length].scope === "QDF / Alimentador" &&
    proj[HOUSE.length + 1].scope === "DR Geral" &&
    proj.every(s => s.entries.length > 0 && s.entries.every(e => e.decision && e.reason));
});
test("Determinismo: mesmo projeto → mesmo log (JSON idêntico)", () => {
  const a = D.fromFeeder(E.sizeFeederAndMain(HOUSE, SITE));
  const b = D.fromFeeder(E.sizeFeederAndMain(HOUSE, SITE));
  return JSON.stringify(a) === JSON.stringify(b);
});

console.log(`\n${passed}/${passed + failed} testes aprovados${failed ? ` — ${failed} FALHARAM` : ""}`);
if (failed) process.exitCode = 1;
