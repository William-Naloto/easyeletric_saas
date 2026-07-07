/* ================================================================
 * EasyEletric — ElectricalProjectModel (Gêmeo Digital da Instalação)
 * ================================================================
 *
 * Módulo independente e SEM DOM: roda no navegador (global
 * `EEProjectModel`) e em Node.js. Depende do motor NBR 5410, do
 * motor de balanceamento e do Registro de Decisões.
 *
 * FONTE ÚNICA DE VERDADE do projeto elétrico: constrói, a partir
 * das cargas + parâmetros do local, um GRAFO de objetos de
 * engenharia que alimenta todas as visualizações (unifilar, QDF,
 * relatórios, explorador de decisões). Nenhum componente de UI
 * possui dados de engenharia próprios — todos consomem este modelo.
 *
 * Cada nó do modelo tem o contrato:
 *
 *   { id, type, parent, children[], buses[], label, sub,
 *     data,               // dados de engenharia (entradas)
 *     calc,               // valores calculados pelo motor
 *     validation: { status: PASS|WARN|ERROR, checks[] },
 *     decisions[],        // registro de decisões (auditável)
 *     viz: { phases[], kind, icon } }
 *
 * Cadeia de proteção modelada (NBR 5410):
 *
 *   utility → meter → feeder → panel → main-breaker → spd
 *          → main-rcd → busbars (A/B/C/N/PE) → breaker → rcd
 *          → conductor → load
 *
 * Nenhum cálculo de engenharia é refeito aqui: o módulo ORQUESTRA
 * o pipeline do motor (demanda → alimentador → circuitos →
 * balanceamento → decisões) e organiza o resultado em grafo.
 * ================================================================ */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(
      require("../nbr5410_engine.js"),
      require("./phase_balance.js"),
      require("./decision_log.js")
    );
  } else {
    root.EEProjectModel = factory(root.NBR5410, root.EEPhaseBalance, root.EEDecisionLog);
  }
})(typeof self !== "undefined" ? self : this, function (E, Balance, DecisionLog) {
  "use strict";

  const PHASES_BY_SUPPLY = {
    monofasico: ["A"],
    bifasico: ["A", "B"],
    trifasico: ["A", "B", "C"]
  };

  // Ícone lógico por tipo de carga (fallback quando o nome não
  // identifica o equipamento)
  const LOAD_ICON = {
    iluminacao: "light", tomadas: "socket", climatizacao: "ac",
    aquecimento: "shower", motor: "motor", uso_geral: "generic"
  };

  // Inferência do equipamento pelo NOME da carga (pt-BR, sem acentos)
  // — ordem importa: da palavra mais específica para a mais genérica.
  const ICON_RULES = [
    [/chuveiro|ducha/, "shower"],
    [/geladeira|freezer|frigobar|refrigerador/, "fridge"],
    [/micro/, "microwave"],
    [/forno|fritadeira|fogao|airfryer|cooktop/, "oven"],
    [/lava|secadora|maquina/, "washer"],
    [/ar[- ]?cond|split|climatiza/, "ac"],
    [/aquecedor|torneira|boiler/, "shower"],
    [/bomba|motor|portao|compressor/, "motor"],
    [/ilumina|lampada|luz|led/, "light"],
    [/tug|tomada/, "socket"]
  ];

  /** Ícone da carga: primeiro pelo nome do equipamento, depois pelo tipo. */
  function inferLoadIcon(name, type) {
    const s = String(name || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const [re, icon] of ICON_RULES) if (re.test(s)) return icon;
    return LOAD_ICON[type] || "generic";
  }

  const STATUS_RANK = { PASS: 0, WARN: 1, ERROR: 2 };

  function worst(a, b) {
    return (STATUS_RANK[b] || 0) > (STATUS_RANK[a] || 0) ? b : a;
  }

  function statusOfChecks(checks) {
    return (checks || []).reduce((s, c) => worst(s, c.status), "PASS");
  }

  /** Divide os checks do motor entre os nós do circuito. */
  const CHECKS_BY_NODE = {
    conductor: ["secao-minima", "ampacidade", "queda-tensao", "adiabatica", "viabilidade"],
    breaker: ["coordenacao", "interrupcao", "disparo-magnetico"],
    rcd: ["dr"]
  };

  function pickChecks(checks, ids) {
    return (checks || []).filter(c => ids.includes(c.id));
  }

  function pickDecisions(entries, ids) {
    return (entries || []).filter(d => ids.includes(d.id));
  }

  /* ==============================================================
   * Construção do modelo
   * ============================================================== */

  /**
   * Constrói o ElectricalProjectModel.
   *
   * @param loadsArr cargas cruas (mesmo formato de sizeCircuit)
   * @param site {Vfn, Vll, supplyType, Ta, insulation,
   *              groupedCircuits, maxDropPct, ikOriginA, feeder?}
   * @param opts {feeder?, circuits?} resultados pré-calculados do
   *             motor (sizeFeederAndMain / sizeCircuit[]) para não
   *             recalcular quando o chamador já os possui. Se
   *             omitidos, o pipeline completo é executado aqui.
   * @returns modelo { nodes, byId, root, circuits, meta, summary,
   *                   chainOf(), relatedOf(), byType() }
   */
  function build(loadsArr, site, opts) {
    opts = opts || {};
    const loads = loadsArr || [];
    const st = site.supplyType || "trifasico";
    const phasesInUse = PHASES_BY_SUPPLY[st] || PHASES_BY_SUPPLY.trifasico;

    // ── Pipeline de engenharia (fonte: motor NBR 5410) ──────────
    const qdf = opts.feeder || (loads.length ? E.sizeFeederAndMain(loads, site) : null);
    const upstreamZOhm = qdf ? qdf.shortCircuit.zAtBoardOhm
      : site.Vfn / (site.ikOriginA || E.TABLES.DEFAULT_IK_ORIGIN_A);
    const circuitResults = opts.circuits ||
      loads.map(l => E.sizeCircuit(l, Object.assign({}, site, { upstreamZOhm })));
    const balance = (Balance && loads.length) ? Balance.analyze(loads, site) : null;

    const feederDecisions = (qdf && DecisionLog) ? DecisionLog.fromFeeder(qdf) : [];

    // ── Grafo ────────────────────────────────────────────────────
    const nodes = [];
    const byId = Object.create(null);

    function addNode(n) {
      n.children = n.children || [];
      n.buses = n.buses || [];
      n.decisions = n.decisions || [];
      n.validation = n.validation || { status: "PASS", checks: [] };
      n.viz = n.viz || {};
      if (byId[n.id]) throw new Error("id duplicado no modelo: " + n.id);
      byId[n.id] = n;
      nodes.push(n);
      if (n.parent) {
        const p = byId[n.parent];
        if (!p) throw new Error("parent inexistente: " + n.parent + " (nó " + n.id + ")");
        p.children.push(n.id);
      }
      return n;
    }

    const sysLabel = st === "monofasico" ? `${site.Vfn} V (1F+N)`
      : st === "bifasico" ? `${site.Vfn}/${site.Vll} V (2F+N)`
      : `${site.Vfn}/${site.Vll} V (3F+N+PE)`;

    // 1. Rede / concessionária
    const utility = addNode({
      id: "utility", type: "utility", parent: null,
      label: "Rede de Distribuição BT", sub: sysLabel,
      data: {
        Vfn: site.Vfn, Vll: site.Vll, supplyType: st,
        ikOriginA: site.ikOriginA || E.TABLES.DEFAULT_IK_ORIGIN_A
      },
      calc: { iccOriginA: site.ikOriginA || E.TABLES.DEFAULT_IK_ORIGIN_A },
      viz: { phases: phasesInUse.slice(), kind: "source" }
    });

    // 2. Medidor
    const meter = addNode({
      id: "meter", type: "meter", parent: utility.id,
      label: "Medidor de Energia", sub: st,
      data: { supplyType: st },
      calc: qdf ? { demandVA: qdf.demand.demandVA } : {},
      viz: { phases: phasesInUse.slice(), kind: "meter" }
    });

    // 3. Alimentador (ramal medidor → QDF)
    const feeder = addNode({
      id: "feeder", type: "feeder", parent: meter.id,
      label: "Alimentador",
      sub: qdf ? `${qdf.feeder.section} mm² · ${qdf.feeder.lengthM} m · ${qdf.feeder.method}` : "—",
      data: qdf ? {
        section: qdf.feeder.section, neutral: qdf.feeder.neutral, pe: qdf.feeder.pe,
        method: qdf.feeder.method, insulation: qdf.feeder.insulation,
        lengthM: qdf.feeder.lengthM, expansionMargin: qdf.feeder.expansionMargin
      } : {},
      calc: qdf ? {
        Ib: qdf.IbFeeder, Idim: qdf.IdimFeeder,
        Iz: qdf.feeder.Iz, Izc: qdf.feeder.Izc,
        dropPct: qdf.feeder.drop.dropPct, dropV: qdf.feeder.drop.dropV,
        maxDropPct: qdf.feeder.maxDropPct, governedBy: qdf.feeder.governedBy
      } : {},
      validation: qdf ? {
        status: statusOfChecks(pickChecks(qdf.checks, ["qdf-queda"])),
        checks: pickChecks(qdf.checks, ["qdf-queda"])
      } : undefined,
      decisions: pickDecisions(feederDecisions, ["ib-alim", "cabo-alim"]),
      viz: { phases: phasesInUse.slice(), kind: "conductor" }
    });

    // 4. QDF (quadro)
    const panel = addNode({
      id: "panel", type: "panel", parent: feeder.id,
      label: "QDF — Quadro de Distribuição", sub: `${loads.length} circuitos`,
      data: { circuits: loads.length, supplyType: st },
      calc: qdf ? {
        installedVA: qdf.demand.installedVA, demandVA: qdf.demand.demandVA,
        overallFactor: qdf.demand.overallFactor,
        Iphase: qdf.Iphase, imbalancePct: qdf.imbalancePct,
        iccBoardA: qdf.shortCircuit.iccBoardA,
        balanceScore: balance ? balance.score : null,
        neutralA: balance ? balance.neutralA : null
      } : {},
      validation: qdf ? { status: qdf.status, checks: qdf.checks } : undefined,
      decisions: pickDecisions(feederDecisions, ["demanda", "equilibrio"]),
      viz: { phases: phasesInUse.slice(), kind: "panel" }
    });

    // 5. Disjuntor geral
    const mainBreaker = addNode({
      id: "main-breaker", type: "main-breaker", parent: panel.id,
      label: "Disjuntor Geral",
      sub: qdf ? `${qdf.main.In} A · curva ${qdf.main.curve} · ${qdf.main.poles}P` : "—",
      data: qdf ? { In: qdf.main.In, curve: qdf.main.curve, poles: qdf.main.poles } : {},
      calc: qdf ? {
        coordinated: qdf.main.coordinated, icnRequiredA: qdf.main.icnRequiredA,
        iccBoardA: qdf.shortCircuit.iccBoardA
      } : {},
      validation: qdf ? {
        status: statusOfChecks(pickChecks(qdf.checks, ["qdf-coordenacao", "qdf-interrupcao"])),
        checks: pickChecks(qdf.checks, ["qdf-coordenacao", "qdf-interrupcao"])
      } : undefined,
      decisions: pickDecisions(feederDecisions, ["geral"]),
      viz: { phases: phasesInUse.slice(), kind: "breaker" }
    });

    // 6. DPS (derivação no barramento, a jusante do geral)
    const spd = addNode({
      id: "spd", type: "spd", parent: mainBreaker.id,
      label: "DPS",
      sub: qdf ? `Classe ${qdf.dps.class} · Imax ${qdf.dps.imaxKA} kA · ${qdf.dps.poles}P` : "—",
      data: qdf ? {
        class: qdf.dps.class, inKA: qdf.dps.inKA, imaxKA: qdf.dps.imaxKA,
        ucV: qdf.dps.ucV, poles: qdf.dps.poles, standard: qdf.dps.standard
      } : {},
      calc: {},
      viz: { phases: phasesInUse.slice(), kind: "spd" }
    });

    // 7. DR geral
    const mainRcd = addNode({
      id: "main-rcd", type: "main-rcd", parent: mainBreaker.id,
      label: "DR Geral",
      sub: qdf ? `${qdf.rcd.In} A / ${qdf.rcd.sensitivityMa} mA` : "—",
      data: qdf ? { In: qdf.rcd.In, sensitivityMa: qdf.rcd.sensitivityMa } : {},
      calc: {},
      viz: { phases: phasesInUse.slice(), kind: "rcd" }
    });

    // 8. Barramentos: fases em uso + N + PE
    const busOf = {};
    phasesInUse.forEach(ph => {
      busOf[ph] = addNode({
        id: "bus-" + ph, type: "busbar", parent: mainRcd.id,
        label: `Barramento Fase ${ph}`, sub: `${site.Vfn} V`,
        data: { phase: ph, voltage: site.Vfn },
        calc: {
          currentA: qdf ? qdf.Iphase[ph] : 0,
          currentBalancedA: balance ? balance.Iphase[ph] : null
        },
        validation: qdf ? {
          status: statusOfChecks(pickChecks(qdf.checks, ["qdf-equilibrio"])),
          checks: pickChecks(qdf.checks, ["qdf-equilibrio"])
        } : undefined,
        viz: { phases: [ph], kind: "busbar" }
      });
    });
    const busN = addNode({
      id: "bus-N", type: "busbar", parent: mainRcd.id,
      label: "Barramento Neutro", sub: qdf ? `${qdf.feeder.neutral} mm²` : "—",
      data: { phase: "N" },
      calc: { currentA: balance ? balance.neutralA : 0 },
      viz: { phases: ["N"], kind: "busbar" }
    });
    const busPE = addNode({
      id: "bus-PE", type: "busbar", parent: panel.id,
      label: "Barramento PE (Terra)", sub: qdf ? `${qdf.feeder.pe} mm²` : "—",
      data: { phase: "PE" },
      calc: {},
      viz: { phases: ["PE"], kind: "busbar" }
    });

    // 9. Circuitos terminais
    const circuits = [];
    circuitResults.forEach((r, i) => {
      const n = i + 1;
      const cid = "c" + n;
      const load = loads[i] || r.input || {};
      const phases = r.phases || ["A"];
      const primaryBus = busOf[phases[0]] ? "bus-" + phases[0] : "bus-" + phasesInUse[0];
      const busIds = phases.filter(p => busOf[p]).map(p => "bus-" + p);
      const name = load.name || `Circuito ${n}`;
      const decisions = DecisionLog ? DecisionLog.fromCircuit(r) : [];
      const hasRcd = r.rcd.sensitivityMa === 30;

      const breaker = addNode({
        id: "breaker-" + cid, type: "breaker", parent: primaryBus, buses: busIds,
        label: `Disjuntor ${cid.toUpperCase()}`,
        sub: `${r.breaker.In} A · curva ${r.breaker.curve} · ${phases.length}P`,
        data: { In: r.breaker.In, curve: r.breaker.curve, poles: phases.length, circuit: n },
        calc: {
          Ib: r.Ib, coordinated: r.breaker.coordinated,
          icnRequiredA: r.breaker.icnRequiredA,
          iccBoardA: r.shortCircuit.iccBoardA,
          magneticTripOk: r.shortCircuit.magneticTripOk,
          tripMultiple: r.shortCircuit.tripMultiple,
          candidates: r.breaker.candidates
        },
        validation: {
          status: statusOfChecks(pickChecks(r.checks, CHECKS_BY_NODE.breaker)),
          checks: pickChecks(r.checks, CHECKS_BY_NODE.breaker)
        },
        decisions: pickDecisions(decisions, ["disjuntor", "icn"]),
        viz: { phases, kind: "breaker", circuit: n }
      });

      let upstream = breaker;
      let rcd = null;
      if (hasRcd) {
        rcd = addNode({
          id: "rcd-" + cid, type: "rcd", parent: breaker.id, buses: busIds,
          label: `DR ${cid.toUpperCase()}`,
          sub: `${r.rcd.In} A / ${r.rcd.sensitivityMa} mA`,
          data: { In: r.rcd.In, sensitivityMa: r.rcd.sensitivityMa, circuit: n },
          calc: {},
          validation: {
            status: statusOfChecks(pickChecks(r.checks, CHECKS_BY_NODE.rcd)),
            checks: pickChecks(r.checks, CHECKS_BY_NODE.rcd)
          },
          decisions: pickDecisions(decisions, ["dr"]),
          viz: { phases, kind: "rcd", circuit: n }
        });
        upstream = rcd;
      }

      const conductor = addNode({
        id: "conductor-" + cid, type: "conductor", parent: upstream.id, buses: busIds,
        label: `Condutor ${cid.toUpperCase()}`,
        sub: `${r.conductor.section} mm² · ${load.distance || r.input.distance || 0} m`,
        data: {
          section: r.conductor.section, pe: r.conductor.pe,
          lengthM: parseFloat(load.distance || r.input.distance) || 0,
          method: load.method || r.input.method || "B1",
          insulation: site.insulation || "PVC", circuit: n
        },
        calc: {
          Ib: r.Ib, Iz: r.conductor.Iz, Izc: r.conductor.Izc,
          Ft: r.Ft, Fg: r.Fg,
          dropPct: r.drop.dropPct, dropV: r.drop.dropV, finalV: r.drop.finalV,
          maxDropPct: r.maxDropPct, governedBy: r.conductor.governedBy,
          iccEndA: r.shortCircuit.iccEndA,
          adiabaticOk: r.shortCircuit.adiabatic.ok,
          steps: r.conductor.steps
        },
        validation: {
          status: statusOfChecks(pickChecks(r.checks, CHECKS_BY_NODE.conductor)),
          checks: pickChecks(r.checks, CHECKS_BY_NODE.conductor)
        },
        decisions: pickDecisions(decisions, ["ib", "fatores", "condutor", "pe"]),
        viz: { phases, kind: "conductor", circuit: n }
      });

      const loadNode = addNode({
        id: "load-" + cid, type: "load", parent: conductor.id, buses: busIds,
        label: name,
        sub: `${(parseFloat(load.power) || 0)} VA · ${r.wiring} · ${r.V} V`,
        data: {
          name, powerVA: parseFloat(load.power) || 0,
          pf: parseFloat(load.pf) || 0.92,
          loadType: load.type || r.input.type || "tomadas",
          wiring: r.wiring, circuit: n
        },
        calc: { Ib: r.Ib, V: r.V, system: r.system },
        validation: { status: r.status, checks: r.checks },
        decisions: pickDecisions(decisions, ["ib"]),
        viz: {
          phases, kind: "load", circuit: n,
          icon: inferLoadIcon(name, load.type || r.input.type)
        }
      });

      circuits.push({
        n, id: cid, name,
        breakerId: breaker.id, rcdId: rcd ? rcd.id : null,
        conductorId: conductor.id, loadId: loadNode.id,
        busIds, phases, status: r.status, result: r
      });
    });

    // ── Sumário do projeto (consumido por relatórios/rodapés) ────
    const worstCircuit = circuits.reduce((s, c) => worst(s, c.status), "PASS");
    const summary = {
      circuits: circuits.length,
      supplyType: st, phasesInUse,
      installedVA: qdf ? qdf.demand.installedVA : 0,
      demandVA: qdf ? qdf.demand.demandVA : 0,
      overallFactor: qdf ? qdf.demand.overallFactor : 1,
      IbFeeder: qdf ? qdf.IbFeeder : 0,
      imbalancePct: qdf ? qdf.imbalancePct : 0,
      balanceScore: balance ? balance.score : null,
      maxDropPct: circuitResults.reduce((m, r) => Math.max(m, r.drop.dropPct), 0),
      status: worst(qdf ? qdf.status : "PASS", worstCircuit)
    };

    /* ── Travessias ──────────────────────────────────────────────
     * chainOf(id): caminho elétrico completo do nó até a origem
     * (cadeia de proteção) — nó, ancestrais e barramentos tocados.
     * relatedOf(id): conjunto a destacar na UI — a cadeia acima
     * MAIS todos os descendentes do nó (ex.: hover no disjuntor
     * ilumina também condutor e carga).
     * ────────────────────────────────────────────────────────── */
    function ancestorsOf(id) {
      const path = [];
      let cur = byId[id];
      while (cur) {
        path.unshift(cur.id);
        cur = cur.parent ? byId[cur.parent] : null;
      }
      return path;
    }

    function descendantsOf(id) {
      const out = [];
      const stack = [id];
      while (stack.length) {
        const cur = byId[stack.pop()];
        if (!cur) continue;
        for (const ch of cur.children) { out.push(ch); stack.push(ch); }
      }
      return out;
    }

    function chainOf(id) {
      if (!byId[id]) return [];
      const seen = new Set(ancestorsOf(id));
      // barramentos de TODAS as fases tocadas (multipolar)
      (byId[id].buses || []).forEach(b => seen.add(b));
      return Array.from(seen);
    }

    function relatedOf(id) {
      if (!byId[id]) return [];
      const seen = new Set(chainOf(id));
      descendantsOf(id).forEach(d => {
        seen.add(d);
        (byId[d].buses || []).forEach(b => seen.add(b));
      });
      return Array.from(seen);
    }

    function byType(type) { return nodes.filter(n => n.type === type); }

    return {
      version: "3.4",
      nodes, byId, root: utility.id, circuits, summary,
      meta: {
        site: { Vfn: site.Vfn, Vll: site.Vll, supplyType: st, Ta: site.Ta, insulation: site.insulation },
        generatedAt: opts.now || null
      },
      source: { feeder: qdf, circuits: circuitResults, balance },
      chainOf, relatedOf, byType, ancestorsOf, descendantsOf
    };
  }

  return { build, PHASES_BY_SUPPLY, LOAD_ICON, inferLoadIcon };
});
