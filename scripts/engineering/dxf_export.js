/* ================================================================
 * EasyEletric — Exportação DXF do Smart Distribution Board
 * ================================================================
 *
 * Módulo independente e SEM DOM: roda no navegador (global
 * `EEDxfExport`) e em Node.js. Consome o ElectricalProjectModel e a
 * GEOMETRIA do renderizador do quadro (EEQdfTwin.layout) — o DXF é
 * o MESMO desenho do SVG, em formato CAD aberto.
 *
 * Gera DXF ASCII R12 (AC1009) — o dialeto mais interoperável:
 * abre em AutoCAD, BricsCAD, QCAD, LibreCAD, DraftSight etc.
 *
 * Estrutura:
 *  - HEADER ($ACADVER = AC1009, $INSUNITS = mm);
 *  - TABLES/LAYER — camadas de projeto por disciplina:
 *    QDF-GABINETE, QDF-BARRAMENTO-A/B/C (cores ACI por fase),
 *    QDF-NEUTRO, QDF-PE, QDF-DISPOSITIVO, QDF-CABO, QDF-TEXTO;
 *  - ENTITIES — LINE / CIRCLE / TEXT.
 *
 * Convenções:
 *  - 1 unidade DXF = 1 mm (1 px do viewBox ≡ 1 mm de papel);
 *  - eixo Y invertido em relação ao SVG (DXF cresce para cima).
 *
 * DWG (binário proprietário Autodesk) e IFC (modelo BIM) ficam fora
 * do escopo do app 100% client-side: o DXF cobre a interoperação
 * CAD — conversão a DWG/IFC via ODA/BIM tools a partir dele.
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./qdf_twin.js"));
  } else {
    root.EEDxfExport = factory(root.EEQdfTwin);
  }
})(typeof self !== "undefined" ? self : this, function (Q) {
  "use strict";

  /* Cores ACI (AutoCAD Color Index) */
  const ACI = { A: 5, B: 30, C: 3, N: 8, PE: 3, DEVICE: 7, CABLE: 7, TEXT: 7, ENCLOSURE: 8 };

  const LAYERS = [
    { name: "QDF-GABINETE", color: ACI.ENCLOSURE },
    { name: "QDF-BARRAMENTO-A", color: ACI.A },
    { name: "QDF-BARRAMENTO-B", color: ACI.B },
    { name: "QDF-BARRAMENTO-C", color: ACI.C },
    { name: "QDF-NEUTRO", color: ACI.N },
    { name: "QDF-PE", color: ACI.PE },
    { name: "QDF-DISPOSITIVO", color: ACI.DEVICE },
    { name: "QDF-CABO", color: ACI.CABLE },
    { name: "QDF-TEXTO", color: ACI.TEXT }
  ];
  const PHASE_LAYER = { A: "QDF-BARRAMENTO-A", B: "QDF-BARRAMENTO-B", C: "QDF-BARRAMENTO-C", N: "QDF-NEUTRO", PE: "QDF-PE" };

  const num = v => Number(v.toFixed(3));

  /* ==============================================================
   * Writer DXF R12 — acumula pares (código, valor)
   * ============================================================== */
  function writer(height) {
    const out = [];
    const pair = (c, v) => { out.push(String(c), String(v)); };
    // Y do SVG (cresce para baixo) → Y do DXF (cresce para cima)
    const Y = y => num(height - y);

    return {
      pair, Y,
      line(x1, y1, x2, y2, layer) {
        pair(0, "LINE"); pair(8, layer);
        pair(10, num(x1)); pair(20, Y(y1)); pair(30, 0);
        pair(11, num(x2)); pair(21, Y(y2)); pair(31, 0);
      },
      rect(x, y, w, h, layer) {
        this.line(x, y, x + w, y, layer);
        this.line(x + w, y, x + w, y + h, layer);
        this.line(x + w, y + h, x, y + h, layer);
        this.line(x, y + h, x, y, layer);
      },
      circle(cx, cy, r, layer) {
        pair(0, "CIRCLE"); pair(8, layer);
        pair(10, num(cx)); pair(20, Y(cy)); pair(30, 0);
        pair(40, num(r));
      },
      text(x, y, hgt, value, layer, align) {
        pair(0, "TEXT"); pair(8, layer);
        pair(10, num(x)); pair(20, Y(y)); pair(30, 0);
        pair(40, num(hgt)); pair(1, String(value));
        if (align === "center") { // R12: 72=1 requer segundo ponto
          pair(72, 1); pair(11, num(x)); pair(21, Y(y)); pair(31, 0);
        }
      },
      result() { return out.join("\n") + "\n"; }
    };
  }

  /* ==============================================================
   * Render — mesmo layout do SVG, em entidades CAD
   * ============================================================== */

  /**
   * Gera o DXF do Smart Distribution Board.
   * @param model ElectricalProjectModel (EEProjectModel.build)
   * @param opts {perRow?, projectName?}
   * @returns string DXF R12 (ASCII)
   */
  function render(model, opts) {
    opts = Object.assign({ theme: "print" }, opts || {});
    const L = Q.layout(model, opts);
    const by = model.byId;
    const w = writer(L.height);
    const G = Q.G;

    /* ---- HEADER ---- */
    w.pair(0, "SECTION"); w.pair(2, "HEADER");
    w.pair(9, "$ACADVER"); w.pair(1, "AC1009");
    w.pair(9, "$INSUNITS"); w.pair(70, 4); // mm
    w.pair(0, "ENDSEC");

    /* ---- TABLES / LAYER ---- */
    w.pair(0, "SECTION"); w.pair(2, "TABLES");
    w.pair(0, "TABLE"); w.pair(2, "LAYER"); w.pair(70, LAYERS.length);
    for (const ly of LAYERS) {
      w.pair(0, "LAYER"); w.pair(2, ly.name);
      w.pair(70, 0); w.pair(62, ly.color); w.pair(6, "CONTINUOUS");
    }
    w.pair(0, "ENDTAB"); w.pair(0, "ENDSEC");

    /* ---- ENTITIES ---- */
    w.pair(0, "SECTION"); w.pair(2, "ENTITIES");

    // Título
    w.text(L.encX, L.encY - 18, 8,
      `QDF - SMART DISTRIBUTION BOARD - ${opts.projectName || "EasyEletric"} - NBR 5410:2023`, "QDF-TEXTO");

    // Gabinete + placa de montagem
    w.rect(L.encX, L.encY, L.encW, L.encH, "QDF-GABINETE");
    w.rect(L.encX + 10, L.encY + 42, L.encW - 20, L.encH - 52, "QDF-GABINETE");

    // Entrada: alimentador → geral → DPS → DR geral (mesmo x do SVG)
    const mainX = L.encX + G.padX + G.gutterL + 44;
    const y = L.mainY;
    const feeder = by.feeder;
    w.line(mainX, L.encY - 12, mainX, y - 34, "QDF-CABO");
    if (feeder.data.section) {
      w.text(mainX + 12, L.encY + 60, 4,
        `ALIMENTADOR ${feeder.data.section}mm2 + N ${feeder.data.neutral} + PE ${feeder.data.pe}mm2 - ${feeder.data.lengthM}m ${feeder.data.method}`, "QDF-TEXTO");
    }
    const main = by["main-breaker"];
    w.rect(mainX - 33, y - 29, 66, 58, "QDF-DISPOSITIVO");
    w.text(mainX, y + 4, 4.5, main.data.In ? `GERAL ${main.data.In}A ${main.data.curve} ${main.data.poles}P` : "GERAL", "QDF-TEXTO", "center");
    const spdX = mainX + 150, spd = by.spd;
    w.line(mainX + 33, y, spdX - 25, y, "QDF-DISPOSITIVO");
    w.rect(spdX - 25, y - 26, 50, 52, "QDF-DISPOSITIVO");
    w.text(spdX, y + 2, 4, spd.data.class ? `DPS CL.${spd.data.class}` : "DPS", "QDF-TEXTO", "center");
    w.line(spdX, y + 26, spdX, y + 40, "QDF-PE");
    const rcdX = spdX + 190, mrcd = by["main-rcd"];
    w.line(spdX + 25, y, rcdX - 30, y, "QDF-DISPOSITIVO");
    w.rect(rcdX - 30, y - 26, 60, 52, "QDF-DISPOSITIVO");
    w.text(rcdX, y + 2, 4, mrcd.data.In ? `DR ${mrcd.data.In}A/${mrcd.data.sensitivityMa}mA` : "DR", "QDF-TEXTO", "center");

    // Descidas DR → barramentos + barramentos de fase
    L.phases.forEach((p, k) => {
      const dx = rcdX - 12 + k * 12;
      w.line(dx, y + 26, dx, L.busY[p], PHASE_LAYER[p]);
      const busNode = by["bus-" + p];
      w.line(L.busX0, L.busY[p], L.busX1 - 168, L.busY[p], PHASE_LAYER[p]);
      w.text(L.busX0 - 14, L.busY[p] + 2, 4.5, p, PHASE_LAYER[p]);
      if (busNode && busNode.calc.currentA != null) {
        w.text(L.busX1 - 158, L.busY[p] + 2, 3.5, `${busNode.calc.currentA.toFixed(1)}A`, "QDF-TEXTO");
      }
      // Riser da fase até a última fileira
      if (L.rows.length) {
        const lastRow = L.rows[L.rows.length - 1];
        w.line(L.riserX(k), L.busY[p], L.riserX(k), lastRow.combY + k * G.combGap, PHASE_LAYER[p]);
      }
    });

    // Fileiras: pentes, trilho DIN, disjuntores, cabos, cargas
    for (const row of L.rows) {
      const rowEndX = L.slotX(Math.max(row.slots, 1)) - 14;
      L.phases.forEach((p, k) => {
        w.line(L.riserX(k), row.combY + k * G.combGap, rowEndX, row.combY + k * G.combGap, PHASE_LAYER[p]);
      });
      const railX0 = L.slotX(0) - 12;
      w.rect(railX0, row.railY, rowEndX - railX0 + 12, 8, "QDF-GABINETE");

      for (const item of row.items) {
        const circ = item.circ;
        const brk = by[circ.breakerId], cond = by[circ.conductorId], load = by[circ.loadId];
        const x0 = L.slotX(item.slot);
        const wMod = item.poles * G.slotW - 12;
        const cx = x0 + wMod / 2;
        const top = row.modTop;

        // stubs de fase → módulo
        circ.phases.forEach((p, k) => {
          const px = x0 + (k + 0.5) * (wMod / item.poles);
          w.line(px, row.combY + L.phases.indexOf(p) * G.combGap, px, top, PHASE_LAYER[p]);
        });
        // módulo
        w.rect(x0, top, wMod, G.modH, "QDF-DISPOSITIVO");
        w.text(cx, top - 6, 4, `C${String(circ.n).padStart(2, "0")}`, "QDF-TEXTO", "center");
        w.text(cx, top + 18, 4, `${brk.data.In}A ${brk.data.curve} ${item.poles}P`, "QDF-TEXTO", "center");
        // cabo + carga
        const tagY = top + G.modH + G.cableZone - 34;
        w.line(cx, top + G.modH, cx, tagY, "QDF-CABO");
        w.text(cx + 6, top + G.modH + 14, 3.5, `${cond.data.section}mm2 ${cond.data.lengthM}m`, "QDF-TEXTO");
        w.rect(cx - Math.max(wMod, 50) / 2, tagY, Math.max(wMod, 50), 26, "QDF-CABO");
        w.text(cx, tagY + 16, 3.5, String(load.data.name).slice(0, 24), "QDF-TEXTO", "center");
      }
    }

    // Barras N / PE
    const halfW = (L.encW - 2 * G.padX - 30) / 2;
    const nx = L.encX + G.padX, px = nx + halfW + 30;
    if (by["bus-N"]) {
      w.rect(nx, L.termY, halfW, 13, "QDF-NEUTRO");
      w.text(nx + 4, L.termY + 26, 4, "BARRA DE NEUTRO (N)", "QDF-NEUTRO");
    }
    if (by["bus-PE"]) {
      w.rect(px, L.termY, halfW, 13, "QDF-PE");
      w.text(px + 4, L.termY + 26, 4, "BARRA DE PROTECAO (PE)", "QDF-PE");
    }

    // Rodapé normativo
    w.text(L.encX, L.height - 8, 3.5,
      "EasyEletric - Pre-dimensionamento NBR 5410:2023 - nao substitui projeto assinado com ART/RRT", "QDF-TEXTO");

    w.pair(0, "ENDSEC");
    w.pair(0, "EOF");
    return w.result();
  }

  return { render, LAYERS, ACI };
});
