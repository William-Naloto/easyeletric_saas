/* ================================================================
 * Suíte de testes do motor NBR 5410 — executável em Node.js:
 *
 *     node scripts/test_nbr5410_engine.js
 *
 * Cobre: iluminação, tomadas, TUEs dedicadas, chuveiro elétrico,
 * ar-condicionado, cargas trifásicas, alta demanda, QDF (disjuntor
 * geral + alimentador), queda de tensão, correções de agrupamento e
 * temperatura, curto-circuito, casos-limite e regressões.
 * ================================================================ */
"use strict";
const E = require("./nbr5410_engine.js");

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const r = fn();
    if (r) { passed++; console.log(`PASS  ${name}`); }
    else { failed++; console.error(`FAIL  ${name}`); }
  } catch (err) {
    failed++; console.error(`ERR   ${name} — ${err.message}`);
  }
}
const approx = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

const SITE_127 = { Vfn: 127, Vll: 220, Ta: 30, insulation: "PVC", groupedCircuits: 3, maxDropPct: 4, supplyType: "trifasico" };

/* ---------------- Corrente de projeto (Ib) ---------------- */
test("Ib mono 1270W/127V/FP1 = 10A", () =>
  approx(E.designCurrent({ powerVA: 1270, pf: 1, system: "mono", Vfn: 127, Vll: 220 }), 10));
test("Ib bifásico 5500W/220V/FP1 = 25A (chuveiro)", () =>
  approx(E.designCurrent({ powerVA: 5500, pf: 1, system: "bi", Vfn: 127, Vll: 220 }), 25));
test("Ib trifásico 3810W/220V/FP1 ≈ 10A (usa √3)", () =>
  approx(E.designCurrent({ powerVA: 3810, pf: 1, system: "tri", Vfn: 127, Vll: 220 }), 10, 0.05));
test("Ib com FP 0,92 (tomadas 1500VA/127V = 12,84A)", () =>
  approx(E.designCurrent({ powerVA: 1500, pf: 0.92, system: "mono", Vfn: 127, Vll: 220 }), 12.84, 0.01));

/* ---------------- Fatores de correção ---------------- */
test("Ft PVC: 30°C=1,00 | 35°C=0,94 | 40°C=0,87 (Tab. 40)", () =>
  E.tempCorrectionFactor(30, "PVC") === 1.00 &&
  E.tempCorrectionFactor(35, "PVC") === 0.94 &&
  E.tempCorrectionFactor(40, "PVC") === 0.87);
test("Ft XLPE difere de PVC: 40°C → 0,91 (não 0,87)", () =>
  E.tempCorrectionFactor(40, "XLPE") === 0.91);
test("Ft conservador entre linhas: 32°C → usa 35°C (0,94)", () =>
  E.tempCorrectionFactor(32, "PVC") === 0.94);
test("Fg Tab. 42: 1→1,00 | 3→0,70 | 8→0,52 | 10→0,50 | 15→0,45 | 24→0,38", () =>
  E.groupingFactor(1) === 1.00 && E.groupingFactor(3) === 0.70 &&
  E.groupingFactor(8) === 0.52 && E.groupingFactor(10) === 0.50 &&
  E.groupingFactor(15) === 0.45 && E.groupingFactor(24) === 0.38);

/* ---------------- Ampacidade (Tabelas 36/37) ---------------- */
test("Tab. 36 B1/2c: 2,5=24A | 4=32A | 6=41A | 10=57A", () =>
  E.tableAmpacity("B1", 2.5, "PVC", 2) === 24 && E.tableAmpacity("B1", 4, "PVC", 2) === 32 &&
  E.tableAmpacity("B1", 6, "PVC", 2) === 41 && E.tableAmpacity("B1", 10, "PVC", 2) === 57);
test("Tab. 36: 3 condutores carregados < 2 (B1 6mm²: 36 < 41)", () =>
  E.tableAmpacity("B1", 6, "PVC", 3) === 36);
test("Tab. 37 XLPE B1/2c: 2,5=31A | 6=54A", () =>
  E.tableAmpacity("B1", 2.5, "XLPE", 2) === 31 && E.tableAmpacity("B1", 6, "XLPE", 2) === 54);

