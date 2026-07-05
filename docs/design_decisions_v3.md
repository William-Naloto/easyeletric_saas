# Decisões de Design — EasyEletric v3.0

Registro das decisões da evolução v2.2 → v3.0. Público: quem for manter ou evoluir o frontend.

## Princípio inegociável

**O motor de cálculo NBR 5410:2023 é validado e intocável.** Toda mudança de UI acontece em volta dele: renderização, agrupamento e interação podem mudar; `calcIb`, seleção de condutores, queda de tensão, MCB/DR/DPS e as tabelas NBR não. A QA suite (22 testes, `Ctrl+Shift+D` → Rodar QA) deve permanecer 22/22 após qualquer mudança.

## Arquitetura

- **Single-file por design.** `index.html` concentra HTML+CSS+JS. Vantagens no contexto atual (GitHub Pages, offline-first, um release = um arquivo versionado em `releases/`): deploy atômico, zero build, auditável. Dividir em módulos só vale a pena se o arquivo passar de ~5k linhas ou ganhar um segundo mantenedor.
- **Sem dependências novas.** As únicas libs externas (SheetJS, jsPDF) são lazy-loaded sob demanda com SRI. Font Awesome e Inter/Roboto Mono via CDN com preconnect.

## Sistema de design

- Tokens em `:root`: cores semânticas (`--ok/--wn/--er/--inf`), fases (`--ph-a/b/c`), tipografia (`--fs-*`), espaçamento em grade de 4px (`--sp-*`), raios (`--r/--rm/--rl/--rxl`).
- Dark mode é o padrão; light mode via `[data-theme="light"]` sobrescrevendo os mesmos tokens — nunca cores hardcoded em componentes novos.
- Números de engenharia usam `font-variant-numeric: tabular-nums` para alinhamento estável em tabelas.
- Foco de teclado: anel global via `:focus-visible` (nunca `outline:none` sem substituto).
- Animações respeitam `prefers-reduced-motion`.

## Layout (workspace-first)

- Grade do app: `minmax(310px, 25%) 1fr` — o workspace de resultados é o protagonista, como em CAD/EDA.
- A barra de abas é sticky sob a navegação. Atenção: `position:sticky` quebra silenciosamente se um ancestral tiver `overflow` definido — foi exatamente o bug corrigido no `.app-right`.
- Toolbar de comandos usa `.btn-tb` + `.toolbar-sep`; não recriar botões com estilos inline.

## Interações do QDF

- Estado de highlight vive em atributos do container (`#qdfBoard[data-hl]`, `[data-focus]`) e o CSS deriva a apresentação — os handlers são delegados e sobrevivem a re-render via `innerHTML`.
- Cada linha de circuito expõe `data-phases="A B"`; barramentos expõem `data-phase`. Qualquer recurso novo de highlight deve seguir esse padrão declarativo.

## Acessibilidade

- Abas seguem o padrão WAI-ARIA Tabs (roving tabindex, setas/Home/End). `showTab()` é a única fonte de verdade do estado selecionado — não alternar classes manualmente.
- Botões só-ícone precisam de `aria-label`; ícones decorativos, de `aria-hidden="true"`.

## Armadilhas conhecidas

- **SRI**: ao atualizar versão de lib CDN, recalcular o hash a partir do pacote npm (`openssl dgst -sha512 -binary dist/arquivo.js | openssl base64 -A`). Duas versões já quebraram por hash copiado/truncado.
- **LocalStorage**: chaves de projeto mantêm compatibilidade retroativa (v2.1+); não renomear sem migração.
- **Balanceamento**: o painel de fases só aparece para alimentação bi/trifásica — monofásico não tem o que balancear.
