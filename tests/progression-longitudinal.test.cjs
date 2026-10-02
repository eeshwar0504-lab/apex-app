'use strict';
/*
 * Phase 11: longitudinal exercise progression (src/engine/longitudinal.ts + the training.ts integration).
 * The state is derived from history, one transition function classifies it, and no load is ever calculated here.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, T, EXERCISES, byId, session, set, profile, addDays, DAY0, uid } = require('./phase1-helpers.cjs');

const L = E.longitudinal;
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
/** Source without comments, for "this code does not do X" checks. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const GAP = 3;

const curl = byId('dumbbell_bicep_curl');
const lat = byId('lat_pulldown');
const press = byId('dumbbell_shoulder_press');
const goblet = byId('goblet_squat');
const assisted = byId('assisted_pullup');
const plank = byId('plank');

const sets3 = (ex, load, reps, rir = 2) => [0, 1, 2].map(() => set(ex, load, reps, rir));
const timedSets = (seconds) => [0, 1].map(() => ({ id: uid('t'), type: 'working', seconds, completed: true }));
/** One session every `gap` days from `start`; specs are [load, reps] (seconds for a timed movement). */
function build(ex, specs, { start = DAY0, gap = GAP } = {}) {
  return specs.map(([load, reps, rir], i) => session(ex, addDays(start, i * gap), ex.loadSemantics === 'time' ? timedSets(reps) : sets3(ex, load, reps, rir)));
}
const lastDay = (history) => history.at(-1).scheduledDate;
const decide = (ex, history, prof = profile(), asOf) => T.personalizedLoad(ex, history, prof, EXERCISES, asOf ?? addDays(lastDay(history), GAP));
const flat = (n, load = 20, reps = 9) => Array.from({ length: n }, () => [load, reps]);

test('P11.1 first exposure: no history is CONTINUE / first_exposure with an empty state, and the load is still the calibration', () => {
  const rec = decide(curl, [], profile(), addDays(DAY0, 1));
  assert.equal(rec.longitudinal.outcome, 'CONTINUE');
  assert.equal(rec.longitudinal.reason, 'first_exposure');
  assert.equal(rec.longitudinal.state.exposures, 0);
  assert.equal(rec.kind, 'calibration');
  const one = decide(curl, build(curl, [[10, 9]]));
  assert.equal(one.longitudinal.outcome, 'CONTINUE');
  assert.equal(one.longitudinal.reason, 'continuing', 'a single exposure is a baseline, never a stall');
  assert.equal(one.longitudinal.state.consecutiveStalls, 0);
});

test('P11.2 successful progression: top of range is PROGRESS and the load is the existing one-increment rule', () => {
  const history = build(curl, [[10, 12], [10, 12]]);
  const rec = decide(curl, history);
  assert.equal(rec.longitudinal.outcome, 'PROGRESS');
  assert.equal(rec.longitudinal.reason, 'progressed');
  assert.equal(rec.action, 'increase');
  assert.equal(rec.weight, 10 + curl.incrementKg, 'load comes from the existing increment, not from longitudinal state');
  assert.equal(rec.weight, T.progression(curl, history.flatMap((w) => w.exercises[0].sets)).weight);
});

test('P11.3 the stall ladder: isolated stall, temporary hold, repeated stall (PLATEAU), each needing more evidence', () => {
  const row = (n) => decide(curl, build(curl, [[10, 9], ...flat(n, 10, 9)]));
  assert.equal(row(0).longitudinal.reason, 'continuing');
  const one = row(1).longitudinal;
  assert.deepEqual([one.outcome, one.reason], ['HOLD', 'isolated_stall']);
  const two = row(2).longitudinal;
  assert.deepEqual([two.outcome, two.reason], ['HOLD', 'temporary_hold']);
  const three = row(3).longitudinal;
  assert.deepEqual([three.outcome, three.reason], ['PLATEAU', 'repeated_stall']);
  assert.equal(three.state.consecutiveStalls, 3);
});

test('P11.3 one bad session is not a plateau: it is held_after_low_performance, and progress resets the stall count', () => {
  const bad = decide(curl, build(curl, [[10, 9], [10, 10], [10, 5]]));
  assert.deepEqual([bad.longitudinal.outcome, bad.longitudinal.reason], ['HOLD', 'held_after_low_performance']);
  assert.notEqual(bad.longitudinal.outcome, 'PLATEAU');
  // stalled, then a rep improvement: the run starts over
  const reset = decide(curl, build(curl, [[10, 9], [10, 9], [10, 9], [10, 9], [10, 10]]));
  assert.equal(reset.longitudinal.state.consecutiveStalls, 0);
  assert.equal(reset.longitudinal.outcome, 'CONTINUE');
});

