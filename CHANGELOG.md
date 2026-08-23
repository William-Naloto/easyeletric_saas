# Changelog

## v3.11.2 — 2026-08-22 · CORREÇÃO CRÍTICA: cache-bust travado em v3.7.3 escondia todas as correções

### Fixed — BLOCKER (deploy)
- **`index.html` fixava `?v=3.7.3` em toda tag `<script>`** desde antes desta sessão, e nenhum dos 6 commits anteriores tocou nesse arquivo — cada correção de engine/render (disjuntor de tomada, DR seletivo, badges de IDR, legendas) foi publicada no `main` e no GitHub Pages **normalmente**, mas o navegador de qualquer visitante que já tinha aberto o site antes continuava servindo os arquivos `.js` **do cache do próprio navegador**, porque a URL (path + query string) era byte-idêntica à já visitada. Deploy correto, cache do cliente desatualizado — confirmado comparando o `CHANGELOG.md` servido ao vivo (já em v3.11.1) com o comportamento reportado (ainda no bug antigo).
  - Todas as 13 tags `<script src="scripts/...">` atualizadas para `?v=3.11.1`.
  - Versão exibida na UI (meta description, badge do logo, rodapé, seção "Recursos") sincronizada de "v3.8" para "v3.11.1"/"v3.11" — estava parada desde a v3.8.0, mascarando visualmente todo o trabalho de v3.9–v3.11.
- **Módulos novos da Fase B/C (`wire_schedule.js`, `device_geometry.js`, `qdf_3d_builder.js`) não estavam carregados pelo `index.html`** — existiam no repositório, testados e validados via Node, mas nenhuma tag `<script>` os incluía, então ficavam inacessíveis no app publicado. Adicionadas as 3 tags que faltavam.

### Nota para o time
Recomenda-se automatizar o cache-bust (ex.: hash do conteúdo do arquivo ou timestamp de build) em vez de um número de versão editado manualmente — esse mesmo problema vai se repetir a cada release se o passo de bump for esquecido.

## v3.11.1 — 2026-08-22 · Validação final: dimensões de MCB confirmadas nas 5 marcas

### Changed
- **`device_geometry.js` — disjuntor (MCB) agora com fonte primária confirmada nas 5 marcas**, não só WEG:
  - WEG MDW: 18 × 86 × 45 mm (catálogo oficial weg.net) — já estava confirmado.
  - Schneider Acti9 iC60N: 18 × 85 × 78,5 mm (datasheet oficial Schneider, download.se.com).
  - Siemens 5SL4: 18 × 90 × 76 mm (datasheet Siemens 5SL4125-6 via RS Components; módulo de 18 mm também confirmado no catálogo oficial Siemens LV10, "1 MW = 18 mm").
  - ABB S200: 18 × 86 × 68 mm (datasheet oficial ABB S200 OV, library.e.abb.com, seção "Dimensions (H x D x W)").
  - Legrand DX3: 17,8 × 94,8 × 77,8 mm (datasheet Legrand DX3 via RS Components).
  - As 5 marcas convergem em ~18 mm por módulo (a norma IEC 60947-2/EN 50022 define 17,5 mm nominal; todo fabricante do setor realiza ~18 mm na prática) — confirma que a envolvente adotada desde a v3.11.0 já estava correta mesmo antes da checagem.
- **Sourcing passou a ser por categoria de dispositivo** (`mcb`/`rcd`/`spd`), não mais um booleano único por fabricante — porque a confirmação não chega junto para as três categorias. IDR (RCD) e DPS (SPD) permanecem confirmados apenas para WEG nesta versão; as demais marcas seguem com envolvente padrão de mercado, marcado `sourced: false` em `byCategory.rcd`/`byCategory.spd`, nunca escondido.
- 5 novos testes de regressão travando os valores oficiais de cada marca; 16 suítes, todas verdes.

## v3.11.0 — 2026-08-22 · Fase B: modelo 3D paramétrico próprio (5 fabricantes)

### Added
- **Novo módulo `scripts/engineering/device_geometry.js`** (`EEDeviceGeometry`): dimensões físicas reais (mm) e cores de acabamento por fabricante — não é o asset CAD oficial (isso exige licenciamento comercial, ver nota abaixo), é geometria própria construída a partir de datasheet/norma pública.
  - WEG: dimensões conferidas no catálogo oficial (weg.net) — 18 mm/módulo, disjuntor 86 mm de altura, IDR 89×74 mm, DPS 90×68 mm. Marcado `sourced: true`.
  - Schneider/Siemens/ABB/Legrand: envolvente padrão de mercado (IEC 60947-2/EN 50022, 17,5 mm/módulo) até confirmarmos o datasheet oficial de cada marca — marcado `sourced: false`, com nota explícita no próprio dado.
  - Trilho DIN: EN 50022 (35 mm), padrão universal.
- **Novo módulo `scripts/engineering/qdf_3d_builder.js`** (`EEQdf3D`): gera a lista de peças 3D (posição/tamanho/cor em mm) do quadro inteiro a partir do `ElectricalProjectModel` — disjuntor geral, DR geral (com selo de seletividade), DPS's, barramentos de fase, trilhos DIN, e um disjuntor+IDR por circuito terminal, exatamente espelhando a topologia elétrica real (mesmo agrupamento De/Para do `wire_schedule.js`). Testado nos 5 fabricantes contra o projeto real de 17 circuitos: 48 peças, painel 710×1235 mm, zero sobreposição.
- **5º fabricante: Legrand** adicionado a `manufacturer_catalog.js` (linha DX3), completando o conjunto de 5 marcas com biblioteca própria (WEG, Schneider, Siemens, ABB, Legrand).
- 20 testes novos (`test_device_geometry.js` + `test_qdf_3d_builder.js`), 16 suítes no total.

