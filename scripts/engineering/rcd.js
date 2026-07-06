/* ================================================================
 * EasyEletric — Motor de Seleção de DR (Dispositivo Diferencial
 * Residual) — NBR 5410 / IEC 61008-1 / IEC 62423
 * ================================================================
 *
 * Módulo independente e SEM DOM: navegador (global `EERcd`) e Node.
 *
 * Responsabilidades:
 *  - Obrigatoriedade de proteção adicional 30 mA por circuito
 *    (NBR 5410 §5.1.3.2.2: tomadas, áreas molhadas, chuveiros,
 *    circuitos externos);
 *  - Sensibilidade: 30 mA (pessoas) / 300 mA (incêndio);
 *  - TIPO do DR conforme a natureza da corrente de fuga
 *    (IEC 62423): AC senoidal | A pulsante | F multifrequência
 *    (inversores monofásicos) | B componentes contínuas (VFD
 *    trifásico, carregadores veiculares);
 *  - Corrente nominal comercial ≥ In do disjuntor a montante;
 *  - Seletividade do DR geral (tipo S, 300 mA) quando há DRs
 *    de 30 mA a jusante;
 *  - Explicação de engenharia de cada decisão.
 *
 * Referências:
 *  - NBR 5410 §5.1.3.2.2 (proteção adicional 30 mA), §5.4.3.5
 *    (proteção contra incêndio 300/500 mA);
 *  - IEC 61008-1 (DR: correntes nominais, tipo S);
 *  - IEC 62423 (tipos F e B);
 *  - IEC 60364-4-41 (esquema TT exige DR).
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("../nbr5410_engine.js"));
  } else {
    root.EERcd = factory(root.NBR5410);
  }
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  // Correntes nominais comerciais de DR/IDR (IEC 61008-1) —
  // fonte única: tabela do motor NBR 5410.
  const RCD_RATINGS = E.TABLES.RCD_RATINGS;

  // Sensibilidades padronizadas (mA)
  const SENSITIVITIES = [30, 100, 300, 500];

  // Tipos de DR (IEC 62423) — do mais simples ao mais completo
  const RCD_TYPES = ["AC", "A", "F", "B"];

  // Circuitos que EXIGEM proteção adicional 30 mA — §5.1.3.2.2:
  // tomadas de uso geral, áreas molhadas (chuveiro/aquecimento),
  // climatização (unidades com tomada/manutenção) e uso geral.
  const REQUIRES_30MA = {
    tomadas: true, aquecimento: true, climatizacao: true,
    uso_geral: true, motor: true, iluminacao: false
  };

  // Natureza típica da corrente de fuga por tipo de carga:
  // cargas eletrônicas modernas geram fuga pulsante (tipo A);
  // inversores monofásicos (ar-condicionado inverter, lavadoras)
  // geram componentes multifrequência (tipo F).
  const TYPE_BY_LOAD = {
    iluminacao: "A",     // drivers LED / reatores eletrônicos
    tomadas: "A",        // eletrônicos conectados às TUGs
    uso_geral: "A",
    aquecimento: "AC",   // resistiva pura (chuveiro/torneira)
    climatizacao: "F",   // inverter monofásico
    motor: "A"           // partida direta residencial
  };

  // Hierarquia de compatibilidade: um tipo cobre os anteriores
  const TYPE_RANK = { AC: 0, A: 1, F: 2, B: 3 };

  /** Tipo mais exigente entre dois tipos de DR. */
  function strictestType(a, b) {
    return TYPE_RANK[a] >= TYPE_RANK[b] ? a : b;
  }

  /** Menor corrente nominal comercial de DR ≥ In do disjuntor. */
  function ratingFor(breakerIn) {
    return RCD_RATINGS.find(r => r >= breakerIn) || RCD_RATINGS[RCD_RATINGS.length - 1];
  }

  /**
   * Seleciona o DR de um circuito terminal.
   *
   * @param circuit {type, breakerIn, wiringType, hasVFD?, isOutdoor?,
   *                 isWetArea?}
   * @returns {required, sensitivityMa, type, ratingA, poles,
   *           purpose, decisions[]}
   */
  function selectCircuitRCD(circuit) {
    const decisions = [];
    const loadType = circuit.type || "uso_geral";
    const wt = circuit.wiringType || "A+N";
    const system = E.systemOfWiring(wt);

    // 1. Obrigatoriedade e sensibilidade
    const wet = circuit.isWetArea || loadType === "aquecimento";
    const outdoor = !!circuit.isOutdoor;
    const required = REQUIRES_30MA[loadType] || wet || outdoor;
    const sensitivityMa = required ? 30 : 300;
    decisions.push({
      decision: required ? "Proteção adicional DR 30 mA obrigatória" : "DR 30 mA dispensável no circuito",
      reason: required
        ? (wet ? "área molhada / aquecimento de água"
          : outdoor ? "circuito em área externa"
          : "tomadas de uso geral / cargas com contato direto do usuário")
        : "iluminação fixa no teto — coberta pelo DR geral 300 mA (proteção contra incêndio)",
      reference: "NBR 5410 §5.1.3.2.2"
    });

    // 2. Tipo (IEC 62423) pela natureza da fuga
    let type = TYPE_BY_LOAD[loadType] || "A";
    if (circuit.hasVFD && system === "tri") type = "B";
    else if (circuit.hasVFD) type = strictestType(type, "F");
    decisions.push({
      decision: `DR tipo ${type}`,
      reason: type === "B" ? "inversor de frequência trifásico — fuga com componente contínua alisada"
        : type === "F" ? "carga com inversor monofásico — fuga multifrequência"
        : type === "A" ? "cargas eletrônicas — fuga pulsante unidirecional"
        : "carga resistiva pura — fuga senoidal",
      rejected: RCD_TYPES.filter(t => TYPE_RANK[t] < TYPE_RANK[type])
        .map(t => ({ option: `Tipo ${t}`, reason: "não detecta a forma de onda de fuga desta carga" })),
      reference: "IEC 62423 / IEC 60755"
    });

    // 3. Corrente nominal ≥ In do disjuntor (o DR não tem proteção
    //    térmica própria — deve suportar a corrente que o disjuntor
    //    a montante deixa passar).
    const ratingA = ratingFor(circuit.breakerIn || 0);
    decisions.push({
      decision: `DR ${ratingA} A`,
      reason: `menor corrente nominal comercial ≥ In do disjuntor (${circuit.breakerIn} A) — o DR não possui disparo térmico próprio`,
      rejected: RCD_RATINGS.filter(r => r < ratingA)
        .map(r => ({ option: `${r} A`, reason: `abaixo do In do disjuntor (${circuit.breakerIn} A)` })),
      reference: "IEC 61008-1"
    });

    const poles = system === "tri" ? 4 : 2;
    return {
      required, sensitivityMa, type, ratingA, poles,
      purpose: sensitivityMa === 30 ? "proteção de pessoas (contato direto/indireto)" : "proteção contra incêndio",
      decisions
    };
  }

  /**
   * Seleciona o DR GERAL do quadro com seletividade.
   *
   * Se os circuitos terminais têm DR 30 mA próprios, o geral deve
   * ser SELETIVO (tipo S, 300 mA) para não disparar junto.
   * Se o quadro usa um único DR geral para proteção de pessoas
   * (prática residencial econômica), o geral é 30 mA instantâneo —
   * sem seletividade (desligamento total em qualquer fuga).
   *
   * @param board {mainIn, supplyType, branchesHaveRcd, circuits[]}
   */
  function selectMainRCD(board) {
    const decisions = [];
    const branches = board.circuits || [];
    const branchesHaveRcd = board.branchesHaveRcd ?? false;

    // Tipo do geral: o mais exigente entre os circuitos protegidos
    let type = "A"; // mínimo recomendado hoje (cargas eletrônicas onipresentes)
    for (const c of branches) {
      const t = TYPE_BY_LOAD[c.type] || "A";
      type = strictestType(type, t);
      if (c.hasVFD && E.systemOfWiring(c.wiringType || "A+N") === "tri") type = "B";
    }

    const selective = branchesHaveRcd;
    const sensitivityMa = selective ? 300 : 30;
    decisions.push({
      decision: selective ? "DR geral seletivo (tipo S) 300 mA" : "DR geral 30 mA",
      reason: selective
        ? "circuitos terminais possuem DR 30 mA — o geral seletivo (retardo ≥ 40 ms) garante que só o DR do circuito com fuga dispare"
        : "único DR da instalação — assume a proteção adicional de pessoas (30 mA) de todos os circuitos",
      rejected: selective
        ? [{ option: "DR geral 30 mA instantâneo", reason: "dispararia simultaneamente com os DRs terminais — sem seletividade, desligamento total desnecessário" }]
        : [{ option: "DR geral 300 mA", reason: "sem DRs terminais, deixaria os circuitos de tomadas sem a proteção adicional de 30 mA exigida pela §5.1.3.2.2" }],
      reference: "IEC 61008-1 (tipo S) / NBR 5410 §5.1.3.2.2"
    });

    const ratingA = ratingFor(board.mainIn || 0);
    decisions.push({
      decision: `DR geral ${ratingA} A`,
      reason: `menor corrente nominal comercial ≥ In do disjuntor geral (${board.mainIn} A)`,
      reference: "IEC 61008-1"
    });

    const poles = board.supplyType === "trifasico" ? 4
      : board.supplyType === "bifasico" ? 3 : 2;

    return {
      sensitivityMa, type, selective, ratingA, poles,
      purpose: selective ? "proteção contra incêndio + seletividade" : "proteção de pessoas (instalação inteira)",
      decisions
    };
  }

  return {
    TABLES: { RCD_RATINGS, SENSITIVITIES, RCD_TYPES, REQUIRES_30MA, TYPE_BY_LOAD, TYPE_RANK },
    strictestType, ratingFor,
    selectCircuitRCD, selectMainRCD
  };
});
