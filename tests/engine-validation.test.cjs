'use strict';
/*
 * Engine behaviour with unexpected data. UI inputs and persistence validate values first (see
 * persistence-repair.test.cjs); these tests pin the last line of defence: hostile set values never put NaN,
 * Infinity or a negative number into volume, PRs or loads that feed the UI.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./longitudinal/load-engine.cjs');
const { training: T, exercisesMod } = loadEngine();

const byId = (id) => exercisesMod.EXERCISES.find((e) => e.id === id);
const press = byId('machine_chest_press');
const timed = exercisesMod.EXERCISES.find((e) => e.loadSemantics === 'time');
const bodyweight = exercisesMod.EXERCISES.find((e) => e.loadSemantics === 'bodyweight');
const HOSTILE = [-1, -50, 0, 1e9, NaN, Infinity, -Infinity, '8', null, undefined, {}, [], true];
const workout = (ex, sets) => ({ id: 'w', planId: 'p', name: 'W', scheduledDate: '2026-01-01', status: 'completed', source: 'scheduled', version: 1, exercises: [{ exerciseId: ex.id, order: 0, prescribedSets: sets.length, repRange: [8, 12], restSec: 60, sets }] });
const finiteNonNegative = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

test('summarizeSets / volumeForWorkout: hostile reps and weights never produce NaN, Infinity or negative totals', () => {
  for (const weight of HOSTILE) for (const reps of HOSTILE) {
    const sets = [{ id: 'a', type: 'working', weight, reps, completed: true }, { id: 'b', type: 'working', weight: 20, reps: 10, completed: true }];
    const summary = T.summarizeSets(press, sets);
    for (const key of ['reps', 'load', 'volume']) assert.ok(finiteNonNegative(summary[key]), `${key} for weight=${String(weight)} reps=${String(reps)}: ${summary[key]}`);
    assert.ok(summary.volume >= 200, 'the valid set still counts');
    assert.ok(finiteNonNegative(T.volumeForWorkout(workout(press, sets), exercisesMod.EXERCISES)));
  }
});

test('negative reps no longer subtract volume (regression: -50 reps at 1e9 kg produced -5e10 volume)', () => {
  const v = T.volumeForWorkout(workout(press, [{ id: 'a', type: 'working', weight: 1e9, reps: -50, completed: true }]), exercisesMod.EXERCISES);
  assert.equal(v, 0);
});

test('sessionAssessment and detectAchievements: outputs stay finite and non-negative under hostile sets', () => {
  for (const weight of HOSTILE) for (const reps of HOSTILE) {
    const sets = [{ id: 'a', type: 'working', weight, reps, rir: 2, completed: true }];
    const w = workout(press, sets);
    const a = T.sessionAssessment(w, exercisesMod.EXERCISES, []);
    assert.ok(finiteNonNegative(a.volume), 'volume ' + a.volume);
    for (const ach of a.achievements) assert.ok(finiteNonNegative(ach.value), `${ach.kind} ${ach.value}`);
    for (const ach of T.detectAchievements(w, exercisesMod.EXERCISES, [workout(press, [{ id: 'p', type: 'working', weight: 10, reps: 5, completed: true }])])) assert.ok(finiteNonNegative(ach.value));
  }
});

test('timed sets: hostile seconds never become a PR value', () => {
  for (const seconds of HOSTILE) {
    const out = T.detectAchievements(workout(timed, [{ id: 'a', type: 'timed', seconds, completed: true }]), exercisesMod.EXERCISES, []);
    for (const ach of out) assert.ok(finiteNonNegative(ach.value), `${ach.kind} ${ach.value}`);
  }
});

test('feedbackLoad: invalid current loads are sanitised for every load semantics', () => {
  for (const ex of [press, timed, bodyweight].filter(Boolean)) for (const current of [-0.0001, -5, NaN, Infinity, undefined]) {
    const out = T.feedbackLoad(ex, current, 'easy', { reps: 10, rir: 2 }, ex.repRange, 2, undefined);
    assert.ok(out === undefined || finiteNonNegative(out), `${ex.id} current=${current} -> ${out}`);
  }
});

test('progression / personalizedLoad never throw on hostile history and never return a non-finite load', () => {
  for (const weight of HOSTILE) for (const reps of HOSTILE) for (const rir of [-1, 99, NaN, undefined]) {
    const sets = [1, 2, 3].map((i) => ({ id: 's' + i, type: 'working', weight, reps, rir, completed: true }));
    const p = T.progression(press, sets);
    assert.ok(p.weight === undefined || Number.isFinite(p.weight), 'progression weight ' + p.weight);
    const rec = T.personalizedLoad(press, [workout(press, sets)], undefined, exercisesMod.EXERCISES, '2026-03-01');
    assert.ok(rec.weight === undefined || (Number.isFinite(rec.weight) && rec.weight >= 0), 'recommended ' + rec.weight);
  }
});

test('dates: invalid or missing dates disable layoff handling instead of breaking prescriptions', () => {
  const history = [workout(press, [{ id: 'a', type: 'working', weight: 20, reps: 10, completed: true }, { id: 'b', type: 'working', weight: 20, reps: 10, completed: true }, { id: 'c', type: 'working', weight: 20, reps: 10, completed: true }])];
  for (const asOf of [undefined, '', 'not a date', 'Invalid Date', '2026-99-99']) {
    const rec = T.personalizedLoad(press, history, undefined, exercisesMod.EXERCISES, asOf);
    assert.equal(rec.weight, 20, 'asOf=' + String(asOf));
  }
  const futureDated = [{ ...history[0], scheduledDate: '2099-01-01', completedAt: '2099-01-01T10:00:00Z' }];
  assert.equal(T.personalizedLoad(press, futureDated, undefined, exercisesMod.EXERCISES, '2026-03-01').weight, 20, 'a session dated after "today" is a zero-day gap, not a layoff');
});
