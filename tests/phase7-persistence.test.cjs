'use strict';
/*
 * Phase 7: persistence correctness.
 *   P7.3 arbitration between the native (SQLite) and local copies
 *   P7.4 SQLite migration structure
 *   P7.5 the dead smartRir preference
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine, root } = require('./longitudinal/load-engine.cjs');

const E = loadEngine();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/* ------------------------------------------------------------------------------------------------------------- */
/* P7.3 persistence arbitration: the newer of the native and local copies wins, for every kind of edit            */
/* ------------------------------------------------------------------------------------------------------------- */
function memoryStorage() {
  const m = new Map();
  const api = {
    failWrites: false,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (api.failWrites) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem: (k) => m.delete(k),
  };
  return api;
}
// the harness replaces the native plugin with a stub class; give it an in-memory row so arbitration can be driven
const { ApexSQLiteStore } = require(path.join(E.out, 'src/data/sqliteAdapter.js'));
const native = { raw: undefined, failWrites: false };
ApexSQLiteStore.prototype.read = async () => native.raw;
ApexSQLiteStore.prototype.write = async function (payload) { if (!native.failWrites) native.raw = payload; };

let counter = 0;
const workout = (date, extra = {}) => ({
  id: `w${++counter}`, planId: 'p', name: 'A', scheduledDate: date, status: 'completed', source: 'scheduled', version: 1,
  exercises: [{ exerciseId: 'machine_chest_press', order: 0, prescribedSets: 1, repRange: [8, 12], restSec: 90, sets: [{ id: `s${++counter}`, type: 'working', weight: 20, reps: 10, completed: true }] }],
  ...extra,
});
function scenario() {
  global.localStorage = memoryStorage();
  native.raw = undefined;
  native.failWrites = false;
  const { repository, fresh } = E.loadRepository();
  repository.load(); // a clean process start
  const s = fresh();
  s.onboardingComplete = true;
  s.profile = { id: 'p', name: 'Ada', experience: 'beginner', equipment: ['machine'], primaryGoal: 'strength', goals: ['strength'], trainingDays: 3, sessionMinutes: 45, body: {}, createdAt: '2026-01-01T00:00:00Z' };
  s.workouts = [workout('2026-01-01', { updatedAt: '2026-01-01T10:00:00.000Z', completedAt: '2026-01-01T10:00:00.000Z' })];
  return { repository, s };
}
const EDITS = {
  profile: (s) => { s.profile = { ...s.profile, name: 'Grace' }; },
  journal: (s) => { s.journal = [...s.journal, { id: 'j1', date: '2026-02-01', scope: 'general', text: 'note', tags: [] }]; },
  goals: (s) => { s.goals = [...s.goals, { id: 'g1', kind: 'strength', title: 'Bench', priority: 1, periodId: 'x', status: 'active' }]; },
  recovery: (s) => { s.recoveryLog = [{ date: '2026-02-01', sleepHours: 7, readiness: 4 }]; },
  preferences: (s) => { s.preferences = { ...s.preferences, theme: 'graphite' }; },
  deloads: (s) => { s.deloads = ['2026-02-01']; },
};
const seen = {
  profile: (s) => s.profile.name === 'Grace',
  journal: (s) => s.journal.length === 1,
  goals: (s) => s.goals.length === 1,
  recovery: (s) => (s.recoveryLog || []).length === 1,
  preferences: (s) => s.preferences.theme === 'graphite',
  deloads: (s) => (s.deloads || []).join() === '2026-02-01',
};

for (const kind of Object.keys(EDITS)) {
  test(`P7.3 a newer ${kind} edit that reached only the native copy is not lost to an older local copy`, async () => {
    const { repository, s } = scenario();
    await repository.saveAsync(s);
    global.localStorage.failWrites = true; // e.g. a localStorage quota failure: the native write still succeeds
    const edited = structuredClone(s);
    EDITS[kind](edited);
    await repository.saveAsync(edited);
    global.localStorage.failWrites = false;
    const loaded = await repository.loadAsync();
    assert.equal(seen[kind](loaded), true, `${kind}: the native copy is newer and must win`);
  });

  test(`P7.3 a newer ${kind} edit that reached only the local copy is not lost to an older native copy`, async () => {
    const { repository, s } = scenario();
    await repository.saveAsync(s);
    native.failWrites = true; // the app was killed before the queued native write landed
    const edited = structuredClone(s);
    EDITS[kind](edited);
    await repository.saveAsync(edited);
    native.failWrites = false;
    const loaded = await repository.loadAsync();
    assert.equal(seen[kind](loaded), true, `${kind}: the local copy is newer and must win`);
  });
}

