# EasyEletric SaaS

Plataforma profissional de pré-dimensionamento elétrico residencial conforme **ABNT NBR 5410:2023** — dimensionamento automático por cômodos, QDF unifilar interativo, balanceamento trifásico, lista de materiais estilo ERP, memorial de cálculo e exportações XLSX/PDF/SVG.

## Versão atual

**v3.1** — Correção de dimensionamento (Tab.36/37 oficiais + disjuntor coordenado ao condutor) sobre a evolução v3.0: workspace de engenharia como protagonista, sistema de design com tokens, QDF interativo com foco por fase, score de equilíbrio de fases, BOM agrupada com busca, memorial colapsável e acessibilidade WCAG (teclado + ARIA).

## Publicação

Site publicado via GitHub Pages:

    https://william-naloto.github.io/easyeletric_saas/

## Como executar localmente

Abra `index.html` no navegador, ou rode um servidor estático local:

    python -m http.server 8080

Depois acesse `http://localhost:8080`.

## Recursos principais

- **Modo Automático por Cômodos** — informe ambientes e áreas; os circuitos de TUG e iluminação são gerados conforme NBR 5410 §9.
- **Modo Manual** — cargas e circuitos definidos individualmente.
- **QDF Unifilar interativo** — quadro no estilo QGBT com barramento trifásico; hover em um circuito ilumina suas fases, clique no barramento foca uma fase.
- **Balanceamento de fases** — score de equilíbrio 0–100 com recomendação e redistribuição automática em um clique.
- **Lista de Materiais (BOM)** — agrupada por categoria de engenharia, com busca em tempo real e links de afiliados fechados (sem fallback de busca).
- **Memorial de Cálculo** — seções colapsáveis por circuito com selo de conformidade, fórmulas e referências de norma.
- **Exportações** — XLSX (3 abas), PDF e diagrama unifilar SVG vetorial.
- **QA Suite** — 22 testes de fórmulas elétricas e comportamento executáveis no Dev Panel (`Ctrl+Shift+D`).
- **Offline-first** — 100% estático, sem backend; projetos salvos como `.json` local.

## Estrutura

- `index.html`: aplicação principal (single-file: HTML + CSS + JS).
- `pages/`: landing pages para SEO/tráfego pago.
- `releases/`: histórico dos HTMLs por versão.
- `docs/`: histórico, decisões de design e planos.
- `scripts/`: scripts de deploy local.
- `.github/workflows/`: workflow GitHub Pages.

## Engenharia — regra de ouro

Os cálculos elétricos (fórmulas NBR 5410, tabelas de ampacidade, queda de tensão, seleção de MCB/DR/DPS) são considerados **validados**. Mudanças de UI nunca devem alterar essas rotinas; ver `docs/design_decisions_v3.md`.

## Segurança

Não commitar PAT, chaves, tokens ou credenciais. Use variável de ambiente `GITHUB_TOKEN`, GitHub CLI ou secret do GitHub Actions. Scripts de CDN usam SRI (Subresource Integrity).

## Disclaimer técnico

Esta aplicação é uma ferramenta de apoio para pré-dimensionamento. Não substitui projeto elétrico, ART/RRT, consulta à ABNT NBR 5410 oficial, padrão da concessionária e catálogos dos fabricantes.
