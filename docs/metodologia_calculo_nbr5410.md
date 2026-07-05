# Metodologia de Cálculo — Motor NBR 5410 (v3.2)

Documento de engenharia do motor de dimensionamento
(`scripts/nbr5410_engine.js`). Todo cálculo é **determinístico,
documentado e auditável**: mesma entrada ⇒ mesma saída, com trilha de
decisão (seções reprovadas, disjuntores candidatos, verificações
PASS/WARN/ERROR) exposta no memorial.

Referências normativas:

- **ABNT NBR 5410:2023** — Instalações elétricas de baixa tensão
  (Tabelas 36, 37, 40, 42, 47, 58; §5.3.4, §5.1.3.2.2, §5.3.5.4, §6.2.7)
- **IEC 60364-5-52** — capacidade de condução e fatores de correção
- **IEC 60898-1 / NBR NM 60898** — disjuntores (curvas B/C, Icn, I₂=1,45·In)
- **IEC 61008-1** — DR/IDR; **IEC 61643-11** — DPS
- Fatores de demanda residenciais: prática consagrada de concessionárias
  brasileiras (ex.: CEMIG ND-5.1, CPFL GED) e literatura
  (H. Creder, *Instalações Elétricas*)

---

## 1. Sequência de dimensionamento (condutor ANTES do disjuntor)

```
Carga
  → Corrente de projeto (Ib)
  → Método de instalação (B1/B2/C/D/E)
  → Fatores de correção (Ft × Fg)
  → Capacidade corrigida do cabo (Izc = Iz·Ft·Fg)
  → Seção mínima (Tab. 47) + ampacidade + queda de tensão
    ⇒ MENOR condutor que atende TODOS os critérios
  → Disjuntor (MCB): MENOR In comercial com Ib ≤ In ≤ Izc
  → Verificação de curto-circuito (Icn, adiabática, disparo magnético)
  → Verificação de queda de tensão
  → DR (§5.1.3.2.2) e DPS (IEC 61643-11)
  → Validação final (PASS / WARN / ERROR)
```

O disjuntor **nunca** é escolhido a partir da carga isolada: ele
protege o condutor adotado, portanto é selecionado **depois** do cabo.

## 2. Corrente de projeto (Ib)

| Sistema | Fórmula |
|---|---|
| Monofásico (F+N) | Ib = P / (V_fn · cos φ) |
| Bifásico (F+F)   | Ib = P / (V_ll · cos φ) |
| Trifásico (3F)   | Ib = P / (√3 · V_ll · cos φ) |

## 3. Fatores de correção

- **Temperatura (Ft)** — Tabela 40, **por isolação** (PVC ≠ EPR/XLPE).
  Entre linhas tabeladas usa-se a linha de temperatura imediatamente
  superior (escolha conservadora): 32 °C → fator de 35 °C.
- **Agrupamento (Fg)** — Tabela 42 completa: 1→1,00; 2→0,80; 3→0,70;
  4→0,65; 5→0,60; 6→0,57; 7→0,54; 8→0,52; 9–11→0,50; 12–15→0,45;
  16–19→0,41; ≥20→0,38.

## 4. Condutor

A menor seção comercial que satisfaz **simultaneamente**:

1. **Seção mínima** — Tab. 47: iluminação 1,5 mm²; força (TUG/TUE) 2,5 mm²;
2. **Ampacidade** — Izc = Iz(Tab. 36/37, método, nº condutores
   carregados) × Ft × Fg ≥ Ib;
3. **Queda de tensão** — ΔV ≤ limite do circuito (padrão 4%).

O motor registra cada seção reprovada e o motivo (`steps`), e informa o
critério que governou a escolha (`governedBy`). Condutores
superdimensionados só ocorrem quando um critério os exige.

**PE** — Tabela 58: S ≤ 16 → S; 16 < S ≤ 35 → 16; S > 35 → S/2.
**Neutro** — igual à fase (instalação residencial).

## 5. Queda de tensão

```
mono/bi:   ΔV = 2  · L · Ib · (r·cosφ + x·senφ)
trifásico: ΔV = √3 · L · Ib · (r·cosφ + x·senφ)
```

- r = ρ(T_op)/S, com resistividade do cobre avaliada na **temperatura
  de operação** do condutor (pior caso): ρ = 0,017241·(1+0,00393·(T−20))
  ⇒ PVC 70 °C: **0,02063 Ω·mm²/m**; EPR/XLPE 90 °C: **0,02198 Ω·mm²/m**.
- x = 0,0001 Ω/m (reatância típica de cabos BT em eletroduto;
  desprezível em seções pequenas, incluída por rigor).
- Percentual sobre a tensão nominal do circuito (V_fn ou V_ll).

**Limites (§6.2.7)**: 4% por circuito terminal (padrão configurável);
**5% global** quando alimentado pela rede pública de BT (7% para
transformador próprio). O QDF verifica alimentador + pior circuito.

## 6. Proteção (MCB) — coordenação §5.3.4

Somente correntes nominais comerciais:
6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125 A.

Seleciona-se o **MENOR In** com **Ib ≤ In ≤ Izc**. Nunca In > Izc.
Se nenhum In comercial couber na janela [Ib, Izc], a seção do condutor
é elevada até um In caber. O critério I₂ ≤ 1,45·Iz é automaticamente
atendido por disjuntores IEC 60898 (I₂ = 1,45·In ≤ 1,45·Izc).

Curvas: **B** para cargas resistivas/iluminação/tomadas; **C** para
motores e climatização (corrente de partida).

O memorial exibe a auditoria completa dos candidatos
(ex.: `20A ❌ In<Ib · 25A ✅ · 32A ❌ excede Izc`).

## 7. Curto-circuito

Método da impedância (só resistência — conservador em BT residencial):