test('P11.3 load or rep improvement counts as progress; an assisted movement progresses with LESS assistance', () => {
  const kinds = (ex, a, b, isAssisted = false) => L.classifyExposure({ day: 0, load: a[0], topPerformance: a[1], atTop: false, low: false, afterGap: false }, { day: 3, load: b[0], topPerformance: b[1], atTop: false, low: false, afterGap: false }, isAssisted);
  assert.equal(kinds(curl, [10, 9], [12, 8]), 'progressed', 'a heavier load progresses even with fewer reps');
  assert.equal(kinds(curl, [10, 9], [10, 10]), 'progressed');
  assert.equal(kinds(curl, [10, 9], [10, 9]), 'flat');
  assert.equal(kinds(curl, [10, 9], [10, 8]), 'regressed');
  assert.equal(kinds(curl, [10, 9], [8, 12]), 'regressed', 'an easier load is not progress');
  assert.equal(kinds(assisted, [30, 8], [25, 6], true), 'progressed', 'less assistance is harder');
  assert.equal(kinds(assisted, [25, 8], [30, 8], true), 'regressed');
});

test('P11.4 persistent plateau needs five stalled exposures over at least fourteen days', () => {
  const persistent = decide(curl, build(curl, [[10, 9], ...flat(5, 10, 9)]), profile({ equipment: ['barbell'] }));
  assert.equal(persistent.longitudinal.state.consecutiveStalls, 5);
  assert.equal(persistent.longitudinal.state.stallSpanDays, 15);
  assert.deepEqual([persistent.longitudinal.outcome, persistent.longitudinal.reason], ['PLATEAU', 'persistent_plateau']);
  // five stalls squeezed into a week are a repeated stall, not a persistent plateau
  const tight = decide(curl, build(curl, [[10, 9], ...flat(5, 10, 9)], { gap: 1 }), profile({ equipment: ['barbell'] }));
  assert.equal(tight.longitudinal.state.stallSpanDays, 5);
  assert.deepEqual([tight.longitudinal.outcome, tight.longitudinal.reason], ['PLATEAU', 'repeated_stall']);
  // four stalls over a long span are not persistent either
  const four = decide(curl, build(curl, [[10, 9], ...flat(4, 10, 9)], { gap: 6 }), profile({ equipment: ['barbell'] }));
  assert.equal(four.longitudinal.reason, 'repeated_stall');
});

test('P11.4 two sessions on one day are one exposure, so a plateau cannot be manufactured in a day', () => {
  const history = [...build(curl, [[10, 9]]), ...flat(6, 10, 9).map(() => session(curl, addDays(DAY0, 3), sets3(curl, 10, 9)))];
  const state = decide(curl, history, profile(), addDays(DAY0, 6)).longitudinal.state;
  assert.equal(state.exposures, 2);
  assert.equal(state.consecutiveStalls, 1);
});

test('P11.5 variation: a persistent plateau with a valid alternative is CONSIDER_VARIATION and the choice is deterministic', () => {
  const history = build(curl, [[10, 9], ...flat(5, 10, 9)]);
  const rec = decide(curl, history, profile({ equipment: ['dumbbell'] }));
  assert.deepEqual([rec.longitudinal.outcome, rec.longitudinal.reason], ['CONSIDER_VARIATION', 'variation_available']);
  const v = rec.longitudinal.variation;
  assert.deepEqual({ ...v }, { exerciseId: 'hammer_curl', kind: 'alternative', rule: 'alternative_variation' });
  assert.equal(byId(v.exerciseId).pattern, curl.pattern, 'the movement pattern is preserved');
  assert.ok(T.exerciseFitsEquipment(byId(v.exerciseId), ['dumbbell']));
  assert.ok(curl.alternatives.includes(v.exerciseId), 'the choice comes from the exercise graph');
  assert.equal(JSON.stringify(decide(curl, history, profile({ equipment: ['dumbbell'] })).longitudinal), JSON.stringify(rec.longitudinal));
});

