/* ================================================================
 * EasyEletric — Panel Schedule (Mapa do Quadro de Distribuição)
 * ================================================================
 *
 * Módulo independente e SEM DOM: roda no navegador (global
 * `EEPanelSchedule`) e em Node.js. Consome EXCLUSIVAMENTE o
 * ElectricalProjectModel — nenhum dado de engenharia é calculado
 * aqui; o módulo ORGANIZA o modelo no formato de mapa de quadro
 * usado em projetos executivos (panel schedule).
 *
 * Duas saídas do MESMO modelo:
 *  - build(model, opts): dados estruturados {meta, feeder, devices,
 *    rows, totals} — consumíveis por relatórios, XLSX e testes;
 *  - toHtml(model, opts): documento HTML autocontido e imprimível
 *    (A4 retrato, carimbo técnico, cores por fase, status por
 *    circuito e rodapé normativo com aviso de ART/RRT).
 *
 * Aceita opcionalmente um catálogo de fabricante
 * (EEManufacturerCatalog.forModel) para a coluna de referência
 * comercial — com o disclaimer do catálogo reproduzido no rodapé.
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.EEPanelSchedule = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  const fmt = (v, d) => (v == null || isNaN(v)) ? "—"
    : Number(v).toFixed(d == null ? 1 : d).replace(".", ",");

  /* Cores dos condutores de fase — NBR 5410 §6.1.5.3 */
  const PH_COLORS = { A: "#1a1f26", B: "#d92b2b", C: "#8a5a2b" };

  /* ==============================================================
   * build — dados estruturados do mapa do quadro
   * ============================================================== */

  /**
   * @param model ElectricalProjectModel (EEProjectModel.build)
   * @param opts {catalog?, projectName?, date?}
   * @returns {meta, feeder, devices, rows, totals, disclaimer?}
   */
  function build(model, opts) {
    opts = opts || {};
    const by = model.byId;
    const s = model.summary;
    const cat = opts.catalog && opts.catalog.byNode ? opts.catalog.byNode : null;
    const refOf = id => (cat && cat[id]) ? cat[id].reference : null;

    const feeder = by.feeder;
    const main = by["main-breaker"];
    const spd = by.spd;
    const mrcd = by["main-rcd"];

    const rows = model.circuits.map(c => {
      const brk = by[c.breakerId], rcd = c.rcdId ? by[c.rcdId] : null;
      const cond = by[c.conductorId], load = by[c.loadId];
      return {
        n: c.n,
        name: load.data.name,
        phases: c.phases.join("+"),
        wiring: load.data.wiring,
        powerVA: load.data.powerVA,
        Ib: cond.calc.Ib,
        breaker: { In: brk.data.In, curve: brk.data.curve, poles: brk.data.poles, reference: refOf(c.breakerId) },
        rcd: rcd ? { In: rcd.data.In, sensitivityMa: rcd.data.sensitivityMa, reference: refOf(c.rcdId) } : null,
        cable: {
          section: cond.data.section, pe: cond.data.pe,
          lengthM: cond.data.lengthM, method: cond.data.method,
          insulation: cond.data.insulation
        },
        dropPct: cond.calc.dropPct,
        maxDropPct: cond.calc.maxDropPct,
        status: c.status
      };
    });

    const totals = {
      circuits: rows.length,
      installedVA: s.installedVA,
      demandVA: s.demandVA,
      overallFactor: s.overallFactor,
      IbFeeder: s.IbFeeder,
      Iphase: s.phasesInUse.map(p => ({
        phase: p, currentA: (by["bus-" + p] && by["bus-" + p].calc.currentA) || 0
      })),
      neutralA: by["bus-N"] ? by["bus-N"].calc.currentA : null,
      imbalancePct: s.imbalancePct,
      status: s.status
    };

    return {
      meta: {
        projectName: opts.projectName || "EasyEletric — Projeto Elétrico Residencial",
        date: opts.date || "",
        supplyType: s.supplyType,
        Vfn: model.meta.site.Vfn, Vll: model.meta.site.Vll,
        maker: opts.catalog ? opts.catalog.maker : null
      },
      feeder: feeder.data.section ? {
        section: feeder.data.section, neutral: feeder.data.neutral, pe: feeder.data.pe,
        lengthM: feeder.data.lengthM, method: feeder.data.method,
        insulation: feeder.data.insulation, Izc: feeder.calc.Izc, dropPct: feeder.calc.dropPct
      } : null,
      devices: {
        main: main.data.In ? {
          In: main.data.In, curve: main.data.curve, poles: main.data.poles,
          icnRequiredA: main.calc.icnRequiredA, reference: refOf("main-breaker")
        } : null,
        rcd: mrcd.data.In ? {
          In: mrcd.data.In, sensitivityMa: mrcd.data.sensitivityMa, reference: refOf("main-rcd")
        } : null,
        spd: spd.data.class ? {
          class: spd.data.class, imaxKA: spd.data.imaxKA, inKA: spd.data.inKA,
          ucV: spd.data.ucV, poles: spd.data.poles, reference: refOf("spd")
        } : null
      },
      rows, totals,
      disclaimer: opts.catalog ? opts.catalog.disclaimer : null
    };
  }

  /* ==============================================================
   * toHtml — documento imprimível (A4, carimbo técnico)
   * ============================================================== */

  function statusCell(st) {
    const map = {
      PASS: ['#1a7f37', '✓ Conforme'],
      WARN: ['#b45309', '⚠ Atenção'],
      ERROR: ['#b91c1c', '✗ Violação']
    };
    const [c, t] = map[st] || map.PASS;
    return `<td style="color:${c};font-weight:700;white-space:nowrap">${t}</td>`;
  }

  function toHtml(model, opts) {
    const d = build(model, opts);
    const phaseChip = p => `<span style="display:inline-block;padding:0 6px;border-radius:3px;color:#fff;font-weight:700;background:${PH_COLORS[p] || '#555'}">${esc(p)}</span>`;
    const hasCat = !!d.meta.maker;

    const rowsHtml = d.rows.map(r => `
      <tr>
        <td style="font-weight:700">${String(r.n).padStart(2, "0")}</td>
        <td style="text-align:left">${esc(r.name)}</td>
        <td>${r.phases.split("+").map(phaseChip).join(" ")}</td>
        <td>${esc(r.wiring)}</td>
        <td>${fmt(r.powerVA, 0)}</td>
        <td>${fmt(r.Ib, 1)}</td>
        <td>${r.breaker.In} A · ${esc(r.breaker.curve)} · ${r.breaker.poles}P</td>
        <td>${r.rcd ? `${r.rcd.In} A / ${r.rcd.sensitivityMa} mA` : "—"}</td>
        <td>${fmt(r.cable.section, 1)} / ${fmt(r.cable.pe, 1)}</td>
        <td>${fmt(r.cable.lengthM, 0)} · ${esc(r.cable.method)}</td>
        <td>${fmt(r.dropPct, 2)}%</td>
        ${hasCat ? `<td style="font-family:monospace;font-size:8.5px">${esc(r.breaker.reference || "—")}</td>` : ""}
        ${statusCell(r.status)}
      </tr>`).join("");

    const iphase = d.totals.Iphase.map(x =>
      `${phaseChip(x.phase)} ${fmt(x.currentA, 1)} A`).join(" &nbsp; ");

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Mapa do Quadro — NBR 5410</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;padding:24px;font-size:10px}
  .stamp{border:2px solid #000;margin-bottom:14px}
  .stamp h1{font-size:17px;letter-spacing:3px;text-align:center;padding:10px 8px 2px}
  .stamp .sub{text-align:center;color:#333;font-size:9px;padding-bottom:8px;border-bottom:1px solid #000}
  .stamp .row{display:flex;justify-content:space-between;padding:6px 10px;font-size:9.5px}
  h2{font-size:11px;letter-spacing:1.5px;margin:14px 0 6px;border-bottom:1.5px solid #000;padding-bottom:3px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #999;padding:3.5px 5px;text-align:center;font-size:9px}
  th{background:#eee;font-weight:700;text-transform:uppercase;font-size:8px;letter-spacing:.4px}
  tbody tr:nth-child(even){background:#f7f7f7}
  .kv{display:inline-block;margin-right:18px;padding:2px 0}
  .kv b{font-weight:700}
  .foot{margin-top:16px;font-size:8px;color:#444;border-top:1px solid #999;padding-top:6px;line-height:1.6}
  @page{size:A4 landscape;margin:8mm}
  @media print{body{padding:0}}
</style></head><body>
<div class="stamp">
  <h1>MAPA DO QUADRO DE DISTRIBUIÇÃO — QDF</h1>
  <div class="sub">ABNT NBR 5410:2023 — Instalações Elétricas de Baixa Tensão · Panel Schedule</div>
  <div class="row">
    <span><b>Projeto:</b> ${esc(d.meta.projectName)}</span>
    <span><b>Sistema:</b> ${esc(d.meta.supplyType)} · ${d.meta.Vfn}/${d.meta.Vll} V · ${d.totals.circuits} circuitos</span>
    <span>${d.meta.maker ? `<b>Fabricante ref.:</b> ${esc(d.meta.maker)} · ` : ""}${d.meta.date ? `<b>Data:</b> ${esc(d.meta.date)}` : "EasyEletric"}</span>
  </div>
</div>

<h2>ENTRADA E PROTEÇÃO GERAL</h2>
<div style="padding:4px 0 2px">
  ${d.feeder ? `<span class="kv"><b>Alimentador:</b> ${fmt(d.feeder.section, 1)} mm² (${esc(d.feeder.insulation)}) + N ${fmt(d.feeder.neutral, 1)} + PE ${fmt(d.feeder.pe, 1)} mm² · ${d.feeder.lengthM} m · ${esc(d.feeder.method)} · Izc ${fmt(d.feeder.Izc)} A · ΔV ${fmt(d.feeder.dropPct, 2)}%</span>` : ""}
  ${d.devices.main ? `<span class="kv"><b>Disjuntor geral:</b> ${d.devices.main.In} A · ${esc(d.devices.main.curve)} · ${d.devices.main.poles}P${d.devices.main.icnRequiredA ? ` · Icn ≥ ${fmt(d.devices.main.icnRequiredA / 1000, 1)} kA` : ""}${d.devices.main.reference ? ` · <span style="font-family:monospace">${esc(d.devices.main.reference)}</span>` : ""}</span>` : ""}
  ${d.devices.rcd ? `<span class="kv"><b>DR geral:</b> ${d.devices.rcd.In} A / ${d.devices.rcd.sensitivityMa} mA${d.devices.rcd.reference ? ` · <span style="font-family:monospace">${esc(d.devices.rcd.reference)}</span>` : ""}</span>` : ""}
  ${d.devices.spd ? `<span class="kv"><b>DPS:</b> Classe ${esc(d.devices.spd.class)} · Imax ${d.devices.spd.imaxKA} kA · Uc ≥ ${d.devices.spd.ucV} V · ${d.devices.spd.poles}P${d.devices.spd.reference ? ` · <span style="font-family:monospace">${esc(d.devices.spd.reference)}</span>` : ""}</span>` : ""}
</div>

<h2>CIRCUITOS TERMINAIS</h2>
<table>
  <thead><tr>
    <th>Nº</th><th style="width:22%">Descrição</th><th>Fases</th><th>Fiação</th>
    <th>Pot. (VA)</th><th>Ib (A)</th><th>Disjuntor</th><th>IDR</th>
    <th>Cabo F/PE (mm²)</th><th>Compr. (m) · Mét.</th><th>ΔV</th>
    ${hasCat ? "<th>Referência</th>" : ""}<th>Status</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>

<h2>TOTAIS DO QUADRO</h2>
<div style="padding:4px 0">
  <span class="kv"><b>Potência instalada:</b> ${fmt(d.totals.installedVA / 1000, 2)} kVA</span>
  <span class="kv"><b>Demanda diversificada:</b> ${fmt(d.totals.demandVA / 1000, 2)} kVA (Fd ${fmt(d.totals.overallFactor * 100, 0)}%)</span>
  <span class="kv"><b>Ib alimentador:</b> ${fmt(d.totals.IbFeeder, 1)} A</span>
  <span class="kv"><b>Corrente por fase:</b> ${iphase}</span>
  ${d.totals.neutralA != null ? `<span class="kv"><b>IN estimada:</b> ${fmt(d.totals.neutralA, 1)} A</span>` : ""}
  <span class="kv"><b>Desequilíbrio:</b> ${fmt(d.totals.imbalancePct, 1)}%</span>
</div>

<div class="foot">
  EasyEletric — Smart Distribution Board | Gerado do ElectricalProjectModel (gêmeo digital) — mesmos objetos de engenharia do unifilar e do memorial.<br>
  Pré-dimensionamento conforme ABNT NBR 5410:2023 — não substitui projeto elétrico assinado por profissional habilitado (ART/RRT).
  ${d.disclaimer ? `<br>${esc(d.disclaimer)}` : ""}
</div>
</body></html>`;
  }

  return { build, toHtml, esc };
});
