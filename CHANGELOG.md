# Changelog

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