/* ---------------- Queda de tensão ---------------- */
test("Resistividade Cu a 70°C (PVC) ≈ 0,02063 Ω·mm²/m", () =>
  approx(E.resistivity("PVC"), 0.02063, 0.0001));
test("Resistividade Cu a 90°C (XLPE) ≈ 0,02198 Ω·mm²/m", () =>
  approx(E.resistivity("XLPE"), 0.02198, 0.0001));
test("ΔV mono = 2·L·Ib·ρ/S (FP=1)", () => {
  const r = E.voltageDrop({ Ib: 10, lengthM: 10, sectionMm2: 2.5, system: "mono", V: 127, pf: 1 });
  return approx(r.dropV, 2 * 10 * 10 * E.resistivity("PVC") / 2.5, 0.001);
});
test("ΔV trifásico usa √3 (razão √3/2 vs mono)", () => {
  const m = E.voltageDrop({ Ib: 10, lengthM: 10, sectionMm2: 2.5, system: "mono", V: 220, pf: 1 });
  const t = E.voltageDrop({ Ib: 10, lengthM: 10, sectionMm2: 2.5, system: "tri", V: 220, pf: 1 });
  return approx(t.dropV / m.dropV, Math.sqrt(3) / 2, 0.001);
});
test("ΔV com FP<1 inclui termo de reatância (x·senφ)", () => {
  const r = E.voltageDrop({ Ib: 20, lengthM: 30, sectionMm2: 4, system: "mono", V: 127, pf: 0.8 });
  const expected = 2 * 30 * 20 * ((E.resistivity("PVC") / 4) * 0.8 + 0.0001 * 0.6);
  return approx(r.dropV, expected, 0.001);
});

/* ---------------- Condutor: menor seção que atende tudo ---------------- */
test("Iluminação 660VA/127V (Fg=0,7): 1,5mm² (mínimo Tab. 47 atende)", () => {
  const r = E.sizeCircuit({ power: 660, pf: 0.95, distance: 10, type: "iluminacao", method: "B1", wiringType: "A+N" }, SITE_127);
  return r.conductor.section === 1.5;
});
test("TUG nunca abaixo de 2,5mm² mesmo com carga ínfima (Tab. 47)", () => {
  const r = E.sizeCircuit({ power: 100, pf: 0.92, distance: 5, type: "tomadas", method: "B1", wiringType: "A+N" }, SITE_127);
  return r.conductor.section === 2.5;
});
test("Chuveiro 5500W/220V agrupado (Fg=0,7): 6mm² por ampacidade", () => {
  const r = E.sizeCircuit({ power: 5500, pf: 1, distance: 12, type: "aquecimento", method: "B1", wiringType: "A+B" }, SITE_127);
  return r.conductor.section === 6 && approx(r.Ib, 25);
});
test("Condutor sobe por QUEDA DE TENSÃO: 2000W/127V a 40m → 6mm²", () => {
  const r = E.sizeCircuit({ power: 2000, pf: 0.92, distance: 40, type: "tomadas", method: "B1", wiringType: "A+N" },
    { ...SITE_127, groupedCircuits: 1 });
  return r.conductor.section === 6 && r.conductor.governedBy === "queda de tensão";
});
test("Menor seção sempre: não superdimensiona (1500VA → 2,5mm², não 4mm²)", () => {
  const r = E.sizeCircuit({ power: 1500, pf: 0.92, distance: 15, type: "tomadas", method: "B1", wiringType: "A+N" }, SITE_127);
  return r.conductor.section === 2.5;
});
test("PE (Tab. 58): 10→10 | 25→16 | 50→25 | 120→60", () =>
  E.peSection(10) === 10 && E.peSection(25) === 16 && E.peSection(50) === 25 && E.peSection(120) === 60);

/* ---------------- Proteção: menor In com Ib ≤ In ≤ Izc ---------------- */
test("MCB: exemplo da especificação — Ib=24,8, Izc=28,4 → In=25", () => {
  const r = E.selectBreaker({ Ib: 24.8, Izc: 28.4 });
  return r.In === 25 &&
    r.candidates.find(c => c.In === 20).ok === false &&
    r.candidates.find(c => c.In === 32).ok === false;
});
test("MCB: MENOR In (Ib=15, Izc=22,4 → 16A, não 20A)", () =>
  E.selectBreaker({ Ib: 15, Izc: 22.4 }).In === 16);
