'use strict';
/*
 * P1.3 fatigue path, P1.4 timed movements, P4 one authoritative prescription.
 * Precedence in progression() (first match wins):
 *   1 no usable evidence -> calibrate   2 timed -> hold   3 repeatedly below range -> reduce
 *   4 top of range + elevated workload -> recover   5 top of range -> increase   6 RIR <= 0.5 -> hold   7 hold
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, byId, set, session, threeSets, profile, prescribe, addDays, DAY0, EXERCISES } = require('./phase1-helpers.cjs');

const press = byId('machine_chest_press');
const plank = byId('plank');
const brief = (r) => ({ action: r.action, weight: r.weight });

test('P4.3 precedence table (progression)', () => {
  assert.equal(T.progression(press, []).action, 'calibrate');
  assert.equal(T.progression(press, [{ id: 'a', type: 'working', weight: 20, reps: NaN, completed: true }, { id: 'b', type: 'working', weight: 20, reps: -3, completed: true }]).action, 'calibrate', 'invalid reps are not evidence');
  assert.equal(T.progression(press, [set(press, 20, 12, 2, { type: 'warmup' })]).action, 'calibrate', 'warm-ups are not evidence');
  assert.deepEqual(brief(T.progression(press, [set(press, 20, 4), set(press, 20, 5), set(press, 20, 5)], { fatigue: 'elevated' })), { action: 'reduce', weight: 17.5 }, 'direct failure evidence beats workload context');
  assert.deepEqual(brief(T.progression(press, threeSets(press, 20, 12), { fatigue: 'elevated' })), { action: 'recover', weight: 20 }, 'a spike only suppresses an increase');
  assert.deepEqual(brief(T.progression(press, threeSets(press, 20, 12))), { action: 'increase', weight: 22.5 });
  assert.deepEqual(brief(T.progression(press, threeSets(press, 20, 10), { fatigue: 'elevated' })), { action: 'hold', weight: 20 }, 'mid-range: context changes nothing');
  assert.equal(T.progression(press, threeSets(press, 20, 10, 0)).action, 'hold', 'RIR 0 holds');
  assert.equal(T.progression(press, threeSets(press, 20, 12, 0)).action, 'increase', 'top-of-range beats low RIR');
  assert.equal(T.progression(press, threeSets(press, 20, 12), { fatigue: 'low' }).action, 'increase');
});

test('P1.3 the workload-spike signal reaches the prescription: top of range + spike = recover (hold), no spike = increase', () => {
  const base = (spikeLoad) => [session(press, DAY0, threeSets(press, 20, 10)), session(press, addDays(DAY0, 3), threeSets(press, spikeLoad, 12))];
  // previous volume 600; 3x12x25 = 900 (+50%) is a spike, 3x12x22.5 = 810 (+35%) also, 3x12x20 = 720 (+20%) is not
  const spike = prescribe(press, base(25), profile(), addDays(DAY0, 5));
  assert.equal(E.training.workloadFatigue(base(25), EXERCISES), 'elevated');
  assert.equal(spike.action, 'recover');
  assert.equal(spike.weight, 25, 'load is held, never reversed');
  assert.match(spike.reason, /rose sharply/);
  const calm = prescribe(press, base(20), profile(), addDays(DAY0, 5));
  assert.equal(E.training.workloadFatigue(base(20), EXERCISES), 'normal');
  assert.equal(calm.action, 'increase');
  assert.equal(calm.weight, 22.5);
});

test('P1.3 readiness() and progression use the same signal (workloadFatigue)', () => {
  const workouts = [session(press, DAY0, threeSets(press, 20, 10)), session(press, addDays(DAY0, 3), threeSets(press, 30, 12))];
  const state = { workouts, exercises: EXERCISES };
  assert.equal(E.intelligence.readiness(state).level, 'elevated');
  assert.equal(T.workloadFatigue(workouts, EXERCISES), 'elevated');
  const calm = [workouts[0], session(press, addDays(DAY0, 3), threeSets(press, 20, 10))];
  assert.equal(E.intelligence.readiness({ workouts: calm, exercises: EXERCISES }).level, 'normal');
  assert.equal(T.workloadFatigue(calm, EXERCISES), 'normal');
  assert.equal(T.workloadFatigue(workouts, []), 'normal', 'without the catalogue no volume can be computed: no signal');
  const zeroPrev = [session(plank, DAY0, [set(plank, undefined, undefined, 2, { type: 'timed', seconds: 30 })]), session(press, addDays(DAY0, 3), threeSets(press, 20, 10))];
  assert.equal(T.workloadFatigue(zeroPrev, EXERCISES), 'normal', 'a previous session without volume is not a baseline for a spike');
});

test('P1.3 recovery never overrides stronger evidence: a return-to-training reduction and a failure reduction both win', () => {
  const spikeHistory = [session(press, DAY0, threeSets(press, 20, 10)), session(press, addDays(DAY0, 3), threeSets(press, 30, 12))];
  const back = prescribe(press, spikeHistory, profile(), addDays(DAY0, 3 + 28));
  assert.equal(back.weight, 25, 'two return steps below 30');
  assert.ok(back.returnToTraining);
  const failing = [session(press, DAY0, threeSets(press, 20, 10)), session(press, addDays(DAY0, 3), [set(press, 30, 4), set(press, 30, 5), set(press, 30, 5)])];
  const r = prescribe(press, failing, profile(), addDays(DAY0, 5));
  assert.equal(r.action, 'reduce');
  assert.equal(r.weight, 27.5);
});

test('P1.4 timed movements are never load-adapted and never "reduced" for missing reps', () => {
  const timed = (seconds) => ({ id: 't' + seconds, type: 'timed', seconds, completed: true });
  for (const secs of [5, 20, 30, 45, 90]) {
    const r = T.progression(plank, [timed(secs), timed(secs), timed(secs)]);
    assert.equal(r.action, 'hold', `${secs}s`);
    assert.equal(r.weight, undefined);
    assert.equal(r.recommendedRest, plank.restSec, 'no extra rest either');
  }
  assert.equal(T.progression(plank, []).action, 'calibrate');
  assert.equal(T.progression(plank, [{ id: 'x', type: 'timed', seconds: NaN, completed: true }, { id: 'y', type: 'timed', seconds: -4, completed: true }]).action, 'calibrate', 'invalid durations are not evidence');
  assert.equal(T.progression(plank, [{ id: 'x', type: 'timed', reps: 10, completed: true }]).action, 'calibrate', 'reps are not timed evidence');
});

test('P1.4 applyWorkoutAdaptation leaves a timed exercise prescription alone', () => {
  const next = T.createWorkout('B', addDays(DAY0, 3), ['plank'], EXERCISES, 'p');
  const before = JSON.stringify(next.exercises[0].sets.map((s) => ({ seconds: s.seconds, weight: s.weight })));
  const hist = [session(plank, DAY0, [{ id: 'a', type: 'timed', seconds: 10, completed: true }, { id: 'b', type: 'timed', seconds: 12, completed: true }])];
  const out = T.applyWorkoutAdaptation(next, EXERCISES, hist, profile());
  assert.equal(out.exercises[0].recommendedWeight, undefined);
  assert.equal(out.exercises[0].restSec, plank.restSec);
  assert.equal(JSON.stringify(out.exercises[0].sets.map((s) => ({ seconds: s.seconds, weight: s.weight }))), before);
});

test('P4.1/4.2 applyWorkoutAdaptation delegates to personalizedLoad: the next session can never disagree with the prescription', () => {
  const p = profile({ loadIncrementsKg: { machine: [10, 15, 25, 30] } });
  const hist = [session(press, DAY0, threeSets(press, 25, 12))];
  const when = addDays(DAY0, 3);
  const next = T.createWorkout('B', when, ['machine_chest_press', 'assisted_pullup', 'lat_pulldown'], EXERCISES, 'p');
  const out = T.applyWorkoutAdaptation(next, EXERCISES, hist, p);
  const rec = T.personalizedLoad(press, hist, p, EXERCISES, when);
  assert.equal(rec.weight, 30);
  assert.equal(out.exercises[0].recommendedWeight, rec.weight);
  assert.equal(out.exercises[0].restSec, rec.recommendedRest);
  assert.notEqual(out.exercises[1].recommendedWeight, undefined, 'an exercise with no history keeps its creation-time calibration');
  // a history the caller passes as "recent" is treated as completed history, whatever status it carries
  const asPassedFromUi = hist.map((w) => ({ ...w, status: 'in_progress' }));
  assert.equal(T.applyWorkoutAdaptation(next, EXERCISES, asPassedFromUi, p).exercises[0].recommendedWeight, 30);
});

test('P4.2 the advisory "Progress / Protect" text is derived from the same decision as the load', () => {
  const state = (hist) => ({ workouts: hist, exercises: EXERCISES });
  const planned = T.createWorkout('B', addDays(DAY0, 3), ['machine_chest_press'], EXERCISES, 'p');
  const titles = (hist) => E.intelligence.adaptationsForWorkout(state(hist), planned).map((a) => a.type);
  assert.deepEqual(titles([session(press, DAY0, threeSets(press, 20, 12))]), ['load']);
  assert.deepEqual(titles([session(press, DAY0, [set(press, 20, 4), set(press, 20, 5), set(press, 20, 5)])]), ['recovery']);
  assert.deepEqual(titles([session(press, DAY0, threeSets(press, 20, 10))]), []);
  const spike = [session(press, DAY0, threeSets(press, 20, 10)), session(press, addDays(DAY0, 3), threeSets(press, 30, 12))];
  assert.deepEqual(titles(spike), [], 'a spike suppresses the "progress" advice exactly as it suppresses the increase');
});

test('P4.4 return to training composes with progression: never above the normal prescription, no stacking with reduce', () => {
  const top = [session(press, DAY0, threeSets(press, 20, 12))];
  assert.equal(prescribe(press, top, profile(), addDays(DAY0, 14)).weight, 17.5, 'normal would be +2.5; the return caps it below the last load');
  const failing = [session(press, DAY0, [set(press, 20, 4), set(press, 20, 5), set(press, 20, 5)])];
  assert.equal(prescribe(press, failing, profile(), addDays(DAY0, 28)).weight, 15, 'reduce would be 17.5; two return steps give 15; the lower wins');
  assert.equal(prescribe(press, failing, profile(), addDays(DAY0, 14)).weight, 17.5, 'one return step equals the reduce step: they do not stack');
});

test('P4.6 comparable-exercise fallback: same load meaning only, working sets only, weighted by similarity', () => {
  const incline = byId('incline_machine_press');
  const r = T.personalizedLoad(press, [session(incline, DAY0, threeSets(incline, 30, 10))], profile(), EXERCISES, addDays(DAY0, 2));
  assert.equal(r.kind, 'comparable_estimate');
  assert.equal(r.weight, 30);
  const dumbbell = byId('dumbbell_bench_press');
  const cross = T.personalizedLoad(press, [session(dumbbell, DAY0, threeSets(dumbbell, 20, 10))], profile(), EXERCISES, addDays(DAY0, 2));
  assert.equal(cross.kind, 'calibration', 'a per-hand dumbbell load is not a stack-machine load');
  const warm = T.personalizedLoad(press, [session(incline, DAY0, [set(incline, 60, 10, 2, { type: 'warmup' })])], profile(), EXERCISES, addDays(DAY0, 2));
  assert.equal(warm.kind, 'calibration', 'warm-ups are not comparable evidence');
  const own = T.personalizedLoad(press, [session(incline, DAY0, threeSets(incline, 30, 10)), session(press, addDays(DAY0, 1), threeSets(press, 15, 10))], profile(), EXERCISES, addDays(DAY0, 3));
  assert.equal(own.kind, 'baseline', 'exact history always beats a comparable estimate');
  assert.equal(own.weight, 15);
});

test('P4.7 calibration fallback is deterministic and uses the real load list', () => {
  const at = (experience, extra = {}) => T.personalizedLoad(press, [], profile({ experience, ...extra }), EXERCISES, DAY0);
  assert.equal(at('beginner').weight, 10);
  assert.equal(at('intermediate').weight, 12.5);
  assert.equal(at('advanced').weight, 15);
  assert.equal(at('beginner').kind, 'calibration');
  assert.equal(at('beginner', { loadIncrementsKg: { machine: [20, 30, 40] } }).weight, 20, 'snapped to a load the athlete has');
  assert.deepEqual(at('beginner'), at('beginner'), 'same input, same output');
});

test('P4.5 a substitution keeps prescription semantics: equivalent carries the load, anything else starts a new baseline', () => {
  const incline = byId('incline_machine_press');
  const dumbbell = byId('dumbbell_bench_press');
  const w = T.createWorkout('A', DAY0, ['machine_chest_press'], EXERCISES, 'p');
  w.exercises[0].recommendedWeight = 22.5;
  w.exercises[0].sets.forEach((s) => { s.weight = 22.5; });
  const same = T.replaceWorkoutExercise(w, 'machine_chest_press', incline, EXERCISES);
  assert.equal(same.exercises[0].exerciseId, 'incline_machine_press');
  assert.equal(same.exercises[0].recommendedWeight, 22.5);
  assert.ok(same.exercises[0].sets.every((s) => s.weight === 22.5 && !s.completed));
  const other = T.replaceWorkoutExercise(w, 'machine_chest_press', dumbbell, EXERCISES);
  assert.equal(other.exercises[0].recommendedWeight, undefined);
  assert.ok(other.exercises[0].sets.every((s) => s.weight === undefined || s.weight !== 22.5));
  assert.equal(T.isEquivalentSubstitution(press, incline), true);
  assert.equal(T.isEquivalentSubstitution(press, dumbbell), false);
  assert.equal(T.isEquivalentSubstitution(byId('assisted_pullup'), byId('lat_pulldown')), false, 'assistance and stack loads never carry over');
});
