/* ================================================================
 * Testes do ElectricalProjectModel (Gêmeo Digital) — Node.js:
 *
 *     node scripts/engineering/test_project_model.js
 * ================================================================ */
"use strict";
const M = require("./project_model.js");
const E = require("../nbr5410_engine.js");

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

const RESIDENTIAL = [
  { name: "Iluminação Social", power: 800, distance: 12, pf: 0.95, type: "iluminacao", method: "B1", wiringType: "A+N" },
  { name: "TUG Sala & Quartos", power: 1400, distance: 14, pf: 0.92, type: "tomadas", method: "B1", wiringType: "B+N" },
  { name: "TUG Cozinha 20A", power: 1200, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: "C+N" },
  { name: "Chuveiro Suíte", power: 5500, distance: 16, pf: 1.0, type: "aquecimento", method: "B1", wiringType: "A+B" },
  { name: "Ar-Condicionado Quarto", power: 1800, distance: 18, pf: 0.92, type: "climatizacao", method: "B1", wiringType: "C+N" },
  { name: "Motobomba Piscina", power: 1500, distance: 25, pf: 0.85, type: "motor", method: "B1", wiringType: "A+B+C" }
];

const HIGH_DEMAND = [
  { name: "Chuveiro 1", power: 7500, distance: 20, pf: 1, type: "aquecimento", method: "B1", wiringType: "A+B" },
  { name: "Chuveiro 2", power: 7500, distance: 22, pf: 1, type: "aquecimento", method: "B1", wiringType: "B+C" },
  { name: "Chuveiro 3", power: 7500, distance: 24, pf: 1, type: "aquecimento", method: "B1", wiringType: "A+C" },
  { name: "Forno Trifásico", power: 9000, distance: 12, pf: 1, type: "aquecimento", method: "B1", wiringType: "A+B+C" },
  { name: "Ar Central", power: 6000, distance: 15, pf: 0.9, type: "climatizacao", method: "B1", wiringType: "A+B+C" }
];

const model = M.build(RESIDENTIAL, SITE_TRI);
const modelMono = M.build([RESIDENTIAL[0], RESIDENTIAL[2]].map(l => ({ ...l, wiringType: "A+N" })), SITE_MONO);
const modelHigh = M.build(HIGH_DEMAND, SITE_TRI);

/* ---------------- Integridade do grafo ---------------- */
test("IDs únicos em todos os nós", () => {
  const ids = model.nodes.map(n => n.id);
  return new Set(ids).size === ids.length;
});
test("Todo parent referenciado existe e lista o filho", () =>
  model.nodes.every(n => !n.parent ||
    (model.byId[n.parent] && model.byId[n.parent].children.includes(n.id))));
test("Todo child referenciado existe e aponta de volta", () =>
  model.nodes.every(n => n.children.every(c =>
    model.byId[c] && model.byId[c].parent === n.id)));
test("Raiz é a rede (utility) e não tem parent", () =>
  model.root === "utility" && model.byId.utility.parent === null);
test("Contrato do nó: id, type, label, data, calc, validation, decisions, viz", () =>
  model.nodes.every(n => n.id && n.type && n.label !== undefined &&
    n.data && n.calc && n.validation && Array.isArray(n.decisions) && n.viz));

/* ---------------- Infraestrutura da cadeia de proteção ---------------- */
test("Cadeia fixa: utility → meter → feeder → panel → main-breaker", () => {
  const a = model.ancestorsOf("main-breaker");
  return JSON.stringify(a) === JSON.stringify(["utility", "meter", "feeder", "panel", "main-breaker"]);
});
test("DPS e DR geral são filhos do disjuntor geral", () =>
  model.byId.spd.parent === "main-breaker" && model.byId["main-rcd"].parent === "main-breaker");
test("Trifásico: barramentos A, B, C, N e PE presentes", () =>
  ["bus-A", "bus-B", "bus-C", "bus-N", "bus-PE"].every(b => model.byId[b]));
test("Monofásico: só barramento A (sem B/C)", () =>
  modelMono.byId["bus-A"] && !modelMono.byId["bus-B"] && !modelMono.byId["bus-C"]);

