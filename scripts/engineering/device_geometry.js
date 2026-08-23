/* ================================================================
 * EasyEletric — Geometria de Dispositivos DIN (dados públicos)
 * ================================================================
 *
 * Módulo independente e SEM DOM: roda no navegador (global
 * `EEDeviceGeometry`) e em Node.js. Fornece as dimensões físicas
 * (mm) e cores de acabamento REAIS de disjuntor/IDR/DPS por
 * fabricante, para montar um modelo 3D paramétrico PRÓPRIO — não
 * é o asset CAD oficial do fabricante (isso exige licenciamento
 * comercial, ver CHANGELOG), é geometria construída a partir de
 * especificação técnica PÚBLICA (datasheet, catálogo, norma).
 *
 * Fontes:
 *  - WEG: catálogo oficial "Minidisjuntores MDW/MDWH, DRs RDW, DPS
 *    SPW" (weg.net, PDF público) — seção "Dimensões (mm)":
 *    MDW 1 módulo = 18 mm largura, ~45 mm profundidade (trilho→
 *    corpo), ~86-89 mm altura; RDW ~74 mm altura, ~89 mm
 *    profundidade; SPW 1 módulo, ~88-92 mm altura, ~68 mm
 *    profundidade.
 *  - Demais fabricantes (Schneider Acti9, Siemens 5SL, ABB S200,
 *    Legrand DX3): a largura de 1 módulo (17,5 mm) e a fixação em
 *    trilho DIN de 35 mm são padronizadas por IEC 60947-2/EN 50022
 *    — todo fabricante do setor segue essa envolvente. Como não
 *    temos o datasheet exato de cada um em mãos, usamos a
 *    envolvente padrão do setor (17,5×80×68 mm) como aproximação
 *    até confirmarmos o datasheet oficial de cada marca — os
 *    valores de WEG (a única com fonte primária conferida aqui)
 *    são usados como o "real" desta primeira versão.
 *  - Trilho DIN: EN 50022, topo-chapéu 35 mm de largura, 7,5 mm de
 *    altura da aba — padrão universal, não é dado de fabricante.
 *
 * IMPORTANTE: como em manufacturer_catalog.js, os valores de
 * fabricantes sem fonte primária conferida são ILUSTRATIVOS
 * (aproximação por padrão de mercado) — confirmar no datasheet
 * oficial antes de qualquer uso comercial/impressão de desenho
 * certificado. `sourced: true` marca as entradas com fonte
 * primária conferida nesta versão.
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.EEDeviceGeometry = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DISCLAIMER = "Dimensões próprias (não são o asset CAD oficial do fabricante) — construídas a partir de datasheet/norma pública; confirmar no catálogo oficial vigente antes de uso certificado.";

  // Envolvente padrão de mercado (IEC 60947-2 / EN 50022) — usada
  // como aproximação para marcas sem datasheet conferido nesta
  // versão (ver disclaimer acima).
  const MARKET_ENVELOPE = { moduleWidthMm: 17.5, heightMm: 80, depthMm: 68 };

  const DIN_RAIL = { profile: "EN 50022 (topo-chapéu)", widthMm: 35, tabHeightMm: 7.5, thicknessMm: 1 };

  /* ==============================================================
   * Dimensões por fabricante e tipo de dispositivo
   * heightMm/depthMm independem do número de polos; a largura
   * total = polos × moduleWidthMm.
   * ============================================================== */
  const GEOMETRY = {
    weg: {
      name: "WEG",
      sourced: true,
      sourceNote: "Catálogo oficial WEG — Minidisjuntores MDW/MDWH, DRs RDW, DPS SPW (weg.net)",
      colors: { body: "#f2f2ee", lever: "#e2261c", accent: "#003da5", label: "#1a1a1a" },
      mcb: { moduleWidthMm: 18, heightMm: 86, depthMm: 45 },
      rcd: { moduleWidthMm: 18, heightMm: 89, depthMm: 74 },
      spd: { moduleWidthMm: 18, heightMm: 90, depthMm: 68 }
    },
    schneider: {
      name: "Schneider Electric",
      sourced: false,
      sourceNote: "Envolvente padrão de mercado — confirmar datasheet Acti9 iC60/Easy9 oficial",
      colors: { body: "#f4f4f2", lever: "#3dcd58", accent: "#3dcd58", label: "#1a1a1a" },
      mcb: MARKET_ENVELOPE, rcd: MARKET_ENVELOPE, spd: MARKET_ENVELOPE
    },
    siemens: {
      name: "Siemens",
      sourced: false,
      sourceNote: "Envolvente padrão de mercado — confirmar datasheet 5SL/5SV oficial",
      colors: { body: "#f2f2f0", lever: "#ff8c00", accent: "#000000", label: "#1a1a1a" },
      mcb: MARKET_ENVELOPE, rcd: MARKET_ENVELOPE, spd: MARKET_ENVELOPE
    },
    abb: {
      name: "ABB",
      sourced: false,
      sourceNote: "Envolvente padrão de mercado — confirmar datasheet S200/F200 oficial",
      colors: { body: "#f0f0ee", lever: "#000000", accent: "#ff0000", label: "#1a1a1a" },
      mcb: MARKET_ENVELOPE, rcd: MARKET_ENVELOPE, spd: MARKET_ENVELOPE
    },
    legrand: {
      name: "Legrand",
      sourced: false,
      sourceNote: "Envolvente padrão de mercado — confirmar datasheet DX3 oficial",
      colors: { body: "#f4f4f2", lever: "#0072ce", accent: "#0072ce", label: "#1a1a1a" },
      mcb: MARKET_ENVELOPE, rcd: MARKET_ENVELOPE, spd: MARKET_ENVELOPE
    },
    generic: {
      name: "Genérico",
      sourced: false,
      sourceNote: "Envolvente padrão de mercado (IEC 60947-2 / EN 50022)",
      colors: { body: "#eeeeee", lever: "#444444", accent: "#888888", label: "#1a1a1a" },
      mcb: MARKET_ENVELOPE, rcd: MARKET_ENVELOPE, spd: MARKET_ENVELOPE
    }
  };

  function makers() { return Object.keys(GEOMETRY); }

  /** Dimensões de um dispositivo específico (mm), já multiplicando
   *  a largura pelo número de polos. */
  function dims(makerId, deviceKind, poles) {
    const mk = GEOMETRY[makerId] || GEOMETRY.generic;
    const g = mk[deviceKind] || MARKET_ENVELOPE;
    const p = Math.max(1, poles || 1);
    return {
      widthMm: round1(g.moduleWidthMm * p),
      heightMm: g.heightMm,
      depthMm: g.depthMm,
      moduleWidthMm: g.moduleWidthMm,
      poles: p
    };
  }

  function colors(makerId) {
    const mk = GEOMETRY[makerId] || GEOMETRY.generic;
    return mk.colors;
  }

  function info(makerId) {
    const mk = GEOMETRY[makerId] || GEOMETRY.generic;
    return { name: mk.name, sourced: mk.sourced, sourceNote: mk.sourceNote };
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  return { makers, dims, colors, info, DIN_RAIL, DISCLAIMER, GEOMETRY };
});
