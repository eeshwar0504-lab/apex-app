'use strict';
/*
 * Regression test found by the longitudinal simulator: a single impossible set
 * value (for example a negative rep count typed into a number field) made the
 * integrity check reject the ENTIRE persisted state, so the next load fell back
 * to an empty app and silently lost all history and onboarding.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./longitudinal/load-engine.cjs');

function storage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const workout = (n, sets) => ({ id: 'w' + n, planId: 'p', name: 'A', scheduledDate: '2026-01-0' + n, status: 'completed', source: 'scheduled', version: 1, exercises: [{ exerciseId: 'machine_chest_press', order: 0, prescribedSets: sets.length, repRange: [8, 12], restSec: 90, sets }] });

test('persistence: an impossible set value is repaired, not allowed to wipe the whole state', () => {
  global.localStorage = storage();
  const { loadRepository } = loadEngine();
  const { repository, fresh } = loadRepository();
  const s = fresh();
  s.onboardingComplete = true;
  s.workouts = [
    workout(1, [{ id: 'a', type: 'working', weight: 20, reps: 10, completed: true }]),
    workout(2, [{ id: 'b', type: 'working', weight: 20, reps: 10, completed: true }]),
    workout(3, [{ id: 'c', type: 'working', weight: -20, reps: -3, rir: 99, seconds: -1, completed: true }]),
  ];
  repository.save(s);
  const loaded = repository.load();
  assert.equal(loaded.onboardingComplete, true, 'onboarding must survive');
  assert.equal(loaded.workouts.length, 3, 'no workout may be discarded');
  const bad = loaded.workouts[2].exercises[0].sets[0];
  assert.equal(bad.reps, undefined);
  assert.equal(bad.weight, undefined);
  assert.equal(bad.rir, undefined);
  assert.equal(bad.seconds, undefined);
  assert.equal(loaded.workouts[0].exercises[0].sets[0].reps, 10, 'valid data is untouched');
});

test('persistence: a structurally unusable payload starts a fresh app but is preserved, never silently destroyed', () => {
  global.localStorage = storage();
  const { loadRepository } = loadEngine();
  const { repository, fresh } = loadRepository();
  const s = fresh();
  s.workouts = [workout(1, [{ id: 'a', type: 'working', weight: 20, reps: 10, completed: true }]), workout(1, [{ id: 'b', type: 'working', weight: 20, reps: 10, completed: true }])]; // duplicate workout ids -> unusable
  const raw = JSON.stringify(s);
  global.localStorage.setItem('apex-state-v4', raw);
  const loaded = repository.load();
  assert.equal(loaded.workouts.length, 0, 'unusable state falls back to a fresh app');
  assert.equal(global.localStorage.getItem('apex-state-v4-rejected'), raw, 'the rejected payload must be preserved for recovery');
  global.localStorage.setItem('apex-state-v4', '{not json');
  repository.load();
  assert.equal(global.localStorage.getItem('apex-state-v4-rejected'), '{not json');
});
