# Histórico + Próximos Passos — EasyEletric SaaS

Data: 2026-05-08  
Versão: v0.4 — Produção inicial, GitHub Pages, SEO e funis de tráfego

---

## 1. Objetivo da fase

Executar o step 4 do roadmap: preparar o produto para produção inicial, mantendo a premissa de SaaS leve, sem login, sem banco de dados e sem coleta de dados pessoais no MVP.

---

## 2. O que foi implementado

### Produção estática

- Adicionado workflow `.github/workflows/pages.yml` para publicação via GitHub Pages.
- Mantido `index.html` como arquivo principal.
- Adicionados `robots.txt`, `sitemap.xml`, `manifest.json`, `404.html` e `.nojekyll`.
- Atualizada marca para EasyEletric SaaS v0.4.
- Atualizadas metatags SEO, Open Graph e Twitter Card.

### SEO e tráfego pago

Criadas landing pages estáticas:

- `pages/cabo-chuveiro.html`
- `pages/qdf-residencial.html`
- `pages/dr-dps-residencial.html`
- `pages/disjuntor-residencial.html`
- `pages/circuito-trifasico.html`
- `pages/lista-materiais-eletrica.html`

Cada página tem CTA para o dimensionador principal e UTM de campanha.

### Produto

- Nova aba `Produção & SEO` no app principal.
- Checklist visual de deploy, SEO e monetização.
- Links internos para as páginas comerciais.
- Affiliate click tracking local no navegador, sem envio remoto de dados.
- Persistência local atualizada para `easyeletric-project-v04`, com fallback para v0.3.

---

## 3. Segurança e privacidade

- Nenhum token foi salvo.
- Nenhum PAT deve ser commitado.
- Nenhuma credencial foi incluída no pacote.
- O tracking de cliques é local via `localStorage`, sem PII e sem backend.
- Se analytics externo for adicionado futuramente, deve ser configurado sem coleta de dados pessoais.

---

## 4. Deploy recomendado

### Opção A — GitHub Pages por workflow

1. Commitar os arquivos da v0.4.
2. Ir em Settings > Pages.
3. Selecionar Source = GitHub Actions.
4. Executar push na branch `main`.
5. Validar a Action `Deploy static site to GitHub Pages`.

### Opção B — Publicação simples por branch

1. Usar branch `main`.
2. Configurar Pages para publicar a partir de `/root`.
3. Como o app é estático, o `index.html` será servido diretamente.

---

## 5. Próximos passos v0.5

- Criar layout visual do QDF em diagrama.
- Implementar balanceamento trifásico fase A/B/C.
- Criar exportação PDF profissional com logo.
- Criar testes automatizados básicos de cálculo.
- Criar catálogo curado de marcas/produtos.
- Definir tags afiliadas reais.
- Adicionar domínio final.
- Criar plano de campanhas pagas por landing page.

---

## 6. Melhorias sugeridas para avaliação

- Trocar nome final se desejado: EasyEletric, EasyEletric Pro, Voltix, Voltix Pro ou EletriCalc.
- Criar uma página apenas para “kit chuveiro”, pois é uma dor de alta intenção de compra.
- Criar landing page específica para “quadro de distribuição completo”, maior ticket médio.
- Adicionar comparativo de marcas recomendadas por categoria.
- Criar disclaimer jurídico/comercial mais completo antes de tráfego pago.
