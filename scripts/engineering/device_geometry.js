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
 * SOURCING POR CATEGORIA — cada dispositivo (mcb/rcd/spd) tem seu
 * próprio `sourced` + `note`, porque a confirmação não chegou junto
 * para os três ao mesmo tempo. Nesta versão, disjuntor (MCB) está
 * confirmado nas 5 marcas via datasheet oficial ou fonte que
 * reproduz diretamente os campos do datasheet do fabricante:
 *
 *   WEG MDW      — 18 × 86 × 45 mm   (catálogo oficial weg.net)
 *   Schneider    — 18 × 85 × 78,5 mm (datasheet oficial Acti9 iC60N,
 *   iC60N          download.se.com/A9F.._DATASHEET, conferido em
 *                  cópias públicas do mesmo documento)
 *   Siemens 5SL4 — 18 × 90 × 76 mm   (RS Components reproduzindo os
 *                  campos do datasheet Siemens 5SL4125-6; módulo de
 *                  18 mm também confirmado no catálogo oficial
 *                  Siemens LV10 "1 MW = 18 mm")
 *   ABB S200     — 18 × 86 × 68 mm   (datasheet oficial ABB S200 OV,
 *                  library.e.abb.com, seção "Dimensions (H x D x W)")
 *   Legrand DX3  — 17,8 × 94,8 × 77,8 mm (RS Components reproduzindo
 *                  os campos do datasheet Legrand DX3)
 *
 * IDR (RCD) e DPS (SPD): confirmado apenas para WEG nesta versão.
 * As demais marcas usam a envolvente padrão de mercado (largura do
 * próprio MCB já confirmado da marca; altura/profundidade
 * aproximadas por IEC 60947-2/EN 61008) até localizarmos o
 * datasheet oficial de cada uma — sempre marcado `sourced: false`,
 * nunca escondido.
 *
 * Trilho DIN: EN 50022, topo-chapéu 35 mm de largura, 7,5 mm de
 * altura da aba — padrão universal, não é dado de fabricante.
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

  const DIN_RAIL = { profile: "EN 50022 (topo-chapéu)", widthMm: 35, tabHeightMm: 7.5, thicknessMm: 1 };

  function dev(moduleWidthMm, heightMm, depthMm, sourced, note) {
    return { moduleWidthMm, heightMm, depthMm, sourced, note };
  }

  const MARKET_RCD = (moduleWidthMm) => dev(moduleWidthMm, 84, 72, false, "Envolvente padrão de mercado (IEC 61008) — confirmar datasheet oficial do IDR desta marca");
  const MARKET_SPD = (moduleWidthMm) => dev(moduleWidthMm, 90, 68, false, "Envolvente padrão de mercado (IEC 61643) — confirmar datasheet oficial do DPS desta marca");

  const GEOMETRY = {
    weg: {
      name: "WEG",
      colors: { body: "#f2f2ee", lever: "#e2261c", accent: "#003da5", label: "#1a1a1a" },
      mcb: dev(18, 86, 45, true, "Catálogo oficial WEG — Minidisjuntores MDW/MDWH (weg.net)"),
      rcd: dev(18, 89, 74, true, "Catálogo oficial WEG — DRs RDW (weg.net)"),
      spd: dev(18, 90, 68, true, "Catálogo oficial WEG — DPS SPW (weg.net)")
    },
    schneider: {
      name: "Schneider Electric",
      colors: { body: "#f4f4f2", lever: "#3dcd58", accent: "#3dcd58", label: "#1a1a1a" },
      mcb: dev(18, 85, 78.5, true, "Datasheet oficial Schneider Acti9 iC60N (download.se.com/A9F..._DATASHEET)"),
      rcd: MARKET_RCD(18), spd: MARKET_SPD(18)
    },
    siemens: {
      name: "Siemens",
      colors: { body: "#f2f2f0", lever: "#ff8c00", accent: "#000000", label: "#1a1a1a" },
      mcb: dev(18, 90, 76, true, "Datasheet Siemens SENTRON 5SL4 (5SL4125-6) via RS Components; módulo 18mm confirmado no catálogo oficial Siemens LV10"),
      rcd: MARKET_RCD(18), spd: MARKET_SPD(18)
    },
    abb: {
      name: "ABB",
      colors: { body: "#f0f0ee", lever: "#000000", accent: "#ff0000", label: "#1a1a1a" },
      mcb: dev(18, 86, 68, true, "Datasheet oficial ABB S200 OV (library.e.abb.com) — seção Dimensions (H x D x W)"),
      rcd: MARKET_RCD(18), spd: MARKET_SPD(18)
    },
    legrand: {
      name: "Legrand",
      colors: { body: "#f4f4f2", lever: "#0072ce", accent: "#0072ce", label: "#1a1a1a" },
      mcb: dev(17.8, 94.8, 77.8, true, "Datasheet Legrand DX3 via RS Components"),
      rcd: MARKET_RCD(17.8), spd: MARKET_SPD(17.8)
    },
    generic: {
      name: "Genérico",
      colors: { body: "#eeeeee", lever: "#444444", accent: "#888888", label: "#1a1a1a" },
      mcb: dev(17.5, 85, 75, false, "Envolvente padrão de mercado (IEC 60947-2 / EN 50022)"),
      rcd: MARKET_RCD(17.5), spd: MARKET_SPD(17.5)
    }
  };

  function makers() { return Object.keys(GEOMETRY); }

  /** Dimensões de um dispositivo específico (mm), já multiplicando
   *  a largura pelo número de polos. */
  function dims(makerId, deviceKind, poles) {
    const mk = GEOMETRY[makerId] || GEOMETRY.generic;
    const g = mk[deviceKind] || mk.mcb;
    const p = Math.max(1, poles || 1);
    return {
      widthMm: round1(g.moduleWidthMm * p),
      heightMm: g.heightMm,
      depthMm: g.depthMm,
      moduleWidthMm: g.moduleWidthMm,
      poles: p,
      sourced: g.sourced,
      note: g.note
    };
  }

  function colors(makerId) {
    const mk = GEOMETRY[makerId] || GEOMETRY.generic;
    return mk.colors;
  }

  /** Resumo do fabricante: nome + status de fonte por categoria de
   *  dispositivo (mcb/rcd/spd) — nunca um único booleano genérico,
   *  porque a confirmação não é uniforme entre categorias. */
  function info(makerId) {
    const mk = GEOMETRY[makerId] || GEOMETRY.generic;
    return {
      name: mk.name,
      sourced: mk.mcb.sourced, // compat: resumo pelo disjuntor (categoria mais usada no quadro)
      sourceNote: mk.mcb.note,
      byCategory: {
        mcb: { sourced: mk.mcb.sourced, note: mk.mcb.note },
        rcd: { sourced: mk.rcd.sourced, note: mk.rcd.note },
        spd: { sourced: mk.spd.sourced, note: mk.spd.note }
      }
    };
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  return { makers, dims, colors, info, DIN_RAIL, DISCLAIMER, GEOMETRY };
});
