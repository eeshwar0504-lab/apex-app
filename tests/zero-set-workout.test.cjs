'use strict';
/* A workout with zero logged sets must never become a normal completed workout. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./longitudinal/load-engine.cjs');
const { training: T, exercisesMod } = loadEngine();

const w = (sets) => ({ id: 'w1', status: 'in_progress', scheduledDate: '2026-01-01', exercises: [{ exerciseId: 'machine_chest_press', order: 0, sets }] });

test('hasLoggedSets: false for no sets, uncompleted sets and empty workouts; true once a set is completed', () => {
  assert.equal(T.hasLoggedSets(w([])), false);
  assert.equal(T.hasLoggedSets(w([{ id: 'a', type: 'working', completed: false }])), false);
  assert.equal(T.hasLoggedSets({ ...w([]), exercises: [] }), false);
  assert.equal(T.hasLoggedSets(w([{ id: 'a', type: 'working', weight: 20, reps: 8, completed: true }])), true);
});

test('abandonWorkout records a skipped workout, never a completion, and keeps its content', () => {
  const src = w([{ id: 'a', type: 'working', completed: false }]);
  const out = T.abandonWorkout(src, '2026-01-01T10:00:00.000Z');
  assert.equal(out.status, 'skipped');
  assert.equal(out.completedAt, undefined);
  assert.equal(out.exercises.length, 1);
});

test('an abandoned workout contributes no history to progression', () => {
  const ex = exercisesMod.EXERCISES.find((e) => e.id === 'machine_chest_press');
  const abandoned = T.abandonWorkout(w([{ id: 'a', type: 'working', weight: 20, reps: 8, completed: false }]), 'x');
  const rec = T.personalizedLoad(ex, [abandoned], undefined, [ex], '2026-02-01');
  assert.notEqual(rec.kind, 'baseline', 'no exercise-specific baseline may come from an abandoned session');
});
