'use strict';
/* Corrupt persisted state: detected, preserved, explained, recoverable, explicit fresh start, survives restart. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./longitudinal/load-engine.cjs');

function storage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
const KEY = 'apex-state-v4';
let n = 0;
const wo = (id, date, extra = {}) => ({
  id, planId: 'p', name: 'A', scheduledDate: date, status: 'completed', source: 'scheduled', version: 1,
  exercises: [{ exerciseId: 'machine_chest_press', order: 0, prescribedSets: 1, repRange: [8, 12], restSec: 90, sets: [{ id: 's' + ++n, type: 'working', weight: 20, reps: 10, completed: true }] }],
  ...extra,
});
function seeded() {
  global.localStorage = storage();
  const eng = loadEngine();
  const { repository, fresh } = eng.loadRepository();
  const s = fresh();
  s.onboardingComplete = true;
  s.profile = { name: 'Ada', experience: 'beginner', equipment: ['machine'], primaryGoal: 'strength', goals: ['strength'] };
  s.workouts = [wo('w1', '2026-01-01'), wo('w2', '2026-01-04'), wo('w3', '2026-01-07')];
  repository.save(s);
  return { repository, s, eng };
}
const corrupt = (mutate) => { const raw = JSON.parse(localStorage.getItem(KEY)); mutate(raw); localStorage.setItem(KEY, JSON.stringify(raw)); };

test('healthy state: no notice', () => {
  const { repository } = seeded();
  repository.load();
  assert.equal(repository.recoveryNotice(), null);
});

test('structurally invalid state (duplicate ids): preserved, noticed, recoverable, nothing silently lost', () => {
  const { repository } = seeded();
  corrupt((r) => { r.workouts.push({ ...r.workouts[0], scheduledDate: '2026-01-09' }); });
  const raw = localStorage.getItem(KEY);
  const state = repository.load();
  assert.equal(state.workouts.length, 0, 'the app cannot use the broken state');
  assert.equal(localStorage.getItem(KEY + '-rejected'), raw, 'the exact payload is preserved');
  const notice = repository.recoveryNotice();
  assert.equal(notice.reason, 'unusable_state');
  assert.equal(notice.recoverable, true);
  assert.ok(notice.bytes > 0);
  const r = repository.recoverRejected();
  assert.equal(r.state.workouts.length, 4, 'all four workouts recovered (the colliding id was re-id-ed, not discarded)');
  assert.equal(new Set(r.state.workouts.map((w) => w.id)).size, 4);
  assert.equal(r.dropped, 0);
  assert.equal(r.state.profile.name, 'Ada');
  assert.equal(r.state.onboardingComplete, true);
  assert.equal(repository.recoveryNotice(), null, 'resolved');
  assert.equal(repository.load().workouts.length, 4, 'recovered state is what is persisted');
  assert.ok(localStorage.getItem(KEY + '-rejected'), 'the damaged copy is still kept');
});

test('exact duplicates are dropped, unreadable workouts are dropped and counted, valid ones survive', () => {
  const { repository } = seeded();
  corrupt((r) => {
    r.workouts.push(JSON.parse(JSON.stringify(r.workouts[1])));
    r.workouts.push({ ...r.workouts[0], id: 'bad1', status: 'levitating' });
    r.workouts.push({ id: 'bad2', exercises: 'nope' });
    r.workouts.push(null);
  });
  repository.load();
  const r = repository.recoverRejected();
  assert.deepEqual(r.state.workouts.map((w) => w.id), ['w1', 'w2', 'w3']);
  assert.equal(r.dropped, 4);
});

test('invalid nested values: negative/huge numbers are repaired in place; an unknown set type is dropped, not guessed', () => {
  const { repository } = seeded();
  corrupt((r) => {
    r.workouts[1].exercises[0].sets[0].reps = -4;
    r.workouts[2].exercises[0].sets[0].rir = 77;
    r.workouts[0].exercises[0].sets[0].type = 'mystery';
  });
  const state = repository.load();
  assert.equal(state.workouts.length, 0, 'an unknown set type still fails integrity validation (validation is not weakened)');
  const r = repository.recoverRejected();
  assert.equal(r.state.workouts.length, 3);
  assert.equal(r.state.workouts[0].exercises[0].sets.length, 0);
  assert.equal(r.state.workouts[1].exercises[0].sets[0].reps, undefined);
  assert.equal(r.state.workouts[2].exercises[0].sets[0].rir, undefined);
});

test('malformed JSON: preserved untouched, noticed, not recoverable, stays noticed', () => {
  global.localStorage = storage();
  const { repository } = loadEngine().loadRepository();
  localStorage.setItem(KEY, '{"workouts":[{"id":"w1"');
  const state = repository.load();
  assert.equal(state.onboardingComplete, false);
  assert.equal(localStorage.getItem(KEY + '-rejected'), '{"workouts":[{"id":"w1"');
  const notice = repository.recoveryNotice();
  assert.equal(notice.reason, 'invalid_json');
  assert.equal(notice.recoverable, false);
  assert.equal(repository.recoverRejected(), null);
  assert.ok(repository.recoveryNotice(), 'a failed recovery does not dismiss the notice');
});

test('explicit fresh start: empty app, notice cleared, damaged copy kept', () => {
  const { repository } = seeded();
  corrupt((r) => { r.workouts.push({ ...r.workouts[0] }); });
  repository.load();
  assert.ok(repository.recoveryNotice());
  const s = repository.startFresh();
  assert.equal(s.workouts.length, 0);
  assert.equal(repository.recoveryNotice(), null);
  assert.ok(localStorage.getItem(KEY + '-rejected'));
  assert.equal(repository.load().onboardingComplete, false);
});

test('restart persistence: the notice survives a restart until the user decides, and autosave does not erase the evidence', () => {
  const { repository } = seeded();
  corrupt((r) => { r.workouts.push({ ...r.workouts[0] }); });
  const first = repository.load();
  repository.save(first); // the app autosaves the empty state right after loading
  const again = loadEngine().loadRepository().repository;
  again.load();
  assert.ok(again.recoveryNotice(), 'still asking after a restart');
  const r = again.recoverRejected();
  assert.equal(r.state.workouts.length, 3, 'the exact duplicate is dropped, the three real workouts are recovered');
});

test('a second corruption never overwrites the earlier unresolved copy', () => {
  const { repository } = seeded();
  corrupt((r) => { r.workouts.push({ ...r.workouts[0] }); });
  const first = localStorage.getItem(KEY);
  repository.load();
  localStorage.setItem(KEY, '{ broken');
  repository.load();
  assert.equal(localStorage.getItem(KEY + '-rejected-previous'), first);
  assert.equal(localStorage.getItem(KEY + '-rejected'), '{ broken');
});

test('integrity validation is unchanged: corrupt state is still refused by the integrity check and by import', () => {
  const { repository, s, eng } = seeded();
  const bad = JSON.parse(JSON.stringify(s));
  bad.workouts.push({ ...bad.workouts[0] });
  assert.equal(eng.integrity.isUsableState(bad), false);
  assert.throws(() => repository.importJson(JSON.stringify({ format: 'APEX_BACKUP', version: 4, data: bad })));
  assert.throws(() => repository.importJson('not json'));
  assert.throws(() => repository.importJson(JSON.stringify({ format: 'OTHER' })));
});

test('reset removes the preserved copy as well (full deletion on request)', () => {
  const { repository } = seeded();
  corrupt((r) => { r.workouts.push({ ...r.workouts[0] }); });
  repository.load();
  repository.reset();
  assert.equal(localStorage.getItem(KEY + '-rejected'), null);
  assert.equal(repository.recoveryNotice(), null);
});