test("MCB: nunca In > Izc (Ib=17, Izc=17,5 → nenhum In cabe)", () =>
  E.selectBreaker({ Ib: 17, Izc: 17.5 }).In === null);
test("Coordenação força upsize do condutor: Ib≈16,5 → 4mm² + 20A", () => {
  const r = E.sizeCircuit({ power: 1930, pf: 0.92, distance: 10, type: "tomadas", method: "B1", wiringType: "A+N" }, SITE_127);
  return r.conductor.section === 4 && r.breaker.In === 20 && r.upsizedForBreaker === true;
});
test("Chuveiro coordenado: Ib=25 ≤ In=25 ≤ Izc=28,7", () => {
  const r = E.sizeCircuit({ power: 5500, pf: 1, distance: 12, type: "aquecimento", method: "B1", wiringType: "A+B" }, SITE_127);
  return r.breaker.In === 25 && r.breaker.In <= r.conductor.Izc && r.Ib <= r.breaker.In;
});
test("Curva C para motor e climatização; B para os demais", () =>
  E.breakerCurve("motor") === "C" && E.breakerCurve("climatizacao") === "C" &&
  E.breakerCurve("tomadas") === "B" && E.breakerCurve("iluminacao") === "B");
test("Ar-condicionado 1800W/127V FP0,85 (Fg=0,7): Ib=16,7 força 4mm² + 20A/C", () => {
  // 2,5mm² tem Izc=16,8A ≥ Ib, mas nenhum In comercial cabe em
  // [16,7 ; 16,8] → coordenação da proteção eleva a seção (§5.3.4).
  const r = E.sizeCircuit({ power: 1800, pf: 0.85, distance: 15, type: "climatizacao", method: "B1", wiringType: "C+N" }, SITE_127);
  return r.conductor.section === 4 && r.breaker.curve === "C" && r.breaker.In === 20 && r.upsizedForBreaker;
});
test("Trifásico 6000W/380V: usa tabela de 3 condutores carregados", () => {
  const r = E.sizeCircuit({ power: 6000, pf: 0.92, distance: 20, type: "motor", method: "B1", wiringType: "A+B+C" },
    { ...SITE_127, Vfn: 220, Vll: 380 });
  return approx(r.Ib, 9.91, 0.05) && r.conductor.section === 2.5 && r.breaker.In === 10;
});

/* ---------------- DR / RCD ---------------- */
test("DR 30mA p/ tomadas e chuveiro; 300mA p/ iluminação (§5.1.3.2.2)", () =>
  E.rcdSensitivity("tomadas") === 30 && E.rcdSensitivity("aquecimento") === 30 &&
  E.rcdSensitivity("iluminacao") === 300);

/* ---------------- Curto-circuito ---------------- */
test("Icc no fim do circuito: método da impedância", () => {
  const z0 = 127 / 6000;
  const r = E.shortCircuit({ V: 127, lengthM: 15, sectionMm2: 2.5, insulation: "PVC", upstreamZOhm: z0 });
  const zc = 2 * E.resistivity("PVC") * 15 / 2.5;
  return approx(r.iccEndA, 127 / (z0 + zc), 0.5) && approx(r.iccBoardA, 6000, 1);
});
test("Capacidade de interrupção: 1,5kA→3kA | 5kA→6kA | 12kA→industrial", () =>
  E.requiredBreakingCapacity(1500) === 3000 && E.requiredBreakingCapacity(5000) === 6000 &&
  E.requiredBreakingCapacity(12000) === null);
test("Verificação adiabática: 1,5mm² suporta 470A por 10ms", () =>
  E.adiabaticCheck({ iccA: 470, sectionMm2: 1.5, insulation: "PVC" }).ok === true);

