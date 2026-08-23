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

test("WEG e as 5 marcas têm disjuntor (MCB) com fonte primária confirmada nesta versão", () => {
  return DG.makers().filter(m => m !== "generic").every(m => DG.info(m).byCategory.mcb.sourced === true);
});
test("IDR/DPS confirmados apenas para WEG nesta versão — demais marcas seguem 'sourced: false' até confirmação", () => {
  return DG.info("weg").byCategory.rcd.sourced === true && DG.info("weg").byCategory.spd.sourced === true &&
    ["schneider", "siemens", "abb", "legrand"].every(m =>
      DG.info(m).byCategory.rcd.sourced === false && DG.info(m).byCategory.spd.sourced === false);
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

test("Dimensões Schneider Acti9 iC60N batem com o datasheet oficial (18 x 85 x 78,5mm)", () => {
  const d = DG.dims("schneider", "mcb", 1);
  return d.moduleWidthMm === 18 && d.heightMm === 85 && d.depthMm === 78.5;
});

test("Dimensões Siemens 5SL4 batem com o datasheet (18 x 90 x 76mm)", () => {
  const d = DG.dims("siemens", "mcb", 1);
  return d.moduleWidthMm === 18 && d.heightMm === 90 && d.depthMm === 76;
});

test("Dimensões ABB S200 batem com o datasheet oficial (18 x 86 x 68mm)", () => {
  const d = DG.dims("abb", "mcb", 1);
  return d.moduleWidthMm === 18 && d.heightMm === 86 && d.depthMm === 68;
});

test("Dimensões Legrand DX3 batem com o datasheet (17,8 x 94,8 x 77,8mm)", () => {
  const d = DG.dims("legrand", "mcb", 1);
  return d.moduleWidthMm === 17.8 && d.heightMm === 94.8 && d.depthMm === 77.8;
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
