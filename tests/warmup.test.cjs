'use strict';
/*
 * Phase 13: warm-up and ramp generation (src/engine/warmup.ts) and its session integration. Warm-ups are ordinary sets of type
 * 'warmup'; every analytics path already filters them through isWorkingSet, and these tests pin that.
 */
const { uiSource } = require('./ui-source.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, T, EXERCISES, byId, session, set, profile, addDays, DAY0, uid } = require('./phase1-helpers.cjs');

const W = E.warmup;
const R = W.WARMUP_RULES;
const G = E.guided;
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const rx = (id, load, p = {}, ctx) => W.warmupPrescription(byId(id), load, profile(p), ctx);
const loads = (r) => r.sets.map((s) => s.load);

test('P13.1 light and no-load work gets no warm-up, with a reason', () => {
  assert.deepEqual(rx('dumbbell_lateral_raise', 4), { sets: [], reason: 'light_load' });
  assert.deepEqual(rx('dumbbell_bicep_curl', 3), { sets: [], reason: 'light_load' });
  assert.deepEqual(rx('plank', undefined), { sets: [], reason: 'no_load' }, 'timed');
  assert.equal(rx('dead_bug', undefined).sets.length, 0, 'no external load');
  assert.deepEqual(rx('machine_chest_press', undefined), { sets: [], reason: 'no_working_load' });
  assert.deepEqual(rx('machine_chest_press', 0), { sets: [], reason: 'no_working_load' });
  assert.equal(rx('machine_chest_press', 5).sets.length, 0, 'a light machine load needs no ramp');
});

test('P13.2 machine: two ramp sets on valid machine increments, lighter than the working load', () => {
  const r = rx('machine_chest_press', 60);
  assert.deepEqual(r.sets.map((s) => [s.load, s.reps]), [[30, 8], [45, 5]]);
  assert.equal(r.reason, 'ramp');
  for (const s of r.sets) { assert.equal(s.load % byId('machine_chest_press').incrementKg, 0); assert.ok(s.load < 60); }
});

test('P13.2 dumbbell: loads come from the athlete\'s own dumbbells and never exceed what is available', () => {
  const list = [4, 8, 12, 16, 20, 24, 28, 32];
  const r = rx('dumbbell_bench_press', 32, { loadIncrementsKg: { dumbbell: list } });
  assert.ok(r.sets.length >= 1);
  for (const s of r.sets) assert.ok(list.includes(s.load) && s.load < 32, `${s.load} is a real dumbbell`);
  assert.deepEqual(loads(r), [16, 24], '50% and 75% of 32, on the list');
  // no list: a whole number of the exercise's increments at or below the percentage
  for (const s of rx('dumbbell_bench_press', 30).sets) { assert.equal(s.load % byId('dumbbell_bench_press').incrementKg, 0); assert.ok(s.load <= 30 * s.fraction + 1e-9, 'never above the percentage'); }
});

test('P13.2 barbell: heavy lifts ramp in three steps, and no ramp load is lighter than a known bar', () => {
  const heavy = rx('barbell_back_squat', 100, { barbellBarKg: 20 });
  assert.deepEqual(heavy.sets.map((s) => [s.load, s.reps]), [[40, 8], [60, 6], [80, 3]]);
  const light = rx('barbell_back_squat', 30, { barbellBarKg: 20 });
  for (const s of light.sets) assert.ok(s.load >= 20, 'never under the bar');
  assert.deepEqual(loads(light), [22.5], '80% of 30 is 24: the largest whole 2.5 kg step at or under it');
  const noBar = rx('barbell_back_squat', 30);
  assert.ok(noBar.sets.length >= light.sets.length, 'without a known bar nothing is assumed');
  const barbellOnList = rx('barbell_bench_press', 60, { loadIncrementsKg: { barbell: [20, 30, 40, 50, 60, 70, 80] } });
  assert.deepEqual(loads(barbellOnList), [30, 40]);
  assert.equal(loads(E.warmup.warmupPrescription(byId('barbell_back_squat'), 100, profile({ barbellBarKg: 20 }))).length, 3);
});

test('P13.3 bodyweight: repetition preparation only, never a numeric load, only where it is meaningful', () => {
  const r = rx('push_up', 0);
  assert.deepEqual(r, { sets: [{ kind: 'movement', reps: 5 }], reason: 'movement_prep' });
  assert.equal(r.sets[0].load, undefined);
  assert.equal(rx('push_up', 0, {}, { prepared: W.preparedMuscles(byId('barbell_bench_press')) }).sets.length, 0, 'already prepared');
  assert.equal(rx('glute_bridge', 0).sets[0].kind, 'movement');
  for (const id of EXERCISES.filter((e) => e.loadSemantics === 'bodyweight' || e.loadSemantics === 'none').map((e) => e.id)) for (const s of rx(id, 0).sets) assert.equal(s.load, undefined, `${id} gets no invented weight`);
});

test('P13.3 assisted: the warm-up has MORE assistance (lighter), on the athlete\'s own list, never less', () => {
  const r = rx('assisted_pullup', 30);
  assert.deepEqual(r.sets.map((s) => [s.kind, s.load]), [['assisted', 35]]);
  const list = rx('assisted_pullup', 30, { loadIncrementsKg: { assisted_pullup: [10, 20, 30, 40, 50] } });
  assert.deepEqual(loads(list), [50], 'two list steps more assistance');
  const top = rx('assisted_pullup', 50, { loadIncrementsKg: { assisted_pullup: [10, 20, 30, 40, 50] } });
  assert.deepEqual(top, { sets: [], reason: 'no_valid_load' }, 'already at the most assistance on the list: nothing lighter exists, and the direction is never reversed');
  for (const s of rx('assisted_pullup', 25).sets) assert.ok(s.load > 25);
  const sets = W.warmupSetLogs(byId('assisted_pullup'), r, 'p', profile());
  assert.equal(sets[0].assistance, 35);
  assert.equal(sets[0].weight, undefined);
  assert.equal(sets[0].loadDetail.kind, 'assistance');
});

test('P13.4 loads are valid: ascending, under the working load by at least one step, on the list or increment, never impossible', () => {
  const lists = [undefined, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], [60, 80, 100], [2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20]];
  for (const ex of EXERCISES.filter((e) => ['stack', 'total', 'per_hand'].includes(e.loadSemantics))) for (const list of lists) for (const working of [5, 12.5, 20, 40, 60, 100, 140]) {
    const p = profile(list ? { loadIncrementsKg: Object.fromEntries([ex.id, ...ex.equipment].map((k) => [k, list])) } : {});
    const r = W.warmupPrescription(ex, working, p);
    let prev = 0;
    for (const s of r.sets) {
      assert.ok(s.load > prev, `${ex.id} ${working}: ascending`);
      assert.ok(s.load < working, `${ex.id} ${working}: under the working load`);
      assert.ok(s.load > 0 && Number.isFinite(s.load));
      if (list) assert.ok(list.includes(s.load), `${ex.id} ${working}: ${s.load} is on the list`);
      prev = s.load;
    }
    assert.ok(r.sets.length <= 3);
  }
  // a list with nothing light enough drops the set instead of approximating
  const r = rx('barbell_bench_press', 80, { loadIncrementsKg: { barbell: [60, 65, 70, 75, 80] } });
  assert.deepEqual(loads(r), [60], '50% (40) is below the lightest load and is dropped, 75% (60) is kept');
});