```
Z_origem   = V_fn / Ik_origem          (Ik presumida na entrada: 6 kA padrão)
Z_alim     = 2·ρ·L_alim / S_alim       (laço F-N do alimentador)
Icc_quadro = V_fn / (Z_origem + Z_alim)
Icc_fim    = V_circ / (Z_quadro + 2·ρ·L/S)
```

Premissa: neutro com a mesma seção da fase ⇒ laço F-F ≈ laço F-N.

Verificações:
- **Capacidade de interrupção**: menor Icn padronizado
  (3 / 4,5 / 6 / 10 kA) ≥ Icc no ponto de instalação; acima de 10 kA
  sinaliza necessidade de disjuntor industrial (ERROR).
- **Adiabática (§5.3.5.4)**: S ≥ Icc·√t / k, com t = 0,01 s (disparo
  magnético) e k = 115 (PVC) / 143 (XLPE).
- **Disparo magnético**: Icc no fim do circuito ≥ 5·In (curva B) ou
  10·In (curva C); caso contrário WARN (atuação térmica/DR).

## 8. DR e DPS

- **DR 30 mA** (§5.1.3.2.2) para tomadas, áreas molhadas, chuveiros e
  circuitos externos; iluminação fixa pode ser coberta por DR geral
  (300 mA, proteção contra incêndio). DR comercial ≥ In do disjuntor.
- **DPS Classe II** (IEC 61643-11): In 20 kA, Imax 40 kA,
  Uc ≥ 275 V (sistema 127/220) ou ≥ 440 V (220/380);
  2P (mono), 3P (bi), 4P (tri).

## 9. QDF — demanda diversificada e disjuntor geral

O disjuntor geral **não é a soma dos disjuntores parciais** nem um
fator arbitrário. Sequência:

1. **Demanda por categoria**:
   - *Iluminação + TUG*: fatores **progressivos** por faixa de kW
     (0–1: 0,86; 1–2: 0,75; 2–3: 0,66; 3–4: 0,59; 4–5: 0,52; 5–6: 0,45;
     6–7: 0,40; 7–8: 0,35; 8–9: 0,31; 9–10: 0,27; >10: 0,24);
   - *Aquecimento* (chuveiros/torneiras/aquecedores): fator pelo
     **número de aparelhos** (1→1,00; 2→0,75; 3→0,70; 4→0,66; 5→0,62;
     6→0,59; 7→0,56; 8→0,53; 9→0,51; 10→0,49; …; >15→0,40);
   - *Climatização*: 100% (conservador — todos podem operar juntos);
   - *Motores*: maior a 100%, demais a 70% (premissa documentada).
   - **Salvaguarda**: a demanda nunca é menor que a maior carga
     individual.
2. **Correntes por fase** — soma aritmética conservadora (despreza
   defasagem angular): circuito F+N soma na sua fase; F+F soma a
   corrente **de linha inteira nas duas fases**; 3F soma nas três.
3. **Ib do alimentador = máxima corrente de fase.**
4. **Cabo do alimentador**: dimensionado para Ib×(1+20%) — margem de
   expansão futura aplicada **ao cabo, não ao disjuntor**; método B1,
   comprimento padrão 15 m (parametrizável), seção mínima de entrada
   10 mm² (padrão usual de concessionária), queda ≤ 2%.
5. **Disjuntor geral**: menor In comercial (25…160 A) com
   Ib ≤ In ≤ Izc do alimentador; polaridade conforme o sistema.
6. **DR geral** ≥ In do geral (padrão comercial 25/40/63/80/100/125 A).
7. **Equilíbrio de fases**: desequilíbrio ≤ 10% PASS; ≤ 20% WARN;
   acima ERROR (recomenda balanceamento).

O QDF, o diagrama unifilar SVG e o PDF usam **o mesmo resultado**
(`_qdfResult`) — não há mais três algoritmos divergentes.

## 10. Validação (pipeline PASS/WARN/ERROR)

Por circuito: seção mínima · ampacidade · coordenação Ib≤In≤Izc ·
queda de tensão · capacidade de interrupção · disparo magnético ·
adiabática · DR · viabilidade. No QDF: coordenação do geral · queda do
alimentador · equilíbrio de fases · capacidade de interrupção.

## 11. Testes

```
node scripts/test_nbr5410_engine.js   # 55 casos (Node, sem dependências)
```

Cobrem iluminação, tomadas, TUE, chuveiro, ar-condicionado, trifásico,
alta demanda, QDF, queda de tensão, correções, curto-circuito,
casos-limite e regressões de determinismo. A QA in-app (Dev Panel,
`Ctrl+Shift+D`) roda 28 verificações adicionais no navegador.

## 12. Premissas documentadas (resumo)

| Premissa | Valor | Justificativa |
|---|---|---|
| ρ Cu p/ queda de tensão | na T. de operação (70/90 °C) | pior caso térmico |
| Reatância de cabo | 0,0001 Ω/m | típico BT em eletroduto |
| Icc presumida na entrada | 6 kA | rede secundária urbana típica |
| t de eliminação no curto | 0,01 s | disparo magnético de MCB |
| Margem de expansão do alimentador | +20% (só no cabo) | reserva futura sem superdimensionar proteção |
| Comprimento do alimentador | 15 m | padrão parametrizável |
| Seção mínima de entrada | 10 mm² | padrão usual de concessionária |
| FP médio da demanda agregada | 0,92 | prática de projeto |
| Demanda de climatização | 100% | conservador |
| Motores | 100% maior + 70% demais | simultaneidade residencial |

> Esta aplicação é ferramenta de **pré-dimensionamento**. Não substitui
> projeto assinado (ART/RRT), a NBR 5410 oficial, o padrão da
> concessionária local e os catálogos dos fabricantes.
