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
 * Renderiza o QDF como um PAINEL ELÉTRICO REALISTA em SVG vetorial,
 * no estilo de software profissional (Ecodial / Caneco / QiBuilder):
 *
 *   gabinete com placa de montagem → cabo alimentador → disjuntor
 *   geral → DPS (com descida ao PE) → DR geral → barramentos de
 *   cobre por fase (corrente, utilização e reserva) → pentes de
 *   distribuição → disjuntores parciais em trilhos DIN (largura em
 *   módulos = nº de polos, LED de status, identificação do
 *   circuito) → cabos de saída (seção, comprimento, Ib, ΔV) →
 *   etiquetas de carga → barras de Neutro e PE com terminais.
 *
 * Recursos:
 *  - Temas dark / light / print (impressão com carimbo técnico);
 *  - Overlays de engenharia: corrente, queda de tensão, curto-
 *    circuito e validação (verde/amarelo/vermelho);
 *  - Cada objeto renderizado em <g data-node="ID"> com os MESMOS
 *    ids do modelo — a UI liga hover/seleção/realce da cadeia via
 *    chainOf()/relatedOf() sem re-renderizar;
 *  - Multi-trilho: circuitos quebram em fileiras de `perRow`
 *    módulos, alimentadas por risers verticais por fase.
 *
 * O SVG é autocontido (fontes de sistema, sem assets externos),
 * exportável e imprimível em alta resolução.
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
   * Temas
   * ============================================================== */
  const THEMES = {
    dark: {
      bg: "#0b1828", ink: "#e8f4fd", dim: "#7da3c0", faint: "#27415f",
      enclosure: "#0e1e33", enclosureStroke: "#2e5a8a",
      plate: "#132540", plateStroke: "#1e3a5c",
      module: "#1b2f4d", moduleStroke: "#3a6ea5", moduleFace: "#e8f4fd",
      rail: "#8fa8c4", railDark: "#5c7696",
      phases: { A: "#4da8ff", B: "#fb923c", C: "#34d399", N: "#94a3b8", PE: "#4ade80" },
      copperTop: "#e09a5e", copperMid: "#c07a3a", copperLow: "#8a4f1f",
      steelTop: "#c9d4e0", steelLow: "#8494a8",
      ok: "#22c55e", warn: "#f59e0b", err: "#ef4444",
      accent: "#4da8ff"
    },
    light: {
      bg: "#ffffff", ink: "#0d1b2e", dim: "#4a6a8a", faint: "#d7e2f0",
      enclosure: "#eef3fa", enclosureStroke: "#8fb0d4",
      plate: "#f7fafd", plateStroke: "#c3d4e8",
      module: "#ffffff", moduleStroke: "#7a9cc0", moduleFace: "#0d1b2e",
      rail: "#9aabc0", railDark: "#6b7f96",
      phases: { A: "#1565c0", B: "#ea580c", C: "#0e9f6e", N: "#6b7280", PE: "#16a34a" },
      copperTop: "#e8a76b", copperMid: "#c07a3a", copperLow: "#96591f",
      steelTop: "#dde5ee", steelLow: "#9fb0c2",
      ok: "#16a34a", warn: "#d97706", err: "#dc2626",
      accent: "#1565c0"
    },
    print: {
      bg: "#ffffff", ink: "#000000", dim: "#444444", faint: "#cccccc",
      enclosure: "#fafafa", enclosureStroke: "#000000",
      plate: "#ffffff", plateStroke: "#888888",
      module: "#ffffff", moduleStroke: "#000000", moduleFace: "#000000",
      rail: "#999999", railDark: "#666666",
      phases: { A: "#1565c0", B: "#ea580c", C: "#0e9f6e", N: "#555555", PE: "#16a34a" },
      copperTop: "#d89a62", copperMid: "#b87333", copperLow: "#8a5a28",
      steelTop: "#dddddd", steelLow: "#aaaaaa",
      ok: "#1a7f37", warn: "#b45309", err: "#b91c1c",
      accent: "#000000"
    }
  };

  const DEFAULT_OVERLAYS = { current: true, drop: true, icc: false, validation: true };

  /* Geometria (px do viewBox) */
  const G = {
    slotW: 56,        // passo horizontal de 1 módulo DIN
    modH: 64,         // altura do módulo de disjuntor
    gutterL: 46,      // calha esquerda p/ risers de fase
    padX: 22,         // margem interna do gabinete
    busGap: 22,       // espaçamento vertical entre barras de fase
    busH: 9,          // espessura da barra de cobre
    combGap: 5,       // espaçamento entre linhas do pente
    cableZone: 96,    // zona cabo + etiqueta de carga sob os módulos
    rowGap: 18,       // respiro entre fileiras
    termH: 30,        // altura das barras N/PE
    perRow: 10        // módulos por trilho DIN (default)
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

  /* ==============================================================
   * Layout
   * ============================================================== */

  /** Empacota os circuitos em fileiras de trilho DIN.
   *  Cada circuito ocupa `poles` módulos (prática DIN real). */
  function packRows(model, perRow) {
    const rows = [];
    let row = null, slot = 0;
    for (const c of model.circuits) {
      const poles = Math.max(1, (c.phases || ["A"]).length);
      if (!row || slot + poles > perRow) {
        row = { items: [], slots: 0 };
        rows.push(row);
        slot = 0;
      }
      row.items.push({ circ: c, slot, poles });
      slot += poles;
      row.slots = slot;
    }
    return rows;
  }

  function layout(model, opts) {
    const phases = model.summary.phasesInUse;
    const perRow = Math.max(4, opts.perRow || G.perRow);
    const rows = packRows(model, perRow);
    const maxSlots = Math.max(8, ...rows.map(r => r.slots), 0);

    const headerH = opts.theme === "print" ? 96 : 60;
    const encX = 26;
    const encY = headerH + 14;
    const innerW = G.gutterL + maxSlots * G.slotW + 18;
    const encW = Math.max(innerW + 2 * G.padX, 660);
    const width = encW + 2 * encX;

    const titleY = encY + 26;         // faixa de identificação do painel
    const mainY = encY + 122;         // linha central dos módulos de entrada
    const busY0 = mainY + 84;         // primeira barra de fase
    const busY = {};
    phases.forEach((p, i) => { busY[p] = busY0 + i * G.busGap; });
    const busYEnd = busY0 + (phases.length - 1) * G.busGap;

    // Fileiras de distribuição
    const rowH = phases.length * G.combGap + 14 + G.modH + G.cableZone + G.rowGap;
    const rowsY0 = busYEnd + 40;
    const rowsGeo = rows.map((r, i) => {
      const combY = rowsY0 + i * rowH;
      const modTop = combY + phases.length * G.combGap + 12;
      return { ...r, combY, modTop, railY: modTop + 22 };
    });
    const rowsYEnd = rows.length ? rowsY0 + rows.length * rowH - G.rowGap : busYEnd + 60;

    const termY = rowsYEnd + 22;      // barras N / PE
    const encH = termY + G.termH + 20 - encY;
    const height = encY + encH + (opts.theme === "print" ? 52 : 30);

    const slotX = i => encX + G.padX + G.gutterL + i * G.slotW;
    const riserX = k => encX + G.padX + 10 + k * 9;
    const busX0 = encX + G.padX + 4;
    const busX1 = encX + encW - G.padX - 4;

    return {
      headerH, encX, encY, encW, encH, width, height,
      titleY, mainY, busY0, busY, busYEnd, phases,
      rows: rowsGeo, termY, slotX, riserX, busX0, busX1, maxSlots, perRow
    };
  }

  /* ==============================================================
   * Defs — gradientes metálicos e filtros
   * ============================================================== */
  function defs(P) {
    return `<defs>
      <linearGradient id="qtw-copper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${P.copperTop}"/>
        <stop offset="0.45" stop-color="${P.copperMid}"/>
        <stop offset="1" stop-color="${P.copperLow}"/>
      </linearGradient>
      <linearGradient id="qtw-steel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${P.steelTop}"/>
        <stop offset="1" stop-color="${P.steelLow}"/>
      </linearGradient>
      <linearGradient id="qtw-rail" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${P.rail}"/>
        <stop offset="0.5" stop-color="${P.railDark || P.rail}"/>
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
      out += tx(L.width / 2, 80, `Sistema ${s.supplyType} · ${s.circuits} circuitos · Demanda ${fmt(s.demandVA / 1000, 2)} kVA`, 'text-anchor="middle" font-size="10" fill="#000"');
      out += tx(L.width - 14, 80, opts.date ? `Data: ${opts.date}` : "EasyEletric v3.5", 'text-anchor="end" font-size="10" fill="#000"');
    } else {
      out += tx(L.encX, 30, "SMART DISTRIBUTION BOARD — QDF", `font-size="15" font-weight="800" fill="${P.ink}" letter-spacing="2"`);
      out += tx(L.encX, 48, `${proj} · NBR 5410:2023`, `font-size="10" fill="${P.dim}"`);
      const sc = statusColor(P, s.status);
      out += ci(L.width - L.encX - 6, 26, 5, `fill="${sc}"`);
      out += tx(L.width - L.encX - 18, 30, s.status === "PASS" ? "CONFORME" : s.status === "WARN" ? "ATENÇÃO" : "VIOLAÇÃO",
        `text-anchor="end" font-size="10" font-weight="700" fill="${sc}"`);
    }
    return out;
  }

  /** Gabinete + placa de montagem + faixa de identificação. */
  function enclosure(model, P, L, opts) {
    const p = model.byId.panel;
    let out = "";
    out += rc(L.encX, L.encY, L.encW, L.encH, `fill="${P.enclosure}" stroke="${P.enclosureStroke}" stroke-width="2" rx="10"`);
    out += rc(L.encX + 10, L.encY + 42, L.encW - 20, L.encH - 52, `fill="${P.plate}" stroke="${P.plateStroke}" stroke-width="1" rx="6"`);
    // Parafusos do gabinete
    [[L.encX + 12, L.encY + 12], [L.encX + L.encW - 12, L.encY + 12],
     [L.encX + 12, L.encY + L.encH - 12], [L.encX + L.encW - 12, L.encY + L.encH - 12]]
      .forEach(([x, y]) => {
        out += ci(x, y, 3.4, `fill="url(#qtw-steel)" stroke="${P.plateStroke}" stroke-width="0.8"`);
        out += ln(x - 1.8, y, x + 1.8, y, `stroke="${P.dim}" stroke-width="0.9"`);
      });
    // Faixa de identificação (nó panel — clicável)
    const sc = statusColor(P, p.validation.status);
    out += `<g class="qtw-node" data-node="panel" data-kind="panel">`;
    out += rc(L.encX + 18, L.encY + 8, L.encW - 36, 26, `fill="${P.module}" stroke="${opts.overlays.validation ? sc : P.moduleStroke}" stroke-width="1.2" rx="5"`);
    out += tx(L.encX + 30, L.titleY, p.label, `font-size="11" font-weight="800" fill="${P.ink}"`);
    if (p.calc.installedVA != null) {
      out += tx(L.encX + L.encW - 30, L.titleY,
        `Instalada ${fmt(p.calc.installedVA / 1000, 2)} kVA → Demanda ${fmt(p.calc.demandVA / 1000, 2)} kVA (Fd ${fmt(p.calc.overallFactor * 100, 0)}%) · Icc ${fmt(p.calc.iccBoardA / 1000, 1)} kA`,
        `text-anchor="end" font-size="8.5" fill="${P.dim}"`);
    }
    out += `</g>`;
    return out;
  }

  /** Módulo genérico de aparelho DIN (corpo + alavanca + face). */
  function deviceBody(x, y, w, h, P, opts, status) {
    const sc = statusColor(P, status);
    let out = rc(x, y, w, h, `fill="${P.module}" stroke="${P.moduleStroke}" stroke-width="1.2" rx="4"`);
    // Alavanca (posição ligada)
    const lx = x + w / 2;
    out += rc(lx - 5, y + h / 2 - 11, 10, 15, `fill="${P.plate}" stroke="${P.moduleStroke}" stroke-width="1" rx="2"`);
    out += rc(lx - 3.2, y + h / 2 - 9, 6.4, 6.5, `fill="${sc}" rx="1.4"`);
    return out;
  }

  /** Zona de entrada: alimentador → geral → DPS → DR geral. */
  function incomingZone(model, P, L, opts) {
    const by = model.byId;
    const feeder = by.feeder, main = by["main-breaker"], spd = by.spd, mrcd = by["main-rcd"];
    const y = L.mainY;
    const lbl = `font-size="8.5" fill="${P.dim}"`;
    const val = `font-size="9.5" font-weight="700" fill="${P.ink}"`;
    let out = "";

    // Cabo alimentador entra pelo topo do gabinete (passa "atrás" da
    // faixa de identificação: segmento acima + segmento abaixo dela)
    const mainX = L.encX + G.padX + G.gutterL + 44;
    out += `<g class="qtw-node" data-node="feeder" data-kind="conductor">`;
    out += ln(mainX, L.encY - 12, mainX, L.encY + 6, `stroke="${P.ink}" stroke-width="3" stroke-linecap="round"`);
    out += ln(mainX, L.encY + 36, mainX, y - 34, `stroke="${P.ink}" stroke-width="3" stroke-linecap="round"`);
    out += pa(`M ${mainX - 6} ${L.encY + 52} L ${mainX + 6} ${L.encY + 44}`, `stroke="${P.ink}" stroke-width="1.4"`);
    out += tx(mainX + 12, L.encY + 48, "ALIMENTADOR", `font-size="8" font-weight="700" letter-spacing="1" fill="${P.dim}"`);
    if (feeder.data.section) {
      out += tx(mainX + 12, L.encY + 60, `${feeder.data.section} mm² (${feeder.data.insulation}) + N ${feeder.data.neutral} + PE ${feeder.data.pe} mm² · ${feeder.data.lengthM} m · ${feeder.data.method}`, val);
      let fy = L.encY + 72;
      if (opts.overlays.current) {
        out += tx(mainX + 12, fy, `Ib ${fmt(feeder.calc.Ib)} A (dim. ${fmt(feeder.calc.Idim)} A) · Izc ${fmt(feeder.calc.Izc)} A`, `class="qtw-ov qtw-ov-current" font-size="8.5" fill="${P.accent}"`);
        fy += 11;
      }
      if (opts.overlays.drop) {
        out += tx(mainX + 12, fy, `ΔV ${fmt(feeder.calc.dropPct, 2)}% ≤ ${feeder.calc.maxDropPct}%`, `class="qtw-ov qtw-ov-drop" font-size="8.5" fill="${statusColor(P, feeder.validation.status)}"`);
      }
    }
    out += `</g>`;

    // Disjuntor geral (módulo largo)
    const mw = 66, mh = 58;
    out += `<g class="qtw-node" data-node="main-breaker" data-kind="breaker">`;
    out += deviceBody(mainX - mw / 2, y - mh / 2, mw, mh, P, opts, main.validation.status);
    out += tx(mainX, y - mh / 2 + 12, "GERAL", `text-anchor="middle" font-size="8" font-weight="800" letter-spacing="1.5" fill="${P.dim}"`);
    out += tx(mainX, y + mh / 2 - 8, main.data.In ? `${main.data.In} A · ${main.data.curve} · ${main.data.poles}P` : "—", `text-anchor="middle" font-size="9" font-weight="700" fill="${P.ink}"`);
    if (opts.overlays.validation) out += ci(mainX + mw / 2 - 7, y - mh / 2 + 8, 3, `class="qtw-ov qtw-ov-validation" fill="${statusColor(P, main.validation.status)}"`);
    if (opts.overlays.icc && main.calc.icnRequiredA)
      out += tx(mainX, y + mh / 2 + 11, `Icn ≥ ${fmt(main.calc.icnRequiredA / 1000, 1)} kA`, `class="qtw-ov qtw-ov-icc" text-anchor="middle" ${lbl}`);
    out += `</g>`;

    // DPS — derivado do barramento após o geral, descendo ao PE
    const spdX = mainX + 150;
    out += ln(mainX + mw / 2, y, spdX - 25, y, `stroke="${P.ink}" stroke-width="2"`);
    out += ci(spdX - 25, y, 2.4, `fill="${P.ink}"`);
    out += `<g class="qtw-node" data-node="spd" data-kind="spd">`;
    out += deviceBody(spdX - 25, y - 26, 50, 52, P, opts, spd.validation.status);
    out += tx(spdX, y - 15, "DPS", `text-anchor="middle" font-size="8" font-weight="800" letter-spacing="1.5" fill="${P.dim}"`);
    out += tx(spdX, y + 21, spd.data.class ? `Cl. ${spd.data.class}` : "—", `text-anchor="middle" font-size="8.5" font-weight="700" fill="${P.ink}"`);
    out += ln(spdX, y + 26, spdX, y + 40, `stroke="${P.phases.PE}" stroke-width="1.6"`);
    out += `<use href="#qtw-sym-ground" transform="translate(${spdX},${y + 47}) scale(0.85)" style="color:${P.phases.PE}"/>`;
    if (spd.data.imaxKA) {
      out += tx(spdX + 32, y - 16, `Imax ${spd.data.imaxKA} kA · In ${spd.data.inKA} kA`, lbl);
      out += tx(spdX + 32, y - 5, `Uc ≥ ${spd.data.ucV} V · ${spd.data.poles}P`, lbl);
      out += tx(spdX + 32, y + 16, spd.data.standard || "IEC 61643-11", `font-size="7.5" fill="${P.dim}"`);
    }
    out += `</g>`;

    // DR geral
    const rcdX = spdX + 190;
    out += ln(spdX + 25, y, rcdX - 30, y, `stroke="${P.ink}" stroke-width="2"`);
    out += `<g class="qtw-node" data-node="main-rcd" data-kind="rcd">`;
    out += deviceBody(rcdX - 30, y - 26, 60, 52, P, opts, mrcd.validation.status);
    out += tx(rcdX, y - 15, "DR GERAL", `text-anchor="middle" font-size="7.5" font-weight="800" letter-spacing="1" fill="${P.dim}"`);
    out += tx(rcdX, y + 21, mrcd.data.In ? `${mrcd.data.In} A / ${mrcd.data.sensitivityMa} mA` : "—", `text-anchor="middle" font-size="8.5" font-weight="700" fill="${P.ink}"`);
    out += `</g>`;

    // Descida do DR geral aos barramentos (uma queda vertical por
    // fase, conectando no topo de cada barra de cobre)
    L.phases.forEach((p, k) => {
      const dx = rcdX - 12 + k * 12;
      out += ln(dx, y + 26, dx, L.busY[p] - G.busH / 2, `stroke="${P.phases[p]}" stroke-width="1.6" opacity="0.9"`);
      out += ci(dx, L.busY[p] - G.busH / 2 + 2, 2.2, `fill="${P.phases[p]}"`);
    });
    return out;
  }

  /** Barramentos de cobre por fase, com corrente/utilização/reserva. */
  function busbars(model, P, L, opts) {
    const main = model.byId["main-breaker"];
    const capacity = main && main.data.In;
    let out = "";
    L.phases.forEach((p, k) => {
      const node = model.byId["bus-" + p];
      if (!node) return;
      const y = L.busY[p];
      const c = P.phases[p];
      const currentA = node.calc.currentA || 0;
      const utilPct = capacity ? Math.round(currentA / capacity * 100) : null;
      const barEnd = L.busX1 - 168;
      out += `<g class="qtw-node" data-node="bus-${p}" data-kind="busbar">`;
      // Barra de cobre com furos de fixação
      out += rc(L.busX0 + 30, y - G.busH / 2, barEnd - L.busX0 - 30, G.busH, `fill="url(#qtw-copper)" stroke="${P.copperLow}" stroke-width="0.8" rx="2"`);
      for (let hx = L.busX0 + 60; hx < barEnd - 12; hx += 90) {
        out += ci(hx, y, 1.7, `fill="${P.copperLow}" opacity="0.75"`);
      }
      // Terminal de fase colorido à esquerda
      out += rc(L.busX0, y - G.busH / 2 - 1, 26, G.busH + 2, `fill="${c}" rx="2.5"`);
      out += tx(L.busX0 + 13, y + 3.4, p, `text-anchor="middle" font-size="9" font-weight="800" fill="#fff"`);
      // Corrente / utilização / reserva à direita da barra
      if (opts.overlays.current) {
        out += tx(barEnd + 10, y + 3.4, `${fmt(currentA)} A`, `class="qtw-ov qtw-ov-current" font-size="9" font-weight="700" fill="${c}"`);
        if (utilPct != null) {
          const uc = utilPct >= 100 ? P.err : utilPct >= 80 ? P.warn : P.dim;
          out += tx(L.busX1 - 4, y + 3.4, `${utilPct}% util. · ${Math.max(0, 100 - utilPct)}% reserva`,
            `class="qtw-ov qtw-ov-current" text-anchor="end" font-size="7.5" fill="${uc}"`);
        }
      }
      out += `</g>`;
    });
    return out;
  }

  /** Risers verticais de fase (alimentam os pentes de cada fileira). */
  function risers(P, L) {
    if (!L.rows.length) return "";
    let out = "";
    const lastRow = L.rows[L.rows.length - 1];
    L.phases.forEach((p, k) => {
      const x = L.riserX(k);
      const yTop = L.busY[p];
      const yBot = lastRow.combY + k * G.combGap;
      out += ln(x, yTop, x, yBot, `stroke="${P.phases[p]}" stroke-width="1.8" opacity="0.9"`);
      out += ci(x, yTop, 2.4, `fill="${P.phases[p]}"`);
    });
    return out;
  }

  /** Uma fileira: pente de fases + trilho DIN + disjuntores + cabos + cargas. */
  function distributionRow(model, row, P, L, opts) {
    const by = model.byId;
    let out = "";
    const rowEndX = L.slotX(Math.max(row.slots, 1)) - 14;

    // Pente de distribuição (uma linha fina por fase)
    L.phases.forEach((p, k) => {
      const y = row.combY + k * G.combGap;
      out += ln(L.riserX(k), y, rowEndX, y, `stroke="${P.phases[p]}" stroke-width="1.3" opacity="0.85"`);
    });

    // Trilho DIN atravessando a fileira
    const railX0 = L.slotX(0) - 12;
    out += rc(railX0, row.railY, rowEndX - railX0 + 12, 8, `fill="url(#qtw-rail)" stroke="${P.railDark || P.rail}" stroke-width="0.6" rx="1.5"`);

    for (const item of row.items) {
      out += breakerColumn(model, item, row, P, L, opts);
    }
    return out;
  }

  /** Coluna de um circuito: stubs do pente, disjuntor DIN, DR, cabo, carga. */
  function breakerColumn(model, item, row, P, L, opts) {
    const by = model.byId;
    const circ = item.circ;
    const brk = by[circ.breakerId], rcd = circ.rcdId ? by[circ.rcdId] : null;
    const cond = by[circ.conductorId], load = by[circ.loadId];
    const phases = circ.phases;
    const x0 = L.slotX(item.slot);
    const w = item.poles * G.slotW - 12;
    const cx = x0 + w / 2;
    const top = row.modTop;
    const sc = statusColor(P, brk.validation.status);
    let out = `<g class="qtw-circuit" data-circuit="${circ.n}">`;

    // Stubs do pente até os polos (cor por fase)
    phases.forEach((p, k) => {
      const px = x0 + (k + 0.5) * (w / item.poles);
      const combY = row.combY + L.phases.indexOf(p) * G.combGap;
      out += ci(px, combY, 2, `fill="${P.phases[p]}"`);
      out += ln(px, combY, px, top, `stroke="${P.phases[p]}" stroke-width="1.5"`);
    });

    // Número do circuito
    out += tx(cx, top - 5, `C${String(circ.n).padStart(2, "0")}`, `text-anchor="middle" font-size="9" font-weight="800" fill="${P.ink}"`);

    // Módulo do disjuntor
    out += `<g class="qtw-node" data-node="${circ.breakerId}" data-kind="breaker">`;
    out += deviceBody(x0, top, w, G.modH, P, opts, brk.validation.status);
    // Abas de fase no topo do módulo (uma por polo)
    phases.forEach((p, k) => {
      const px = x0 + (k + 0.5) * (w / item.poles);
      out += rc(px - 6, top, 12, 3.5, `fill="${P.phases[p]}" rx="1"`);
    });
    out += tx(cx, top + 14, `${brk.data.In} A`, `text-anchor="middle" font-size="9.5" font-weight="800" fill="${P.ink}"`);
    out += tx(cx, top + G.modH - 6, `${brk.data.curve} · ${item.poles}P`, `text-anchor="middle" font-size="7.5" fill="${P.dim}"`);
    if (opts.overlays.validation)
      out += ci(x0 + w - 6, top + G.modH - 7, 2.6, `class="qtw-ov qtw-ov-validation" fill="${sc}"`);
    out += `</g>`;

    // DR do circuito (badge sob o módulo)
    let cableTop = top + G.modH;
    if (rcd) {
      out += `<g class="qtw-node" data-node="${circ.rcdId}" data-kind="rcd">`;
      out += rc(cx - 20, cableTop + 3, 40, 11, `fill="${P.plate}" stroke="${P.moduleStroke}" stroke-width="0.8" rx="3"`);
      out += tx(cx, cableTop + 11.5, `DR ${rcd.data.sensitivityMa} mA`, `text-anchor="middle" font-size="7" font-weight="700" fill="${P.ink}"`);
      out += `</g>`;
      cableTop += 16;
    }

    // Cabo de saída
    const tagY = top + G.modH + G.cableZone - 34;
    out += `<g class="qtw-node" data-node="${circ.conductorId}" data-kind="conductor">`;
    out += ln(cx, cableTop, cx, tagY, `stroke="${P.ink}" stroke-width="1.5"`);
    out += pa(`M ${cx - 4.5} ${cableTop + 10} L ${cx + 4.5} ${cableTop + 3}`, `stroke="${P.ink}" stroke-width="1.2"`);
    let ly = cableTop + 12;
    out += tx(cx + 7, ly, `${cond.data.section} mm²`, `font-size="8" font-weight="700" fill="${P.ink}"`);
    ly += 10;
    out += tx(cx + 7, ly, `${cond.data.lengthM} m · ${cond.data.method}`, `font-size="7" fill="${P.dim}"`);
    if (opts.overlays.current) {
      ly += 10;
      out += tx(cx + 7, ly, `Ib ${fmt(cond.calc.Ib)} A`, `class="qtw-ov qtw-ov-current" font-size="7" fill="${P.accent}"`);
    }
    if (opts.overlays.drop) {
      ly += 10;
      out += tx(cx + 7, ly, `ΔV ${fmt(cond.calc.dropPct, 2)}%`, `class="qtw-ov qtw-ov-drop" font-size="7" fill="${statusColor(P, cond.validation.status)}"`);
    }
    if (opts.overlays.icc) {
      ly += 10;
      out += tx(cx + 7, ly, `Icc ${fmt(cond.calc.iccEndA / 1000, 1)} kA`, `class="qtw-ov qtw-ov-icc" font-size="7" fill="${P.dim}"`);
    }
    out += `</g>`;

    // Etiqueta da carga
    const tw = Math.max(w, 50);
    const lsc = statusColor(P, load.validation.status);
    out += `<g class="qtw-node" data-node="${circ.loadId}" data-kind="load">`;
    out += `<title>${esc(load.data.name)} — ${fmt(load.data.powerVA, 0)} VA</title>`;
    out += rc(cx - tw / 2, tagY, tw, 26, `fill="${P.module}" stroke="${opts.overlays.validation ? lsc : P.moduleStroke}" stroke-width="1" rx="4"`);
    out += tx(cx, tagY + 11, trunc(load.data.name, item.poles > 1 ? 18 : 9), `text-anchor="middle" font-size="7.5" font-weight="600" fill="${P.ink}"`);
    out += tx(cx, tagY + 20.5, `${fmt(load.data.powerVA, 0)} VA · ${load.data.wiring}`, `text-anchor="middle" font-size="6.5" fill="${P.dim}"`);
    out += `</g>`;

    out += `</g>`;
    return out;
  }

  /** Barras de Neutro e PE com terminais de parafuso. */
  function terminalBars(model, P, L, opts) {
    const busN = model.byId["bus-N"], busPE = model.byId["bus-PE"];
    const y = L.termY;
    const halfW = (L.encW - 2 * G.padX - 30) / 2;
    const nx = L.encX + G.padX, px = nx + halfW + 30;
    let out = "";

    const strip = (x, node, color, label, extra) => {
      let s = `<g class="qtw-node" data-node="${node.id}" data-kind="busbar">`;
      s += rc(x, y, halfW, 13, `fill="url(#qtw-steel)" stroke="${P.plateStroke}" stroke-width="0.8" rx="2.5"`);
      for (let sx = x + 10; sx < x + halfW - 6; sx += 16) {
        s += ci(sx, y + 6.5, 2.2, `fill="${P.plate}" stroke="${P.dim}" stroke-width="0.7"`);
      }
      s += rc(x, y - 3, 5, 19, `fill="${color}" rx="1.5"`);
      s += tx(x + 12, y + 25, label, `font-size="8" font-weight="800" letter-spacing="1" fill="${color}"`);
      if (extra) s += tx(x + halfW - 4, y + 25, extra, `text-anchor="end" font-size="7.5" fill="${P.dim}"`);
      s += `</g>`;
      return s;
    };

    if (busN) {
      const inLabel = (opts.overlays.current && busN.calc.currentA != null)
        ? `IN ≈ ${fmt(busN.calc.currentA)} A · ${busN.sub}` : busN.sub;
      out += strip(nx, busN, P.phases.N, "BARRA DE NEUTRO (N)", inLabel);
    }
    if (busPE) {
      out += strip(px, busPE, P.phases.PE, "BARRA DE PROTEÇÃO (PE)", busPE.sub);
      out += ln(px + halfW - 16, y + 13, px + halfW - 16, y + 22, `stroke="${P.phases.PE}" stroke-width="1.5"`);
      out += `<use href="#qtw-sym-ground" transform="translate(${px + halfW - 16},${y + 29}) scale(0.8)" style="color:${P.phases.PE}"/>`;
    }
    return out;
  }

  function legend(P, L, theme) {
    const y = L.encY + L.encH + 16;
    let x = L.encX;
    let out = `<g class="qtw-legend" font-size="8">`;
    L.phases.forEach(p => {
      out += rc(x, y - 6, 12, 7, `fill="${P.phases[p]}" rx="1.5"`);
      out += tx(x + 16, y, `Fase ${p}`, `font-size="8" fill="${P.dim}"`);
      x += 60;
    });
    out += rc(x, y - 6, 12, 7, `fill="url(#qtw-copper)" rx="1.5"`);
    out += tx(x + 16, y, "Barramento de cobre", `font-size="8" fill="${P.dim}"`);
    x += 120;
    out += rc(x, y - 6, 12, 7, `fill="url(#qtw-steel)" rx="1.5"`);
    out += tx(x + 16, y, "Barra N/PE", `font-size="8" fill="${P.dim}"`);
    x += 90;
    out += ci(x + 4, y - 3, 3, `fill="${P.ok}"`);
    out += tx(x + 12, y, "Conforme", `font-size="8" fill="${P.dim}"`);
    x += 74;
    out += ci(x + 4, y - 3, 3, `fill="${P.warn}"`);
    out += tx(x + 12, y, "Atenção", `font-size="8" fill="${P.dim}"`);
    x += 70;
    out += ci(x + 4, y - 3, 3, `fill="${P.err}"`);
    out += tx(x + 12, y, "Violação", `font-size="8" fill="${P.dim}"`);
    out += `</g>`;
    if (theme === "print") {
      out += tx(L.encX, L.height - 14,
        "EasyEletric v3.5 — Smart Distribution Board | ABNT NBR 5410:2023 | Pré-dimensionamento — não substitui projeto assinado com ART/RRT",
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
   * @param opts {theme, overlays, perRow, projectName, date}
   * @returns string SVG autocontido
   */
  function render(model, opts) {
    opts = Object.assign({ theme: "dark", projectName: "", date: "" }, opts || {});
    opts.overlays = Object.assign({}, DEFAULT_OVERLAYS, opts.overlays || {});
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
    s += busbars(model, P, L, opts);
    s += risers(P, L);
    L.rows.forEach(row => { s += distributionRow(model, row, P, L, opts); });
    if (!model.circuits.length) {
      s += tx(L.width / 2, L.busYEnd + 60, "Nenhum circuito calculado — adicione cargas e calcule o projeto.",
        `text-anchor="middle" font-size="12" fill="${P.dim}"`);
    }
    s += terminalBars(model, P, L, opts);
    s += legend(P, L, opts.theme);
    s += `</svg>`;
    return s;
  }

  return { render, layout, packRows, THEMES, DEFAULT_OVERLAYS, G, esc };
});
