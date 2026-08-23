/* Testes — EEQdf3D (lista de peças 3D paramétrica do QDF) */
const PM = require("./project_model.js");
const Q3 = require("./qdf_3d_builder.js");
const DG = require("./device_geometry.js");

let pass = 0, fail = 0;
function test(name, fn) {
  let ok = false, err = null;
  try { ok = !!fn(); } catch (e) { err = e; }
  if (ok) { pass++; } else { fail++; console.log(`FAIL  ${name}` + (err ? `  (${err.message})` : "")); }
}

const SITE = { Vfn: 127, Vll: 220, Ta: 30, insulation: "PVC", groupedCircuits: 1, maxDropPct: 4, supplyType: "bifasico" };
const LOADS = [
  { name: "Ar Condicionado: sala", power: 1800, pf: 0.92, type: "climatizacao", wiringType: "A+B", distance: 15, method: "B1" },
  { name: "secador TUE: banheiro", power: 1000, pf: 0.92, type: "tomadas", wiringType: "B+N", distance: 12, method: "B1" },
  { name: "Chuveiro Eletrico", power: 7500, pf: 1, type: "aquecimento", wiringType: "A+B", distance: 12, method: "B1" },
  { name: "Micro-ondas: cozinha", power: 1200, pf: 0.92, type: "tomadas", wiringType: "A+B", distance: 12, method: "B1" },
  { name: "Iluminação: quarto", power: 810, pf: 0.92, type: "iluminacao", wiringType: "B+N", distance: 12, method: "B1" }
];
const model = PM.build(LOADS, SITE);

test("build() gera peças para os 5 fabricantes suportados, todas válidas", () =>
  DG.makers().filter(m => m !== "generic").every(maker => {
    const s = Q3.build(model, { makerId: maker });
    return Q3.validate(s).ok && s.parts.length > 0;
  }));

test("Todo circuito terminal tem uma peça 'disjuntor' na cena", () => {
  const s = Q3.build(model, { makerId: "weg" });
  return model.circuits.every(c => s.parts.some(p => p.id === c.breakerId && p.kind === "disjuntor"));
});

test("Circuito com IDR (tomadas/TUE) gera peça 'idr' própria; circuito sem IDR não gera", () => {
  const s = Q3.build(model, { makerId: "weg" });
  const cMicro = model.circuits.find(c => c.name.startsWith("Micro-ondas"));
  const cIlum = model.circuits.find(c => c.name.startsWith("Iluminação"));
  const hasIdrMicro = s.parts.some(p => p.kind === "idr" && p.circuit === cMicro.n);
  const hasIdrIlum = s.parts.some(p => p.kind === "idr" && p.circuit === cIlum.n);
  return hasIdrMicro && !hasIdrIlum;
});

test("Disjuntor geral (main-breaker) e DR geral (main-rcd) presentes na cena", () => {
  const s = Q3.build(model, { makerId: "weg" });
  return s.parts.some(p => p.id === "main-breaker") && s.parts.some(p => p.id === "main-rcd");
});

test("Barramento por fase em uso (A e B, sistema bifásico) presente", () => {
  const s = Q3.build(model, { makerId: "weg" });
  return s.parts.some(p => p.id === "bus-A") && s.parts.some(p => p.id === "bus-B") && !s.parts.some(p => p.id === "bus-C");
});

test("Nenhuma peça se sobrepõe fora do gabinete calculado (validate() sempre ok)", () => {
  const s = Q3.build(model, { makerId: "schneider" });
  return Q3.validate(s).ok;
});

test("Dimensões de peça vêm de EEDeviceGeometry, não de números soltos no builder", () => {
  const s = Q3.build(model, { makerId: "weg" });
  const brk = s.parts.find(p => p.kind === "disjuntor" && p.circuit === model.circuits[0].n);
  const expected = DG.dims("weg", "mcb", model.circuits[0].phases.length);
  return brk.w === expected.widthMm && brk.h === expected.heightMm;
});

test("Cores do dispositivo batem com a marca (corpo/alavanca/acento de EEDeviceGeometry)", () => {
  const s = Q3.build(model, { makerId: "abb" });
  const colors = DG.colors("abb");
  const brk = s.parts.find(p => p.kind === "disjuntor");
  return brk.color === colors.body && brk.leverColor === colors.lever;
});

test("Fabricante desconhecido cai no genérico sem quebrar", () => {
  const s = Q3.build(model, { makerId: "fabricante-inexistente" });
  return Q3.validate(s).ok && s.parts.length > 0;
});

test("Cada dispositivo carrega a referência de catálogo (part number) do fabricante", () => {
  const s = Q3.build(model, { makerId: "weg" });
  const brk = s.parts.find(p => p.kind === "disjuntor");
  return typeof brk.catalogRef === "string" && brk.catalogRef.length > 0;
});

test("Painel vazio (sem circuitos) não quebra — só a espinha (geral/DR/DPS/barramentos)", () => {
  const emptyModel = PM.build([], SITE);
  const s = Q3.build(emptyModel, { makerId: "weg" });
  return Q3.validate(s).ok;
});

test("Disclaimers de geometria e catálogo sempre presentes na cena", () => {
  const s = Q3.build(model, { makerId: "weg" });
  return typeof s.geometryDisclaimer === "string" && s.geometryDisclaimer.length > 0 &&
    typeof s.catalogDisclaimer === "string" && s.catalogDisclaimer.length > 0;
});

console.log(`${fail === 0 ? "OK   " : "FALHA"} test_qdf_3d_builder.js — ${pass}/${pass + fail} testes aprovados`);
process.exitCode = fail === 0 ? 0 : 1;
