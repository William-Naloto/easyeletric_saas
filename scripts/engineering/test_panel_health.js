/* ================================================================
 * Testes do Motor de Saúde do Quadro (Engineering Health) — Node.js:
 *
 *     node scripts/engineering/test_panel_health.js
 * ================================================================ */
"use strict";
const M = require("./project_model.js");
const H = require("./panel_health.js");

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    if (fn()) { passed++; console.log(`PASS  ${name}`); }
    else { failed++; console.error(`FAIL  ${name}`); }
  } catch (err) {
    failed++; console.error(`ERR   ${name} — ${err.message}`);
  }
}

/* ---------------- Cenários ---------------- */
const SITE_TRI = { Vfn: 127, Vll: 220, supplyType: "trifasico", Ta: 30, insulation: "PVC", groupedCircuits: 3, maxDropPct: 4 };
const SITE_MONO = { Vfn: 127, Vll: 220, supplyType: "monofasico", Ta: 30, insulation: "PVC", groupedCircuits: 2, maxDropPct: 4 };

// Cargas simétricas entre as fases → equilíbrio perfeito
const LOADS_OK = [
  { name: "TUG Sala", power: 1400, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: "A+N" },
  { name: "TUG Cozinha", power: 1400, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: "B+N" },
  { name: "TUG Área", power: 1400, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: "C+N" },
  { name: "Motobomba", power: 1500, distance: 20, pf: 0.85, type: "motor", method: "B1", wiringType: "A+B+C" }
];

// Tudo pendurado na fase A → desequilíbrio severo p/ recomendações
const LOADS_UNBALANCED = [
  { name: "TUG 1", power: 2000, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: "A+N" },
  { name: "TUG 2", power: 2000, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: "A+N" },
  { name: "TUG 3", power: 2000, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: "A+N" },
  { name: "TUG 4", power: 2000, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: "A+N" }
];

const model = M.build(LOADS_OK, SITE_TRI);
const health = H.assess(model);

/* ---------------- assess ---------------- */
test("Health Score no intervalo 0–100 com nota coerente", () =>
  health.healthPct >= 0 && health.healthPct <= 100 &&
  ["Excelente", "Bom", "Atenção", "Crítico"].includes(health.grade));

test("Projeto saudável pontua ≥ 75 (Bom ou Excelente)", () =>
  health.healthPct >= 75);

test("Todos os 6 indicadores executivos presentes", () => {
  const ids = health.indicators.map(i => i.id);
  return ["protection", "voltage-drop", "grounding", "balance", "demand", "differential"]
    .every(id => ids.includes(id)) && health.indicators.every(i => i.label && i.detail);
});

test("Indicador de aterramento PASS quando todo trecho tem PE", () =>
  health.indicators.find(i => i.id === "grounding").status === "PASS");

test("Indicador DR/DPS PASS com DR geral e DPS presentes", () =>
  health.indicators.find(i => i.id === "differential").status === "PASS");

test("Contagem de findings bate com WARN/ERROR do modelo", () => {
  const all = H.collectFindings(model);
  return all.length === health.findings.length &&
    health.warningCount + health.errorCount === all.length;
});

test("Barramentos: uma entrada por fase em uso + neutro, com utilização e reserva", () => {
  const phases = health.busbars.map(b => b.phase);
  return ["A", "B", "C", "N"].every(p => phases.includes(p)) &&
    health.busbars.every(b =>
      b.utilizationPct >= 0 && b.reservePct >= 0 &&
      b.utilizationPct + b.reservePct === 100 || b.reservePct === 0);
});

test("Capacidade futura entre 0 e 100%", () =>
  health.futureCapacityPct >= 0 && health.futureCapacityPct <= 100);

test("Monofásico: equilíbrio não se aplica (PASS, score 100)", () => {
  const h = H.assess(M.build([LOADS_OK[0]], SITE_MONO));
  const bal = h.indicators.find(i => i.id === "balance");
  return bal.status === "PASS" && bal.value === 100;
});

test("Projeto vazio: health 0 sem exceção", () =>
  H.assess(M.build([], SITE_TRI)).healthPct === 0);

test("Determinismo: mesmo modelo → mesmo resultado", () =>
  JSON.stringify(H.assess(model)) === JSON.stringify(H.assess(model)));

/* ---------------- recommend ---------------- */
test("Instalação desequilibrada gera recomendação de rebalanceamento com ação", () => {
  const m = M.build(LOADS_UNBALANCED, SITE_TRI);
  const recs = H.recommend(m, LOADS_UNBALANCED, SITE_TRI);
  const pb = recs.find(r => r.id === "phase-balance");
  return pb && pb.action && pb.action.type === "phase-moves" &&
    pb.action.moves.length > 0 &&
    pb.action.after.score > pb.action.before.score &&
    pb.reference.includes("NBR 5410");
});

test("Ação de rebalanceamento NÃO é aplicada automaticamente (cargas intactas)", () => {
  const before = JSON.stringify(LOADS_UNBALANCED);
  const m = M.build(LOADS_UNBALANCED, SITE_TRI);
  H.recommend(m, LOADS_UNBALANCED, SITE_TRI);
  return JSON.stringify(LOADS_UNBALANCED) === before;
});

test("Instalação equilibrada não recomenda rebalanceamento", () => {
  const recs = H.recommend(model, LOADS_OK, SITE_TRI);
  const pb = recs.find(r => r.id === "phase-balance");
  return !pb || pb.action.after.score > pb.action.before.score;
});

test("Cada finding WARN/ERROR vira recomendação com severidade e referência", () => {
  const m = M.build(LOADS_UNBALANCED, SITE_TRI);
  const recs = H.recommend(m, LOADS_UNBALANCED, SITE_TRI);
  const h = H.assess(m);
  const checkRecs = recs.filter(r => r.id.startsWith("check-"));
  return checkRecs.length === h.findings.length &&
    checkRecs.every(r => ["warn", "error"].includes(r.severity) && r.reference);
});

test("Todas as recomendações têm contrato {id, severity, title, detail}", () => {
  const m = M.build(LOADS_UNBALANCED, SITE_TRI);
  const recs = H.recommend(m, LOADS_UNBALANCED, SITE_TRI);
  return recs.every(r => r.id && ["info", "warn", "error"].includes(r.severity) &&
    r.title && r.detail);
});

test("Projeto vazio: recomendações vazias sem exceção", () =>
  H.recommend(M.build([], SITE_TRI), [], SITE_TRI).length === 0);

/* ---------------- Resultado ---------------- */
console.log(`\n${passed} aprovados, ${failed} reprovados (${passed + failed} casos)`);
process.exitCode = failed ? 1 : 0;