### Reality check documentado (ver discussão de planejamento)
Investigação confirmou que nenhum fabricante do setor oferece API para elementos 3D sob demanda — apenas bibliotecas BIM (Revit/IFC) para download manual, sob licença de projeto de especificação, não de redistribuição em SaaS de terceiro. A rota escolhida foi construir uma biblioteca 3D paramétrica própria a partir de especificação técnica pública (datasheet, norma), evitando qualquer dependência de licenciamento de terceiro. Uso do asset oficial de cada fabricante (Fase C do roadmap) exige negociação comercial direta, fora do escopo de desenvolvimento de software.

## v3.10.0 — 2026-08-22 · Guia de Instalação: identificação De/Para de cabeamento

### Added
- **Novo módulo `scripts/engineering/wire_schedule.js`** (`EEWireSchedule`): gera, a partir do `ElectricalProjectModel`, a identificação física completa de CADA condutor do quadro — uma linha por fio real (fase(s), neutro quando existir, PE sempre), não por circuito. Para o projeto de 17 circuitos do memorial de referência: **57 condutores físicos identificados** (6 do quadro/alimentador + 51 dos circuitos terminais).
  - Cada condutor recebe: tag único (`C06-A`, `C06-N`, `C06-PE`...), ponto **DE** (barramento/borne de origem no QDF) e **PARA** (ambiente + descrição da carga), cor normativa (NBR 5410 §6.1.5.3), bitola, método de instalação, comprimento e a que borne do disjuntor/IDR ele pousa.
  - `WS.toMarkdown(schedule)` — tabela De/Para completa por circuito, pronta para entrar no memorial/guia de instalação.
  - `WS.toLabelSheet(schedule)` — lista achatada de etiquetas de 2 linhas, uma por condutor físico, no formato compatível com rotuladores de obra (Brady/Vinilex/Brother P-touch), na ordem em que seriam coladas (quadro → circuito a circuito → fase → neutro → PE).
  - Ficha do quadro (`boardWires`) cobre também o alimentador (fase+neutro+PE), DPS e DR geral com o mesmo formato De/Para.
  - 12 testes de regressão em `scripts/engineering/test_wire_schedule.js`, registrados em `test_all.js`.

### Roadmap (não incluído nesta versão)
- Elementos 3D reais de fabricante via API/BIM: investigado — não existe API de fabricante para isso (WEG/Schneider/ABB/Siemens publicam bibliotecas BIM/Revit para download manual, sob licença de projeto, não de redistribuição em SaaS de terceiros). Próxima etapa: biblioteca 3D paramétrica própria (Three.js/GLTF) com dimensões reais de datasheet público — ver discussão no changelog/PR desta versão.

## v3.9.1 — 2026-08-22 · DR geral seletivo + IDR individual sempre visível + legendas

### Fixed
- **IDR individual "sumia" na maioria dos circuitos.** `qdf_twin.js` desenhava o badge "IDR 30 mA" logo abaixo de cada disjuntor, mas o halo semi-opaco da legenda de corrente/queda de tensão da fileira SEGUINTE (na mesma coluna) era desenhado por cima em ordem de documento — cobria o badge quase sempre. Só sobrava visível o último circuito de cada coluna, dando a impressão de que os IDRs estavam faltando. Corrigido adiando o desenho de todos os badges de IDR para depois de todas as fileiras (sempre no topo da pilha).
- **DR geral duplicava proteção de 30 mA com os IDRs terminais.** `sizeFeederAndMain()` sempre retornava o DR geral em 30 mA instantâneo, mesmo quando cada circuito de tomada/TUE já tem IDR de 30 mA próprio — nesse caso o geral dispararia junto com o terminal em qualquer fuga, derrubando o quadro inteiro sem necessidade (perda de seletividade). Agora o geral vira automaticamente **seletivo tipo S, 300 mA** quando há IDR terminal (função `selectMainRCD` de `rcd.js` já existia e já tinha essa regra — só não estava sendo chamada por `sizeFeederAndMain`). Sem nenhum IDR terminal, o geral permanece 30 mA instantâneo (única linha de defesa).
- **Nome do circuito truncava a 16 caracteres no meio da palavra** ("COzin…", "quart…") independente da largura real da etiqueta (102 px, cabe ~22 caracteres). Truncamento agora prefere cortar no último espaço antes do limite.

### Docs
- CHANGELOG v3.9.0 (ver abaixo) documenta a correção do disjuntor de tomada/TUE.

## v3.9.0 — 2026-08-22 · CORREÇÃO CRÍTICA: disjuntor colado à carga em vez do condutor

