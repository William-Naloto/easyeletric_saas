# Changelog

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