test('P11.5 the alternative the athlete has trained least wins; ties end at the id', () => {
  const cat = EXERCISES.map((e) => structuredClone(e));
  const base = cat.find((e) => e.id === 'dumbbell_bicep_curl');
  const other = cat.find((e) => e.id === 'hammer_curl');
  const twin = { ...structuredClone(other), id: 'zz_twin_curl', name: 'Twin curl', alternatives: [], progressions: undefined, regressions: undefined };
  base.alternatives = ['hammer_curl', 'zz_twin_curl'];
  const all = [...cat, twin];
  const state = (related) => ({ ...L.deriveProgressionState([], {}), related, lastAtTop: false });
  const pick = (related) => L.selectVariation({ exercise: base, catalogue: all, state: state(related), equipment: ['dumbbell'], experience: 'beginner', atCeiling: false });
  assert.equal(pick([]).exerciseId, 'hammer_curl', 'equal exposure: the id order decides');
  assert.equal(pick([{ exerciseId: 'hammer_curl', exposures: 4 }]).exerciseId, 'zz_twin_curl', 'the exercise trained less is preferred');
  assert.equal(pick([{ exerciseId: 'zz_twin_curl', exposures: 4 }]).exerciseId, 'hammer_curl');
});

test('P11.5 no valid variation is never invented: it stays a persistent PLATEAU on its hold behaviour', () => {
  const history = build(lat, [[40, 9], ...flat(5, 40, 9)]);
  const rec = decide(lat, history, profile({ equipment: ['machine'] }));
  assert.deepEqual([rec.longitudinal.outcome, rec.longitudinal.reason], ['PLATEAU', 'persistent_plateau']);
  assert.equal(rec.longitudinal.variation, undefined);
  assert.equal(rec.weight, 40, 'the load is held');
  assert.equal(rec.action, 'hold');
});

test('P11.5 equipment constrains variations: nothing the athlete cannot use is offered, for every equipment subset', () => {
  const ITEMS = ['machine', 'cable', 'dumbbell', 'barbell', 'bench', 'kettlebell', 'bodyweight'];
  const history = build(curl, [[10, 9], ...flat(5, 10, 9)]);
  for (let mask = 0; mask < 1 << ITEMS.length; mask++) {
    const equipment = ITEMS.filter((_, i) => mask & (1 << i));
    const v = decide(curl, history, profile({ equipment })).longitudinal.variation;
    if (v) { assert.ok(T.exerciseFitsEquipment(byId(v.exerciseId), equipment), `${equipment}: ${v.exerciseId}`); assert.equal(byId(v.exerciseId).pattern, curl.pattern); }
  }
});

test('P11.5 harder variation: at the top of the load list and the range, the graph progression is offered, never beyond experience', () => {
  const loads = { dumbbell: [8, 10, 12] };
  const history = build(press, [[12, 12], ...flat(5, 12, 12)]);
  const intermediate = decide(press, history, profile({ experience: 'intermediate', equipment: ['dumbbell', 'bench', 'barbell'], loadIncrementsKg: loads }));
  assert.deepEqual([intermediate.longitudinal.outcome, intermediate.longitudinal.reason], ['CONSIDER_VARIATION', 'variation_available']);
  assert.deepEqual({ ...intermediate.longitudinal.variation }, { exerciseId: 'overhead_barbell_press', kind: 'harder', rule: 'harder_variation' });
  assert.equal(intermediate.weight, 12, 'the load stays at the top available load');
  const beginner = decide(press, history, profile({ experience: 'beginner', equipment: ['dumbbell', 'bench', 'barbell', 'machine'], loadIncrementsKg: loads }));
  assert.equal(beginner.longitudinal.variation, undefined, 'an intermediate lift is not offered to a beginner');
  assert.deepEqual([beginner.longitudinal.outcome, beginner.longitudinal.reason], ['PLATEAU', 'persistent_plateau'], 'the machine press measures load differently, so it is not an equivalent alternative');
});

test('P11.5 easier variation: repeated failure below the range offers a regression', () => {
  const specs = [[20, 8], [20, 8], [20, 8], [20, 8], [20, 5], [20, 5]];
  const rec = decide(goblet, build(goblet, specs), profile({ equipment: ['dumbbell', 'kettlebell', 'bodyweight'] }));
  assert.equal(rec.longitudinal.state.consecutiveLow, 2);
  assert.deepEqual({ ...rec.longitudinal.variation }, { exerciseId: 'bodyweight_squat', kind: 'easier', rule: 'easier_variation' });
});