/* ---------------- Circuitos ---------------- */
test("Um conjunto breaker+conductor+load por circuito", () =>
  model.circuits.length === RESIDENTIAL.length &&
  model.circuits.every(c => model.byId[c.breakerId] && model.byId[c.conductorId] && model.byId[c.loadId]));
test("DR de circuito só quando sensibilidade 30 mA (iluminação sem DR próprio)", () => {
  const ilum = model.circuits[0], tug = model.circuits[1];
  return ilum.rcdId === null && tug.rcdId !== null &&
    model.byId[tug.rcdId].data.sensitivityMa === 30;
});
test("Carga pendurada no condutor; condutor no DR (ou disjuntor)", () =>
  model.circuits.every(c => {
    const load = model.byId[c.loadId], cond = model.byId[c.conductorId];
    return load.parent === c.conductorId &&
      cond.parent === (c.rcdId || c.breakerId);
  }));
test("Disjuntor bifásico A+B conectado aos barramentos A e B", () => {
  const shower = model.circuits[3];
  return JSON.stringify(shower.busIds.slice().sort()) === JSON.stringify(["bus-A", "bus-B"]);
});
test("Circuito trifásico toca os 3 barramentos de fase", () => {
  const pump = model.circuits[5];
  return pump.busIds.length === 3;
});

/* ---------------- Sincronização com o motor (fonte única) ---------------- */
const qdfRef = E.sizeFeederAndMain(RESIDENTIAL, SITE_TRI);
test("Disjuntor geral do modelo = motor NBR 5410", () =>
  model.byId["main-breaker"].data.In === qdfRef.main.In);
test("Alimentador do modelo = motor (seção, Izc, queda)", () => {
  const f = model.byId.feeder;
  return f.data.section === qdfRef.feeder.section &&
    f.calc.Izc === qdfRef.feeder.Izc &&
    Math.abs(f.calc.dropPct - qdfRef.feeder.drop.dropPct) < 1e-9;
});
test("Corrente dos barramentos = correntes de fase do motor", () =>
  ["A", "B", "C"].every(ph =>
    Math.abs(model.byId["bus-" + ph].calc.currentA - qdfRef.Iphase[ph]) < 1e-9));
test("Resultados pré-calculados são aceitos sem recalcular (opts)", () => {
  const circuits = RESIDENTIAL.map(l => E.sizeCircuit(l, { ...SITE_TRI, upstreamZOhm: qdfRef.shortCircuit.zAtBoardOhm }));
  const m2 = M.build(RESIDENTIAL, SITE_TRI, { feeder: qdfRef, circuits });
  return m2.byId["conductor-c4"].data.section === model.byId["conductor-c4"].data.section &&
    m2.source.feeder === qdfRef;
});
test("Determinismo: dois builds idênticos geram os mesmos nós", () => {
  const m2 = M.build(RESIDENTIAL, SITE_TRI);
  return JSON.stringify(m2.nodes.map(n => [n.id, n.sub])) ===
    JSON.stringify(model.nodes.map(n => [n.id, n.sub]));
});

/* ---------------- Validação distribuída ---------------- */
test("Status da carga = status do circuito no motor", () =>
  model.circuits.every(c => model.byId[c.loadId].validation.status === c.result.status));
test("Checks do disjuntor: coordenação, interrupção e disparo magnético", () => {
  const b = model.byId[model.circuits[0].breakerId];
  const ids = b.validation.checks.map(x => x.id).sort();
  return JSON.stringify(ids) === JSON.stringify(["coordenacao", "disparo-magnetico", "interrupcao"]);
});
test("Checks do condutor incluem ampacidade e queda de tensão", () => {
  const ids = model.byId["conductor-c1"].validation.checks.map(x => x.id);
  return ids.includes("ampacidade") && ids.includes("queda-tensao");
});
test("Todo check tem razão/detalhe e referência de status válida", () =>
  model.nodes.every(n => n.validation.checks.every(c =>
    c.detail && ["PASS", "WARN", "ERROR"].includes(c.status))));

