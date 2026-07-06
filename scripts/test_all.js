/* ================================================================
 * EasyEletric — Runner da suíte completa de testes de engenharia:
 *
 *     node scripts/test_all.js
 *
 * Executa cada suíte em processo próprio e consolida o resultado.
 * ================================================================ */
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");

const SUITES = [
  "test_nbr5410_engine.js",
  "engineering/test_phase_balance.js",
  "engineering/test_rcd.js",
  "engineering/test_spd.js",
  "engineering/test_grounding.js",
  "engineering/test_decision_log.js"
];

let failedSuites = 0;
for (const suite of SUITES) {
  const file = path.join(__dirname, suite);
  const r = spawnSync(process.execPath, [file], { encoding: "utf8" });
  const summary = (r.stdout + r.stderr).trim().split("\n").pop();
  const ok = r.status === 0;
  if (!ok) failedSuites++;
  console.log(`${ok ? "OK  " : "FAIL"}  ${suite} — ${summary}`);
  if (!ok) console.error(r.stdout + r.stderr);
}

console.log(failedSuites
  ? `\n${failedSuites}/${SUITES.length} suítes FALHARAM`
  : `\nTodas as ${SUITES.length} suítes aprovadas`);
process.exitCode = failedSuites ? 1 : 0;