### Fixed — BLOCKER
- **Disjuntor de circuitos de tomada/TUE não usava mais a folga do condutor.** `selectBreaker()` sempre escolhia o MENOR In comercial ≥ Ib. Como a seção mínima de tomada (2,5 mm², Tab. 47) já é obrigatória independente da carga, isso "colava" o disjuntor na carga do dia da obra (ex.: geladeira de 350 VA → 6 A) mesmo quando o próprio cabo já instalado suportava muito mais (Izc ≈ 24 A) — travando o circuito para qualquer upgrade de carga futuro sem custo real de cobre economizado.
  - Nova estratégia dupla em `sizeCircuit()`, por tipo de circuito:
    - `tomadas` / `uso_geral` (inclui TUE — geladeira, micro-ondas etc.): **estratégia "max"** — disjuntor = MAIOR In comercial ≤ Izc, limitado à corrente nominal padrão de tomada/plugue NBR 14136 (`site.socketMaxA`, default 20 A). O teto de tomada é ignorado automaticamente se Ib já o exceder (a coordenação Ib ≤ In é sempre prioritária).
    - Circuitos de equipamento fixo/dedicado (`iluminacao`, `climatizacao`, `aquecimento`, `motor`): mantém a **estratégia "min"** original — In deve refletir a placa do aparelho, não uma folga especulativa.
  - `In ≤ Izc` continua absoluto em ambas as estratégias — o condutor sempre protege o teto; a mudança afeta apenas onde, dentro da janela permitida, o In é escolhido.
  - `breaker.strategy`, `breaker.socketMaxA` e `breaker.socketCapApplied` expostos no resultado para auditoria no memorial e no decision log.
  - 5 novos testes de regressão em `scripts/test_nbr5410_engine.js` cobrindo o caso relatado (micro-ondas 1200 VA / 2,5 mm² preso em 6 A), o teto de tomada e a preservação da estratégia "min" para carga fixa.

### Docs
- Nota de engenharia detalhada adicionada ao cabeçalho de `scripts/nbr5410_engine.js` explicando a distinção normativa entre "Ib ≤ In ≤ Iz é obrigatório" (NBR 5410 §5.3.4) e "In = menor valor da janela é apenas convenção, não exigência".

## v3.8.0 — 2026-08-16 · Camada de UX orientada a ação (Billboards, Stepper, Command Center, EasyEngineer AI)

### Added
- **Billboards contextuais** — banners dinâmicos acima do workspace, dirigidos por estado real (`loads`, `results`, `_qxHealth` do `EEPanelHealth.assess()`), não texto de marketing fixo. Cobrem onboarding, progresso, erro/aviso, sucesso e materiais.
- **Stepper de progresso do projeto** — 4 estágios reais (Cargas → Circuitos → Proteções/QDF → Documentação), cada um só marcado como concluído quando o estado correspondente é verdadeiro; "Documentação" exige exportação real (PDF/XLSX), não apenas ter resultados.
- **Central de Comandos (Ctrl+K)** — paleta de comandos com 14 ações reais (navegação, cálculo, exportação, tema, dev panel), reaproveitando o padrão `.modal-ov` já existente.
- **EasyEngineer AI** — nova aba "Assistente IA", copiloto que chama a API da Anthropic (Claude) diretamente do navegador com o JSON real do projeto como contexto (cargas, circuitos calculados, Electrical Health). O motor determinístico NBR 5410 continua sendo a única fonte de verdade — a IA explica, nunca recalcula. Chave de API armazenada em `localStorage` (uso client-side; trocar por proxy de servidor antes de expor a usuários públicos).

### Notes
- Nenhuma mudança no motor de cálculo (`nbr5410_engine.js`) ou nos engines de `/scripts/engineering/` — as 291 suítes de teste existentes permanecem inalteradas e aprovadas.

## v3.7.3 — 2026-07-19 · Correções de legendas, DG e neutro por circuito

### Fixed
- **Neutro somente para circuitos que têm neutro** — a ligação da carga à barra N passa a ser desenhada apenas quando a fiação inclui N (F+N); circuitos F+F (bifásicos, ex.: chuveiro A+B) e 3F não levam mais fio de neutro no desenho nem no DXF. A ligação ao **PE permanece em todos os circuitos** (condutor de proteção obrigatório — NBR 5410 Tab. 58).
- **Legendas sobrepostas** — bloco do ALIMENTADOR reposicionado para a direita das descidas N/PE da borda (nenhum fio cruza o texto); rótulos de cabo dos circuitos ganham **halo de fundo** e ficam legíveis sobre o trilho DIN; folga vertical extra antes do pente para os textos do DPS não invadirem a primeira fileira.

### Changed
- **Sigla do disjuntor geral: QG → DG** no painel e no DXF.

## v3.7.2 — 2026-07-19 · Entrada no estilo do diagrama de ligação clássico

### Changed
- **Zona de entrada redesenhada a partir do diagrama de ligação de referência**: linhas de alimentação horizontais **A(R)/B(S)/C(T)/N/PE** no topo do painel (rotuladas, nas cores da norma), **QG** derivado das fases com pontos de junção, **DR tetrapolar** logo abaixo recebendo também o **neutro direto da linha N**, e **banco de DPS à direita** alimentado em paralelo (derivado entre o QG e o DR; módulo N pela linha N), todos drenando por coletor **verde ao PE**; saída pelo rótulo **"Circuitos"** para o pente central.
- **Dispositivos desenhados realistas**: QG multipolar com alavancas e parafusos de terminal por polo, DR com alavanca única e botão de teste "T", DPS com janela verde de status e terminal de terra — como nas imagens de catálogo.
- Linhas N e PE do topo conectam-se ortogonalmente às barras verticais das bordas (pontos de junção); DXF espelha toda a nova geometria.

