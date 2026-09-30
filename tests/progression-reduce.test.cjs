'use strict';
/*
 * Regression test (longitudinal investigation): progression() returned action "reduce" but kept the
 * previous load, so an athlete repeatedly below the rep range was never given a lower load.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./longitudinal/load-engine.cjs');

const { training: T, exercisesMod } = loadEngine();
const byId = (id) => exercisesMod.EXERCISES.find((e) => e.id === id);
const set = (w, reps, rir = 0) => ({ id: 's' + Math.random(), type: 'working', weight: w, reps, rir, completed: true });
const workout = (ex, sets) => ({ id: 'w', status: 'completed', exercises: [{ exerciseId: ex.id, sets }] });

test('reduce: repeatedly below the rep range lowers the load by exactly one increment', () => {
  const ex = byId('machine_chest_press'); // 8-12 reps, 2.5 kg increment
  const r = T.progression(ex, [set(20, 4), set(20, 5), set(20, 5)]);
  assert.equal(r.action, 'reduce');
  assert.equal(r.weight, 17.5);
});

test('reduce: never goes below the smallest meaningful load', () => {
  const ex = byId('machine_chest_press');
  const r = T.progression(ex, [set(ex.incrementKg, 2), set(ex.incrementKg, 3), set(ex.incrementKg, 3)]);
  assert.equal(r.action, 'reduce');
  assert.ok(r.weight >= ex.incrementKg);
});

test('reduce: assisted movements receive MORE assistance', () => {
  const ex = exercisesMod.EXERCISES.find((e) => e.loadSemantics === 'assistance');
  const bottom = ex.repRange[0];
  const r = T.progression(ex, [set(30, bottom - 3), set(30, bottom - 3), set(30, bottom - 3)]);
  assert.equal(r.action, 'reduce');
  assert.ok(r.weight > 30);
});

test('reduce: personalizedLoad snaps DOWN to the next lower available load', () => {
  const ex = byId('machine_chest_press');
  const profile = { experience: 'beginner', equipment: ['machine'], loadIncrementsKg: { machine: [10, 15, 25, 30] } };
  const rec = T.personalizedLoad(ex, [workout(ex, [set(25, 4), set(25, 4), set(25, 5)])], profile, [ex]);
  assert.ok([10, 15].includes(rec.weight), 'must be a configured load below 25, got ' + rec.weight);
});

test('reduce: does not trigger for in-range performance and does not affect holds/increases', () => {
  const ex = byId('machine_chest_press');
  assert.equal(T.progression(ex, [set(20, 10, 2), set(20, 10, 2), set(20, 10, 2)]).weight, 20);
  assert.equal(T.progression(ex, [set(20, 12, 2), set(20, 12, 2), set(20, 12, 2)]).weight, 22.5);
});

test('reduce: assisted movement with custom assistance choices snaps UP to more assistance, never to less', () => {
  const ex = exercisesMod.EXERCISES.find((e) => e.loadSemantics === 'assistance');
  const key = ex.equipment[0] || ex.id;
  const profile = { experience: 'beginner', equipment: ex.equipment, loadIncrementsKg: { [key]: [0, 10, 20, 30, 40, 50] } };
  const bottom = ex.repRange[0];
  const rec = T.personalizedLoad(ex, [workout(ex, [set(30, bottom - 3), set(30, bottom - 3), set(30, bottom - 3)])], profile, [ex]);
  assert.ok(rec.weight > 30, 'more assistance expected, got ' + rec.weight);
  assert.ok([40, 50].includes(rec.weight));
});
