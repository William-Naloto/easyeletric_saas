/* ================================================================
 * EasyEletric — Wire Schedule (identificação De/Para de cabeamento)
 * ================================================================
 *
 * Módulo independente e SEM DOM: roda no navegador (global
 * `EEWireSchedule`) e em Node.js. Consome EXCLUSIVAMENTE o
 * ElectricalProjectModel — nenhum dado de engenharia é calculado
 * ou possuído aqui.
 *
 * PROBLEMA QUE RESOLVE: hoje o diagrama mostra o circuito, mas não
 * gera a identificação física que o instalador precisa colar em
 * CADA ponta de CADA condutor — a etiqueta "De: QDF C06 barra B /
 * Para: Cozinha, tomada micro-ondas" que evita ligar o fio errado
 * na hora da obra e que o mantenedor usa 5 anos depois pra achar
 * o disjuntor certo sem abrir todo o quadro.
 *
 * Gera, para cada circuito, UMA LINHA POR CONDUTOR FÍSICO (fase(s),
 * neutro quando existir, PE sempre) com:
 *   - tag único do condutor (ex.: "C06-B", "C06-N", "C06-PE")
 *   - ponto DE (barramento/fase de origem no QDF) e PARA (ambiente
 *     + descrição da carga)
 *   - cor normativa do condutor (NBR 5410 §6.1.5.3)
 *   - bitola, método de instalação e comprimento
 *   - terminal do disjuntor/IDR onde o condutor pousa
 *   - texto pronto para etiqueta física (2 linhas, formato
 *     compatível com impressora de etiquetas 12/19mm tipo Brady/
 *     Vinilex/rotulador Brother P-touch)
 *
 * Também gera a ficha do quadro (disjuntor geral, DR geral, DPS,
 * barramentos) com o mesmo formato De/Para, e um sumário exportável
 * como tabela (para o "Guia de Instalação" em Markdown/PDF).
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.EEWireSchedule = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Cores normativas do condutor — NBR 5410:2023 §6.1.5.3
  const PHASE_COLOR_NAME = { A: "Preto", B: "Vermelho", C: "Marrom" };
  const N_COLOR_NAME = "Azul-claro";
  const PE_COLOR_NAME = "Verde (ou verde-amarelo)";

  function pad2(n) { return String(n).padStart(2, "0"); }

  /**
   * Constrói a lista de condutores físicos (uma linha por fio) de
   * UM circuito terminal, com identificação De/Para completa.
   */
  function circuitWires(model, circ) {
    const by = model.byId;
    const brk = by[circ.breakerId];
    const rcd = circ.rcdId ? by[circ.rcdId] : null;
    const cond = by[circ.conductorId];
    const load = by[circ.loadId];
    const tag = `C${pad2(circ.n)}`;
    const destino = load.data.name || `Circuito ${circ.n}`;
    const origemBase = rcd
      ? `QDF · IDR ${tag} (a jusante do disjuntor ${tag})`
      : `QDF · disjuntor ${tag}`;
    const wires = [];

    circ.phases.forEach((p, k) => {
      wires.push({
        tag: `${tag}-${p}`,
        kind: "fase",
        phase: p,
        colorName: PHASE_COLOR_NAME[p] || p,
        de: `${origemBase} · fase ${p} (borne ${k + 1})`,
        para: destino,
        sectionMm2: cond.data.section,
        lengthM: cond.data.lengthM,
        method: cond.data.method,
        breakerTag: tag,
        label2linhas: [
          `DE: ${tag} · Fase ${p} · ${cond.data.section}mm²`,
          `PARA: ${trimLabel(destino, 28)}`
        ]
      });
    });

    const hasN = String(load.data.wiring || "").includes("N");
    if (hasN) {
      wires.push({
        tag: `${tag}-N`,
        kind: "neutro",
        phase: null,
        colorName: N_COLOR_NAME,
        de: `QDF · barra de neutro (borne N-${tag})`,
        para: destino,
        sectionMm2: cond.data.section,
        lengthM: cond.data.lengthM,
        method: cond.data.method,
        breakerTag: tag,
        label2linhas: [
          `DE: ${tag} · Neutro · ${cond.data.section}mm²`,
          `PARA: ${trimLabel(destino, 28)}`
        ]
      });
    }

    wires.push({
      tag: `${tag}-PE`,
      kind: "protecao",
      phase: null,
      colorName: PE_COLOR_NAME,
      de: `QDF · barra de proteção (borne PE-${tag})`,
      para: destino,
      sectionMm2: cond.data.pe,
      lengthM: cond.data.lengthM,
      method: cond.data.method,
      breakerTag: tag,
      label2linhas: [
        `DE: ${tag} · PE · ${cond.data.pe}mm²`,
        `PARA: ${trimLabel(destino, 28)}`
      ]
    });

    return {
      circuit: circ.n, tag,
      breakerRef: `${brk.data.In} A · Curva ${brk.data.curve} · ${circ.phases.length}P`,
      rcdRef: rcd ? `${rcd.data.In} A / ${rcd.data.sensitivityMa} mA` : null,
      destino, wires
    };
  }

  function trimLabel(s, n) {
    if (!s) return "";
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  /**
   * Ficha do quadro (alimentação → geral → DR → DPS → barramentos).
   * Mesmo formato De/Para, para o instalador identificar o
   * alimentador e as ligações do topo do quadro.
   */
  function boardWires(model) {
    const feeder = model.byId["feeder"];
    const mainBreaker = model.byId["main-breaker"];
    const mainRcd = model.byId["main-rcd"];
    const spd = model.byId["spd"];
    if (!feeder || !mainBreaker) return [];

    const rows = [];
    (feeder.viz && feeder.viz.phases || []).forEach((p, k) => {
      rows.push({
        tag: `ALIM-${p}`,
        kind: "fase",
        colorName: PHASE_COLOR_NAME[p] || p,
        de: `Ramal de entrada / medidor · fase ${p}`,
        para: `QDF · disjuntor geral (borne ${k + 1})`,
        sectionMm2: feeder.data.section,
        lengthM: feeder.data.lengthM,
        label2linhas: [
          `DE: Entrada · Fase ${p} · ${feeder.data.section}mm²`,
          `PARA: DG borne ${k + 1}`
        ]
      });
    });
    rows.push({
      tag: "ALIM-N",
      kind: "neutro",
      colorName: N_COLOR_NAME,
      de: "Ramal de entrada / medidor · neutro",
      para: "QDF · barra de neutro geral",
      sectionMm2: feeder.data.neutral || feeder.data.section,
      lengthM: feeder.data.lengthM,
      label2linhas: ["DE: Entrada · Neutro", "PARA: Barra N geral"]
    });
    rows.push({
      tag: "ALIM-PE",
      kind: "protecao",
      colorName: PE_COLOR_NAME,
      de: "Haste de aterramento / malha",
      para: "QDF · barra de proteção geral",
      sectionMm2: feeder.data.pe,
      lengthM: feeder.data.lengthM,
      label2linhas: ["DE: Aterramento", "PARA: Barra PE geral"]
    });
    if (spd) {
      rows.push({
        tag: "DPS",
        kind: "protecao",
        colorName: "conforme fase protegida",
        de: "Barramentos de fase (derivação em paralelo, a montante do DR — §6.3.5.2)",
        para: "DPS Classe II",
        label2linhas: ["DE: Barramentos", "PARA: DPS Classe II"]
      });
    }
    if (mainRcd) {
      rows.push({
        tag: "DR-GERAL",
        kind: "protecao",
        colorName: "—",
        de: "Disjuntor geral (saída)",
        para: `DR geral ${mainRcd.data.In || ""} A / ${mainRcd.data.sensitivityMa || ""} mA${mainRcd.data.selective ? " · seletivo tipo S" : ""}`,
        label2linhas: ["DE: DG", `PARA: DR ${mainRcd.data.sensitivityMa || ""}mA`]
      });
    }
    return rows;
  }

  /**
   * Monta o wire schedule completo do projeto: ficha do quadro +
   * uma entrada por circuito terminal.
   */
  function build(model) {
    const board = boardWires(model);
    const circuits = (model.circuits || []).map(c => circuitWires(model, c));
    const totalWires = circuits.reduce((s, c) => s + c.wires.length, 0) + board.length;
    return { board, circuits, totalWires };
  }

  /**
   * Exporta como tabela Markdown (para o Guia de Instalação /
   * memorial). Uma tabela por circuito, mais a ficha do quadro.
   */
  function toMarkdown(schedule) {
    let md = "## Ficha do quadro (alimentação → geral → DR → DPS)\n\n";
    md += "| Tag | DE | PARA | Cor | Seção |\n|---|---|---|---|---|\n";
    schedule.board.forEach(w => {
      md += `| ${w.tag} | ${w.de} | ${w.para} | ${w.colorName} | ${w.sectionMm2 ? w.sectionMm2 + " mm²" : "—"} |\n`;
    });
    md += "\n## Identificação de circuitos (De/Para por condutor)\n\n";
    schedule.circuits.forEach(c => {
      md += `\n### Circuito ${c.tag} — ${c.destino}\n`;
      md += `Disjuntor: ${c.breakerRef}${c.rcdRef ? ` · IDR: ${c.rcdRef}` : ""}\n\n`;
      md += "| Condutor | DE | PARA | Cor | Seção | Método | Comp. |\n|---|---|---|---|---|---|---|\n";
      c.wires.forEach(w => {
        md += `| ${w.tag} | ${w.de} | ${w.para} | ${w.colorName} | ${w.sectionMm2} mm² | ${w.method || "—"} | ${w.lengthM ? w.lengthM + " m" : "—"} |\n`;
      });
    });
    return md;
  }

  /**
   * Exporta a lista "achatada" de etiquetas prontas para impressão
   * (2 linhas cada) — uma por condutor físico, na ordem em que
   * seriam coladas na obra (quadro primeiro, depois circuito a
   * circuito, fase → neutro → PE).
   */
  function toLabelSheet(schedule) {
    const labels = [];
    schedule.board.forEach(w => labels.push({ tag: w.tag, lines: w.label2linhas }));
    schedule.circuits.forEach(c => {
      c.wires.forEach(w => labels.push({ tag: w.tag, lines: w.label2linhas }));
    });
    return labels;
  }

  return { build, toMarkdown, toLabelSheet, circuitWires, boardWires };
});