## v3.7.1 — 2026-07-08 · Disposição do disjuntor geral e DR geral

### Changed
- **Zona de entrada em linha única, como num painel real** — DR GERAL agora fica **centrado sobre o pente** (descidas retas A/B/C, sem diagonais) com o **DISJUNTOR GERAL imediatamente à direita, na mesma linha**, ligado por um **jumper curto**; o alimentador desce reto do topo do gabinete direto no geral, com os rótulos em coluna própria à direita do módulo (sem sobreposição).
- **Derivação do DPS no jumper, A MONTANTE do DR** — o nó de derivação fica entre o disjuntor geral e o DR (conexão correta para o arranjo N+1/centelhador em TT), anotado no desenho e no DXF.
- Textos do DR geral corrigidos (centralização) e referência de catálogo também no DR geral; zona superior ~40 px mais compacta; DXF espelha a nova geometria.

## v3.7 — 2026-07-08 · Painel Real: DPS em paralelo, TT/TN-S e cores NBR

Layout do QDF redesenhado a partir de um quadro residencial real: DPS instalado corretamente EM PARALELO, escolha do esquema de aterramento TT/TN-S, cores de condutores conforme a norma e nomenclatura DR (geral) / IDR (por circuito).

### Changed
- **Layout do Smart Distribution Board** (`engineering/qdf_twin.js`) — agora segue a topologia de um painel real: **pente de cobre VERTICAL central**, colunas de disjuntores espelhadas (ímpares à esquerda, pares à direita), disjuntor geral no topo-direito recebendo o alimentador, **DR geral ao centro**, barras verticais de **Neutro (azul)** e **PE (verde)** nas duas bordas com terminais, trilhos DIN verticais e interior de gabinete claro e realista em todos os temas (a página muda com o tema; o painel parece um painel).
- **DPS instalado EM PARALELO (derivação)** — NBR 5410 §6.3.5.2: banco de módulos DPS no topo-esquerdo derivado do barramento após o disjuntor geral (nunca em série no caminho principal), com descida ao PE e aviso normativo no desenho; em **TT** a conexão é **N+1** (módulo N–PE por **centelhador**, desenhado com símbolo de gap), em **TN-S** modo comum.
- **Cores dos condutores conforme NBR 5410 §6.1.5.3** — fases **preto / vermelho / marrom** (A/B/C), neutro **azul-claro**, PE **verde** — aplicadas ao painel, ao unifilar (fase "preta" segue a convenção CAD no tema escuro), às cores de fase da UI, ao mapa do quadro e às camadas/cores ACI do DXF (A=7, B=1, C=34, N=5, PE=3); legendas passam a nomear as cores.
- **Nomenclatura DR / IDR** — **DR = proteção diferencial GERAL** do quadro; **IDR = interruptor diferencial POR CIRCUITO**: modelo (`IDR C1…`), badges do painel, mapa do quadro e memorial.
- **Lista de materiais** — cabos separados por FUNÇÃO/COR: um item por fase (preto/vermelho/marrom) + neutro azul-claro + **PE verde na seção da Tab. 58 por circuito** (antes um único item por seção + PE fixo 2,5 mm²); IDR por circuito nomeado como IDR; novo item **DR Geral**; DPS anotado como instalação em paralelo.

### Added
- **Seleção do esquema de aterramento no Sistema Elétrico** — **TT (padrão BR)** ou **TN-S** (NBR 5410 §5.1.2.2), persistida no projeto: reflete no motor de DPS (EESpd — conexão N+1 com centelhador em TT / modo comum em TN-S), no desenho do painel, no DXF e no carimbo de impressão; troca recalcula o projeto e explica a consequência normativa.
- Runner unificado: 13 suítes / 291 casos (`node scripts/test_all.js`).

## v3.6 — 2026-07-08 · Engineering Workspace — roadmap concluído

Conclui o roadmap do Smart Distribution Board: catálogo de fabricantes, mapa do quadro (panel schedule), exportação DXF para CAD, mini-mapa/grade no canvas e sugestões de seção de cabo quantificadas.

### Added
- **Catálogo de fabricantes** `engineering/manufacturer_catalog.js` — referências comerciais para disjuntores, DR e DPS a partir das seleções do motor (WEG MDW/MDWH, Schneider Easy9/Acti9, Siemens 5SL, ABB SH200/S200 + genérico): a série é escolhida pela **Icn requerida** calculada pelo motor (linha residencial → linha reforçada quando necessário); DR com polos comerciais (2P/4P) pelo sistema. Referências seguem o padrão de codificação de cada fabricante e são **ilustrativas** — disclaimer em toda saída (12 testes).
- **Panel Schedule** `engineering/panel_schedule.js` — mapa do quadro em dois formatos do MESMO modelo: dados estruturados (`build`) e **documento HTML imprimível A4** (`toHtml`) com carimbo técnico, entrada/proteção geral, tabela de circuitos (fases coloridas, disjuntor, DR, cabo F/PE, ΔV, status), totais do quadro e coluna de referência comercial quando um catálogo é fornecido (12 testes).
- **Exportação DXF** `engineering/dxf_export.js` — DXF ASCII **R12 (AC1009)** do painel com camadas por disciplina (gabinete, barramentos por fase com cores ACI, dispositivos, cabos, textos) e geometria derivada do MESMO layout do SVG (`EEQdfTwin.layout`) — abre em AutoCAD, QCAD, LibreCAD, BricsCAD (13 testes). DWG/IFC permanecem fora do escopo client-side (formato proprietário / modelo BIM): o DXF cobre a interoperação CAD.
- **Mini-mapa e grade no workspace do QDF** — mini-mapa com retângulo do viewport e navegação por clique/arrasto; alternância da grade do canvas; ambos sem re-render do modelo.
- **Seletor de fabricante no app** — as referências aparecem nos módulos do painel SVG e em uma seção "Catálogo do Fabricante" no inspetor; o mapa do quadro ganha a coluna de referência.
- **Sugestões de cabo quantificadas** — recomendações de queda de tensão passam a indicar a **próxima seção comercial e a ΔV estimada** (R ∝ 1/S), sempre informativas (o valor exato sai do motor ao recalcular).
- Runner unificado passa a 13 suítes / 286 casos (`node scripts/test_all.js`).

