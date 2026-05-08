# Changelog

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
