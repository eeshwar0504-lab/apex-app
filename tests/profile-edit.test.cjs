'use strict';
/*
 * Phase 4 / Objective 19: profile editing. One validation and apply function (src/engine/profileEdit.ts); stored values
 * are canonical (kg, cm), drafts are in display units, and an edit changes the profile and nothing else.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, EXERCISES, byId, session, threeSets, profile, addDays, DAY0 } = require('./phase1-helpers.cjs');

const P = E.profileEdit;
const metric = { fromWt: (v) => v, fromLen: (v) => v };
const imperial = { fromWt: (v) => v / 2.2046226218, fromLen: (v) => v / 0.3937007874 };
const draft = (extra = {}) => ({ name: 'Ada', experience: 'intermediate', primaryGoal: 'hypertrophy', trainingDays: 4, sessionMinutes: 60, equipment: ['machine', 'dumbbell'], bodyWeight: '', height: '', ...extra });
const apply = (extra, base = profile(), units = metric) => P.applyProfileDraft(base, draft(extra), units, () => 'new-id', '2026-03-01T00:00:00.000Z');

test('PE1 a valid edit updates exactly the profile fields and keeps everything else', () => {
  const base = profile({ loadIncrementsKg: { machine: [10, 20] }, body: { weightKg: 80, heightCm: 180 }, goals: ['strength', 'fitness'] });
  const r = apply({}, base);
  assert.equal(r.ok, true);
  assert.equal(r.profile.name, 'Ada');
  assert.equal(r.profile.experience, 'intermediate');
  assert.equal(r.profile.primaryGoal, 'hypertrophy');
  assert.equal(r.profile.trainingDays, 4);
  assert.deepEqual(r.profile.equipment, ['machine', 'dumbbell']);
  assert.deepEqual(r.profile.loadIncrementsKg, { machine: [10, 20] }, 'load lists are not part of this edit');
  assert.deepEqual(r.profile.body, { weightKg: 80, heightCm: 180 }, 'empty measurements keep the stored values');
  assert.equal(r.profile.createdAt, base.createdAt);
  assert.equal(r.profile.id, base.id);
});

test('PE2 the primary goal is always first in profile.goals; other goals are kept without duplicates', () => {
  const r = apply({ primaryGoal: 'fitness' }, profile({ primaryGoal: 'strength', goals: ['strength', 'fitness', 'general'] }));
  assert.deepEqual(r.profile.goals, ['fitness', 'strength', 'general']);
  assert.equal(r.profile.primaryGoal, 'fitness');
});

test('PE3 training days: only whole numbers from 2 to 6 (the range the engine accepts)', () => {
  for (const ok of [2, 3, 4, 5, 6, '4']) assert.equal(apply({ trainingDays: ok }).ok, true, String(ok));
  for (const bad of [0, 1, 7, 3.5, -2, NaN, Infinity, '', 'abc']) {
    const r = apply({ trainingDays: bad });
    assert.equal(r.ok, false, String(bad));
    assert.ok(r.errors.trainingDays, String(bad));
  }
  for (const days of [2, 3, 4, 5, 6]) assert.equal(T.sanitizeTrainingDays(days), days, 'the engine never changes a value the editor accepts');
});

test('PE4 name, experience, goal, minutes and equipment are validated, with a message per field', () => {
  const r = P.applyProfileDraft(profile(), draft({ name: '   ', experience: 'expert', primaryGoal: 'bulk', sessionMinutes: 5, equipment: [] }), metric, () => 'x', 'now');
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['equipment', 'experience', 'name', 'primaryGoal', 'sessionMinutes']);
  assert.equal(apply({ name: 'x'.repeat(61) }).ok, false);
  assert.equal(apply({ equipment: ['machine', 'jetpack'] }).ok, false);
  assert.equal(apply({ sessionMinutes: 241 }).ok, false);
  assert.equal(apply({ sessionMinutes: 15 }).ok, true);
  assert.equal(apply({ sessionMinutes: 240 }).ok, true);
  assert.equal(apply({ name: '  Ada  ' }).profile.name, 'Ada', 'the name is trimmed');
});

test('PE5 an invalid edit changes nothing: the input profile is never mutated', () => {
  const base = profile();
  const snapshot = JSON.stringify(base);
  const r = apply({ trainingDays: 9 }, base);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(base), snapshot);
  assert.equal(apply({}, base).ok, true);
  assert.equal(JSON.stringify(base), snapshot, 'a valid edit returns a new profile instead of mutating the old one');
});

test('PE6 body measurements are entered in the display unit and stored canonically', () => {
  const kg = apply({ bodyWeight: '80', height: '180' }, profile(), metric);
  assert.deepEqual(kg.profile.body, { weightKg: 80, heightCm: 180 });
  const lb = apply({ bodyWeight: '176.4', height: '70.9' }, profile(), imperial);
  assert.ok(Math.abs(lb.profile.body.weightKg - 80) <= 0.1, `lb -> kg: ${lb.profile.body.weightKg}`);
  assert.ok(Math.abs(lb.profile.body.heightCm - 180.1) <= 0.2, `in -> cm: ${lb.profile.body.heightCm}`);
  // typing the number shown for a stored value never changes the stored value (round trip through display units)
  const shownLb = Math.round(80 * 2.2046226218 * 10) / 10;
  assert.ok(Math.abs(apply({ bodyWeight: String(shownLb) }, profile(), imperial).profile.body.weightKg - 80) <= 0.1);
});

test('PE7 implausible or non-numeric measurements are rejected, never stored', () => {
  for (const bad of ['abc', '0', '-5', '19', '401', 'Infinity', 'NaN']) {
    const r = apply({ bodyWeight: bad });
    assert.equal(r.ok, false, `weight ${bad}`);
    assert.ok(r.errors.bodyWeight);
  }
  for (const bad of ['abc', '0', '99', '251', 'Infinity']) assert.equal(apply({ height: bad }).ok, false, `height ${bad}`);
  assert.equal(apply({ bodyWeight: '20' }).ok, true);
  assert.equal(apply({ bodyWeight: '400' }).ok, true);
});

test('PE8 there is no profile yet: a valid draft creates one', () => {
  const r = P.applyProfileDraft(undefined, draft(), metric, () => 'fresh-id', '2026-03-01T00:00:00.000Z');
  assert.equal(r.ok, true);
  assert.equal(r.profile.id, 'fresh-id');
  assert.equal(r.profile.createdAt, '2026-03-01T00:00:00.000Z');
  assert.deepEqual(r.profile.goals, ['hypertrophy']);
});

test('PE9 editing the profile never rewrites history, and the new goal drives the next prescription', () => {
  const press = byId('machine_chest_press');
  const history = [session(press, DAY0, threeSets(press, 20, 9)), session(press, addDays(DAY0, 3), threeSets(press, 20, 9))];
  const before = JSON.stringify(history);
  const general = profile({ primaryGoal: 'general', goals: ['general'] });
  const edited = apply({ primaryGoal: 'strength' }, general).profile;
  assert.equal(JSON.stringify(history), before);
  const asOf = addDays(DAY0, 6);
  assert.equal(T.personalizedLoad(press, history, general, EXERCISES, asOf).action, 'hold');
  assert.equal(T.personalizedLoad(press, history, edited, EXERCISES, asOf).action, 'increase', '9 reps is the top of the strength range');
});

test('PE10 a profile edit survives a save and reload, and the programmed exercises follow the edited goal', () => {
  const store = new Map();
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { repository, fresh } = E.loadRepository();
  const s = fresh();
  s.onboardingComplete = true;
  s.profile = profile();
  s.plan = T.buildPlan(s.profile, EXERCISES, []);
  repository.save(s);
  const loaded = repository.load();
  loaded.profile = apply({ name: 'Grace', primaryGoal: 'fat_loss', trainingDays: 5, bodyWeight: '72.5', height: '171' }, loaded.profile).profile;
  repository.save(loaded);
  const again = repository.load();
  assert.equal(again.profile.name, 'Grace');
  assert.equal(again.profile.primaryGoal, 'fat_loss');
  assert.equal(again.profile.trainingDays, 5);
  assert.equal(again.profile.body.weightKg, 72.5);
  assert.equal(again.profile.body.heightCm, 171);
  const press = again.exercises.find((e) => e.id === 'machine_chest_press');
  assert.deepEqual(press.repRange, [8, 12]);
  assert.equal(press.restSec, 75, 'fat loss: 15 s less rest than the catalogue 90 s');
});