/* ---------------- Decision log distribuído ---------------- */
test("Disjuntor do circuito carrega a decisão 'disjuntor' com rejeitados", () => {
  const d = model.byId[model.circuits[0].breakerId].decisions.find(x => x.id === "disjuntor");
  return d && d.reference && Array.isArray(d.rejected);
});
test("Condutor carrega decisões de Ib, fatores, seção e PE", () => {
  const ids = model.byId["conductor-c1"].decisions.map(d => d.id);
  return ["ib", "fatores", "condutor", "pe"].every(x => ids.includes(x));
});
test("Disjuntor geral carrega decisão com rejeição de 'Σ In parciais'", () => {
  const d = model.byId["main-breaker"].decisions.find(x => x.id === "geral");
  return d && d.rejected.some(r => r.option.includes("Σ In"));
});

/* ---------------- Travessias (interatividade) ---------------- */
test("chainOf(carga) vai da rede até a carga passando pelo disjuntor", () => {
  const chain = model.chainOf(model.circuits[1].loadId);
  return chain.includes("utility") && chain.includes("main-breaker") &&
    chain.includes(model.circuits[1].breakerId) && chain.includes(model.circuits[1].loadId);
});
test("chainOf(carga bifásica) inclui os DOIS barramentos de fase", () => {
  const chain = model.chainOf(model.circuits[3].loadId);
  return chain.includes("bus-A") && chain.includes("bus-B");
});
test("relatedOf(disjuntor) desce até condutor e carga", () => {
  const rel = model.relatedOf(model.circuits[1].breakerId);
  return rel.includes(model.circuits[1].conductorId) && rel.includes(model.circuits[1].loadId);
});
test("relatedOf(barramento A) alcança os circuitos da fase A", () => {
  const rel = model.relatedOf("bus-A");
  return rel.includes("breaker-c1") && rel.includes("load-c1");
});
test("chainOf de id inexistente retorna vazio (sem exceção)", () =>
  model.chainOf("nope").length === 0 && model.relatedOf("nope").length === 0);

/* ---------------- Sumário e casos-limite ---------------- */
test("Sumário: demanda < instalada e status agregado válido", () =>
  model.summary.demandVA < model.summary.installedVA &&
  ["PASS", "WARN", "ERROR"].includes(model.summary.status));
test("Alta demanda: modelo constrói e alimentador ≥ 10 mm²", () =>
  modelHigh.byId.feeder.data.section >= 10 && modelHigh.circuits.length === 5);
test("Projeto vazio: infraestrutura existe, zero circuitos", () => {
  const m0 = M.build([], SITE_TRI);
  return m0.byId.panel && m0.circuits.length === 0 && m0.summary.installedVA === 0;
});
test("byType('load') retorna todas as cargas", () =>
  model.byType("load").length === RESIDENTIAL.length);

/* ---------------- Ícones por equipamento (inferência pelo nome) ---------------- */
test("Ícone inferido pelo nome: chuveiro, geladeira, micro-ondas, forno, lavadora, ar, motor", () =>
  M.inferLoadIcon("Chuveiro Elétrico — Banheiro", "aquecimento") === "shower" &&
  M.inferLoadIcon("Geladeira — Cozinha", "tomadas") === "fridge" &&
  M.inferLoadIcon("Micro-ondas", "aquecimento") === "microwave" &&
  M.inferLoadIcon("Forno/Fritadeira", "aquecimento") === "oven" &&
  M.inferLoadIcon("Máq. de Lavar", "tomadas") === "washer" &&
  M.inferLoadIcon("Ar Condicionado Split", "climatizacao") === "ac" &&
  M.inferLoadIcon("Portão Automático", "motor") === "motor");
test("Nome sem equipamento conhecido cai no tipo (iluminação→light, ?→generic)", () =>
  M.inferLoadIcon("Circuito 7", "iluminacao") === "light" &&
  M.inferLoadIcon("Circuito 8", "uso_geral") === "generic");
test("Nó de carga usa a inferência (Ar-Condicionado tipo climatização → ac)", () =>
  model.byId["load-c5"].viz.icon === "ac" &&
  model.byId["load-c4"].viz.icon === "shower");

/* ---------------- Resultado ---------------- */
console.log(`\n${passed} aprovados, ${failed} reprovados (${passed + failed} casos)`);
process.exitCode = failed ? 1 : 0;
