# EasyEletric SaaS

Frontend estático para pré-dimensionamento elétrico residencial com lista de materiais, QDF, DR/IDR, DDR, DPS, balanceamento trifásico e links de compra/afiliados.

## Versão atual

v0.5 — QDF visual, balanceamento A/B/C, catálogo curado, smoke tests e melhoria da rastreabilidade de produção.

## Publicação

Site publicado via GitHub Pages:

    https://william-naloto.github.io/easyeletric_saas/

## Como executar localmente

Abra `index.html` no navegador.

Opcionalmente, rode um servidor estático local:

    python -m http.server 8080

Depois acesse:

    http://localhost:8080

## Estrutura

- `index.html`: aplicação principal.
- `pages/`: landing pages para SEO/tráfego pago.
- `releases/`: histórico dos HTMLs por versão.
- `docs/`: histórico, rastreabilidade e planos.
- `scripts/`: scripts de deploy local.
- `.github/workflows/pages.yml`: workflow GitHub Pages.

## Segurança

Não commitar PAT, chaves, tokens ou credenciais. Use variável de ambiente `GITHUB_TOKEN`, GitHub CLI ou secret do GitHub Actions.

## Disclaimer técnico

Esta aplicação é uma ferramenta de apoio para pré-dimensionamento. Não substitui projeto elétrico, ART/RRT, consulta à ABNT NBR 5410 oficial, padrão da concessionária e catálogos dos fabricantes.