### Changed
- `EEQdfTwin.render` aceita `opts.catalog` (referências impressas nos módulos).
- Branding e cache-busting atualizados para v3.6.

## v3.5 — 2026-07-07 · Smart Distribution Board

O QDF deixa de ser uma tabela e se torna o recurso-assinatura do EasyEletric: um **painel elétrico realista e interativo**, renderizado do gêmeo digital, com saúde de engenharia, inspetor por componente e otimizador auditável. Arquitetura documentada em `docs/smart_distribution_board_v3_5.md`.

### Added
- **Smart Distribution Board** `engineering/qdf_twin.js` — renderizador SVG sem DOM (browser + Node) que desenha o QDF como um painel real: gabinete com placa de montagem e parafusos, cabo alimentador entrando pelo topo, disjuntor geral, DPS com descida ao PE, DR geral, **barramentos de cobre por fase** (gradiente metálico, corrente, utilização % e reserva %), pentes de distribuição, **disjuntores parciais em trilhos DIN** (largura em módulos = nº de polos, abas coloridas por fase, LED de status), cabos de saída (seção, comprimento, Ib, ΔV), etiquetas de carga e **barras de Neutro/PE com terminais de parafuso**. Multi-trilho com quebra automática de fileiras, temas dark/light/print (carimbo técnico), overlays de corrente/ΔV/Icc/validação e `data-node` por objeto — os MESMOS ids do modelo — para interatividade sem re-render (25 testes).
- **Motor de saúde do quadro** `engineering/panel_health.js` — agrega os checks PASS/WARN/ERROR do modelo (deduplicados) em um **Engineering Health Score 0–100** (70% conformidade + 30% equilíbrio), indicadores executivos (Proteção, Queda de Tensão, Aterramento, Equilíbrio, Demanda, DR/DPS), **utilização/reserva por barramento** (I fase / In do geral, alerta ≥80%), **capacidade futura do alimentador** (folga Izc vs. Ib dim.) e **recomendações de otimização auditáveis** com referência normativa — rebalanceamento de fases com movimentos e score antes/depois, correção de findings do motor, barramentos carregados, reserva de expansão <20% e circuitos próximos do limite de ΔV. Nada é aplicado automaticamente: cada recomendação carrega uma `action` declarativa aplicada só sob aprovação (17 testes).
- **Workspace do QDF no app** — a aba QDF vira um workspace de engenharia: **faixa Engineering Health** (score, indicadores, capacidade futura e ΔV global §6.2.7), painel SVG com zoom/pan/ajustar e chips de overlay, **hover ilumina a cadeia de proteção completa** e **clique abre o Inspetor de Engenharia** lateral (propriedades, cálculos, validação NBR 5410 e decisões com alternativas rejeitadas — mesmo conteúdo do explorador do unifilar, agora compartilhado).
- **Otimizar Painel** — modal de recomendações do motor de saúde com botão "Aplicar" por recomendação; o rebalanceamento de fases realoca os circuitos e recalcula todo o projeto em um clique (ex.: health 73% → 96%).
- **Exportações do quadro** — SVG vetorial (tema de impressão), **PNG em alta resolução (2×)** rasterizado localmente e PDF com carimbo técnico via impressão do navegador.
- **Infraestrutura genérica de workspace twin** — `twinBindCanvas`/`twinHighlight`/`twinMarkSelected` + `twinHomeHtml`/`twinDetailHtml` compartilhados entre o unifilar (modal) e o Smart Board (aba QDF), sem duplicação.
- Runner unificado passa a 10 suítes / 248 casos (`node scripts/test_all.js`).

### Changed
- **QDF tabular removido** — a representação panel-schedule em HTML (e o CSS/interações associados) é substituída pelo painel SVG do gêmeo digital; todos os dados continuam vindo do MESMO `_qdfResult` + resultados por circuito, agora via `ElectricalProjectModel`.
- CSP ganha `img-src 'self' blob: data:` para permitir a rasterização local do PNG.
- Branding e cache-busting atualizados para v3.5.

## v3.4 — 2026-07-07 · Electrical Digital Twin

A instalação elétrica passa a ser modelada como um **gêmeo digital**: um modelo canônico único alimenta todas as visualizações, e o unifilar deixa de ser um relatório estático para se tornar um workspace de engenharia interativo estilo CAD. Arquitetura documentada em `docs/digital_twin_v3_4.md`.

