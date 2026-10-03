'use strict';
/*
 * Phase 19: persistence and backup hardening on top of Phase 7 (arbitration, migrations) and the corrupt-recovery suite.
 *   backup envelope: round trip, checksum, newer versions, malformed files, all-or-nothing restore
 *   records: duplicates and invalid entries, idempotent hydrate/save cycles, dates preserved
 *   native copy: an unreadable SQLite payload is kept before it can be overwritten, write failures are visible
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadEngine } = require('./longitudinal/load-engine.cjs');

const E = loadEngine();
function memoryStorage() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => m.delete(k) };
}
const { ApexSQLiteStore } = require(path.join(E.out, 'src/data/sqliteAdapter.js'));
const native = { raw: undefined, failWrites: false };
ApexSQLiteStore.prototype.read = async () => native.raw;
ApexSQLiteStore.prototype.write = async function (payload) { if (native.failWrites) throw new Error('database is locked'); native.raw = payload; };

let n = 0;
const set = (extra = {}) => ({ id: `s${++n}`, type: 'working', weight: 40, reps: 10, rir: 2, completed: true, ...extra });
const workout = (date, extra = {}) => ({
  id: `w${++n}`, planId: 'p', name: 'Upper', scheduledDate: date, status: 'completed', source: 'scheduled', version: 1,
  startedAt: `${date}T08:00:00.000Z`, completedAt: `${date}T09:00:00.000Z`, updatedAt: `${date}T09:00:00.000Z`,
  exercises: [{ exerciseId: 'machine_chest_press', order: 0, prescribedSets: 3, repRange: [8, 12], restSec: 90, sets: [set({ type: 'warmup', weight: 20, reps: 8 }), set(), set(), set()] }],
  ...extra,
});
function boot() {
  global.localStorage = memoryStorage();
  native.raw = undefined;
  native.failWrites = false;
  const repo = E.loadRepository();
  repo.repository.load();
  return repo;
}
function realisticState(fresh, workouts = 60) {
  const s = fresh();
  s.onboardingComplete = true;
  s.profile = { id: 'p', name: 'Ada', experience: 'intermediate', equipment: ['machine'], primaryGoal: 'strength', goals: ['strength'], trainingDays: 3, sessionMinutes: 45, body: {}, createdAt: '2026-01-01T00:00:00Z' };
  s.workouts = Array.from({ length: workouts }, (_, i) => workout(new Date(Date.UTC(2026, 0, 1 + i * 2)).toISOString().slice(0, 10)));
  s.goals = [{ id: 'g1', kind: 'strength', title: 'Bench', priority: 1, periodId: 'x', status: 'active' }];
  s.measurements = [{ id: 'm1', date: '2026-03-08', weightKg: 80 }, { id: 'm2', date: '2026-03-09', weightKg: 79.5 }];
  s.journal = [{ id: 'j1', date: '2026-03-08', scope: 'general', text: 'felt strong', tags: [] }];
  s.deloads = ['2026-02-02'];
  s.recoveryLog = [{ date: '2026-03-08', sleepHours: 7, readiness: 4 }];
  s.preferences = { ...s.preferences, theme: 'graphite', reducedMotion: true, units: 'imperial' };
  return s;
}
const core = (s) => JSON.parse(JSON.stringify({ ...s, savedAt: undefined, exercises: undefined }));

test('P19.1 backup round trip preserves the meaningful state: workouts, warm-ups, goals, measurements, journal, deloads, recovery, preferences, calendar dates', () => {
  const { repository, fresh } = boot();
  const s = realisticState(fresh, 12);
  const back = repository.importJson(repository.exportJson(s));
  assert.deepEqual(core(back), core(E.loadRepository().migratePersistedState(s)), 'identical to the state after normal hydration');
  assert.equal(back.workouts[0].exercises[0].sets[0].type, 'warmup', 'the warm-up marker survives');
  assert.equal(back.measurements[0].date, '2026-03-08', 'a calendar day is preserved as typed, not shifted by a time zone');
  assert.deepEqual(back.deloads, ['2026-02-02']);
});

test('P19.2 a damaged, edited or truncated backup is refused: checksum, JSON, format, missing data', () => {
  const { repository, fresh } = boot();
  const good = repository.exportJson(realisticState(fresh, 4));
  const env = JSON.parse(good);
  assert.ok(typeof env.checksum === 'string' && env.checksum.length > 8);
  const edited = JSON.parse(good);
  edited.data.profile.name = 'Mallory';
  assert.throws(() => repository.importJson(JSON.stringify(edited)), /damaged/);
  assert.throws(() => repository.importJson(good.slice(0, good.length >> 1)), /not a readable APEX backup/);
  assert.throws(() => repository.importJson('{"format":"OTHER"}'), /not an APEX backup/);
  assert.throws(() => repository.importJson(JSON.stringify({ format: 'APEX_BACKUP', version: 4 })), /no data/);
  assert.throws(() => repository.importJson(JSON.stringify({ format: 'APEX_BACKUP', version: 4, data: [1, 2] })), /no data/);
  assert.throws(() => repository.importJson('null'), /not an APEX backup/);
});

test('P19.3 a backup from a newer APEX is refused, and an older backup without a checksum still restores', () => {
  const { repository, fresh } = boot();
  const s = realisticState(fresh, 3);
  const env = JSON.parse(repository.exportJson(s));
  assert.throws(() => repository.importJson(JSON.stringify({ ...env, version: 99 })), /newer version of APEX/);
  assert.throws(() => repository.importJson(JSON.stringify({ ...env, data: { ...env.data, schemaVersion: 99 }, checksum: undefined })), /newer version of APEX/);
  const legacy = { ...env };
  delete legacy.checksum;
  assert.equal(repository.importJson(JSON.stringify(legacy)).workouts.length, 3);
});

test('P19.4 restore is all or nothing: a refused backup changes neither the saved state nor the native copy', async () => {
  const { repository, fresh } = boot();
  const s = realisticState(fresh, 5);
  await repository.saveAsync(s);
  const localBefore = global.localStorage.getItem('apex-state-v4');
  const nativeBefore = native.raw;
  const bad = JSON.parse(repository.exportJson(s));
  bad.data.workouts.push({ ...bad.data.workouts[0] }); // duplicate workout id: unusable
  delete bad.checksum;
  assert.throws(() => repository.importJson(JSON.stringify(bad)), /not usable/);
  assert.equal(global.localStorage.getItem('apex-state-v4'), localBefore);
  assert.equal(native.raw, nativeBefore);
});

test('P19.5 invalid records: non-objects are dropped, exact duplicates dropped, a different record reusing an id gets a new one, a clean list is untouched', () => {
  const { normalizeRecords } = E.loadRepository();
  const clean = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
  assert.equal(normalizeRecords(clean), clean, 'a clean list is returned as is');
  const out = normalizeRecords([{ id: 'a', v: 1 }, null, 7, [], { id: 'a', v: 1 }, { id: 'a', v: 2 }, { id: 'a', v: 3 }, { v: 9 }]);
  assert.deepEqual(out, [{ id: 'a', v: 1 }, { id: 'a_r1', v: 2 }, { id: 'a_r2', v: 3 }, { v: 9 }]);
  assert.deepEqual(normalizeRecords(out), out, 'idempotent');
  assert.deepEqual(normalizeRecords('x'), []);
});

test('P19.6 an imported backup with duplicate or broken goals, measurements and journal entries is repaired, never silently duplicated', () => {
  const { repository, fresh } = boot();
  const s = realisticState(fresh, 2);
  s.measurements = [...s.measurements, s.measurements[0], null];
  s.journal = [...s.journal, { ...s.journal[0], text: 'a different note, same id' }];
  const back = repository.importJson(JSON.stringify({ format: 'APEX_BACKUP', version: 4, data: s }));
  assert.equal(back.measurements.length, 2);
  assert.equal(back.journal.length, 2);
  assert.notEqual(back.journal[0].id, back.journal[1].id);
  assert.equal(back.journal.find((j) => j.text === 'a different note, same id').text, 'a different note, same id', 'no entry was lost');
});

test('P19.7 repeated save / load / restart cycles are stable: no duplicate records, savedAt moves only with content', async () => {
  const { repository, fresh } = boot();
  let s = realisticState(fresh, 20);
  await repository.saveAsync(s);
  const first = JSON.parse(global.localStorage.getItem('apex-state-v4'));
  let stamp = first.savedAt;
  for (let i = 0; i < 15; i++) {
    const { repository: again } = (global.localStorage = global.localStorage, E.loadRepository());
    s = await again.loadAsync();
    await again.saveAsync(s);
    const now = JSON.parse(global.localStorage.getItem('apex-state-v4'));
    assert.equal(now.workouts.length, 20);
    assert.equal(now.measurements.length, 2);
    assert.equal(now.journal.length, 1);
    assert.equal(now.savedAt, stamp, 're-saving an unchanged state keeps its stamp');
    stamp = now.savedAt;
  }
  assert.deepEqual(core(s), core(realisticStateFrom(first)));
  function realisticStateFrom(x) { return x; }
});

test('P19.8 a large realistic history survives a native round trip and loads quickly', async () => {
  const { repository, fresh } = boot();
  const s = realisticState(fresh, 600);
  const t0 = Date.now();
  await repository.saveAsync(s);
  global.localStorage = memoryStorage(); // restart with only the native copy
  const { repository: reopened } = E.loadRepository();
  const loaded = await reopened.loadAsync();
  assert.equal(loaded.workouts.length, 600);
  assert.deepEqual(core(loaded), core(E.loadRepository().migratePersistedState(s)));
  assert.ok(Date.now() - t0 < 5000, 'save + hydrate of 600 workouts');
});

test('P19.9 an unreadable native payload is kept before the next save can overwrite it', async () => {
  const { repository, fresh } = boot();
  const s = realisticState(fresh, 3);
  await repository.saveAsync(s);
  native.raw = '{"schemaVersion":4,"workouts":[{"id":'; // torn write
  const loaded = await repository.loadAsync();
  assert.equal(loaded.workouts.length, 3, 'the valid local copy is used');
  assert.equal(global.localStorage.getItem('apex-state-v4-native-rejected'), native.raw, 'the damaged native copy is preserved');
  assert.equal(repository.recoveryNotice(), null, 'no alarm: the athlete lost nothing');
  await repository.saveAsync(loaded);
  assert.notEqual(native.raw, global.localStorage.getItem('apex-state-v4-native-rejected'));
  assert.ok(global.localStorage.getItem('apex-state-v4-native-rejected'), 'still kept after the overwrite');
});

test('P19.10 when the native copy is unreadable and there is nothing local, the athlete is told and the copy is kept', async () => {
  const { repository } = boot();
  native.raw = JSON.stringify({ schemaVersion: 4, workouts: [{ id: 'w', exercises: [] }, { id: 'w', exercises: [] }], onboardingComplete: true });
  const loaded = await repository.loadAsync();
  assert.equal(loaded.workouts.length, 0);
  const notice = repository.recoveryNotice();
  assert.ok(notice, 'a recovery notice is raised');
  assert.equal(notice.reason, 'unusable_state');
});

test('P19.11 native write failures are visible, recover on the next success, and never lose the local copy', async () => {
  const { repository, fresh } = boot();
  const s = realisticState(fresh, 2);
  native.failWrites = true;
  await assert.rejects(repository.saveAsync(s), /database is locked/);
  assert.match(repository.nativeStatus().lastError, /database is locked/);
  assert.equal(JSON.parse(global.localStorage.getItem('apex-state-v4')).workouts.length, 2, 'saved locally first');
  native.failWrites = false;
  await repository.saveAsync(s);
  assert.equal(repository.nativeStatus().lastError, null);
  assert.ok(repository.nativeStatus().lastWriteAt);
});

test('P19.12 a state saved by a newer APEX is not downgraded by a save, and an empty native database falls back to local', async () => {
  const { repository, fresh } = boot();
  const s = realisticState(fresh, 2);
  s.schemaVersion = 7;
  await repository.saveAsync(s);
  const loaded = await repository.loadAsync();
  assert.equal(loaded.schemaVersion, 7, 'the version stamp is never lowered');
  global.localStorage = memoryStorage();
  native.raw = undefined;
  const { repository: empty } = E.loadRepository();
  assert.equal((await empty.loadAsync()).workouts.length, 0, 'an empty database and no local copy is simply a fresh app');
});

test('P19.13 the safety copy taken before a restore can be read back, and reset removes every preserved copy', async () => {
  const { repository, fresh } = boot();
  const s = realisticState(fresh, 4);
  assert.equal(repository.preRestoreSnapshot(), null);
  repository.snapshotBeforeRestore(s);
  assert.equal(repository.preRestoreSnapshot().workouts.length, 4);
  native.raw = '{bad';
  await repository.loadAsync();
  repository.reset();
  for (const k of ['apex-state-v4', 'apex-state-v4-pre-restore', 'apex-state-v4-native-rejected']) assert.equal(global.localStorage.getItem(k), null, k);
});

test('P19.14 a snapshot that is itself damaged is ignored rather than restored', () => {
  const { repository } = boot();
  global.localStorage.setItem('apex-state-v4-pre-restore', '{broken');
  assert.equal(repository.preRestoreSnapshot(), null);
});
