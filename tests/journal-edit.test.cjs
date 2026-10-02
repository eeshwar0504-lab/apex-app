'use strict';
/*
 * Phase 4 / Objective 21: journal. One validate/apply path for adding and editing a note; notes are context only and
 * never change a prescription. Scoped notes name what they are about.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, EXERCISES, byId, session, threeSets, profile, addDays, DAY0 } = require('./phase1-helpers.cjs');

const J = E.journalEdit;
const TODAY = '2026-06-15';
let n = 0;
const ctx = () => ({ today: TODAY, newId: () => 'note-' + ++n });
const draft = (extra = {}) => ({ date: TODAY, scope: 'general', refId: '', text: 'Slept badly, knee tight', tags: 'soreness #Recovery', ...extra });
const entry = (extra = {}) => ({ id: 'j1', date: '2026-06-01', scope: 'general', text: 'old', tags: [], ...extra });

test('JE1 add: a valid draft becomes an entry with trimmed text and normalised tags', () => {
  const r = J.applyJournalDraft(undefined, draft({ text: '  Slept badly  ' }), ctx());
  assert.equal(r.ok, true);
  assert.deepEqual(r.entry, { id: r.entry.id, date: TODAY, scope: 'general', text: 'Slept badly', tags: ['soreness', 'recovery'] });
});

test('JE2 edit keeps the id, replaces the content, and a general note carries no reference', () => {
  const existing = entry({ scope: 'workout', refId: 'w1', tags: ['a'] });
  const r = J.applyJournalDraft(existing, draft({ scope: 'general', text: 'moved' }), ctx());
  assert.equal(r.ok, true);
  assert.equal(r.entry.id, 'j1');
  assert.equal(r.entry.text, 'moved');
  assert.equal('refId' in r.entry, false);
  assert.deepEqual(existing, entry({ scope: 'workout', refId: 'w1', tags: ['a'] }), 'the stored entry is never mutated');
});

test('JE3 text: required, trimmed, at most 2000 characters', () => {
  assert.equal(J.applyJournalDraft(undefined, draft({ text: '   ' }), ctx()).ok, false);
  assert.equal(J.applyJournalDraft(undefined, draft({ text: 'x'.repeat(2000) }), ctx()).ok, true);
  const long = J.applyJournalDraft(undefined, draft({ text: 'x'.repeat(2001) }), ctx());
  assert.equal(long.ok, false);
  assert.ok(long.errors.text);
  assert.equal(J.applyJournalDraft(undefined, draft({ text: ' ' + 'x'.repeat(2000) + ' ' }), ctx()).ok, true, 'padding is not counted');
});

test('JE4 date: a real calendar day, never in the future', () => {
  assert.equal(J.applyJournalDraft(undefined, draft({ date: TODAY }), ctx()).ok, true);
  assert.equal(J.applyJournalDraft(undefined, draft({ date: '2020-01-01' }), ctx()).ok, true);
  for (const bad of ['', '2026-06-16', '2026-02-30', 'yesterday', '15/06/2026', '2026-6-1']) {
    const r = J.applyJournalDraft(undefined, draft({ date: bad }), ctx());
    assert.equal(r.ok, false, bad);
    assert.ok(r.errors.date, bad);
  }
});

test('JE5 scope: workout and exercise notes must say which; set notes stay editable but are not offered for new notes', () => {
  assert.equal(J.applyJournalDraft(undefined, draft({ scope: 'workout', refId: '' }), ctx()).ok, false);
  assert.equal(J.applyJournalDraft(undefined, draft({ scope: 'exercise', refId: '  ' }), ctx()).ok, false);
  const w = J.applyJournalDraft(undefined, draft({ scope: 'workout', refId: 'w9' }), ctx());
  assert.equal(w.ok, true);
  assert.equal(w.entry.refId, 'w9');
  assert.equal(J.applyJournalDraft(undefined, draft({ scope: 'set', refId: 's1' }), ctx()).ok, false, 'new set-scoped notes are not created');
  assert.equal(J.applyJournalDraft(undefined, draft({ scope: 'banana' }), ctx()).ok, false);
  const legacy = entry({ scope: 'set', refId: 's1', text: 'felt a pinch' });
  const edited = J.applyJournalDraft(legacy, J.draftFromEntry({ ...legacy, text: 'felt a pinch on the last rep' }), ctx());
  assert.equal(edited.ok, true);
  assert.equal(edited.entry.scope, 'set');
  assert.equal(edited.entry.refId, 's1');
});

test('JE6 tags: lower-cased words, de-duplicated, at most 8; bad tags are reported instead of silently dropped', () => {
  assert.deepEqual(J.parseTags('Sleep, #sleep  KNEE,knee').tags, ['sleep', 'knee']);
  assert.equal(J.parseTags('a b c d e f g h i j').tags.length, 8);
  assert.ok(J.applyJournalDraft(undefined, draft({ tags: 'a b c d e f g h i j' }), ctx()).errors.tags, 'more than eight');
  assert.ok(J.applyJournalDraft(undefined, draft({ tags: 'ok bad!tag' }), ctx()).errors.tags);
  assert.ok(J.applyJournalDraft(undefined, draft({ tags: 'x'.repeat(25) }), ctx()).errors.tags);
  assert.equal(J.applyJournalDraft(undefined, draft({ tags: '' }), ctx()).ok, true);
  assert.deepEqual(J.applyJournalDraft(undefined, draft({ tags: '' }), ctx()).entry.tags, []);
  assert.deepEqual(J.parseTags('safety').tags, ['safety'], 'the Coach safety tag survives normalisation');
});

test('JE7 delete removes exactly one note; an unknown id changes nothing', () => {
  const list = [entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })];
  assert.deepEqual(J.removeJournalEntry(list, 'b').map((e) => e.id), ['a', 'c']);
  assert.deepEqual(J.removeJournalEntry(list, 'zzz').map((e) => e.id), ['a', 'b', 'c']);
  assert.equal(list.length, 3);
});

test('JE8 order: newest day first, and notes of the same day keep newest-added-first', () => {
  const list = [entry({ id: 'new-same-day', date: '2026-06-10' }), entry({ id: 'older-same-day', date: '2026-06-10' }), entry({ id: 'latest', date: '2026-06-12' }), entry({ id: 'oldest', date: '2026-05-01' })];
  assert.deepEqual(J.sortedJournal(list).map((e) => e.id), ['latest', 'new-same-day', 'older-same-day', 'oldest']);
  assert.deepEqual(list.map((e) => e.id), ['new-same-day', 'older-same-day', 'latest', 'oldest'], 'the stored list is not reordered');
});

test('JE9 draftFromEntry round-trips: editing with no changes yields the same entry', () => {
  for (const e of [entry(), entry({ scope: 'exercise', refId: 'machine_chest_press', tags: ['a', 'b'] })]) {
    const r = J.applyJournalDraft(e, J.draftFromEntry(e), ctx());
    assert.equal(r.ok, true);
    assert.deepEqual(r.entry, e);
  }
});

test('JE10 notes never change history or a prescription, and survive save and reload', () => {
  const store = new Map();
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { repository, fresh } = E.loadRepository();
  const press = byId('machine_chest_press');
  const history = [session(press, DAY0, threeSets(press, 20, 12)), session(press, addDays(DAY0, 3), threeSets(press, 22.5, 9))];
  const before = JSON.stringify(history);
  const p = profile();
  const rx = T.personalizedLoad(press, history, p, EXERCISES, addDays(DAY0, 6));
  const s = fresh();
  s.onboardingComplete = true;
  s.profile = p;
  s.plan = T.buildPlan(p, EXERCISES, []);
  s.workouts = history;
  s.journal = [J.applyJournalDraft(undefined, draft({ scope: 'workout', refId: history[0].id, text: 'first' }), ctx()).entry];
  repository.save(s);
  const loaded = repository.load();
  const second = J.applyJournalDraft(undefined, draft({ scope: 'exercise', refId: 'machine_chest_press', text: 'second', tags: 'elbow' }), ctx()).entry;
  loaded.journal = [second, ...J.removeJournalEntry(loaded.journal, 'nope')];
  loaded.journal = loaded.journal.map((e) => (e.id === second.id ? J.applyJournalDraft(e, { ...J.draftFromEntry(e), text: 'second, edited' }, ctx()).entry : e));
  repository.save(loaded);
  const again = repository.load();
  assert.deepEqual(again.journal.map((e) => [e.text, e.scope, e.refId]), [['second, edited', 'exercise', 'machine_chest_press'], ['first', 'workout', history[0].id]]);
  assert.equal(JSON.stringify(again.workouts), before, 'history is untouched');
  assert.deepEqual(T.personalizedLoad(press, again.workouts, again.profile, EXERCISES, addDays(DAY0, 6)), rx, 'a note never changes a prescription');
});
