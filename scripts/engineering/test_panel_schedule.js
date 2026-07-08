/* ================================================================
 * Testes do Panel Schedule (Mapa do Quadro) — Node.js:
 *
 *     node scripts/engineering/test_panel_schedule.js
 * ================================================================ */
"use strict";
const M = require("./project_model.js");
const C = require("./manufacturer_catalog.js");
const S = require("./panel_schedule.js");

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
  { name: "Iluminação <Sala> & \"Copa\"", power: 900, distance: 12, pf: 0.95, type: "iluminacao", method: "B1", wiringType: "A+N" },
  { name: "TUG Cozinha", power: 1400, distance: 10, pf: 0.92, type: "tomadas", method: "B1", wiringType: "B+N" },
  { name: "Chuveiro", power: 5500, distance: 16, pf: 1.0, type: "aquecimento", method: "B1", wiringType: "A+B" }
];
const model = M.build(LOADS, SITE_TRI);
const data = S.build(model, { projectName: "Residência Teste", date: "07/07/2026" });
const html = S.toHtml(model, { projectName: "Residência Teste", date: "07/07/2026" });

/* ---------------- build (dados estruturados) ---------------- */
test("Uma linha por circuito, na ordem do modelo", () =>
  data.rows.length === model.circuits.length &&
  data.rows.every((r, i) => r.n === model.circuits[i].n));

test("Linha reflete o motor: disjuntor, cabo, Ib e ΔV do modelo", () =>
  data.rows.every((r, i) => {
    const c = model.circuits[i];
    const brk = model.byId[c.breakerId], cond = model.byId[c.conductorId];
    return r.breaker.In === brk.data.In && r.breaker.curve === brk.data.curve &&
      r.cable.section === cond.data.section && r.Ib === cond.calc.Ib &&
      r.dropPct === cond.calc.dropPct && r.status === c.status;
  }));

test("Entrada e proteção geral: alimentador, geral, DR e DPS do motor", () => {
  const main = model.byId["main-breaker"], feeder = model.byId.feeder;
  return data.devices.main.In === main.data.In &&
    data.feeder.section === feeder.data.section &&
    data.devices.rcd.In === model.byId["main-rcd"].data.In &&
    data.devices.spd.class === model.byId.spd.data.class;
});

test("Totais: demanda, Ib do alimentador e corrente por fase em uso", () =>
  data.totals.demandVA === model.summary.demandVA &&
  data.totals.IbFeeder === model.summary.IbFeeder &&
  data.totals.Iphase.map(x => x.phase).join("") === model.summary.phasesInUse.join(""));

test("Sem catálogo: referências nulas e sem disclaimer", () =>
  data.rows.every(r => r.breaker.reference === null) && data.disclaimer === null);

test("Com catálogo: referência comercial por circuito + disclaimer", () => {
  const cat = C.forModel("weg", model);
  const d = S.build(model, { catalog: cat });
  return d.rows.every(r => r.breaker.reference && r.breaker.reference.startsWith("MDW")) &&
    d.devices.main.reference && d.disclaimer === C.DISCLAIMER && d.meta.maker === "WEG";
});

/* ---------------- toHtml (documento imprimível) ---------------- */
test("HTML autocontido e imprimível (doctype, A4, carimbo, ART/RRT)", () =>
  html.startsWith("<!DOCTYPE html>") && html.includes("@page{size:A4") &&
  html.includes("MAPA DO QUADRO DE DISTRIBUIÇÃO") && html.includes("ART/RRT") &&
  html.includes("Residência Teste") && html.includes("07/07/2026"));

test("Nomes com <, & e aspas são escapados no HTML", () =>
  !html.includes("<Sala>") && html.includes("&lt;Sala&gt;") && html.includes("&amp;"));

test("Todos os circuitos aparecem na tabela com disjuntor e cabo", () =>
  model.circuits.every(c => {
    const brk = model.byId[c.breakerId];
    return html.includes(`${brk.data.In} A · ${brk.data.curve} · ${brk.data.poles}P`);
  }));

test("Coluna de referência só aparece com catálogo", () => {
  const withCat = S.toHtml(model, { catalog: C.forModel("weg", model) });
  return !html.includes("<th>Referência</th>") &&
    withCat.includes("<th>Referência</th>") && withCat.includes("MDW-");
});

test("Determinismo: mesmo modelo + opções → mesmo HTML", () =>
  S.toHtml(model, { date: "x" }) === S.toHtml(model, { date: "x" }));

test("Modelo vazio: mapa sem linhas, sem exceção", () => {
  const d = S.build(M.build([], SITE_TRI), {});
  return d.rows.length === 0 && d.feeder === null &&
    S.toHtml(M.build([], SITE_TRI), {}).includes("MAPA DO QUADRO");
});

/* ---------------- Resultado ---------------- */
console.log(`\n${passed} aprovados, ${failed} reprovados (${passed + failed} casos)`);
process.exitCode = failed ? 1 : 0;
