/* ================================================================
 * EasyEletric — Motor de Aterramento e Equipotencialização
 * NBR 5410 §4.2.2 / §5.4 / §6.4 — esquemas TT, TN-S, TN-C-S, IT
 * ================================================================
 *
 * Módulo independente e SEM DOM: navegador (global `EEGrounding`)
 * e Node.js.
 *
 * Responsabilidades:
 *  - Caracterização dos esquemas de aterramento (TT, TN-S, TN-C-S,
 *    IT) com requisitos e restrições de cada um;
 *  - Dimensionamento do condutor de proteção PE (Tabela 58) e do
 *    condutor de aterramento;
 *  - Recomendação de eletrodo de aterramento (hastes, anel);
 *  - Equipotencialização principal (BEP) e suplementar;
 *  - Requisitos de DR por esquema (TT: obrigatório);
 *  - Validação de restrições (PEN exige S ≥ 10 mm²; seccionamento
 *    do PEN proibido, etc.).
 *
 * Referências:
 *  - NBR 5410 §4.2.2 (esquemas), §5.1.2.2.4 (PEN), §5.4.3.1
 *    (eletrodo), §6.4.2.1 (BEP), Tabela 58 (seção do PE);
 *  - IEC 60364-5-54 (aterramento e condutores de proteção).
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("../nbr5410_engine.js"));
  } else {
    root.EEGrounding = factory(root.NBR5410);
  }
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  // Esquemas suportados e suas características normativas
  const SCHEMES = {
    "TT": {
      name: "TT",
      description: "neutro aterrado na fonte; massas aterradas em eletrodo próprio da edificação, independente do da fonte",
      rcdMandatory: true,
      rcdReason: "a impedância do laço de falta (dois eletrodos em série) é alta demais para o disjuntor atuar — o DR é o único seccionamento automático viável",
      typical: "padrão de entrada residencial urbana no Brasil (concessionária aterra o neutro; consumidor aterra as massas)",
      reference: "NBR 5410 §4.2.2.4 / §5.1.2.2.4.2"
    },
    "TN-S": {
      name: "TN-S",
      description: "neutro (N) e proteção (PE) separados desde a fonte/origem — 5 condutores em trifásico",
      rcdMandatory: false,
      rcdReason: "laço de falta metálico de baixa impedância — o disjuntor pode seccionar; DR 30 mA continua obrigatório nos circuitos da §5.1.3.2.2",
      typical: "instalações comerciais/industriais com transformador próprio",
      reference: "NBR 5410 §4.2.2.2"
    },
    "TN-C-S": {
      name: "TN-C-S",
      description: "PEN combinado da fonte até a entrada (TN-C) e separado em N + PE a partir do ponto de entrega (TN-S interno)",
      rcdMandatory: false,
      rcdReason: "após a separação N/PE o comportamento interno é TN-S; DR 30 mA obrigatório nos circuitos da §5.1.3.2.2 (a jusante da separação)",
      typical: "prática comum de entrada brasileira: PEN da concessionária, separado no quadro de medição",
      reference: "NBR 5410 §4.2.2.3 / §5.1.2.2.4.1"
    },
    "IT": {
      name: "IT",
      description: "fonte isolada da terra (ou aterrada por impedância elevada); massas aterradas — primeira falta não desliga",
      rcdMandatory: false,
      rcdReason: "primeira falta gera corrente ínfima — exige supervisor de isolamento (DSI) com alarme; segunda falta deve ser seccionada como TN ou TT",
      typical: "hospitais (grupo 2), processos que não admitem interrupção",
      reference: "NBR 5410 §4.2.2.5 / §5.1.2.2.4.3"
    }
  };

  // Seção mínima do condutor PEN — NBR 5410 §5.1.2.2.4.1
  const PEN_MIN_SECTION_CU = 10;

  // Seção mínima do condutor de aterramento (eletrodo → BEP),
  // cobre protegido contra corrosão/mecânica — IEC 60364-5-54 Tab. 54.1
  const EARTHING_CONDUCTOR_MIN_CU = 6;

  // Equipotencialização principal: ≥ metade do maior PE, mín. 6 mm²,
  // máx. exigível 25 mm² (cobre) — NBR 5410 §6.4.2.1
  const MAIN_BONDING = { minMm2: 6, maxRequiredMm2: 25, factor: 0.5 };

  // Equipotencialização suplementar: ≥ metade do PE do circuito,
  // mín. 2,5 mm² protegido / 4 mm² não protegido mecanicamente
  const SUPPLEMENTARY_BONDING = { minProtectedMm2: 2.5, minUnprotectedMm2: 4 };

  // Eletrodo recomendado: hastes de aço cobreado em anel/linha
  const ELECTRODE_DEFAULTS = {
    rodLengthM: 2.4, rodDiameterMm: 15.875 /* 5/8" */, minRods: 3,
    spacingM: 3, targetResistanceOhm: 10
  };

  /** Dados normativos do esquema (TT, TN-S, TN-C-S, IT). */
  function schemeInfo(scheme) {
    return SCHEMES[scheme] || SCHEMES["TT"];
  }

  /**
   * Seção do condutor PE para uma seção de fase (Tabela 58) —
   * delega ao motor NBR 5410 (fonte única) e arredonda para a
   * seção comercial superior quando S/2 não é comercial.
   */
  function peSectionFor(phaseMm2) {
    const raw = E.peSection(phaseMm2);
    const commercial = E.TABLES.SECTIONS.find(s => s >= raw);
    return commercial || raw;
  }

  /**
   * Dimensiona o sistema de aterramento da instalação.
   *
   * @param opts {scheme, feederPhaseMm2, hasWetAreas?, hasLPS?}
   * @returns {scheme, pe, earthingConductor, electrode, bonding,
   *           rcd, checks[], decisions[]}
   */
  function designGroundingSystem(opts) {
    const decisions = [];
    const checks = [];
    const scheme = schemeInfo(opts.scheme || "TT");
    const feederS = opts.feederPhaseMm2 || 10;

    // 1. Esquema
    decisions.push({
      decision: `Esquema de aterramento ${scheme.name}`,
      reason: `${scheme.description}. Uso típico: ${scheme.typical}`,
      reference: scheme.reference
    });

    // 2. Condutor PE do alimentador (Tabela 58)
    const peMm2 = peSectionFor(feederS);
    decisions.push({
      decision: `Condutor PE ${peMm2} mm² (cobre)`,
      reason: `Tabela 58 para fase de ${feederS} mm²: ${feederS <= 16 ? "PE = fase" : feederS <= 35 ? "PE = 16 mm²" : "PE = fase/2 (próxima seção comercial)"}`,
      reference: "NBR 5410 Tabela 58"
    });

    // 3. Condutor de aterramento (eletrodo → BEP)
    const earthingMm2 = Math.max(EARTHING_CONDUCTOR_MIN_CU, Math.min(peMm2, 50));
    decisions.push({
      decision: `Condutor de aterramento ${earthingMm2} mm² (cobre)`,
      reason: "acompanha o PE limitado a 50 mm²; mínimo 6 mm² (protegido contra corrosão e danos mecânicos)",
      reference: "IEC 60364-5-54 Tabela 54.1"
    });

    // 4. Eletrodo
    const electrode = {
      type: "hastes de aço cobreado em linha ou anel",
      ...ELECTRODE_DEFAULTS,
      note: opts.hasLPS
        ? "com SPDA: eletrodo único integrado (anel) — SPDA e BT no MESMO eletrodo, interligados no BEP"
        : "preferir anel nas edificações novas (§6.4.1.1); hastes alinhadas aceitáveis em reforma"
    };
    decisions.push({
      decision: `Eletrodo: ≥ ${electrode.minRods} hastes ${electrode.rodLengthM} m (Ø 5/8"), espaçamento ≥ ${electrode.spacingM} m`,
      reason: `meta de resistência ≤ ${electrode.targetResistanceOhm} Ω (prática p/ coordenação com DR e DPS); a NBR 5410 não fixa valor, prioriza a equipotencialização`,
      reference: "NBR 5410 §5.4.3.1 / §6.4.1.1"
    });

    // 5. Equipotencialização principal (BEP)
    const mainBondingMm2 = Math.min(
      Math.max(MAIN_BONDING.minMm2, Math.ceil(peMm2 * MAIN_BONDING.factor)),
      MAIN_BONDING.maxRequiredMm2
    );
    const bonding = {
      mainMm2: mainBondingMm2,
      supplementary: { ...SUPPLEMENTARY_BONDING },
      elements: [
        "tubulações metálicas de água e gás na entrada",
        "estruturas metálicas da edificação",
        "blindagens/armações de cabos de energia e sinal",
        "condutor PEN/PE de entrada", "eletrodo de aterramento"
      ]
    };
    decisions.push({
      decision: `Equipotencialização principal ${mainBondingMm2} mm²`,
      reason: `≥ metade do PE de entrada (${peMm2}/2 mm²), mínimo 6 mm², máximo exigível 25 mm² (cobre)`,
      reference: "NBR 5410 §6.4.2.1"
    });
    if (opts.hasWetAreas) {
      decisions.push({
        decision: `Equipotencialização suplementar nas áreas molhadas (≥ ${SUPPLEMENTARY_BONDING.minProtectedMm2} mm²)`,
        reason: "banheiros/cozinhas: interligar massas e elementos condutivos acessíveis simultaneamente",
        reference: "NBR 5410 §9.1.5"
      });
    }

    // 6. DR por esquema
    const rcd = { mandatory: scheme.rcdMandatory, reason: scheme.rcdReason };
    checks.push({
      id: "gnd-dr", label: "Seccionamento automático do esquema",
      status: "PASS",
      detail: scheme.rcdMandatory
        ? "TT: DR obrigatório como proteção contra contatos indiretos"
        : `${scheme.name}: disjuntor pode seccionar (laço metálico); DR 30 mA mantido onde a §5.1.3.2.2 exige`
    });

    // 7. Restrições do PEN (TN-C-S)
    if (scheme.name === "TN-C-S") {
      const penOk = feederS >= PEN_MIN_SECTION_CU;
      checks.push({
        id: "gnd-pen", label: "Seção mínima do PEN (trecho TN-C)",
        status: penOk ? "PASS" : "ERROR",
        detail: `PEN exige S ≥ ${PEN_MIN_SECTION_CU} mm² (cobre); alimentador com ${feederS} mm²${penOk ? "" : " — INSUFICIENTE: usar TN-S ou aumentar a seção"}`
      });
      checks.push({
        id: "gnd-pen-secc", label: "Dispositivos no PEN",
        status: "PASS",
        detail: "o PEN NÃO pode ser seccionado nem conter dispositivo de proteção; separação N/PE única, no ponto de entrega"
      });
    }
    if (scheme.name === "IT") {
      checks.push({
        id: "gnd-dsi", label: "Supervisor de isolamento (IT)",
        status: "WARN",
        detail: "esquema IT exige DSI com alarme sonoro/visual para a primeira falta (§5.1.2.2.4.3) — prever no projeto"
      });
    }

    return {
      scheme: scheme.name, schemeDetail: scheme,
      pe: { sectionMm2: peMm2, material: "cobre" },
      earthingConductor: { sectionMm2: earthingMm2, material: "cobre" },
      electrode, bonding, rcd, checks, decisions
    };
  }

  return {
    TABLES: {
      SCHEMES, PEN_MIN_SECTION_CU, EARTHING_CONDUCTOR_MIN_CU,
      MAIN_BONDING, SUPPLEMENTARY_BONDING, ELECTRODE_DEFAULTS
    },
    schemeInfo, peSectionFor, designGroundingSystem
  };
});
