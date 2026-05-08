# Smoke Tests — EasyEletric SaaS v0.5

Objetivo: validar rapidamente que as principais regras do motor elétrico continuam coerentes após alterações.

## Casos mínimos

| Caso | Entrada | Esperado |
|---|---|---|
| Corrente monofásica | 1270 W, 127 V, FP 1, 1F+N | 10 A |
| Corrente bifásica | 2200 W, 220 V, FP 1, 2F | 10 A |
| Corrente trifásica | 3800 W, 380 V, FP 1, 3F | ~5,77 A |
| Queda 1F | K = 2 | usa ida e volta |
| Queda 3F | K = √3 | usa fator trifásico |
| Balanceamento | 1F/2F/3F misto | aloca em A/B/C |

## Resultado da fase 5

- Sintaxe JavaScript do `index.html`: aprovada com `node --check`.
- Testes unitários completos ficam para v0.6, quando os módulos forem separados em JS próprios.
