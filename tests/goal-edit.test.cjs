'use strict';
/*
 * Phase 4 / Objective 20: goal editing (the objectives list). One validate/apply path for create, edit, status and
 * delete. A goal never touches workouts, history, PRs or the profile's primary goal.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, EXERCISES, byId, session, threeSets, profile, addDays, DAY0 } = require('./phase1-helpers.cjs');

const G = E.goalEdit;
const TODAY = '2026-06-15';
let n = 0;
const ctx = (priority = 1) => ({ today: TODAY, nextPriority: priority, newId: () => 'goal-' + ++n, newPeriodId: () => 'period-' + n });
const draft = (extra = {}) => ({ title: 'Bench 80', kind: 'strength', targetValue: '80', targetLabel: 'Bench press', targetUnit: 'kg', targetDate: '2026-09-01', ...extra });
const goal = (extra = {}) => ({ id: 'g1', kind: 'strength', title: 'Old', priority: 1, periodId: 'p1', status: 'active', ...extra });

test('GE1 create: a valid draft becomes an active goal with the next priority', () => {
  const r = G.applyGoalDraft(undefined, draft(), ctx(3));
  assert.equal(r.ok, true);
  assert.deepEqual(r.goal, { id: r.goal.id, priority: 3, periodId: r.goal.periodId, status: 'active', kind: 'strength', title: 'Bench 80', target: { label: 'Bench press', value: 80, unit: 'kg' }, targetDate: '2026-09-01' });
});

test('GE2 edit keeps identity, priority, period and status; only the edited fields change', () => {
  const existing = goal({ priority: 2, status: 'paused', periodId: 'keep', target: { label: 'x', value: 1, unit: 'reps' } });
  const r = G.applyGoalDraft(existing, draft({ title: '  New title  ', kind: 'hypertrophy', targetValue: '100' }), ctx(9));
  assert.equal(r.ok, true);
  assert.equal(r.goal.id, 'g1');
  assert.equal(r.goal.priority, 2);
  assert.equal(r.goal.periodId, 'keep');
  assert.equal(r.goal.status, 'paused');
  assert.equal(r.goal.title, 'New title');
  assert.equal(r.goal.kind, 'hypertrophy');
  assert.equal(r.goal.target.value, 100);
  assert.deepEqual(existing.target, { label: 'x', value: 1, unit: 'reps' }, 'the stored goal is never mutated');
});

test('GE3 no numeric target: an empty value clears the target (a goal can be purely directional)', () => {
  const r = G.applyGoalDraft(goal({ target: { label: 'x', value: 5, unit: 'kg' } }), draft({ targetValue: '', targetDate: '' }), ctx());
  assert.equal(r.ok, true);
  assert.equal(r.goal.target, undefined);
  assert.equal(r.goal.targetDate, undefined);
});

test('GE4 validation: title, kind, target value, unit and date each report their own error', () => {
  const r = G.applyGoalDraft(undefined, draft({ title: '  ', kind: 'bulk', targetValue: '-3', targetUnit: 'stone', targetDate: '2026-02-30' }), ctx());
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['kind', 'targetDate', 'targetUnit', 'targetValue', 'title']);
  for (const bad of ['0', 'abc', '-1', 'Infinity', 'NaN', '100001', '1e9']) assert.equal(G.applyGoalDraft(undefined, draft({ targetValue: bad }), ctx()).ok, false, bad);
  for (const ok of ['0.5', '1', '100000']) assert.equal(G.applyGoalDraft(undefined, draft({ targetValue: ok }), ctx()).ok, true, ok);
  assert.equal(G.applyGoalDraft(undefined, draft({ title: 'x'.repeat(81) }), ctx()).ok, false);
  assert.equal(G.applyGoalDraft(undefined, draft({ targetLabel: 'x'.repeat(41) }), ctx()).ok, false);
});

test('GE5 target date: a real date today or later; an unchanged past date on an existing goal is allowed', () => {
  assert.equal(G.applyGoalDraft(undefined, draft({ targetDate: TODAY }), ctx()).ok, true);
  assert.equal(G.applyGoalDraft(undefined, draft({ targetDate: '2026-06-14' }), ctx()).ok, false);
  assert.equal(G.applyGoalDraft(undefined, draft({ targetDate: '2026-13-01' }), ctx()).ok, false);
  assert.equal(G.applyGoalDraft(undefined, draft({ targetDate: 'tomorrow' }), ctx()).ok, false);
  const past = goal({ targetDate: '2026-01-01' });
  assert.equal(G.applyGoalDraft(past, draft({ targetDate: '2026-01-01' }), ctx()).ok, true, 'editing the title of an overdue goal must not force a new date');
  assert.equal(G.applyGoalDraft(past, draft({ targetDate: '2026-01-02' }), ctx()).ok, false, 'but a new past date is rejected');
});

test('GE6 an invalid edit returns errors and produces no goal', () => {
  const r = G.applyGoalDraft(goal(), draft({ title: '' }), ctx());
  assert.equal(r.ok, false);
  assert.equal(r.goal, undefined);
});

test('GE7 delete renumbers priorities without gaps and leaves every other field alone', () => {
  const goals = [goal({ id: 'a', priority: 1 }), goal({ id: 'b', priority: 2, title: 'B' }), goal({ id: 'c', priority: 3, title: 'C', status: 'paused' })];
  const after = G.removeGoal(goals, 'b');
  assert.deepEqual(after.map((g) => [g.id, g.priority]), [['a', 1], ['c', 2]]);
  assert.equal(after[1].status, 'paused');
  assert.equal(after[1].title, 'C');
  assert.equal(goals.length, 3, 'the input is never mutated');
  assert.deepEqual(G.removeGoal(goals, 'missing').map((g) => g.id), ['a', 'b', 'c']);
  assert.deepEqual(G.removeGoal([goal()], 'g1'), []);
});

test('GE8 pause and resume change only the status; unknown statuses are ignored', () => {
  const goals = [goal({ id: 'a' }), goal({ id: 'b', priority: 2 })];
  const paused = G.setGoalStatus(goals, 'a', 'paused');
  assert.equal(paused[0].status, 'paused');
  assert.equal(paused[1].status, 'active');
  assert.equal(G.setGoalStatus(paused, 'a', 'active')[0].status, 'active');
  assert.deepEqual(G.setGoalStatus(goals, 'a', 'archived'), goals);
});

test('GE9 draftFromGoal round-trips: editing and saving with no changes yields the same goal', () => {
  for (const g of [goal(), goal({ target: { label: 'Bench', value: 82.5, unit: 'kg' }, targetDate: '2026-12-01' })]) {
    const r = G.applyGoalDraft(g, G.draftFromGoal(g), { ...ctx(), today: '2026-01-01' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.goal, g);
  }
});

test('GE10 goals never touch history, PRs or the training prescription', () => {
  const press = byId('machine_chest_press');
  const history = [session(press, DAY0, threeSets(press, 20, 12)), session(press, addDays(DAY0, 3), threeSets(press, 22.5, 9))];
  const before = JSON.stringify(history);
  const p = profile({ primaryGoal: 'general', goals: ['general'] });
  const rx = T.personalizedLoad(press, history, p, EXERCISES, addDays(DAY0, 6));
  let goals = [];
  for (const d of [draft(), draft({ kind: 'fitness', title: 'Fit' }), draft({ kind: 'strength', title: 'S2' })]) goals = [...goals, G.applyGoalDraft(undefined, d, ctx(goals.length + 1)).goal];
  goals = G.setGoalStatus(goals, goals[0].id, 'paused');
  goals = G.removeGoal(goals, goals[1].id);
  assert.equal(JSON.stringify(history), before);
  assert.deepEqual(T.personalizedLoad(press, history, p, EXERCISES, addDays(DAY0, 6)), rx, 'the objectives list does not drive prescriptions; the profile goal does');
  assert.equal(p.primaryGoal, 'general');
});

test('GE11 goals persist through save and reload with edits, pauses and deletes applied', () => {
  const store = new Map();
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { repository, fresh } = E.loadRepository();
  const s = fresh();
  s.onboardingComplete = true;
  s.profile = profile();
  s.plan = T.buildPlan(s.profile, EXERCISES, []);
  const a = G.applyGoalDraft(undefined, draft({ title: 'A' }), ctx(1)).goal;
  const b = G.applyGoalDraft(undefined, draft({ title: 'B' }), ctx(2)).goal;
  s.goals = [a, b];
  repository.save(s);
  const loaded = repository.load();
  loaded.goals = G.setGoalStatus(G.removeGoal(loaded.goals, a.id), b.id, 'paused');
  loaded.goals = loaded.goals.map((g) => (g.id === b.id ? G.applyGoalDraft(g, draft({ title: 'B edited' }), ctx()).goal : g));
  repository.save(loaded);
  const again = repository.load();
  assert.deepEqual(again.goals.map((g) => [g.title, g.priority, g.status]), [['B edited', 1, 'paused']]);
});