test('P7.3 a planned future workout does not make an old copy look newer: a scheduled day is not a mutation time', async () => {
  const { repository, s } = scenario();
  const stale = structuredClone(s);
  stale.workouts.push(workout('2099-01-01', { status: 'planned', completedAt: undefined })); // scheduled far ahead, no timestamp
  await repository.saveAsync(stale);
  const staleRaw = native.raw;
  const fresher = structuredClone(s); // the planned workout was since removed, and the profile edited
  fresher.profile = { ...fresher.profile, name: 'Grace' };
  await repository.saveAsync(fresher); // newer: this is what the local copy holds
  native.raw = staleRaw; // the native copy is the older save
  const loaded = await repository.loadAsync();
  assert.equal(loaded.profile.name, 'Grace');
});

test('P7.3 data saved before savedAt existed still compares by its workout, event and plan timestamps', async () => {
  const { repository, s } = scenario();
  const older = structuredClone(s);
  const newer = structuredClone(s);
  newer.workouts[0].updatedAt = '2026-03-01T10:00:00.000Z';
  global.localStorage.setItem('apex-state-v4', JSON.stringify(older)); // no savedAt on either
  native.raw = JSON.stringify(newer);
  const loaded = await repository.loadAsync();
  assert.equal(loaded.workouts[0].updatedAt, '2026-03-01T10:00:00.000Z', 'the legacy native copy with the newer workout wins');
  global.localStorage.setItem('apex-state-v4', JSON.stringify(newer));
  native.raw = JSON.stringify(older);
  assert.equal((await repository.loadAsync()).workouts[0].updatedAt, '2026-03-01T10:00:00.000Z');
});

test('P7.3 equal revisions keep the local copy', async () => {
  const { repository, s } = scenario();
  await repository.saveAsync(s);
  const loaded = await repository.loadAsync();
  assert.equal(loaded.profile.name, 'Ada');
});

test('P7.3 savedAt moves only when content changes, never goes backwards, and a restored backup is the newest state', async () => {
  const { repository, s } = scenario();
  const stored = () => JSON.parse(global.localStorage.getItem('apex-state-v4')).savedAt;
  await repository.saveAsync(s);
  const first = stored();
  assert.ok(first, 'every save is stamped');
  await repository.saveAsync(s);
  assert.equal(stored(), first, 'an unchanged re-save keeps its stamp');
  await repository.loadAsync();
  await repository.saveAsync(JSON.parse(global.localStorage.getItem('apex-state-v4')));
  assert.equal(stored(), first, 'saving a just-loaded state keeps its stamp');

  const edited = structuredClone(s); EDITS.profile(edited);
  await repository.saveAsync(edited);
  const second = stored();
  assert.ok(Date.parse(second) > Date.parse(first), 'a content change moves the stamp forward');

  const backup = repository.exportJson(s); // an older backup (Ada) taken before the edit
  const restored = repository.importJson(backup);
  await repository.saveAsync(restored);
  const third = stored();
  assert.ok(Date.parse(third) > Date.parse(second), 'restoring an older backup is itself a new, newest save');
  assert.equal((await repository.loadAsync()).profile.name, 'Ada');
});

/* ------------------------------------------------------------------------------------------------------------- */
/* P7.4 SQLite migration structure                                                                                 */
/* ------------------------------------------------------------------------------------------------------------- */
function fakeDb(initial = {}) {
  const db = { applied: new Map(Object.entries(initial.applied || {}).map(([v, t]) => [Number(v), t])), executed: [], tables: new Set(initial.tables || []) };
  db.execute = async (sql) => {
    db.executed.push(sql.replace(/\s+/g, ' ').trim());
    const m = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(sql);
    if (m) db.tables.add(m[1]);
  };
  db.query = async () => {
    const versions = [...db.applied.keys()].sort((a, b) => b - a);
    return { values: versions.length ? [{ version: versions[0] }] : [] };
  };
  db.run = async (sql, values) => { if (/INSERT OR IGNORE INTO schema_migrations/.test(sql) && !db.applied.has(values[0])) db.applied.set(values[0], values[1]); };
  return db;
}

