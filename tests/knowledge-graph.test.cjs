'use strict';
/*
 * Regression test found by the longitudinal simulator: an exercise listed
 * "stability_ball_curl" as an alternative although no such exercise exists.
 * Every alternative / progression / regression reference must resolve.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./longitudinal/load-engine.cjs');

test('knowledge graph: every alternative/progression/regression id resolves to an exercise', () => {
  const { exercisesMod } = loadEngine();
  const ids = new Set(exercisesMod.EXERCISES.map((e) => e.id));
  const dangling = [];
  for (const e of exercisesMod.EXERCISES) {
    for (const rel of [...(e.alternatives || []), ...(e.progressions || []), ...(e.regressions || [])]) {
      if (!ids.has(rel)) dangling.push(`${e.id} -> ${rel}`);
    }
  }
  assert.deepEqual(dangling, []);
});
