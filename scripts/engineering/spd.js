/* ================================================================
 * EasyEletric — Motor de Seleção de DPS (Dispositivo de Proteção
 * contra Surtos) — NBR 5410 §6.3.5 / IEC 61643-11 / IEC 62305
 * ================================================================
 *
 * Módulo independente e SEM DOM: navegador (global `EESpd`) e Node.
 *
 * Responsabilidades:
 *  - Classe do DPS (Tipo I / II / III) por exposição da edificação
 *    (SPDA/para-raios, entrada aérea/subterrânea, rural/urbana);
 *  - Uc (máxima tensão de operação contínua) por tensão do sistema
 *    e esquema de aterramento (TT exige Uc maior entre N-PE);
 *  - Parâmetros de corrente: Iimp (Tipo I, onda 10/350) e
 *    In/Imax (Tipo II, onda 8/20);
 *  - Up (nível de proteção) compatível com a suportabilidade dos
 *    equipamentos (categorias de suportabilidade da NBR 5410);
 *  - Modo de conexão: CT1 (modo comum) para TN, CT2 ("3+1"/"1+1",
 *    N-PE por centelhador) para TT;
 *  - Recomendação de DPS Tipo III em pontos de uso sensíveis.
 *
 * Referências:
 *  - NBR 5410 §6.3.5.2 (obrigatoriedade em linha aérea/região com
 *    densidade de descargas > 25/km²·ano);
 *  - IEC 61643-11 / NBR IEC 61643-1 (classes de ensaio);
 *  - IEC 62305-4 (zonas de proteção ZPR);
 *  - NBR 5410 Tabela 31 (suportabilidade a impulso — categorias).
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.EESpd = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Uc mínimo comercial (V) por tensão fase-neutro do sistema.
  // Regra IEC 61643-11: Uc ≥ 1,1·U0 em TN; em TT, o DPS entre
  // fase e neutro vê U0, mas o modo N-PE deve suportar sobretensões
  // temporárias (centelhador ≥ 255 V típico). Valores comerciais
  // brasileiros: 175 V (127 V), 275 V (220 V), 460 V (380 V F-F).
  const UC_BY_U0 = [
    { maxU0: 127, ucV: 175 },
    { maxU0: 220, ucV: 275 },
    { maxU0: 254, ucV: 320 },
    { maxU0: Infinity, ucV: 460 }
  ];

  // Suportabilidade a impulso dos equipamentos — NBR 5410 Tab. 31
  // (categoria II: equipamentos de utilização; sistema 220/380 V).
  // Up do DPS de entrada deve ficar abaixo da categoria II.
  const UP_LIMIT_KV = { 127: 1.5, 220: 2.5, 380: 4.0 };

  // Parâmetros mínimos usuais por classe (BT residencial/comercial)
  const CLASS_PARAMS = {
    I: { iimpKA: 12.5, waveform: "10/350 µs", inKA: 25, imaxKA: 50 },
    II: { inKA: 20, imaxKA: 40, waveform: "8/20 µs" },
    III: { uocKV: 6, waveform: "combinada 1,2/50–8/20 µs" }
  };

  /** Uc comercial mínimo para a tensão fase-neutro U0. */
  function ucFor(U0) {
    for (const r of UC_BY_U0) if (U0 <= r.maxU0) return r.ucV;
    return UC_BY_U0[UC_BY_U0.length - 1].ucV;
  }

  /**
   * Classe do DPS de ENTRADA pela exposição da edificação.
   *
   *  Tipo I  — edificação com SPDA (para-raios) ou alimentada por
   *            linha aérea exposta em região de alta densidade de
   *            descargas: precisa escoar corrente parcial do raio;
   *  Tipo II — situação padrão de entrada (linha aérea urbana ou
   *            subterrânea): surtos induzidos e manobra.
   */
  function entranceClass({ hasLPS = false, serviceEntry = "aerea", highExposure = false }) {
    if (hasLPS || (serviceEntry === "aerea" && highExposure)) return "I";
    return "II";
  }

  /**
   * Seleciona o DPS de entrada do quadro.
   *
   * @param opts {Vfn, supplyType, groundingScheme, hasLPS,
   *              serviceEntry ("aerea"|"subterranea"), highExposure}
   * @returns {class, ucV, upKV, params, modes, poles, connection,
   *           required, decisions[]}
   */
  function selectEntranceSPD(opts) {
    const decisions = [];
    const Vfn = opts.Vfn || 127;
    const scheme = opts.groundingScheme || "TT";
    const supplyType = opts.supplyType || "trifasico";
    const serviceEntry = opts.serviceEntry || "aerea";

    // 1. Obrigatoriedade — §6.3.5.2
    const required = !!(serviceEntry === "aerea" || opts.hasLPS || opts.highExposure);
    decisions.push({
      decision: required ? "DPS obrigatório na entrada" : "DPS recomendado (não obrigatório)",
      reason: opts.hasLPS ? "edificação com SPDA — corrente parcial de raio entra pela equipotencialização"
        : serviceEntry === "aerea" ? "alimentação por linha aérea — sujeita a surtos atmosféricos conduzidos"
        : "entrada subterrânea sem SPDA — exposição reduzida, proteção contra surtos de manobra ainda recomendada",
      reference: "NBR 5410 §6.3.5.2"
    });

    // 2. Classe
    const cls = entranceClass({
      hasLPS: opts.hasLPS, serviceEntry, highExposure: opts.highExposure
    });
    decisions.push({
      decision: `DPS Tipo ${cls === "I" ? "I (ensaio classe I)" : "II (ensaio classe II)"}`,
      reason: cls === "I"
        ? "deve suportar corrente parcial do raio (onda 10/350 µs) — SPDA presente ou linha aérea muito exposta"
        : "entrada padrão — surtos induzidos e de manobra (onda 8/20 µs)",
      rejected: cls === "I"
        ? [{ option: "Tipo II", reason: "não suporta corrente parcial de raio (10/350 µs) — subdimensionado para edificação com SPDA" }]
        : [{ option: "Tipo I", reason: "superdimensionado sem SPDA/exposição direta — custo injustificado" }],
      reference: "IEC 61643-11 / IEC 62305-4"
    });

    // 3. Uc pelo sistema e esquema de aterramento
    const ucV = ucFor(Vfn);
    decisions.push({
      decision: `Uc ≥ ${ucV} V`,
      reason: `Uc ≥ 1,1·U0 = ${Math.round(1.1 * Vfn)} V (U0=${Vfn} V) — menor Uc comercial que atende${scheme === "TT" ? "; em TT o modo N-PE usa centelhador com suportabilidade maior" : ""}`,
      reference: "IEC 61643-11"
    });

    // 4. Up compatível com a suportabilidade (Tab. 31, categoria II)
    const upKV = UP_LIMIT_KV[Vfn] || UP_LIMIT_KV[220];
    decisions.push({
      decision: `Up ≤ ${upKV} kV`,
      reason: "nível de proteção abaixo da suportabilidade a impulso dos equipamentos de utilização (categoria II)",
      reference: "NBR 5410 Tabela 31"
    });

    // 5. Conexão e polos: TT usa "3+1"/"1+1" (N-PE por centelhador)
    const phases = supplyType === "trifasico" ? 3 : supplyType === "bifasico" ? 2 : 1;
    const connection = scheme === "TT" ? `${phases}+1 (N-PE por centelhador)` : "modo comum (CT1)";
    const poles = phases + 1; // fases + neutro
    decisions.push({
      decision: `Conexão ${connection}, ${poles} módulos`,
      reason: scheme === "TT"
        ? "em TT o neutro não é equipotencializado ao PE na edificação — o modo N-PE exige centelhador para evitar corrente permanente"
        : "em TN o neutro está referenciado ao PE — varistores em modo comum são suficientes",
      reference: "IEC 61643-12 §6.2"
    });

    return {
      class: cls, required, ucV, upKV,
      params: { ...CLASS_PARAMS[cls] },
      poles, connection,
      standard: "IEC 61643-11",
      decisions
    };
  }

  /**
   * Recomenda DPS Tipo III (proteção fina) nos pontos de uso quando
   * a distância entre o DPS de entrada e o equipamento sensível
   * ultrapassa ~10 m (oscilações reflexivas dobram a tensão residual).
   */
  function recommendPointOfUseSPD({ distanceFromBoardM = 0, sensitiveLoad = false }) {
    const recommended = sensitiveLoad && distanceFromBoardM > 10;
    return {
      recommended,
      class: "III",
      params: { ...CLASS_PARAMS.III },
      reason: recommended
        ? `equipamento sensível a ${distanceFromBoardM} m do quadro — acima de 10 m a tensão residual pode dobrar por reflexão; DPS Tipo III no ponto de uso`
        : "dispensável — equipamento próximo ao quadro ou não sensível",
      reference: "IEC 61643-12 (distância de proteção)"
    };
  }

  return {
    TABLES: { UC_BY_U0, UP_LIMIT_KV, CLASS_PARAMS },
    ucFor, entranceClass,
    selectEntranceSPD, recommendPointOfUseSPD
  };
});