test('P7.4 the schema version is derived from the migration list, and the adapter stamps rows with it', () => {
  const M = E.sqliteMigrations;
  assert.equal(M.SQLITE_SCHEMA_VERSION, M.SQLITE_MIGRATIONS[M.SQLITE_MIGRATIONS.length - 1].version);
  assert.doesNotThrow(() => M.validateMigrations(M.SQLITE_MIGRATIONS));
  const adapter = read('src/data/sqliteAdapter.ts');
  assert.doesNotMatch(adapter, /VALUES\(\s*1,\s*\d+,/, 'no literal schema version in the row written');
  assert.match(adapter, /SQLITE_SCHEMA_VERSION,\s*\n\s*payload,/, 'the row is stamped with the authoritative version');
});

test('P7.4 a fresh database gets every migration, in order, and records each version', async () => {
  const M = E.sqliteMigrations;
  const db = fakeDb();
  const ran = await M.runSqliteMigrations(db, M.SQLITE_MIGRATIONS, () => 'T');
  assert.deepEqual(ran, M.SQLITE_MIGRATIONS.map((x) => x.version));
  assert.ok(db.tables.has('app_state') && db.tables.has('schema_migrations'));
  assert.equal(db.applied.get(M.SQLITE_SCHEMA_VERSION), 'T');
});

test('P7.4 an existing v4 database is read as is: no migration runs and nothing is rewritten', async () => {
  const M = E.sqliteMigrations;
  const db = fakeDb({ applied: { 4: '2026-01-01T00:00:00Z' }, tables: ['app_state', 'schema_migrations'] });
  const ran = await M.runSqliteMigrations(db);
  assert.deepEqual(ran, []);
  assert.deepEqual(db.executed.filter((s) => !/schema_migrations/.test(s)), [], 'the app_state table is not touched');
  assert.equal(db.applied.get(4), '2026-01-01T00:00:00Z');
});

test('P7.4 a future migration is applied once, on top of v4, and the run is idempotent', async () => {
  const M = E.sqliteMigrations;
  const future = [...M.SQLITE_MIGRATIONS, { version: 5, description: 'future', statements: ['CREATE TABLE IF NOT EXISTS app_meta (k TEXT PRIMARY KEY)'] }];
  const db = fakeDb({ applied: { 4: 'old' }, tables: ['app_state', 'schema_migrations'] });
  assert.deepEqual(await M.runSqliteMigrations(db, future, () => 'T5'), [5]);
  assert.ok(db.tables.has('app_meta'));
  assert.equal(db.applied.get(4), 'old', 'v4 is not re-recorded');
  assert.equal(db.applied.get(5), 'T5');
  assert.deepEqual(await M.runSqliteMigrations(db, future), [], 'running again applies nothing');
});

test('P7.4 an interrupted migration is re-run, and the version is recorded only after its statements ran', async () => {
  const M = E.sqliteMigrations;
  const two = [{ version: 5, description: 'a', statements: ['S1', 'S2'] }];
  const db = fakeDb({ applied: { 4: 'old' } });
  const execute = db.execute;
  db.execute = async (sql) => { if (sql === 'S2') throw new Error('killed'); return execute(sql); };
  await assert.rejects(M.runSqliteMigrations(db, two), /killed/);
  assert.equal(db.applied.has(5), false, 'not recorded: the next open runs it again');
  db.execute = execute;
  assert.deepEqual(await M.runSqliteMigrations(db, two), [5]);
});

test('P7.4 a database from a newer app is refused untouched, and bad migration lists are rejected', async () => {
  const M = E.sqliteMigrations;
  const db = fakeDb({ applied: { 99: 'x' } });
  await assert.rejects(M.runSqliteMigrations(db), (e) => e.name === 'SqliteSchemaTooNewError' && e.found === 99);
  assert.deepEqual(db.executed.filter((s) => /app_state/.test(s)), []);
  assert.throws(() => M.validateMigrations([{ version: 5, description: '', statements: ['x'] }, { version: 5, description: '', statements: ['x'] }]), /strictly increasing/);
  assert.throws(() => M.validateMigrations([{ version: 0, description: '', statements: ['x'] }]), /positive/);
  assert.throws(() => M.validateMigrations([{ version: 6, description: '', statements: [] }]), /no statements/);
});

/* ------------------------------------------------------------------------------------------------------------- */
/* P7.5 smartRir                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------- */
test('P7.5 smartRir is gone from the type, the defaults and saved data, and old saved data that has it still loads', () => {
  assert.doesNotMatch(read('src/core/types.ts'), /smartRir/);
  global.localStorage = memoryStorage();
  const { repository, fresh } = E.loadRepository();
  assert.equal('smartRir' in fresh().preferences, false);
  const old = fresh();
  old.preferences.smartRir = true;
  old.preferences.theme = 'graphite';
  old.onboardingComplete = true;
  global.localStorage.setItem('apex-state-v4', JSON.stringify(old));
  const loaded = repository.load();
  assert.equal('smartRir' in loaded.preferences, false, 'the dead field is dropped');
  assert.equal(loaded.preferences.theme, 'graphite', 'everything else is preserved');
  assert.equal(loaded.onboardingComplete, true);
  repository.save(loaded);
  assert.equal('smartRir' in JSON.parse(global.localStorage.getItem('apex-state-v4')).preferences, false);
});