### Added
- **ElectricalProjectModel** `engineering/project_model.js` — fonte única de verdade do projeto: grafo de objetos de engenharia (rede → medidor → alimentador → QDF → disjuntor geral → DPS → DR geral → barramentos A/B/C/N/PE → disjuntores parciais → DR → condutores → cargas). Cada nó carrega `{id, parent, children, data, calc, validation, decisions, viz}`; validação PASS/WARN/ERROR e registro de decisões do motor são **distribuídos por componente** (coordenação/interrupção/disparo → disjuntor; ampacidade/queda/adiabática → condutor; DR → DR). Travessias `chainOf()` (cadeia de proteção até a origem, incluindo todos os barramentos de circuitos multipolares) e `relatedOf()` (cadeia + descendentes) alimentam a interatividade. Aceita resultados pré-calculados do pipeline principal — nada é recalculado (35 testes).
- **Renderizador unifilar do gêmeo digital** `engineering/unifilar_twin.js` — SVG vetorial sem DOM (browser + Node) com biblioteca de símbolos IEC/NBR reutilizável (fonte, medidor kWh, disjuntor, DR, DPS, terra e ícones de carga por tipo), barramentos coloridos por fase com correntes, cadeia de proteção completa, overlays de engenharia opcionais (corrente, ΔV, Icc, validação), temas dark/light/print (impressão com carimbo técnico e aviso de ART/RRT) e `data-node` em cada objeto para interatividade sem re-render (21 testes).
- **Workspace unifilar interativo no app** — zoom por roda/botões, pan por arrasto, ajustar à tela, chips de overlay na toolbar; **hover ilumina a cadeia de proteção inteira** (da rede à carga) esmaecendo o resto; tooltip com status normativo; **clique abre o Explorador de Engenharia**: propriedades, cálculos, verificações NBR 5410 coloridas e decisões auditáveis com alternativas rejeitadas e referência normativa. Diagrama acompanha o tema claro/escuro do app.
- Runner unificado passa a 8 suítes / 201 casos (`node scripts/test_all.js`).

### Changed
- **Exportações SVG/PDF do unifilar** usam o renderizador do gêmeo digital em tema de impressão (carimbo técnico, símbolos vetoriais, overlays selecionados) — substitui o SVG estático tabular anterior (`buildUnifilarSVG` removido).
- Unifilar, QDF e memorial consomem os MESMOS objetos do motor via modelo (`_qdfResult` + resultados por circuito reaproveitados na construção do modelo).
- Branding atualizado para v3.4.

## v3.3 — 2026-07-06

Serviços modulares de engenharia (`scripts/engineering/`): balanceamento de fases com otimizador, motores dedicados de DR, DPS e aterramento, e Registro de Decisões de Engenharia unificado. Todos independentes, sem DOM, testados em Node e sem duplicação de lógica com o motor central.

### Added
- **Motor de balanceamento de fases** `engineering/phase_balance.js` — análise por **corrente sob demanda diversificada** (não potência instalada), **corrente de neutro por soma fasorial** (fases a 120°), Balance Score 0–100 com penalidade de neutro carregado, e **otimizador determinístico** (LPT + busca local) que sugere realocação de circuitos F+N com relatório antes/depois e lista de movimentos (24 testes).
- **Motor de seleção de DR** `engineering/rcd.js` — obrigatoriedade 30 mA por circuito (§5.1.3.2.2), **tipo pela natureza da fuga** (IEC 62423: AC/A/F/B — inverter → F, VFD trifásico → B), corrente comercial ≥ In do disjuntor e **DR geral seletivo tipo S 300 mA** quando há DRs terminais (20 testes).
- **Motor de seleção de DPS** `engineering/spd.js` — classe I/II/III por exposição (SPDA, entrada aérea/subterrânea), Uc ≥ 1,1·U0 comercial, Up pela Tab. 31 (categoria II), Iimp/In/Imax por classe, **conexão "N+1" com centelhador N-PE em esquema TT** e recomendação de Tipo III por distância de proteção (17 testes).
- **Módulo de aterramento** `engineering/grounding.js` — esquemas TT/TN-S/TN-C-S/IT com requisitos próprios (TT: DR obrigatório; PEN ≥ 10 mm² e não seccionável; IT: DSI), PE pela Tab. 58, eletrodo (≥3 hastes 2,4 m, meta ≤10 Ω), BEP e equipotencialização suplementar (17 testes).
- **Registro de Decisões de Engenharia** `engineering/decision_log.js` — formato único `{decisão, razão, alternativas rejeitadas, referência normativa}` gerado da trilha de auditoria do motor (sem refazer cálculos), incluindo alternativas viáveis porém não mínimas (12 testes).
- **Runner unificado** `scripts/test_all.js` — 6 suítes, 145 casos.

### Changed
- **"Balancear Fases" usa o otimizador do motor**: realocação determinística por corrente sob demanda (antes: greedy por potência instalada) com toast antes/depois (score, desequilíbrio e neutro).
- **Painel de equilíbrio do QDF**: score e desequilíbrio calculados por corrente (motor), corrente por fase exibida ao lado da potência e **corrente de neutro estimada** no card do score.
- **Card de DPS gerado pelo motor EESpd** (antes hardcoded classe II 2P): classe por exposição, Uc comercial, conexão por esquema de aterramento e justificativas nas tooltips.
- **Memorial**: novo bloco colapsável "Registro de Decisões de Engenharia" por circuito e nova seção "QDF / Alimentador" com as decisões de demanda, cabo e disjuntor geral (inclusive a rejeição explícita de "Σ In dos disjuntores parciais").

