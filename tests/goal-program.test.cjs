'use strict';
/*
 * P2: goal-aware programming. ONE definition (src/engine/goalProgram.ts, documented in docs/TRAINING_SEMANTICS.md):
 *   goal -> goal program -> programmed exercise (rep range, rest) + target RIR -> progression engine -> workout.
 * The expected values below are written out by hand from the documented table, not read back from the code.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, EXERCISES, byId, session, threeSets, profile, addDays, DAY0 } = require('./phase1-helpers.cjs');

const G = E.goalProgram;
const GOALS = ['strength', 'hypertrophy', 'fat_loss', 'fitness', 'general'];
const snapshot = JSON.stringify(EXERCISES);

/* [repRange, restSec] per goal */
const EXPECT = {
  machine_chest_press: { general: [[8, 12], 90], hypertrophy: [[8, 12], 90], strength: [[5, 9], 120], fat_loss: [[8, 12], 75], fitness: [[10, 14], 90] },
  leg_press: { general: [[8, 12], 120], hypertrophy: [[8, 12], 120], strength: [[5, 9], 150], fat_loss: [[8, 12], 105], fitness: [[10, 14], 120] },
  dumbbell_lateral_raise: { general: [[10, 15], 60], hypertrophy: [[10, 15], 60], strength: [[10, 15], 60], fat_loss: [[10, 15], 45], fitness: [[10, 15], 60] },
  cable_curl: { general: [[8, 12], 75], hypertrophy: [[8, 12], 75], strength: [[8, 12], 75], fat_loss: [[8, 12], 60], fitness: [[8, 12], 75] },
  assisted_pullup: { general: [[6, 12], 120], hypertrophy: [[6, 12], 120], strength: [[3, 9], 150], fat_loss: [[6, 12], 105], fitness: [[8, 14], 120] },
  // timed, no-load and bodyweight movements keep their catalogue reps (a goal cannot add load to them); rest still follows the goal
  plank: { general: [[20, 45], 60], hypertrophy: [[20, 45], 60], strength: [[20, 45], 60], fat_loss: [[20, 45], 45], fitness: [[20, 45], 60] },
  nordic_curl: { general: [[4, 8], 120], hypertrophy: [[4, 8], 120], strength: [[4, 8], 120], fat_loss: [[4, 8], 105], fitness: [[4, 8], 120] }
};

test('G1 the five goals program the documented rep range and rest, exercise by exercise', () => {
  for (const [id, byGoal] of Object.entries(EXPECT)) for (const goal of GOALS) {
    const ex = G.programExercise(byId(id), goal);
    assert.deepEqual([ex.repRange, ex.restSec], byGoal[goal], `${id} / ${goal}`);
  }
});

test('G2 target RIR by goal and experience', () => {
  const rir = (goal, experience) => G.goalTargetRir(goal, experience);
  assert.deepEqual(GOALS.map((g) => rir(g, 'beginner')), [2, 2, 2, 3, 2], 'beginner (strength, hypertrophy, fat_loss, fitness, general)');
  assert.deepEqual(GOALS.map((g) => rir(g, 'intermediate')), [2, 1, 2, 3, 2]);
  assert.deepEqual(GOALS.map((g) => rir(g, 'advanced')), [1, 1, 1, 2, 1]);
  assert.equal(rir('unknown', 'beginner'), 2);
  assert.equal(T.personalizedLoad(byId('machine_chest_press'), [], profile({ primaryGoal: 'fitness' }), EXERCISES).targetRir, 3, 'the prescription carries the goal RIR');
  assert.equal(T.personalizedLoad(byId('machine_chest_press'), [], profile({ primaryGoal: 'hypertrophy', experience: 'advanced' }), EXERCISES).targetRir, 1);
});

test('G3 every goal x every catalogue exercise: a valid, bounded prescription that preserves what the catalogue supports', () => {
  for (const goal of GOALS) for (const cat of EXERCISES) {
    const ex = G.programExercise(cat, goal);
    const [lo, hi] = ex.repRange;
    const label = `${cat.id} / ${goal}`;
    assert.ok(Number.isInteger(lo) && Number.isInteger(hi) && lo >= 1 && lo < hi, `${label}: a possible range ${ex.repRange}`);
    assert.equal(hi - lo, cat.repRange[1] - cat.repRange[0], `${label}: the width of the catalogue window is preserved`);
    assert.ok(Math.abs(lo - cat.repRange[0]) <= 3 && Math.abs(hi - cat.repRange[1]) <= 3, `${label}: bounded shift`);
    assert.ok(ex.restSec >= Math.min(45, cat.restSec) && ex.restSec <= 300 && Math.abs(ex.restSec - cat.restSec) <= 30, `${label}: rest ${ex.restSec}`);
    if (['time', 'none', 'bodyweight'].includes(cat.loadSemantics)) assert.deepEqual(ex.repRange, cat.repRange, `${label}: fixed prescription`);
    assert.equal(ex.id, cat.id);
    assert.equal(ex.loadSemantics, cat.loadSemantics);
    assert.deepEqual(ex.equipment, cat.equipment);
    assert.equal(G.programExercise(ex, goal), ex, `${label}: idempotent`);
    const back = G.programExercise(ex, 'general');
    assert.deepEqual([back.repRange, back.restSec], [cat.repRange, cat.restSec], `${label}: switching back restores the catalogue values, nothing accumulates`);
    const viaOther = G.programExercise(G.programExercise(cat, 'strength'), goal);
    assert.deepEqual([viaOther.repRange, viaOther.restSec], [ex.repRange, ex.restSec], `${label}: the result never depends on the previous goal`);
  }
  assert.equal(JSON.stringify(EXERCISES), snapshot, 'the catalogue is never mutated');
});

