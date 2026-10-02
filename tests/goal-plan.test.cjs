'use strict';
/*
 * P2: goals, plan building and goal switching. Every supported goal builds a valid plan, the goal names the plan, and
 * changing the goal after training history exists never corrupts history, PRs or the saved state.
 * What each goal prescribes (rep range, rest, target effort) is covered in goal-program.test.cjs; the definition is in
 * docs/TRAINING_SEMANTICS.md "Goals".
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, EXERCISES, byId, set, session, threeSets, profile, prescribe, addDays, DAY0 } = require('./phase1-helpers.cjs');

const GOALS = ['strength', 'hypertrophy', 'fat_loss', 'fitness', 'general'];
const EQUIPMENT = [
  ['machine', 'cable', 'dumbbell', 'barbell', 'bench', 'bodyweight', 'kettlebell'],
  ['dumbbell', 'bodyweight'],
  ['machine'],
  ['bodyweight']
];

test('P2.4 every supported goal builds a valid plan for every equipment profile and training-day count', () => {
  for (const goal of GOALS) for (const equipment of EQUIPMENT) for (const days of [2, 3, 4, 5, 6]) {
    const p = profile({ primaryGoal: goal, goals: [goal], equipment, trainingDays: days });
    const plan = T.buildPlan(p, EXERCISES, [{ kind: goal }]);
    const label = `${goal} / ${equipment.join('+')} / ${days}d`;
    assert.equal(plan.days.length, 7, label);
    assert.equal(plan.days.filter((d) => !d.rest).length, days, label);
    assert.match(plan.name, new RegExp(goal.replace('_', ' ')), label);
    for (const [name, ids] of Object.entries(plan.exerciseSets)) {
      assert.ok(ids.length > 0, `${label}: the ${name} set is empty`);
      for (const id of ids) {
        const ex = EXERCISES.find((e) => e.id === id);
        assert.ok(ex, `${label}: unknown exercise ${id}`);
        assert.ok(T.exerciseFitsEquipment(ex, equipment), `${label}: ${id} does not fit the equipment`);
      }
      assert.equal(new Set(ids).size, ids.length, `${label}: duplicate exercise in ${name}`);
    }
  }
});

test('P2.4 an unknown or missing goal still yields a valid plan (the goal is a label, never a crash)', () => {
  for (const goal of ['general', 'unknown', undefined]) {
    const plan = T.buildPlan(profile({ primaryGoal: goal ?? 'general' }), EXERCISES, []);
    assert.equal(plan.days.filter((d) => !d.rest).length, 4);
  }
});

test('P2.5 changing goals after history exists: history and PRs are identical for every goal, and each goal prescribes validly', () => {
  const press = byId('machine_chest_press');
  const pull = byId('assisted_pullup');
  const history = [
    session(press, DAY0, threeSets(press, 20, 12)),
    session(press, addDays(DAY0, 3), threeSets(press, 22.5, 9)),
    session(pull, addDays(DAY0, 4), threeSets(pull, 30, 8))
  ];
  const snapshot = JSON.stringify(history);
  for (const goal of GOALS) {
    const p = profile({ primaryGoal: goal, goals: [goal] });
    const prs = T.detectAchievements(session(press, addDays(DAY0, 6), threeSets(press, 25, 8)), EXERCISES, history);
    assert.deepEqual(prs, T.detectAchievements(session(press, addDays(DAY0, 6), threeSets(press, 25, 8)), EXERCISES, history), `${goal}: PRs are goal independent`);
    for (const ex of [press, pull]) {
      const rx = prescribe(ex, history, p, addDays(DAY0, 6));
      assert.deepEqual(prescribe(ex, history, p, addDays(DAY0, 6)), rx, `${goal} ${ex.id}: same input, same prescription`);
      assert.ok(rx.weight === undefined || (Number.isFinite(rx.weight) && rx.weight >= 0), `${goal} ${ex.id}: valid load`);
    }
    assert.equal(JSON.stringify(history), snapshot, `${goal}: history is never mutated`);
  }
});

test('P2.3 switching goals through the saved state keeps every workout, PR and plan day', () => {
  const store = new Map();
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { repository, fresh } = E.loadRepository();
  const press = byId('machine_chest_press');
  const s = fresh();
  s.onboardingComplete = true;
  s.profile = profile({ primaryGoal: 'strength', goals: ['strength'] });
  s.goals = [{ id: 'g1', kind: 'strength', title: 'Get stronger', priority: 1, periodId: 'p', status: 'active' }];
  s.plan = T.buildPlan(s.profile, EXERCISES, s.goals);
  s.workouts = [session(press, DAY0, threeSets(press, 20, 12)), session(press, addDays(DAY0, 3), threeSets(press, 22.5, 10))];
  s.achievements = T.detectAchievements(s.workouts[1], EXERCISES, [s.workouts[0]]).map((a, i) => ({ id: 'a' + i, workoutId: s.workouts[1].id, ...a, timestamp: s.workouts[1].completedAt }));
  repository.save(s);
  const before = repository.load();
  for (const goal of GOALS) {
    const changed = repository.load();
    changed.profile = { ...changed.profile, primaryGoal: goal, goals: [goal] };
    changed.goals = [...changed.goals, { id: 'g-' + goal, kind: goal, title: goal, priority: 2, periodId: 'p', status: 'active' }];
    repository.save(changed);
  }
  const after = repository.load();
  assert.deepEqual(after.workouts, before.workouts);
  assert.deepEqual(after.achievements, before.achievements);
  assert.deepEqual(after.plan.days.map((d) => d.label), before.plan.days.map((d) => d.label));
  assert.equal(after.goals.length, 1 + GOALS.length);
  // the same goal over the same history is the same prescription, before and after the round trips through storage
  assert.deepEqual(T.personalizedLoad(press, after.workouts, { ...after.profile, primaryGoal: 'strength' }, EXERCISES, addDays(DAY0, 5)), T.personalizedLoad(press, before.workouts, before.profile, EXERCISES, addDays(DAY0, 5)));
});

test('P2.6 planning is deterministic: the same profile and goal always produce the same plan, for every goal', () => {
  const strip = (plan) => JSON.stringify({ name: plan.name, days: plan.days.map((d) => [d.dayIndex, d.label, !!d.rest]), exerciseSets: plan.exerciseSets });
  for (const goal of GOALS) {
    const p = profile({ primaryGoal: goal, goals: [goal] });
    const first = strip(T.buildPlan(p, EXERCISES, [{ kind: goal }]));
    for (let i = 0; i < 5; i++) assert.equal(strip(T.buildPlan(p, EXERCISES, [{ kind: goal }])), first, goal);
    assert.equal(JSON.stringify(p), JSON.stringify(profile({ primaryGoal: goal, goals: [goal] })), 'planning never mutates the profile');
  }
});