/* ---------------- Validação (PASS/WARN/ERROR) ---------------- */
test("Circuito saudável → todos os checks PASS/WARN, status ≠ ERROR", () => {
  const r = E.sizeCircuit({ power: 5500, pf: 1, distance: 12, type: "aquecimento", method: "B1", wiringType: "A+B" }, SITE_127);
  return r.status !== "ERROR" && r.checks.length >= 7;
});
test("Distância inviável (10kW a 500m) → ERROR de viabilidade", () => {
  const r = E.sizeCircuit({ power: 10000, pf: 0.92, distance: 500, type: "aquecimento", method: "B1", wiringType: "A+N" },
    { ...SITE_127, groupedCircuits: 1 });
  return r.status === "ERROR" && r.checks.some(c => c.id === "viabilidade" && c.status === "ERROR");
});
test("Carga zero (tomada): seção mínima + disjuntor NO TETO da folga do condutor (não 6A)", () => {
  // Regressão do bug relatado: uma tomada de 2,5mm² (Izc ~24A) não
  // pode ficar "travada" num disjuntor de 6A só porque a carga do
  // dia é zero/ínfima — o cabo já foi pago na seção mínima da Tab.
  // 47, então o disjuntor deve aproveitar essa folga (limitado ao
  // teto de plugue NBR 14136 = 20A), não colar no Ib.
  const r = E.sizeCircuit({ power: 0, pf: 0.92, distance: 10, type: "tomadas", method: "B1", wiringType: "A+N" }, SITE_127);
  // SITE_127 usa groupedCircuits:3 (Fg=0,70) → Izc = 24×0,70 = 16,8A,
  // então o maior In comercial ≤ Izc é 16A (ainda assim bem acima
  // do antigo 6A "colado" no Ib=0).
  return r.conductor.section === 2.5 && r.breaker.In === 16 && r.breaker.strategy === "max";
});
test("Regressão do relato do usuário: micro-ondas 1200VA/2,5mm² não fica preso em 6A", () => {
  const r = E.sizeCircuit({ power: 1200, pf: 0.92, distance: 12, type: "tomadas", method: "B1", wiringType: "A+B" }, SITE_127);
  return r.conductor.section === 2.5 && r.breaker.In > 6 && r.breaker.In <= r.conductor.Izc;
});
test("Equipamento FIXO dedicado mantém estratégia 'min' (In ≈ placa, não a folga do cabo)", () => {
  // Ar-condicionado é climatização (equipamento fixo/dedicado):
  // o In deve seguir a corrente do aparelho instalado, não a maior
  // folga possível do condutor — comportamento original preservado.
  const r = E.sizeCircuit({ power: 1800, pf: 0.92, distance: 12, type: "climatizacao", method: "B1", wiringType: "A+B" }, SITE_127);
  return r.breaker.strategy === "min" && r.breaker.In === 10;
});
test("Teto de tomada NBR 14136 (site.socketMaxA): circuito de TUG não passa de 20A por padrão", () => {
  const r = E.sizeCircuit({ power: 500, pf: 0.92, distance: 8, type: "tomadas", method: "B1", wiringType: "A+N" }, SITE_127);
  return r.breaker.In <= 20 && r.breaker.socketMaxA === 20;
});
test("Teto de tomada é ignorado se Ib já o excede (prioridade normativa Ib ≤ In)", () => {
  const r = E.sizeCircuit({ power: 5500, pf: 0.92, distance: 8, type: "tomadas", method: "B1", wiringType: "A+B" }, SITE_127);
  return r.Ib > 20 && r.breaker.In >= r.Ib && r.breaker.socketCapApplied === false;
});

/* ---------------- Demanda (QDF) ---------------- */
test("Fator progressivo ilum+TUG: 800VA → 688VA (0,86)", () =>
  approx(E.lightTugDemandVA(800), 688, 1));
test("Fator progressivo ilum+TUG: 6,56kW → 4,054kW", () =>
  approx(E.lightTugDemandVA(6560), 4054, 5));
test("Fator de aquecimento por nº de aparelhos: 1→1,00 | 2→0,75 | 20→0,40", () =>
  E.heatingDemandFactor(1) === 1.00 && E.heatingDemandFactor(2) === 0.75 &&
  E.heatingDemandFactor(20) === 0.40);