## v3.2 — 2026-07-05

Redesenho do motor de dimensionamento: sequência normativa completa (condutor antes do disjuntor), QDF por demanda diversificada e pipeline de validação. Metodologia, fórmulas e premissas documentadas em `docs/metodologia_calculo_nbr5410.md`.

### Added
- **Motor de cálculo autocontido** `scripts/nbr5410_engine.js` (browser + Node, sem DOM): fonte única de fórmulas, tabelas normativas (Tab. 36/37/40/42/47/58), fatores de demanda, curto-circuito e validação. O `index.html` passa a delegar todos os cálculos a ele (adaptadores retrocompatíveis mantidos).
- **Suíte de testes em Node** `scripts/test_nbr5410_engine.js` — 55 casos: iluminação, tomadas, TUE, chuveiro, ar-condicionado, trifásico, alta demanda, QDF, queda de tensão, correções de temperatura/agrupamento, curto-circuito, casos-limite e regressões de determinismo.
- **Pipeline de validação PASS/WARN/ERROR** por circuito (seção mínima, ampacidade, coordenação, queda, capacidade de interrupção, disparo magnético, verificação adiabática §5.3.5.4, DR, viabilidade) e por QDF (coordenação do geral, queda do alimentador, equilíbrio de fases, interrupção) — chips no card do circuito e lista completa no memorial.
- **Curto-circuito real**: Icc presumida na entrada (6 kA padrão) atenuada pelas impedâncias do alimentador e do circuito; capacidade de interrupção mínima (Icn 3/4,5/6/10 kA) exibida e verificada; disparo magnético por curva (5×In B / 10×In C).
- **Memorial auditável**: trilha de seleção da seção (cada seção reprovada e por quê), auditoria de disjuntores comerciais (ex.: `20A ❌ · 25A ✅ · 32A ❌ excede Izc`) e critério dominante do dimensionamento.

### Changed
- **Disjuntor: MENOR In comercial com Ib ≤ In ≤ Izc (§5.3.4)** — substitui o critério "maior In ≤ Izc" da v3.1: a proteção atende a carga com a menor corrente nominal possível, jamais excedendo a capacidade do condutor; se nenhum In couber na janela, a seção é elevada. Junto com a seleção do condutor pela menor seção que atende TODOS os critérios (Tab. 47 + ampacidade + queda), elimina superdimensionamentos desnecessários.
- **QDF por demanda diversificada** — o disjuntor geral deixa de usar fator por faixa de potência total (e o unifilar deixa de usar 0,6×ΣIb): fatores progressivos de iluminação+TUG, aquecimento por nº de aparelhos, climatização 100%, motores (100% maior + 70% demais), com salvaguarda de demanda ≥ maior carga individual. Ib do alimentador = **máxima corrente de fase** (bifásicos somam corrente de linha nas duas fases). QDF, unifilar SVG e PDF passam a usar **o mesmo resultado**.
- **Alimentador dimensionado automaticamente**: cabo para Ib×1,20 (margem de expansão só no cabo), método B1, mínimo de entrada 10 mm², queda ≤ 2%; neutro = fase; PE pela Tab. 58; disjuntor geral coordenado Ib ≤ In ≤ Izc; DR geral ≥ In (padrão comercial); DPS com Uc e polos por sistema.
- **Queda de tensão**: resistividade do cobre na temperatura de operação do condutor (PVC 70 °C: 0,02063; XLPE 90 °C: 0,02198 Ω·mm²/m — antes 0,0217 fixo), termos cosφ/senφ com reatância típica, e limite global de 5% para rede pública de BT (§6.2.7 — antes 7%).
- **Fatores de correção**: Ft da Tab. 40 por isolação (XLPE tem tabela própria — antes usava a de PVC) com escolha conservadora entre linhas; Fg da Tab. 42 completa até ≥20 circuitos (9–11→0,50; 12–15→0,45; 16–19→0,41; ≥20→0,38 — antes truncava em 0,48).
- **BOM**: polaridade do disjuntor segue a fiação (mono/bi/tripolar), Icn segue a Icc calculada, DR comercial ≥ In e DPS conforme o QDF.
- QA in-app ampliada para 28 verificações (menor-In, Tab. 40/42, demanda do QDF, pipeline de validação).

## v3.1 — 2026-07-05

Correção técnica de dimensionamento, solicitada e validada contra o Guia de Dimensionamento de Cabos para Baixa Tensão (Rev. 9, tabelas da NBR 5410).

### Fixed
- **Tabela de ampacidade corrigida**: os valores internos não correspondiam à Tabela 36 da NBR 5410 (a coluna "B1" continha na prática os valores de A1, "B2" os de A2 etc.), superdimensionando cabos. Agora o motor usa as Tabelas 36 (PVC 70°C) e 37 (EPR/XLPE 90°C) oficiais, por método de instalação (B1/B2/C/D/E) e por **número de condutores carregados** (2 para mono/bifásico, 3 para trifásico). O multiplicador aproximado de 1,15 para XLPE foi substituído pela tabela real.

