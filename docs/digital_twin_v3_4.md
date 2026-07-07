# EasyEletric v3.4 — Arquitetura do Gêmeo Digital Elétrico

## Visão

A partir da v3.4, o EasyEletric deixa de ser um conjunto de telas que
calculam coisas e passa a ser um **gêmeo digital da instalação
elétrica**: um modelo canônico único (`ElectricalProjectModel`)
representa todos os objetos de engenharia do projeto, e **todas** as
visualizações — unifilar, QDF, memorial, relatórios — consomem esse
mesmo modelo. Nenhum componente de UI possui dados de engenharia
próprios.

```
cargas + parâmetros do local
        │
        ▼
┌─────────────────────────────┐   scripts/nbr5410_engine.js
│  PIPELINE DE ENGENHARIA     │   scripts/engineering/phase_balance.js
│  demanda → alimentador →    │   scripts/engineering/decision_log.js
│  circuitos → balanceamento  │
│  → decisões                 │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐   scripts/engineering/project_model.js
│  ElectricalProjectModel     │   (fonte única de verdade)
│  grafo de nós de engenharia │
└──────┬───────────┬──────────┘
       ▼           ▼
  unifilar      QDF / memorial / relatórios / BOM
  interativo    (consomem os mesmos objetos)
```

## O modelo (`EEProjectModel.build(loads, site, opts?)`)

### Grafo de nós

Hierarquia estrutural = cadeia de proteção da NBR 5410:

```
utility (rede BT)
└── meter (medidor)
    └── feeder (alimentador)
        └── panel (QDF)
            ├── bus-PE (barramento de terra)
            └── main-breaker (disjuntor geral)
                ├── spd (DPS)
                └── main-rcd (DR geral)
                    ├── bus-A / bus-B / bus-C (fases em uso)
                    │   └── breaker-cN (disjuntor do circuito N)
                    │       └── rcd-cN (DR 30 mA, quando exigido)
                    │           └── conductor-cN
                    │               └── load-cN
                    └── bus-N (neutro)
```

Circuitos multipolares (F+F, 3F) pendem estruturalmente do barramento
da primeira fase, mas registram **todos** os barramentos tocados em
`node.buses` — as travessias os incluem.

### Contrato de cada nó

```js
{ id, type, parent, children[], buses[],
  label, sub,                    // rótulos prontos p/ UI
  data,                          // dados de engenharia (entradas)
  calc,                          // valores calculados pelo motor
  validation: { status,checks[] },// PASS | WARN | ERROR
  decisions[],                   // registro de decisões auditável
  viz: { phases[], kind, icon } } // metadados de visualização
```

- **Validação distribuída**: os checks do motor são fatiados por
  componente — coordenação/interrupção/disparo magnético no
  disjuntor; seção mínima/ampacidade/queda/adiabática no condutor;
  DR no DR; status agregado do circuito na carga.
- **Decisões distribuídas**: o Decision Log (v3.3) é fatiado da mesma
  forma (Ib/fatores/seção/PE → condutor; disjuntor/Icn → disjuntor;
  demanda/equilíbrio → QDF; alimentador → feeder; geral → disjuntor
  geral), preservando alternativas rejeitadas e referência normativa.

### Travessias

- `chainOf(id)` — caminho elétrico do nó até a origem (ancestrais +
  todos os barramentos tocados). É a **cadeia de proteção** do objeto.
- `relatedOf(id)` — `chainOf` + todos os descendentes (hover no
  disjuntor ilumina também condutor e carga; hover no barramento
  ilumina todos os circuitos da fase).
- `ancestorsOf / descendantsOf / byType` — utilitárias.

### Reuso de resultados (zero recálculo)

`build(loads, site, { feeder, circuits })` aceita os resultados já
produzidos pelo pipeline principal do app (`sizeFeederAndMain` e
`sizeCircuit[]`). O app passa `_qdfResult` e `results[i].eng` — o
modelo apenas organiza; a engenharia continua vivendo no motor.

## O renderizador (`EEUnifilarTwin.render(model, opts)`)

SVG string puro, sem DOM (testável em Node), consumindo apenas o
modelo:

- **Biblioteca de símbolos** (`<defs>` + `<use>`): fonte, medidor kWh,
  disjuntor (lâmina + cruz térmica), DR (elipse Δ), DPS, terra e
  ícones de carga (luz, tomada, chuveiro, ar-condicionado, motor,
  genérico). Todos com `currentColor` — escaláveis e tematizáveis.
- **Temas**: `dark`, `light`, `print` (carimbo técnico: título,
  projeto, sistema, demanda, data e aviso de ART/RRT).
- **Overlays** (`opts.overlays`): `current` (Ib, correntes por fase),
  `drop` (ΔV por trecho), `icc` (Icc/Icn), `validation` (pontos e
  bordas verde/amarelo/vermelho). Elementos marcados com classes
  `tw-ov-*`.
- **Interatividade**: cada objeto sai num `<g class="tw-node"
  data-node="ID">`. O CSS embutido no SVG define os estados
  `tw-has-focus` / `tw-hl` / `tw-selected` — o app aplica classes, o
  SVG **nunca** é re-renderizado por hover/seleção (apenas troca de
  overlay/tema re-renderiza).

## O workspace no app (`index.html`)

- Toolbar: zoom −/+, percentual, ajustar à tela, chips de overlay,
  export SVG/PDF (tema print).
- Canvas: pan por arrasto e zoom pela roda (transform CSS no viewport,
  `will-change: transform` — sem redraw).
- Hover: `relatedOf(id)` → classes `tw-hl` + tooltip com status.
- Clique: **Explorador de Engenharia** (painel lateral) — propriedades,
  cálculos, verificações NBR 5410 e decisões com alternativas
  rejeitadas expansíveis.
- Tema do diagrama acompanha o tema do app (re-render no toggle).

## Testes

| Suíte | Casos |
|---|---|
| `test_project_model.js` | 35 — integridade do grafo, sincronização com o motor, validação/decisões distribuídas, travessias, determinismo, casos-limite |
| `test_unifilar_twin.js` | 21 — SVG bem-formado, escaping XML, data-node por nó, símbolos, overlays, temas, determinismo |

Runner completo: `node scripts/test_all.js` (8 suítes, 201 casos).

## Regra de ouro (inalterada)

Cálculo elétrico vive no motor. O modelo **organiza**, o renderizador
**desenha**, a UI **interage**. Qualquer mudança de engenharia passa
pelo motor + testes; qualquer nova visualização consome o
`ElectricalProjectModel`, jamais estado de UI.
