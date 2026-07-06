/* ================================================================
 * Testes do Motor de Aterramento — Node.js:
 *
 *     node scripts/engineering/test_grounding.js
 * ================================================================ */
"use strict";
const G = require("./grounding.js");

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    if (fn()) { passed++; console.log(`PASS  ${name}`); }
    else { failed++; console.error(`FAIL  ${name}`); }
  } catch (err) {
    failed++; console.error(`ERR   ${name} — ${err.message}`);
  }
}

/* ---------------- Esquemas ---------------- */
test("Quatro esquemas suportados: TT, TN-S, TN-C-S, IT", () =>
  ["TT", "TN-S", "TN-C-S", "IT"].every(s => G.schemeInfo(s).name === s));
test("TT: DR obrigatório (laço de alta impedância)", () =>
  G.schemeInfo("TT").rcdMandatory === true);
test("TN-S e TN-C-S: DR não obrigatório para seccionamento", () =>
  !G.schemeInfo("TN-S").rcdMandatory && !G.schemeInfo("TN-C-S").rcdMandatory);
test("Esquema desconhecido → TT (padrão residencial seguro)", () =>
  G.schemeInfo("XYZ").name === "TT");

/* ---------------- PE (Tabela 58) ---------------- */
test("PE = fase até 16mm²: 2,5→2,5 | 10→10 | 16→16", () =>
  G.peSectionFor(2.5) === 2.5 && G.peSectionFor(10) === 10 && G.peSectionFor(16) === 16);
test("PE = 16mm² para fases 25/35mm²", () =>
  G.peSectionFor(25) === 16 && G.peSectionFor(35) === 16);
test("PE = fase/2 (comercial superior): 50→25 | 70→35 | 95→50", () =>
  G.peSectionFor(50) === 25 && G.peSectionFor(70) === 35 && G.peSectionFor(95) === 50);

/* ---------------- Projeto completo ---------------- */
test("Residencial TT 10mm²: PE 10, aterramento ≥6, BEP 6mm²", () => {
  const r = G.designGroundingSystem({ scheme: "TT", feederPhaseMm2: 10 });
  return r.pe.sectionMm2 === 10 && r.earthingConductor.sectionMm2 >= 6 &&
    r.bonding.mainMm2 === 6 && r.rcd.mandatory;
});
test("BEP = PE/2 com teto de 25mm²: fase 95 → PE 50 → BEP 25", () => {
  const r = G.designGroundingSystem({ scheme: "TN-S", feederPhaseMm2: 95 });
  return r.pe.sectionMm2 === 50 && r.bonding.mainMm2 === 25;
});
test("Eletrodo: ≥3 hastes 2,4m, meta ≤10Ω", () => {
  const r = G.designGroundingSystem({ scheme: "TT", feederPhaseMm2: 10 });
  return r.electrode.minRods === 3 && r.electrode.rodLengthM === 2.4 &&
    r.electrode.targetResistanceOhm === 10;
});
test("SPDA integra eletrodo único (anel) no BEP", () => {
  const r = G.designGroundingSystem({ scheme: "TT", feederPhaseMm2: 16, hasLPS: true });
  return /eletrodo único/.test(r.electrode.note);
});
test("TN-C-S com alimentador <10mm² → ERROR de PEN", () => {
  const r = G.designGroundingSystem({ scheme: "TN-C-S", feederPhaseMm2: 6 });
  const c = r.checks.find(x => x.id === "gnd-pen");
  return c && c.status === "ERROR";
});
test("TN-C-S com 16mm² → PEN PASS + regra de não seccionamento", () => {
  const r = G.designGroundingSystem({ scheme: "TN-C-S", feederPhaseMm2: 16 });
  return r.checks.find(x => x.id === "gnd-pen").status === "PASS" &&
    r.checks.some(x => x.id === "gnd-pen-secc");
});
test("IT → WARN de supervisor de isolamento (DSI)", () => {
  const r = G.designGroundingSystem({ scheme: "IT", feederPhaseMm2: 16 });
  const c = r.checks.find(x => x.id === "gnd-dsi");
  return c && c.status === "WARN";
});
test("Áreas molhadas → decisão de equipotencialização suplementar", () => {
  const com = G.designGroundingSystem({ scheme: "TT", feederPhaseMm2: 10, hasWetAreas: true });
  const sem = G.designGroundingSystem({ scheme: "TT", feederPhaseMm2: 10 });
  return com.decisions.some(d => /suplementar/.test(d.decision)) &&
    !sem.decisions.some(d => /suplementar/.test(d.decision));
});
test("BEP interliga água, gás, estruturas, PE e eletrodo", () => {
  const r = G.designGroundingSystem({ scheme: "TT", feederPhaseMm2: 10 });
  return r.bonding.elements.length >= 5;
});
test("Toda decisão traz referência normativa", () => {
  const r = G.designGroundingSystem({ scheme: "TN-C-S", feederPhaseMm2: 16, hasWetAreas: true, hasLPS: true });
  return r.decisions.length >= 5 && r.decisions.every(d => d.reference);
});

console.log(`\n${passed}/${passed + failed} testes aprovados${failed ? ` — ${failed} FALHARAM` : ""}`);
if (failed) process.exitCode = 1;
