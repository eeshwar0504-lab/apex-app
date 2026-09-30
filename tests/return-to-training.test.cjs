'use strict';
/*
 * Return-to-training (layoff) rule, expressed as independent expectations written from the documented rule:
 *   gap <14 days: unchanged; 14-27: 1 load step lower; 28-55: 2 steps lower; 56+: 3 steps lower,
 *   never more than half the last worked load, never below the smallest meaningful load, never an increase,
 *   assistance moves the other way, real equipment load choices are respected.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./longitudinal/load-engine.cjs');

const { training: T, exercisesMod, units } = loadEngine();
const byId = (id) => exercisesMod.EXERCISES.find((e) => e.id === id);
let n = 0;
const set = (w, reps, rir = 2) => ({ id: 's' + ++n, type: 'working', weight: w, reps, rir, completed: true });
const session = (ex, date, sets) => ({ id: 'w' + ++n, status: 'completed', scheduledDate: date, completedAt: date + 'T10:00:00.000Z', exercises: [{ exerciseId: ex.id, sets }] });
const addDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const LAST = '2026-01-05';
const press = byId('machine_chest_press'); // 8-12 reps, 2.5 kg increment
const holdHistory = () => [session(press, LAST, [set(20, 10), set(20, 10), set(20, 10)])];
const loadAfter = (days, hist = holdHistory(), profile) => T.personalizedLoad(press, hist, profile, [press], addDays(LAST, days));

test('rule boundaries: 13 days unchanged, 14 / 28 / 56 days step down 1 / 2 / 3 increments', () => {
  const expectations = [[0, 20], [7, 20], [13, 20], [14, 17.5], [20, 17.5], [27, 17.5], [28, 15], [40, 15], [55, 15], [56, 12.5], [120, 12.5], [900, 12.5]];
  for (const [days, expected] of expectations) assert.equal(loadAfter(days).weight, expected, `gap ${days}d`);
});

test('the return session never increases load, even when progression would have', () => {
  const hist = [session(press, LAST, [set(20, 12), set(20, 12), set(20, 12)])]; // normally -> 22.5
  assert.equal(loadAfter(7, hist).weight, 22.5);
  assert.equal(loadAfter(14, hist).weight, 17.5);
  assert.equal(loadAfter(60, hist).weight, 12.5);
});

test('no date means no layoff handling (backwards compatible, time independent)', () => {
  assert.equal(T.personalizedLoad(press, holdHistory(), undefined, [press]).weight, 20);
});

test('reason and evidence explain the rule', () => {
  const r = loadAfter(30);
  assert.match(r.reason, /Return to training after 30 days/);
  assert.ok(r.evidence.some((x) => /Training gap: 30 days/.test(x)));
});

test('bounded: never below half the last worked load and never below the smallest meaningful load', () => {
  const light = [session(press, LAST, [set(5, 10), set(5, 10), set(5, 10)])];
  const r = loadAfter(200, light);
  assert.ok(r.weight >= 2.5 && r.weight <= 5, String(r.weight));
  assert.ok(r.weight >= 5 * 0.5 - 1e-9);
  const smallest = [session(press, LAST, [set(press.incrementKg, 10), set(press.incrementKg, 10), set(press.incrementKg, 10)])];
  assert.ok(loadAfter(200, smallest).weight >= press.incrementKg);
  for (const days of [14, 28, 56, 365]) assert.ok(Number.isFinite(loadAfter(days).weight) && loadAfter(days).weight > 0);
});

test('assisted movements receive MORE assistance after a layoff', () => {
  const ex = exercisesMod.EXERCISES.find((e) => e.loadSemantics === 'assistance');
  const hist = [session(ex, LAST, [set(30, ex.repRange[0] + 1), set(30, ex.repRange[0] + 1), set(30, ex.repRange[0] + 1)])];
  const at = (d) => T.personalizedLoad(ex, hist, undefined, [ex], addDays(LAST, d)).weight;
  const base = at(3);
  assert.ok(at(14) > base, 'two weeks more assistance');
  assert.ok(at(28) > at(14), 'four weeks more assistance than two');
  assert.ok(at(90) > at(28), 'extended more than four weeks');
});

test('assisted movement with custom assistance choices walks UP the real choices', () => {
  const ex = exercisesMod.EXERCISES.find((e) => e.loadSemantics === 'assistance');
  const key = ex.equipment[0] || ex.id;
  const profile = { experience: 'beginner', equipment: ex.equipment, loadIncrementsKg: { [key]: [0, 10, 20, 30, 40, 50] } };
  const hist = [session(ex, LAST, [set(30, ex.repRange[0] + 1), set(30, ex.repRange[0] + 1), set(30, ex.repRange[0] + 1)])];
  assert.equal(T.personalizedLoad(ex, hist, profile, [ex], addDays(LAST, 14)).weight, 40);
  assert.equal(T.personalizedLoad(ex, hist, profile, [ex], addDays(LAST, 30)).weight, 50);
});

test('equipment: only real selectable loads are prescribed, one real choice per step', () => {
  const profile = { experience: 'beginner', equipment: ['machine'], loadIncrementsKg: { machine: [10, 15, 20, 25, 30] } };
  const hist = [session(press, LAST, [set(25, 10), set(25, 10), set(25, 10)])];
  const allowed = new Set([10, 15, 20, 25, 30]);
  const at = (d) => T.personalizedLoad(press, hist, profile, [press], addDays(LAST, d)).weight;
  assert.equal(at(3), 25);
  assert.equal(at(14), 20);
  assert.equal(at(30), 15);
  assert.equal(at(100), 15, 'third step would be 10 (60% lower): the half-load bound keeps 15');
  for (const d of [3, 14, 30, 100]) assert.ok(allowed.has(at(d)));
});

test('unit switching does not change the prescription (engine is kg; only display converts)', () => {
  units.setUnits('metric');
  const metric = loadAfter(30).weight;
  units.setUnits('imperial');
  const imperial = loadAfter(30).weight;
  const shownLb = units.wt(imperial);
  units.setUnits('metric');
  assert.equal(metric, imperial);
  assert.equal(shownLb, Math.round(metric * 2.2046226218 * 10) / 10);
});

test('progression after the first return session resumes normally (the return session resets the gap)', () => {
  const hist = holdHistory();
  const back = addDays(LAST, 30);
  const first = T.personalizedLoad(press, hist, undefined, [press], back).weight;
  assert.equal(first, 15);
  // the athlete trains at the prescribed load and reaches the top of the range
  hist.push(session(press, back, [set(first, 12), set(first, 12), set(first, 12)]));
  assert.equal(T.personalizedLoad(press, hist, undefined, [press], addDays(back, 3)).weight, 17.5, 'normal +1 increment, no layoff rule');
});

test('exercises with no dated history are unaffected and other exercises are not penalised', () => {
  const other = byId('leg_press') || exercisesMod.EXERCISES.find((e) => e.id !== press.id && e.loadSemantics === 'stack');
  const a = T.personalizedLoad(other, [], undefined, [other], '2030-01-01');
  assert.ok(a.weight === undefined || a.weight > 0);
});

test('the recommendation exposes a returnToTraining marker only when the rule applied (used to replace stale pre-filled set loads)', () => {
  const hist = holdHistory();
  assert.equal(loadAfter(7, hist).returnToTraining, undefined);
  assert.deepEqual(loadAfter(30, hist).returnToTraining, { gapDays: 30, tier: 'four_week', steps: 2 });
});
