'use strict';
/*
 * P1.2: ONE representation for assisted exercises.
 *   assistance = kg of counter-weight removed from bodyweight, stored ONLY in SetLog.assistance.
 *   lower assistance = harder = progress.  effective resistance (bodyweight - assistance) is never assumed.
 * Every subsystem reads the load through setLoad()/bestLoad().
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, byId, set, session, threeSets, profile, prescribe, addDays, DAY0, EXERCISES } = require('./phase1-helpers.cjs');

const pull = byId('assisted_pullup'); // assistance, increment 2.5, reps 6-12
const uiSet = (assistance, reps, rir = 2) => ({ id: 'u' + Math.random(), type: 'working', assistance, reps, rir, completed: true }); // shape the UI writes
const legacySet = (weight, reps, rir = 2) => ({ id: 'l' + Math.random(), type: 'working', weight, reps, rir, completed: true }); // shape older data / tests used
const hist = (make, load, reps) => [session(pull, DAY0, [make(load, reps), make(load, reps), make(load, reps)])];

test('setLoad: assisted reads assistance (legacy weight only as a fallback); others ignore assistance', () => {
  assert.equal(T.setLoad(pull, { assistance: 30, weight: 99 }), 30);
  assert.equal(T.setLoad(pull, { weight: 30 }), 30, 'older saved data stored assistance in weight');
  assert.equal(T.setLoad(pull, { assistance: NaN, weight: 25 }), 25);
  assert.equal(T.setLoad(pull, { assistance: -1 }), -1, 'reading never invents a value; meaningfulLoad() rejects a negative one');
  assert.equal(T.meaningfulLoad(pull, -1), false);
  assert.equal(T.setLoad(byId('machine_chest_press'), { assistance: 30, weight: 20 }), 20);
  assert.equal(T.setLoad(byId('machine_chest_press'), { assistance: 30 }), undefined);
});

test('bestLoad: heaviest external load, but the LOWEST assistance', () => {
  const press = byId('machine_chest_press');
  assert.equal(T.bestLoad(press, [set(press, 20, 10), set(press, 25, 8)]), 25);
  assert.equal(T.bestLoad(pull, [uiSet(30, 8), uiSet(22.5, 6), uiSet(27.5, 9)]), 22.5);
  assert.equal(T.bestLoad(pull, [uiSet(0, 5)]), 0, 'zero assistance is a real, best load');
});

test('progression direction: top of range = LESS assistance, below range = MORE assistance', () => {
  assert.deepEqual(pick(T.progression(pull, threeSets(pull, 30, 12))), { action: 'increase', weight: 27.5 });
  assert.deepEqual(pick(T.progression(pull, threeSets(pull, 30, 4))), { action: 'reduce', weight: 32.5 });
  assert.deepEqual(pick(T.progression(pull, threeSets(pull, 30, 9))), { action: 'hold', weight: 30 });
  assert.equal(T.progression(pull, threeSets(pull, 0, 12)).weight, 0, 'cannot go below zero assistance');
  assert.equal(T.progression(pull, threeSets(pull, 0, 3)).weight, 2.5, 'more assistance from zero');
});
function pick(r) { return { action: r.action, weight: r.weight }; }

test('END TO END: history written the way the UI writes it (assistance only) drives the prescription', () => {
  const r = prescribe(pull, hist(uiSet, 30, 12), profile());
  assert.equal(r.kind, 'baseline', 'exact history, not a calibration fallback');
  assert.equal(r.action, 'increase');
  assert.equal(r.weight, 27.5);
  const back = prescribe(pull, hist(uiSet, 30, 3), profile());
  assert.equal(back.action, 'reduce');
  assert.equal(back.weight, 32.5);
});

test('metamorphic: the legacy representation (assistance stored in weight) gives the identical prescription', () => {
  for (const [load, reps] of [[30, 12], [30, 4], [30, 9], [0, 12], [45, 7]]) {
    assert.deepEqual(prescribe(pull, hist(uiSet, load, reps), profile()), prescribe(pull, hist(legacySet, load, reps), profile()), `${load}x${reps}`);
  }
});

test('custom assistance list: less assistance = the next LOWER available load, more = the next HIGHER', () => {
  const p = profile({ loadIncrementsKg: { machine: [10, 20, 30, 40, 50] } });
  assert.equal(prescribe(pull, hist(uiSet, 30, 12), p).weight, 20);
  assert.equal(prescribe(pull, hist(uiSet, 30, 4), p).weight, 40);
  assert.equal(prescribe(pull, hist(uiSet, 30, 9), p).weight, 30);
  assert.equal(prescribe(pull, hist(uiSet, 10, 12), p).weight, 10, 'already the least assistance available');
  assert.equal(prescribe(pull, hist(uiSet, 50, 4), p).weight, 50, 'already the most assistance available');
});

test('return to training: MORE assistance, one step per tier, bounded by the list', () => {
  const h = hist(uiSet, 30, 12);
  assert.equal(prescribe(pull, h, profile(), addDays(DAY0, 13)).weight, 27.5);
  assert.equal(prescribe(pull, h, profile(), addDays(DAY0, 14)).weight, 32.5);
  assert.equal(prescribe(pull, h, profile(), addDays(DAY0, 28)).weight, 35);
  assert.equal(prescribe(pull, h, profile(), addDays(DAY0, 56)).weight, 37.5);
  const p = profile({ loadIncrementsKg: { machine: [10, 20, 30, 40, 50] } });
  assert.equal(prescribe(pull, h, p, addDays(DAY0, 28)).weight, 50);
});

test('volume: assisted sets carry no volume and no summed load (like bodyweight movements)', () => {
  const s = T.summarizeSets(pull, threeSets(pull, 30, 8));
  assert.equal(s.volume, 0);
  assert.equal(s.load, 0);
  assert.equal(s.completedSets, 3);
  assert.equal(s.reps, 24);
  assert.equal(s.topLoad, 30, 'topLoad is the best load: the lowest assistance');
  assert.equal(T.summarizeSets(pull, [uiSet(30, 8), uiSet(25, 8)]).topLoad, 25);
  assert.equal(T.volumeForWorkout(session(pull, DAY0, threeSets(pull, 30, 8)), EXERCISES), 0);
});

test('PRs: lower assistance is a load record; more assistance is not; zero assistance counts', () => {
  const prev = [session(pull, DAY0, [uiSet(30, 8), uiSet(30, 8), uiSet(30, 8)])];
  const todayFor = (assistance, reps = 8) => session(pull, addDays(DAY0, 3), [uiSet(assistance, reps), uiSet(assistance, reps)]);
  const kinds = (w, previous) => T.detectAchievements(w, EXERCISES, previous).map((a) => a.kind);
  assert.ok(kinds(todayFor(27.5), prev).includes('load'));
  const better = T.detectAchievements(todayFor(27.5), EXERCISES, prev).find((a) => a.kind === 'load');
  assert.match(better.label, /New assistance best/);
  assert.equal(better.value, 27.5);
  assert.ok(!kinds(todayFor(32.5), prev).includes('load'), 'more assistance is not a record');
  assert.ok(!kinds(todayFor(30), prev).includes('load'), 'equal is not a record');
  assert.ok(kinds(todayFor(0), prev).includes('load'), 'fully unassisted is the best load');
  assert.ok(kinds(todayFor(30, 10), prev).includes('rep'), 'rep records work on assisted movements');
  assert.ok(!kinds(todayFor(20), prev).includes('estimated_strength'), 'no external mass, no estimated 1RM');
  assert.ok(!kinds(todayFor(20), prev).includes('volume'), 'no volume PR without volume');
  assert.ok(kinds(todayFor(40), []).includes('load'), 'first exposure records a load');
});

test('analytics: a plateau needs the SAME assistance; less assistance is progress', () => {
  const state = (loads) => ({ exercises: EXERCISES, workouts: loads.map((l, i) => session(pull, addDays(DAY0, i * 3), threeSets(pull, l, 8))) });
  assert.equal(E.analytics.plateauCandidates(state([30, 30, 30, 30])).length, 1);
  assert.equal(E.analytics.plateauCandidates(state([30, 27.5, 25, 22.5])).length, 0);
});

test('feedback inverts for assisted: "too easy" = LESS assistance, "too heavy" = MORE', () => {
  const easy = T.feedbackLoad(pull, 30, 'easy', { reps: 10, rir: 3 }, pull.repRange, 2, undefined);
  const heavy = T.feedbackLoad(pull, 30, 'heavy', { reps: 5, rir: 0 }, pull.repRange, 2, undefined);
  assert.ok(easy < 30 && heavy > 30, `easy=${easy} heavy=${heavy}`);
  const p = profile({ loadIncrementsKg: { machine: [10, 20, 30, 40, 50] } });
  assert.equal(T.feedbackLoad(pull, 30, 'easy', { reps: 7, rir: 2 }, pull.repRange, 2, p), 20);
  assert.equal(T.feedbackLoad(pull, 30, 'heavy', { reps: 9, rir: 2 }, pull.repRange, 2, p), 40);
});

test('applySetFeedback writes assistance (not weight) into the later sets of an assisted exercise', () => {
  const w = session(pull, DAY0, [{ id: 'a', type: 'working', assistance: 30, reps: 8, rir: 2, completed: true }, { id: 'b', type: 'working', assistance: 30, reps: 8, completed: false }, { id: 'c', type: 'working', assistance: 30, reps: 8, completed: false }]);
  w.status = 'in_progress';
  w.exercises[0].recommendedWeight = 30;
  const out = E.guided.applySetFeedback(w, pull, 0, 0, 'easy', profile(), 2);
  const later = out.exercises[0].sets.slice(1);
  assert.ok(later.every((x) => x.assistance < 30 && x.weight === undefined), JSON.stringify(later));
  assert.ok(later.every((x) => x.loadDetail && x.loadDetail.kind === 'assistance' && x.loadDetail.assistanceKg === x.assistance));
});

test('set construction: assistance is validated and weight is never used for assisted sets', () => {
  assert.equal(T.makeSet('working', pull, 20).assistance, 20);
  assert.equal(T.makeSet('working', pull, 20).weight, undefined);
  for (const bad of [NaN, Infinity, -5, undefined, '20']) assert.equal(T.makeSet('working', pull, bad).assistance, 0, String(bad));
  const converted = T.updateSetType({ id: 'x', type: 'working', weight: 40, reps: 8, completed: false }, 'assisted', pull);
  assert.equal(converted.assistance, 40);
  assert.equal(converted.weight, undefined);
});

test('hydration: the recommendation reaches assisted sets on the first hydration, and only fills gaps afterwards', () => {
  const sets = [{ id: 'a', type: 'working', assistance: 10, completed: false }, { id: 'b', type: 'warmup', assistance: 50, completed: false }, { id: 'c', type: 'working', assistance: 10, completed: true }, { id: 'd', type: 'working', completed: false }];
  const first = T.loadRecommendationIntoSets(pull, sets, 27.5, true);
  assert.equal(first[0].assistance, 27.5, 'stale pre-filled load replaced');
  assert.equal(first[1].assistance, 50, 'warm-up untouched');
  assert.equal(first[2].assistance, 10, 'completed set untouched');
  assert.equal(first[3].assistance, 27.5);
  assert.ok(first[0].loadDetail.kind === 'assistance' && first[0].loadDetail.assistanceKg === 27.5);
  const later = T.loadRecommendationIntoSets(pull, sets, 27.5, false);
  assert.equal(later[0].assistance, 10, 'never overwrites what the athlete has');
  assert.equal(later[3].assistance, 27.5, 'fills a missing load');
  assert.equal(T.loadRecommendationIntoSets(pull, sets, undefined, true), sets);
  const press = byId('machine_chest_press');
  const ext = T.loadRecommendationIntoSets(press, [{ id: 'a', type: 'working', weight: 10, completed: false }], 22.5, true);
  assert.equal(ext[0].weight, 22.5);
  assert.equal(ext[0].loadDetail.stackKg, 22.5);
  const bw = byId('bodyweight_squat');
  const untouched = [{ id: 'a', type: 'working', reps: 10, completed: false }];
  assert.equal(T.loadRecommendationIntoSets(bw, untouched, 10, true), untouched);
});

test('comparable-exercise fallback never transfers a load between different load meanings', () => {
  const stack = byId('lat_pulldown'); // stack, vertical_pull: similar movement, different load meaning
  const r = T.personalizedLoad(pull, [session(stack, DAY0, threeSets(stack, 50, 10))], profile(), EXERCISES, addDays(DAY0, 2));
  assert.equal(r.kind, 'calibration', 'a 50 kg stack load is not an assistance load');
});
