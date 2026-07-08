/* ================================================================
 * EasyEletric — Motor de Saúde do Quadro (Engineering Health)
 * ================================================================
 *
 * Módulo independente e SEM DOM: roda no navegador (global
 * `EEPanelHealth`) e em Node.js. Consome EXCLUSIVAMENTE o
 * ElectricalProjectModel — nenhum cálculo NBR 5410 é refeito aqui;
 * o módulo AGREGA e PONTUA o que o motor já validou.
 *
 * Responsabilidades:
 *  - Engineering Health Score (0–100) do quadro, derivado dos
 *    checks PASS/WARN/ERROR de todos os nós + Balance Score;
 *  - Indicadores executivos (Proteção, Queda de Tensão,
 *    Aterramento, Equilíbrio, Demanda, DR/DPS);
 *  - Utilização e reserva dos barramentos (I fase / In geral);
 *  - Capacidade futura do alimentador (folga Izc vs. Ib dim.);
 *  - Recomendações de otimização EXPLICÁVEIS e auditáveis —
 *    nada é aplicado automaticamente: cada recomendação carrega
 *    uma `action` declarativa que o chamador aplica sob aprovação
 *    explícita do usuário (mesma filosofia do EEPhaseBalance).
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./phase_balance.js"));
  } else {
    root.EEPanelHealth = factory(root.EEPhaseBalance);
  }
})(typeof self !== "undefined" ? self : this, function (Balance) {
  "use strict";

  // Penalidades do Health Score por severidade de check do motor
  const PENALTY = { ERROR: 15, WARN: 5 };

  // Peso de cada componente do Health Score
  const WEIGHTS = { checks: 0.7, balance: 0.3 };

  const GRADES = [
    { min: 90, grade: "Excelente" },
    { min: 75, grade: "Bom" },
    { min: 50, grade: "Atenção" },
    { min: 0, grade: "Crítico" }
  ];

  // Utilização de barramento: limiares de alerta (prática de projeto)
  const BUS_UTIL_WARN_PCT = 80;
  const BUS_UTIL_ERROR_PCT = 100;

  // Capacidade futura mínima recomendada (reserva de expansão)
  const MIN_FUTURE_CAPACITY_PCT = 20;

  // Circuito "no limite" de queda de tensão (fração do limite NBR)
  const DROP_ATTENTION_RATIO = 0.8;

  // Seções comerciais de cobre (mm²) — NBR NM 280 / prática NBR 5410
  const COMMERCIAL_SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];

  /** Próxima seção comercial acima da atual (null se já é a maior). */
  function nextSection(section) {
    for (const s of COMMERCIAL_SECTIONS) if (s > section) return s;
    return null;
  }

  /**
   * Estimativa da queda com a próxima seção: em circuitos residenciais
   * a resistência domina a impedância, e R ∝ 1/S ⇒ ΔV' ≈ ΔV·(S/S').
   * É uma ESTIMATIVA de recomendação — o valor exato sai do motor ao
   * recalcular; por isso a sugestão é informativa, nunca auto-aplicada.
   */
  function estimateDropAt(dropPct, section, newSection) {
    return dropPct * (section / newSection);
  }

  const STATUS_RANK = { PASS: 0, WARN: 1, ERROR: 2 };
  const worst = (a, b) => (STATUS_RANK[b] || 0) > (STATUS_RANK[a] || 0) ? b : a;

  function gradeOf(pct) {
    for (const g of GRADES) if (pct >= g.min) return g.grade;
    return "Crítico";
  }

  /** Todos os checks WARN/ERROR do modelo, com o nó de origem.
   *  O modelo replica o mesmo check em vários nós (ex.: equilíbrio
   *  aparece no painel e em cada barramento) — deduplicado por
   *  id+detalhe para pontuar cada problema UMA única vez. */
  function collectFindings(model) {
    const out = [];
    const seen = new Set();
    for (const n of model.nodes) {
      for (const c of (n.validation && n.validation.checks) || []) {
        if (c.status !== "WARN" && c.status !== "ERROR") continue;
        const key = c.id + "|" + c.detail;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ nodeId: n.id, nodeLabel: n.label, check: c });
      }
    }
    return out;
  }

  /** Status agregado de um subconjunto de nós (por tipo). */
  function statusOfTypes(model, types) {
    let st = "PASS";
    for (const n of model.nodes) {
      if (types.includes(n.type) && n.validation) st = worst(st, n.validation.status);
    }
    return st;
  }

  /* ==============================================================
   * assess(model) — painel de saúde do quadro
   * ============================================================== */

  /**
   * Avalia a saúde de engenharia do quadro a partir do modelo.
   * @param model ElectricalProjectModel (EEProjectModel.build)
   * @returns {healthPct, grade, indicators[], findings[],
   *           warningCount, errorCount, futureCapacityPct, busbars[]}
   */
  function assess(model) {
    const s = model.summary;
    const feeder = model.byId.feeder;
    const main = model.byId["main-breaker"];
    const spd = model.byId.spd;
    const mainRcd = model.byId["main-rcd"];

    // ── Findings (todos os WARN/ERROR de todos os nós) ───────────
    const findings = collectFindings(model);
    const errorCount = findings.filter(f => f.check.status === "ERROR").length;
    const warningCount = findings.filter(f => f.check.status === "WARN").length;

    // ── Health Score = 70% checks + 30% equilíbrio ───────────────
    // Monofásico: equilíbrio de fases não se aplica → componente 100.
    const checksScore = Math.max(0, 100 - PENALTY.ERROR * errorCount - PENALTY.WARN * warningCount);
    const balanceScore = (s.phasesInUse.length < 2 || s.balanceScore == null) ? 100 : s.balanceScore;
    const healthPct = model.circuits.length
      ? Math.round(WEIGHTS.checks * checksScore + WEIGHTS.balance * balanceScore)
      : 0;

    // ── Capacidade futura: folga do alimentador (Izc vs Ib dim.) ─
    const Izc = feeder && feeder.calc.Izc;
    const Idim = feeder && (feeder.calc.Idim || feeder.calc.Ib);
    const futureCapacityPct = (Izc && Idim)
      ? Math.max(0, Math.round((Izc - Idim) / Izc * 100))
      : 0;

    // ── Utilização dos barramentos (I fase / In do geral) ────────
    const mainIn = main && main.data.In;
    const busbars = s.phasesInUse.map(ph => {
      const bus = model.byId["bus-" + ph];
      const currentA = (bus && bus.calc.currentA) || 0;
      const utilizationPct = mainIn ? Math.round(currentA / mainIn * 100) : 0;
      return {
        phase: ph, currentA, capacityA: mainIn || 0,
        utilizationPct,
        reservePct: Math.max(0, 100 - utilizationPct),
        status: utilizationPct >= BUS_UTIL_ERROR_PCT ? "ERROR"
          : utilizationPct >= BUS_UTIL_WARN_PCT ? "WARN" : "PASS"
      };
    });
    const busN = model.byId["bus-N"];
    if (busN) {
      const currentA = busN.calc.currentA || 0;
      const utilizationPct = mainIn ? Math.round(currentA / mainIn * 100) : 0;
      busbars.push({
        phase: "N", currentA, capacityA: mainIn || 0,
        utilizationPct, reservePct: Math.max(0, 100 - utilizationPct),
        status: "PASS"
      });
    }

    // ── Indicadores executivos ───────────────────────────────────
    const protectionStatus = statusOfTypes(model, ["breaker", "main-breaker"]);
    const dropStatus = (() => {
      let st = feeder && feeder.validation ? feeder.validation.status : "PASS";
      for (const c of model.circuits) {
        const cond = model.byId[c.conductorId];
        if (cond && cond.validation) st = worst(st, cond.validation.status);
      }
      return st;
    })();
    const groundingOk = !!(feeder && feeder.data.pe) &&
      model.circuits.every(c => model.byId[c.conductorId].data.pe);
    const rcdStatus = statusOfTypes(model, ["rcd", "main-rcd"]);
    const hasSpd = !!(spd && spd.data.class);
    const hasMainRcd = !!(mainRcd && mainRcd.data.In);

    const imbalance = s.imbalancePct || 0;
    const balanceStatus = model.summary.phasesInUse.length < 2 ? "PASS"
      : imbalance > 20 ? "ERROR" : imbalance > 10 ? "WARN" : "PASS";

    // Demanda: indicador informativo — o equilíbrio e a queda já têm
    // indicadores próprios; aqui interessa a viabilidade do alimentador
    // dimensionado para a demanda diversificada (checks do feeder).
    const demandStatus = feeder && feeder.validation ? feeder.validation.status : "PASS";

    const indicators = [
      {
        id: "protection", label: "Proteção", status: protectionStatus,
        detail: protectionStatus === "PASS"
          ? "Coordenação Ib ≤ In ≤ Izc e Icn conformes em todos os circuitos"
          : "Há circuitos com coordenação ou capacidade de interrupção em alerta"
      },
      {
        id: "voltage-drop", label: "Queda de Tensão", status: dropStatus,
        detail: `ΔV máx. de circuito ${fmtNum(s.maxDropPct, 2)}% — NBR 5410 §6.2.7`
      },
      {
        id: "grounding", label: "Aterramento", status: groundingOk ? "PASS" : "ERROR",
        detail: groundingOk
          ? "Condutor PE dimensionado no alimentador e em todos os circuitos (Tab. 58)"
          : "Há trechos sem condutor de proteção PE dimensionado"
      },
      {
        id: "balance", label: "Equilíbrio de Fases", status: balanceStatus,
        value: balanceScore,
        detail: model.summary.phasesInUse.length < 2
          ? "Sistema monofásico — equilíbrio não se aplica"
          : `Balance Score ${balanceScore}/100 · desequilíbrio ${fmtNum(imbalance, 1)}%`
      },
      {
        id: "demand", label: "Demanda", status: demandStatus,
        detail: `Demanda diversificada ${fmtNum(s.demandVA / 1000, 2)} kVA (Fd ${fmtNum(s.overallFactor * 100, 0)}%)`
      },
      {
        id: "differential", label: "DR / DPS", status: (hasSpd && hasMainRcd) ? worst("PASS", rcdStatus) : "WARN",
        detail: (hasSpd && hasMainRcd)
          ? "DR geral e DPS presentes no quadro"
          : "DR geral e/ou DPS ausentes — verifique NBR 5410 §5.1.3.2.2 / §6.3.5.2"
      }
    ];

    return {
      healthPct,
      grade: gradeOf(healthPct),
      status: s.status,
      indicators,
      findings,
      warningCount,
      errorCount,
      futureCapacityPct,
      busbars
    };
  }

  /* ==============================================================
   * recommend(model, loads, site) — otimizador do quadro
   * ============================================================== */

  /**
   * Gera recomendações de otimização do quadro. NADA é aplicado
   * aqui: recomendações com `action` são aplicadas pelo chamador
   * somente após aprovação do usuário.
   *
   * @param model ElectricalProjectModel
   * @param loads cargas cruas do projeto (para o otimizador de fases)
   * @param site  parâmetros do local ({Vfn, Vll, supplyType, ...})
   * @returns [{id, severity, title, detail, reference?, action?}]
   *   action (opcional): { type:"phase-moves", moves[], before, after }
   */
  function recommend(model, loads, site) {
    const recs = [];
    const health = assess(model);
    const s = model.summary;

    // 1. Balanceamento de fases (ação aplicável com um clique)
    if (Balance && loads && loads.length && s.phasesInUse.length >= 2) {
      const opt = Balance.optimize(loads, site);
      if (opt.moves.length && opt.improved) {
        recs.push({
          id: "phase-balance",
          severity: s.imbalancePct > 20 ? "error" : s.imbalancePct > 10 ? "warn" : "info",
          title: `Rebalancear fases: score ${opt.before.score} → ${opt.after.score}`,
          detail: opt.moves.map(m =>
            `Mover "${m.description}" da fase ${m.fromPhase} para ${m.toPhase} (${m.currentA} A)`
          ).join(" · "),
          reference: "NBR 5410 §4.2.5 / §6.5.2 — divisão e equilíbrio da instalação",
          action: {
            type: "phase-moves",
            moves: opt.moves,
            before: { score: opt.before.score, imbalancePct: opt.before.imbalancePct, neutralA: opt.before.neutralA },
            after: { score: opt.after.score, imbalancePct: opt.after.imbalancePct, neutralA: opt.after.neutralA }
          }
        });
      }
    }

    // 2. Cada finding do motor vira recomendação de correção
    for (const f of health.findings) {
      recs.push({
        id: `check-${f.nodeId}-${f.check.id}`,
        severity: f.check.status === "ERROR" ? "error" : "warn",
        title: `${f.nodeLabel}: ${f.check.label}`,
        detail: f.check.detail,
        reference: f.check.reference || "NBR 5410:2023"
      });
    }

    // 3. Barramentos com utilização alta
    for (const b of health.busbars) {
      if (b.status !== "PASS") {
        recs.push({
          id: `busbar-${b.phase}`,
          severity: b.status === "ERROR" ? "error" : "warn",
          title: `Barramento fase ${b.phase} com ${b.utilizationPct}% de utilização`,
          detail: `${fmtNum(b.currentA, 1)} A de ${b.capacityA} A do disjuntor geral — reserva de apenas ${b.reservePct}%`,
          reference: "Prática de projeto — reserva mínima de 20% por barramento"
        });
      }
    }

    // 4. Capacidade futura do alimentador
    if (model.circuits.length && health.futureCapacityPct < MIN_FUTURE_CAPACITY_PCT) {
      recs.push({
        id: "future-capacity",
        severity: "warn",
        title: `Capacidade futura de ${health.futureCapacityPct}% no alimentador`,
        detail: "Folga do alimentador abaixo de 20% — considere a próxima seção comercial para ampliações futuras",
        reference: "NBR 5410 §4.2.1.4 — previsão de expansão da instalação"
      });
    }

    // 5. Circuitos operando perto do limite de queda de tensão —
    //    sugestão QUANTIFICADA: próxima seção comercial e ΔV estimada
    for (const c of model.circuits) {
      const cond = model.byId[c.conductorId];
      const dropPct = cond.calc.dropPct;
      const maxPct = cond.calc.maxDropPct;
      if (maxPct && dropPct <= maxPct && dropPct > DROP_ATTENTION_RATIO * maxPct) {
        const next = nextSection(cond.data.section);
        const estimated = next ? estimateDropAt(dropPct, cond.data.section, next) : null;
        recs.push({
          id: `drop-${c.id}`,
          severity: "info",
          title: `Circuito ${c.n} (${c.name}) com ΔV ${fmtNum(dropPct, 2)}% próximo do limite ${maxPct}%`,
          detail: next
            ? `Seção ${cond.data.section} mm² em ${cond.data.lengthM} m — subir para ${next} mm² reduziria a queda para ≈ ${fmtNum(estimated, 2)}% (estimativa R ∝ 1/S; valor exato ao recalcular)`
            : `Seção ${cond.data.section} mm² em ${cond.data.lengthM} m — já na maior seção comercial; avalie reduzir o comprimento ou dividir o circuito`,
          suggestion: next ? {
            type: "cable-section",
            circuit: c.n,
            fromSection: cond.data.section,
            toSection: next,
            dropPct,
            estimatedDropPct: estimated == null ? null : Math.round(estimated * 100) / 100
          } : null,
          reference: "NBR 5410 §6.2.7 — limites de queda de tensão"
        });
      }
    }

    return recs;
  }

  function fmtNum(v, d) {
    return (v == null || isNaN(v)) ? "—" : Number(v).toFixed(d == null ? 1 : d).replace(".", ",");
  }

  return {
    assess,
    recommend,
    gradeOf,
    collectFindings,
    nextSection,
    estimateDropAt,
    THRESHOLDS: {
      PENALTY, WEIGHTS, GRADES,
      BUS_UTIL_WARN_PCT, BUS_UTIL_ERROR_PCT,
      MIN_FUTURE_CAPACITY_PCT, DROP_ATTENTION_RATIO,
      COMMERCIAL_SECTIONS
    }
  };
});
