/* ================================================================
 * Testes do Catálogo de Fabricantes — Node.js:
 *
 *     node scripts/engineering/test_manufacturer_catalog.js
 * ================================================================ */
"use strict";
const M = require("./project_model.js");
const C = require("./manufacturer_catalog.js");

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    if (fn()) { passed++; console.log(`PASS  ${name}`); }
    else { failed++; console.error(`FAIL  ${name}`); }
  } catch (err) {
    failed++; console.error(`ERR   ${name} — ${err.message}`);
  }
}

const SITE_TRI = { Vfn: 127, Vll: 220, supplyType: "trifasico", Ta: 30, insulation: "PVC", groupedCircuits: 3, maxDropPct: 4 };
const LOADS = [
  { name: "Iluminação", power: 900, distance: 12, pf: 0.95, type: "iluminacao", method: "B1", wiringType: "A+N" },
  { name: "Chuveiro", power: 5500, distance: 16, pf: 1.0, type: "aquecimento", method: "B1", wiringType: "A+B" },
  { name: "Motobomba", power: 1500, distance: 25, pf: 0.85, type: "motor", method: "B1", wiringType: "A+B+C" }
];
const model = M.build(LOADS, SITE_TRI);

/* ---------------- Fabricantes ---------------- */
test("Lista de fabricantes: genérico + 4 marcas, com id e nome", () => {
  const mks = C.manufacturers();
  return mks.length === 5 && mks[0].id === "generic" &&
    mks.every(m => m.id && m.name) &&
    ["weg", "schneider", "siemens", "abb"].every(id => mks.some(m => m.id === id));
});

/* ---------------- Disjuntores ---------------- */
test("WEG: disjuntor C16 2P segue o padrão MDW-C16-2", () => {
  const e = C.breakerRef("weg", { In: 16, curve: "C", poles: 2, icnRequiredA: 3000 });
  return e.maker === "WEG" && e.series === "MDW" && e.reference === "MDW-C16-2" && e.meets;
});

test("Icn alta sobe a série (WEG MDW 6kA → MDWH 10kA)", () => {
  const low = C.breakerRef("weg", { In: 25, curve: "C", poles: 1, icnRequiredA: 4500 });
  const high = C.breakerRef("weg", { In: 25, curve: "C", poles: 1, icnRequiredA: 10000 });
  return low.series === "MDW" && high.series === "MDWH" && high.icnKA === 10 && high.meets;
});

test("Todas as marcas geram referência não vazia para o mesmo disjuntor", () =>
  C.manufacturers().every(m => {
    const e = C.breakerRef(m.id, { In: 20, curve: "C", poles: 1, icnRequiredA: 3000 });
    return e && e.reference && e.reference.length >= 3 && e.icnKA >= 3;
  }));

test("Fabricante desconhecido ou dispositivo inválido → null", () =>
  C.breakerRef("acme", { In: 16, curve: "C", poles: 1 }) === null &&
  C.breakerRef("weg", null) === null &&
  C.rcdRef("weg", {}) === null &&
  C.spdRef("weg", {}) === null);

/* ---------------- DR e DPS ---------------- */
test("DR WEG 40A/30mA 2P → RDW-30-40-2", () => {
  const e = C.rcdRef("weg", { In: 40, sensitivityMa: 30, poles: 2 });
  return e.reference === "RDW-30-40-2" && e.kind === "rcd";
});

test("DPS por classe/Imax em todas as marcas", () =>
  C.manufacturers().every(m => {
    const e = C.spdRef(m.id, { class: "II", imaxKA: 40, poles: 4 });
    return e && e.reference && e.kind === "spd";
  }));

/* ---------------- forModel ---------------- */
test("forModel cobre geral, parciais, DRs e DPS do modelo", () => {
  const cat = C.forModel("schneider", model);
  const wantBreakers = ["main-breaker"].concat(model.circuits.map(c => c.breakerId));
  const wantRcds = ["main-rcd"].concat(model.circuits.filter(c => c.rcdId).map(c => c.rcdId));
  return wantBreakers.every(id => cat.byNode[id] && cat.byNode[id].kind === "breaker") &&
    wantRcds.every(id => cat.byNode[id] && cat.byNode[id].kind === "rcd") &&
    cat.byNode.spd && cat.byNode.spd.kind === "spd" &&
    cat.maker === "Schneider Electric";
});

test("DR trifásico recebe 4 polos, monofásico 2 polos", () => {
  const cat = C.forModel("weg", model);
  const mainRcd = cat.byNode["main-rcd"]; // sistema trifásico → 4P
  const c1 = model.circuits.find(c => c.rcdId && c.phases.length === 1);
  return mainRcd.reference.endsWith("-4") &&
    (!c1 || cat.byNode[c1.rcdId].reference.endsWith("-2"));
});

test("Disclaimer presente em toda saída de forModel", () => {
  const cat = C.forModel("abb", model);
  return cat.disclaimer === C.DISCLAIMER && C.DISCLAIMER.includes("ilustrativas");
});

test("Determinismo: mesmo modelo + fabricante → mesmo catálogo", () =>
  JSON.stringify(C.forModel("siemens", model)) === JSON.stringify(C.forModel("siemens", model)));

test("forModel de modelo vazio não lança e cobre só a espinha", () => {
  const empty = M.build([], SITE_TRI);
  const cat = C.forModel("weg", empty);
  return cat && typeof cat.byNode === "object";
});

/* ---------------- Resultado ---------------- */
console.log(`\n${passed} aprovados, ${failed} reprovados (${passed + failed} casos)`);
process.exitCode = failed ? 1 : 0;
