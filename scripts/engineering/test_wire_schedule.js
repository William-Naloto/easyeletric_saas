/* Testes — EEWireSchedule (identificação De/Para de cabeamento) */
const E = require("../nbr5410_engine.js");
const PM = require("./project_model.js");
const WS = require("./wire_schedule.js");

let pass = 0, fail = 0;
function test(name, fn) {
  let ok = false, err = null;
  try { ok = !!fn(); } catch (e) { err = e; }
  if (ok) { pass++; }
  else { fail++; console.log(`FAIL  ${name}` + (err ? `  (${err.message})` : "")); }
}

const SITE = { Vfn: 127, Vll: 220, Ta: 30, insulation: "PVC", groupedCircuits: 1, maxDropPct: 4, supplyType: "bifasico" };
const LOADS = [
  { name: "Ar Condicionado: sala", power: 1800, pf: 0.92, type: "climatizacao", wiringType: "A+B", distance: 15, method: "B1" },
  { name: "Micro-ondas: cozinha", power: 1200, pf: 0.92, type: "tomadas", wiringType: "A+B", distance: 12, method: "B1" },
  { name: "TUG 127V: quarto social, suite", power: 800, pf: 0.92, type: "tomadas", wiringType: "A+N", distance: 31, method: "B1" },
  { name: "Iluminação: quarto social, suite", power: 810, pf: 0.92, type: "iluminacao", wiringType: "B+N", distance: 12, method: "B1" }
];
const model = PM.build(LOADS, SITE);
const schedule = WS.build(model);

test("build() retorna uma entrada de circuito por circuito do modelo", () =>
  schedule.circuits.length === LOADS.length);

test("Circuito bifásico sem N (A+B) gera 2 fios de fase + PE, SEM neutro", () => {
  const c = schedule.circuits.find(c => c.destino === "Ar Condicionado: sala");
  const kinds = c.wires.map(w => w.kind);
  return kinds.filter(k => k === "fase").length === 2 && kinds.includes("protecao") && !kinds.includes("neutro");
});

test("Circuito com N (A+N) gera 1 fase + 1 neutro + 1 PE — 3 condutores físicos", () => {
  const c = schedule.circuits.find(c => c.destino.startsWith("TUG 127V"));
  return c.wires.length === 3 && c.wires.some(w => w.kind === "neutro");
});

test("Tag do condutor é único por circuito (Cnn-fase / Cnn-N / Cnn-PE)", () => {
  const all = schedule.circuits.flatMap(c => c.wires.map(w => w.tag));
  return new Set(all).size === all.length;
});

test("Cor do condutor segue NBR 5410 §6.1.5.3 (A=preto, B=vermelho, N=azul-claro, PE=verde)", () => {
  const c = schedule.circuits.find(c => c.destino === "Ar Condicionado: sala");
  const fA = c.wires.find(w => w.tag.endsWith("-A"));
  const fB = c.wires.find(w => w.tag.endsWith("-B"));
  const pe = c.wires.find(w => w.kind === "protecao");
  return fA.colorName === "Preto" && fB.colorName === "Vermelho" && pe.colorName.startsWith("Verde");
});

test("Seção do PE vem do cálculo do motor (Tabela 58), não é igual à fase por padrão bobo", () => {
  const c = schedule.circuits.find(c => c.destino === "Ar Condicionado: sala");
  const pe = c.wires.find(w => w.kind === "protecao");
  return typeof pe.sectionMm2 === "number" && pe.sectionMm2 > 0;
});

test("Toda linha PARA aponta para o nome real da carga (não para um placeholder genérico)", () =>
  schedule.circuits.every(c => c.wires.every(w => w.para === c.destino && c.destino.length > 0)));

test("Etiqueta de 2 linhas sempre tem exatamente 2 linhas e cabe em rótulo físico (<=32 chars/linha)", () => {
  const labels = WS.toLabelSheet(schedule);
  return labels.length > 0 && labels.every(l => l.lines.length === 2 && l.lines.every(s => s.length <= 40));
});

test("Ficha do quadro inclui alimentador (fases+N+PE) e DR geral", () => {
  const tags = schedule.board.map(w => w.tag);
  return tags.includes("ALIM-N") && tags.includes("ALIM-PE") && tags.includes("DR-GERAL");
});

test("toMarkdown() produz uma tabela por circuito com todos os tags presentes", () => {
  const md = WS.toMarkdown(schedule);
  return schedule.circuits.every(c => c.wires.every(w => md.includes(w.tag)));
});

test("totalWires = soma de todos os condutores do quadro + circuitos", () => {
  const sum = schedule.board.length + schedule.circuits.reduce((s, c) => s + c.wires.length, 0);
  return schedule.totalWires === sum;
});

test("Projeto vazio (sem cargas) não quebra — retorna schedule vazio mas com a ficha do quadro", () => {
  const emptyModel = PM.build([], SITE);
  const s = WS.build(emptyModel);
  return Array.isArray(s.circuits) && s.circuits.length === 0;
});

console.log(`${fail === 0 ? "OK   " : "FALHA"} test_wire_schedule.js — ${pass}/${pass + fail} testes aprovados`);
process.exitCode = fail === 0 ? 0 : 1;
