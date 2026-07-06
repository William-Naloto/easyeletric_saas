/* ================================================================
 * EasyEletric — Motor de Balanceamento de Fases
 * ================================================================
 *
 * Módulo independente e SEM DOM: roda no navegador (global
 * `EEPhaseBalance`) e em Node.js. Depende apenas do motor NBR 5410
 * (funções de corrente de projeto e demanda).
 *
 * Responsabilidades:
 *  - Análise de correntes por fase sob DEMANDA DIVERSIFICADA
 *    (nunca por potência instalada crua);
 *  - Estimativa da corrente de neutro por soma fasorial
 *    (fases defasadas de 120°);
 *  - Índice de desequilíbrio e Balance Score (0–100) com nota;
 *  - Otimizador DETERMINÍSTICO de realocação de circuitos
 *    monofásicos (F+N): LPT (Longest Processing Time) + busca
 *    local por movimentos simples, com relatório ANTES/DEPOIS e
 *    lista de movimentos sugeridos.
 *
 * Somente circuitos F+N são realocáveis: circuitos F+F e 3F têm
 * as fases definidas pela topologia e não são movidos.
 *
 * Referências:
 *  - NBR 5410 §4.2.5 / §6.5.2 (divisão da instalação, equilíbrio);
 *  - IEEE Std 141 (neutro por soma fasorial em sistemas a 120°);
 *  - Prática de concessionárias: desequilíbrio ≤ 10% recomendado.
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("../nbr5410_engine.js"));
  } else {
    root.EEPhaseBalance = factory(root.NBR5410);
  }
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  // Limiares de qualidade do equilíbrio (desequilíbrio % = (Imax-Imin)/Imax)
  const GRADE_THRESHOLDS = [
    { maxImbalancePct: 5, grade: "Excelente" },
    { maxImbalancePct: 10, grade: "Bom" },
    { maxImbalancePct: 20, grade: "Aceitável" },
    { maxImbalancePct: Infinity, grade: "Crítico" }
  ];

  // Peso da penalidade de neutro no Balance Score: neutro elevado
  // indica desequilíbrio fasorial mesmo quando os módulos são
  // parecidos (documentado em docs/metodologia_calculo_nbr5410.md).
  const NEUTRAL_PENALTY_WEIGHT = 0.15;

  // Limite de iterações da busca local (garantia de término e
  // determinismo; na prática converge em poucas passadas).
  const MAX_LOCAL_SEARCH_PASSES = 50;

  const PHASES_BY_SUPPLY = {
    monofasico: ["A"],
    bifasico: ["A", "B"],
    trifasico: ["A", "B", "C"]
  };

  const WT_OF_PHASE = { A: "A+N", B: "B+N", C: "C+N" };

  /** Fases realmente disponíveis para o tipo de fornecimento. */
  function availablePhases(supplyType) {
    return PHASES_BY_SUPPLY[supplyType] || PHASES_BY_SUPPLY.trifasico;
  }

  /**
   * Corrente de cada circuito sob demanda diversificada.
   * Usa o mesmo fator de demanda por categoria do motor NBR 5410
   * (fonte única — sem duplicação de lógica de demanda).
   * @returns [{index, load, system, phases, currentA}]
   */
  function circuitCurrents(loadsArr, site) {
    const demand = E.demandDiversifiedLoad(loadsArr);
    return loadsArr.map((l, index) => {
      const P = parseFloat(l.power) || 0;
      const pf = parseFloat(l.pf) || 0.92;
      const cat = demand.categories[E.demandCategory(l.type)];
      const fd = cat.installedVA > 0 ? (cat.demandVA || 0) / cat.installedVA : 1;
      const wt = l.wiringType || "A+N";
      const system = E.systemOfWiring(wt);
      const currentA = E.designCurrent({
        powerVA: P * fd, pf, system, Vfn: site.Vfn, Vll: site.Vll
      });
      return { index, load: l, wiringType: wt, system, phases: E.phasesOfWiring(wt), currentA };
    });
  }

  /**
   * Corrente de neutro por SOMA FASORIAL das correntes F+N
   * (fases defasadas de 120°, mesmo ângulo de FP por fase —
   * aproximação usual de projeto):
   *   3F+N: In = √(Ia²+Ib²+Ic² − IaIb − IbIc − IcIa)
   *   2F+N: In = √(Ia²+Ib² − IaIb)   (fases a 120°)
   *   1F+N: In = Ia
   * Circuitos F+F e 3F equilibrados não contribuem para o neutro.
   */
  function neutralCurrent(IphN, phases) {
    const [a, b, c] = [IphN.A || 0, IphN.B || 0, IphN.C || 0];
    if (phases.length >= 3) {
      return Math.sqrt(Math.max(0, a * a + b * b + c * c - a * b - b * c - c * a));
    }
    if (phases.length === 2) {
      return Math.sqrt(Math.max(0, a * a + b * b - a * b));
    }
    return a;
  }

  /** Desequilíbrio % = (Imax − Imin)/Imax sobre as fases em uso. */
  function imbalancePct(Iphase, phases) {
    if (phases.length < 2) return 0;
    const vals = phases.map(p => Iphase[p] || 0);
    const max = Math.max(...vals), min = Math.min(...vals);
    return max > 0 ? ((max - min) / max) * 100 : 0;
  }

  /** Nota qualitativa a partir do desequilíbrio. */
  function gradeOf(imbPct) {
    for (const g of GRADE_THRESHOLDS) if (imbPct <= g.maxImbalancePct) return g.grade;
    return "Crítico";
  }

  /**
   * Balance Score 0–100:
   *   score = 100 − desequilíbrio% − peso·(In/Imax_fase)·100
   * O termo de neutro penaliza instalações com neutro carregado
   * (retorno fasorial), mesmo com módulos de fase próximos.
   */
  function balanceScore(imbPct, neutralA, maxPhaseA) {
    const neutralRatio = maxPhaseA > 0 ? neutralA / maxPhaseA : 0;
    const score = 100 - imbPct - NEUTRAL_PENALTY_WEIGHT * neutralRatio * 100;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Analisa o equilíbrio de fases de um conjunto de circuitos.
   *
   * @param loadsArr circuitos {power, pf, type, wiringType}
   * @param site {Vfn, Vll, supplyType}
   * @returns {Iphase, IphaseNeutralReturn, neutralA, imbalancePct,
   *           score, grade, phases, perCircuit}
   */
  function analyze(loadsArr, site) {
    const phases = availablePhases(site.supplyType || "trifasico");
    const per = circuitCurrents(loadsArr, site);
    const Iphase = { A: 0, B: 0, C: 0 };      // corrente total de linha
    const IphN = { A: 0, B: 0, C: 0 };        // parcela F+N (retorno pelo neutro)
    for (const c of per) {
      for (const ph of c.phases) Iphase[ph] += c.currentA;
      if (c.system === "mono") IphN[c.phases[0]] += c.currentA;
    }
    const imb = imbalancePct(Iphase, phases);
    const neutralA = neutralCurrent(IphN, phases);
    const maxPhaseA = Math.max(...phases.map(p => Iphase[p]), 0);
    return {
      phases,
      Iphase,
      IphaseNeutralReturn: IphN,
      neutralA: round2(neutralA),
      imbalancePct: round2(imb),
      score: balanceScore(imb, neutralA, maxPhaseA),
      grade: gradeOf(imb),
      perCircuit: per
    };
  }

  /* --------------------------------------------------------------
   * OTIMIZADOR — realocação determinística de circuitos F+N
   * -------------------------------------------------------------- */

  /** Spread (Imax−Imin) de uma atribuição — função objetivo primária. */
  function spreadOf(Iphase, phases) {
    const vals = phases.map(p => Iphase[p] || 0);
    return Math.max(...vals) - Math.min(...vals);
  }

  /**
   * Otimiza a distribuição dos circuitos monofásicos (F+N) entre as
   * fases disponíveis, minimizando o spread de corrente entre fases.
   *
   * Algoritmo determinístico em 2 etapas:
   *  1. LPT: circuitos F+N em ordem decrescente de corrente, cada um
   *     para a fase de menor carga acumulada (empate: ordem A<B<C);
   *  2. Busca local: enquanto houver melhoria, tenta mover cada
   *     circuito para outra fase (aceita a PRIMEIRA melhoria por
   *     passada; máx. MAX_LOCAL_SEARCH_PASSES passadas).
   *
   * Circuitos F+F e 3F permanecem fixos (topologia).
   *
   * @returns {before, after, moves, improved, applyTo}
   *   moves: [{index, description, fromPhase, toPhase,
   *            fromWiring, toWiring, currentA}]
   *   applyTo(loadsArr): aplica os wiringType sugeridos (mutação
   *   explícita, opt-in do chamador).
   */
  function optimize(loadsArr, site) {
    const supplyType = site.supplyType || "trifasico";
    const phases = availablePhases(supplyType);
    const before = analyze(loadsArr, site);

    if (phases.length < 2) {
      // Monofásico: nada a otimizar — tudo em A+N por definição.
      const moves = [];
      for (const c of before.perCircuit) {
        if (c.system === "mono" && c.phases[0] !== "A") {
          moves.push(moveRecord(c, "A"));
        }
      }
      return finalize(loadsArr, site, before, moves);
    }

    // Carga fixa por fase: circuitos não realocáveis (F+F, 3F)
    const fixed = { A: 0, B: 0, C: 0 };
    const movable = [];
    for (const c of before.perCircuit) {
      if (c.system === "mono") movable.push(c);
      else for (const ph of c.phases) fixed[ph] += c.currentA;
    }

    // Etapa 1 — LPT: maiores primeiro, fase menos carregada.
    // Empates resolvidos por (corrente desc, índice asc) e ordem
    // alfabética de fase ⇒ resultado 100% determinístico.
    const acc = { ...fixed };
    const assignment = new Map(); // index → fase
    const sorted = [...movable].sort((a, b) =>
      b.currentA - a.currentA || a.index - b.index);
    for (const c of sorted) {
      const ph = [...phases].sort((p, q) => acc[p] - acc[q] || (p < q ? -1 : 1))[0];
      assignment.set(c.index, ph);
      acc[ph] += c.currentA;
    }

    // Etapa 2 — busca local: mover 1 circuito p/ outra fase se
    // reduzir o spread (estritamente). Primeira melhoria por passada.
    for (let pass = 0; pass < MAX_LOCAL_SEARCH_PASSES; pass++) {
      let improvedPass = false;
      for (const c of sorted) {
        const cur = assignment.get(c.index);
        for (const ph of phases) {
          if (ph === cur) continue;
          const trial = { ...acc };
          trial[cur] -= c.currentA;
          trial[ph] += c.currentA;
          if (spreadOf(trial, phases) < spreadOf(acc, phases) - 1e-9) {
            assignment.set(c.index, ph);
            acc[cur] -= c.currentA;
            acc[ph] += c.currentA;
            improvedPass = true;
            break;
          }
        }
        if (improvedPass) break;
      }
      if (!improvedPass) break;
    }

    // Movimentos: apenas circuitos cuja fase sugerida difere da atual
    const moves = [];
    for (const c of movable) {
      const to = assignment.get(c.index);
      if (to && to !== c.phases[0]) moves.push(moveRecord(c, to));
    }
    return finalize(loadsArr, site, before, moves);
  }

  function moveRecord(c, toPhase) {
    return {
      index: c.index,
      description: c.load.name || c.load.description || `Circuito ${c.index + 1}`,
      fromPhase: c.phases[0],
      toPhase,
      fromWiring: c.wiringType,
      toWiring: WT_OF_PHASE[toPhase],
      currentA: round2(c.currentA)
    };
  }

  /** Monta o resultado final com simulação DEPOIS (sem mutar a entrada). */
  function finalize(loadsArr, site, before, moves) {
    const moved = new Map(moves.map(m => [m.index, m.toWiring]));
    const simulated = loadsArr.map((l, i) =>
      moved.has(i) ? { ...l, wiringType: moved.get(i) } : l);
    const after = analyze(simulated, site);
    return {
      before,
      after,
      moves,
      improved: after.score > before.score,
      scoreDelta: after.score - before.score,
      /** Aplica os movimentos sugeridos ao array original (opt-in). */
      applyTo(target) {
        for (const m of moves) if (target[m.index]) target[m.index].wiringType = m.toWiring;
        return target;
      }
    };
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  return {
    THRESHOLDS: { GRADE_THRESHOLDS, NEUTRAL_PENALTY_WEIGHT },
    availablePhases,
    circuitCurrents,
    neutralCurrent,
    imbalancePct,
    balanceScore,
    gradeOf,
    analyze,
    optimize
  };
});
