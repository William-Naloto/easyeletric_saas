/* ================================================================
 * Testes da Exportação DXF do Smart Distribution Board — Node.js:
 *
 *     node scripts/engineering/test_dxf_export.js
 * ================================================================ */
"use strict";
const M = require("./project_model.js");
const D = require("./dxf_export.js");

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
  { name: "Iluminação Geral", power: 900, distance: 12, pf: 0.95, type: "iluminacao", method: "B1", wiringType: "A+N" },
  { name: "TUG Cozinha", power: 1400, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: "B+N" },
  { name: "Chuveiro", power: 5500, distance: 16, pf: 1.0, type: "aquecimento", method: "B1", wiringType: "A+B" },
  { name: "Motobomba", power: 1500, distance: 25, pf: 0.85, type: "motor", method: "B1", wiringType: "A+B+C" }
];
const model = M.build(LOADS, SITE_TRI);
const dxf = D.render(model, { projectName: "Residência Teste" });
const lines = dxf.split("\n");

/** Conta entidades de um tipo na seção ENTITIES. */
function countEntities(s, type) {
  return (s.match(new RegExp("^0\\n" + type + "$", "gm")) || []).length ||
    s.split("\n").filter((l, i, a) => l === type && a[i - 1] === "0").length;
}

/* ---------------- Estrutura DXF R12 ---------------- */
test("Arquivo começa em SECTION e termina em EOF", () =>
  lines[0] === "0" && lines[1] === "SECTION" &&
  lines[lines.length - 3] === "0" && lines[lines.length - 2] === "EOF");

test("SECTION/ENDSEC balanceados (HEADER, TABLES, ENTITIES)", () => {
  const sec = lines.filter((l, i) => l === "SECTION" && lines[i - 1] === "0").length;
  const end = lines.filter((l, i) => l === "ENDSEC" && lines[i - 1] === "0").length;
  return sec === 3 && end === 3 &&
    dxf.includes("HEADER") && dxf.includes("TABLES") && dxf.includes("ENTITIES");
});

test("Versão AC1009 (R12) e unidades em milímetros", () =>
  dxf.includes("$ACADVER") && dxf.includes("AC1009") && dxf.includes("$INSUNITS"));

test("Todas as camadas de projeto declaradas na tabela LAYER", () =>
  D.LAYERS.every(ly => dxf.includes(ly.name)) &&
  dxf.includes("CONTINUOUS") && D.LAYERS.length === 9);

test("Cores ACI seguem os condutores NBR 5410 (A preto=7, B vermelho=1, C marrom=34, N azul=5, PE verde=3)", () =>
  D.ACI.A === 7 && D.ACI.B === 1 && D.ACI.C === 34 &&
  D.ACI.N === 5 && D.ACI.PE === 3 &&
  new Set([D.ACI.A, D.ACI.B, D.ACI.C]).size === 3);

/* ---------------- Conteúdo do desenho ---------------- */
test("Entidades LINE e TEXT presentes em volume compatível com o quadro", () => {
  const nLines = countEntities(dxf, "LINE");
  const nTexts = countEntities(dxf, "TEXT");
  // ≥4 gabinete + ≥4 placa + barramentos + módulos (4×4) + cabos
  return nLines >= 40 && nTexts >= model.circuits.length * 3;
});

test("Título, circuitos e cargas no desenho", () =>
  dxf.includes("SMART DISTRIBUTION BOARD") && dxf.includes("Residência Teste") &&
  model.circuits.every(c => dxf.includes(`C${String(c.n).padStart(2, "0")}`)) &&
  dxf.includes("Chuveiro") && dxf.includes("Motobomba"));

test("Dados do motor no desenho: geral, DPS em paralelo, DR e barras N/PE", () => {
  const main = model.byId["main-breaker"];
  return dxf.includes(`GERAL ${main.data.In}A`) &&
    dxf.includes("DPS EM PARALELO (DERIVACAO) - NBR 5410 6.3.5.2") &&
    dxf.includes("DR GERAL") && dxf.includes("mA") &&
    dxf.includes("BARRA DE NEUTRO (N) - AZUL-CLARO") &&
    dxf.includes("BARRA DE PROTECAO (PE) - VERDE");
});

test("Rodapé normativo com aviso de ART/RRT", () =>
  dxf.includes("NBR 5410:2023") && dxf.includes("ART/RRT"));

test("Coordenadas numéricas válidas (grupos 10/20 sempre numéricos)", () => {
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] === "10" || lines[i] === "20") {
      if (isNaN(parseFloat(lines[i + 1]))) return false;
    }
  }
  return true;
});

test("Eixo Y invertido: título acima do gabinete tem Y maior no DXF", () => {
  // No SVG o título está ACIMA (y menor); no DXF deve ter Y MAIOR
  const idx = lines.findIndex(l => l.startsWith("QDF - SMART DISTRIBUTION BOARD"));
  if (idx < 0) return false;
  // localiza o grupo 20 imediatamente antes do texto
  let y = null;
  for (let i = idx; i > idx - 12 && i >= 0; i--) {
    if (lines[i] === "20") { y = parseFloat(lines[i + 1]); break; }
  }
  return y !== null && y > 0;
});

test("Determinismo: mesmo modelo + opções → mesmo DXF", () =>
  D.render(model, { projectName: "X" }) === D.render(model, { projectName: "X" }));

test("Modelo vazio gera DXF válido sem exceção", () => {
  const s = D.render(M.build([], SITE_TRI));
  return s.includes("AC1009") && s.trimEnd().endsWith("EOF");
});

/* ---------------- Resultado ---------------- */
console.log(`\n${passed} aprovados, ${failed} reprovados (${passed + failed} casos)`);
process.exitCode = failed ? 1 : 0;
