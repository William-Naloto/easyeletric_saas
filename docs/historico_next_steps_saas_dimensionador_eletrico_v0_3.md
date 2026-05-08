# Histórico + Próximos Passos — EasyEletric SaaS

Data: 2026-05-08  
Versão: v0.3 — Materiais, afiliados, kits comerciais e Git deploy

---

## 1. Decisões desta fase

A fase 3 foi direcionada para monetização e controle de versão no GitHub.

Decisões tomadas:

- Repositório alvo: `William-Naloto/easyeletric_saas`.
- Arquivo principal de produção: `index.html`.
- Produto continua sem login e sem coleta de dados pessoais no MVP.
- Deploy inicial recomendado: GitHub Pages por branch ou Vercel/Netlify conectado ao repositório.
- Não armazenar PAT ou credenciais no código.
- Todo deploy deve ser feito via autenticação local segura ou variável de ambiente.

---

## 2. O que foi implementado na v0.3

### Produto

- Branding de trabalho atualizado para EasyEletric SaaS.
- Mantido motor técnico da v0.2.
- Adicionada aba `Kits comerciais`.
- Adicionado campo de campanha/UTM padrão.
- Atualizado disclaimer de frontend estático e links afiliados.

### Monetização

Criados kits comerciais automáticos:

- Kit QDF completo residencial.
- Kit proteção DR + DPS.
- Kit infraestrutura elétrica.
- Kit cabos por seção e cor.
- Kit circuito de chuveiro, quando existir chuveiro no projeto.
- Kit tomadas cozinha/área molhada, quando existir circuito molhado.
- Kit iluminação residencial, quando existir iluminação.

### Deploy/Git

Criada estrutura Git-ready:

- `index.html`
- `README.md`
- `CHANGELOG.md`
- `.nojekyll`
- `.gitignore`
- `docs/historico_next_steps_saas_dimensionador_eletrico_v0_3.md`
- `docs/deploy_git_repository.md`
- `scripts/deploy_local.sh`
- `scripts/deploy_local.ps1`

---

## 3. Observação crítica sobre PAT

Um PAT foi compartilhado no chat. Como boa prática de segurança, ele deve ser revogado e substituído por um novo token.

Permissões recomendadas para push básico:

- Repository access: somente `William-Naloto/easyeletric_saas`.
- Metadata: read-only.
- Contents: read and write.

Permissões opcionais:

- Pages: read/write, se for configurar Pages via API.
- Workflows: read/write, somente se futuramente adicionarmos `.github/workflows`.

---

## 4. Próximos passos

### v0.4 — Produção inicial

- Criar branch `main` no repositório com esta estrutura.
- Publicar GitHub Pages ou conectar Vercel.
- Definir domínio/nome comercial final.
- Validar tags afiliadas reais.
- Criar landing pages SEO.
- Separar páginas específicas de tráfego pago.

### v0.5 — Produto comercial

- Criar catálogo curado de marcas/produtos.
- Ranking real por marketplace via API/backend.
- Páginas: Chuveiro, QDF, DR/DPS, Cabo, Disjuntor.
- Analytics sem PII para medir cliques em kits e materiais.

---

## 5. Pendências técnicas

- Validar tabelas normativas contra fonte licenciada.
- Validar cálculo de eletrodutos por taxa de ocupação em cenários avançados.
- Criar visual do QDF em diagrama.
- Implementar balanceamento trifásico fase A/B/C.
- Criar exportação PDF profissional com logo.
- Implementar testes automatizados básicos.
