/* ================================================================
 * EasyEletric — Exportação DXF do Smart Distribution Board
 * ================================================================
 *
 * Módulo independente e SEM DOM: roda no navegador (global
 * `EEDxfExport`) e em Node.js. Consome o ElectricalProjectModel e a
 * GEOMETRIA do renderizador do quadro (EEQdfTwin.layout) — o DXF é
 * o MESMO desenho do SVG (layout de painel real: pente central
 * vertical, colunas de disjuntores, DPS em paralelo), em formato
 * CAD aberto.
 *
 * Gera DXF ASCII R12 (AC1009) — o dialeto mais interoperável:
 * abre em AutoCAD, BricsCAD, QCAD, LibreCAD, DraftSight etc.
 *
 * Estrutura:
 *  - HEADER ($ACADVER = AC1009, $INSUNITS = mm);
 *  - TABLES/LAYER — camadas de projeto por disciplina:
 *    QDF-GABINETE, QDF-BARRAMENTO-A/B/C (cores ACI ≈ cores NBR 5410
 *    §6.1.5.3: A preto→7, B vermelho→1, C marrom→34), QDF-NEUTRO
 *    (azul→5), QDF-PE (verde→3), QDF-DISPOSITIVO, QDF-CABO, QDF-TEXTO;
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

  /* Cores ACI (AutoCAD Color Index) ≈ cores de condutor NBR 5410:
   * fase A preto → 7 (branco/preto), B vermelho → 1, C marrom → 34,
   * neutro azul → 5, PE verde → 3 */
  const ACI = { A: 7, B: 1, C: 34, N: 5, PE: 3, DEVICE: 8, CABLE: 8, TEXT: 7, ENCLOSURE: 8 };

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
   * @param opts {projectName?, scheme?}
   * @returns string DXF R12 (ASCII)
   */
  function render(model, opts) {
    opts = Object.assign({ theme: "print", scheme: "TT" }, opts || {});
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
      `QDF - SMART DISTRIBUTION BOARD - ${opts.projectName || "EasyEletric"} - NBR 5410:2023 - ESQUEMA ${opts.scheme}`, "QDF-TEXTO");

    // Gabinete + placa de montagem
    w.rect(L.encX, L.encY, L.encW, L.encH, "QDF-GABINETE");
    w.rect(L.encX + 8, L.encY + 40, L.encW - 16, L.encH - 50, "QDF-GABINETE");

    // ── Entrada estilo diagrama de ligação: linhas de alimentação
    //    A/B/C/N/PE → QG → DR (com N) → circuitos; DPS à direita ──
    const feeder = by.feeder, main = by["main-breaker"], mrcd = by["main-rcd"], spd = by.spd;
    const qg = L.qg, dr = L.dr;
    const phN = L.phases.concat(["N"]);
    Object.keys(L.supY).forEach(p => {
      w.line(L.supX0, L.supY[p], L.supX1, L.supY[p], PHASE_LAYER[p] || "QDF-CABO");
      w.text(L.supX0 - 8, L.supY[p] + 2, 3.5, p, PHASE_LAYER[p] || "QDF-TEXTO");
    });
    if (feeder.data.section) {
      w.text(L.encX + G.padX + 6, L.supYEnd + 35, 4,
        `ALIMENTADOR ${feeder.data.section}mm2 + N ${feeder.data.neutral} + PE ${feeder.data.pe}mm2 - ${feeder.data.lengthM}m ${feeder.data.method}`, "QDF-TEXTO");
    }
    // QG
    L.phases.forEach((p, i) => {
      w.line(qg.poleXs[i], L.supY[p], qg.poleXs[i], qg.y - qg.h / 2, PHASE_LAYER[p]);
    });
    w.rect(qg.x, qg.y - qg.h / 2, qg.w, qg.h, "QDF-DISPOSITIVO");
    w.text(qg.x - 10, qg.y + 2, 4.5, main.data.In ? `QG GERAL ${main.data.In}A ${main.data.curve} ${main.data.poles}P` : "QG", "QDF-TEXTO");
    // QG → DR (jogos) e neutro da linha N ao DR
    L.phases.forEach((p, i) => {
      const x0 = qg.poleXs[i], x1 = dr.termXs[i + 1], yJog = L.tkY + i * 5;
      w.line(x0, qg.y + qg.h / 2, x0, yJog, PHASE_LAYER[p]);
      w.line(x0, yJog, x1, yJog, PHASE_LAYER[p]);
      w.line(x1, yJog, x1, dr.y - dr.h / 2, PHASE_LAYER[p]);
    });
    w.line(dr.termXs[0], L.supY.N, dr.termXs[0], dr.y - dr.h / 2, "QDF-NEUTRO");
    // DR
    w.rect(dr.x, dr.y - dr.h / 2, dr.w, dr.h, "QDF-DISPOSITIVO");
    w.text(dr.x - 10, dr.y + 2, 4.5, mrcd.data.In ? `DR GERAL ${mrcd.data.In}A/${mrcd.data.sensitivityMa}mA` : "DR", "QDF-TEXTO");
    // Banco de DPS em paralelo (direita), drenando ao PE
    const S = L.spdBank;
    const bankW = S.count * (S.modW + S.gap) - S.gap;
    for (let i = 0; i < S.count; i++) {
      const x = S.x0 + i * (S.modW + S.gap);
      const mcx = x + S.modW / 2;
      const ph = phN[i] || "N";
      if (ph !== "N") {
        const k = L.phases.indexOf(ph), yJog = L.tkY + k * 5;
        w.line(dr.termXs[k + 1], yJog, mcx, yJog, PHASE_LAYER[ph]);
        w.line(mcx, yJog, mcx, S.yTop, PHASE_LAYER[ph]);
      } else {
        w.line(mcx, L.supY.N, mcx, S.yTop, "QDF-NEUTRO");
      }
      w.rect(x, S.yTop, S.modW, 56, "QDF-DISPOSITIVO");
      w.text(mcx, S.yTop + 32, 3.2, `DPS ${ph}`, "QDF-TEXTO", "center");
      w.line(mcx, S.yTop + 56, mcx, S.yTop + 66, "QDF-PE");
    }
    const colY = S.yTop + 66;
    w.line(S.x0 + S.modW / 2, colY, S.x0 + bankW - S.modW / 2, colY, "QDF-PE");
    w.line(S.x0 + bankW - S.modW / 2, colY, L.rightCol.peX + G.stripW / 2, colY, "QDF-PE");
    w.text(S.x0 - 26, colY + 24, 3.8, "DPS EM PARALELO (DERIVACAO) - NBR 5410 6.3.5.2 - A MONTANTE DO DR - ESQUEMA " + opts.scheme, "QDF-TEXTO");
    // DR → circuitos (pente)
    L.phases.forEach((p, i) => {
      const x0 = dr.termXs[i + 1], x1 = L.combX[p], yJog = dr.y + dr.h / 2 + 12 + i * 5;
      w.line(x0, dr.y + dr.h / 2, x0, yJog, PHASE_LAYER[p]);
      w.line(x0, yJog, x1, yJog, PHASE_LAYER[p]);
      w.line(x1, yJog, x1, L.combTop, PHASE_LAYER[p]);
    });
    w.text(L.cx - 87, L.combTop - 10, 3.8, "CIRCUITOS", "QDF-TEXTO", "center");

    // ── Pente vertical central (uma barra por fase) ──
    L.phases.forEach(p => {
      const x = L.combX[p];
      w.rect(x - G.combW / 2, L.combTop, G.combW, L.combBottom - L.combTop, PHASE_LAYER[p]);
      w.text(x, L.combTop - 4, 4, p, PHASE_LAYER[p], "center");
      const busNode = by["bus-" + p];
      if (busNode && busNode.calc.currentA != null) {
        w.text(L.cx, L.busLabelY + L.phases.indexOf(p) * 13 + 8, 3.5,
          `FASE ${p}: ${busNode.calc.currentA.toFixed(1)}A`, PHASE_LAYER[p], "center");
      }
    });

    // ── Circuitos: stubs, módulos, fios de saída, etiquetas ──
    const drawRow = (circ, y, col, isLeft) => {
      const brk = by[circ.breakerId], cond = by[circ.conductorId], load = by[circ.loadId];
      const modIn = isLeft ? col.modX + G.modW : col.modX;
      const modOut = isLeft ? col.modX : col.modX + G.modW;
      const tagEdge = isLeft ? col.tagX + G.tagW : col.tagX;
      circ.phases.forEach((p, k) => {
        const sy = y - (circ.phases.length - 1) * 3.5 + k * 7;
        w.line(L.combX[p], sy, modIn, sy, PHASE_LAYER[p]);
      });
      w.rect(col.modX, y - G.modH / 2, G.modW, G.modH, "QDF-DISPOSITIVO");
      w.text(col.modX + G.modW / 2, y + 3, 4,
        `C${String(circ.n).padStart(2, "0")} ${brk.data.In}A ${brk.data.curve} ${circ.phases.length}P`, "QDF-TEXTO", "center");
      w.line(modOut, y, tagEdge, y, PHASE_LAYER[circ.phases[0]] || "QDF-CABO");
      w.text(col.modX + G.modW / 2, y - G.modH / 2 - 6, 3.2,
        `${cond.data.section}mm2 ${cond.data.lengthM}m`, "QDF-TEXTO", "center");
      w.rect(col.tagX, y - 13, G.tagW, 26, "QDF-CABO");
      w.text(col.tagX + G.tagW / 2, y + 2, 3.2, String(load.data.name).slice(0, 24), "QDF-TEXTO", "center");
      // N e PE da carga às barras da borda
      const outEdge = isLeft ? col.tagX : col.tagX + G.tagW;
      w.line(outEdge, y - 5, col.nX + G.stripW / 2, y - 5, "QDF-NEUTRO");
      w.line(outEdge, y + 5, col.peX + G.stripW / 2, y + 5, "QDF-PE");
    };
    L.cols.left.forEach((c, i) => drawRow(c, L.rowY(i), L.leftCol, true));
    L.cols.right.forEach((c, i) => drawRow(c, L.rowY(i), L.rightCol, false));

    // ── Barras N/PE das bordas ──
    const y0 = L.rowsY0 - 14, y1 = L.rowsYEnd + 8;
    if (by["bus-N"]) {
      w.rect(L.leftCol.nX, y0, G.stripW, y1 - y0, "QDF-NEUTRO");
      w.rect(L.rightCol.nX, y0, G.stripW, y1 - y0, "QDF-NEUTRO");
      w.text(L.cx, L.busLabelY + L.phases.length * 13 + 6, 3.8, "BARRA DE NEUTRO (N) - AZUL-CLARO", "QDF-NEUTRO", "center");
    }
    if (by["bus-PE"]) {
      w.rect(L.leftCol.peX, y0, G.stripW, y1 - y0, "QDF-PE");
      w.rect(L.rightCol.peX, y0, G.stripW, y1 - y0, "QDF-PE");
      w.text(L.cx, L.busLabelY + L.phases.length * 13 + 16, 3.8, "BARRA DE PROTECAO (PE) - VERDE", "QDF-PE", "center");
    }

    // Rodapé normativo
    w.text(L.encX, L.height - 8, 3.5,
      "EasyEletric - Pre-dimensionamento NBR 5410:2023 - cores de condutor cf. 6.1.5.3 - nao substitui projeto assinado com ART/RRT", "QDF-TEXTO");

    w.pair(0, "ENDSEC");
    w.pair(0, "EOF");
    return w.result();
  }

  return { render, LAYERS, ACI };
});
