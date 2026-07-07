/* ================================================================
 * Testes do Renderizador Unifilar do Gêmeo Digital — Node.js:
 *
 *     node scripts/engineering/test_unifilar_twin.js
 * ================================================================ */
"use strict";
const M = require("./project_model.js");
const U = require("./unifilar_twin.js");

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
const svg = U.render(model, { theme: "dark" });

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
  const want = ["utility", "meter", "feeder", "panel", "main-breaker", "spd", "main-rcd",
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
test("Biblioteca de símbolos presente (disjuntor, DR, DPS, terra, medidor)", () =>
  ["tw-sym-breaker", "tw-sym-rcd", "tw-sym-spd", "tw-sym-ground", "tw-sym-meter"]
    .every(id => svg.includes(`id="${id}"`) && svg.includes(`href="#${id}"`)));
test("Ícones de carga corretos por tipo (luz, tomada, chuveiro, motor)", () =>
  ["tw-ico-light", "tw-ico-socket", "tw-ico-shower", "tw-ico-motor"]
    .every(id => svg.includes(`href="#${id}"`)));
test("Ícones por equipamento: geladeira, micro-ondas, forno e lavadora desenhados", () => {
  const appliances = [
    { name: "Geladeira", power: 350, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: "A+N" },
    { name: "Micro-ondas", power: 1200, distance: 10, pf: 0.92, type: "aquecimento", method: "B1", wiringType: "B+N" },
    { name: "Forno Elétrico", power: 1500, distance: 10, pf: 1, type: "aquecimento", method: "B1", wiringType: "C+N" },
    { name: "Máq. de Lavar", power: 1200, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: "A+N" }
  ];
  const s = U.render(M.build(appliances, SITE_TRI));
  return ["tw-ico-fridge", "tw-ico-microwave", "tw-ico-oven", "tw-ico-washer"]
    .every(id => s.includes(`id="${id}"`) && s.includes(`href="#${id}"`));
});
test("Bloco do QDF centralizado no topo (nó panel com moldura própria)", () => {
  const m = svg.match(/<g class="tw-node" data-node="panel"[^>]*>([\s\S]*?)<\/g>/);
  return m && m[1].includes("<rect") && m[1].includes("QDF");
});

/* ---------------- Barramentos e fases ---------------- */
test("Barramentos das 3 fases com cores distintas do tema", () => {
  const P = U.THEMES.dark.phases;
  return [P.A, P.B, P.C].every(c => svg.includes(c)) &&
    new Set([P.A, P.B, P.C]).size === 3;
});
test("Monofásico: sem barramentos B/C no desenho", () => {
  const m = M.build([LOADS[0]], SITE_MONO);
  const s = U.render(m);
  return s.includes('data-node="bus-A"') && !s.includes('data-node="bus-B"') &&
    s.includes('data-node="bus-N"') && s.includes('data-node="bus-PE"');
});
test("Largura cresce com o número de circuitos", () => {
  const many = Array.from({ length: 24 }, (_, i) =>
    ({ name: "C" + i, power: 1000, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: ["A+N", "B+N", "C+N"][i % 3] }));
  const s = U.render(M.build(many, SITE_TRI));
  const w1 = parseInt(svg.match(/width="(\d+)"/)[1], 10);
  const w2 = parseInt(s.match(/width="(\d+)"/)[1], 10);
  return w2 > w1;
});

/* ---------------- Overlays de engenharia ---------------- */
test("Overlay de corrente ligado por padrão (classe tw-ov-current)", () =>
  svg.includes("tw-ov-current") && svg.includes("Ib "));
test("Overlay de corrente pode ser desligado", () =>
  !U.render(model, { overlays: { current: false } }).includes("tw-ov-current"));
test("Overlay de queda de tensão traz ΔV por circuito", () =>
  (svg.match(/ΔV /g) || []).length >= model.circuits.length);
test("Overlay de Icc desligado por padrão e ativável", () =>
  !svg.includes("tw-ov-icc") &&
  U.render(model, { overlays: { icc: true } }).includes("tw-ov-icc"));
test("Overlay de validação pinta status (PASS→verde do tema)", () =>
  svg.includes("tw-ov-validation") && svg.includes(U.THEMES.dark.ok));

/* ---------------- Temas ---------------- */
test("Tema dark e light têm fundos diferentes", () => {
  const sd = U.render(model, { theme: "dark" });
  const sl = U.render(model, { theme: "light" });
  return sd.includes(U.THEMES.dark.bg) && sl.includes('fill="#ffffff"') && sd !== sl;
});
test("Tema print traz carimbo técnico e aviso de ART/RRT", () => {
  const sp = U.render(model, { theme: "print", projectName: "Residência Silva", date: "07/07/2026" });
  return sp.includes("DIAGRAMA ELÉTRICO UNIFILAR") && sp.includes("Residência Silva") &&
    sp.includes("07/07/2026") && sp.includes("ART/RRT");
});
test("Tema desconhecido cai no dark (sem exceção)", () =>
  U.render(model, { theme: "nope" }).includes(U.THEMES.dark.bg));

/* ---------------- Sincronização com o modelo ---------------- */
test("Valores do disjuntor geral e alimentador aparecem no desenho", () => {
  const main = model.byId["main-breaker"];
  const feeder = model.byId.feeder;
  return svg.includes(`${main.data.In} A`) && svg.includes(`${feeder.data.section} mm²`);
});
test("Cada circuito mostra In do disjuntor e seção do condutor", () =>
  model.circuits.every(c =>
    svg.includes(`${model.byId[c.breakerId].data.In} A`) &&
    svg.includes(`${model.byId[c.conductorId].data.section} mm²`)));
test("Determinismo: mesmo modelo + opções → mesmo SVG", () =>
  U.render(model, { theme: "light" }) === U.render(model, { theme: "light" }));
test("Projeto vazio renderiza com mensagem de orientação", () => {
  const s = U.render(M.build([], SITE_TRI));
  return s.includes("Nenhum circuito calculado") && s.startsWith("<svg");
});

/* ---------------- Resultado ---------------- */
console.log(`\n${passed} aprovados, ${failed} reprovados (${passed + failed} casos)`);
process.exitCode = failed ? 1 : 0;