test('G4 general is the neutral baseline; unknown and missing goals are general, never an error', () => {
  for (const cat of EXERCISES) {
    const base = G.programExercise(cat, 'general');
    assert.deepEqual([base.repRange, base.restSec], [cat.repRange, cat.restSec]);
    for (const bad of [undefined, null, '', 'bulk', 42, {}, 'toString', '__proto__']) {
      const ex = G.programExercise(cat, bad);
      assert.deepEqual([ex.repRange, ex.restSec], [cat.repRange, cat.restSec], `${cat.id} / ${String(bad)}`);
    }
  }
  assert.equal(G.goalTargetRir('bulk', 'advanced'), 1);
});

test('G5 the progression engine stays the only authority: a goal moves the target range, the same rules decide', () => {
  const press = byId('machine_chest_press');
  const reps = (n) => [session(press, DAY0, threeSets(press, 20, n)), session(press, addDays(DAY0, 3), threeSets(press, 20, n))];
  const act = (goal, n) => T.personalizedLoad(press, reps(n), profile({ primaryGoal: goal }), EXERCISES, addDays(DAY0, 6));
  // 9 reps: top of strength 5-9 (increase), mid-range for 8-12 (hold), below fitness 10-14 (reduce once repeated)
  assert.equal(act('strength', 9).action, 'increase');
  assert.equal(act('general', 9).action, 'hold');
  assert.equal(act('hypertrophy', 9).action, 'hold');
  assert.equal(act('fat_loss', 9).action, 'hold');
  assert.equal(act('fitness', 9).action, 'reduce');
  // 12 reps: top of 8-12
  for (const g of ['general', 'hypertrophy', 'fat_loss']) assert.equal(act(g, 12).action, 'increase', g);
  assert.equal(act('fitness', 12).action, 'hold');
  assert.equal(act('strength', 12).action, 'increase');
  assert.equal(act('fitness', 14).action, 'increase');
  // below the range is a reduce under every goal (here 3 reps: below 5, 8 and 10)
  for (const g of GOALS) assert.equal(act(g, 3).action, 'reduce', g);
  // an increase is the same step whichever goal asked for it
  assert.equal(act('strength', 9).weight, act('general', 12).weight);
  // the evidence names the goal's range
  assert.match(act('strength', 9).evidence.join(' '), /5–9 reps/);
  assert.match(act('general', 9).evidence.join(' '), /8–12 reps/);
});

test('G6 rest: the recommendation, the prepared workout and the exercise agree for every goal', () => {
  const press = byId('machine_chest_press');
  const history = [session(press, DAY0, threeSets(press, 20, 10)), session(press, addDays(DAY0, 3), threeSets(press, 20, 10))];
  for (const goal of GOALS) {
    const p = profile({ primaryGoal: goal });
    const programmed = G.programExercise(press, goal);
    const planned = T.createWorkout('B', addDays(DAY0, 6), ['machine_chest_press'], EXERCISES, 'p');
    const prepared = T.applyWorkoutAdaptation(planned, EXERCISES, history, p);
    assert.deepEqual(prepared.exercises[0].repRange, programmed.repRange, `${goal}: planned workout shows the programmed range`);
    const rec = T.personalizedLoad(press, history, p, EXERCISES, addDays(DAY0, 6));
    assert.equal(prepared.exercises[0].restSec, rec.recommendedRest ?? programmed.restSec, `${goal}: planned workout rest = the prescription's rest`);
    assert.ok(rec.recommendedRest === undefined || rec.recommendedRest >= programmed.restSec, `${goal}: a decision never recommends less than the programmed rest`);
  }
});

test('G7 preparing a workout never rewrites an exercise that already has logged sets, nor a completed workout', () => {
  const press = byId('machine_chest_press');
  const done = session(press, DAY0, threeSets(press, 20, 10));
  const before = JSON.stringify(done);
  const started = T.createWorkout('B', addDays(DAY0, 3), ['machine_chest_press'], EXERCISES, 'p');
  started.exercises[0].sets[0] = { ...started.exercises[0].sets[0], completed: true, reps: 8, weight: 20 };
  const out = T.applyWorkoutAdaptation(started, EXERCISES, [done], profile({ primaryGoal: 'strength' }));
  assert.deepEqual(out.exercises[0].repRange, started.exercises[0].repRange, 'logged exercise keeps the range it was performed under');
  assert.equal(JSON.stringify(done), before, 'history untouched');
});

