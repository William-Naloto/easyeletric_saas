/* ================================================================
 * EasyEletric — Smart Distribution Board (QDF Twin · SVG Engine)
 * ================================================================
 *
 * Módulo independente e SEM DOM: roda no navegador (global
 * `EEQdfTwin`) e em Node.js. Consome EXCLUSIVAMENTE o
 * ElectricalProjectModel — nenhum dado de engenharia é calculado
 * ou possuído aqui (a única aritmética local é de apresentação:
 * utilização % = corrente do barramento / In do disjuntor geral).
 *
 * Layout de PAINEL REAL (referência: quadro residencial BR):
 *
 *   ┌─────────────────────────────────────────────────┐
 *   │  DPS (banco em PARALELO)      DISJUNTOR GERAL ← │← alimentador
 *   │   │ derivação │                      │          │
 *   │   ⏚ (PE)      └── DR GERAL ──────────┘          │
 *   │                     │                           │
 *   │ PE N  carga ─ IDR ══╬══ IDR ─ carga        N PE │
 *   │ ║  ║  carga ─ IDR ══╬══ IDR ─ carga        ║  ║ │
 *   │ ║  ║  carga ─ IDR ══╬══ IDR ─ carga        ║  ║ │
 *   │        (pente de cobre VERTICAL central)        │
 *   └─────────────────────────────────────────────────┘
 *
 * - DPS instalado em PARALELO (derivação) conforme NBR 5410
 *   §6.3.5.2 — nunca em série no caminho principal; em esquema TT
 *   a conexão é "N+1" (N–PE por centelhador), em TN-S modo comum;
 * - Cores dos condutores conforme NBR 5410 §6.1.5.3:
 *   fases PRETO / VERMELHO / MARROM, neutro AZUL-CLARO, PE VERDE;
 * - Interior do gabinete claro e realista em todos os temas (como
 *   um painel de verdade) — só a folha/página muda com o tema;
 * - DR = proteção GERAL · IDR = interruptor diferencial POR CIRCUITO;
 * - Cada objeto em <g data-node="ID"> com os MESMOS ids do modelo —
 *   hover/seleção/realce da cadeia via chainOf()/relatedOf() sem
 *   re-render; overlays de corrente/ΔV/Icc/validação; temas
 *   dark/light/print (carimbo técnico); catálogo de fabricante
 *   opcional impresso nos módulos.
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.EEQdfTwin = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ==============================================================
   * Temas — página muda; interior do painel é realista e claro
   * em todos os temas (placa de montagem cinza, módulos brancos)
   * ============================================================== */
  const INTERIOR = {
    enclosure: "#cdd4dc", enclosureStroke: "#8d9aa8",
    plate: "#e7ebef", plateStroke: "#b3bdc7",
    module: "#fafbfc", moduleStroke: "#8b99a8",
    inkIn: "#16202b", dimIn: "#5a6b7d",
    rail: "#aab6c2", railDark: "#7e8b99",
    copperTop: "#e09a5e", copperMid: "#c07a3a", copperLow: "#8a4f1f",
    steelTop: "#dde3ea", steelLow: "#9fadbb"
  };

  /* Cores dos condutores — NBR 5410 §6.1.5.3 (iguais em todo tema,
   * pois são desenhados sobre a placa clara do painel) */
  const WIRES = {
    A: "#1a1f26",   // fase A — PRETO
    B: "#d92b2b",   // fase B — VERMELHO
    C: "#8a5a2b",   // fase C — MARROM
    N: "#2f6fde",   // neutro — AZUL-CLARO
    PE: "#17984d"   // proteção — VERDE
  };
  const WIRE_NAMES = { A: "preto", B: "vermelho", C: "marrom", N: "azul-claro", PE: "verde" };

  const THEMES = {
    dark: Object.assign({
      bg: "#0b1828", ink: "#e8f4fd", dim: "#7da3c0",
      ok: "#22c55e", warn: "#f59e0b", err: "#ef4444",
      accent: "#4da8ff", phases: WIRES
    }, INTERIOR),
    light: Object.assign({
      bg: "#ffffff", ink: "#0d1b2e", dim: "#4a6a8a",
      ok: "#16a34a", warn: "#d97706", err: "#dc2626",
      accent: "#1565c0", phases: WIRES
    }, INTERIOR),
    print: Object.assign({
      bg: "#ffffff", ink: "#000000", dim: "#444444",
      ok: "#1a7f37", warn: "#b45309", err: "#b91c1c",
      accent: "#000000", phases: WIRES
    }, INTERIOR, { enclosureStroke: "#000000", moduleStroke: "#333333" })
  };

  const DEFAULT_OVERLAYS = { current: true, drop: true, icc: false, validation: true };

  /* Geometria (px do viewBox) */
  const G = {
    rowH: 66,        // passo vertical de uma fileira de circuito
    modW: 106,       // módulo de disjuntor (orientação horizontal)
    modH: 38,
    tagW: 102,       // etiqueta de carga
    combGap: 26,     // distância entre barras verticais do pente
    combW: 9,        // largura da barra de cobre vertical
    stripW: 8,       // largura das barras N/PE das bordas
    padX: 18
  };

  /* ==============================================================
   * Utilidades
   * ============================================================== */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  const fmt = (v, d) => (v == null || isNaN(v)) ? "—"
    : Number(v).toFixed(d == null ? 1 : d).replace(".", ",");
  const trunc = (s, n) => !s ? "" : (s.length > n ? s.slice(0, n - 1) + "…" : s);

  const ln = (x1, y1, x2, y2, a) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${a || ""}/>`;
  const rc = (x, y, w, h, a) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a || ""}/>`;
  const ci = (cx, cy, r, a) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${a || ""}/>`;
  const tx = (x, y, t, a) => `<text x="${x}" y="${y}" ${a || ""}>${esc(t)}</text>`;
  const pa = (d, a) => `<path d="${d}" ${a || ""}/>`;

  function statusColor(P, status) {
    return status === "ERROR" ? P.err : status === "WARN" ? P.warn : P.ok;
  }
  const wire = (c, w) => `stroke="${c}" stroke-width="${w || 2.2}" fill="none" stroke-linecap="round"`;

  /* ==============================================================
   * Layout
   * ============================================================== */

  /** Divide os circuitos em colunas: ímpares à ESQUERDA, pares à
   *  DIREITA (prática de quadros reais). */
  function splitColumns(model) {
    const left = [], right = [];
    model.circuits.forEach((c, i) => (i % 2 === 0 ? left : right).push(c));
    return { left, right, rows: Math.max(left.length, right.length) };
  }

  function layout(model, opts) {
    const phases = model.summary.phasesInUse;
    const cols = splitColumns(model);

    const headerH = opts.theme === "print" ? 96 : 60;
    const encX = 26;
    const encY = headerH + 14;

    // Largura: bordas (PE+N) + etiqueta + módulo + fio + pente
    const sideW = G.padX + 2 * G.stripW + 10;         // faixas PE/N
    const colW = G.tagW + 8 + G.modW + 46;            // etiqueta+módulo+fio
    const combSpan = (phases.length - 1) * G.combGap + G.combW + 30;
    const encW = Math.max(2 * (sideW + colW) + combSpan, 780);
    const width = encW + 2 * encX;
    const cx = encX + encW / 2;

    const titleY = encY + 26;
    // Zona de entrada no estilo do diagrama de ligação clássico:
    // linhas de alimentação horizontais A(R)/B(S)/C(T)/N/PE no topo,
    // QG (geral) derivado delas ao centro, DR tetrapolar abaixo
    // (recebendo também o N) e banco de DPS em paralelo à direita,
    // derivado ENTRE o QG e o DR, drenando ao PE.
    const supX0 = encX + G.padX + 46;
    const supX1 = encX + encW - G.padX - 10;
    const supY = {};
    ["A", "B", "C"].slice(0, phases.length).concat(["N", "PE"]).forEach((p, i) => {
      supY[p] = encY + 54 + i * 9;
    });
    const supYEnd = encY + 54 + (phases.length + 1) * 9;

    const qg = { w: 78, h: 56, y: encY + 158 };                 // QG 3P centrado
    qg.x = cx - qg.w / 2;
    qg.poleXs = phases.map((p, i) => cx + (i - (phases.length - 1) / 2) * 22);
    const dr = { w: 104, h: 56, y: encY + 252 };                // DR (fases+N) abaixo
    dr.x = cx - dr.w / 2;
    dr.termXs = [-1.5, -0.5, 0.5, 1.5].slice(0, phases.length + 1)
      .map(k => cx + k * (phases.length >= 3 ? 24 : 30));       // N + fases
    const tkY = encY + 214;                                     // nível de derivação QG→DR
    const spdBank = {                                           // banco de DPS à direita
      modW: 26, gap: 7, count: phases.length + 1,
      yTop: dr.y - dr.h / 2
    };
    spdBank.x0 = cx + dr.w / 2 + 96;

    const combTop = dr.y + dr.h / 2 + 46;
    const rowsY0 = combTop + 26;
    const rowsYEnd = rowsY0 + Math.max(cols.rows, 1) * G.rowH;
    const combBottom = rowsYEnd + 6;
    const busLabelY = combBottom + 16; // correntes/utilização por fase
    const encH = busLabelY + phases.length * 13 + 22 - encY;
    const height = encY + encH + (opts.theme === "print" ? 52 : 30);

    // Barras verticais do pente (centralizadas)
    const combX = {};
    phases.forEach((p, i) => {
      combX[p] = cx + (i - (phases.length - 1) / 2) * G.combGap;
    });

    // Colunas
    const leftCol = {
      peX: encX + G.padX,                       // faixa PE (externa)
      nX: encX + G.padX + G.stripW + 6,         // faixa N (interna)
      tagX: encX + sideW + 4,
      modX: encX + sideW + 4 + G.tagW + 8
    };
    const rightCol = {
      peX: encX + encW - G.padX - G.stripW,
      nX: encX + encW - G.padX - 2 * G.stripW - 6,
      tagX: encX + encW - sideW - 4 - G.tagW,
      modX: encX + encW - sideW - 4 - G.tagW - 8 - G.modW
    };

    const rowY = i => rowsY0 + i * G.rowH + G.rowH / 2;

    return {
      headerH, encX, encY, encW, encH, width, height, cx,
      titleY, supX0, supX1, supY, supYEnd, qg, dr, tkY, spdBank,
      combTop, combBottom, busLabelY,
      combX, phases, cols, rowY, rowsY0, rowsYEnd,
      leftCol, rightCol
    };
  }

  /* ==============================================================
   * Defs
   * ============================================================== */
  function defs(P) {
    return `<defs>
      <linearGradient id="qtw-copper" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${P.copperTop}"/>
        <stop offset="0.45" stop-color="${P.copperMid}"/>
        <stop offset="1" stop-color="${P.copperLow}"/>
      </linearGradient>
      <linearGradient id="qtw-steel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${P.steelTop}"/>
        <stop offset="1" stop-color="${P.steelLow}"/>
      </linearGradient>
      <linearGradient id="qtw-rail" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${P.rail}"/>
        <stop offset="0.5" stop-color="${P.railDark}"/>
        <stop offset="1" stop-color="${P.rail}"/>
      </linearGradient>
      <g id="qtw-sym-ground">
        ${ln(0, -7, 0, 0, 'stroke="currentColor" stroke-width="1.6" stroke-linecap="round"')}
        ${ln(-7, 0, 7, 0, 'stroke="currentColor" stroke-width="1.6" stroke-linecap="round"')}
        ${ln(-4.5, 3.5, 4.5, 3.5, 'stroke="currentColor" stroke-width="1.4" stroke-linecap="round"')}
        ${ln(-2, 7, 2, 7, 'stroke="currentColor" stroke-width="1.2" stroke-linecap="round"')}
      </g>
    </defs>`;
  }

  /* ==============================================================
   * Blocos
   * ============================================================== */

  function header(model, P, L, opts) {
    const s = model.summary;
    const proj = opts.projectName || "EasyEletric — Projeto Elétrico Residencial";
    let out = "";
    if (opts.theme === "print") {
      out += rc(0, 0, L.width, 96, 'fill="#ffffff" stroke="#000" stroke-width="2"');
      out += ln(0, 60, L.width, 60, 'stroke="#000" stroke-width="1"');
      out += tx(L.width / 2, 28, "QUADRO DE DISTRIBUIÇÃO — LAYOUT DO PAINEL", 'text-anchor="middle" font-size="19" font-weight="800" fill="#000" letter-spacing="4"');
      out += tx(L.width / 2, 48, "ABNT NBR 5410:2023 — Instalações Elétricas de Baixa Tensão", 'text-anchor="middle" font-size="10" fill="#333"');
      out += tx(14, 80, `Projeto: ${proj}`, 'font-size="10" fill="#000"');
      out += tx(L.width / 2, 80, `Sistema ${s.supplyType} · esquema ${opts.scheme} · ${s.circuits} circuitos · Demanda ${fmt(s.demandVA / 1000, 2)} kVA`, 'text-anchor="middle" font-size="10" fill="#000"');
      out += tx(L.width - 14, 80, opts.date ? `Data: ${opts.date}` : "EasyEletric v3.7", 'text-anchor="end" font-size="10" fill="#000"');
    } else {
      out += tx(L.encX, 30, "SMART DISTRIBUTION BOARD — QDF", `font-size="15" font-weight="800" fill="${P.ink}" letter-spacing="2"`);
      out += tx(L.encX, 48, `${proj} · NBR 5410:2023 · esquema ${opts.scheme}`, `font-size="10" fill="${P.dim}"`);
      const sc = statusColor(P, s.status);
      out += ci(L.width - L.encX - 6, 26, 5, `fill="${sc}"`);
      out += tx(L.width - L.encX - 18, 30, s.status === "PASS" ? "CONFORME" : s.status === "WARN" ? "ATENÇÃO" : "VIOLAÇÃO",
        `text-anchor="end" font-size="10" font-weight="700" fill="${sc}"`);
    }
    return out;
  }

  function enclosure(model, P, L, opts) {
    const p = model.byId.panel;
    let out = "";
    out += rc(L.encX, L.encY, L.encW, L.encH, `fill="${P.enclosure}" stroke="${P.enclosureStroke}" stroke-width="2" rx="10"`);
    out += rc(L.encX + 8, L.encY + 40, L.encW - 16, L.encH - 50, `fill="${P.plate}" stroke="${P.plateStroke}" stroke-width="1" rx="6"`);
    [[L.encX + 12, L.encY + 12], [L.encX + L.encW - 12, L.encY + 12],
     [L.encX + 12, L.encY + L.encH - 12], [L.encX + L.encW - 12, L.encY + L.encH - 12]]
      .forEach(([x, y]) => {
        out += ci(x, y, 3.4, `fill="url(#qtw-steel)" stroke="${P.plateStroke}" stroke-width="0.8"`);
        out += ln(x - 1.8, y, x + 1.8, y, `stroke="${P.dimIn}" stroke-width="0.9"`);
      });
    const sc = statusColor(P, p.validation.status);
    out += `<g class="qtw-node" data-node="panel" data-kind="panel">`;
    out += rc(L.encX + 16, L.encY + 8, L.encW - 32, 26, `fill="${P.module}" stroke="${opts.overlays.validation ? sc : P.moduleStroke}" stroke-width="1.2" rx="5"`);
    out += tx(L.encX + 28, L.titleY, p.label, `font-size="11" font-weight="800" fill="${P.inkIn}"`);
    if (p.calc.installedVA != null) {
      out += tx(L.encX + L.encW - 28, L.titleY,
        `Instalada ${fmt(p.calc.installedVA / 1000, 2)} kVA → Demanda ${fmt(p.calc.demandVA / 1000, 2)} kVA (Fd ${fmt(p.calc.overallFactor * 100, 0)}%) · Icc ${fmt(p.calc.iccBoardA / 1000, 1)} kA`,
        `text-anchor="end" font-size="8.5" fill="${P.dimIn}"`);
    }
    out += `</g>`;
    return out;
  }

  /** Módulo DIN horizontal (corpo + alavanca lateral + LED). */
  function moduleBody(x, y, w, h, P, opts, status) {
    const sc = statusColor(P, status);
    let out = rc(x, y, w, h, `fill="${P.module}" stroke="${P.moduleStroke}" stroke-width="1.2" rx="4"`);
    out += rc(x + 6, y + h / 2 - 8, 11, 16, `fill="${P.plate}" stroke="${P.moduleStroke}" stroke-width="1" rx="2"`);
    out += rc(x + 8, y + h / 2 - 6, 7, 7, `fill="${sc}" rx="1.4"`);
    if (opts.overlays.validation) out += ci(x + w - 7, y + 7, 2.6, `class="qtw-ov qtw-ov-validation" fill="${sc}"`);
    return out;
  }

  /* Cor da alavanca dos dispositivos (azul de catálogo, como nas
   * fotos de disjuntores residenciais) */
  const LEVER = "#3a66b8";

  /** Parafuso de terminal (círculo com fenda). */
  function screw(x, y, P, r) {
    r = r || 2.6;
    return ci(x, y, r, `fill="url(#qtw-steel)" stroke="${P.moduleStroke}" stroke-width="0.7"`) +
      ln(x - r * 0.55, y, x + r * 0.55, y, `stroke="${P.dimIn}" stroke-width="0.8"`);
  }

  /** Disjuntor multipolar realista (corpo, divisões, alavancas,
   *  parafusos de terminal em cima e embaixo). */
  function breakerDevice(x, y, w, h, poles, P, opts, status) {
    const sc = statusColor(P, status);
    const pw = w / poles;
    let out = rc(x, y, w, h, `fill="${P.module}" stroke="${P.moduleStroke}" stroke-width="1.3" rx="4"`);
    for (let i = 1; i < poles; i++)
      out += ln(x + i * pw, y + 3, x + i * pw, y + h - 3, `stroke="${P.plateStroke}" stroke-width="0.8"`);
    for (let i = 0; i < poles; i++) {
      const px = x + (i + 0.5) * pw;
      out += screw(px, y + 6, P);
      out += screw(px, y + h - 6, P);
      out += rc(px - 4.5, y + h / 2 - 10, 9, 20, `fill="${P.plate}" stroke="${P.moduleStroke}" stroke-width="0.9" rx="2"`);
      out += rc(px - 3, y + h / 2 - 8, 6, 9, `fill="${LEVER}" rx="1.5"`);
    }
    if (opts.overlays.validation) out += ci(x + w - 5, y + 5, 2.4, `class="qtw-ov qtw-ov-validation" fill="${sc}"`);
    return out;
  }

  /** DR/IDR tetrapolar realista (corpo largo, alavanca única,
   *  botão de teste "T" e parafusos por polo). */
  function drDevice(x, y, w, h, poles, P, opts, status) {
    const sc = statusColor(P, status);
    const pw = w / poles;
    let out = rc(x, y, w, h, `fill="${P.module}" stroke="${P.moduleStroke}" stroke-width="1.3" rx="4"`);
    for (let i = 0; i < poles; i++) {
      const px = x + (i + 0.5) * pw;
      out += screw(px, y + 6, P);
      out += screw(px, y + h - 6, P);
    }
    out += rc(x + w / 2 - 22, y + h / 2 - 10, 9, 20, `fill="${P.plate}" stroke="${P.moduleStroke}" stroke-width="0.9" rx="2"`);
    out += rc(x + w / 2 - 20.5, y + h / 2 - 8, 6, 9, `fill="${LEVER}" rx="1.5"`);
    out += rc(x + w / 2 + 8, y + h / 2 - 5, 10, 10, `fill="${P.plate}" stroke="${P.moduleStroke}" stroke-width="0.9" rx="2"`);
    out += tx(x + w / 2 + 13, y + h / 2 + 2.6, "T", `text-anchor="middle" font-size="6.5" font-weight="800" fill="${P.dimIn}"`);
    if (opts.overlays.validation) out += ci(x + w - 5, y + 5, 2.4, `class="qtw-ov qtw-ov-validation" fill="${sc}"`);
    return out;
  }

  /** Zona de entrada no estilo do diagrama de ligação clássico:
   *
   *   A(R)/B(S)/C(T)/N/PE ──────────────── (linhas de alimentação)
   *        │ │ │                       │(N)
   *        [ QG 3P ]                   │
   *        │ │ │  ── derivação ──→ [DPS][DPS][DPS][DPS]  (paralelo)
   *      [ DR 4P ]←N                   └──── PE (verde)
   *        │ │ │
   *      "Circuitos" → pente central
   */
  function incomingZone(model, P, L, opts) {
    const by = model.byId;
    const feeder = by.feeder, main = by["main-breaker"], spd = by.spd, mrcd = by["main-rcd"];
    const phN = L.phases.concat(["N"]);
    const supplyLbl = { A: "A (R)", B: "B (S)", C: "C (T)", N: "N", PE: "PE" };
    let out = "";

    // ── Linhas de alimentação horizontais (nó feeder) ────────────
    out += `<g class="qtw-node" data-node="feeder" data-kind="conductor">`;
    Object.keys(L.supY).forEach(p => {
      const yy = L.supY[p];
      out += ln(L.supX0, yy, L.supX1, yy, wire(WIRES[p], p === "N" || p === "PE" ? 2.2 : 2.6));
      out += tx(L.supX0 - 6, yy + 2.8, supplyLbl[p] || p, `text-anchor="end" font-size="7.5" font-weight="800" fill="${WIRES[p]}"`);
    });
    // dados do alimentador (bloco à esquerda, sob os rótulos)
    if (feeder.data.section) {
      const fx = L.encX + G.padX + 6;
      out += tx(fx, L.supYEnd + 24, "ALIMENTADOR", `font-size="7.5" font-weight="700" letter-spacing="1" fill="${P.dimIn}"`);
      out += tx(fx, L.supYEnd + 35, `${feeder.data.section} mm² + N ${feeder.data.neutral} + PE ${feeder.data.pe} mm²`, `font-size="8" font-weight="700" fill="${P.inkIn}"`);
      out += tx(fx, L.supYEnd + 45, `${feeder.data.lengthM} m · ${feeder.data.method} · Izc ${fmt(feeder.calc.Izc)} A`, `font-size="7.5" fill="${P.dimIn}"`);
      let fy = L.supYEnd + 55;
      if (opts.overlays.current) {
        out += tx(fx, fy, `Ib ${fmt(feeder.calc.Ib)} A (dim. ${fmt(feeder.calc.Idim)} A)`, `class="qtw-ov qtw-ov-current" font-size="7.5" fill="${P.accent}"`);
        fy += 10;
      }
      if (opts.overlays.drop) {
        out += tx(fx, fy, `ΔV ${fmt(feeder.calc.dropPct, 2)}% ≤ ${feeder.calc.maxDropPct}%`, `class="qtw-ov qtw-ov-drop" font-size="7.5" fill="${statusColor(P, feeder.validation.status)}"`);
      }
    }
    out += `</g>`;

    // N e PE das linhas → barras verticais das bordas (ortogonal)
    [["N", L.leftCol.nX, L.rightCol.nX], ["PE", L.leftCol.peX, L.rightCol.peX]].forEach(([p, xl, xr]) => {
      const yy = L.supY[p];
      [xl + G.stripW / 2, xr + G.stripW / 2].forEach(bx => {
        out += ci(bx, yy, 2.2, `fill="${WIRES[p]}"`);
        out += ln(bx, yy, bx, L.rowsY0 - 14, wire(WIRES[p], 1.8));
      });
    });

    // ── QG: derivações das fases (pontos de junção) → disjuntor ──
    const qg = L.qg;
    out += `<g class="qtw-node" data-node="main-breaker" data-kind="breaker">`;
    L.phases.forEach((p, i) => {
      const px = qg.poleXs[i];
      out += ci(px, L.supY[p], 2.6, `fill="${WIRES[p]}"`);
      out += ln(px, L.supY[p], px, qg.y - qg.h / 2, wire(WIRES[p], 2.4));
    });
    out += breakerDevice(qg.x, qg.y - qg.h / 2, qg.w, qg.h, L.phases.length, P, opts, main.validation.status);
    out += tx(qg.x - 10, qg.y - 12, "QG", `text-anchor="end" font-size="10" font-weight="800" fill="${P.inkIn}"`);
    out += tx(qg.x - 10, qg.y, main.data.In ? `${main.data.In} A · ${main.data.curve} · ${main.data.poles}P` : "—", `text-anchor="end" font-size="8" font-weight="700" fill="${P.inkIn}"`);
    const mainRef = opts.catalog && opts.catalog.byNode && opts.catalog.byNode["main-breaker"];
    if (mainRef) out += tx(qg.x - 10, qg.y + 10, `${mainRef.maker} ${mainRef.reference}`, `class="qtw-cat" text-anchor="end" font-size="5.5" fill="${P.dimIn}" font-family="monospace"`);
    if (opts.overlays.icc && main.calc.icnRequiredA)
      out += tx(qg.x - 10, qg.y + 20, `Icn ≥ ${fmt(main.calc.icnRequiredA / 1000, 1)} kA`, `class="qtw-ov qtw-ov-icc" text-anchor="end" font-size="7" fill="${P.dimIn}"`);
    out += `</g>`;

    // ── QG → DR (jogos ortogonais) com DERIVAÇÃO do DPS no meio ──
    const dr = L.dr;
    const drTerms = dr.termXs;                 // [N, A, B, C]
    L.phases.forEach((p, i) => {
      const x0 = qg.poleXs[i];
      const x1 = drTerms[i + 1];
      const yJog = L.tkY + i * 5;
      out += ln(x0, qg.y + qg.h / 2, x0, yJog, wire(WIRES[p], 2.4));
      out += ln(x0, yJog, x1, yJog, wire(WIRES[p], 2.4));
      out += ln(x1, yJog, x1, dr.y - dr.h / 2, wire(WIRES[p], 2.4));
    });
    // Neutro: da linha N direto ao 1º terminal do DR (azul)
    out += ci(drTerms[0], L.supY.N, 2.6, `fill="${WIRES.N}"`);
    out += ln(drTerms[0], L.supY.N, drTerms[0], dr.y - dr.h / 2, wire(WIRES.N, 2.2));

    // ── Banco de DPS à direita, em PARALELO (derivado entre QG e DR) ──
    const S = L.spdBank;
    const bankW = S.count * (S.modW + S.gap) - S.gap;
    out += `<g class="qtw-node" data-node="spd" data-kind="spd">`;
    for (let i = 0; i < S.count; i++) {
      const x = S.x0 + i * (S.modW + S.gap);
      const mcx = x + S.modW / 2;
      const ph = phN[i] || "N";
      const isN = ph === "N";
      // alimentação do módulo: fases derivam do jogo QG→DR; N deriva da linha N
      if (!isN) {
        const k = L.phases.indexOf(ph);
        const yJog = L.tkY + k * 5;
        const tapX = drTerms[k + 1];
        out += ci(tapX, yJog, 2.4, `fill="${WIRES[ph]}"`);
        out += pa(`M ${tapX} ${yJog} L ${mcx} ${yJog} L ${mcx} ${S.yTop}`, wire(WIRES[ph], 2));
      } else {
        out += ci(mcx, L.supY.N, 2.4, `fill="${WIRES.N}"`);
        out += ln(mcx, L.supY.N, mcx, S.yTop, wire(WIRES.N, 2));
      }
      // módulo DPS realista: janela verde de status + terminais
      out += rc(x, S.yTop, S.modW, 56, `fill="${P.module}" stroke="${P.moduleStroke}" stroke-width="1.2" rx="3"`);
      out += screw(mcx, S.yTop + 5, P, 2.2);
      out += rc(x + 4, S.yTop + 12, S.modW - 8, 10, `fill="#21a453" stroke="${P.moduleStroke}" stroke-width="0.7" rx="1.5"`);
      out += tx(mcx, S.yTop + 30, "DPS", `text-anchor="middle" font-size="6" font-weight="800" fill="${P.dimIn}"`);
      if (isN && opts.scheme === "TT") {
        // centelhador N-PE (símbolo de gap)
        out += ln(mcx - 4, S.yTop + 38, mcx - 1.4, S.yTop + 38, `stroke="${P.inkIn}" stroke-width="1.3"`);
        out += ln(mcx + 1.4, S.yTop + 38, mcx + 4, S.yTop + 38, `stroke="${P.inkIn}" stroke-width="1.3"`);
        out += ln(mcx - 1.4, S.yTop + 35, mcx - 1.4, S.yTop + 41, `stroke="${P.inkIn}" stroke-width="1.3"`);
        out += ln(mcx + 1.4, S.yTop + 35, mcx + 1.4, S.yTop + 41, `stroke="${P.inkIn}" stroke-width="1.3"`);
      } else {
        out += tx(mcx, S.yTop + 41, ph, `text-anchor="middle" font-size="7" font-weight="800" fill="${WIRES[ph]}"`);
      }
      out += screw(mcx, S.yTop + 51, P, 2.2);
      // dreno ao coletor de terra (verde)
      out += ln(mcx, S.yTop + 56, mcx, S.yTop + 66, wire(WIRES.PE, 1.8));
    }
    // coletor verde → barra PE da borda direita
    const colY = S.yTop + 66;
    out += ln(S.x0 + S.modW / 2, colY, S.x0 + bankW - S.modW / 2, colY, wire(WIRES.PE, 2.2));
    out += ln(S.x0 + bankW - S.modW / 2, colY, L.rightCol.peX + G.stripW / 2, colY, wire(WIRES.PE, 2.2));
    out += ci(L.rightCol.peX + G.stripW / 2, colY, 2.4, `fill="${WIRES.PE}"`);
    out += `<use href="#qtw-sym-ground" transform="translate(${S.x0 + bankW / 2},${colY + 9}) scale(0.8)" style="color:${WIRES.PE}"/>`;
    // rótulos do banco (abaixo do coletor, fora do caminho dos fios)
    out += tx(S.x0 + bankW + 10, S.yTop + 16, "DPS's", `font-size="9" font-weight="800" fill="${P.inkIn}"`);
    out += tx(S.x0 - 26, colY + 22, "INSTALAÇÃO EM PARALELO (derivação) — NBR 5410 §6.3.5.2", `font-size="6.5" font-weight="700" letter-spacing="0.4" fill="${P.dimIn}"`);
    out += tx(S.x0 - 26, colY + 31, "Derivado entre o QG e o DR (a montante do DR)", `font-size="6.5" fill="${P.dimIn}"`);
    out += tx(S.x0 - 26, colY + 40, opts.scheme === "TT"
      ? `Esquema TT: conexão ${L.phases.length}+1 — N–PE por centelhador`
      : "Esquema TN-S: modo comum — fases e N ao PE", `font-size="6.5" fill="${P.dimIn}"`);
    if (spd.data.imaxKA) {
      out += tx(S.x0 - 26, colY + 49, `Classe ${spd.data.class} · Imax ${spd.data.imaxKA} kA · In ${spd.data.inKA} kA · Uc ≥ ${spd.data.ucV} V · ${spd.data.standard || "IEC 61643-11"}`, `font-size="6.5" fill="${P.dimIn}"`);
    }
    out += `</g>`;

    // ── DR tetrapolar (recebe fases do QG + neutro da linha N) ──
    out += `<g class="qtw-node" data-node="main-rcd" data-kind="rcd">`;
    out += drDevice(dr.x, dr.y - dr.h / 2, dr.w, dr.h, L.phases.length + 1, P, opts, mrcd.validation.status);
    out += tx(dr.x - 10, dr.y - 6, "DR", `text-anchor="end" font-size="10" font-weight="800" fill="${P.inkIn}"`);
    out += tx(dr.x - 10, dr.y + 5, mrcd.data.In ? `${mrcd.data.In} A / ${mrcd.data.sensitivityMa} mA` : "—", `text-anchor="end" font-size="8" font-weight="700" fill="${P.inkIn}"`);
    const drRef = opts.catalog && opts.catalog.byNode && opts.catalog.byNode["main-rcd"];
    if (drRef) out += tx(dr.x - 10, dr.y + 15, drRef.reference, `class="qtw-cat" text-anchor="end" font-size="5.5" fill="${P.dimIn}" font-family="monospace"`);
    out += `</g>`;

    // ── DR → "Circuitos" → pente central ─────────────────────────
    L.phases.forEach((p, i) => {
      const x0 = drTerms[i + 1];
      const x1 = L.combX[p];
      const yJog = dr.y + dr.h / 2 + 12 + i * 5;
      out += ln(x0, dr.y + dr.h / 2, x0, yJog, wire(WIRES[p], 2.4));
      out += ln(x0, yJog, x1, yJog, wire(WIRES[p], 2.4));
      out += ln(x1, yJog, x1, L.combTop, wire(WIRES[p], 2.4));
    });
    // rótulo "Circuitos" (como no diagrama de referência)
    out += rc(L.cx - 118, L.combTop - 18, 62, 15, `fill="${P.module}" stroke="${P.err}" stroke-width="1.1" rx="2"`);
    out += tx(L.cx - 87, L.combTop - 7.5, "Circuitos", `text-anchor="middle" font-size="8" font-weight="700" fill="${P.inkIn}"`);
    return out;
  }

  /** Pente de cobre VERTICAL central (uma barra por fase). */
  function comb(model, P, L, opts) {
    const main = model.byId["main-breaker"];
    const capacity = main && main.data.In;
    let out = "";
    L.phases.forEach((p, i) => {
      const node = model.byId["bus-" + p];
      if (!node) return;
      const x = L.combX[p];
      out += `<g class="qtw-node" data-node="bus-${p}" data-kind="busbar">`;
      // barra de cobre vertical com furos
      out += rc(x - G.combW / 2, L.combTop, G.combW, L.combBottom - L.combTop, `fill="url(#qtw-copper)" stroke="${P.copperLow}" stroke-width="0.8" rx="2"`);
      for (let hy = L.combTop + 20; hy < L.combBottom - 10; hy += 44) {
        out += ci(x, hy, 1.6, `fill="${P.copperLow}" opacity="0.75"`);
      }
      // terminal de identificação no topo (cor da fase + letra)
      out += rc(x - 8, L.combTop - 12, 16, 12, `fill="${WIRES[p]}" rx="2.5"`);
      out += tx(x, L.combTop - 3, p, `text-anchor="middle" font-size="8" font-weight="800" fill="#fff"`);
      // corrente / utilização / reserva (rodapé do pente)
      if (opts.overlays.current) {
        const currentA = node.calc.currentA || 0;
        const utilPct = capacity ? Math.round(currentA / capacity * 100) : null;
        const uc = utilPct >= 100 ? P.err : utilPct >= 80 ? P.warn : P.dimIn;
        out += tx(L.cx, L.busLabelY + i * 13,
          `Fase ${p} (${WIRE_NAMES[p]}): ${fmt(currentA)} A${utilPct != null ? ` · ${utilPct}% util. · ${Math.max(0, 100 - utilPct)}% reserva` : ""}`,
          `class="qtw-ov qtw-ov-current" text-anchor="middle" font-size="7.5" font-weight="600" fill="${uc === P.dimIn ? WIRES[p] : uc}"`);
      }
      out += `</g>`;
    });
    return out;
  }

  /** Coluna de um circuito: stub do pente → IDR/disjuntor → fio de
   *  saída (cor da fase) → etiqueta de carga → N/PE nas bordas. */
  function circuitRow(model, circ, y, col, side, P, L, opts) {
    const by = model.byId;
    const brk = by[circ.breakerId], rcd = circ.rcdId ? by[circ.rcdId] : null;
    const cond = by[circ.conductorId], load = by[circ.loadId];
    const isLeft = side === "left";
    const modX = col.modX, tagX = col.tagX;
    const modIn = isLeft ? modX + G.modW : modX;       // lado do pente
    const modOut = isLeft ? modX : modX + G.modW;      // lado da carga
    const dir = isLeft ? 1 : -1;
    let out = `<g class="qtw-circuit" data-circuit="${circ.n}">`;

    // Stubs do pente até o módulo (cor da fase; multipolar = 1 por fase)
    out += `<g class="qtw-node" data-node="${circ.breakerId}" data-kind="breaker">`;
    circ.phases.forEach((p, k) => {
      const sy = y - (circ.phases.length - 1) * 3.5 + k * 7;
      out += ci(L.combX[p], sy, 2.4, `fill="${WIRES[p]}"`);
      out += ln(L.combX[p], sy, modIn, sy, wire(WIRES[p], 2));
    });

    // Módulo do disjuntor (horizontal)
    out += moduleBody(modX, y - G.modH / 2, G.modW, G.modH, P, opts, brk.validation.status);
    out += tx(modX + 24, y - 5, `C${String(circ.n).padStart(2, "0")} · ${circ.phases.length}P ${brk.data.curve}`, `font-size="6.5" font-weight="700" fill="${P.dimIn}"`);
    out += tx(modX + 24, y + 8, `${brk.data.In} A`, `font-size="10" font-weight="800" fill="${P.inkIn}"`);
    const brkRef = opts.catalog && opts.catalog.byNode && opts.catalog.byNode[circ.breakerId];
    if (brkRef) out += tx(modX + 55, y + 8, brkRef.reference, `class="qtw-cat" font-size="5.2" fill="${P.dimIn}" font-family="monospace"`);
    out += `</g>`;

    // IDR do circuito (badge sob o módulo) — IDR = por circuito
    if (rcd) {
      out += `<g class="qtw-node" data-node="${circ.rcdId}" data-kind="rcd">`;
      out += rc(modX + 22, y + G.modH / 2 + 1, 62, 10, `fill="${P.plate}" stroke="${P.moduleStroke}" stroke-width="0.8" rx="3"`);
      out += tx(modX + 53, y + G.modH / 2 + 8.5, `IDR ${rcd.data.sensitivityMa} mA`, `text-anchor="middle" font-size="6.5" font-weight="700" fill="${P.inkIn}"`);
      out += `</g>`;
    }

    // Fio de saída (cor da 1ª fase) + rótulos do cabo
    const tagEdge = isLeft ? tagX + G.tagW : tagX;
    const wc = WIRES[circ.phases[0]] || WIRES.A;
    out += `<g class="qtw-node" data-node="${circ.conductorId}" data-kind="conductor">`;
    out += ln(modOut, y, tagEdge, y, wire(wc, 2.2));
    let lbl = `${cond.data.section} mm² · ${cond.data.lengthM} m · ${cond.data.method}`;
    const parts = [];
    if (opts.overlays.current) parts.push(`Ib ${fmt(cond.calc.Ib)} A`);
    if (opts.overlays.drop) parts.push(`ΔV ${fmt(cond.calc.dropPct, 2)}%`);
    if (opts.overlays.icc) parts.push(`Icc ${fmt(cond.calc.iccEndA / 1000, 1)} kA`);
    const lx = modX + G.modW / 2;
    out += tx(lx, y - G.modH / 2 - 10, lbl, `text-anchor="middle" font-size="6.5" fill="${P.dimIn}"`);
    if (parts.length) {
      const dropStatus = statusColor(P, cond.validation.status);
      out += tx(lx, y - G.modH / 2 - 3, parts.join(" · "), `class="qtw-ov" text-anchor="middle" font-size="6.5" fill="${opts.overlays.drop ? dropStatus : P.accent}"`);
    }
    out += `</g>`;

    // Etiqueta da carga + ligações N (azul) e PE (verde) às barras
    const lsc = statusColor(P, load.validation.status);
    out += `<g class="qtw-node" data-node="${circ.loadId}" data-kind="load">`;
    out += `<title>${esc(load.data.name)} — ${fmt(load.data.powerVA, 0)} VA · ${esc(load.data.wiring)}</title>`;
    out += rc(tagX, y - 13, G.tagW, 26, `fill="${P.module}" stroke="${opts.overlays.validation ? lsc : P.moduleStroke}" stroke-width="1" rx="4"`);
    out += tx(tagX + G.tagW / 2, y - 2.5, trunc(load.data.name, 16), `text-anchor="middle" font-size="7" font-weight="600" fill="${P.inkIn}"`);
    out += tx(tagX + G.tagW / 2, y + 7.5, `${fmt(load.data.powerVA, 0)} VA · ${load.data.wiring}`, `text-anchor="middle" font-size="6" fill="${P.dimIn}"`);
    // N e PE da carga às barras da borda
    const outEdge = isLeft ? tagX : tagX + G.tagW;
    out += ln(outEdge, y - 5, col.nX + G.stripW / 2, y - 5, wire(WIRES.N, 1.4));
    out += ln(outEdge, y + 5, col.peX + G.stripW / 2, y + 5, wire(WIRES.PE, 1.4));
    out += `</g>`;

    out += `</g>`;
    return out;
  }

  /** Barras verticais de N (azul) e PE (verde) nas duas bordas. */
  function edgeBars(model, P, L, opts) {
    const busN = model.byId["bus-N"], busPE = model.byId["bus-PE"];
    const y0 = L.rowsY0 - 14, y1 = L.rowsYEnd + 8;
    let out = "";

    const strip = (x, color) => {
      let s = rc(x, y0, G.stripW, y1 - y0, `fill="url(#qtw-steel)" stroke="${P.plateStroke}" stroke-width="0.8" rx="2"`);
      s += rc(x, y0 - 10, G.stripW, 8, `fill="${color}" rx="2"`);
      for (let sy = y0 + 10; sy < y1 - 6; sy += 15) {
        s += ci(x + G.stripW / 2, sy, 1.8, `fill="${P.plate}" stroke="${P.dimIn}" stroke-width="0.6"`);
      }
      return s;
    };

    if (busN) {
      out += `<g class="qtw-node" data-node="bus-N" data-kind="busbar">`;
      out += strip(L.leftCol.nX, WIRES.N) + strip(L.rightCol.nX, WIRES.N);
      out += tx(L.leftCol.nX + G.stripW / 2, y1 + 12, "N", `text-anchor="middle" font-size="8" font-weight="800" fill="${WIRES.N}"`);
      out += tx(L.rightCol.nX + G.stripW / 2, y1 + 12, "N", `text-anchor="middle" font-size="8" font-weight="800" fill="${WIRES.N}"`);
      const inLbl = (opts.overlays.current && busN.calc.currentA != null)
        ? `BARRA DE NEUTRO (N) — azul-claro · IN ≈ ${fmt(busN.calc.currentA)} A · ${busN.sub}` : `BARRA DE NEUTRO (N) — azul-claro · ${busN.sub}`;
      out += tx(L.cx, L.busLabelY + L.phases.length * 13 + 2, inLbl, `text-anchor="middle" font-size="7.5" font-weight="700" fill="${WIRES.N}"`);
      out += `</g>`;
    }
    if (busPE) {
      out += `<g class="qtw-node" data-node="bus-PE" data-kind="busbar">`;
      out += strip(L.leftCol.peX, WIRES.PE) + strip(L.rightCol.peX, WIRES.PE);
      out += `<use href="#qtw-sym-ground" transform="translate(${L.leftCol.peX + G.stripW / 2},${y1 + 18}) scale(0.7)" style="color:${WIRES.PE}"/>`;
      out += `<use href="#qtw-sym-ground" transform="translate(${L.rightCol.peX + G.stripW / 2},${y1 + 18}) scale(0.7)" style="color:${WIRES.PE}"/>`;
      out += tx(L.cx, L.busLabelY + L.phases.length * 13 + 12, `BARRA DE PROTEÇÃO (PE) — verde · ${busPE.sub}`, `text-anchor="middle" font-size="7.5" font-weight="700" fill="${WIRES.PE}"`);
      out += `</g>`;
    }
    return out;
  }

  function legend(P, L, theme, scheme) {
    const y = L.encY + L.encH + 16;
    let x = L.encX;
    let out = `<g class="qtw-legend" font-size="8">`;
    L.phases.forEach(p => {
      out += rc(x, y - 6, 14, 7, `fill="${WIRES[p]}" rx="1.5"`);
      out += tx(x + 18, y, `Fase ${p} — ${WIRE_NAMES[p]}`, `font-size="8" fill="${P.dim}"`);
      x += 118;
    });
    out += rc(x, y - 6, 14, 7, `fill="${WIRES.N}" rx="1.5"`);
    out += tx(x + 18, y, "Neutro — azul-claro", `font-size="8" fill="${P.dim}"`);
    x += 128;
    out += rc(x, y - 6, 14, 7, `fill="${WIRES.PE}" rx="1.5"`);
    out += tx(x + 18, y, "PE — verde", `font-size="8" fill="${P.dim}"`);
    x += 84;
    out += rc(x, y - 6, 14, 7, `fill="url(#qtw-copper)" rx="1.5"`);
    out += tx(x + 18, y, "Pente de cobre", `font-size="8" fill="${P.dim}"`);
    x += 104;
    out += tx(x, y, `Cores NBR 5410 §6.1.5.3 · Esquema ${scheme}`, `font-size="8" fill="${P.dim}"`);
    out += `</g>`;
    if (theme === "print") {
      out += tx(L.encX, L.height - 14,
        "EasyEletric v3.7 — Smart Distribution Board | ABNT NBR 5410:2023 | Pré-dimensionamento — não substitui projeto assinado com ART/RRT",
        `font-size="7.5" fill="${P.dim}"`);
    }
    return out;
  }

  /* ==============================================================
   * Render principal
   * ============================================================== */

  /**
   * Renderiza o Smart Distribution Board do modelo.
   * @param model ElectricalProjectModel (EEProjectModel.build)
   * @param opts {theme, overlays, projectName, date,
   *              scheme?  "TT" (padrão) | "TN-S" — NBR 5410 §5.1.2.2,
   *              catalog?  EEManufacturerCatalog.forModel}
   * @returns string SVG autocontido
   */
  function render(model, opts) {
    opts = Object.assign({ theme: "dark", projectName: "", date: "", scheme: "TT" }, opts || {});
    opts.overlays = Object.assign({}, DEFAULT_OVERLAYS, opts.overlays || {});
    if (opts.scheme !== "TT" && opts.scheme !== "TN-S") opts.scheme = "TT";
    const P = THEMES[opts.theme] || THEMES.dark;
    if (!THEMES[opts.theme]) opts = Object.assign({}, opts, { theme: "dark" });
    const L = layout(model, opts);

    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" ` +
      `viewBox="0 0 ${L.width} ${L.height}" class="qtw-svg qtw-theme-${opts.theme}" ` +
      `font-family="Inter,Segoe UI,Arial,sans-serif" data-twin-version="${model.version}">`;
    s += `<style>
      .qtw-node{cursor:pointer}
      .qtw-svg.qtw-has-focus .qtw-node{opacity:.22;transition:opacity .18s}
      .qtw-svg.qtw-has-focus .qtw-node.qtw-hl{opacity:1}
      .qtw-node.qtw-selected{filter:drop-shadow(0 0 5px ${P.accent})}
    </style>`;
    s += defs(P);
    s += rc(0, 0, L.width, L.height, `fill="${P.bg}"`);
    s += header(model, P, L, opts);
    s += enclosure(model, P, L, opts);
    s += incomingZone(model, P, L, opts);
    // Trilhos DIN verticais atrás das colunas de módulos
    if (model.circuits.length) {
      [L.leftCol, L.rightCol].forEach(col => {
        s += rc(col.modX + G.modW / 2 - 4, L.rowsY0 - 12, 8, L.rowsYEnd - L.rowsY0 + 16,
          `fill="url(#qtw-rail)" stroke="${P.railDark}" stroke-width="0.6" rx="1.5"`);
      });
    }
    s += comb(model, P, L, opts);
    L.cols.left.forEach((c, i) => { s += circuitRow(model, c, L.rowY(i), L.leftCol, "left", P, L, opts); });
    L.cols.right.forEach((c, i) => { s += circuitRow(model, c, L.rowY(i), L.rightCol, "right", P, L, opts); });
    if (!model.circuits.length) {
      s += tx(L.cx, L.rowsY0 + 20, "Nenhum circuito calculado — adicione cargas e calcule o projeto.",
        `text-anchor="middle" font-size="12" fill="${P.dimIn}"`);
    }
    s += edgeBars(model, P, L, opts);
    s += legend(P, L, opts.theme, opts.scheme);
    s += `</svg>`;
    return s;
  }

  return { render, layout, splitColumns, THEMES, WIRES, WIRE_NAMES, DEFAULT_OVERLAYS, G, esc };
});
