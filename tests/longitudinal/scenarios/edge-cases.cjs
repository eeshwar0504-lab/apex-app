'use strict';
/* Fuzz / property testing and corrupt-input handling. Crashes and silent corruption are HARD failures; validation/rejection is acceptable. */
const { loadEngine } = require('../load-engine.cjs');
const { Rng } = require('../simulator/random.cjs');
const { memoryStorage } = require('../simulator/simulator.cjs');

const rec = (category, name, status, detail, seed, classification) => ({ category, name, status, detail, seed, classification });
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/* Independent definition of a recoverable workout in a rejected payload (not calling the repair code). */
const VALID_STATUS = new Set(['planned', 'in_progress', 'completed', 'skipped', 'missed', 'rescheduled', 'extra']);
const VALID_SET_TYPES = new Set(['warmup', 'working', 'drop', 'failure', 'amrap', 'rest_pause', 'myo_reps', 'tempo', 'cluster', 'timed', 'bodyweight', 'assisted', 'unilateral']);
function independentRecoverableCount(raw) {
  let obj; try { obj = JSON.parse(raw); } catch { return null; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const list = Array.isArray(obj.workouts) ? obj.workouts : [];
  const seen = new Map(); let kept = 0;
  for (const w of list) {
    if (!w || typeof w !== 'object' || typeof w.id !== 'string' || !w.id || !Array.isArray(w.exercises)) continue;
    if (w.status && !VALID_STATUS.has(w.status)) continue;
    if (!w.exercises.every((we) => we && typeof we.exerciseId === 'string' && we.exerciseId && Array.isArray(we.sets))) continue;
    const sig = JSON.stringify(w);
    if (seen.get(w.id) === sig) continue; // an exact duplicate of a record already kept
    seen.set(w.id, sig); kept++;
  }
  return kept;
}

function run(ctx) {
  const E = loadEngine();
  const T = E.training;
  const ex = E.exercisesMod.EXERCISES;
  const out = [];
  const seed = ctx.baseSeed + 4000;
  const rng = new Rng(seed);
  const N = ctx.fuzz;
  const profile = { experience: 'beginner', primaryGoal: 'general', equipment: ['machine', 'cable', 'dumbbell', 'barbell', 'bench', 'bodyweight', 'kettlebell'] };
  const pick = (a) => a[rng.int(0, a.length - 1)];
  const badReps = [0, -1, -50, 1e6, NaN, Infinity, -Infinity, undefined, null, '8', 1.5];
  const badWeight = [0, -5, -0.0001, 1e9, NaN, Infinity, -Infinity, undefined, null, 'abc', 0.0001];
  const badRir = [-1, 99, NaN, Infinity, undefined, null, 7, 0.5];
  const goodSet = (e) => ({ id: 'g' + rng.int(0, 1e9), type: pick(['working', 'working', 'working', 'warmup', 'drop']), weight: Math.round(rng.float(2.5, 150) * 2) / 2, reps: rng.int(1, 30), rir: rng.int(0, 5), completed: rng.chance(0.9) });
  const fuzzSet = () => ({ id: rng.chance(0.1) ? 'dup' : 's' + rng.int(0, 1e9), type: pick(['working', 'warmup', 'unknown_type']), weight: pick(badWeight), reps: pick(badReps), rir: pick(badRir), completed: rng.chance(0.8) });
  const workoutWith = (eid, sets, date) => ({ id: 'w' + rng.int(0, 1e9), planId: 'p', name: 'F', scheduledDate: date, status: pick(['completed', 'completed', 'planned', 'in_progress']), completedAt: date + 'T10:00:00Z', source: 'scheduled', version: 1, exercises: [{ exerciseId: eid, sets, prescribedSets: sets.length, repRange: [8, 12], restSec: 90, order: 0 }] });
  const fns = {
    progression: (e, sets) => T.progression(e, sets),
    personalizedLoad: (e, sets) => T.personalizedLoad(e, [workoutWith(e.id, sets, '2026-03-01')], profile, ex),
    sessionAssessment: (e, sets) => T.sessionAssessment(workoutWith(e.id, sets, '2026-03-01'), ex, []),
    detectAchievements: (e, sets) => T.detectAchievements(workoutWith(e.id, sets, '2026-03-02'), ex, [workoutWith(e.id, sets.slice().reverse(), '2026-03-01')]),
    volumeForWorkout: (e, sets) => T.volumeForWorkout(workoutWith(e.id, sets, '2026-03-01'), ex),
    snapToAvailableLoad: (e, sets) => T.snapToAvailableLoad(e, sets[0]?.weight, profile),
    feedbackLoad: (e, sets) => T.feedbackLoad(e, sets[0]?.weight, pick(['heavy', 'right', 'easy']), { reps: sets[0]?.reps, rir: sets[0]?.rir }, e.repRange, 2, profile),
    formatLoad: (e, sets) => T.formatLoad(e, sets[0]?.weight),
    applyWorkoutAdaptation: (e, sets) => T.applyWorkoutAdaptation(workoutWith(e.id, sets.map((s) => ({ ...s, completed: false })), '2026-03-05'), ex, [workoutWith(e.id, sets, '2026-03-01')]),
  };
  const stats = {};
  const crashes = new Map();
  const nonFinite = new Map();
  const hardOut = (name, e, sets, err, mode) => {
    const k = name + '|' + mode + '|' + String(err.message || err).slice(0, 80);
    if (!crashes.has(k)) crashes.set(k, { fn: name, mode, error: String(err.message || err), exercise: e.id, sets: JSON.stringify(sets).slice(0, 300), count: 0 });
    crashes.get(k).count++;
  };
  const nonJson = (sets) => sets.some((s) => [s.weight, s.reps, s.rir].some((v) => (typeof v === 'number' ? !Number.isFinite(v) : typeof v === 'string')));
  const scan = (name, res, e, mode, sets) => {
    // outputs that feed the UI must never contain NaN/Infinity/negative loads
    const bad = [];
    const walk = (v, path) => {
      if (typeof v === 'number') { if (!Number.isFinite(v)) bad.push(path + '=' + v); else if (/weight|load|volume/i.test(path) && v < 0) bad.push(path + '=' + v); }
      else if (v && typeof v === 'object' && path.split('.').length < 4) for (const [k, x] of Object.entries(v)) walk(x, path + '.' + k);
    };
    walk(res, name);
    if (bad.length) {
      const k = name + '|' + mode + (nonJson(sets) ? '-nonjson' : '') + '|' + bad[0].split('=')[0];
      if (!nonFinite.has(k)) nonFinite.set(k, { fn: name, mode: mode + (nonJson(sets) ? '-nonjson' : ''), field: bad[0], exercise: e.id, sets: JSON.stringify(sets).slice(0, 300), count: 0 });
      nonFinite.get(k).count++;
    }
  };
  for (const [name, fn] of Object.entries(fns)) {
    stats[name] = { valid: 0, invalid: 0 };
    for (let i = 0; i < N; i++) {
      const e = ex[rng.int(0, ex.length - 1)];
      const goodSets = Array.from({ length: rng.int(0, 12) }, () => goodSet(e));
      try { const r = fn(e, goodSets); scan(name, r, e, 'valid', goodSets); stats[name].valid++; } catch (err) { hardOut(name, e, goodSets, err, 'valid'); }
      const badSets = Array.from({ length: rng.int(0, 8) }, () => (rng.chance(0.6) ? fuzzSet() : goodSet(e)));
      try { const r = fn(e, badSets); scan(name, r, e, 'invalid', badSets); stats[name].invalid++; } catch (err) { hardOut(name, e, badSets, err, 'invalid'); }
    }
  }
  const total = Object.values(stats).reduce((a, s) => a + s.valid + s.invalid, 0);
  const validCrashes = [...crashes.values()].filter((c) => c.mode === 'valid');
  const invalidCrashes = [...crashes.values()].filter((c) => c.mode === 'invalid');
  out.push(rec('fuzz', `valid randomized histories (${N} per function x ${Object.keys(fns).length} functions): no crashes`, validCrashes.length ? 'fail' : 'pass', validCrashes.slice(0, 5), seed));
  out.push(rec('fuzz', `invalid/corrupt set values (0, negative, NaN, Infinity, huge, wrong type): no uncaught crash (${invalidCrashes.reduce((a, c) => a + c.count, 0)} crashing calls)`, invalidCrashes.length ? 'fail' : 'pass', invalidCrashes.slice(0, 6), seed));
  const nfValid = [...nonFinite.values()].filter((c) => c.mode === 'valid');
  const nfInvalid = [...nonFinite.values()].filter((c) => c.mode === 'invalid');
  const nfNonJson = [...nonFinite.values()].filter((c) => c.mode === 'invalid-nonjson');
  out.push(rec('fuzz', 'valid histories never yield NaN/Infinity/negative loads or volumes in outputs', nfValid.length ? 'fail' : 'pass', nfValid.slice(0, 5), seed));
  out.push(rec('fuzz', nfInvalid.length ? 'REVIEW: engine helpers do not clamp negative/huge JSON-representable set values (negative volume from negative reps); the UI now clamps inputs and persistence repairs them' : 'invalid JSON-representable histories never leak NaN/Infinity/negative loads or volumes at engine level', nfInvalid.length ? 'review' : 'pass', { expected: 'engine helpers are pure functions that assume validated inputs; validation lives at the UI input boundary (numeric clamps) and the persistence boundary (repairWorkoutValues + isUsableState). Verified end to end by the hostile-values-through-save/load check below.', examples: nfInvalid.slice(0, 4) }, seed, 'VALIDATION GAP'));
  {
    // END-TO-END: hostile JSON-representable values go through the real persistence boundary before the engine sees them.
    const rm = E.loadRepository();
    let leaks = 0, checked = 0; const examples = [];
    for (let i = 0; i < Math.max(200, Math.floor(N / 2)); i++) {
      const e0 = ex[rng.int(0, ex.length - 1)];
      const sets = Array.from({ length: rng.int(1, 6) }, () => ({ id: 'z' + i + '_' + rng.int(0, 1e9), type: 'working', weight: pick([-5, 0, 1e9, null, 20]), reps: pick([-1, -50, 1e6, 0, null, 10]), rir: pick([-1, 99, null, 2]), completed: true }));
      global.localStorage = memoryStorage();
      const st = rm.fresh(); st.onboardingComplete = true; st.workouts = [{ id: 'fw' + i, planId: 'p', name: 'F', scheduledDate: '2026-03-01', status: 'completed', source: 'scheduled', version: 1, exercises: [{ exerciseId: e0.id, sets, prescribedSets: sets.length, repRange: [8, 12], restSec: 90, order: 0 }] }];
      rm.repository.save(st);
      const back = rm.repository.load();
      for (const w of back.workouts) { checked++; const v = T.volumeForWorkout(w, ex); const a = T.sessionAssessment(w, ex, []); if (!Number.isFinite(v) || v < 0 || !Number.isFinite(a.volume) || a.volume < 0) { leaks++; if (examples.length < 3) examples.push({ exercise: e0.id, sets: JSON.stringify(sets).slice(0, 200), volume: v }); } }
    }
    out.push(rec('fuzz', `hostile set values that pass through save/load never produce NaN/negative volume (${checked} workouts)`, leaks ? 'fail' : 'pass', { leaks, examples }, seed));
  }
  out.push(rec('fuzz', nfNonJson.length ? 'REVIEW: engine functions do not validate NaN/Infinity/non-numeric set values (unreachable through UI number inputs or JSON persistence; persistence rejects them)' : 'engine functions tolerate NaN/Infinity/non-numeric set values', nfNonJson.length ? 'review' : 'pass', { expected: 'NaN/Infinity/strings cannot be produced by number inputs or survive JSON persistence; the data layer rejects such states', examples: nfNonJson.slice(0, 5) }, seed, 'VALIDATION GAP'));

  /* ---------- corrupt persisted state ---------- */
  const repoMod = (() => { global.localStorage = memoryStorage(); return E.loadRepository(); })();
  const KEY = 'apex-state-v4';
  const recoverable = new Set(['NaN/negative sets (serialised as null/-5)']);
  const corruptions = {
    'invalid JSON': () => '{not json',
    'empty object': () => '{}',
    'workouts not an array': () => JSON.stringify({ workouts: 'oops', exercises: [] }),
    'null': () => 'null',
    'duplicate workout ids': () => { const s = repoMod.fresh(); s.workouts = [{ id: 'a', status: 'planned', exercises: [] }, { id: 'a', status: 'planned', exercises: [] }]; return JSON.stringify(s); },
    'NaN/negative sets (serialised as null/-5)': () => { const s = repoMod.fresh(); s.workouts = [{ id: 'a', status: 'completed', scheduledDate: '2026-01-01', exercises: [{ exerciseId: 'machine_chest_press', order: 0, sets: [{ id: 'x', type: 'working', weight: -5, reps: -3, completed: true }] }] }]; return JSON.stringify(s); },
    'unknown exercise + unknown status': () => { const s = repoMod.fresh(); s.workouts = [{ id: 'a', status: 'weird', scheduledDate: '2099-01-01', exercises: [{ exerciseId: 'nope', order: 0, sets: [] }] }]; return JSON.stringify(s); },
    'future-dated completed session': () => { const s = repoMod.fresh(); s.workouts = [{ id: 'a', status: 'completed', scheduledDate: '2099-01-01', completedAt: '2099-01-01T10:00:00Z', exercises: [] }]; return JSON.stringify(s); },
  };
  for (const [name, make] of Object.entries(corruptions)) {
    let status = 'pass', detail = {};
    try {
      global.localStorage = memoryStorage();
      global.localStorage.setItem(KEY, make());
      const s = repoMod.repository.load();
      const usable = E.integrity.isUsableState(s);
      const invalidSets = (s.workouts || []).flatMap((w) => (w.exercises || []).flatMap((we) => we.sets || [])).filter((x) => (x.weight !== undefined && !(x.weight >= 0)) || (x.reps !== undefined && !(x.reps >= 0)));
      let raw = null; try { raw = JSON.parse(global.localStorage.getItem(KEY) || 'null'); } catch { raw = null; }
      const hadWorkouts = raw && Array.isArray(raw.workouts) ? raw.workouts.length : 0;
      if (!usable) { status = 'fail'; detail = { reason: 'load() returned an unusable state' }; }
      else if (invalidSets.length) { status = 'fail'; detail = { reason: 'invalid persisted set values survive load()', invalidSets: invalidSets.length }; }
      else if (recoverable.has(name) && (s.workouts || []).length !== hadWorkouts) { status = 'fail'; detail = { reason: 'recoverable corruption silently discarded workout history', had: hadWorkouts, kept: (s.workouts || []).length }; }
      else if (!recoverable.has(name) && hadWorkouts > 0 && (s.workouts || []).length === 0) {
        const kept = global.localStorage.getItem(KEY + '-rejected');
        const notice = repoMod.repository.recoveryNotice();
        const rawPayload = global.localStorage.getItem(KEY + '-rejected');
        const expected = independentRecoverableCount(rawPayload);
        if (kept && !notice) { status = 'fail'; detail = { reason: 'rejected payload preserved but the user is not told (no recovery notice)' }; }
        else if (kept && notice.recoverable !== (expected !== null)) { status = 'fail'; detail = { reason: 'recoverable flag disagrees with the independent expectation', notice, expected }; }
        else if (kept && expected !== null) {
          const r = repoMod.repository.recoverRejected();
          if (!r || !E.integrity.isUsableState(r.state)) { status = 'fail'; detail = { reason: 'recovery failed or produced an unusable state', expected }; }
          else if (r.workouts !== expected) { status = 'fail'; detail = { reason: 'recovery kept a different number of workouts than the independent count', expected, got: r.workouts }; }
          else if (repoMod.repository.recoveryNotice()) { status = 'fail'; detail = { reason: 'notice not cleared after recovery' }; }
          else { status = 'pass'; detail = { note: 'notice shown, payload preserved, recovery restored ' + r.workouts + ' workout(s), dropped ' + r.dropped }; }
        }
        else if (kept) {
          const fresh2 = repoMod.repository.startFresh();
          status = fresh2.workouts.length === 0 && !repoMod.repository.recoveryNotice() && global.localStorage.getItem(KEY + '-rejected') ? 'pass' : 'fail';
          detail = { note: 'notice shown, not repairable, explicit fresh start leaves the damaged copy on the device' };
        }
        else { status = 'fail'; detail = { reason: 'structurally corrupt state was replaced by an empty app and the rejected payload was not preserved', had: hadWorkouts }; }
      }
    } catch (err) { status = 'fail'; detail = { crash: String(err.message || err) }; }
    out.push(rec('edge_cases', `corrupt persisted state (${name}) -> app still loads a usable state`, status, detail, seed, 'VALIDATION GAP'));
  }
  {
    // malformed JSON is never silently discarded: preserved byte-for-byte, announced, not claimed recoverable
    global.localStorage = memoryStorage();
    const junk = '{"workouts":[{"id":"a","exercises":[{"sets":[';
    global.localStorage.setItem(KEY, junk);
    const s0 = repoMod.repository.load();
    const n0 = repoMod.repository.recoveryNotice();
    const okJson = s0.workouts.length === 0 && global.localStorage.getItem(KEY + '-rejected') === junk && n0 && n0.reason === 'invalid_json' && n0.recoverable === false && repoMod.repository.recoverRejected() === null && !!repoMod.repository.recoveryNotice();
    out.push(rec('edge_cases', 'malformed JSON state: preserved byte-for-byte, user notified, not claimed recoverable, notice persists until an explicit choice', okJson ? 'pass' : 'fail', { notice: n0 }, seed));
  }
  {
    // recovery UX: restart persistence, explicit fresh start, a second corruption never overwrites the first unresolved copy
    let ok = true; const why = [];
    global.localStorage = memoryStorage();
    const fresh0 = repoMod.fresh(); fresh0.onboardingComplete = true;
    fresh0.workouts = [{ id: 'a', planId: 'p', name: 'A', scheduledDate: '2026-01-01', status: 'completed', source: 'scheduled', version: 1, exercises: [{ exerciseId: 'machine_chest_press', order: 0, sets: [{ id: 'x', type: 'working', weight: 20, reps: 10, completed: true }] }] }];
    repoMod.repository.save(fresh0);
    const good = JSON.parse(global.localStorage.getItem(KEY)); good.workouts.push({ ...good.workouts[0], scheduledDate: '2026-01-02' });
    const damaged = JSON.stringify(good);
    global.localStorage.setItem(KEY, damaged);
    const first = repoMod.repository.load(); repoMod.repository.save(first);             // app loads, then autosaves the empty state
    const again = E.loadRepository().repository; again.load();
    if (!again.recoveryNotice()) { ok = false; why.push('notice lost across restart/autosave'); }
    global.localStorage.setItem(KEY, '{ broken'); again.load();
    if (global.localStorage.getItem(KEY + '-rejected-previous') !== damaged) { ok = false; why.push('earlier unresolved copy was overwritten by a second corruption'); }
    const recovered = again.recoverRejected();
    if (recovered) { ok = false; why.push('unparseable newest payload unexpectedly reported recoverable'); }
    again.startFresh();
    if (again.recoveryNotice() || again.load().workouts.length !== 0 || !global.localStorage.getItem(KEY + '-rejected-previous')) { ok = false; why.push('fresh start did not clear the notice / keep the copies'); }
    out.push(rec('edge_cases', 'corrupt state recovery UX: notice survives restart, earlier copy never overwritten, fresh start is explicit and non-destructive', ok ? 'pass' : 'fail', { why }, seed));
  }
  {
    // hostile recovery check-ins: the boundary must clamp/reject every one; nothing leaks into state
    let leaks = 0, n = 0; const examples = [];
    const hostile = [NaN, Infinity, -Infinity, -1, 0, 1, 99, 1e9, '8', null, undefined, {}, [], true];
    for (let i = 0; i < Math.max(300, N); i++) {
      const c = { date: pick(['2026-01-01', '2026-13-45', 'x', 5, null, '2026-02-03']), sleepHours: pick(hostile), sleepQuality: pick(hostile), soreness: pick(hostile), fatigue: pick(hostile), stress: pick(hostile), readiness: pick(hostile) };
      const r = E.recovery.normalizeRecoveryCheckIn(c); n++;
      if (r === undefined) continue;
      const bad = !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || (r.sleepHours !== undefined && !(r.sleepHours >= 0 && r.sleepHours <= 24)) || ['sleepQuality', 'soreness', 'fatigue', 'stress', 'readiness'].some((k) => r[k] !== undefined && !(Number.isInteger(r[k]) && r[k] >= 1 && r[k] <= 5));
      if (bad) { leaks++; if (examples.length < 3) examples.push({ input: JSON.stringify(c), output: r }); }
    }
    global.localStorage = memoryStorage();
    const st = repoMod.fresh(); st.onboardingComplete = true; st.recoveryLog = Array.from({ length: 50 }, () => ({ date: pick(['2026-01-01', 'bad', '2026-01-02']), sleepHours: pick(hostile), soreness: pick(hostile) }));
    repoMod.repository.save(st);
    const back = repoMod.repository.load();
    if (!back.onboardingComplete) { leaks++; examples.push({ note: 'hostile recovery log cost the user their state' }); }
    for (const c of back.recoveryLog || []) if ((c.sleepHours !== undefined && !(c.sleepHours >= 0 && c.sleepHours <= 24)) || (c.soreness !== undefined && !(c.soreness >= 1 && c.soreness <= 5))) { leaks++; examples.push({ persisted: c }); }
    out.push(rec('fuzz', 'hostile recovery check-ins (NaN, Infinity, negative, huge, strings, bad dates; ' + n + ' inputs + a hostile stored log) are clamped or rejected at the boundary', leaks ? 'fail' : 'pass', { leaks, examples }, seed));
  }
  for (const raw of ['not json', '{"format":"OTHER"}', JSON.stringify({ format: 'APEX_BACKUP', data: { workouts: 'x' } })]) {
    let status = 'pass', detail = {};
    try { repoMod.repository.importJson(raw); status = 'review'; detail = { note: 'import accepted a malformed backup and produced a state', input: raw.slice(0, 60) }; }
    catch (err) { detail = { rejectedWith: String(err.message || err).slice(0, 80) }; }
    out.push(rec('edge_cases', `import of malformed backup (${raw.slice(0, 24)}) is rejected or sanitised, never silently accepted as corrupt`, status, detail, seed));
  }
  // empty / partially completed workouts through session assessment + adaptation
  const empty = { id: 'e', planId: 'p', name: 'E', scheduledDate: '2026-03-01', status: 'completed', source: 'scheduled', version: 1, exercises: [] };
  let ok = true, err2;
  try { T.sessionAssessment(empty, ex, []); T.volumeForWorkout(empty, ex); T.detectAchievements(empty, ex, []); T.applyWorkoutAdaptation(empty, ex, []); } catch (e) { ok = false; err2 = String(e.message || e); }
  out.push(rec('edge_cases', 'empty workout is handled by assessment, volume, PR detection and adaptation', ok ? 'pass' : 'fail', { error: err2 }, seed));
  return out;
}
module.exports = { run, };