test("Demanda ≥ maior carga individual (salvaguarda)", () => {
  const d = E.demandDiversifiedLoad([{ power: 5500, type: "aquecimento" }]);
  return d.demandVA >= 5500;
});
test("Demanda diversificada < instalada em instalação típica", () => {
  const loads = [
    { power: 660, pf: 0.95, type: "iluminacao", wiringType: "A+N" },
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "B+N" },
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "C+N" },
    { power: 5500, pf: 1, type: "aquecimento", wiringType: "A+B" },
    { power: 5500, pf: 1, type: "aquecimento", wiringType: "B+C" },
    { power: 1800, pf: 0.85, type: "climatizacao", wiringType: "C+N" }
  ];
  const d = E.demandDiversifiedLoad(loads);
  return d.demandVA < d.installedVA && d.categories.AQUEC.factor === 0.75;
});

/* ---------------- QDF: alimentador + disjuntor geral ---------------- */
const HOUSE = [
  { power: 660, pf: 0.95, type: "iluminacao", wiringType: "A+N" },
  { power: 500, pf: 0.95, type: "iluminacao", wiringType: "B+N" },
  { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" },
  { power: 1500, pf: 0.92, type: "tomadas", wiringType: "B+N" },
  { power: 1200, pf: 0.92, type: "tomadas", wiringType: "C+N" },
  { power: 1200, pf: 0.92, type: "tomadas", wiringType: "C+N" },
  { power: 5500, pf: 1, type: "aquecimento", wiringType: "A+B" },
  { power: 5500, pf: 1, type: "aquecimento", wiringType: "B+C" },
  { power: 1800, pf: 0.85, type: "climatizacao", wiringType: "C+N" }
];
test("QDF trifásico: Ib do alimentador = máxima corrente de FASE", () => {
  const q = E.sizeFeederAndMain(HOUSE, SITE_127);
  const maxPh = Math.max(q.Iphase.A, q.Iphase.B, q.Iphase.C);
  return approx(q.IbFeeder, maxPh, 0.001) && q.IbFeeder > 40 && q.IbFeeder < 60;
});
test("QDF: disjuntor geral NÃO é a soma dos disjuntores parciais", () => {
  const q = E.sizeFeederAndMain(HOUSE, SITE_127);
  const sumBranch = HOUSE.map(l => E.sizeCircuit(l, SITE_127).breaker.In).reduce((s, v) => s + v, 0);
  return q.main.In < sumBranch && q.main.In >= q.IbFeeder;
});
test("QDF: coordenação do geral Ib ≤ In ≤ Izc do alimentador", () => {
  const q = E.sizeFeederAndMain(HOUSE, SITE_127);
  return q.IbFeeder <= q.main.In && q.main.In <= q.feeder.Izc && q.main.coordinated;
});
test("QDF: cabo do alimentador com margem de expansão 20%", () => {
  const q = E.sizeFeederAndMain(HOUSE, SITE_127);
  return approx(q.IdimFeeder, q.IbFeeder * 1.2, 0.01) && q.feeder.Izc >= q.IdimFeeder;
});
test("QDF: alimentador respeita seção mínima de entrada (10mm²)", () => {
  const q = E.sizeFeederAndMain([{ power: 100, pf: 1, type: "iluminacao", wiringType: "A+N" }],
    { ...SITE_127, supplyType: "monofasico" });
  return q.feeder.section >= 10;
});
test("QDF monofásico 220V: chuveiro+TUG+ilum → geral 40A, 1 polo", () => {
  const q = E.sizeFeederAndMain([
    { power: 500, pf: 0.95, type: "iluminacao", wiringType: "A+N" },
    { power: 1500, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 5500, pf: 1, type: "aquecimento", wiringType: "A+N" }
  ], { Vfn: 220, Vll: 380, Ta: 30, supplyType: "monofasico" });
  return q.main.In === 40 && q.main.poles === 1 && q.rcd.In >= q.main.In;
});
test("QDF: DR geral ≥ In do disjuntor geral (padrão comercial)", () => {
  const q = E.sizeFeederAndMain(HOUSE, SITE_127);
  return q.rcd.In >= q.main.In && [25, 40, 63, 80, 100, 125].includes(q.rcd.In);
});
test("QDF: DPS classe II com Uc por tensão (127V→275V | 220V→440V)", () => {
  const a = E.sizeFeederAndMain(HOUSE, SITE_127);
  const b = E.sizeFeederAndMain(HOUSE, { ...SITE_127, Vfn: 220, Vll: 380 });
  return a.dps.ucV === 275 && b.dps.ucV === 440 && a.dps.poles === 4;
});
test("QDF: desequilíbrio 100% (tudo na fase A em trifásico) → ERROR", () => {
  const q = E.sizeFeederAndMain([
    { power: 2000, pf: 0.92, type: "tomadas", wiringType: "A+N" },
    { power: 2000, pf: 0.92, type: "tomadas", wiringType: "A+N" }
  ], SITE_127);
  return q.imbalancePct > 20 && q.checks.some(c => c.id === "qdf-equilibrio" && c.status === "ERROR");
});
test("QDF: circuito bifásico soma corrente de LINHA nas duas fases", () => {
  const q = E.sizeFeederAndMain([{ power: 5500, pf: 1, type: "aquecimento", wiringType: "A+B" }], SITE_127);
  // fd=1 (1 aparelho): I = 5500/220 = 25A em A e em B
  return approx(q.Iphase.A, 25, 0.1) && approx(q.Iphase.B, 25, 0.1) && q.Iphase.C === 0;
});
test("QDF alta demanda: 3 chuveiros + 3 AC trifásico coordena sem erro", () => {
  const big = [
    { power: 7500, pf: 1, type: "aquecimento", wiringType: "A+B" },
    { power: 7500, pf: 1, type: "aquecimento", wiringType: "B+C" },
    { power: 7500, pf: 1, type: "aquecimento", wiringType: "A+C" },
    { power: 2600, pf: 0.85, type: "climatizacao", wiringType: "A+N" },
    { power: 2600, pf: 0.85, type: "climatizacao", wiringType: "B+N" },
    { power: 2600, pf: 0.85, type: "climatizacao", wiringType: "C+N" },
    { power: 4000, pf: 0.92, type: "tomadas", wiringType: "A+B+C" }
  ];
  const q = E.sizeFeederAndMain(big, SITE_127);
  return q.main.coordinated && q.main.In >= q.IbFeeder && q.main.In <= q.feeder.Izc &&
    q.status !== "ERROR";
});

/* ---------------- Regressões ---------------- */
test("Regressão: janela [Ib,Izc] respeitada em todo o catálogo de cargas", () => {
  const catalog = [
    { power: 300, type: "iluminacao", pf: 0.95 }, { power: 1000, type: "tomadas", pf: 0.92 },
    { power: 1200, type: "tomadas", pf: 0.92 }, { power: 1500, type: "aquecimento", pf: 1 },
    { power: 1800, type: "climatizacao", pf: 0.85 }, { power: 2200, type: "aquecimento", pf: 1 },
    { power: 3500, type: "aquecimento", pf: 1 }, { power: 5500, type: "aquecimento", pf: 1 },
    { power: 7500, type: "aquecimento", pf: 1 }, { power: 750, type: "motor", pf: 0.8 }
  ];
  return catalog.every(c => {
    for (const wt of ["A+N", "A+B", "A+B+C"]) {
      const r = E.sizeCircuit({ ...c, distance: 15, method: "B1", wiringType: wt }, SITE_127);
      if (!(r.Ib <= r.breaker.In + 1e-9 && r.breaker.In <= r.conductor.Izc + 1e-9)) return false;
    }
    return true;
  });
});
test("Regressão: determinismo (mesma entrada → mesma saída)", () => {
  const load = { power: 5500, pf: 1, distance: 12, type: "aquecimento", method: "B1", wiringType: "A+B" };
  const a = E.sizeCircuit(load, SITE_127), b = E.sizeCircuit(load, SITE_127);
  return JSON.stringify({ s: a.conductor.section, i: a.breaker.In, d: a.drop.dropPct }) ===
         JSON.stringify({ s: b.conductor.section, i: b.breaker.In, d: b.drop.dropPct });
});

console.log(`\n${passed}/${passed + failed} testes aprovados${failed ? ` — ${failed} FALHARAM` : ""}`);
if (failed) process.exitCode = 1;
