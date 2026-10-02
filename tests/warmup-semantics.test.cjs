'use strict';
/*
 * P1.6: ONE rule for warm-up sets. A warm-up is logged but it is not training evidence:
 * it never counts for progression, exact-history loads, comparable estimates, the gap since the last exposure,
 * volume, PRs, plateau signals, session completion percentage, or whether a session "logged sets".
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, EXERCISES, byId, set, session, threeSets, profile, prescribe, addDays, DAY0 } = require('./phase1-helpers.cjs');

const press = byId('machine_chest_press');
const warm = (load, reps = 10) => set(press, load, reps, 4, { type: 'warmup' });

test('isWorkingSet: completed and not a warm-up', () => {
  assert.equal(T.isWorkingSet(set(press, 20, 10)), true);
  assert.equal(T.isWorkingSet(warm(10)), false);
  assert.equal(T.isWorkingSet({ ...set(press, 20, 10), completed: false }), false);
  assert.equal(T.isWorkingSet(set(press, 20, 10, 2, { type: 'drop' })), true, 'other set types are training work');
});

test('progression ignores warm-ups', () => {
  assert.equal(T.progression(press, [warm(60, 12), warm(60, 12), warm(60, 12)]).action, 'calibrate');
  const r = T.progression(press, [warm(5, 12), ...threeSets(press, 20, 10)]);
  assert.deepEqual({ action: r.action, weight: r.weight }, { action: 'hold', weight: 20 });
  const heavyWarmupLast = T.progression(press, [...threeSets(press, 20, 12), warm(60, 12)]);
  assert.equal(heavyWarmupLast.weight, 22.5, 'a warm-up logged last does not become the base load');
});

test('exact history and comparable estimates ignore warm-ups', () => {
  assert.equal(prescribe(press, [session(press, DAY0, [warm(60), warm(60)])], profile()).kind, 'calibration');
  const incline = byId('incline_machine_press');
  const onlyWarm = T.personalizedLoad(press, [session(incline, DAY0, [set(incline, 80, 10, 2, { type: 'warmup' })])], profile(), EXERCISES, addDays(DAY0, 2));
  assert.equal(onlyWarm.kind, 'calibration');
  const mixed = prescribe(press, [session(press, DAY0, [warm(60), ...threeSets(press, 20, 10)])], profile());
  assert.equal(mixed.weight, 20);
});

test('a warm-up does not reset the gap since the last exposure (return-to-training)', () => {
  const hist = [session(press, DAY0, threeSets(press, 20, 10)), session(press, addDays(DAY0, 20), [warm(10)])];
  assert.equal(T.trainingGapDays(press, hist, addDays(DAY0, 28)), 28);
  assert.equal(prescribe(press, hist, profile(), addDays(DAY0, 28)).weight, 15);
});

test('volume, load and set counts exclude warm-ups', () => {
  const sets = [warm(60), ...threeSets(press, 20, 10)];
  const s = T.summarizeSets(press, sets);
  assert.equal(s.completedSets, 3);
  assert.equal(s.volume, 600);
  assert.equal(s.load, 60);
  assert.equal(s.topLoad, 20);
  assert.equal(s.reps, 30);
  assert.equal(T.volumeForWorkout(session(press, DAY0, sets), EXERCISES), 600);
});

test('PRs ignore warm-ups in both directions', () => {
  const prev = [session(press, DAY0, threeSets(press, 20, 10))];
  const kinds = (sets, previous) => T.detectAchievements(session(press, addDays(DAY0, 3), sets), EXERCISES, previous).map((a) => a.kind);
  assert.deepEqual(kinds([warm(80, 15), warm(80, 15)], prev), [], 'a heavy, high-rep warm-up is not a record');
  assert.ok(kinds([...threeSets(press, 22.5, 10)], [session(press, DAY0, [...threeSets(press, 20, 10), warm(100)])]).includes('load'), 'a previous warm-up does not raise the bar');
  assert.deepEqual(kinds([warm(10)], []), [], 'a first session of only warm-ups records nothing');
});

test('session completion counts training work: planned and completed exclude warm-ups', () => {
  const w = session(press, DAY0, [warm(10), warm(15), ...threeSets(press, 20, 10), { id: 'x', type: 'working', weight: 20, reps: 10, completed: false }]);
  const a = T.sessionAssessment(w, EXERCISES, []);
  assert.equal(a.completedSets, 3);
  assert.equal(a.plannedSets, 4);
  assert.equal(a.completion, 0.75);
});

test('a session of only warm-ups has logged no sets (it is abandoned, never completed)', () => {
  const only = session(press, DAY0, [warm(10), warm(20)], { status: 'in_progress' });
  assert.equal(T.hasLoggedSets(only), false);
  assert.equal(T.abandonWorkout(only, 'x').status, 'skipped');
  assert.equal(T.hasLoggedSets(session(press, DAY0, [warm(10), set(press, 20, 8)])), true);
});

test('plateau and volume-trend analytics ignore warm-ups', () => {
  const flat = (extra) => ({ exercises: EXERCISES, workouts: [0, 3, 6, 9].map((d, i) => session(press, addDays(DAY0, d), [...extra(i), ...threeSets(press, 20, 9)])) });
  assert.equal(E.analytics.plateauCandidates(flat(() => [])).length, 1);
  assert.equal(E.analytics.plateauCandidates(flat((i) => [warm(10 + i * 5, 5 + i)])).length, 1, 'varying warm-ups cannot hide a plateau');
  const trend = E.analytics.volumeTrend(flat((i) => [warm(50, 10)]));
  assert.ok(trend.every((t) => t.sets === 3 && t.volume === 540));
});

test('the workload-spike signal ignores warm-up volume', () => {
  const a = session(press, DAY0, threeSets(press, 20, 10));
  const b = session(press, addDays(DAY0, 3), [warm(200, 20), warm(200, 20), ...threeSets(press, 20, 10)]);
  assert.equal(T.workloadFatigue([a, b], EXERCISES), 'normal');
});
