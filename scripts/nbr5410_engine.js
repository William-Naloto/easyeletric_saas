/* ================================================================
 * EasyEletric — Motor de Cálculo Elétrico NBR 5410:2023 / IEC 60364
 * ================================================================
 *
 * Módulo AUTOCONTIDO e SEM DOM: roda no navegador (global `NBR5410`)
 * e em Node.js (`module.exports`), permitindo testes automatizados.
 *
 * Sequência de engenharia implementada (condutor ANTES do disjuntor):
 *
 *   Carga → Ib (corrente de projeto)
 *        → Método de instalação
 *        → Fatores de correção (Ft × Fg)
 *        → Capacidade corrigida Izc = Iz·Ft·Fg
 *        → Seção mínima (Tabela 47) + capacidade + queda de tensão
 *          ⇒ MENOR condutor que atende TODOS os critérios
 *        → Disjuntor: In comercial com Ib ≤ In ≤ Izc (§5.3.4), com
 *          ESTRATÉGIA por tipo de circuito (ver nota de engenharia
 *          abaixo) — nunca In > Izc (o condutor SEMPRE governa o
 *          disjuntor, nunca a carga instantânea isoladamente)
 *        → Verificação de curto-circuito (capacidade de interrupção)
 *        → DR / DPS
 *        → Validação final (PASS / WARN / ERROR)
 *
 * NOTA DE ENGENHARIA — critério de escolha do In dentro da janela
 * [Ib, Izc] (revisão v3.6, ver CHANGELOG):
 *   A NBR 5410 §5.3.4 exige apenas Ib ≤ In ≤ Iz; a norma NÃO manda
 *   usar o MENOR In da janela. Adotar sempre o menor In (In ≈ Ib)
 *   "trava" o circuito na carga do dia da obra: como a seção mínima
 *   de 2,5 mm² já é obrigatória por tabela (independe da carga), um
 *   disjuntor colado no Ib de hoje não economiza cobre nenhum — só
 *   descarta, de graça, a folga de amperagem que o condutor já tem.
 *   Estratégia adotada:
 *     • Circuitos de TOMADA (tomadas/uso_geral, inclusive TUE como
 *       geladeira/micro-ondas): disjuntor = MAIOR In comercial que
 *       ainda respeita In ≤ Izc, limitado à corrente nominal padrão
 *       da tomada/plugue NBR 14136 (10 A ou 20 A — parametrizável
 *       em site.socketMaxA, default 20 A). Preserva reserva técnica
 *       para troca de aparelho sem obra nova, sem violar a proteção
 *       do condutor nem exceder a tomada instalada.
 *     • Circuitos DEDICADOS de equipamento fixo (iluminação,
 *       climatização, aquecimento/chuveiro, motor): disjuntor = MENOR
 *       In ≥ Ib (comportamento original) — aqui o In deve refletir a
 *       placa do equipamento, não uma reserva especulativa.
 *   Em ambos os casos: In ≤ Izc é absoluto (o condutor protege o
 *   limite superior; a carga só define o limite inferior).
 *
 * Referências:
 *  - ABNT NBR 5410:2023 (Tabelas 36, 37, 40, 42, 47, 58; §5.3.4,
 *    §5.1.3.2.2, §6.2.7)
 *  - IEC 60364-5-52 (capacidade de condução e fatores de correção)
 *  - IEC 60898-1 / NBR NM 60898 (disjuntores: curvas B/C, Icn,
 *    I2 = 1,45·In)
 *  - Fatores de demanda residenciais: prática consagrada de
 *    concessionárias brasileiras (ex.: CEMIG ND-5.1, CPFL GED) e
 *    literatura (H. Creder, "Instalações Elétricas").
 *
 * Todas as premissas de engenharia estão documentadas em
 * docs/metodologia_calculo_nbr5410.md.
 * ================================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NBR5410 = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SQRT3 = Math.sqrt(3);

  /* ==============================================================
   * 1. TABELAS COMERCIAIS E CONSTANTES NORMATIVAS
   * ============================================================== */

  // Seções comerciais de condutores de cobre (mm²)
  const SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];

  // Correntes nominais comerciais de disjuntores (IEC 60898-1)
  const MCB_RATINGS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];

  // Disjuntores gerais / de entrada (inclui 160 A caixa moldada)
  const MAIN_RATINGS = [25, 32, 40, 50, 63, 80, 100, 125, 160];

  // Correntes nominais comerciais de DR/IDR (IEC 61008-1)
  const RCD_RATINGS = [25, 40, 63, 80, 100, 125];

  // Capacidades de interrupção padronizadas de MCB (A) — NBR NM 60898
  const BREAKING_CAPACITIES = [3000, 4500, 6000, 10000];

  // Capacidade de condução de corrente (A) — cobre.
  // NBR 5410 Tabela 36 (PVC 70 °C) e Tabela 37 (EPR/XLPE 90 °C),
  // por método de instalação e nº de condutores carregados
  // (2 = F+N ou F+F; 3 = trifásico).
  const AMPACITY = {
    PVC: {
      B1: { 2: { 1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 101, 35: 125, 50: 151, 70: 192, 95: 232, 120: 269 },
            3: { 1.5: 15.5, 2.5: 21, 4: 28, 6: 36, 10: 50, 16: 68, 25: 89, 35: 110, 50: 134, 70: 171, 95: 207, 120: 239 } },
      B2: { 2: { 1.5: 16.5, 2.5: 23, 4: 30, 6: 38, 10: 52, 16: 69, 25: 90, 35: 111, 50: 133, 70: 168, 95: 201, 120: 232 },
            3: { 1.5: 15, 2.5: 20, 4: 27, 6: 34, 10: 46, 16: 62, 25: 80, 35: 99, 50: 118, 70: 149, 95: 179, 120: 206 } },
      C:  { 2: { 1.5: 19.5, 2.5: 27, 4: 36, 6: 46, 10: 63, 16: 85, 25: 112, 35: 138, 50: 168, 70: 213, 95: 258, 120: 299 },
            3: { 1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 96, 35: 119, 50: 144, 70: 184, 95: 223, 120: 259 } },
      D:  { 2: { 1.5: 22, 2.5: 29, 4: 38, 6: 47, 10: 63, 16: 81, 25: 104, 35: 125, 50: 148, 70: 183, 95: 216, 120: 246 },
            3: { 1.5: 18, 2.5: 24, 4: 31, 6: 39, 10: 52, 16: 67, 25: 86, 35: 103, 50: 122, 70: 151, 95: 179, 120: 203 } },
      E:  { 2: { 1.5: 22, 2.5: 30, 4: 40, 6: 51, 10: 70, 16: 94, 25: 119, 35: 148, 50: 180, 70: 232, 95: 282, 120: 328 },
            3: { 1.5: 18.5, 2.5: 25, 4: 34, 6: 43, 10: 60, 16: 80, 25: 101, 35: 126, 50: 153, 70: 196, 95: 238, 120: 276 } }
    },
    XLPE: {
      B1: { 2: { 1.5: 23, 2.5: 31, 4: 42, 6: 54, 10: 75, 16: 100, 25: 133, 35: 164, 50: 198, 70: 253, 95: 306, 120: 354 },
            3: { 1.5: 20, 2.5: 28, 4: 37, 6: 48, 10: 66, 16: 88, 25: 117, 35: 144, 50: 175, 70: 222, 95: 269, 120: 312 } },
      B2: { 2: { 1.5: 22, 2.5: 30, 4: 40, 6: 51, 10: 69, 16: 91, 25: 119, 35: 146, 50: 175, 70: 221, 95: 265, 120: 305 },
            3: { 1.5: 19.5, 2.5: 26, 4: 35, 6: 44, 10: 60, 16: 80, 25: 105, 35: 128, 50: 154, 70: 194, 95: 233, 120: 268 } },
      C:  { 2: { 1.5: 24, 2.5: 33, 4: 45, 6: 58, 10: 80, 16: 107, 25: 138, 35: 171, 50: 209, 70: 269, 95: 328, 120: 382 },
            3: { 1.5: 22, 2.5: 30, 4: 40, 6: 52, 10: 71, 16: 96, 25: 119, 35: 147, 50: 179, 70: 229, 95: 278, 120: 322 } },
      D:  { 2: { 1.5: 26, 2.5: 34, 4: 44, 6: 56, 10: 73, 16: 95, 25: 121, 35: 146, 50: 173, 70: 213, 95: 252, 120: 287 },
            3: { 1.5: 22, 2.5: 29, 4: 37, 6: 46, 10: 61, 16: 79, 25: 101, 35: 122, 50: 144, 70: 178, 95: 211, 120: 240 } },
      E:  { 2: { 1.5: 26, 2.5: 36, 4: 49, 6: 63, 10: 86, 16: 115, 25: 149, 35: 185, 50: 225, 70: 289, 95: 352, 120: 410 },
            3: { 1.5: 23, 2.5: 32, 4: 42, 6: 54, 10: 75, 16: 100, 25: 127, 35: 158, 50: 192, 70: 246, 95: 298, 120: 346 } }
    }
  };

  // Fator de correção de temperatura ambiente — NBR 5410 Tabela 40.
  // ATENÇÃO: os fatores dependem da isolação (PVC ≠ EPR/XLPE).
  const K_TEMP = {
    PVC:  { 10: 1.22, 15: 1.17, 20: 1.12, 25: 1.06, 30: 1.00, 35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71, 55: 0.61, 60: 0.50 },
    XLPE: { 10: 1.15, 15: 1.12, 20: 1.08, 25: 1.04, 30: 1.00, 35: 0.96, 40: 0.91, 45: 0.87, 50: 0.82, 55: 0.76, 60: 0.71 }
  };

  // Seções mínimas por tipo de circuito — NBR 5410 Tabela 47:
  // iluminação 1,5 mm²; força (TUG/TUE) 2,5 mm².
  const MIN_SECTION = {
    iluminacao: 1.5, tomadas: 2.5, climatizacao: 2.5,
    aquecimento: 2.5, motor: 2.5, uso_geral: 2.5
  };

  // Resistividade do cobre: ρ20 = 0,017241 Ω·mm²/m, α = 0,00393/K.
  // A queda de tensão é avaliada na TEMPERATURA DE OPERAÇÃO do
  // condutor (pior caso): PVC 70 °C, EPR/XLPE 90 °C.
  const RHO_CU_20 = 0.017241;
  const ALPHA_CU = 0.00393;
  const OPERATING_TEMP = { PVC: 70, XLPE: 90 };

  // Reatância indutiva típica de cabos BT em eletroduto (Ω/m).
  // Desprezível em seções pequenas; incluída sempre por rigor.
  const REACTANCE_OHM_M = 0.0001;

  // Limites de queda de tensão — NBR 5410 §6.2.7:
  //  5% quando alimentado pela rede pública de BT;
  //  7% quando alimentado por transformador/geração própria;
  //  4% adotado como padrão para circuitos terminais (prática usual:
  //  reservar ~1% para o alimentador).
  const VOLTAGE_DROP_LIMITS = { finalCircuitDefault: 4, totalGridSupply: 5, totalOwnTransformer: 7 };

  // Constante k da verificação adiabática de curto-circuito
  // (NBR 5410 §5.3.5.4 / IEC 60364-4-43): S ≥ √(I²·t)/k
  const K_ADIABATIC = { PVC: 115, XLPE: 143 };

  // Múltiplo de disparo magnético garantido por curva (IEC 60898-1):
  // curva B dispara com Icc ≥ 5·In; curva C com Icc ≥ 10·In.
  const CURVE_TRIP_MULTIPLE = { B: 5, C: 10, D: 20 };

  /* --------------------------------------------------------------
   * Fatores de demanda residenciais (QDF / alimentador)
   * -------------------------------------------------------------- */

  // Iluminação + TUG: fatores PROGRESSIVOS por faixa de potência
  // instalada (kW). Cada fatia de potência recebe o fator da sua
  // faixa (tabela clássica de concessionárias / Creder).
  const DEMAND_LIGHT_TUG_BRACKETS = [
    { uptoKW: 1, f: 0.86 }, { uptoKW: 2, f: 0.75 }, { uptoKW: 3, f: 0.66 },
    { uptoKW: 4, f: 0.59 }, { uptoKW: 5, f: 0.52 }, { uptoKW: 6, f: 0.45 },
    { uptoKW: 7, f: 0.40 }, { uptoKW: 8, f: 0.35 }, { uptoKW: 9, f: 0.31 },
    { uptoKW: 10, f: 0.27 }, { uptoKW: Infinity, f: 0.24 }
  ];

  // Aquecimento (chuveiros, torneiras, aquecedores): fator pelo
  // NÚMERO de aparelhos (tabela típica de concessionária).
  const DEMAND_HEATING_BY_COUNT = [
    1.00, 0.75, 0.70, 0.66, 0.62, 0.59, 0.56, 0.53, 0.51, 0.49,
    0.47, 0.46, 0.45, 0.44, 0.43
  ]; // n = 1..15; acima de 15 → 0.40
  const DEMAND_HEATING_FLOOR = 0.40;

  // Climatização (ar-condicionado): 100% — premissa conservadora
  // usual para residências (todos podem operar simultaneamente).
  const DEMAND_AC = 1.0;

  // Motores: maior motor a 100%, demais a 70% (simultaneidade usual
  // em instalações residenciais — premissa documentada).
  const DEMAND_MOTOR_LARGEST = 1.0;
  const DEMAND_MOTOR_OTHERS = 0.7;

  // Alimentador: premissas padrão (parametrizáveis pelo chamador)
  const FEEDER_DEFAULTS = {
    lengthM: 15,          // distância medidor → QDF (padrão documentado)
    method: "B1",         // eletroduto embutido
    insulation: "PVC",
    expansionMargin: 0.20, // reserva de 20% p/ expansão futura (só no cabo)
    minSectionMm2: 10,    // seção mínima usual de entrada (padrão concessionária)
    maxDropPct: 2,        // orçamento de queda do alimentador
    pf: 0.92              // FP médio de projeto p/ demanda agregada
  };

  // Corrente de curto-circuito presumida na origem (entrada) quando
  // não informada — valor típico de rede secundária urbana.
  const DEFAULT_IK_ORIGIN_A = 6000;

  /* ==============================================================
   * 2. FUNÇÕES BÁSICAS (sistema, tensão, corrente de projeto)
   * ============================================================== */

  const MONO_WIRINGS = ["A+N", "B+N", "C+N"];
  const BI_WIRINGS = ["A+B", "A+C", "B+C"];
  const TRI_WIRINGS = ["A+B+C"];

  /** Sistema do circuito a partir da fiação: "mono" | "bi" | "tri". */
  function systemOfWiring(wt) {
    if (BI_WIRINGS.includes(wt)) return "bi";
    if (TRI_WIRINGS.includes(wt)) return "tri";
    return "mono";
  }

  /** Fases utilizadas pela fiação (ex.: "A+B" → ["A","B"]). */
  function phasesOfWiring(wt) {
    const m = {
      "A+N": ["A"], "B+N": ["B"], "C+N": ["C"],
      "A+B": ["A", "B"], "A+C": ["A", "C"], "B+C": ["B", "C"],
      "A+B+C": ["A", "B", "C"]
    };
    return m[wt] || ["A"];
  }

  /** Tensão nominal do circuito: Vfn (mono) ou Vll (bi/tri). */
  function circuitVoltage(system, Vfn, Vll) {
    return system === "mono" ? Vfn : Vll;
  }

  /** Nº de condutores carregados p/ tabela de ampacidade (2 ou 3). */
  function loadedConductors(system) {
    return system === "tri" ? 3 : 2;
  }

  /**
   * Corrente de projeto Ib (A):
   *   mono (F+N): Ib = P / (Vfn · FP)
   *   bi   (F+F): Ib = P / (Vll · FP)
   *   tri  (3F) : Ib = P / (√3 · Vll · FP)
   */
  function designCurrent({ powerVA, pf = 0.92, system = "mono", Vfn = 127, Vll = 220 }) {
    const P = Math.max(0, powerVA || 0);
    const fp = pf > 0 ? pf : 0.92;
    if (system === "tri") return P / (SQRT3 * Vll * fp);
    if (system === "bi") return P / (Vll * fp);
    return P / (Vfn * fp);
  }

  /* ==============================================================
   * 3. FATORES DE CORREÇÃO E AMPACIDADE
   * ============================================================== */

  /**
   * Fator de correção de temperatura Ft — NBR 5410 Tabela 40.
   * Escolha CONSERVADORA: usa a linha de temperatura imediatamente
   * superior quando Ta cai entre valores tabelados.
   */
  function tempCorrectionFactor(Ta, insulation = "PVC") {
    const tab = K_TEMP[insulation === "XLPE" ? "XLPE" : "PVC"];
    const temps = Object.keys(tab).map(Number).sort((a, b) => a - b);
    if (Ta <= temps[0]) return tab[temps[0]];
    for (const t of temps) if (Ta <= t) return tab[t];
    return 0; // Ta > 60 °C: fora da faixa da Tabela 40
  }

  /**
   * Fator de agrupamento Fg — NBR 5410 Tabela 42 (circuitos em
   * eletroduto / feixe), por nº de circuitos agrupados.
   */
  function groupingFactor(n) {
    const nn = Math.max(1, Math.round(n || 1));
    const steps = { 1: 1.00, 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60, 6: 0.57, 7: 0.54, 8: 0.52 };
    if (steps[nn]) return steps[nn];
    if (nn <= 11) return 0.50;
    if (nn <= 15) return 0.45;
    if (nn <= 19) return 0.41;
    return 0.38;
  }

  /** Iz de tabela (A) — Tabelas 36/37 por método, seção, isolação e nº de condutores carregados. */
  function tableAmpacity(method, sectionMm2, insulation = "PVC", loaded = 2) {
    const tab = AMPACITY[insulation === "XLPE" ? "XLPE" : "PVC"];
    const met = tab[method] || tab.B1;
    return (met[loaded === 3 ? 3 : 2])[sectionMm2] || null;
  }

  /* ==============================================================
   * 4. QUEDA DE TENSÃO
   * ============================================================== */

  /** Resistividade do cobre (Ω·mm²/m) na temperatura de operação da isolação. */
  function resistivity(insulation = "PVC") {
    const Tc = OPERATING_TEMP[insulation === "XLPE" ? "XLPE" : "PVC"];
    return RHO_CU_20 * (1 + ALPHA_CU * (Tc - 20));
  }

  /**
   * Queda de tensão (V e %):
   *   mono/bi (2 condutores): ΔV = 2 · L · Ib · (r·cosφ + x·senφ)
   *   trifásico:              ΔV = √3 · L · Ib · (r·cosφ + x·senφ)
   * com r = ρ(T_op)/S [Ω/m] e x = reatância típica [Ω/m].
   * Percentual sobre a tensão nominal do circuito (Vfn ou Vll).
   */
  function voltageDrop({ Ib, lengthM, sectionMm2, system = "mono", V, pf = 1, insulation = "PVC" }) {
    const k = system === "tri" ? SQRT3 : 2;
    const r = resistivity(insulation) / sectionMm2;
    const cos = Math.min(1, Math.max(0, pf));
    const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
    const dropV = k * lengthM * Ib * (r * cos + REACTANCE_OHM_M * sin);
    return { dropV, dropPct: V > 0 ? (dropV / V) * 100 : 0, finalV: V - dropV };
  }

  /* ==============================================================
   * 5. DIMENSIONAMENTO DO CONDUTOR (menor seção que atende TUDO)
   * ============================================================== */

  /** Seção do condutor de proteção PE — NBR 5410 Tabela 58. */
  function peSection(phaseSection) {
    if (phaseSection <= 16) return phaseSection;
    if (phaseSection <= 35) return 16;
    return phaseSection / 2;
  }

  /**
   * Seleciona a MENOR seção comercial que satisfaz simultaneamente:
   *  1. seção mínima da Tabela 47 (mecânica/normativa);
   *  2. capacidade de condução corrigida: Izc = Iz·Ft·Fg ≥ Ib;
   *  3. queda de tensão ≤ limite.
   * Retorna trilha de auditoria (`steps`) com a razão de reprovação
   * de cada seção rejeitada e o critério que governou a escolha.
   */
  function sizeConductor({ Ib, method = "B1", insulation = "PVC", loaded = 2,
                           Ft = 1, Fg = 1, minSectionMm2 = 2.5,
                           lengthM = 0, V = 127, system = "mono", pf = 1,
                           maxDropPct = VOLTAGE_DROP_LIMITS.finalCircuitDefault }) {
    const steps = [];
    let governedBy = "capacidade de condução";
    for (const S of SECTIONS) {
      if (S < minSectionMm2) {
        steps.push({ section: S, ok: false, reason: `abaixo da seção mínima ${minSectionMm2} mm² (Tab. 47)` });
        governedBy = "seção mínima (Tab. 47)";
        continue;
      }
      const Iz = tableAmpacity(method, S, insulation, loaded);
      if (!Iz) { steps.push({ section: S, ok: false, reason: "fora da tabela de ampacidade" }); continue; }
      const Izc = Iz * Ft * Fg;
      if (Izc < Ib) {
        steps.push({ section: S, ok: false, reason: `Izc=${Izc.toFixed(1)}A < Ib=${Ib.toFixed(1)}A` });
        governedBy = "capacidade de condução";
        continue;
      }
      const vd = voltageDrop({ Ib, lengthM, sectionMm2: S, system, V, pf, insulation });
      if (vd.dropPct > maxDropPct + 1e-9) {
        steps.push({ section: S, ok: false, reason: `ΔV=${vd.dropPct.toFixed(2)}% > ${maxDropPct}%` });
        governedBy = "queda de tensão";
        continue;
      }
      steps.push({ section: S, ok: true, reason: `Izc=${Izc.toFixed(1)}A ≥ Ib e ΔV=${vd.dropPct.toFixed(2)}% ≤ ${maxDropPct}%` });
      return { ok: true, section: S, Iz, Izc: round2(Izc), drop: vd, steps, governedBy };
    }
    // Nenhuma seção resolve (ex.: distância excessiva): adota a maior
    // seção disponível e sinaliza inviabilidade.
    const S = SECTIONS[SECTIONS.length - 1];
    const Iz = tableAmpacity(method, S, insulation, loaded);
    const Izc = (Iz || 0) * Ft * Fg;
    const vd = voltageDrop({ Ib, lengthM, sectionMm2: S, system, V, pf, insulation });
    return { ok: false, section: S, Iz, Izc: round2(Izc), drop: vd, steps, governedBy };
  }

  /* ==============================================================
   * 6. PROTEÇÃO — COORDENAÇÃO DISJUNTOR × CONDUTOR (§5.3.4)
   * ============================================================== */

  /**
   * Seleciona o In comercial dentro da janela Ib ≤ In ≤ Izc.
   * O disjuntor protege o condutor: In NUNCA pode exceder Izc — isso
   * é absoluto em ambas as estratégias.
   * O critério I2 ≤ 1,45·Iz da NBR 5410 é automaticamente atendido
   * por disjuntores IEC 60898 (I2 = 1,45·In ≤ 1,45·Izc).
   *
   * strategy:
   *   "min" (padrão) — MENOR In ≥ Ib. Correto para circuito dedicado
   *      a um equipamento fixo: o In deve refletir a placa do
   *      aparelho (chuveiro, motor, split), não uma folga especulativa.
   *   "max" — MAIOR In ≤ Izc. Correto para circuitos de tomada: usa
   *      toda a capacidade que o condutor (já na seção mínima
   *      obrigatória) oferece de graça, dando reserva técnica real
   *      para troca de carga futura sem religar/trocar cabo.
   * Retorna a lista de candidatos avaliados p/ o memorial.
   */
  function selectBreaker({ Ib, Izc, ratings = MCB_RATINGS, strategy = "min" }) {
    const candidates = [];
    let chosen = null;
    for (const In of ratings) {
      const geIb = In >= Ib - 1e-9;
      const leIzc = In <= Izc + 1e-9;
      const ok = geIb && leIzc;
      candidates.push({
        In, ok,
        reason: ok ? `${fmt(Ib)} ≤ ${In} ≤ ${fmt(Izc)}`
          : !geIb ? `In < Ib (${fmt(Ib)}A)`
          : `In > Izc (${fmt(Izc)}A) — não protege o condutor`
      });
      if (ok) {
        if (strategy === "max") chosen = In;        // segue atualizando → fica com o maior
        else if (chosen === null) chosen = In;       // "min": trava no primeiro (menor)
      }
    }
    return { In: chosen, candidates, strategy };
  }

  // Tipos de circuito cuja proteção deve usar TODA a folga do
  // condutor (estratégia "max"): tomadas de uso geral e específico
  // (TUE — geladeira, micro-ondas, etc.). Equipamento fixo/dedicado
  // usa "min" (In ≈ placa do aparelho).
  const CONDUCTOR_DRIVEN_TYPES = new Set(["tomadas", "uso_geral"]);

  // Corrente nominal padrão de tomada/plugue doméstico — NBR 14136
  // (10 A ou 20 A). Teto de segurança para a estratégia "max": o
  // disjuntor de um circuito de tomada não deve superar a corrente
  // que o próprio plugue/tomada instalados suportam, mesmo que o
  // condutor aguente mais. Não se aplica se Ib já exceder o teto
  // (aí a prioridade normativa Ib ≤ In prevalece e o memorial sinaliza
  // a necessidade de tomada dedicada de maior capacidade).
  const DEFAULT_SOCKET_MAX_A = 20;

  /** Curva do disjuntor por tipo de carga (partida de motor/compressor → C). */
  function breakerCurve(circuitType) {
    return (circuitType === "motor" || circuitType === "climatizacao") ? "C" : "B";
  }

  /**
   * Sensibilidade do DR — NBR 5410 §5.1.3.2.2: proteção adicional
   * 30 mA para tomadas, áreas molhadas, chuveiros e circuitos
   * externos; iluminação (pontos fixos no teto) pode usar 300 mA
   * (proteção contra incêndio) via DR geral.
   */
  function rcdSensitivity(circuitType) {
    return circuitType === "iluminacao" ? 300 : 30;
  }

  /* ==============================================================
   * 7. CURTO-CIRCUITO
   * ============================================================== */

  /**
   * Estimativa de corrente de curto-circuito presumida (método da
   * impedância, só resistência — conservador p/ capacidade de
   * interrupção em BT residencial):
   *   Z_origem = Vfn / Ik_origem  (rede a montante, laço F-N)
   *   Z_circuito = 2·ρ·L/S        (ida e volta do cabo)
   *   Icc_quadro = Vfn / Z_montante          (falta F-N no barramento)
   *   Icc_fim    = V_circ / (Z_montante + Z_circuito)
   * Premissa: neutro com a mesma seção da fase ⇒ o laço F-F tem a
   * mesma impedância do laço F-N, e a falta F-F no fim do circuito
   * usa Vll sobre o mesmo laço.
   */
  function shortCircuit({ V, VBoard, lengthM, sectionMm2, insulation = "PVC", upstreamZOhm }) {
    const zc = 2 * resistivity(insulation) * lengthM / sectionMm2;
    const Vb = VBoard || V;
    const iccBoardA = upstreamZOhm > 0 ? Vb / upstreamZOhm : Infinity;
    const iccEndA = V / ((upstreamZOhm || 0) + zc);
    return { iccBoardA, iccEndA, zCircuitOhm: zc };
  }

  /** Menor capacidade de interrupção padronizada ≥ Icc no ponto. */
  function requiredBreakingCapacity(iccA) {
    for (const icn of BREAKING_CAPACITIES) if (icn >= iccA) return icn;
    return null; // acima de 10 kA: exige disjuntor industrial
  }

  /**
   * Verificação adiabática do condutor sob curto (§5.3.5.4):
   * o cabo suporta Icc durante t se S ≥ Icc·√t / k.
   * Premissa: t = 0,01 s (disparo magnético de MCB).
   */
  function adiabaticCheck({ iccA, sectionMm2, insulation = "PVC", tSeconds = 0.01 }) {
    const k = K_ADIABATIC[insulation === "XLPE" ? "XLPE" : "PVC"];
    const minS = iccA * Math.sqrt(tSeconds) / k;
    return { ok: sectionMm2 >= minS, minSectionMm2: round2(minS) };
  }

  /* ==============================================================
   * 8. PIPELINE COMPLETO DE UM CIRCUITO
   * ============================================================== */

  /**
   * Dimensiona um circuito terminal na sequência normativa completa.
   *
   * @param load {power, pf, distance, type, method, wiringType}
   * @param site {Vfn, Vll, Ta, insulation, groupedCircuits,
   *              maxDropPct, upstreamZOhm}
   * @returns resultado auditável: condutor, disjuntor (com
   *          candidatos), queda, curto, DR e checks de validação.
   */
  function sizeCircuit(load, site) {
    const wt = load.wiringType || "A+N";
    const system = systemOfWiring(wt);
    const Vfn = site.Vfn, Vll = site.Vll;
    const V = circuitVoltage(system, Vfn, Vll);
    const pf = parseFloat(load.pf) || 0.92;
    const powerVA = parseFloat(load.power) || 0;
    const lengthM = parseFloat(load.distance) || 0;
    const insulation = site.insulation || "PVC";
    const method = load.method || "B1";
    const loaded = loadedConductors(system);
    const maxDropPct = site.maxDropPct || VOLTAGE_DROP_LIMITS.finalCircuitDefault;

    // 1. Corrente de projeto
    const Ib = designCurrent({ powerVA, pf, system, Vfn, Vll });

    // 2. Fatores de correção
    const Ft = tempCorrectionFactor(site.Ta ?? 30, insulation);
    const Fg = groupingFactor(site.groupedCircuits ?? 1);

    // 3. Condutor: menor seção que atende mínimo + ampacidade + ΔV
    const minS = MIN_SECTION[load.type] || 2.5;
    let cond = sizeConductor({
      Ib, method, insulation, loaded, Ft, Fg,
      minSectionMm2: minS, lengthM, V, system, pf, maxDropPct
    });

    // 4. Proteção: In dentro de Ib ≤ In ≤ Izc. Se nenhum In couber
    //    na janela [Ib, Izc], sobe-se a seção até caber (§5.3.4).
    //    Estratégia depende do tipo de circuito — ver nota de
    //    engenharia no cabeçalho do arquivo:
    //      "min" (equipamento fixo/dedicado) → In ≈ Ib (placa do aparelho)
    //      "max" (tomadas/TUE)               → In ≈ Izc (usa a folga do condutor)
    const strategy = CONDUCTOR_DRIVEN_TYPES.has(load.type) ? "max" : "min";
    const socketMaxA = strategy === "max" ? (site.socketMaxA ?? DEFAULT_SOCKET_MAX_A) : null;
    // O teto de tomada só é aplicado se Ib já couber nele; do
    // contrário a proteção do circuito (Ib ≤ In) prevalece sobre a
    // convenção de plugue, e o memorial sinaliza tomada dedicada.
    const socketCapUsable = socketMaxA !== null && Ib <= socketMaxA + 1e-9;

    const effIzc = (izc) => (socketCapUsable ? Math.min(izc, socketMaxA) : izc);

    let brk = selectBreaker({ Ib, Izc: effIzc(cond.Izc), strategy });
    let upsizedForBreaker = false;
    while (brk.In === null) {
      const i = SECTIONS.indexOf(cond.section);
      if (i < 0 || i >= SECTIONS.length - 1) break;
      const S = SECTIONS[i + 1];
      const Iz = tableAmpacity(method, S, insulation, loaded);
      const Izc = round2((Iz || 0) * Ft * Fg);
      const drop = voltageDrop({ Ib, lengthM, sectionMm2: S, system, V, pf, insulation });
      cond = { ...cond, section: S, Iz, Izc, drop,
               governedBy: "coordenação da proteção (In ≤ Izc)" };
      cond.steps = cond.steps.concat([{ section: S, ok: true, reason: "seção elevada p/ coordenação da proteção" }]);
      upsizedForBreaker = true;
      brk = selectBreaker({ Ib, Izc: effIzc(Izc), strategy });
    }
    // Fallback (Ib acima de qualquer janela, mesmo sem teto de tomada):
    // menor In ≥ Ib, sinalizado como não-coordenado.
    const uncoordinated = brk.In === null;
    const In = brk.In ?? (MCB_RATINGS.find(r => r >= Ib) || MCB_RATINGS[MCB_RATINGS.length - 1]);
    const socketCapApplied = socketCapUsable && brk.In !== null && brk.In === socketMaxA && socketMaxA < cond.Izc - 1e-9;

    const curve = breakerCurve(load.type);
    const rcdMa = rcdSensitivity(load.type);

    // 5. Curto-circuito
    const upstreamZOhm = site.upstreamZOhm ?? (Vfn / (site.ikOriginA || DEFAULT_IK_ORIGIN_A));
    const sc = shortCircuit({ V, VBoard: Vfn, lengthM, sectionMm2: cond.section, insulation, upstreamZOhm });
    const icnRequired = requiredBreakingCapacity(sc.iccBoardA);
    const adiabatic = adiabaticCheck({ iccA: sc.iccEndA, sectionMm2: cond.section, insulation });
    const tripMultiple = CURVE_TRIP_MULTIPLE[curve] || 10;
    const magneticTripOk = sc.iccEndA >= tripMultiple * In;

    const result = {
      input: { ...load }, wiring: wt, system, V, phases: phasesOfWiring(wt),
      Ib, Ft, Fg,
      conductor: {
        section: cond.section, Iz: cond.Iz, Izc: cond.Izc,
        pe: peSection(cond.section),
        governedBy: cond.governedBy, steps: cond.steps,
        feasible: cond.ok || upsizedForBreaker
      },
      drop: cond.drop, maxDropPct,
      breaker: {
        In, curve, candidates: brk.candidates,
        coordinated: !uncoordinated,
        icnRequiredA: icnRequired,
        strategy,
        socketMaxA,
        socketCapApplied
      },
      rcd: { In: RCD_RATINGS.find(r => r >= In) || RCD_RATINGS[RCD_RATINGS.length - 1], sensitivityMa: rcdMa },
      shortCircuit: { ...sc, adiabatic, magneticTripOk, tripMultiple },
      upsizedForBreaker
    };
    result.checks = validateCircuit(result, { minSectionMm2: minS });
    result.status = worstStatus(result.checks);
    return result;
  }

  /* ==============================================================
   * 9. VALIDAÇÃO (PASS / WARN / ERROR)
   * ============================================================== */

  function check(id, label, status, detail) { return { id, label, status, detail }; }

  function worstStatus(checks) {
    if (checks.some(c => c.status === "ERROR")) return "ERROR";
    if (checks.some(c => c.status === "WARN")) return "WARN";
    return "PASS";
  }

  /** Pipeline de validação de um circuito dimensionado. */
  function validateCircuit(r, { minSectionMm2 = 2.5 } = {}) {
    const cs = [];
    const S = r.conductor.section;

    cs.push(check("secao-minima", "Seção mínima (Tab. 47)",
      S >= minSectionMm2 ? "PASS" : "ERROR",
      `S=${S} mm² ≥ ${minSectionMm2} mm²`));

    cs.push(check("ampacidade", "Capacidade de condução",
      r.conductor.Izc >= r.Ib - 1e-9 ? "PASS" : "ERROR",
      `Izc=${fmt(r.conductor.Izc)}A ${r.conductor.Izc >= r.Ib ? "≥" : "<"} Ib=${fmt(r.Ib)}A`));

    const coordOk = r.breaker.coordinated && r.breaker.In >= r.Ib - 1e-9 && r.breaker.In <= r.conductor.Izc + 1e-9;
    cs.push(check("coordenacao", "Coordenação Ib ≤ In ≤ Izc (§5.3.4)",
      coordOk ? "PASS" : "ERROR",
      `${fmt(r.Ib)} ≤ ${r.breaker.In} ≤ ${fmt(r.conductor.Izc)}${coordOk ? "" : " VIOLADO"}`));

    const dropOk = r.drop.dropPct <= r.maxDropPct + 1e-9;
    cs.push(check("queda-tensao", "Queda de tensão (§6.2.7)",
      dropOk ? (r.drop.dropPct > r.maxDropPct * 0.75 ? "WARN" : "PASS") : "ERROR",
      `ΔV=${r.drop.dropPct.toFixed(2)}% (limite ${r.maxDropPct}%)`));

    cs.push(check("interrupcao", "Capacidade de interrupção",
      r.breaker.icnRequiredA === null ? "ERROR" : (r.breaker.icnRequiredA > 4500 ? "WARN" : "PASS"),
      r.breaker.icnRequiredA === null
        ? `Icc presumida ${fmt0(r.shortCircuit.iccBoardA)}A > 10 kA — exige disjuntor industrial`
        : `Icc no quadro ${fmt0(r.shortCircuit.iccBoardA)}A → Icn mínimo ${r.breaker.icnRequiredA / 1000} kA`));

    cs.push(check("disparo-magnetico", `Disparo magnético (curva ${r.breaker.curve})`,
      r.shortCircuit.magneticTripOk ? "PASS" : "WARN",
      `Icc no fim ${fmt0(r.shortCircuit.iccEndA)}A ${r.shortCircuit.magneticTripOk ? "≥" : "<"} ${r.shortCircuit.tripMultiple}×In=${r.shortCircuit.tripMultiple * r.breaker.In}A${r.shortCircuit.magneticTripOk ? "" : " — atuação térmica/DR"}`));

    cs.push(check("adiabatica", "Suportabilidade térmica no curto (§5.3.5.4)",
      r.shortCircuit.adiabatic.ok ? "PASS" : "ERROR",
      `S=${S} mm² ${r.shortCircuit.adiabatic.ok ? "≥" : "<"} ${r.shortCircuit.adiabatic.minSectionMm2} mm² p/ Icc=${fmt0(r.shortCircuit.iccEndA)}A`));

    cs.push(check("dr", "Proteção DR (§5.1.3.2.2)",
      "PASS",
      `DR ${r.rcd.In}A / ${r.rcd.sensitivityMa} mA${r.rcd.sensitivityMa === 30 ? " (proteção adicional contra choque)" : " (via DR geral)"}`));

    if (!r.conductor.feasible) {
      cs.push(check("viabilidade", "Viabilidade do condutor", "ERROR",
        "Nenhuma seção ≤ 120 mm² atende — reduza a distância ou divida a carga"));
    }
    return cs;
  }

  /* ==============================================================
   * 10. QDF — DEMANDA, ALIMENTADOR E DISJUNTOR GERAL
   * ============================================================== */

  /** Categoria de demanda de um circuito a partir do tipo de carga. */
  function demandCategory(circuitType) {
    if (circuitType === "aquecimento") return "AQUEC";
    if (circuitType === "climatizacao") return "CLIMA";
    if (circuitType === "motor") return "MOTOR";
    return "ILUM_TUG"; // iluminacao, tomadas, uso_geral
  }

  /** Fator progressivo iluminação+TUG aplicado por faixa de kW. */
  function lightTugDemandVA(installedVA) {
    let remaining = installedVA / 1000; // kW
    let demand = 0, prev = 0;
    for (const b of DEMAND_LIGHT_TUG_BRACKETS) {
      const slice = Math.min(remaining, b.uptoKW - prev);
      if (slice <= 0) break;
      demand += slice * b.f;
      remaining -= slice;
      prev = b.uptoKW;
    }
    return demand * 1000;
  }

  /** Fator de demanda de aquecimento pelo nº de aparelhos. */
  function heatingDemandFactor(count) {
    if (count <= 0) return 0;
    return DEMAND_HEATING_BY_COUNT[count - 1] ?? DEMAND_HEATING_FLOOR;
  }

  /**
   * Demanda diversificada da instalação por categoria de carga.
   * NUNCA é a soma dos disjuntores: aplica fatores de demanda e
   * simultaneidade por categoria (iluminação+TUG progressivo,
   * aquecimento por nº de aparelhos, climatização 100%, motores
   * maior 100% + demais 70%).
   */
  function demandDiversifiedLoad(loadsArr) {
    const cats = {
      ILUM_TUG: { installedVA: 0, count: 0 },
      AQUEC: { installedVA: 0, count: 0 },
      CLIMA: { installedVA: 0, count: 0 },
      MOTOR: { installedVA: 0, count: 0, powers: [] }
    };
    let maxSingleVA = 0;
    for (const l of loadsArr) {
      const P = parseFloat(l.power) || 0;
      const cat = demandCategory(l.type);
      cats[cat].installedVA += P;
      cats[cat].count++;
      if (cat === "MOTOR") cats[cat].powers.push(P);
      if (P > maxSingleVA) maxSingleVA = P;
    }
    cats.ILUM_TUG.demandVA = lightTugDemandVA(cats.ILUM_TUG.installedVA);
    cats.AQUEC.factor = heatingDemandFactor(cats.AQUEC.count);
    cats.AQUEC.demandVA = cats.AQUEC.installedVA * cats.AQUEC.factor;
    cats.CLIMA.factor = DEMAND_AC;
    cats.CLIMA.demandVA = cats.CLIMA.installedVA * DEMAND_AC;
    const motors = cats.MOTOR.powers.sort((a, b) => b - a);
    cats.MOTOR.demandVA = motors.length
      ? motors[0] * DEMAND_MOTOR_LARGEST + motors.slice(1).reduce((s, p) => s + p, 0) * DEMAND_MOTOR_OTHERS
      : 0;
    cats.ILUM_TUG.factor = cats.ILUM_TUG.installedVA > 0 ? cats.ILUM_TUG.demandVA / cats.ILUM_TUG.installedVA : 1;
    cats.MOTOR.factor = cats.MOTOR.installedVA > 0 ? cats.MOTOR.demandVA / cats.MOTOR.installedVA : 1;

    const installedVA = Object.values(cats).reduce((s, c) => s + c.installedVA, 0);
    let demandVA = Object.values(cats).reduce((s, c) => s + (c.demandVA || 0), 0);
    // Salvaguarda: a demanda nunca é menor que a maior carga
    // individual (um único aparelho pode operar a plena potência).
    demandVA = Math.max(demandVA, maxSingleVA);
    return { categories: cats, installedVA, demandVA,
             overallFactor: installedVA > 0 ? demandVA / installedVA : 1 };
  }

  /**
   * Correntes por fase sob demanda diversificada (soma ARITMÉTICA,
   * conservadora — despreza defasagem angular):
   *   mono F+N em X : I = Pd/(Vfn·FP) na fase X
   *   bi   F+F em XY: I = Pd/(Vll·FP) nas DUAS fases (corrente de linha)
   *   tri  3F       : I = Pd/(√3·Vll·FP) nas três fases
   * onde Pd = P × fator de demanda da categoria do circuito.
   */
  function phaseCurrents(loadsArr, demand, { Vfn, Vll }) {
    const I = { A: 0, B: 0, C: 0 };
    for (const l of loadsArr) {
      const P = parseFloat(l.power) || 0;
      const pf = parseFloat(l.pf) || 0.92;
      const cat = demand.categories[demandCategory(l.type)];
      const fd = cat.installedVA > 0 ? (cat.demandVA || 0) / cat.installedVA : 1;
      const wt = l.wiringType || "A+N";
      const system = systemOfWiring(wt);
      const Pd = P * fd;
      const Icirc = designCurrent({ powerVA: Pd, pf, system, Vfn, Vll });
      for (const ph of phasesOfWiring(wt)) I[ph] += Icirc;
    }
    return I;
  }

  /**
   * Dimensiona alimentador + disjuntor geral + DR geral + DPS do QDF.
   *
   * Sequência: demanda diversificada → correntes por fase → Ib do
   * alimentador = máxima corrente de fase → cabo (com margem de
   * expansão) → disjuntor geral com Ib ≤ In ≤ Izc → DR ≥ In → DPS.
   *
   * @param loadsArr circuitos (cargas cruas)
   * @param site {Vfn, Vll, supplyType, Ta, ikOriginA, feeder?{...}}
   */
  function sizeFeederAndMain(loadsArr, site) {
    const f = { ...FEEDER_DEFAULTS, ...(site.feeder || {}) };
    const st = site.supplyType || "trifasico";
    const Vfn = site.Vfn, Vll = site.Vll;
    const supplySystem = st === "trifasico" ? "tri" : st === "bifasico" ? "bi" : "mono";
    const phasesInUse = st === "trifasico" ? ["A", "B", "C"] : st === "bifasico" ? ["A", "B"] : ["A"];

    // 1–2. Demanda e correntes de fase
    const demand = demandDiversifiedLoad(loadsArr);
    const Iphase = phaseCurrents(loadsArr, demand, { Vfn, Vll });
    const IbFeeder = Math.max(...phasesInUse.map(p => Iphase[p]), 0);

    // 3. Condutor do alimentador — dimensionado para Ib×(1+margem)
    //    (reserva de expansão aplicada ao CABO, não ao disjuntor)
    const Idim = IbFeeder * (1 + f.expansionMargin);
    const loaded = loadedConductors(supplySystem);
    const Ft = tempCorrectionFactor(site.Ta ?? 30, f.insulation);
    const V = circuitVoltage(supplySystem, Vfn, Vll);
    let cond = sizeConductor({
      Ib: Idim, method: f.method, insulation: f.insulation, loaded,
      Ft, Fg: 1, minSectionMm2: f.minSectionMm2,
      lengthM: f.lengthM, V, system: supplySystem, pf: f.pf,
      maxDropPct: f.maxDropPct
    });

    // 4. Disjuntor geral: MENOR In comercial com IbFeeder ≤ In ≤ Izc.
    //    Se não couber, sobe a seção do alimentador.
    let main = selectBreaker({ Ib: IbFeeder, Izc: cond.Izc, ratings: MAIN_RATINGS });
    while (main.In === null) {
      const i = SECTIONS.indexOf(cond.section);
      if (i < 0 || i >= SECTIONS.length - 1) break;
      const S = SECTIONS[i + 1];
      const Iz = tableAmpacity(f.method, S, f.insulation, loaded);
      const Izc = round2((Iz || 0) * Ft);
      cond = { ...cond, section: S, Iz, Izc,
               drop: voltageDrop({ Ib: IbFeeder, lengthM: f.lengthM, sectionMm2: S, system: supplySystem, V, pf: f.pf, insulation: f.insulation }),
               governedBy: "coordenação do disjuntor geral" };
      main = selectBreaker({ Ib: IbFeeder, Izc, ratings: MAIN_RATINGS });
    }
    const mainIn = main.In ?? (MAIN_RATINGS.find(r => r >= IbFeeder) || MAIN_RATINGS[MAIN_RATINGS.length - 1]);

    // Queda real do alimentador com a corrente de demanda (sem margem)
    const feederDrop = voltageDrop({
      Ib: IbFeeder, lengthM: f.lengthM, sectionMm2: cond.section,
      system: supplySystem, V, pf: f.pf, insulation: f.insulation
    });

    // 5. DR geral e DPS
    const drIn = RCD_RATINGS.find(r => r >= mainIn) || RCD_RATINGS[RCD_RATINGS.length - 1];
    const dps = {
      class: "II", inKA: 20, imaxKA: 40,
      ucV: Vfn === 127 ? 275 : 440,
      poles: st === "trifasico" ? 4 : st === "bifasico" ? 3 : 2,
      standard: "IEC 61643-11"
    };

    // 6. Curto-circuito no barramento do QDF
    const ikOriginA = site.ikOriginA || DEFAULT_IK_ORIGIN_A;
    const zOrigin = Vfn / ikOriginA;
    const zFeeder = 2 * resistivity(f.insulation) * f.lengthM / cond.section;
    const zAtBoardOhm = zOrigin + zFeeder;
    const iccBoardA = Vfn / zAtBoardOhm;
    const icnRequired = requiredBreakingCapacity(iccBoardA);

    // 7. Desequilíbrio de fases (sobre as fases existentes)
    const inUse = phasesInUse.map(p => Iphase[p]);
    const maxI = Math.max(...inUse), minI = Math.min(...inUse);
    const imbalancePct = phasesInUse.length > 1 && maxI > 0 ? (maxI - minI) / maxI * 100 : 0;

    // 8. Validação do QDF
    const checks = [];
    checks.push(check("qdf-coordenacao", "Disjuntor geral Ib ≤ In ≤ Izc",
      main.In !== null ? "PASS" : "ERROR",
      `${fmt(IbFeeder)} ≤ ${mainIn} ≤ ${fmt(cond.Izc)}`));
    checks.push(check("qdf-queda", `Queda do alimentador ≤ ${f.maxDropPct}%`,
      feederDrop.dropPct <= f.maxDropPct ? "PASS" : "WARN",
      `ΔV=${feederDrop.dropPct.toFixed(2)}% em ${f.lengthM} m`));
    checks.push(check("qdf-equilibrio", "Equilíbrio de fases",
      imbalancePct <= 10 ? "PASS" : imbalancePct <= 20 ? "WARN" : "ERROR",
      `Desequilíbrio ${imbalancePct.toFixed(0)}% (IA=${fmt(Iphase.A)}A IB=${fmt(Iphase.B)}A IC=${fmt(Iphase.C)}A)`));
    checks.push(check("qdf-interrupcao", "Capacidade de interrupção no QDF",
      icnRequired === null ? "ERROR" : icnRequired > 4500 ? "WARN" : "PASS",
      icnRequired === null ? `Icc ${fmt0(iccBoardA)}A > 10 kA`
        : `Icc presumida ${fmt0(iccBoardA)}A → Icn mínimo ${icnRequired / 1000} kA`));

    return {
      supplyType: st, system: supplySystem, V, phasesInUse,
      demand, Iphase, IbFeeder, IdimFeeder: Idim,
      imbalancePct,
      feeder: {
        section: cond.section, Iz: cond.Iz, Izc: cond.Izc,
        neutral: cond.section,               // neutro = fase (residencial)
        pe: peSection(cond.section),         // Tabela 58
        method: f.method, insulation: f.insulation,
        lengthM: f.lengthM, expansionMargin: f.expansionMargin,
        drop: feederDrop, maxDropPct: f.maxDropPct,
        governedBy: cond.governedBy, steps: cond.steps
      },
      main: {
        In: mainIn, curve: "C",
        poles: st === "trifasico" ? 3 : st === "bifasico" ? 2 : 1,
        coordinated: main.In !== null,
        candidates: main.candidates,
        icnRequiredA: icnRequired
      },
      rcd: { In: drIn, sensitivityMa: 30 },
      dps,
      shortCircuit: { iccBoardA, zAtBoardOhm, ikOriginA },
      checks,
      status: worstStatus(checks)
    };
  }

  /* ==============================================================
   * Utilidades
   * ============================================================== */
  function round2(v) { return Math.round(v * 100) / 100; }
  function fmt(v) { return (Math.round(v * 10) / 10).toString(); }
  function fmt0(v) { return Math.round(v).toString(); }

  /* ==============================================================
   * API pública
   * ============================================================== */
  return {
    // tabelas e constantes
    TABLES: {
      SECTIONS, MCB_RATINGS, MAIN_RATINGS, RCD_RATINGS,
      BREAKING_CAPACITIES, AMPACITY, K_TEMP, MIN_SECTION,
      VOLTAGE_DROP_LIMITS, K_ADIABATIC, CURVE_TRIP_MULTIPLE,
      DEMAND_LIGHT_TUG_BRACKETS, DEMAND_HEATING_BY_COUNT,
      FEEDER_DEFAULTS, DEFAULT_IK_ORIGIN_A,
      RHO_CU_20, ALPHA_CU, OPERATING_TEMP, REACTANCE_OHM_M
    },
    // básicas
    systemOfWiring, phasesOfWiring, circuitVoltage, loadedConductors,
    designCurrent,
    // fatores e ampacidade
    tempCorrectionFactor, groupingFactor, tableAmpacity,
    // queda de tensão
    resistivity, voltageDrop,
    // condutor e proteção
    peSection, sizeConductor, selectBreaker, breakerCurve, rcdSensitivity,
    // curto-circuito
    shortCircuit, requiredBreakingCapacity, adiabaticCheck,
    // pipeline
    sizeCircuit, validateCircuit,
    // QDF
    demandCategory, lightTugDemandVA, heatingDemandFactor,
    demandDiversifiedLoad, phaseCurrents, sizeFeederAndMain
  };
});
