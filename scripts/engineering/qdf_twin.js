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
    // Linha ÚNICA de dispositivos de entrada (como num painel real):
    // DPS (esq) · DR GERAL (centro, sobre o pente) · DISJUNTOR GERAL
    // (imediatamente à direita do DR, recebendo o alimentador)
    const topY1 = encY + 96;
    const combTop = topY1 + 64;
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

    // Zona de entrada — dimensões dos módulos gerais
    const drW = 96, mainW = 118, devH = 44;
    const spd = {
      x0: encX + G.padX + 14, y: topY1,
      modW: 26, modGap: 5, count: phases.length + 1  // fases + N
    };
    const drX = cx - drW / 2;               // DR centrado sobre o pente
    const mainX = cx + drW / 2 + 52;        // geral logo à direita do DR

    return {
      headerH, encX, encY, encW, encH, width, height, cx,
      titleY, topY1, combTop, combBottom, busLabelY,
      combX, phases, cols, rowY, rowsY0, rowsYEnd,
      leftCol, rightCol, spd, mainX, drX, drW, mainW, devH
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

  /** Zona de entrada em LINHA ÚNICA (disposição de painel real):
   *  DPS em paralelo (esq) ← tap no jumper ← DR GERAL (centro,
   *  sobre o pente) ← jumper curto ← DISJUNTOR GERAL (dir), que
   *  recebe o alimentador descendo reto do topo do gabinete. */
  function incomingZone(model, P, L, opts) {
    const by = model.byId;
    const feeder = by.feeder, main = by["main-breaker"], spd = by.spd, mrcd = by["main-rcd"];
    const dh = L.devH, dw = L.drW, mw = L.mainW;
    const y = L.topY1;
    const mainCx = L.mainX + mw / 2;
    const drCx = L.cx;
    let out = "";

    // ── Alimentador: desce RETO do topo do gabinete no geral ──
    out += `<g class="qtw-node" data-node="feeder" data-kind="conductor">`;
    out += ln(mainCx, L.encY - 12, mainCx, L.encY + 4, wire(P.ink, 3));
    out += ln(mainCx, L.encY + 36, mainCx, y - dh / 2, wire(WIRES.A, 3));
    // Rótulos à DIREITA do módulo do geral (coluna totalmente livre)
    const flx = L.mainX + mw + 12;
    out += tx(flx, L.encY + 52, "ALIMENTADOR", `font-size="7.5" font-weight="700" letter-spacing="1" fill="${P.dimIn}"`);
    if (feeder.data.section) {
      out += tx(flx, L.encY + 64, `${feeder.data.section} mm² + N ${feeder.data.neutral} + PE ${feeder.data.pe} mm²`, `font-size="8" font-weight="700" fill="${P.inkIn}"`);
      out += tx(flx, L.encY + 75, `${feeder.data.lengthM} m · ${feeder.data.method} · Izc ${fmt(feeder.calc.Izc)} A`, `font-size="7.5" fill="${P.dimIn}"`);
      let fy = L.encY + 86;
      if (opts.overlays.current) {
        out += tx(flx, fy, `Ib ${fmt(feeder.calc.Ib)} A (dim. ${fmt(feeder.calc.Idim)} A)`, `class="qtw-ov qtw-ov-current" font-size="7.5" fill="${P.accent}"`);
        fy += 11;
      }
      if (opts.overlays.drop) {
        out += tx(flx, fy, `ΔV ${fmt(feeder.calc.dropPct, 2)}% ≤ ${feeder.calc.maxDropPct}%`, `class="qtw-ov qtw-ov-drop" font-size="7.5" fill="${statusColor(P, feeder.validation.status)}"`);
      }
    }
    out += `</g>`;

    // ── Jumper curto geral → DR (com nó de derivação do DPS) ──
    const junX = (L.mainX + L.cx + dw / 2) / 2;   // meio do jumper
    out += ln(L.cx + dw / 2, y, L.mainX, y, wire(WIRES.A, 2.4));

    // ── Disjuntor geral (recebe o alimentador; alimenta o DR) ──
    out += `<g class="qtw-node" data-node="main-breaker" data-kind="breaker">`;
    out += moduleBody(L.mainX, y - dh / 2, mw, dh, P, opts, main.validation.status);
    out += tx(L.mainX + 24, y - 6, "DISJUNTOR GERAL", `font-size="7" font-weight="800" letter-spacing="1" fill="${P.dimIn}"`);
    out += tx(L.mainX + 24, y + 8, main.data.In ? `${main.data.In} A · ${main.data.curve} · ${main.data.poles}P` : "—", `font-size="9.5" font-weight="800" fill="${P.inkIn}"`);
    const mainRef = opts.catalog && opts.catalog.byNode && opts.catalog.byNode["main-breaker"];
    if (mainRef) out += tx(L.mainX + 24, y + 17, `${mainRef.maker} ${mainRef.reference}`, `class="qtw-cat" font-size="5.5" fill="${P.dimIn}" font-family="monospace"`);
    if (opts.overlays.icc && main.calc.icnRequiredA)
      out += tx(L.mainX + mw / 2, y + dh / 2 + 11, `Icn ≥ ${fmt(main.calc.icnRequiredA / 1000, 1)} kA`, `class="qtw-ov qtw-ov-icc" text-anchor="middle" font-size="7.5" fill="${P.dimIn}"`);
    out += `</g>`;

    // ── DPS em PARALELO: derivação no jumper, A MONTANTE do DR ──
    const S = L.spd;
    const bankW = S.count * (S.modW + S.modGap) - S.modGap;
    const bankCx = S.x0 + bankW / 2;
    const tapY = y - dh / 2 - 14;
    out += `<g class="qtw-node" data-node="spd" data-kind="spd">`;
    out += ci(junX, y, 2.6, `fill="${WIRES.A}"`);                 // nó de derivação
    out += ln(junX, y, junX, tapY, wire(WIRES.A, 1.8));
    out += ln(junX, tapY, bankCx, tapY, wire(WIRES.A, 1.8));
    out += ln(bankCx, tapY, bankCx, S.y - 24, wire(WIRES.A, 1.8));
    // distribuição da derivação para cada módulo do banco
    out += ln(S.x0 + S.modW / 2, S.y - 24, S.x0 + bankW - S.modW / 2, S.y - 24, wire(WIRES.A, 1.6));
    const phasesN = L.phases.concat(["N"]);
    for (let i = 0; i < S.count; i++) {
      const x = S.x0 + i * (S.modW + S.modGap);
      const mcx = x + S.modW / 2;
      const ph = phasesN[i] || "N";
      const isN = ph === "N";
      out += ln(mcx, S.y - 24, mcx, S.y - 20, wire(WIRES[ph] || WIRES.N, 1.8));
      out += rc(x, S.y - 20, S.modW, 40, `fill="${P.module}" stroke="${P.moduleStroke}" stroke-width="1.1" rx="3"`);
      out += rc(x + 4, S.y - 20, S.modW - 8, 4, `fill="${WIRES[ph] || WIRES.N}" rx="1"`);
      out += tx(mcx, S.y - 6, "DPS", `text-anchor="middle" font-size="6.5" font-weight="800" fill="${P.dimIn}"`);
      // Em TT o módulo do neutro é o CENTELHADOR N-PE (símbolo de gap)
      if (isN && opts.scheme === "TT") {
        out += ln(mcx - 4, S.y + 4, mcx - 1.4, S.y + 4, `stroke="${P.inkIn}" stroke-width="1.3"`);
        out += ln(mcx + 1.4, S.y + 4, mcx + 4, S.y + 4, `stroke="${P.inkIn}" stroke-width="1.3"`);
        out += ln(mcx - 1.4, S.y + 1.4, mcx - 1.4, S.y + 6.6, `stroke="${P.inkIn}" stroke-width="1.3"`);
        out += ln(mcx + 1.4, S.y + 1.4, mcx + 1.4, S.y + 6.6, `stroke="${P.inkIn}" stroke-width="1.3"`);
      } else {
        out += tx(mcx, S.y + 8, ph, `text-anchor="middle" font-size="7.5" font-weight="800" fill="${WIRES[ph] || WIRES.N}"`);
      }
      out += tx(mcx, S.y + 16.5, spd.data.class ? `Cl.${spd.data.class}` : "—", `text-anchor="middle" font-size="6" fill="${P.dimIn}"`);
      // saída do módulo ao PE (verde)
      out += ln(mcx, S.y + 20, mcx, S.y + 30, wire(WIRES.PE, 1.6));
    }
    // barra de terra do banco → PE da borda esquerda
    out += ln(S.x0 + S.modW / 2, S.y + 30, S.x0 + bankW - S.modW / 2, S.y + 30, wire(WIRES.PE, 2));
    out += ln(S.x0 + S.modW / 2, S.y + 30, L.leftCol.peX + G.stripW / 2, S.y + 30, wire(WIRES.PE, 2));
    out += ln(L.leftCol.peX + G.stripW / 2, S.y + 30, L.leftCol.peX + G.stripW / 2, L.rowsY0 - 14, wire(WIRES.PE, 2));
    out += `<use href="#qtw-sym-ground" transform="translate(${S.x0 + bankW + 14},${S.y + 34}) scale(0.85)" style="color:${WIRES.PE}"/>`;
    // rótulos de engenharia do DPS
    out += tx(S.x0, S.y + 46, `INSTALAÇÃO EM PARALELO (derivação) — NBR 5410 §6.3.5.2`, `font-size="7" font-weight="700" letter-spacing="0.5" fill="${P.dimIn}"`);
    out += tx(S.x0, S.y + 56, `Derivado entre o disjuntor geral e o DR (a montante do DR)`, `font-size="7" fill="${P.dimIn}"`);
    out += tx(S.x0, S.y + 66, opts.scheme === "TT"
      ? `Esquema TT: conexão ${L.phases.length}+1 — N–PE por centelhador`
      : `Esquema TN-S: modo comum — fases e N ao PE`, `font-size="7" fill="${P.dimIn}"`);
    if (spd.data.imaxKA) {
      out += tx(S.x0, S.y + 76, `Classe ${spd.data.class} · Imax ${spd.data.imaxKA} kA · In ${spd.data.inKA} kA · Uc ≥ ${spd.data.ucV} V · ${spd.data.standard || "IEC 61643-11"}`, `font-size="7" fill="${P.dimIn}"`);
    }
    out += `</g>`;

    // ── DR GERAL (centrado sobre o pente, na MESMA linha) ──
    out += `<g class="qtw-node" data-node="main-rcd" data-kind="rcd">`;
    out += moduleBody(L.drX, y - dh / 2, dw, dh, P, opts, mrcd.validation.status);
    out += tx(drCx + 8, y - 6, "DR GERAL", `text-anchor="middle" font-size="7" font-weight="800" letter-spacing="1" fill="${P.dimIn}"`);
    out += tx(drCx + 8, y + 8, mrcd.data.In ? `${mrcd.data.In} A / ${mrcd.data.sensitivityMa} mA` : "—", `text-anchor="middle" font-size="9" font-weight="800" fill="${P.inkIn}"`);
    const drRef = opts.catalog && opts.catalog.byNode && opts.catalog.byNode["main-rcd"];
    if (drRef) out += tx(drCx + 8, y + 17, drRef.reference, `class="qtw-cat" text-anchor="middle" font-size="5.5" fill="${P.dimIn}" font-family="monospace"`);
    out += `</g>`;

    // DR geral → topo do pente: descidas RETAS, uma por fase
    L.phases.forEach(p => {
      out += ln(L.combX[p], y + dh / 2, L.combX[p], L.combTop, wire(WIRES[p], 2.2));
    });
    // Neutro do DR → barras N das bordas (azul)
    const ny = y + dh / 2 + 10;
    out += `<g data-kind="wire-n">`;
    out += ln(L.drX, y + 12, L.leftCol.nX + G.stripW / 2, ny, wire(WIRES.N, 1.8));
    out += ln(L.leftCol.nX + G.stripW / 2, ny, L.leftCol.nX + G.stripW / 2, L.rowsY0 - 14, wire(WIRES.N, 1.8));
    out += ln(L.mainX + mw, y + 12, L.rightCol.nX + G.stripW / 2, ny, wire(WIRES.N, 1.8));
    out += ln(L.rightCol.nX + G.stripW / 2, ny, L.rightCol.nX + G.stripW / 2, L.rowsY0 - 14, wire(WIRES.N, 1.8));
    out += `</g>`;
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
