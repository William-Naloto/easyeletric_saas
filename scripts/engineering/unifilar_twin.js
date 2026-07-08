/* ================================================================
 * EasyEletric — Diagrama Unifilar do Gêmeo Digital (SVG Engine)
 * ================================================================
 *
 * Módulo independente e SEM DOM: roda no navegador (global
 * `EEUnifilarTwin`) e em Node.js. Consome EXCLUSIVAMENTE o
 * ElectricalProjectModel — nenhum dado de engenharia é calculado
 * ou possuído aqui.
 *
 * Gera um diagrama unifilar profissional em SVG vetorial no estilo
 * de software de engenharia (Ecodial / Caneco / QiBuilder):
 *
 *   rede → medidor → alimentador → disjuntor geral → DPS →
 *   DR geral → barramentos (fases coloridas + N + PE) →
 *   disjuntores parciais → DR → condutores → cargas (com ícones)
 *
 * Recursos:
 *  - Biblioteca de símbolos IEC/NBR reutilizável (defs);
 *  - Temas dark / light / print (impressão com carimbo técnico);
 *  - Overlays de engenharia opcionais: corrente, queda de tensão,
 *    curto-circuito e validação (verde/amarelo/vermelho);
 *  - Cada objeto renderizado em <g data-node="ID"> — a UI liga
 *    hover/seleção/realce da cadeia via chainOf()/relatedOf()
 *    do modelo, sem re-renderizar.
 *
 * O SVG é autocontido (fontes de sistema, sem assets externos),
 * exportável e imprimível em alta resolução.
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.EEUnifilarTwin = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ==============================================================
   * Temas (paletas de renderização)
   * ============================================================== */
  /* Cores de condutor conforme NBR 5410 §6.1.5.3: fases PRETO /
   * VERMELHO / MARROM, neutro AZUL-CLARO, PE VERDE. No tema dark a
   * fase "preta" segue a convenção CAD (cor 7): renderiza clara. */
  const THEMES = {
    dark: {
      bg: "#0b1828", ink: "#e8f4fd", dim: "#7da3c0", faint: "#27415f",
      panel: "#101f36", panelStroke: "#2e5a8a",
      phases: { A: "#d7dee8", B: "#f87171", C: "#c9884b", N: "#60a5fa", PE: "#4ade80" },
      ok: "#22c55e", warn: "#f59e0b", err: "#ef4444",
      symbol: "#e8f4fd", accent: "#4da8ff"
    },
    light: {
      bg: "#ffffff", ink: "#0d1b2e", dim: "#4a6a8a", faint: "#d7e2f0",
      panel: "#f4f7fc", panelStroke: "#8fb0d4",
      phases: { A: "#1a1f26", B: "#d92b2b", C: "#8a5a2b", N: "#2f6fde", PE: "#17984d" },
      ok: "#16a34a", warn: "#d97706", err: "#dc2626",
      symbol: "#0d1b2e", accent: "#1565c0"
    },
    print: {
      bg: "#ffffff", ink: "#000000", dim: "#444444", faint: "#cccccc",
      panel: "#f5f5f5", panelStroke: "#000000",
      phases: { A: "#1a1f26", B: "#d92b2b", C: "#8a5a2b", N: "#2f6fde", PE: "#17984d" },
      ok: "#1a7f37", warn: "#b45309", err: "#b91c1c",
      symbol: "#000000", accent: "#000000"
    }
  };

  const DEFAULT_OVERLAYS = { current: true, drop: true, icc: false, validation: true };

  /* Geometria (todas as cotas em px do viewBox) */
  const G = {
    colW: 96,           // largura de cada coluna de circuito
    leftPad: 96,        // margem p/ rótulos dos barramentos
    rightPad: 150,      // margem p/ correntes dos barramentos
    busGap: 18,         // espaçamento vertical entre barramentos
    spineX: 200         // x da espinha vertical rede→DR geral
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

  function statusColor(P, status) {
    return status === "ERROR" ? P.err : status === "WARN" ? P.warn : P.ok;
  }

  /* Primitivas SVG */
  const ln = (x1, y1, x2, y2, a) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${a || ""}/>`;
  const rc = (x, y, w, h, a) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a || ""}/>`;
  const ci = (cx, cy, r, a) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${a || ""}/>`;
  const tx = (x, y, t, a) => `<text x="${x}" y="${y}" ${a || ""}>${esc(t)}</text>`;
  const pa = (d, a) => `<path d="${d}" ${a || ""}/>`;

  /* ==============================================================
   * Biblioteca de símbolos (IEC 60617 simplificado / prática NBR)
   * Cada símbolo é desenhado com centro em (0,0) e usa
   * currentColor, permitindo reuso via <use> com cor por contexto.
   * ============================================================== */
  function symbolDefs(P) {
    const s = 'stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"';
    return `<defs>
      <!-- Fonte / rede de distribuição -->
      <g id="tw-sym-source">${ci(0, 0, 11, s)}${pa("M -5 2 Q -2.5 -3 0 2 Q 2.5 7 5 2", s)}</g>
      <!-- Medidor de energia (kWh) -->
      <g id="tw-sym-meter">${ci(0, 0, 12, s)}${tx(0, 3.5, "kWh", 'text-anchor="middle" font-size="7" font-weight="700" fill="currentColor" stroke="none"')}</g>
      <!-- Disjuntor termomagnético (lâmina + cruz de disparo) -->
      <g id="tw-sym-breaker">${ln(0, -14, 0, -7, s)}${ln(0, -7, 7, 5, s)}${ln(0, 5, 0, 14, s)}${pa("M -3.2 -10.2 L 3.2 -3.8 M -3.2 -3.8 L 3.2 -10.2", 'stroke="currentColor" stroke-width="1.2"')}</g>
      <!-- DR / interruptor diferencial-residual (lâmina + elipse Δ) -->
      <g id="tw-sym-rcd">${ln(0, -14, 0, -7, s)}${ln(0, -7, 7, 5, s)}${ln(0, 5, 0, 14, s)}<ellipse cx="0" cy="0" rx="9.5" ry="6" ${s}/>${tx(0, 2.8, "Δ", 'text-anchor="middle" font-size="8" font-weight="700" fill="currentColor" stroke="none"')}</g>
      <!-- DPS / supressor de surto -->
      <g id="tw-sym-spd">${rc(-7, -12, 14, 24, s + ' rx="2"')}${pa("M 0 -12 L 0 -5 L -3.5 0 L 3.5 4 L 0 8 L 0 12", 'stroke="currentColor" stroke-width="1.5" fill="none"')}</g>
      <!-- Terra (aterramento funcional/proteção) -->
      <g id="tw-sym-ground">${ln(0, -8, 0, 0, s)}${ln(-8, 0, 8, 0, s)}${ln(-5, 4, 5, 4, s)}${ln(-2, 8, 2, 8, s)}</g>
      <!-- Ícones de carga (equipamento inferido pelo nome) -->
      <g id="tw-ico-light">${ci(0, 0, 8, s)}${pa("M -5.6 -5.6 L 5.6 5.6 M -5.6 5.6 L 5.6 -5.6", s)}</g>
      <g id="tw-ico-socket">${ci(0, 0, 8, s)}${ln(-3, -2.5, -3, 2.5, s)}${ln(3, -2.5, 3, 2.5, s)}</g>
      <g id="tw-ico-shower">${pa("M -7 8 L -7 -6 Q -7 -9 -4 -9 L 1 -9", s)}${ci(4, -9, 2.6, s)}${pa("M 1.5 -5.5 L 6.5 -5.5", 'stroke="currentColor" stroke-width="1.3"')}${pa("M 2 -3 L 1.4 0 M 4 -3 L 4 0 M 6 -3 L 6.6 0", 'stroke="currentColor" stroke-width="1.2" stroke-linecap="round"')}</g>
      <g id="tw-ico-fridge">${rc(-5.5, -9, 11, 18, s + ' rx="1.5"')}${ln(-5.5, -3, 5.5, -3, s)}${ln(3, -7.5, 3, -5.5, 'stroke="currentColor" stroke-width="1.3" stroke-linecap="round"')}${ln(3, -0.5, 3, 2.5, 'stroke="currentColor" stroke-width="1.3" stroke-linecap="round"')}</g>
      <g id="tw-ico-microwave">${rc(-8.5, -6, 17, 12, s + ' rx="1.5"')}${rc(-5.5, -3, 8, 6, 'stroke="currentColor" stroke-width="1.2" fill="none"')}${ci(5.5, -1.5, 0.9, 'fill="currentColor"')}${ci(5.5, 1.5, 0.9, 'fill="currentColor"')}</g>
      <g id="tw-ico-oven">${rc(-7.5, -7.5, 15, 15, s + ' rx="1.5"')}${ln(-7.5, -3.5, 7.5, -3.5, s)}${ci(-4.5, -5.5, 0.9, 'fill="currentColor"')}${ci(0, -5.5, 0.9, 'fill="currentColor"')}${ci(4.5, -5.5, 0.9, 'fill="currentColor"')}${rc(-4.5, -1, 9, 5.5, 'stroke="currentColor" stroke-width="1.2" fill="none"')}</g>
      <g id="tw-ico-washer">${rc(-7.5, -8.5, 15, 17, s + ' rx="1.5"')}${ln(-7.5, -4.5, 7.5, -4.5, s)}${ci(-5, -6.5, 0.9, 'fill="currentColor"')}${ci(0, 1.5, 4.4, s)}${pa("M -3 1 Q 0 3 3 1", 'stroke="currentColor" stroke-width="1.1" fill="none"')}</g>
      <g id="tw-ico-ac">${rc(-9, -7, 18, 8, s + ' rx="2"')}${ln(-6, -4.5, 6, -4.5, 'stroke="currentColor" stroke-width="1.1"')}${pa("M -5 3 Q -4 5 -5 7 M 0 3 Q 1 5 0 7 M 5 3 Q 6 5 5 7", 'stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"')}</g>
      <g id="tw-ico-motor">${ci(0, 0, 8.5, s)}${tx(0, 3.4, "M", 'text-anchor="middle" font-size="9" font-weight="700" fill="currentColor" stroke="none"')}</g>
      <g id="tw-ico-generic">${pa("M 0 -8 L 0 2 M -4 -2 L 0 2 L 4 -2", s)}${ln(-6, 6, 6, 6, s)}</g>
    </defs>`;
  }

  const ICON_ID = {
    light: "tw-ico-light", socket: "tw-ico-socket", shower: "tw-ico-shower",
    fridge: "tw-ico-fridge", microwave: "tw-ico-microwave", oven: "tw-ico-oven",
    washer: "tw-ico-washer", ac: "tw-ico-ac", motor: "tw-ico-motor",
    generic: "tw-ico-generic"
  };

  function use(id, x, y, color, scale) {
    return `<use href="#${id}" x="0" y="0" transform="translate(${x},${y})${scale ? ` scale(${scale})` : ""}" style="color:${color}"/>`;
  }

  /* ==============================================================
   * Layout — posições verticais derivadas do modelo
   * ============================================================== */
  function layout(model, theme) {
    const phases = model.summary.phasesInUse;
    const n = Math.max(model.circuits.length, 1);
    const headerH = theme === "print" ? 96 : 64;
    const panelY = headerH + 32;      // bloco do QDF centralizado no topo
    const srcY = headerH + 100;       // espinha começa abaixo do bloco
    const meterY = srcY + 62;
    const mainY = meterY + 84;
    const rcdY = mainY + 78;
    const busY0 = rcdY + 60;
    const busIds = phases.concat(["N", "PE"]);
    const busY = {};
    busIds.forEach((p, i) => { busY[p] = busY0 + i * G.busGap; });
    const busYEnd = busY0 + (busIds.length - 1) * G.busGap;
    const brkY = busYEnd + 66;
    const cRcdY = brkY + 52;
    const cableY = cRcdY + 50;
    const loadY = cableY + 78;        // folga p/ até 5 linhas de rótulo do cabo
    const footY = loadY + 66;
    const width = Math.max(760, G.leftPad + n * G.colW + G.rightPad);
    const height = footY + (theme === "print" ? 46 : 30);
    const colX = i => G.leftPad + i * G.colW + G.colW / 2;
    return { headerH, panelY, srcY, meterY, mainY, rcdY, busY, busIds, busYEnd, brkY, cRcdY, cableY, loadY, footY, width, height, colX, phases };
  }

  /* ==============================================================
   * Blocos do diagrama
   * ============================================================== */

  function header(model, P, L, opts) {
    const s = model.summary;
    const proj = opts.projectName || "EasyEletric — Projeto Elétrico Residencial";
    const dateStr = opts.date || "";
    let out = "";
    if (opts.theme === "print") {
      // Carimbo técnico de impressão
      out += rc(0, 0, L.width, 96, `fill="#ffffff" stroke="#000" stroke-width="2"`);
      out += ln(0, 60, L.width, 60, 'stroke="#000" stroke-width="1"');
      out += tx(L.width / 2, 28, "DIAGRAMA ELÉTRICO UNIFILAR", 'text-anchor="middle" font-size="19" font-weight="800" fill="#000" letter-spacing="4"');
      out += tx(L.width / 2, 48, "ABNT NBR 5410:2023 — Instalações Elétricas de Baixa Tensão", 'text-anchor="middle" font-size="10" fill="#333"');
      out += tx(14, 80, `Projeto: ${proj}`, 'font-size="10" fill="#000"');
      out += tx(L.width / 2, 80, `Sistema ${s.supplyType} · ${s.circuits} circuitos · Demanda ${fmt(s.demandVA / 1000, 2)} kVA`, 'text-anchor="middle" font-size="10" fill="#000"');
      out += tx(L.width - 14, 80, dateStr ? `Data: ${dateStr}` : "EasyEletric v3.7", 'text-anchor="end" font-size="10" fill="#000"');
    } else {
      out += tx(20, 30, "DIAGRAMA UNIFILAR — DIGITAL TWIN", `font-size="15" font-weight="800" fill="${P.ink}" letter-spacing="2"`);
      out += tx(20, 48, `${proj} · NBR 5410:2023`, `font-size="10" fill="${P.dim}"`);
      const sc = statusColor(P, s.status);
      out += ci(L.width - 26, 26, 5, `fill="${sc}"`);
      out += tx(L.width - 38, 30, s.status === "PASS" ? "CONFORME" : s.status === "WARN" ? "ATENÇÃO" : "VIOLAÇÃO",
        `text-anchor="end" font-size="10" font-weight="700" fill="${sc}"`);
    }
    return out;
  }

  /** Espinha de entrada: rede → medidor → alimentador → geral → DPS → DR */
  function spine(model, P, L, opts) {
    const X = G.spineX;
    const by = model.byId;
    const s = model.summary;
    const feeder = by.feeder, main = by["main-breaker"], spd = by.spd, mrcd = by["main-rcd"];
    const wire = `stroke="${P.ink}" stroke-width="2"`;
    const lbl = `font-size="9" fill="${P.dim}"`;
    const val = `font-size="10" font-weight="700" fill="${P.ink}"`;
    let out = "";

    // Rede
    out += `<g class="tw-node" data-node="utility" data-kind="utility">`;
    out += use("tw-sym-source", X, L.srcY, P.symbol);
    out += tx(X + 22, L.srcY - 2, by.utility.label, val);
    out += tx(X + 22, L.srcY + 11, `${by.utility.sub} · Icc presumida ${fmt(by.utility.data.ikOriginA / 1000, 1)} kA`, lbl);
    out += `</g>`;
    out += ln(X, L.srcY + 12, X, L.meterY - 13, wire);

    // Medidor
    out += `<g class="tw-node" data-node="meter" data-kind="meter">`;
    out += use("tw-sym-meter", X, L.meterY, P.symbol);
    out += tx(X + 22, L.meterY + 4, by.meter.label, val);
    out += `</g>`;

    // Alimentador (trecho medidor → disjuntor geral)
    out += `<g class="tw-node" data-node="feeder" data-kind="conductor">`;
    out += ln(X, L.meterY + 13, X, L.mainY - 15, wire);
    out += pa(`M ${X - 5} ${L.meterY + 30} L ${X + 5} ${L.meterY + 24}`, `stroke="${P.ink}" stroke-width="1.4"`);
    if (feeder.data.section) {
      out += tx(X + 14, L.meterY + 30, `${feeder.data.section} mm² (${feeder.data.insulation}) + N ${feeder.data.neutral} + PE ${feeder.data.pe} mm²`, val);
      out += tx(X + 14, L.meterY + 43, `${feeder.data.lengthM} m · método ${feeder.data.method} · Izc ${fmt(feeder.calc.Izc)} A`, lbl);
      if (opts.overlays.current) out += tx(X + 14, L.meterY + 56, `Ib ${fmt(feeder.calc.Ib)} A (dim. ${fmt(feeder.calc.Idim)} A c/ reserva)`, `class="tw-ov tw-ov-current" font-size="9" fill="${P.accent}"`);
      if (opts.overlays.drop) out += tx(X + 14, L.meterY + 68, `ΔV ${fmt(feeder.calc.dropPct, 2)}% ≤ ${feeder.calc.maxDropPct}%`, `class="tw-ov tw-ov-drop" font-size="9" fill="${statusColor(P, feeder.validation.status)}"`);
    }
    out += `</g>`;

    // Disjuntor geral
    out += `<g class="tw-node" data-node="main-breaker" data-kind="breaker">`;
    out += use("tw-sym-breaker", X, L.mainY, P.symbol);
    out += tx(X - 20, L.mainY - 2, "DISJUNTOR GERAL", `text-anchor="end" font-size="9" font-weight="700" fill="${P.ink}"`);
    out += tx(X - 20, L.mainY + 10, main.sub, `text-anchor="end" ${lbl}`);
    if (main.calc.icnRequiredA) out += tx(X - 20, L.mainY + 22, `Icn ≥ ${fmt(main.calc.icnRequiredA / 1000, 1)} kA`, `text-anchor="end" ${lbl}`);
    if (opts.overlays.validation) out += ci(X + 14, L.mainY - 10, 3.4, `class="tw-ov tw-ov-validation" fill="${statusColor(P, main.validation.status)}"`);
    out += `</g>`;
    out += ln(X, L.mainY + 15, X, L.rcdY - 15, wire);

    // DPS — derivação para PE
    const spdX = X + 96;
    const junY = L.mainY + 34;
    out += `<g class="tw-node" data-node="spd" data-kind="spd">`;
    out += ci(X, junY, 2.6, `fill="${P.ink}"`);
    out += ln(X, junY, spdX - 8, junY, `stroke="${P.ink}" stroke-width="1.4"`);
    out += ln(spdX, junY, spdX, junY, wire);
    out += use("tw-sym-spd", spdX, junY + 6, P.symbol, 0.9);
    out += ln(spdX, junY + 18, spdX, junY + 30, `stroke="${P.phases.PE}" stroke-width="1.4"`);
    out += use("tw-sym-ground", spdX, junY + 36, P.phases.PE, 0.8);
    out += tx(spdX + 16, junY + 6, "DPS " + (spd.sub || ""), lbl);
    if (spd.data.ucV) out += tx(spdX + 16, junY + 18, `Uc ≥ ${spd.data.ucV} V · ${spd.data.standard || "IEC 61643-11"}`, `font-size="8" fill="${P.dim}"`);
    out += `</g>`;

    // DR geral
    out += `<g class="tw-node" data-node="main-rcd" data-kind="rcd">`;
    out += use("tw-sym-rcd", X, L.rcdY, P.symbol);
    out += tx(X - 20, L.rcdY - 2, "DR GERAL", `text-anchor="end" font-size="9" font-weight="700" fill="${P.ink}"`);
    out += tx(X - 20, L.rcdY + 10, mrcd.sub, `text-anchor="end" ${lbl}`);
    out += `</g>`;
    out += ln(X, L.rcdY + 15, X, L.busY[L.phases[0]], wire);
    return out;
  }

  /** Bloco do QDF — centralizado no topo da folha (nó panel). */
  function panelBlock(model, P, L, opts) {
    const p = model.byId.panel;
    const cx = L.width / 2, y = L.panelY;
    const w = 460, h = 50, x = cx - w / 2;
    const sc = statusColor(P, p.validation.status);
    let out = `<g class="tw-node" data-node="panel" data-kind="panel">`;
    out += rc(x, y - 16, w, h, `fill="${P.panel}" stroke="${opts.overlays.validation ? sc : P.panelStroke}" stroke-width="1.3" rx="9"`);
    out += tx(cx, y - 1, p.label, `text-anchor="middle" font-size="11.5" font-weight="800" fill="${P.ink}"`);
    if (p.calc.installedVA != null) {
      out += tx(cx, y + 12, `Instalada ${fmt(p.calc.installedVA / 1000, 2)} kVA → Demanda ${fmt(p.calc.demandVA / 1000, 2)} kVA (Fd ${fmt(p.calc.overallFactor * 100, 0)}%)`, `text-anchor="middle" font-size="9" fill="${P.dim}"`);
      out += tx(cx, y + 24, `Desequilíbrio ${fmt(p.calc.imbalancePct, 0)}%${p.calc.balanceScore != null ? ` · score ${p.calc.balanceScore}/100` : ""}${p.calc.neutralA != null ? ` · IN ≈ ${fmt(p.calc.neutralA)} A` : ""}`, `text-anchor="middle" font-size="9" fill="${P.dim}"`);
    }
    if (opts.overlays.validation) out += ci(x + 13, y - 2, 3.4, `class="tw-ov tw-ov-validation" fill="${sc}"`);
    out += `</g>`;
    return out;
  }

  /** Barramentos horizontais coloridos por fase, com correntes. */
  function busbars(model, P, L, opts) {
    const x0 = G.leftPad - 30;
    const x1 = L.width - G.rightPad + 60;
    let out = "";
    L.busIds.forEach(p => {
      const node = model.byId["bus-" + p];
      if (!node) return;
      const y = L.busY[p];
      const c = P.phases[p] || P.ink;
      const dash = p === "PE" ? ' stroke-dasharray="7,4"' : p === "N" ? ' stroke-dasharray="2.5,3.5"' : "";
      out += `<g class="tw-node" data-node="bus-${p}" data-kind="busbar">`;
      out += ln(x0, y, x1, y, `stroke="${c}" stroke-width="${p === "N" || p === "PE" ? 2 : 3}"${dash}`);
      out += tx(x0 - 8, y + 3.5, p === "PE" ? "PE ⏚" : p, `text-anchor="end" font-size="11" font-weight="800" fill="${c}"`);
      if (opts.overlays.current && node.calc.currentA != null)
        out += tx(x1 + 8, y + 3.5, `${fmt(node.calc.currentA)} A`, `class="tw-ov tw-ov-current" font-size="9" font-weight="600" fill="${c}"`);
      out += `</g>`;
    });
    // PE desce ao eletrodo de terra
    const peY = L.busY.PE;
    out += ln(x0 + 14, peY, x0 + 14, peY + 18, `stroke="${P.phases.PE}" stroke-width="1.6"`);
    out += use("tw-sym-ground", x0 + 14, peY + 24, P.phases.PE, 0.9);
    return out;
  }

  /** Coluna de um circuito: quedas de fase, disjuntor, DR, cabo, carga. */
  function circuitColumn(model, circ, i, P, L, opts) {
    const by = model.byId;
    const x = L.colX(i);
    const brk = by[circ.breakerId], rcd = circ.rcdId ? by[circ.rcdId] : null;
    const cond = by[circ.conductorId], load = by[circ.loadId];
    const phases = circ.phases;
    const lbl = `font-size="8.5" fill="${P.dim}"`;
    let out = `<g class="tw-circuit" data-circuit="${circ.n}">`;

    // Quedas verticais das fases até o disjuntor (coloridas por fase)
    const spread = phases.length > 1 ? 7 : 0;
    phases.forEach((p, k) => {
      const px = x + (k - (phases.length - 1) / 2) * spread;
      const c = P.phases[p] || P.ink;
      out += ci(px, L.busY[p], 3, `fill="${c}"`);
      out += ln(px, L.busY[p], px, L.brkY - 16, `stroke="${c}" stroke-width="1.6"`);
    });
    if (phases.length > 1) { // converge no símbolo
      phases.forEach((p, k) => {
        const px = x + (k - (phases.length - 1) / 2) * spread;
        out += ln(px, L.brkY - 16, x, L.brkY - 14, `stroke="${P.phases[p] || P.ink}" stroke-width="1.4"`);
      });
    }

    // Número do circuito
    out += tx(x, L.busYEnd + 36, `C${String(circ.n).padStart(2, "0")}`, `text-anchor="middle" font-size="10" font-weight="800" fill="${P.ink}"`);

    // Disjuntor parcial
    out += `<g class="tw-node" data-node="${circ.breakerId}" data-kind="breaker">`;
    out += use("tw-sym-breaker", x, L.brkY, P.symbol);
    out += tx(x + 12, L.brkY - 2, `${brk.data.In} A`, `font-size="9.5" font-weight="700" fill="${P.ink}"`);
    out += tx(x + 12, L.brkY + 9, `curva ${brk.data.curve} · ${brk.data.poles}P`, lbl);
    if (opts.overlays.icc && brk.calc.icnRequiredA)
      out += tx(x + 12, L.brkY + 20, `Icn ${fmt(brk.calc.icnRequiredA / 1000, 1)} kA`, `class="tw-ov tw-ov-icc" ${lbl}`);
    if (opts.overlays.validation)
      out += ci(x - 11, L.brkY - 10, 3, `class="tw-ov tw-ov-validation" fill="${statusColor(P, brk.validation.status)}"`);
    out += `</g>`;

    // DR do circuito (quando 30 mA) ou passagem direta
    let yCursor = L.brkY + 14;
    if (rcd) {
      out += ln(x, yCursor, x, L.cRcdY - 14, `stroke="${P.ink}" stroke-width="1.6"`);
      out += `<g class="tw-node" data-node="${circ.rcdId}" data-kind="rcd">`;
      out += use("tw-sym-rcd", x, L.cRcdY, P.symbol);
      out += tx(x + 12, L.cRcdY + 3, `${rcd.data.sensitivityMa} mA`, lbl);
      out += `</g>`;
      yCursor = L.cRcdY + 14;
    }

    // Condutor — rótulos empilhados dinamicamente (só overlays ativos),
    // sempre dentro da coluna e sem invadir a caixa da carga
    out += `<g class="tw-node" data-node="${circ.conductorId}" data-kind="conductor">`;
    out += ln(x, yCursor, x, L.loadY - 24, `stroke="${P.ink}" stroke-width="1.6"`);
    out += pa(`M ${x - 5} ${L.cableY + 4} L ${x + 5} ${L.cableY - 4}`, `stroke="${P.ink}" stroke-width="1.3"`);
    let ly = L.cableY - 1;
    out += tx(x + 9, ly, `${cond.data.section} mm²`, `font-size="9" font-weight="700" fill="${P.ink}"`);
    ly += 11;
    out += tx(x + 9, ly, `${cond.data.lengthM} m · ${cond.data.method}`, `font-size="8" fill="${P.dim}"`);
    if (opts.overlays.current) {
      ly += 11;
      out += tx(x + 9, ly, `Ib ${fmt(cond.calc.Ib)} A`, `class="tw-ov tw-ov-current" font-size="8" fill="${P.accent}"`);
    }
    if (opts.overlays.drop) {
      ly += 11;
      out += tx(x + 9, ly, `ΔV ${fmt(cond.calc.dropPct, 2)}%`, `class="tw-ov tw-ov-drop" font-size="8" fill="${statusColor(P, cond.validation.status)}"`);
    }
    if (opts.overlays.icc) {
      ly += 11;
      out += tx(x + 9, ly, `Icc ${fmt(cond.calc.iccEndA / 1000, 1)} kA`, `class="tw-ov tw-ov-icc" font-size="8" fill="${P.dim}"`);
    }
    out += `</g>`;

    // Carga (caixa com ícone, nome e potência)
    const bw = G.colW - 14, bx = x - bw / 2;
    const sc = statusColor(P, load.validation.status);
    out += `<g class="tw-node" data-node="${circ.loadId}" data-kind="load">`;
    out += rc(bx, L.loadY - 22, bw, 56, `fill="${P.panel}" stroke="${opts.overlays.validation ? sc : P.panelStroke}" stroke-width="1.4" rx="7"`);
    out += use(ICON_ID[load.viz.icon] || ICON_ID.generic, x, L.loadY - 6, P.symbol, 0.95);
    out += tx(x, L.loadY + 16, trunc(load.data.name, 15), `text-anchor="middle" font-size="8.5" font-weight="600" fill="${P.ink}"`);
    out += tx(x, L.loadY + 27, `${fmt(load.data.powerVA, 0)} VA · ${load.data.wiring}`, `text-anchor="middle" font-size="7.5" fill="${P.dim}"`);
    if (opts.overlays.validation)
      out += ci(bx + bw - 8, L.loadY - 14, 3, `class="tw-ov tw-ov-validation" fill="${sc}"`);
    out += `</g>`;
    out += `</g>`;
    return out;
  }

  function legend(P, L, theme) {
    const y = L.footY + 4;
    let x = 20;
    let out = `<g class="tw-legend" font-size="8">`;
    const item = (draw, label, w) => {
      out += draw(x, y);
      out += tx(x + 16, y + 3, label, `font-size="8" fill="${P.dim}"`);
      x += w;
    };
    item((ax, ay) => use("tw-sym-breaker", ax + 5, ay, P.symbol, 0.55), "Disjuntor", 78);
    item((ax, ay) => use("tw-sym-rcd", ax + 5, ay, P.symbol, 0.55), "DR/IDR", 66);
    item((ax, ay) => use("tw-sym-spd", ax + 5, ay, P.symbol, 0.5), "DPS", 56);
    item((ax, ay) => use("tw-sym-ground", ax + 5, ay - 2, P.phases.PE, 0.6), "Terra/PE", 74);
    Object.keys(P.phases).forEach(p => {
      if (p === "PE" || p === "N") return;
      out += ln(x, y, x + 12, y, `stroke="${P.phases[p]}" stroke-width="3"`);
      out += tx(x + 16, y + 3, `Fase ${p} — ${{A:"preto",B:"vermelho",C:"marrom"}[p]||p}`, `font-size="8" fill="${P.dim}"`);
      x += 44;
      x += 62;
    });
    out += `</g>`;
    if (theme === "print") {
      out += tx(20, L.height - 12,
        "EasyEletric v3.7 — Digital Twin | ABNT NBR 5410:2023 | Pré-dimensionamento — não substitui projeto assinado com ART/RRT",
        `font-size="7.5" fill="${P.dim}"`);
    }
    return out;
  }

  /* ==============================================================
   * Render principal
   * ============================================================== */

  /**
   * Renderiza o diagrama unifilar do modelo.
   * @param model ElectricalProjectModel (EEProjectModel.build)
   * @param opts {theme, overlays, projectName, date}
   * @returns string SVG autocontido
   */
  function render(model, opts) {
    opts = Object.assign({ theme: "dark", projectName: "", date: "" }, opts || {});
    opts.overlays = Object.assign({}, DEFAULT_OVERLAYS, opts.overlays || {});
    const P = THEMES[opts.theme] || THEMES.dark;
    const L = layout(model, opts.theme);

    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" ` +
      `viewBox="0 0 ${L.width} ${L.height}" class="tw-svg tw-theme-${opts.theme}" ` +
      `font-family="Inter,Segoe UI,Arial,sans-serif" data-twin-version="${model.version}">`;
    s += `<style>
      .tw-node{cursor:pointer}
      .tw-svg.tw-has-focus .tw-node{opacity:.22;transition:opacity .18s}
      .tw-svg.tw-has-focus .tw-node.tw-hl{opacity:1}
      .tw-node.tw-selected{filter:drop-shadow(0 0 5px ${P.accent})}
    </style>`;
    s += symbolDefs(P);
    s += rc(0, 0, L.width, L.height, `fill="${P.bg}"`);
    s += header(model, P, L, opts);
    s += panelBlock(model, P, L, opts);
    s += spine(model, P, L, opts);
    s += busbars(model, P, L, opts);
    model.circuits.forEach((c, i) => { s += circuitColumn(model, c, i, P, L, opts); });
    if (!model.circuits.length) {
      s += tx(L.width / 2, L.brkY, "Nenhum circuito calculado — adicione cargas e calcule o projeto.",
        `text-anchor="middle" font-size="12" fill="${P.dim}"`);
    }
    s += legend(P, L, opts.theme);
    s += `</svg>`;
    return s;
  }

  return { render, layout, THEMES, DEFAULT_OVERLAYS, esc };
});