test('G8 same input, same plan and prescription, in any history order (metamorphic)', () => {
  const press = byId('machine_chest_press');
  const history = [0, 2, 4, 6, 8].map((d, i) => session(press, addDays(DAY0, d), threeSets(press, 20 + i * 2.5, 9 + (i % 2))));
  for (const goal of GOALS) {
    const p = profile({ primaryGoal: goal });
    const base = JSON.stringify(T.personalizedLoad(press, history, p, EXERCISES, addDays(DAY0, 11)));
    for (const order of [[...history].reverse(), [history[3], history[0], history[4], history[1], history[2]]]) {
      assert.equal(JSON.stringify(T.personalizedLoad(press, order, p, EXERCISES, addDays(DAY0, 11))), base, goal);
    }
    const plans = [0, 1, 2].map(() => JSON.stringify(T.buildPlan(p, EXERCISES, [{ kind: goal }]).exerciseSets));
    assert.equal(new Set(plans).size, 1, `${goal}: plan is deterministic`);
  }
});

test('G9 programmed exercises keep substitutions valid: ranking and equivalence do not depend on the goal', () => {
  const ids = (list) => list.map((r) => r.exercise.id).join(',');
  for (const goal of GOALS) {
    const programmed = G.programExercises(EXERCISES, goal);
    for (const cat of EXERCISES) {
      const source = programmed.find((e) => e.id === cat.id);
      for (const equipment of [['machine'], ['dumbbell', 'bench'], ['bodyweight'], undefined]) {
        assert.equal(ids(T.rankSubstitutes(source, programmed, equipment)), ids(T.rankSubstitutes(cat, EXERCISES, equipment)), `${cat.id} / ${goal} / ${JSON.stringify(equipment)}`);
        if (equipment) for (const r of T.rankSubstitutes(source, programmed, equipment)) assert.ok(T.exerciseFitsEquipment(r.exercise, equipment), 'equipment filtering still applies');
      }
    }
  }
});

test('G10 plans per goal still respect equipment, for programmed and catalogue exercises alike', () => {
  for (const goal of GOALS) for (const equipment of [['machine'], ['dumbbell', 'bench'], ['bodyweight']]) {
    const plan = T.buildPlan(profile({ primaryGoal: goal, equipment }), G.programExercises(EXERCISES, goal), [{ kind: goal }]);
    for (const ids of Object.values(plan.exerciseSets)) {
      assert.ok(ids.length > 0);
      for (const id of ids) assert.ok(T.exerciseFitsEquipment(byId(id), equipment), `${goal} ${id}`);
    }
    assert.deepEqual(plan.exerciseSets, T.buildPlan(profile({ primaryGoal: goal, equipment }), EXERCISES, [{ kind: goal }]).exerciseSets, 'selection does not depend on whether the catalogue was programmed');
  }
});

test('G11 the goal persists with the profile; the loaded exercises follow it and history is untouched', () => {
  const store = new Map();
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { repository, fresh } = E.loadRepository();
  const press = byId('machine_chest_press');
  const s = fresh();
  s.onboardingComplete = true;
  s.profile = profile({ primaryGoal: 'strength', goals: ['strength'] });
  s.plan = T.buildPlan(s.profile, EXERCISES, []);
  s.workouts = [session(press, DAY0, threeSets(press, 20, 9)), session(press, addDays(DAY0, 3), threeSets(press, 20, 9))];
  repository.save(s);
  const rangeOf = (state) => state.exercises.find((e) => e.id === 'machine_chest_press').repRange;
  const first = repository.load();
  assert.deepEqual(rangeOf(first), [5, 9], 'strength is applied on load');
  const workoutsBefore = JSON.stringify(first.workouts);
  for (const goal of ['hypertrophy', 'fitness', 'general', 'strength']) {
    const next = repository.load();
    next.profile = { ...next.profile, primaryGoal: goal, goals: [goal] };
    repository.save(next);
    const loaded = repository.load();
    assert.deepEqual(rangeOf(loaded), G.programExercise(press, goal).repRange, goal);
    assert.equal(JSON.stringify(loaded.workouts), workoutsBefore, `${goal}: history is byte-identical`);
    assert.ok(loaded.exercises.every((e) => e.programmedFor === goal), 'no stale goal on any exercise');
  }
  assert.equal(JSON.stringify(EXERCISES), snapshot, 'the shared catalogue was never mutated');
});

test('G12 a stored profile with an invalid goal loads as general instead of failing', () => {
  const store = new Map();
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { repository, fresh } = E.loadRepository();
  const s = fresh();
  s.onboardingComplete = true;
  s.profile = profile({ primaryGoal: 'bulk', goals: ['bulk'] });
  s.plan = T.buildPlan(profile(), EXERCISES, []);
  repository.save(s);
  const loaded = repository.load();
  assert.deepEqual(loaded.exercises.find((e) => e.id === 'machine_chest_press').repRange, [8, 12]);
});