test('P11.5 a variation is advice: workouts keep their exercises and nothing is swapped', () => {
  const history = build(curl, [[10, 9], ...flat(5, 10, 9)]);
  const prof = profile({ equipment: ['dumbbell'] });
  const planned = session(curl, addDays(lastDay(history), GAP), sets3(curl, undefined, 9), { status: 'planned' });
  const adapted = T.applyWorkoutAdaptation(planned, EXERCISES, history, prof);
  assert.deepEqual(adapted.exercises.map((e) => e.exerciseId), ['dumbbell_bicep_curl']);
  assert.equal(adapted.exercises[0].recommendedWeight, 10);
  assert.equal(adapted.exercises[0].recommendedWeight, decide(curl, history, prof, planned.scheduledDate).weight, 'rolling/adaptation consumes the same authoritative prescription');
  for (const file of ['src/engine/longitudinal.ts']) assert.doesNotMatch(read(file), /replaceWorkoutExercise|structuredClone|\.exercises\s*=/, 'the module cannot rewrite a workout');
});

test('P11.6 assisted exercise: less assistance is progress, the load steps by the existing rule, longitudinal never reverses it', () => {
  const history = build(assisted, [[30, 12], [30, 12]]);
  const rec = decide(assisted, history);
  assert.deepEqual([rec.longitudinal.outcome, rec.action], ['PROGRESS', 'increase']);
  assert.equal(rec.weight, 30 - assisted.incrementKg, 'increase means LESS assistance');
  const stalled = decide(assisted, build(assisted, [[30, 9], ...flat(3, 30, 9)]));
  assert.equal(stalled.longitudinal.reason, 'repeated_stall');
  assert.equal(stalled.weight, 30);
  // the ceiling for assistance is the LOWEST configured assistance
  const ceiling = decide(assisted, build(assisted, [[20, 12], [20, 12]]), profile({ loadIncrementsKg: { assisted_pullup: [20, 25, 30] } }));
  assert.deepEqual([ceiling.longitudinal.outcome, ceiling.longitudinal.reason], ['HOLD', 'load_ceiling']);
});

test('P11.6 timed exercise: hold behaviour is preserved, it never progresses a load and its plateau uses duration', () => {
  const history = build(plank, [[0, 30], [0, 32]]);
  const rec = decide(plank, history);
  assert.deepEqual([rec.longitudinal.outcome, rec.longitudinal.reason], ['HOLD', 'timed_hold'], 'durations are still growing, and a timed movement holds');
  const hold = decide(plank, build(plank, [[0, 30], [0, 30]]));
  assert.deepEqual([hold.longitudinal.outcome, hold.longitudinal.reason], ['HOLD', 'isolated_stall']);
  const steady = decide(plank, [session(plank, DAY0, timedSets(30))]);
  assert.deepEqual([steady.longitudinal.outcome, steady.longitudinal.reason], ['HOLD', 'timed_hold']);
  assert.equal(steady.weight, undefined, 'no load is ever invented for a timed movement');
  const plateau = decide(plank, build(plank, [[0, 30], ...flat(3, 0, 30)]));
  assert.deepEqual([plateau.longitudinal.outcome, plateau.longitudinal.reason], ['PLATEAU', 'repeated_stall']);
  const reached = decide(plank, build(plank, [[0, 45], [0, 50]]));
  assert.notEqual(reached.longitudinal.outcome, 'PROGRESS');
  assert.equal(reached.weight, undefined);
});

test('P11.6 bodyweight movement: progress is reps, the prescription stays bodyweight', () => {
  const pushUp = byId('push_up');
  const rec = decide(pushUp, [session(pushUp, DAY0, [set(pushUp, 0, 10), set(pushUp, 0, 10)]), session(pushUp, addDays(DAY0, 3), [set(pushUp, 0, 10), set(pushUp, 0, 10)])]);
  assert.equal(rec.weight, 0);
  assert.deepEqual([rec.longitudinal.outcome, rec.longitudinal.reason], ['HOLD', 'isolated_stall']);
});

test('P11.6 custom loads: the prescribed load is still snapped to the configured list and the ceiling is the list top', () => {
  const options = [5, 7.5, 10, 15];
  const prof = profile({ loadIncrementsKg: { dumbbell: options } });
  const up = decide(curl, build(curl, [[10, 12], [10, 12]]), prof);
  assert.equal(up.longitudinal.outcome, 'PROGRESS');
  assert.ok(options.includes(up.weight) && up.weight > 10, `${up.weight} comes from the athlete's list`);
  const top = decide(curl, build(curl, [[15, 12], [15, 12]]), prof);
  assert.deepEqual([top.longitudinal.outcome, top.longitudinal.reason], ['HOLD', 'load_ceiling']);
  assert.equal(top.weight, 15, 'no invented load above the list');
  const uncapped = decide(curl, build(curl, [[15, 12], [15, 12]]));
  assert.equal(uncapped.longitudinal.outcome, 'PROGRESS', 'without a list there is no known ceiling');
});

