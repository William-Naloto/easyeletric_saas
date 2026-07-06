/* ================================================================
 * Testes do Motor de Seleção de DPS — Node.js:
 *
 *     node scripts/engineering/test_spd.js
 * ================================================================ */
"use strict";
const S = require("./spd.js");

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    if (fn()) { passed++; console.log(`PASS  ${name}`); }
    else { failed++; console.error(`FAIL  ${name}`); }
  } catch (err) {
    failed++; console.error(`ERR   ${name} — ${err.message}`);
  }
}

/* ---------------- Uc ---------------- */
test("Uc comercial: 127V→175V | 220V→275V | 380V→460V", () =>
  S.ucFor(127) === 175 && S.ucFor(220) === 275 && S.ucFor(380) === 460);
test("Uc ≥ 1,1·U0 sempre", () =>
  [127, 220, 254, 380].every(u => S.ucFor(u) >= 1.1 * u));

/* ---------------- Classe ---------------- */
test("SPDA presente → Tipo I", () =>
  S.entranceClass({ hasLPS: true }) === "I");
test("Linha aérea muito exposta → Tipo I", () =>
  S.entranceClass({ serviceEntry: "aerea", highExposure: true }) === "I");
test("Entrada aérea urbana comum → Tipo II", () =>
  S.entranceClass({ serviceEntry: "aerea", highExposure: false }) === "II");
test("Entrada subterrânea → Tipo II", () =>
  S.entranceClass({ serviceEntry: "subterranea" }) === "II");

/* ---------------- Seleção completa ---------------- */
test("Residencial 127V TT trifásico aéreo: Tipo II, Uc 175V, 3+1, 4 módulos", () => {
  const r = S.selectEntranceSPD({ Vfn: 127, supplyType: "trifasico", groundingScheme: "TT", serviceEntry: "aerea" });
  return r.class === "II" && r.ucV === 175 && r.poles === 4 &&
    /3\+1/.test(r.connection) && r.required;
});
test("Tipo I com SPDA: Iimp 12,5 kA onda 10/350", () => {
  const r = S.selectEntranceSPD({ Vfn: 220, hasLPS: true, groundingScheme: "TN-S" });
  return r.class === "I" && r.params.iimpKA === 12.5 && /10\/350/.test(r.params.waveform);
});
test("Tipo II padrão: In 20 kA / Imax 40 kA onda 8/20", () => {
  const r = S.selectEntranceSPD({ Vfn: 127, supplyType: "monofasico" });
  return r.params.inKA === 20 && r.params.imaxKA === 40 && r.poles === 2;
});
test("TN-S usa modo comum (sem centelhador N-PE)", () => {
  const r = S.selectEntranceSPD({ Vfn: 220, groundingScheme: "TN-S", supplyType: "bifasico" });
  return /modo comum/.test(r.connection) && r.poles === 3;
});
test("Up limitado pela categoria II: 127V→1,5kV | 220V→2,5kV", () =>
  S.selectEntranceSPD({ Vfn: 127 }).upKV === 1.5 &&
  S.selectEntranceSPD({ Vfn: 220 }).upKV === 2.5);
test("Entrada subterrânea sem SPDA: recomendado, não obrigatório", () => {
  const r = S.selectEntranceSPD({ Vfn: 127, serviceEntry: "subterranea" });
  return r.required === false && r.class === "II";
});
test("Decisões auditáveis: classe rejeitada com justificativa", () => {
  const r = S.selectEntranceSPD({ Vfn: 127, hasLPS: true });
  const d = r.decisions.find(x => /Tipo I \(/.test(x.decision));
  return d && d.rejected[0].option === "Tipo II" && /10\/350/.test(d.rejected[0].reason);
});
test("Toda decisão traz referência normativa", () => {
  const r = S.selectEntranceSPD({ Vfn: 220, groundingScheme: "TT", hasLPS: true });
  return r.decisions.length >= 5 && r.decisions.every(d => d.reference);
});

/* ---------------- DPS Tipo III (ponto de uso) ---------------- */
test("Equipamento sensível a 15 m do quadro → Tipo III recomendado", () => {
  const r = S.recommendPointOfUseSPD({ distanceFromBoardM: 15, sensitiveLoad: true });
  return r.recommended && r.class === "III";
});
test("Equipamento sensível a 5 m → dispensável (reflexão irrelevante)", () =>
  !S.recommendPointOfUseSPD({ distanceFromBoardM: 5, sensitiveLoad: true }).recommended);
test("Carga não sensível → dispensável em qualquer distância", () =>
  !S.recommendPointOfUseSPD({ distanceFromBoardM: 50, sensitiveLoad: false }).recommended);

console.log(`\n${passed}/${passed + failed} testes aprovados${failed ? ` — ${failed} FALHARAM` : ""}`);
if (failed) process.exitCode = 1;
