/* ================================================================
 * EasyEletric — QDF 3D Builder (lista de peças paramétrica)
 * ================================================================
 *
 * Módulo independente e SEM DOM/Three.js: roda no navegador
 * (global `EEQdf3D`) e em Node.js. NÃO desenha nada — devolve uma
 * lista de "peças" (caixas com posição/tamanho/cor/rótulo em mm)
 * a partir do ElectricalProjectModel + EEDeviceGeometry +
 * EEManufacturerCatalog. Qualquer motor de render (Three.js no
 * navegador, ou outro) consome essa lista sem precisar conhecer
 * NBR 5410 nem o modelo elétrico.
 *
 * Sistema de coordenadas (mm, origem no canto inferior-esquerdo
 * INTERNO do gabinete, olhando a porta aberta de frente):
 *   x → direita   y → para cima   z → profundidade (0 = fundo do
 *   gabinete, cresce em direção à porta/observador)
 *
 * Layout: réplica 3D do mesmo agrupamento usado no diagrama 2D
 * (qdf_twin.js `splitColumns`): disjuntor geral + DR geral + DPS's
 * no topo, barramentos verticais de fase no centro, circuitos
 * terminais em duas colunas (esquerda = índice par, direita =
 * ímpar) descendo em trilhos DIN horizontais.
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(
      typeof require !== "undefined" ? require("./device_geometry.js") : root.EEDeviceGeometry,
      typeof require !== "undefined" ? require("./manufacturer_catalog.js") : root.EEManufacturerCatalog
    );
  } else {
    root.EEQdf3D = factory(root.EEDeviceGeometry, root.EEManufacturerCatalog);
  }
})(typeof self !== "undefined" ? self : this, function (DG, CAT) {
  "use strict";

  const G = {
    marginMm: 45,          // vão do gabinete até o primeiro trilho
    railPitchMm: 105,       // passo vertical entre trilhos DIN (fileiras)
    colGapMm: 220,          // vão central para barramentos/etiquetas
    busbarWidthMm: 10, busbarDepthMm: 4,
    railDepthFromBackMm: 30,
    enclosureDepthMm: 120,
    doorFrameMm: 25
  };

  const PHASE_COLOR = { A: "#1a1a1a", B: "#c81e1e", C: "#8a5a2b" };
  const NEUTRAL_COLOR = "#3aa0e0", PE_COLOR = "#1f9d55";

  function box(id, kind, label, x, y, z, w, h, d, color, extra) {
    return Object.assign({ id, kind, label, x, y, z, w, h, d, color }, extra || {});
  }

  /**
   * Monta a lista de peças 3D do quadro inteiro para um fabricante
   * escolhido (mesmo fabricante em todo o quadro, como já faz
   * `manufacturer_catalog.forModel`). `poles` de cada dispositivo
   * vem do próprio nó do modelo (circ.phases.length + neutro).
   */
  function build(model, opts) {
    opts = opts || {};
    const makerId = opts.makerId || "weg";
    const geomInfo = DG.info(makerId);
    const colorSet = DG.colors(makerId);
    // manufacturer_catalog não tem fallback "generic" próprio para
    // referência comercial (não faz sentido um "part number
    // genérico") — mas a CENA 3D precisa sempre renderizar, então
    // se o fabricante não existir no catálogo comercial, a cena
    // segue sem `catalogRef` (peças aparecem sem número de peça,
    // não é erro fatal de geometria).
    const catalog = CAT.forModel(makerId, model) || { byNode: {}, disclaimer: CAT.DISCLAIMER };
    const by = model.byId;
    const parts = [];

    // ── 1. Colunas esquerda/direita — mesma regra do diagrama 2D
    const left = [], right = [];
    (model.circuits || []).forEach((c, i) => (i % 2 === 0 ? left : right).push(c));
    const rows = Math.max(left.length, right.length, 0);

    const topBandMm = 200; // geral + DR + DPS
    const panelWidthMm = 2 * G.marginMm + 2 * 200 /* zona de circuitos */ + G.colGapMm;
    const panelHeightMm = G.marginMm * 2 + topBandMm + rows * G.railPitchMm;

    // ── 2. Trilhos DIN horizontais (um por fileira de circuito)
    for (let i = 0; i < rows; i++) {
      const y = panelHeightMm - G.marginMm - topBandMm - i * G.railPitchMm - 40;
      parts.push(box(`rail-${i}`, "din-rail", `Trilho DIN ${i + 1}`,
        G.marginMm, y, G.railDepthFromBackMm,
        panelWidthMm - 2 * G.marginMm, DG.DIN_RAIL.widthMm, DG.DIN_RAIL.tabHeightMm,
        "#c8c8c8"));
    }

    // ── 3. Disjuntor geral + DR geral + DPS's (banda superior)
    const topY = panelHeightMm - G.marginMm - 60;
    const mainBrk = by["main-breaker"];
    if (mainBrk) {
      const poles = (mainBrk.viz && mainBrk.viz.phases ? mainBrk.viz.phases.length : 2) + 1;
      const d = DG.dims(makerId, "mcb", poles);
      const ref = catalog.byNode["main-breaker"];
      parts.push(mkDevice(`main-breaker`, "disjuntor-geral",
        `DG ${mainBrk.data.In}A · ${mainBrk.data.curve}`,
        panelWidthMm / 2 - d.widthMm / 2, topY, G.railDepthFromBackMm + DG.DIN_RAIL.tabHeightMm,
        d, colorSet, ref));
    }
    const mainRcd = by["main-rcd"];
    if (mainRcd && mainRcd.data && mainRcd.data.In) {
      const poles = (mainBrk && mainBrk.viz && mainBrk.viz.phases ? mainBrk.viz.phases.length : 2) + 1;
      const d = DG.dims(makerId, "rcd", poles);
      const ref = catalog.byNode["main-rcd"];
      parts.push(mkDevice(`main-rcd`, "dr-geral",
        `DR ${mainRcd.data.In}A/${mainRcd.data.sensitivityMa}mA${mainRcd.data.selective ? " · S" : ""}`,
        panelWidthMm / 2 - d.widthMm / 2, topY - 95, G.railDepthFromBackMm + DG.DIN_RAIL.tabHeightMm,
        d, colorSet, ref));
    }
    const spd = by["spd"];
    if (spd) {
      const phases = (spd.viz && spd.viz.phases) || ["A", "B"];
      phases.forEach((p, k) => {
        const d = DG.dims(makerId, "spd", 1);
        const ref = catalog.byNode["spd"];
        parts.push(mkDevice(`spd-${p}`, "dps",
          `DPS ${p}`,
          panelWidthMm - G.marginMm - (phases.length - k) * (d.widthMm + 4), topY, G.railDepthFromBackMm + DG.DIN_RAIL.tabHeightMm,
          d, colorSet, ref));
      });
    }

    // ── 4. Barramentos verticais de fase (pente de cobre, centro)
    const phasesInUse = (model.summary && model.summary.phasesInUse) || ["A", "B"];
    phasesInUse.forEach((p, k) => {
      const x = panelWidthMm / 2 - (phasesInUse.length - 1) * 8 + k * 16 - G.busbarWidthMm / 2;
      parts.push(box(`bus-${p}`, "busbar", `Barramento ${p}`,
        x, G.marginMm, G.railDepthFromBackMm + 10,
        G.busbarWidthMm, panelHeightMm - 2 * G.marginMm - 40, G.busbarDepthMm,
        "#c98a3e"));
    });

    // ── 5. Circuitos terminais (disjuntor + IDR quando houver)
    function placeColumn(list, side) {
      list.forEach((circ, i) => {
        const brk = by[circ.breakerId];
        const rcd = circ.rcdId ? by[circ.rcdId] : null;
        const dBrk = DG.dims(makerId, "mcb", circ.phases.length);
        const y = panelHeightMm - G.marginMm - topBandMm - i * G.railPitchMm - 40;
        const colX = side === "left"
          ? panelWidthMm / 2 - G.colGapMm / 2 - dBrk.widthMm
          : panelWidthMm / 2 + G.colGapMm / 2;
        const ref = catalog.byNode[circ.breakerId];
        parts.push(mkDevice(circ.breakerId, "disjuntor",
          `C${String(circ.n).padStart(2, "0")} · ${brk.data.In}A`,
          colX, y, G.railDepthFromBackMm + DG.DIN_RAIL.tabHeightMm,
          dBrk, colorSet, ref, { circuit: circ.n }));

        if (rcd) {
          const dRcd = DG.dims(makerId, "rcd", circ.phases.length + 1);
          const refR = catalog.byNode[circ.rcdId];
          const rcdX = side === "left" ? colX - dRcd.widthMm - 4 : colX + dBrk.widthMm + 4;
          parts.push(mkDevice(circ.rcdId, "idr",
            `IDR ${rcd.data.sensitivityMa}mA`,
            rcdX, y, G.railDepthFromBackMm + DG.DIN_RAIL.tabHeightMm,
            dRcd, colorSet, refR, { circuit: circ.n }));
        }
      });
    }
    placeColumn(left, "left");
    placeColumn(right, "right");

    // ── 6. Gabinete (caixa externa translúcida, só para referência)
    const enclosure = {
      widthMm: panelWidthMm + 2 * G.doorFrameMm,
      heightMm: panelHeightMm + 2 * G.doorFrameMm,
      depthMm: G.enclosureDepthMm
    };

    return {
      makerId, makerName: geomInfo.name, sourced: geomInfo.sourced, sourceNote: geomInfo.sourceNote,
      catalogDisclaimer: catalog.disclaimer,
      geometryDisclaimer: DG.DISCLAIMER,
      panelWidthMm, panelHeightMm, enclosure,
      parts
    };
  }

  function mkDevice(id, kind, label, x, y, z, d, colorSet, ref, extra) {
    return box(id, kind, label, x, y, z, d.widthMm, d.heightMm, d.depthMm, colorSet.body,
      Object.assign({
        leverColor: colorSet.lever, accentColor: colorSet.accent,
        poles: d.poles, catalogRef: ref ? ref.reference : null
      }, extra || {}));
  }

  /** Checagem de sanidade: nenhuma peça deve ultrapassar o
   *  gabinete calculado nem ter dimensão inválida — útil em teste
   *  automatizado e como guarda antes de mandar pro render. */
  function validate(scene) {
    const problems = [];
    scene.parts.forEach(p => {
      if (p.w <= 0 || p.h <= 0 || p.d <= 0) problems.push(`${p.id}: dimensão inválida`);
      if (p.x < 0 || p.y < 0) problems.push(`${p.id}: fora do gabinete (x/y negativo)`);
      if (p.x + p.w > scene.panelWidthMm + 1) problems.push(`${p.id}: ultrapassa a largura do painel`);
    });
    return { ok: problems.length === 0, problems };
  }

  return { build, validate, PHASE_COLOR, NEUTRAL_COLOR, PE_COLOR, LAYOUT: G };
});