test('P13.6 a movement is prepared only when ALL its primary muscles were, and a compound needs a heavy enough load to be re-warmed', () => {
  const multi = EXERCISES.find((e) => ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull'].includes(e.pattern) && e.primaryMuscles.length >= 2 && e.id === 'leg_press');
  assert.ok(multi, 'a compound with two primary muscles exists');
  const partly = W.warmupPrescription(multi, 60, profile(), { prepared: [multi.primaryMuscles[0]] });
  assert.equal(partly.reason, 'ramp');
  assert.equal(partly.sets.length, 3, 'one prepared muscle is not enough: the full ramp');
  const all = W.warmupPrescription(multi, 60, profile(), { prepared: multi.primaryMuscles });
  assert.equal(all.sets.length, 1);
  const chest = W.preparedMuscles(byId('barbell_bench_press'));
  assert.deepEqual(rx('machine_chest_press', 15, {}, { prepared: chest }), { sets: [], reason: 'prepared' }, 'a light prepared compound needs nothing');
  assert.equal(rx('machine_chest_press', 20, {}, { prepared: chest }).sets.length, 1);
});

test('P13.5 heavier working loads get more ramping than lighter ones, and trivial loads none', () => {
  const count = (w) => rx('barbell_back_squat', w).sets.length;
  assert.equal(count(5), 0);
  assert.ok(count(20) <= count(40) && count(40) <= count(100));
  assert.equal(count(100), 3);
  assert.equal(count(20), 2);
});

test('P13.6 first-vs-later context: the first compound gets the ramp, later movements for prepared muscles get less or nothing', () => {
  const planner = W.createWarmupPlanner(profile());
  const first = planner.next(byId('barbell_bench_press'), 60, 'a');
  const second = planner.next(byId('machine_chest_press'), 60, 'b');
  const curl = planner.next(byId('dumbbell_bicep_curl'), 10, 'c');
  const triceps = planner.next(byId('cable_triceps_pushdown'), 30, 'd');
  const squat = planner.next(byId('leg_press'), 100, 'e');
  assert.equal(first.length, 3, 'a heavy barbell press ramps in three');
  assert.deepEqual(second.map((s) => s.weight), [40], 'chest is prepared: one 70% set (42 rounded down to the 2.5 kg step)');
  assert.equal(curl.length, 1, 'biceps were not worked by a press: its own preparation');
  assert.equal(triceps.length, 0, 'triceps are prepared by the pressing');
  assert.equal(squat.length, 3, 'unrelated lower body gets its own preparation');
  assert.equal(planner.next(byId('leg_press'), 100, 'f').length, 1, 'the same lift again is prepared');
  assert.equal(W.createWarmupPlanner(profile()).next(byId('barbell_bench_press'), 60, 'a', true).length, 0, 'a skipped exercise gets none and prepares nothing');
  const skippedFirst = W.createWarmupPlanner(profile());
  skippedFirst.next(byId('barbell_bench_press'), 60, 'x', true);
  assert.equal(skippedFirst.next(byId('machine_chest_press'), 60, 'y').length, 2, 'a skipped exercise did not prepare the chest');
});

test('P13.7 warm-up records: type warmup, not completed, deterministic ids, exact loads, load detail', () => {
  const ex = byId('barbell_back_squat');
  const a = W.warmupSetLogs(ex, rx('barbell_back_squat', 100, { barbellBarKg: 20 }), 'w1-0', profile({ barbellBarKg: 20 }));
  const b = W.warmupSetLogs(ex, rx('barbell_back_squat', 100, { barbellBarKg: 20 }), 'w1-0', profile({ barbellBarKg: 20 }));
  assert.deepEqual(a, b);
  assert.deepEqual(a.map((s) => s.id), ['w1-0-wu0', 'w1-0-wu1', 'w1-0-wu2']);
  assert.ok(a.every((s) => s.type === 'warmup' && s.completed === false));
  assert.deepEqual(a.map((s) => s.weight), [40, 60, 80]);
  assert.equal(a[0].loadDetail.kind, 'barbell');
  assert.equal(a[0].loadDetail.barWeightKg, 20);
  const custom = W.warmupSetLogs(byId('dumbbell_bench_press'), rx('dumbbell_bench_press', 32, { loadIncrementsKg: { dumbbell: [4, 8, 12, 16, 20, 24, 28, 32] } }), 'x', profile());
  assert.deepEqual(custom.map((s) => s.weight), [16, 24], 'a custom load is stored as generated, never re-rounded');
});

/* ---------- session integration ---------- */

function workoutWith(ex, warmups, working) {
  const w = session(ex, DAY0, [...warmups, ...working], { status: 'in_progress' });
  w.exercises[0].recommendedWeight = 60;
  w.guidedSession = { phase: 'set_ready', exerciseIndex: 0, setIndex: 0 };
  return w;
}
const pressEx = byId('machine_chest_press');
const warmupLogs = () => W.warmupSetLogs(pressEx, rx('machine_chest_press', 60), 'w', profile());
const workingLogs = () => [0, 1, 2].map(() => ({ ...set(pressEx, 60, 10), completed: false }));

test('P13.8 completing a warm-up goes straight to a short rest: no feedback step, no change to the working prescription', () => {
  const w = workoutWith(pressEx, warmupLogs(), workingLogs());
  const done = G.completeSet(w, 0, 0, '2026-03-02T10:00:00.000Z');
  assert.equal(done.exercises[0].sets[0].completed, true);
  assert.equal(done.guidedSession.phase, 'rest', 'warm-ups never open the "how did that feel" feedback');
  assert.equal(done.guidedSession.restTargetSec, R.restSec);
  assert.equal(done.exercises[0].recommendedWeight, 60);
  assert.deepEqual(done.exercises[0].sets.slice(2).map((s) => [s.weight, s.completed]), [[60, false], [60, false], [60, false]]);
  const next = G.continueAfterRest(done).workout;
  assert.equal(next.guidedSession.setIndex, 1, 'the next warm-up');
  const working = G.completeSet(workoutWith(pressEx, [], workingLogs()), 0, 0);
  assert.equal(working.guidedSession.phase, 'feedback', 'a working set still opens feedback');
});

test('P13.8 skipping a warm-up changes nothing else and never blocks the session', () => {
  let w = workoutWith(pressEx, warmupLogs(), workingLogs());
  const before = JSON.stringify(w.exercises[0].sets.filter((s) => s.type !== 'warmup'));
  const first = w.exercises[0].sets[0].id;
  w = T.markWorkoutSetSkipped(w, pressEx.id, first);
  assert.equal(w.exercises[0].sets[0].disposition, 'skipped');
  assert.equal(JSON.stringify(w.exercises[0].sets.filter((s) => s.type !== 'warmup')), before, 'the working prescription is untouched');
  assert.equal(w.exercises[0].recommendedWeight, 60);
  const p = G.normalizeGuidedPosition(w);
  assert.equal(p.guidedSession.setIndex, 1, 'the guided flow moves past a skipped warm-up');
  // skip every warm-up, finish the working sets: the exercise and the session complete
  for (const s of w.exercises[0].sets.filter((x) => x.type === 'warmup' && x.disposition !== 'skipped')) w = T.markWorkoutSetSkipped(w, pressEx.id, s.id);
  const nextIdx = G.nextIncompleteSet(w, 0, -1);
  assert.equal(w.exercises[0].sets[nextIdx].type, 'working');
  w.exercises[0].sets.filter((x) => x.type === 'working').forEach((x) => { x.completed = true; });
  assert.equal(G.nextIncompleteSet(w, 0, -1), -1, 'no pending set remains');
  assert.equal(G.nextIncompleteExercise({ ...w, exercises: [w.exercises[0], w.exercises[0]] }, 0), -1);
});

test('P13.8 editing a warm-up is local to the warm-up: the UI path never touches the working load', () => {
  const main = uiSource();
  // the set editor's change handler patches exactly the selected set (the old stepper helper that also guarded this was dead code and is gone)
  assert.match(main, /const ss=e\?\.sets\.find\(z=>z\.id===activeSet\.id\);\s*if\(!e\|\|!ss\)return x;\s*Object\.assign\(ss,p\);/, 'editing a warm-up load only changes that set');
  assert.doesNotMatch(main, /adjustActiveSet/, 'no second, unused adjustment path remains');
  const w = workoutWith(pressEx, warmupLogs(), workingLogs());
  w.exercises[0].sets[0].weight = 25; // an edit of the first warm-up
  w.exercises[0].sets[0].reps = 10;
  const before = T.personalizedLoad(pressEx, [w].map((x) => ({ ...x, status: 'completed' })), profile(), EXERCISES, addDays(DAY0, 3));
  const unedited = workoutWith(pressEx, warmupLogs(), workingLogs());
  assert.deepEqual(T.personalizedLoad(pressEx, [unedited].map((x) => ({ ...x, status: 'completed' })), profile(), EXERCISES, addDays(DAY0, 3)), before, 'a warm-up edit never reaches the prescription');
  const added = T.addWorkoutSet(w, pressEx.id, EXERCISES, w.exercises[0].sets[0]);
  assert.equal(added.exercises[0].sets.at(-1).type, 'working', 'a set added while a warm-up is selected is a working set');
  assert.equal(added.exercises[0].prescribedSets, 4);
  assert.equal(T.removeWorkoutSet(w, pressEx.id, w.exercises[0].sets[0].id).exercises[0].prescribedSets, 3, 'removing a warm-up leaves the prescription alone');
  const onlyOneWorking = workoutWith(pressEx, warmupLogs(), [workingLogs()[0]]);
  assert.equal(T.removeWorkoutSet(onlyOneWorking, pressEx.id, onlyOneWorking.exercises[0].sets[2].id), onlyOneWorking, 'the last working set stays');
});

test('P13.9 warm-ups are excluded from every training calculation: history with and without them gives identical results', () => {
  const ex = pressEx;
  const heavyWarm = (day, loadW) => ({ ...set(ex, loadW, 12, 0), type: 'warmup' });
  const build = (withWarmups) => [0, 3, 6, 9, 12, 15].map((d, i) => session(ex, addDays(DAY0, d), [
    ...(withWarmups ? [heavyWarm(d, 100 + i * 20), heavyWarm(d, 500)] : []),
    ...[0, 1, 2].map(() => set(ex, 40 + i * 2.5, 9, 2)),
  ]));
  const a = build(true), b = build(false);
  const asOf = addDays(DAY0, 18);
  const p = profile();
  assert.deepEqual(T.personalizedLoad(ex, a, p, EXERCISES, asOf), T.personalizedLoad(ex, b, p, EXERCISES, asOf), 'progression and longitudinal state');
  assert.deepEqual(T.exerciseExposures(ex, a).exposures, T.exerciseExposures(ex, b).exposures, 'longitudinal exposure');
  assert.deepEqual(a.map((w) => T.volumeForWorkout(w, EXERCISES)), b.map((w) => T.volumeForWorkout(w, EXERCISES)), 'volume');
  assert.deepEqual(a.map((w) => T.sessionAssessment(w, EXERCISES, []).completedSets), b.map((w) => T.sessionAssessment(w, EXERCISES, []).completedSets), 'working-set completion');
  assert.deepEqual(a.map((w) => T.detectAchievements(w, EXERCISES, []).map((x) => x.type || x.kind || x.title)), b.map((w) => T.detectAchievements(w, EXERCISES, []).map((x) => x.type || x.kind || x.title)), 'PRs');
  assert.deepEqual(T.bestLoad(ex, a.flatMap((w) => w.exercises[0].sets)), T.bestLoad(ex, b.flatMap((w) => w.exercises[0].sets)));
  const strip = (x) => JSON.stringify(x);
  assert.equal(strip(T.recoveryAssessment(a, EXERCISES, asOf)), strip(T.recoveryAssessment(b, EXERCISES, asOf)), 'fatigue and deload');
  assert.equal(T.workloadFatigue(a, EXERCISES), T.workloadFatigue(b, EXERCISES));
  // a workout with only warm-ups logged is not a real completed workout
  const onlyWarm = session(ex, DAY0, [{ ...set(ex, 20, 10), type: 'warmup' }]);
  assert.equal(T.hasLoggedSets(onlyWarm), false);
  assert.equal(T.sessionAssessment(onlyWarm, EXERCISES, []).completedSets, 0);
  // selection exposure ignores them too
  assert.equal(E.selection.rankForPattern('horizontal_push', EXERCISES, { equipment: ['machine'], experience: 'beginner', history: [onlyWarm] }).length, E.selection.rankForPattern('horizontal_push', EXERCISES, { equipment: ['machine'], experience: 'beginner' }).length);
  const src = code('src/engine/warmup.ts');
  assert.doesNotMatch(src, /isWorkingSet|setLoad\(|bestLoad|progression\(|personalizedLoad|volumeForWorkout/, 'the generator reads no training evidence');
});

test('P13.10 warm-ups never change a working load: the prescription is read, not written', () => {
  const src = code('src/engine/warmup.ts');
  assert.doesNotMatch(src, /recommendedWeight|workingLoads|\.recommendations|weight\s*=\s*[^=]*working/i, 'nothing is written back to the working load');
  const p = profile();
  for (const id of ['machine_chest_press', 'barbell_back_squat', 'assisted_pullup', 'push_up']) {
    const frozen = structuredClone(byId(id));
    W.warmupPrescription(frozen, 60, p);
    assert.deepEqual(frozen, byId(id), 'the exercise is not mutated');
  }
});

test('P13.11 deterministic: the same input gives the same warm-up, in any order, with no randomness', () => {
  const ids = EXERCISES.map((e) => e.id);
  const run = () => JSON.stringify(ids.map((id) => rx(id, 60, { barbellBarKg: 20 })));
  const ref = run();
  for (let i = 0; i < 3; i++) assert.equal(run(), ref);
  assert.equal(JSON.stringify([...ids].reverse().map((id) => rx(id, 60, { barbellBarKg: 20 })).reverse()), ref);
  assert.doesNotMatch(code('src/engine/warmup.ts'), /Math\.random|Date\.now|new Date\(|localStorage|fetch\(|uid\(/, 'no randomness, clock, storage or network');
});

test('P13.12 golden warm-ups for representative exercises', () => {
  const golden = JSON.parse(read('tests/golden/warmups.json'));
  for (const g of golden) {
    const p = profile(g.profile || {});
    const out = W.warmupPrescription(byId(g.id), g.working, p, g.prepared ? { prepared: g.prepared } : undefined);
    assert.deepEqual(out, g.expect, g.name);
  }
  assert.ok(golden.length >= 12);
});

test('P13.13 integration points: generated at first hydration only, shown as warm-ups, and counted out of the working-set totals', () => {
  const main = uiSource();
  assert.match(main, /const generated=warmupPlanner\.next\(/);
  assert.match(main, /firstHydration&&!trimmedSets\.some\(isWarm\)\?generated:\[\]/, 'once per exercise, and never over warm-ups that already exist');
  assert.match(main, /setCounter\(activeExercise\.sets,setIndex\)/);
  assert.match(main, /WARM-UP \$\{w\.indexOf\(x\)\+1\} \/ \$\{w\.length\}/);
  assert.doesNotMatch(main, /\{completedForExercise\} \/ \{activeExercise\.sets\.length\}/, 'completion counts working sets only');
  assert.match(code('src/engine/guidedSession.ts'), /set\.type === 'warmup'[\s\S]{0,400}phase: 'rest'/, 'warm-ups skip the feedback step');
  // a workout round-trips through the repository with its warm-ups intact and still excluded
  global.localStorage = { _m: new Map(), getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); }, clear() { this._m.clear(); } };
  const { repository, fresh } = E.loadRepository();
  const s = fresh();
  s.workouts = [session(pressEx, DAY0, [...warmupLogs().map((x) => ({ ...x, completed: true, weight: x.weight })), ...[0, 1, 2].map(() => set(pressEx, 40, 10))])];
  repository.save(s);
  const loaded = repository.load();
  assert.equal(loaded.workouts[0].exercises[0].sets.filter((x) => x.type === 'warmup').length, 2);
  assert.equal(T.sessionAssessment(loaded.workouts[0], EXERCISES, []).completedSets, 3);
});