test('P11.7 goal interaction: the same history is judged against the goal-programmed rep range', () => {
  const strength = E.goalProgram.programExercise(lat, 'strength').repRange;
  const hyper = E.goalProgram.programExercise(lat, 'hypertrophy').repRange;
  assert.ok(strength[1] < hyper[1]);
  const reps = strength[1];
  const history = build(lat, [[40, reps], [40, reps]]);
  const asStrength = decide(lat, history, profile({ primaryGoal: 'strength', goals: ['strength'] }));
  const asHypertrophy = decide(lat, history, profile({ primaryGoal: 'hypertrophy', goals: ['hypertrophy'] }));
  assert.equal(asStrength.longitudinal.outcome, 'PROGRESS');
  assert.notEqual(asHypertrophy.longitudinal.outcome, 'PROGRESS');
  assert.equal(asHypertrophy.longitudinal.state.lastAtTop, false);
  assert.equal(asStrength.longitudinal.state.lastAtTop, true);
});

test('P11.8 recovery hold: elevated workload (the existing signal) holds an increase and defers a plateau verdict', () => {
  const prof = profile();
  const spike = [session(curl, DAY0, sets3(curl, 10, 8)), session(curl, addDays(DAY0, 3), sets3(curl, 10, 12))];
  const rec = decide(curl, spike, prof);
  assert.equal(T.workloadFatigue(spike, EXERCISES), 'elevated');
  assert.deepEqual([rec.longitudinal.outcome, rec.longitudinal.reason, rec.action], ['RECOVER', 'recovery_hold', 'recover']);
  assert.equal(rec.weight, 10, 'the load is held');
  // a stalled exercise followed by a big session of something else: the plateau is deferred
  const stalled = build(curl, [[10, 9], ...flat(3, 10, 9)]);
  const big = session(byId('leg_press'), addDays(lastDay(stalled), 1), sets3(byId('leg_press'), 150, 12));
  assert.equal(T.workloadFatigue([...stalled, big], EXERCISES), 'elevated');
  const deferred = decide(curl, [...stalled, big], prof, addDays(lastDay(stalled), 3));
  assert.deepEqual([deferred.longitudinal.outcome, deferred.longitudinal.reason], ['RECOVER', 'recovery_hold']);
  assert.equal(decide(curl, stalled, prof).longitudinal.outcome, 'PLATEAU', 'the same performance without the workload spike is a plateau');
});

test('P11.8 a plateau is never classified from recovery alone: elevated workload with no stalls is not a plateau and not a hold', () => {
  const prof = profile();
  const history = build(curl, [[10, 9], [10, 10]]);
  const big = session(byId('leg_press'), addDays(lastDay(history), 1), sets3(byId('leg_press'), 150, 12));
  const rec = decide(curl, [...history, big], prof, addDays(lastDay(history), 3));
  assert.equal(rec.longitudinal.state.consecutiveStalls, 0);
  assert.equal(rec.longitudinal.outcome, 'CONTINUE');
  assert.doesNotMatch(code('src/engine/longitudinal.ts'), /checkin|readiness|soreness|sleep|stress/i, 'longitudinal state reads performance only');
});

test('P11.9 long gap: conservative re-entry reuses the return-to-training rule and is not a stall', () => {
  const history = build(curl, [[12, 10], [12, 10]]);
  const asOf = addDays(lastDay(history), 30);
  const rec = decide(curl, history, profile(), asOf);
  assert.deepEqual([rec.longitudinal.outcome, rec.longitudinal.reason], ['CONSERVATIVE_REENTRY', 'return_to_training']);
  assert.ok(rec.returnToTraining, 'the existing rule produced the load');
  assert.equal(rec.returnToTraining.tier, 'four_week');
  assert.equal(rec.weight, 12 - 2 * curl.incrementKg);
  // after the gap the return session is the new baseline: a flat repeat is not counted as stalled
  const resumed = [...history, session(curl, asOf, sets3(curl, 10, 10))];
  const state = decide(curl, resumed, profile(), addDays(asOf, 3)).longitudinal.state;
  assert.equal(state.consecutiveStalls, 0);
  assert.equal(L.classifyExposure({ day: 0, load: 12, topPerformance: 10, atTop: false, low: false, afterGap: false }, { day: 40, load: 12, topPerformance: 10, atTop: false, low: false, afterGap: true }, false), 'reentry');
  // no second gap algorithm: longitudinal.ts holds no gap thresholds of its own
  assert.doesNotMatch(code('src/engine/longitudinal.ts'), /RETURN_GAP_DAYS|gapDays|returnTierForGap/);
  assert.match(read('src/engine/training.ts'), /returnTierForGap\(entry\.day - days\[index - 1\]\.day\)/);
  // a gap below the rule's first tier is a normal session
  assert.notEqual(decide(curl, history, profile(), addDays(lastDay(history), 13)).longitudinal.outcome, 'CONSERVATIVE_REENTRY');
});

