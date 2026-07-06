/* ================================================================
 * EasyEletric — Registro de Decisões de Engenharia (Decision Log)
 * ================================================================
 *
 * Módulo independente e SEM DOM: navegador (global `EEDecisionLog`)
 * e Node.js.
 *
 * Converte os resultados brutos do motor NBR 5410 (sizeCircuit /
 * sizeFeederAndMain) no formato ÚNICO de decisão auditável que
 * alimenta a UI e o memorial:
 *
 *   { id, topic, decision, value, reason,
 *     rejected: [{option, reason}], reference }
 *
 * Nenhum cálculo é refeito aqui — o módulo apenas TRADUZ a trilha
 * de auditoria já produzida pelo motor (steps do condutor,
 * candidates do disjuntor, verificações de curto-circuito) em
 * decisões explicáveis. Fonte única de lógica de engenharia:
 * o motor.
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.EEDecisionLog = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const REFS = {
    designCurrent: "NBR 5410 §4.2.3 (corrente de projeto)",
    correctionFactors: "NBR 5410 Tabelas 40 e 42",
    conductor: "NBR 5410 Tabelas 36/37 e 47; §6.2.7",
    breaker: "NBR 5410 §5.3.4 (Ib ≤ In ≤ Iz; I2 ≤ 1,45·Iz)",
    breaking: "IEC 60898-1 (Icn) / NBR 5410 §5.3.5.3",
    adiabatic: "NBR 5410 §5.3.5.4 (integral de Joule)",
    rcd: "NBR 5410 §5.1.3.2.2",
    pe: "NBR 5410 Tabela 58",
    demand: "fatores de demanda (concessionárias/Creder) — docs/metodologia",
    feeder: "NBR 5410 §6.2.6.2 / prática de entrada de serviço",
    balance: "NBR 5410 §4.2.5 (divisão da instalação)"
  };

  function entry(id, topic, decision, value, reason, rejected, reference) {
    return { id, topic, decision, value, reason, rejected: rejected || [], reference };
  }

  const fmtA = v => `${(Math.round(v * 100) / 100).toString().replace(".", ",")} A`;
  const fmtMm = v => `${v.toString().replace(".", ",")} mm²`;
  const fmtPct = v => `${v.toFixed(2).replace(".", ",")}%`;

  /**
   * Decision log de um CIRCUITO TERMINAL a partir do resultado de
   * NBR5410.sizeCircuit().
   */
  function fromCircuit(r) {
    const log = [];

    // 1. Corrente de projeto
    log.push(entry("ib", "Corrente de projeto",
      `Ib = ${fmtA(r.Ib)}`, r.Ib,
      r.system === "tri"
        ? `P/(√3·V·FP) com V=${r.V} V (trifásico)`
        : `P/(V·FP) com V=${r.V} V (${r.system === "bi" ? "fase-fase" : "fase-neutro"})`,
      [], REFS.designCurrent));

    // 2. Fatores de correção
    log.push(entry("fatores", "Fatores de correção",
      `Ft = ${r.Ft} · Fg = ${r.Fg}`, r.Ft * r.Fg,
      `temperatura ambiente (Tab. 40) e agrupamento de circuitos (Tab. 42) reduzem a ampacidade de tabela: Izc = Iz·Ft·Fg`,
      [], REFS.correctionFactors));

    // 3. Condutor — rejeições diretamente da trilha do motor
    const rejectedSections = (r.conductor.steps || [])
      .filter(s => !s.ok && s.section < r.conductor.section)
      .map(s => ({ option: fmtMm(s.section), reason: s.reason }));
    log.push(entry("condutor", "Condutor de fase",
      `${fmtMm(r.conductor.section)} (cobre)`, r.conductor.section,
      `menor seção comercial que atende seção mínima, ampacidade (Izc = ${fmtA(r.conductor.Izc)} ≥ Ib) e queda de tensão (${fmtPct(r.drop.dropPct)} ≤ ${r.maxDropPct}%). Critério governante: ${r.conductor.governedBy}`,
      rejectedSections, REFS.conductor));

    // 4. Condutor PE
    log.push(entry("pe", "Condutor de proteção (PE)",
      fmtMm(r.conductor.pe), r.conductor.pe,
      r.conductor.section <= 16 ? "PE igual à fase (S ≤ 16 mm²)" : "PE reduzido conforme Tabela 58",
      [], REFS.pe));

    // 5. Disjuntor — candidatos avaliados pelo motor
    const rejectedBreakers = (r.breaker.candidates || [])
      .filter(c => c.In !== r.breaker.In)
      .map(c => ({
        option: `${c.In} A`,
        reason: c.ok
          ? `atende a janela [Ib; Izc], mas não é o MENOR In — superdimensionaria a proteção sem justificativa`
          : c.reason
      }));
    log.push(entry("disjuntor", "Disjuntor",
      `${r.breaker.In} A curva ${r.breaker.curve}`, r.breaker.In,
      (r.upsizedForBreaker
        ? `nenhum In comercial cabia na janela [Ib; Izc] da seção original — seção elevada para coordenar. `
        : "") +
      `menor In comercial com Ib ≤ In ≤ Izc (${fmtA(r.Ib)} ≤ ${r.breaker.In} A ≤ ${fmtA(r.conductor.Izc)}); curva ${r.breaker.curve} ${r.breaker.curve === "C" ? "para corrente de partida (motor/compressor)" : "para cargas sem partida (menor limiar magnético = atuação mais rápida)"}`,
      rejectedBreakers, REFS.breaker));

    // 6. Capacidade de interrupção
    if (r.breaker.icnRequiredA !== null && r.breaker.icnRequiredA !== undefined) {
      log.push(entry("icn", "Capacidade de interrupção",
        `Icn ≥ ${r.breaker.icnRequiredA / 1000} kA`, r.breaker.icnRequiredA,
        `corrente de curto presumida no quadro ${Math.round(r.shortCircuit.iccBoardA)} A — menor Icn padronizado que a supera`,
        [], REFS.breaking));
    }

    // 7. DR
    log.push(entry("dr", "Proteção DR",
      `${r.rcd.In} A / ${r.rcd.sensitivityMa} mA`, r.rcd.sensitivityMa,
      r.rcd.sensitivityMa === 30
        ? "proteção adicional de pessoas obrigatória (tomadas/áreas molhadas/externos)"
        : "iluminação fixa — coberta por DR geral (proteção contra incêndio)",
      [], REFS.rcd));

    return log;
  }

  /**
   * Decision log do QDF/alimentador a partir do resultado de
   * NBR5410.sizeFeederAndMain().
   */
  function fromFeeder(q) {
    const log = [];
    const d = q.demand;

    // 1. Demanda diversificada
    log.push(entry("demanda", "Demanda diversificada",
      `${(d.demandVA / 1000).toFixed(2).replace(".", ",")} kVA (fator global ${(d.overallFactor).toFixed(2).replace(".", ",")})`,
      d.demandVA,
      `potência instalada ${(d.installedVA / 1000).toFixed(2).replace(".", ",")} kVA reduzida por fatores de demanda por categoria (ilum+TUG progressivo, aquecimento por nº de aparelhos, climatização 100%, motores 100%/70%)`,
      [{ option: "Somar potência instalada (ou disjuntores parciais)",
         reason: "superdimensiona a entrada — as cargas não operam todas simultaneamente" }],
      REFS.demand));

    // 2. Corrente do alimentador = máxima corrente de fase
    log.push(entry("ib-alim", "Corrente de projeto do alimentador",
      `Ib = ${fmtA(q.IbFeeder)} (fase mais carregada)`, q.IbFeeder,
      `correntes por fase sob demanda: A=${fmtA(q.Iphase.A)}, B=${fmtA(q.Iphase.B)}, C=${fmtA(q.Iphase.C)} — o alimentador é dimensionado pela MAIOR`,
      [], REFS.feeder));

    // 3. Condutor do alimentador
    const rejectedSections = (q.feeder.steps || [])
      .filter(s => !s.ok && s.section < q.feeder.section)
      .map(s => ({ option: fmtMm(s.section), reason: s.reason }));
    log.push(entry("cabo-alim", "Condutor do alimentador",
      `${fmtMm(q.feeder.section)} + N ${fmtMm(q.feeder.neutral)} + PE ${fmtMm(q.feeder.pe)}`,
      q.feeder.section,
      `dimensionado para Ib×(1+${Math.round(q.feeder.expansionMargin * 100)}% de reserva) = ${fmtA(q.IdimFeeder)}; queda real ${fmtPct(q.feeder.drop.dropPct)} ≤ ${q.feeder.maxDropPct}% em ${q.feeder.lengthM} m. Critério governante: ${q.feeder.governedBy}`,
      rejectedSections, REFS.conductor));

    // 4. Disjuntor geral
    const rejectedMains = (q.main.candidates || [])
      .filter(c => !c.ok && c.In !== q.main.In)
      .map(c => ({ option: `${c.In} A`, reason: c.reason }));
    log.push(entry("geral", "Disjuntor geral",
      `${q.main.In} A curva ${q.main.curve} (${q.main.poles}P)`, q.main.In,
      `menor In comercial com Ib ≤ In ≤ Izc do alimentador (${fmtA(q.IbFeeder)} ≤ ${q.main.In} A ≤ ${fmtA(q.feeder.Izc)}) — NUNCA a soma dos disjuntores parciais`,
      rejectedMains.concat([{ option: "Σ In dos disjuntores parciais",
        reason: "ignora a diversidade de cargas — o geral dispararia tarde demais ou exigiria alimentador absurdo" }]),
      REFS.breaker));

    // 5. Equilíbrio de fases
    log.push(entry("equilibrio", "Equilíbrio de fases",
      `desequilíbrio ${q.imbalancePct.toFixed(0)}%`, q.imbalancePct,
      q.imbalancePct <= 10
        ? "dentro da meta de projeto (≤ 10%)"
        : "acima da meta (≤ 10%) — usar o otimizador de balanceamento para redistribuir circuitos F+N",
      [], REFS.balance));

    return log;
  }

  /**
   * Log consolidado do projeto: circuitos + QDF + módulos extras
   * (DR geral, DPS, aterramento — que já produzem `decisions` no
   * formato nativo).
   */
  function fromProject({ circuits = [], feeder = null, extraDecisions = [] }) {
    const sections = [];
    circuits.forEach((r, i) => {
      sections.push({
        scope: `Circuito ${i + 1}${r.input && r.input.name ? ` — ${r.input.name}` : ""}`,
        entries: fromCircuit(r)
      });
    });
    if (feeder) sections.push({ scope: "QDF / Alimentador", entries: fromFeeder(feeder) });
    for (const ex of extraDecisions) {
      sections.push({
        scope: ex.scope,
        entries: (ex.decisions || []).map((d, i) =>
          entry(`${ex.scope}-${i}`, ex.scope, d.decision, null, d.reason, d.rejected, d.reference))
      });
    }
    return sections;
  }

  return { REFS, fromCircuit, fromFeeder, fromProject };
});
