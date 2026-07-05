# EasyEletric SaaS

Plataforma profissional de pré-dimensionamento elétrico residencial conforme **ABNT NBR 5410:2023** — dimensionamento automático por cômodos, QDF unifilar interativo, balanceamento trifásico, lista de materiais estilo ERP, memorial de cálculo e exportações XLSX/PDF/SVG.

## Versão atual

**v3.2** — Motor de cálculo redesenhado (`scripts/nbr5410_engine.js`): pipeline normativo **condutor antes do disjuntor** (Ib → método → Ft×Fg → Izc → menor seção que atende tudo → menor In com Ib ≤ In ≤ Izc), QDF por **demanda diversificada** (fatores progressivos de iluminação+TUG, aquecimento por nº de aparelhos, correntes por fase), curto-circuito com verificação de capacidade de interrupção, pipeline de validação PASS/WARN/ERROR e memorial com auditoria completa de cada decisão. Metodologia em `docs/metodologia_calculo_nbr5410.md`.

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
- **QA Suite** — 28 verificações in-app no Dev Panel (`Ctrl+Shift+D`) + suíte de 55 testes do motor executável em Node: `node scripts/test_nbr5410_engine.js`.
- **Offline-first** — 100% estático, sem backend; projetos salvos como `.json` local.

## Estrutura

- `index.html`: aplicação principal (single-file: HTML + CSS + JS).
- `pages/`: landing pages para SEO/tráfego pago.
- `releases/`: histórico dos HTMLs por versão.
- `docs/`: histórico, decisões de design e planos.
- `scripts/`: motor de cálculo (`nbr5410_engine.js`), suíte de testes (`test_nbr5410_engine.js`) e scripts de deploy local.
- `.github/workflows/`: workflow GitHub Pages.

## Engenharia — regra de ouro

Os cálculos elétricos vivem no motor `scripts/nbr5410_engine.js` (sem DOM, testável em Node) — fórmulas, tabelas normativas, fatores de correção, demanda e validação. Mudanças de UI nunca devem alterar essas rotinas; toda alteração de engenharia deve passar por `node scripts/test_nbr5410_engine.js`. Metodologia completa, fórmulas e premissas: `docs/metodologia_calculo_nbr5410.md`; decisões de design: `docs/design_decisions_v3.md`.

## Segurança

Não commitar PAT, chaves, tokens ou credenciais. Use variável de ambiente `GITHUB_TOKEN`, GitHub CLI ou secret do GitHub Actions. Scripts de CDN usam SRI (Subresource Integrity).

## Disclaimer técnico

Esta aplicação é uma ferramenta de apoio para pré-dimensionamento. Não substitui projeto elétrico, ART/RRT, consulta à ABNT NBR 5410 oficial, padrão da concessionária e catálogos dos fabricantes.
