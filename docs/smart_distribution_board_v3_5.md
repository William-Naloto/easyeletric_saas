# Smart Distribution Board — Arquitetura v3.5

> EasyEletric 3.5 · Engineering Workspace Edition
> O QDF deixa de ser uma tabela e se torna o recurso-assinatura da plataforma.

## Missão da versão

Transformar o Quadro de Distribuição (QDF) em um **workspace de engenharia
profissional**, inspirado em Schneider Ecodial, Caneco BT, QiBuilder e
AutoCAD Electrical: um painel elétrico realista, interativo, auditável e
sincronizado com o gêmeo digital — sem duplicar nenhum dado de engenharia.

## Pipeline (nada duplicado, tudo sincronizado)

```
ElectricalProjectModel  (project_model.js — fonte única de verdade)
        ↓
EEPanelHealth           (panel_health.js — saúde + otimização)
        ↓
EEQdfTwin               (qdf_twin.js — SVG do painel realista)
        ↓
Workspace no app        (index.html — health strip, canvas, inspetor)
        ↓
Exportações             (SVG vetorial · PNG 2× · PDF com carimbo)
```

Os módulos são **sem DOM** (browser + Node), UMD, e consomem exclusivamente
o `ElectricalProjectModel`. A única aritmética local do renderizador é de
apresentação (utilização % = corrente do barramento / In do disjuntor geral).

## `engineering/qdf_twin.js` — o painel realista

Renderiza o QDF como um painel elétrico de verdade:

| Zona | Conteúdo |
| --- | --- |
| Gabinete | Moldura com parafusos, placa de montagem, faixa de identificação (nó `panel`) |
| Entrada | Cabo alimentador entrando pelo topo (seção/N/PE, comprimento, método, Ib, Izc, ΔV) |
| Aparelhos de entrada | Disjuntor geral (In/curva/polos/Icn), DPS (classe, Imax, In, Uc) com descida ao PE, DR geral (In/sensibilidade) |
| Barramentos | Barras de cobre horizontais por fase (gradiente metálico, furos de fixação, terminal colorido) com **corrente, utilização % e reserva %** |
| Distribuição | Risers verticais por fase → pentes por fileira → **disjuntores em trilhos DIN** (largura em módulos = nº de polos, abas de fase, alavanca, LED de status, badge DR 30 mA) |
| Saídas | Cabo por circuito (seção, comprimento, método, Ib, ΔV, Icc) → etiqueta de carga (nome, VA, fiação, `<title>` acessível) |
| Terminais | Barras de **Neutro** (corrente IN estimada) e **PE** (com símbolo de terra) com parafusos |

Recursos de plataforma:

- **Multi-trilho** — `packRows()` quebra os circuitos em fileiras de
  `perRow` módulos (default 10); um circuito bifásico ocupa 2 módulos,
  trifásico 3 — como num painel DIN real.
- **Temas** — `dark` / `light` / `print` (carimbo técnico ABNT com projeto,
  sistema, demanda, data e aviso de ART/RRT).
- **Overlays** — `current`, `drop`, `icc`, `validation` (mesmo contrato do
  unifilar) — classes `qtw-ov-*` para ligar/desligar sem tocar no motor.
- **Interatividade sem re-render** — cada objeto é um
  `<g class="qtw-node" data-node="ID">` com os MESMOS ids do modelo;
  a UI usa `chainOf()`/`relatedOf()` do modelo para iluminar a cadeia.
- **Determinístico e XML-seguro** — mesmo modelo + opções ⇒ mesmo SVG;
  todo texto passa por `esc()`.

## `engineering/panel_health.js` — Engineering Health

`assess(model)`:

- **Health Score 0–100** = 70% conformidade + 30% equilíbrio.
  Conformidade parte de 100 e desconta 15 por ERROR e 5 por WARN dos checks
  do motor, **deduplicados** (o modelo replica o mesmo check em vários nós —
  ex.: equilíbrio aparece no painel e em cada barramento — e cada problema
  deve pontuar uma única vez).