### Changed
- **Disjuntor coordenado ao condutor adotado (NBR 5410 §5.3.4)**: o In deixa de ser o menor valor ≥ Ib e passa a ser o **maior In padrão com Ib ≤ In ≤ Izc** — o dispositivo protege o cabo pela capacidade máxima que ele suporta. Se nenhum In padrão couber no intervalo, a seção é aumentada até o menor In ≥ Ib caber sob o novo Izc. Exemplos no projeto-tipo (Fg=0,7): chuveiro 5500W → 6mm² + 25A (antes 10mm² + 25A); micro-ondas → 2,5mm² + 16A (antes 4mm² + 16A); iluminação → 1,5mm² + 10A.
- Disjuntor geral do QDF coordenado com o alimentador pelo mesmo critério.
- A regra de queda de tensão (≤4% terminal, §6.2.7.2) é preservada e continua podendo aumentar a seção; a proteção é então recoordenada ao condutor final adotado.
- **Memorial de cálculo ampliado**: estimativa de consumo mensal (kWh/mês por horas de uso típicas), condutor adotado com Iz/Izc e tabela de origem, e o critério de coordenação do disjuntor explícito.
- QA suite ampliada para 22 testes (valores da Tab.36, 2×3 condutores carregados, coordenação In×condutor e par chuveiro 6mm²+25A).

## v3.0 — 2026-07-05

Evolução de produto sobre a base v2.2 (motor NBR 5410:2023 validado — nenhum cálculo alterado).

### Added
- Sistema de design: tokens de tipografia (`--fs-*`) e espaçamento em grade de 4px (`--sp-*`), anel de foco global (`:focus-visible`), suporte a `prefers-reduced-motion` e numerais tabulares em dados de engenharia.
- QDF interativo: hover em um circuito ilumina o(s) barramento(s) de sua(s) fase(s) e esmaece os demais; clique no barramento ativa modo foco persistente por fase.
- Score de equilíbrio de fases (0–100) com classificação qualitativa (Excelente/Bom/Aceitável/Crítico) e gauge animado.
- BOM estilo ERP: agrupamento por categoria de engenharia (Quadro, Disjuntores, DR/IDR, DPS, Condutores, Infraestrutura), busca em tempo real e contadores.
- Memorial de cálculo com seções colapsáveis por circuito, selos de conformidade e controles expandir/recolher tudo.
- Acessibilidade: padrão WAI-ARIA de abas com navegação por setas/Home/End, skip link, `aria-label` em botões de ícone.

### Changed
- Layout do app rebalanceado para ~25% sidebar / 75% workspace de engenharia (estilo CAD), canvas alargado para 1560px.
- Cabeçalho do app virou barra de comandos com grupos e separadores; abas fixas (sticky) sob a navegação.
- Painel de balanceamento oculto em instalações monofásicas (aviso de desequilíbrio 100% era ruído); Fase C oculta em bifásico.
- Toasts não interceptam mais o ponteiro.
- Branding atualizado para v3.0; contagem da QA suite corrigida para 18 testes.

### Fixed
- Hash SRI do SheetJS estava copiado do Font Awesome — o export XLSX nunca carregava em produção; hash correto calculado do pacote npm 0.18.5.
- Hash SRI do jsPDF truncado/inválido (86 caracteres); recalculado do pacote npm 2.5.1.
- Teste QA `[AUTO]` desestruturava campo `tugVA` removido da API (`tugVA127`/`tugVA220`); teste `[DevOps]` exigia XLSX pré-carregado, impossível com lazy-load. QA: 18/18.

## v0.5 — 2026-05-08

### Added
- Diagrama visual de QDF com módulos DIN lógicos: DG, DPS, DR, disjuntores e reserva.
- Balanceamento trifásico estimado por fases A/B/C.
- Alocação automática de circuitos 1F/2F nas fases com menor diferença de corrente.
- Coluna de fases no resultado por circuito.
- Catálogo curado inicial para monetização: proteção, cabos e infraestrutura.
- Documento de análise do repositório remoto e status de atualização.
- Smoke tests documentados para motor elétrico.

### Changed
- Versão do app atualizada para EasyEletric SaaS v0.5.
- LocalStorage atualizado para `easyeletric-project-v05`, mantendo fallback para v0.4 e v0.3.
- Tracking local de clique afiliado atualizado para `easyeletric-clicks-v05`.
- Exportação CSV atualizada para `easyeletric-materiais-v0-5.csv`.

### Production Notes
- O repositório público e a página publicada foram auditados e ainda apontavam para v0.3 no momento da análise.
- Este pacote v0.5 deve substituir `index.html` e adicionar `releases/dimensionador_eletrico_saas_v0_5.html`.

# Changelog

## v0.4 — Produção inicial

- Adicionado GitHub Pages workflow.
- Adicionadas landing pages SEO/tráfego pago.
- Adicionados robots.txt, sitemap.xml, manifest.json e 404.html.
- Adicionada aba Produção & SEO.
- Atualizadas metatags SEO/Open Graph.
- Atualizado AffiliateEngine para v0.4.
- Adicionado tracking local de clique afiliado sem envio remoto.
- Atualizado armazenamento local para v0.4 com fallback v0.3.

## v0.3 — Materiais e afiliados

- Kits comerciais.
- Estrutura Git-ready.
- Links afiliados configuráveis.

## v0.2 — Refatoração SaaS

- Motor trifásico corrigido.
- QDF e lista expandida de materiais.
