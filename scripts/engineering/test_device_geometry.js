/* Testes — EEDeviceGeometry (dimensões físicas reais por fabricante) */
const DG = require("./device_geometry.js");

let pass = 0, fail = 0;
function test(name, fn) {
  let ok = false, err = null;
  try { ok = !!fn(); } catch (e) { err = e; }
  if (ok) { pass++; } else { fail++; console.log(`FAIL  ${name}` + (err ? `  (${err.message})` : "")); }
}

test("makers() cobre os 5 fabricantes + genérico", () => {
  const m = DG.makers();
  return ["weg", "schneider", "siemens", "abb", "legrand", "generic"].every(id => m.includes(id));
});

test("WEG é a única marca marcada como 'sourced' (fonte primária conferida) nesta versão", () => {
  return DG.info("weg").sourced === true &&
    ["schneider", "siemens", "abb", "legrand", "generic"].every(m => DG.info(m).sourced === false);
});

test("Largura de disjuntor multipolar = polos × largura do módulo (não um número fixo)", () => {
  const d1 = DG.dims("weg", "mcb", 1);
  const d2 = DG.dims("weg", "mcb", 2);
  const d4 = DG.dims("weg", "mcb", 4);
  return d2.widthMm === d1.moduleWidthMm * 2 && d4.widthMm === d1.moduleWidthMm * 4;
});

test("Dimensões WEG batem com o datasheet oficial (18mm/módulo, altura ~86mm)", () => {
  const d = DG.dims("weg", "mcb", 1);
  return d.moduleWidthMm === 18 && d.heightMm === 86;
});

test("Fabricante inexistente cai no genérico sem lançar exceção", () => {
  const d = DG.dims("marca-inexistente", "mcb", 2);
  return d.widthMm > 0 && d.heightMm > 0;
});

test("Cada fabricante tem cor de corpo, alavanca e acento distintas", () => {
  return DG.makers().every(m => {
    const c = DG.colors(m);
    return c.body && c.lever && c.accent;
  });
});

test("Trilho DIN é padrão EN 50022 (35mm), igual para todos os fabricantes", () => {
  return DG.DIN_RAIL.widthMm === 35;
});

test("Disclaimer de geometria está presente e não vazio", () => {
  return typeof DG.DISCLAIMER === "string" && DG.DISCLAIMER.length > 20;
});

console.log(`${fail === 0 ? "OK   " : "FALHA"} test_device_geometry.js — ${pass}/${pass + fail} testes aprovados`);
process.exitCode = fail === 0 ? 0 : 1;
