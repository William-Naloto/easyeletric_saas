# EasyEletric SaaS

Plataforma profissional de pré-dimensionamento elétrico residencial conforme **ABNT NBR 5410:2023** — gêmeo digital da instalação, Smart Distribution Board, unifilar interativo estilo CAD, dimensionamento automático por cômodos, balanceamento trifásico, lista de materiais estilo ERP, memorial de cálculo e exportações XLSX/PDF/SVG/PNG.

## Versão atual

**v3.6 — Engineering Workspace (roadmap concluído)** — o Smart Distribution Board ganha **catálogo de fabricantes** (WEG/Schneider/Siemens/ABB — referências ilustrativas escolhidas pela Icn requerida, `scripts/engineering/manufacturer_catalog.js`), **mapa do quadro imprimível** (panel schedule, `scripts/engineering/panel_schedule.js`), **exportação DXF R12 para CAD** (`scripts/engineering/dxf_export.js`), mini-mapa com navegação, grade alternável e sugestões de seção de cabo quantificadas (próxima seção comercial + ΔV estimada).

**v3.5 — Smart Distribution Board** — o QDF se torna o recurso-assinatura da plataforma: um **painel elétrico realista e interativo** (`scripts/engineering/qdf_twin.js`) renderizado do gêmeo digital — gabinete, barramentos de cobre com utilização/reserva, disjuntores em trilhos DIN, DPS/DR, barras de N/PE — com **Engineering Health Score** e recomendações de otimização auditáveis (`scripts/engineering/panel_health.js`), inspetor de engenharia por componente e exportações SVG/PNG/PDF. Arquitetura em `docs/smart_distribution_board_v3_5.md`.

**v3.4 — Electrical Digital Twin** — a instalação é modelada como um **gêmeo digital**: o `ElectricalProjectModel` (`scripts/engineering/project_model.js`) é a fonte única de verdade — um grafo de objetos de engenharia (rede → medidor → alimentador → disjuntor geral → DPS → DR geral → barramentos → disjuntores → condutores → cargas), cada um com dados, cálculos, validação e registro de decisões. O **unifilar interativo** (`scripts/engineering/unifilar_twin.js` + workspace no app) consome esse modelo: zoom/pan, hover que ilumina a cadeia de proteção completa, overlays de engenharia (corrente, ΔV, Icc, validação), Explorador de Engenharia por componente e exportação SVG/PDF com carimbo técnico. Arquitetura em `docs/digital_twin_v3_4.md`.

Motor de cálculo (`scripts/nbr5410_engine.js`): pipeline normativo **condutor antes do disjuntor** (Ib → método → Ft×Fg → Izc → menor seção que atende tudo → menor In com Ib ≤ In ≤ Izc), QDF por **demanda diversificada**, curto-circuito com verificação de capacidade de interrupção e validação PASS/WARN/ERROR. Metodologia em `docs/metodologia_calculo_nbr5410.md`.

## Publicação

Site publicado via GitHub Pages:

    https://william-naloto.github.io/easyeletric_saas/

## Como executar localmente

Abra `index.html` no navegador, ou rode um servidor estático local:

    python -m http.server 8080

Depois acesse `http://localhost:8080`.

## Recursos principais

- **Gêmeo Digital Elétrico** — todo o projeto vive em um modelo canônico (`ElectricalProjectModel`); unifilar, QDF, memorial e relatórios consomem os MESMOS objetos de engenharia.
- **Unifilar interativo estilo CAD** — símbolos IEC/NBR vetoriais, barramentos coloridos por fase, zoom/pan/ajustar, hover ilumina a cadeia de proteção da rede até a carga, clique abre o Explorador de Engenharia (propriedades, cálculos, validação NBR 5410 e decisões com alternativas rejeitadas), overlays de corrente/ΔV/Icc/validação e temas dark/light/impressão.
- **Modo Automático por Cômodos** — informe ambientes e áreas; os circuitos de TUG e iluminação são gerados conforme NBR 5410 §9.
- **Modo Manual** — cargas e circuitos definidos individualmente.
- **Smart Distribution Board** — o QDF como painel elétrico realista: barramentos de cobre com corrente/utilização/reserva, disjuntores em trilhos DIN (módulos = polos), DPS/DR geral, barras de N/PE; zoom/pan, hover ilumina a cadeia de proteção, clique abre o Inspetor de Engenharia; **Engineering Health** (score 0–100, proteção, queda, aterramento, equilíbrio, demanda, DR/DPS, capacidade futura, ΔV global) e **Otimizar Painel** com recomendações auditáveis aplicáveis em um clique.
- **Balanceamento de fases** — score de equilíbrio 0–100 com recomendação e redistribuição automática em um clique.
- **Lista de Materiais (BOM)** — agrupada por categoria de engenharia, com busca em tempo real e links de afiliados fechados (sem fallback de busca).
- **Memorial de Cálculo** — seções colapsáveis por circuito com selo de conformidade, fórmulas e referências de norma.
- **Exportações** — XLSX (3 abas), PDF, unifilar SVG vetorial e quadro em SVG/PNG alta resolução/PDF com carimbo técnico, **mapa do quadro (panel schedule) imprimível** e **DXF R12** para AutoCAD/QCAD/LibreCAD.
- **Catálogo de fabricantes** — referências comerciais ilustrativas (WEG, Schneider, Siemens, ABB) para disjuntores/DR/DPS, com a série escolhida pela capacidade de interrupção requerida.
- **QA Suite** — 28 verificações in-app no Dev Panel (`Ctrl+Shift+D`) + 13 suítes Node (286 casos: motor, balanceamento, DR, DPS, aterramento, decisões, gêmeo digital, unifilar, saúde do quadro, Smart Distribution Board, catálogo, panel schedule e DXF): `node scripts/test_all.js`.
- **Offline-first** — 100% estático, sem backend; projetos salvos como `.json` local.

## Estrutura

- `index.html`: aplicação principal (single-file: HTML + CSS + JS).
- `pages/`: landing pages para SEO/tráfego pago.
- `releases/`: histórico dos HTMLs por versão.
- `docs/`: histórico, decisões de design e planos.
- `scripts/`: motor de cálculo (`nbr5410_engine.js`), módulos de engenharia (`engineering/` — gêmeo digital, unifilar, balanceamento, DR, DPS, aterramento, decisões), runner de testes (`test_all.js`) e scripts de deploy local.
- `.github/workflows/`: workflow GitHub Pages.

## Engenharia — regra de ouro

Os cálculos elétricos vivem no motor `scripts/nbr5410_engine.js` (sem DOM, testável em Node) — fórmulas, tabelas normativas, fatores de correção, demanda e validação. Mudanças de UI nunca devem alterar essas rotinas; toda alteração de engenharia deve passar por `node scripts/test_nbr5410_engine.js`. Metodologia completa, fórmulas e premissas: `docs/metodologia_calculo_nbr5410.md`; decisões de design: `docs/design_decisions_v3.md`.

## Segurança

Não commitar PAT, chaves, tokens ou credenciais. Use variável de ambiente `GITHUB_TOKEN`, GitHub CLI ou secret do GitHub Actions. Scripts de CDN usam SRI (Subresource Integrity).

## Disclaimer técnico

Esta aplicação é uma ferramenta de apoio para pré-dimensionamento. Não substitui projeto elétrico, ART/RRT, consulta à ABNT NBR 5410 oficial, padrão da concessionária e catálogos dos fabricantes.
