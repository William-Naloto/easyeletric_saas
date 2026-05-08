# EasyEletric SaaS

Frontend estático para pré-dimensionamento elétrico residencial com lista de materiais, QDF, DR/IDR, DDR, DPS e links de compra/afiliados.

## Versão atual

v0.3 — Materiais, kits comerciais, AffiliateEngine e preparação para deploy GitHub.

## Como executar localmente

Abra `index.html` no navegador.

Opcionalmente, rode um servidor estático local:

```bash
python -m http.server 8080
```

Depois acesse:

```text
http://localhost:8080
```

## Deploy recomendado

### Opção 1 — GitHub Pages por branch

1. Faça push do conteúdo deste repositório para `main`.
2. No GitHub, vá em `Settings > Pages`.
3. Selecione `Deploy from a branch`.
4. Escolha `main` e pasta `/root`.
5. Salve.

### Opção 2 — Vercel ou Netlify

1. Conecte o repositório `William-Naloto/easyeletric_saas`.
2. Configure como site estático.
3. Build command: vazio.
4. Output directory: `/`.

## Segurança

Não commitar PAT, chaves, tokens ou credenciais. Use variáveis de ambiente ou autenticação interativa do GitHub CLI.

## Disclaimer técnico

Esta aplicação é uma ferramenta de apoio para pré-dimensionamento. Não substitui projeto elétrico, ART/RRT, consulta à ABNT NBR 5410 oficial, padrão da concessionária e catálogos dos fabricantes.