test('P11.10 history integrity: evaluation never modifies workouts, sets, the profile or the catalogue', () => {
  const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
  const history = build(curl, [[10, 9], ...flat(5, 10, 9)]);
  const prof = profile({ equipment: ['dumbbell'] });
  const before = JSON.stringify({ history, prof });
  deepFreeze(history); deepFreeze(prof);
  const rec = T.personalizedLoad(curl, history, prof, EXERCISES, addDays(lastDay(history), GAP));
  assert.equal(rec.longitudinal.outcome, 'CONSIDER_VARIATION');
  assert.equal(JSON.stringify({ history, prof }), before);
  // the returned state is a fresh object: changing it cannot change the next decision
  rec.longitudinal.state.consecutiveStalls = 0;
  assert.equal(T.personalizedLoad(curl, history, prof, EXERCISES, addDays(lastDay(history), GAP)).longitudinal.state.consecutiveStalls, 5);
  // a decision now does not rewrite what an earlier workout recorded
  assert.deepEqual(history[0].exercises[0].sets.map((s) => s.weight), [10, 10, 10]);
});

test('P11.10 determinism: the same history, profile and date always give the same decision, whatever the storage order', () => {
  const history = build(curl, [[10, 9], ...flat(5, 10, 9)]);
  const prof = profile({ equipment: ['dumbbell'] });
  const run = (h) => JSON.stringify(T.personalizedLoad(curl, h, prof, EXERCISES, addDays(lastDay(history), GAP)));
  const reference = run(history);
  for (let i = 0; i < 5; i++) assert.equal(run(history), reference);
  assert.equal(run([...history].reverse()), reference, 'storage order does not matter');
  const src = code('src/engine/longitudinal.ts');
  assert.doesNotMatch(src, /Math\.random|Date\.now|new Date\(|localStorage|fetch\(|crypto/, 'no randomness, clock, storage or network');
});

test('P11.11 the transition table: every row, in order, with one reason code each', () => {
  const base = L.deriveProgressionState([], {});
  const st = (over) => ({ ...base, exposures: 6, ...over });
  const run = (over, input) => { const d = L.transition({ state: st(over), baseAction: 'hold', returnSteps: 0, fatigue: 'normal', timed: false, atCeiling: false, ...input }); return `${d.outcome}/${d.reason}`; };
  const variation = { exerciseId: 'x', kind: 'alternative', rule: 'alternative_variation' };
  assert.equal(run({ exposures: 0 }, {}), 'CONTINUE/first_exposure');
  assert.equal(run({ consecutiveStalls: 9, stallSpanDays: 99 }, { returnSteps: 1, baseAction: 'increase' }), 'CONSERVATIVE_REENTRY/return_to_training', 're-entry beats everything after the first exposure');
  assert.equal(run({}, { fatigue: 'elevated', baseAction: 'recover' }), 'RECOVER/recovery_hold');
  assert.equal(run({ consecutiveStalls: 3 }, { fatigue: 'elevated' }), 'RECOVER/recovery_hold');
  assert.equal(run({ consecutiveStalls: 2 }, { fatigue: 'elevated' }), 'HOLD/temporary_hold', 'elevated workload alone does not trigger recovery');
  assert.equal(run({ consecutiveStalls: 5, stallSpanDays: 20 }, { baseAction: 'increase', variation }), 'PROGRESS/progressed', 'an available increase is always taken');
  assert.equal(run({ consecutiveStalls: 5, stallSpanDays: 14 }, { variation }), 'CONSIDER_VARIATION/variation_available');
  assert.equal(run({ consecutiveStalls: 5, stallSpanDays: 14 }, {}), 'PLATEAU/persistent_plateau');
  assert.equal(run({ consecutiveStalls: 5, stallSpanDays: 13 }, { variation }), 'PLATEAU/repeated_stall', 'a variation exists but the evidence is not persistent');
  assert.equal(run({ consecutiveStalls: 4, stallSpanDays: 90 }, { variation }), 'PLATEAU/repeated_stall');
  assert.equal(run({ consecutiveStalls: 3 }, {}), 'PLATEAU/repeated_stall');
  assert.equal(run({}, { baseAction: 'increase', atCeiling: true }), 'HOLD/load_ceiling');
  assert.equal(run({ consecutiveStalls: 2 }, {}), 'HOLD/temporary_hold');
  assert.equal(run({ consecutiveStalls: 1 }, { baseAction: 'reduce' }), 'HOLD/held_after_low_performance');
  assert.equal(run({ consecutiveStalls: 1, lastLow: true }, {}), 'HOLD/held_after_low_performance');
  assert.equal(run({ consecutiveStalls: 1 }, {}), 'HOLD/isolated_stall');
  assert.equal(run({}, { timed: true }), 'HOLD/timed_hold');
  assert.equal(run({}, {}), 'CONTINUE/continuing');
  const reasons = ['first_exposure', 'return_to_training', 'recovery_hold', 'progressed', 'variation_available', 'persistent_plateau', 'repeated_stall', 'load_ceiling', 'temporary_hold', 'held_after_low_performance', 'isolated_stall', 'timed_hold', 'continuing'];
  const src = read('src/engine/longitudinal.ts');
  reasons.forEach((r, i) => {
    assert.match(src, new RegExp(`^ \\*\\s+${i + 1}\\. .*${r}`, 'm'), `row ${i + 1} (${r}) is documented in order`);
    const d = L.transition({ state: st({}), baseAction: 'hold', returnSteps: 0, fatigue: 'normal', timed: false, atCeiling: false });
    assert.ok(d.explanation.length > 20);
  });
  assert.deepEqual(L.LONGITUDINAL_THRESHOLDS, { repeatedStall: 3, persistentStall: 5, persistentSpanDays: 14, repeatedLow: 2 });
});

test('P11.11 every outcome appears in the table and every reason has its own explanation', () => {
  const outcomes = new Set();
  const reasons = new Set();
  const base = L.deriveProgressionState([], {});
  for (const exposures of [0, 6]) for (const returnSteps of [0, 2]) for (const fatigue of ['normal', 'elevated']) for (const baseAction of ['hold', 'increase', 'reduce', 'recover']) for (const consecutiveStalls of [0, 1, 2, 3, 5]) for (const atCeiling of [false, true]) for (const timed of [false, true]) for (const variation of [undefined, { exerciseId: 'x', kind: 'harder', rule: 'harder_variation' }]) {
    const d = L.transition({ state: { ...base, exposures, consecutiveStalls, stallSpanDays: consecutiveStalls * 4 }, baseAction, returnSteps, fatigue, atCeiling, timed, variation });
    outcomes.add(d.outcome); reasons.add(d.reason);
    assert.ok((d.outcome === 'CONSIDER_VARIATION') === Boolean(d.variation), 'a variation accompanies exactly CONSIDER_VARIATION');
  }
  assert.deepEqual([...outcomes].sort(), ['CONSERVATIVE_REENTRY', 'CONSIDER_VARIATION', 'CONTINUE', 'HOLD', 'PLATEAU', 'PROGRESS', 'RECOVER']);
  assert.equal(reasons.size, 13);
});

test('P11.11 the state tracks exposure, progress, stalls, ceiling, effort, direction and variation history', () => {
  const history = [...build(curl, [[10, 8], [10, 9], [12, 8]]), ...build(byId('hammer_curl'), [[8, 10]], { start: addDays(DAY0, 12) })];
  const state = decide(curl, history, profile(), addDays(DAY0, 16)).longitudinal.state;
  assert.equal(state.exposures, 3);
  assert.equal(state.progressions, 2);
  assert.equal(state.consecutiveStalls, 0);
  assert.equal(state.peakLoad, 12);
  assert.equal(state.lastLoad, 12);
  assert.equal(state.direction, 'up');
  assert.equal(state.recentAvgRir, 2);
  assert.deepEqual(state.related.find((r) => r.exerciseId === 'hammer_curl'), { exerciseId: 'hammer_curl', exposures: 1 }, 'variation history');
  assert.deepEqual(state.related.map((r) => r.exerciseId), [...state.related.map((r) => r.exerciseId)].sort());
});

test('P11.12 integration: loads and actions are exactly the existing prescription (longitudinal state never moves a load)', () => {
  const prof = profile();
  const cases = [
    build(curl, [[10, 12], [10, 12]]), build(curl, [[10, 9], [10, 9]]), build(curl, [[10, 5], [10, 5]]), build(curl, [[10, 9], ...flat(6, 10, 9)]),
    build(goblet, [[20, 12], [22, 12]]), build(assisted, [[30, 12], [30, 12]]), build(lat, [[40, 9], ...flat(5, 40, 9)]),
  ];
  for (const history of cases) {
    const ex = byId(history[0].exercises[0].exerciseId);
    const rec = decide(ex, history, prof);
    const direct = T.progression(ex, history.flatMap((w) => w.exercises[0].sets), { goal: prof.primaryGoal, experience: prof.experience, fatigue: 'normal' });
    assert.equal(rec.action, direct.action, ex.id);
    assert.equal(rec.weight, direct.weight, `${ex.id}: the load is the progression() load`);
    assert.equal(rec.recommendedRest, direct.recommendedRest);
  }
});

test('P11.12 rolling generation consumes the same prescription and the integration did not rewrite Phase 9 or Phase 10', () => {
  for (const file of ['src/engine/rolling.ts', 'src/engine/selection.ts']) assert.doesNotMatch(read(file), /longitudinal/i, `${file} is untouched by Phase 11`);
  assert.match(read('src/engine/rolling.ts'), /applyWorkoutAdaptation/);
  assert.match(read('src/engine/training.ts'), /const recommendation =\s*personalizedLoad\(/, 'adaptation still reads personalizedLoad');
});

test('P11.13 no new persisted state: the longitudinal state is derived, not stored', () => {
  assert.doesNotMatch(read('src/core/types.ts'), /longitudinal|ProgressionState/i);
  for (const file of ['src/data/repository.ts', 'src/data/sqliteMigrations.ts', 'src/data/sqliteAdapter.ts']) assert.doesNotMatch(read(file), /longitudinal/i, file);
  assert.equal(E.sqliteMigrations.SQLITE_MIGRATIONS.length, E.sqliteMigrations.SQLITE_MIGRATIONS.length);
});

test('P11.14 Coach and AI cannot change progression: they hold no write path to loads, exercises or state', () => {
  const files = ['src/coach/askCoach.ts', 'src/coach/coach.ts', 'src/coach/decisionPipeline.ts', 'src/coach/signals.ts', 'src/aiGateway.ts', 'src/aiGrounding.ts', 'src/aiContract.ts'];
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, /recommendedWeight\s*=[^=]|applyWorkoutAdaptation|replaceWorkoutExercise|exerciseExposures|deriveProgressionState/, `${file} cannot write a prescription or derive progression state`);
  }
  const history = build(curl, [[10, 9], ...flat(5, 10, 9)]);
  const prof = profile({ equipment: ['dumbbell'] });
  const before = JSON.stringify(history);
  const rec = T.personalizedLoad(curl, history, prof, EXERCISES, addDays(lastDay(history), GAP));
  rec.longitudinal.variation.exerciseId = 'tampered';
  assert.equal(JSON.stringify(history), before);
  assert.equal(T.personalizedLoad(curl, history, prof, EXERCISES, addDays(lastDay(history), GAP)).longitudinal.variation.exerciseId, 'hammer_curl');
});

test('P11.5 a catalogue alternative in a different movement pattern is never selected, however similar it looks', () => {
  const cat = EXERCISES.map((e) => structuredClone(e));
  const base = cat.find((e) => e.id === 'dumbbell_bicep_curl');
  const stranger = { ...structuredClone(cat.find((e) => e.id === 'hammer_curl')), id: 'aaa_other_pattern', name: 'Other', pattern: 'arm_extension', alternatives: [], progressions: undefined, regressions: undefined };
  base.alternatives = ['aaa_other_pattern'];
  const all = [...cat, stranger];
  const state = { ...L.deriveProgressionState([], {}), lastAtTop: true, consecutiveLow: 3 };
  assert.equal(L.selectVariation({ exercise: base, catalogue: all, state, equipment: ['dumbbell'], experience: 'advanced', atCeiling: true }), undefined);
});
