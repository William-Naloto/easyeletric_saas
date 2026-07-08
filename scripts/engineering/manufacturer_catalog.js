/* ================================================================
 * EasyEletric — Catálogo de Fabricantes (referências ilustrativas)
 * ================================================================
 *
 * Módulo independente e SEM DOM: roda no navegador (global
 * `EEManufacturerCatalog`) e em Node.js. Não depende de nenhum
 * outro módulo.
 *
 * Mapeia as SELEÇÕES DO MOTOR (disjuntor In/curva/polos/Icn, DR
 * In/sensibilidade, DPS classe/Imax) para linhas comerciais dos
 * principais fabricantes do mercado brasileiro. A série é escolhida
 * pela capacidade de interrupção requerida (Icn calculada pelo
 * motor): se a linha residencial não atende, o catálogo sobe para a
 * linha de maior Icn do mesmo fabricante.
 *
 * IMPORTANTE: as referências seguem o PADRÃO de codificação de cada
 * fabricante mas são ILUSTRATIVAS — a especificação final deve ser
 * confirmada no catálogo oficial vigente (disclaimer exposto em
 * `DISCLAIMER` e repetido em toda saída).
 *
 * Nenhum dado de engenharia é calculado aqui: o módulo apenas
 * TRADUZ o resultado do motor em referências comerciais.
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.EEManufacturerCatalog = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DISCLAIMER = "Referências ilustrativas por padrão de codificação do fabricante — confirme no catálogo oficial vigente.";

  /* ==============================================================
   * Dados — linhas por fabricante
   * Cada fabricante tem séries de MCB ordenadas por Icn crescente;
   * a primeira série com icnKA ≥ Icn requerida é selecionada.
   * ============================================================== */
  const MAKERS = {
    generic: {
      name: "Genérico",
      mcb: [{ series: "MCB NBR NM 60898", icnKA: 10, ref: d => `MCB ${d.curve}${d.In} ${d.poles}P` }],
      rcd: { series: "IDR NBR IEC 61008", ref: d => `IDR ${d.In}A ${d.sensitivityMa}mA ${d.poles}P` },
      spd: { series: "DPS IEC 61643-11", ref: d => `DPS Classe ${d.cls} ${d.imaxKA}kA` }
    },
    weg: {
      name: "WEG",
      mcb: [
        { series: "MDW", icnKA: 6, ref: d => `MDW-${d.curve}${d.In}-${d.poles}` },
        { series: "MDWH", icnKA: 10, ref: d => `MDWH-${d.curve}${d.In}-${d.poles}` }
      ],
      rcd: { series: "RDW", ref: d => `RDW-${d.sensitivityMa}-${d.In}-${d.poles}` },
      spd: { series: "SPW", ref: d => `SPW02-${d.imaxKA}-275` }
    },
    schneider: {
      name: "Schneider Electric",
      mcb: [
        { series: "Easy9", icnKA: 6, ref: d => `EZ9F33${d.poles}${pad2(d.In)}` },
        { series: "Acti9 iC60N", icnKA: 10, ref: d => `A9F74${d.poles}${pad2(d.In)}` }
      ],
      rcd: { series: "Easy9 ID", ref: d => `EZ9R33${d.poles}${pad2(d.In)}` },
      spd: { series: "Easy9 DPS", ref: d => `EZ9L33${pad2(d.imaxKA)}` }
    },
    siemens: {
      name: "Siemens",
      mcb: [
        { series: "5SL1", icnKA: 3, ref: d => `5SL1 ${d.In}A ${d.curve} ${d.poles}P` },
        { series: "5SL6", icnKA: 6, ref: d => `5SL6 ${d.In}A ${d.curve} ${d.poles}P` },
        { series: "5SL4", icnKA: 10, ref: d => `5SL4 ${d.In}A ${d.curve} ${d.poles}P` }
      ],
      rcd: { series: "5SV3", ref: d => `5SV3 ${d.In}A ${d.sensitivityMa}mA ${d.poles}P` },
      spd: { series: "5SD7", ref: d => `5SD7 4${d.poles} ${d.imaxKA}kA` }
    },
    abb: {
      name: "ABB",
      mcb: [
        { series: "SH200", icnKA: 6, ref: d => `SH20${d.poles}-${d.curve}${d.In}` },
        { series: "S200", icnKA: 10, ref: d => `S20${d.poles}-${d.curve}${d.In}` }
      ],
      rcd: { series: "F200", ref: d => `F20${d.poles}-${d.In}/0,0${d.sensitivityMa / 10}` },
      spd: { series: "OVR", ref: d => `OVR T2 ${d.imaxKA} 275` }
    }
  };

  function pad2(v) { return String(v).length < 2 ? "0" + v : String(v); }

  /** Fabricantes disponíveis (ordem de exibição). */
  function manufacturers() {
    return ["generic", "weg", "schneider", "siemens", "abb"]
      .map(id => ({ id, name: MAKERS[id].name }));
  }

  /* ==============================================================
   * Seleção por dispositivo
   * ============================================================== */

  /**
   * Disjuntor: escolhe a série de menor Icn que atende à Icn
   * requerida pelo motor (icnRequiredA em ampères) e monta a
   * referência comercial.
   */
  function breakerRef(makerId, dev) {
    const mk = MAKERS[makerId];
    if (!mk || !dev || !dev.In) return null;
    const requiredKA = (dev.icnRequiredA || 0) / 1000;
    const series = mk.mcb.find(s => s.icnKA >= requiredKA) || mk.mcb[mk.mcb.length - 1];
    return {
      maker: mk.name, kind: "breaker",
      series: series.series, icnKA: series.icnKA,
      reference: series.ref({ In: dev.In, curve: dev.curve || "C", poles: dev.poles || 1 }),
      meets: series.icnKA >= requiredKA
    };
  }

  /** DR / interruptor diferencial-residual. */
  function rcdRef(makerId, dev) {
    const mk = MAKERS[makerId];
    if (!mk || !dev || !dev.In) return null;
    return {
      maker: mk.name, kind: "rcd", series: mk.rcd.series,
      reference: mk.rcd.ref({
        In: dev.In, sensitivityMa: dev.sensitivityMa || 30, poles: dev.poles || 2
      })
    };
  }

  /** DPS / supressor de surto. */
  function spdRef(makerId, dev) {
    const mk = MAKERS[makerId];
    if (!mk || !dev || !dev.imaxKA) return null;
    return {
      maker: mk.name, kind: "spd", series: mk.spd.series,
      reference: mk.spd.ref({ cls: dev.class || "II", imaxKA: dev.imaxKA, poles: dev.poles || 2 })
    };
  }

  /* ==============================================================
   * Aplicação ao ElectricalProjectModel
   * ============================================================== */

  /** Polos comerciais de um DR: 2P (mono/bi) ou 4P (trifásico). */
  function rcdPoles(phases) {
    return (phases && phases.length >= 3) ? 4 : 2;
  }

  /**
   * Gera o mapa nodeId → referência de catálogo para todos os
   * dispositivos comerciais do modelo (disjuntor geral, disjuntores
   * parciais, DRs e DPS).
   *
   * @param makerId id do fabricante ("weg", "schneider", ...)
   * @param model   ElectricalProjectModel
   * @returns {makerId, maker, byNode:{id→entry}, disclaimer}
   */
  function forModel(makerId, model) {
    const mk = MAKERS[makerId];
    if (!mk || !model) return null;
    const byNode = {};

    for (const n of model.nodes) {
      if (n.type === "main-breaker" || n.type === "breaker") {
        const e = breakerRef(makerId, {
          In: n.data.In, curve: n.data.curve, poles: n.data.poles,
          icnRequiredA: n.calc.icnRequiredA
        });
        if (e) byNode[n.id] = e;
      } else if (n.type === "main-rcd" || n.type === "rcd") {
        const e = rcdRef(makerId, {
          In: n.data.In, sensitivityMa: n.data.sensitivityMa,
          poles: rcdPoles(n.viz.phases)
        });
        if (e) byNode[n.id] = e;
      } else if (n.type === "spd") {
        const e = spdRef(makerId, {
          class: n.data.class, imaxKA: n.data.imaxKA, poles: n.data.poles
        });
        if (e) byNode[n.id] = e;
      }
    }
    return { makerId, maker: mk.name, byNode, disclaimer: DISCLAIMER };
  }

  return { manufacturers, breakerRef, rcdRef, spdRef, forModel, DISCLAIMER, MAKERS };
});
