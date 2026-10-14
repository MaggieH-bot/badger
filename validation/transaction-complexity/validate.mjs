import assert from 'node:assert/strict';
import { CASES } from './fixtures.mjs';
import { evaluateImpact, renderAudience, safetyCheck } from './engine.mjs';

let failures = 0;
let scenariosRun = 0;

function sameMembers(actual, expected) {
  assert.deepEqual([...actual].sort(), [...expected].sort());
}

for (const testCase of CASES) {
  console.log(`\nCASE: ${testCase.id}`);
  for (const scenario of testCase.scenarios) {
    scenariosRun += 1;
    try {
      const result = evaluateImpact(testCase, scenario.event);
      sameMembers(result.affectedNodeIds, scenario.expect.affectedNodeIds);

      for (const required of scenario.expect.requiredActionIds) {
        assert.ok(result.actionIds.includes(required), `missing required action: ${required}`);
      }
      for (const forbidden of scenario.expect.forbiddenActionIds) {
        assert.ok(!result.actionIds.includes(forbidden), `forbidden action surfaced: ${forbidden}`);
      }

      const safety = safetyCheck(result);
      assert.equal(safety.ok, true, `safety failure: ${safety.forbidden.join(', ')}`);

      const consumer = renderAudience(result, 'consumer');
      assert.ok(
        consumer.every((item) => !/you can void|automatically|we changed|has been changed/i.test(item.text)),
        'consumer wording overstates authority',
      );

      console.log(`  PASS ${scenario.id}`);
      console.log(`       affected: ${result.affectedNodeIds.join(' -> ')}`);
      console.log(`       reviews:  ${result.actionIds.join(', ')}`);
    } catch (error) {
      failures += 1;
      console.error(`  FAIL ${scenario.id}: ${error.message}`);
    }
  }
}

console.log(`\n${scenariosRun - failures}/${scenariosRun} scenarios passed.`);
if (failures > 0) process.exit(1);
