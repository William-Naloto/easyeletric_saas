/* ================================================================
 * Testes do Smart Distribution Board (QDF Twin) — Node.js:
 *
 *     node scripts/engineering/test_qdf_twin.js
 * ================================================================ */
"use strict";
const M = require("./project_model.js");
const Q = require("./qdf_twin.js");

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

const LOADS = [
  { name: "Iluminação Geral", power: 900, distance: 12, pf: 0.95, type: "iluminacao", method: "B1", wiringType: "A+N" },
  { name: "TUG <A> & \"B\"", power: 1400, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: "B+N" },
  { name: "Chuveiro", power: 5500, distance: 16, pf: 1.0, type: "aquecimento", method: "B1", wiringType: "A+B" },
  { name: "Motobomba", power: 1500, distance: 25, pf: 0.85, type: "motor", method: "B1", wiringType: "A+B+C" }
];

const model = M.build(LOADS, SITE_TRI);
const svg = Q.render(model, { theme: "dark" });

/* ---------------- Estrutura do SVG ---------------- */
test("SVG bem-formado: raiz única e tags balanceadas", () => {
  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) return false;
  const open = (svg.match(/<g[\s>]/g) || []).length;
  const close = (svg.match(/<\/g>/g) || []).length;
  return open === close;
});

test("viewBox coerente com width/height", () => {
  const vb = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const w = svg.match(/width="(\d+)"/), h = svg.match(/height="(\d+)"/);
  return vb && w && h && vb[1] === w[1] && vb[2] === h[1];
});

test("Todo nó interativo do modelo aparece como data-node", () => {
  const want = ["feeder", "panel", "main-breaker", "spd", "main-rcd",
    "bus-A", "bus-B", "bus-C", "bus-N", "bus-PE"];
  model.circuits.forEach(c => {
    want.push(c.breakerId, c.conductorId, c.loadId);
    if (c.rcdId) want.push(c.rcdId);
  });
  return want.every(id => svg.includes(`data-node="${id}"`));
});

test("Nomes de carga com <, & e aspas são escapados (XML seguro)", () =>
  !svg.includes("<A>") && svg.includes("&lt;A&gt;") &&
  svg.includes("&amp;") && svg.includes("&quot;B&quot;"));

test("Elementos realistas do painel: cobre, aço, trilho DIN e terra", () =>
  ["qtw-copper", "qtw-steel", "qtw-rail", "qtw-sym-ground"]
    .every(id => svg.includes(`id="${id}"`)) &&
  svg.includes('url(#qtw-copper)') && svg.includes('url(#qtw-rail)'));

test("Cores dos condutores conforme NBR 5410 §6.1.5.3", () =>
  Q.WIRES.A === "#1a1f26" &&             // fase A — preto
  Q.WIRE_NAMES.A === "preto" && Q.WIRE_NAMES.B === "vermelho" &&
  Q.WIRE_NAMES.C === "marrom" && Q.WIRE_NAMES.N === "azul-claro" &&
  Q.WIRE_NAMES.PE === "verde" &&
  svg.includes("preto") && svg.includes("azul-claro") && svg.includes("verde"));

test("DPS instalado em PARALELO (derivação) com aviso normativo", () =>
  svg.includes("INSTALAÇÃO EM PARALELO (derivação) — NBR 5410 §6.3.5.2"));

test("Esquema TT (padrão): conexão N+1 com centelhador N-PE", () =>
  svg.includes("Esquema TT: conexão 3+1 — N–PE por centelhador"));

test("Esquema TN-S: DPS em modo comum", () => {
  const s = Q.render(model, { scheme: "TN-S" });
  return s.includes("Esquema TN-S: modo comum — fases e N ao PE") &&
    !s.includes("centelhador");
});

test("Esquema inválido cai em TT sem exceção", () =>
  Q.render(model, { scheme: "XX" }).includes("Esquema TT"));

test("Barras de Neutro e PE presentes com rótulos", () =>
  svg.includes("BARRA DE NEUTRO (N)") && svg.includes("BARRA DE PROTEÇÃO (PE)"));

/* ---------------- Colunas / fileiras ---------------- */
test("splitColumns: ímpares à esquerda, pares à direita (todos presentes)", () => {
  const cols = Q.splitColumns(model);
  return cols.left.length + cols.right.length === model.circuits.length &&
    cols.left[0].n === 1 && (model.circuits.length < 2 || cols.right[0].n === 2) &&
    cols.rows === Math.max(cols.left.length, cols.right.length);
});

test("Circuito multipolar: um stub por fase saindo do pente central", () => {
  const tri = model.circuits.find(c => c.phases.length === 3);
  if (!tri) return false;
  const g = svg.match(new RegExp(`<g class="qtw-node" data-node="${tri.breakerId}"[\\s\\S]*?</g>`));
  return g && Q.THEMES.dark.phases.A && ["A", "B", "C"].every(p => g[0].includes(Q.WIRES[p]));
});

test("Altura cresce com fileiras adicionais (multi-trilho)", () => {
  const many = Array.from({ length: 24 }, (_, i) =>
    ({ name: "C" + i, power: 1000, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: ["A+N", "B+N", "C+N"][i % 3] }));
  const s = Q.render(M.build(many, SITE_TRI));
  const h1 = parseInt(svg.match(/height="(\d+)"/)[1], 10);
  const h2 = parseInt(s.match(/height="(\d+)"/)[1], 10);
  return h2 > h1;
});

/* ---------------- Barramentos e fases ---------------- */
test("Barramentos das 3 fases com cores distintas do tema", () => {
  const P = Q.THEMES.dark.phases;
  return [P.A, P.B, P.C].every(c => svg.includes(c)) &&
    new Set([P.A, P.B, P.C]).size === 3;
});