- **Indicadores executivos**: Proteção (coordenação/Icn de todos os
  disjuntores), Queda de Tensão (alimentador + circuitos), Aterramento
  (PE em todos os trechos), Equilíbrio (Balance Score + desequilíbrio),
  Demanda (viabilidade do alimentador) e DR/DPS (presença no quadro).
- **Barramentos**: utilização = I fase / In do geral; alerta ≥80%,
  violação ≥100%; reserva complementar.
- **Capacidade futura** = (Izc − Ib dim.)/Izc do alimentador.

`recommend(model, loads, site)` — recomendações **auditáveis**, cada uma com
`{id, severity, title, detail, reference}` e, quando aplicável, uma `action`
declarativa:

1. **Rebalanceamento de fases** (`action.type = "phase-moves"`) — usa o
   otimizador determinístico do `EEPhaseBalance` (LPT + busca local) e traz
   os movimentos com correntes e score antes/depois;
2. Cada finding WARN/ERROR do motor vira recomendação de correção;
3. Barramentos com utilização ≥80%;
4. Capacidade futura <20% (NBR 5410 §4.2.1.4);
5. Circuitos operando acima de 80% do limite de ΔV (§6.2.7).

**Nada é aplicado automaticamente** — a UI só executa a `action` quando o
usuário clica em "Aplicar" (ex. real: health 73% → 96% em um clique).

## Workspace no app (`index.html`)

- **Faixa Engineering Health** no topo da aba QDF: score, 6 indicadores,
  capacidade futura e ΔV global (alimentador + pior circuito vs. 5% §6.2.7).
- **Canvas** com zoom (roda/botões), pan (arrasto), ajustar à tela e chips
  de overlay; **hover ilumina a cadeia de proteção completa** e mostra
  tooltip com status normativo; **clique abre o Inspetor**.
- **Inspetor de Engenharia** lateral: propriedades, cálculos, validação
  NBR 5410 e decisões com alternativas rejeitadas — o conteúdo é o MESMO do
  Explorador do unifilar, gerado pelas funções compartilhadas
  `twinHomeHtml()`/`twinDetailHtml()`.
- **Infraestrutura genérica** — `twinBindCanvas()`, `twinHighlight()`,
  `twinMarkSelected()` parametrizadas por prefixo (`tw` no unifilar, `qtw`
  no quadro): um único código de zoom/pan/hover/seleção para os dois
  workspaces.
- **Otimizar Painel** — modal com as recomendações do motor de saúde e
  botão "Aplicar" por item; aplicar realoca as fases e dispara
  `calculateAll()`, ressincronizando circuitos, QDF, BOM, memorial e twin.
- **Exportações** — SVG (tema print), PNG 2× (rasterização local via
  `<canvas>`; CSP com `img-src blob:`) e PDF (janela de impressão com
  `@page A4 landscape`).

## Sincronização

Selecionar/alterar qualquer coisa passa pelo mesmo caminho:

```
loads (estado do projeto)
  → NBR5410.sizeFeederAndMain + sizeCircuit  (resultados reaproveitados)
  → EEProjectModel.build(loads, site, {feeder, circuits})
  → EEPanelHealth.assess / EEQdfTwin.render
  → UI (health strip + SVG + inspetor)
```

Não há dados de engenharia na UI: recalcular reconstrói o modelo e todas as
visualizações enxergam o mesmo estado.

## Testes

```
node scripts/test_all.js        # 10 suítes / 248 casos
node scripts/engineering/test_qdf_twin.js       # 25 casos
node scripts/engineering/test_panel_health.js   # 17 casos
```

Cobrem: SVG bem-formado/determinístico/escapado, ocupação DIN por polos,
quebra multi-trilho, barramentos por fornecimento (mono/bi/tri), utilização
e reserva, overlays, temas, sincronização com o motor, health score,
indicadores, dedup de findings, capacidade futura, recomendações com ação
não-mutante e casos vazios.

## Roadmap (pensando no 5.0)

- Catálogo de fabricantes para os módulos (placeholder de marca já previsto);
- Mini-mapa e snap/grade no canvas infinito;
- Panel Schedule/relatório do quadro gerado do mesmo modelo;
- DWG/DXF/IFC a partir do SVG paramétrico;
- Score de otimização com sugestões de seção de cabo (hoje informativas).