test("Monofásico: sem barramento B/C no desenho", () => {
  const s = Q.render(M.build([LOADS[0]], SITE_MONO));
  return s.includes('data-node="bus-A"') && !s.includes('data-node="bus-B"') &&
    s.includes('data-node="bus-N"') && s.includes('data-node="bus-PE"');
});

test("Utilização e reserva dos barramentos exibidas (I fase / In geral)", () => {
  const main = model.byId["main-breaker"];
  const busA = model.byId["bus-A"];
  const util = Math.round((busA.calc.currentA || 0) / main.data.In * 100);
  return svg.includes(`${util}% util.`) && svg.includes("% reserva");
});

/* ---------------- Overlays de engenharia ---------------- */
test("Overlay de corrente ligado por padrão (classe qtw-ov-current)", () =>
  svg.includes("qtw-ov-current") && svg.includes("Ib "));

test("Overlay de corrente pode ser desligado", () =>
  !Q.render(model, { overlays: { current: false } }).includes("qtw-ov-current"));

test("Overlay de queda de tensão traz ΔV por circuito", () =>
  (svg.match(/ΔV /g) || []).length >= model.circuits.length);

test("Overlay de Icc desligado por padrão e ativável", () =>
  !svg.includes("qtw-ov-icc") &&
  Q.render(model, { overlays: { icc: true } }).includes("qtw-ov-icc"));

test("Overlay de validação pinta status (PASS→verde do tema)", () =>
  svg.includes("qtw-ov-validation") && svg.includes(Q.THEMES.dark.ok));

/* ---------------- Temas ---------------- */
test("Tema dark e light têm fundos diferentes", () => {
  const sd = Q.render(model, { theme: "dark" });
  const sl = Q.render(model, { theme: "light" });
  return sd.includes(Q.THEMES.dark.bg) && sl.includes('fill="#ffffff"') && sd !== sl;
});

test("Tema print traz carimbo técnico e aviso de ART/RRT", () => {
  const sp = Q.render(model, { theme: "print", projectName: "Residência Silva", date: "07/07/2026" });
  return sp.includes("QUADRO DE DISTRIBUIÇÃO — LAYOUT DO PAINEL") &&
    sp.includes("Residência Silva") && sp.includes("07/07/2026") && sp.includes("ART/RRT");
});

test("Tema desconhecido cai no dark (sem exceção)", () =>
  Q.render(model, { theme: "nope" }).includes(Q.THEMES.dark.bg));

/* ---------------- Sincronização com o modelo ---------------- */
test("Disjuntor geral, DPS e DR geral exibem dados do motor", () => {
  const main = model.byId["main-breaker"], spd = model.byId.spd, rcd = model.byId["main-rcd"];
  return svg.includes(`${main.data.In} A · ${main.data.curve} · ${main.data.poles}P`) &&
    svg.includes(`Imax ${spd.data.imaxKA} kA`) &&
    svg.includes(`${rcd.data.In} A / ${rcd.data.sensitivityMa} mA`);
});

test("Cada circuito mostra In do disjuntor e seção do condutor", () =>
  model.circuits.every(c =>
    svg.includes(`${model.byId[c.breakerId].data.In} A`) &&
    svg.includes(`${model.byId[c.conductorId].data.section} mm²`)));

test("Nomenclatura: DR = geral (QG/DR rotulados) · IDR = por circuito", () => {
  const withRcd = model.circuits.filter(c => c.rcdId);
  return withRcd.length > 0 &&
    withRcd.every(c => svg.includes(`data-node="${c.rcdId}"`)) &&
    svg.includes("IDR 30 mA") && svg.includes(">DG<") && svg.includes(">DR<") &&
    svg.includes(">Circuitos<");
});

test("Catálogo de fabricante: referências impressas nos módulos", () => {
  const catalog = { byNode: { "main-breaker": { maker: "WEG", reference: "MDWH-C63-3" } } };
  catalog.byNode[model.circuits[0].breakerId] = { maker: "WEG", reference: "MDW-C10-1" };
  const s = Q.render(model, { catalog });
  return s.includes("MDWH-C63-3") && s.includes("MDW-C10-1") && s.includes("qtw-cat") &&
    !svg.includes("qtw-cat"); // sem catálogo, nenhuma referência
});

test("Neutro só em circuitos com N; PE em todos (Tab. 58)", () => {
  const ff = model.circuits.find(c => !String(model.byId[c.loadId].data.wiring).includes("N"));
  const fn = model.circuits.find(c => String(model.byId[c.loadId].data.wiring).includes("N"));
  if (!ff || !fn) return false;
  const gOf = id => (svg.match(new RegExp(`<g class="qtw-node" data-node="${id}"[\\s\\S]*?</g>`)) || [])[0] || "";
  const gFF = gOf(ff.loadId), gFN = gOf(fn.loadId);
  return !gFF.includes("qtw-wire-n") && gFN.includes("qtw-wire-n") &&
    gFF.includes("qtw-wire-pe") && gFN.includes("qtw-wire-pe");
});

test("Determinismo: mesmo modelo + opções → mesmo SVG", () =>
  Q.render(model, { theme: "light" }) === Q.render(model, { theme: "light" }));

test("Projeto vazio renderiza com mensagem de orientação", () => {
  const s = Q.render(M.build([], SITE_TRI));
  return s.includes("Nenhum circuito calculado") && s.startsWith("<svg");
});

/* ---------------- Resultado ---------------- */
console.log(`\n${passed} aprovados, ${failed} reprovados (${passed + failed} casos)`);
process.exitCode = failed ? 1 : 0;
