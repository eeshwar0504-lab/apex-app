'use strict';
/*
 * Phase 12: fatigue model, deload decision and prescription, recovery completion (src/engine/fatigue.ts, deload.ts and the
 * training.ts integration). Everything is derived from history; check-ins are not an input; thresholds are product rules.
 */
const { uiSource } = require('./ui-source.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, T, EXERCISES, byId, session, set, profile, addDays } = require('./phase1-helpers.cjs');

const F = E.fatigue;
const R = F.FATIGUE_RULES;
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const S = '2026-01-05';
const press = byId('machine_chest_press');
const curl = byId('dumbbell_bicep_curl');
const assisted = byId('assisted_pullup');
const plank = byId('plank');
const LIST = { machine: [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100] };

const mk = (ex, day, load, reps, rir, n = 3) => session(ex, addDays(S, day), Array.from({ length: n }, () => set(ex, load, reps, rir)));
const normal = (w0, w1, ex = press, load = 40) => { const out = []; for (let w = w0; w < w1; w++) for (const d of [0, 2, 4]) out.push(mk(ex, w * 7 + d, load, 10, 2)); return out; };
const heavy = (w, ex = press) => [0, 1, 2, 3].map((d) => mk(ex, w * 7 + d, 80, 10, 0));
const assess = (history, day, deloads) => T.recoveryAssessment(history, EXERCISES, addDays(S, day), deloads);
const prof = (extra = {}) => profile({ loadIncrementsKg: LIST, ...extra });
const decide = (ex, history, day, deloads, p = prof()) => T.personalizedLoad(ex, history, p, EXERCISES, addDays(S, day), deloads);

const SUSTAINED = [...normal(0, 3), ...heavy(3), ...heavy(4)];

test('P12.1 normal fatigue: steady training is NORMAL and the status is normal', () => {
  const a = assess(normal(0, 5), 34);
  assert.deepEqual([a.level, a.status, a.score, a.trend], ['NORMAL', 'normal', 0, 'steady']);
  assert.equal(T.personalizedLoad(press, normal(0, 5), prof(), EXERCISES, addDays(S, 34)).deload, undefined, 'a normal status adds nothing to the prescription');
});

test('P12.1 workload spike: one unusual session is ELEVATED at most, never HIGH, and never a deload', () => {
  const a = assess([...normal(0, 4), mk(press, 32, 120, 12, 2)], 32);
  assert.deepEqual([a.level, a.status, a.score], ['ELEVATED', 'temporary_fatigue', 1]);
  assert.deepEqual(a.signals.reasons, ['workload_spike']);
  assert.equal(T.workloadFatigue([...normal(0, 4), mk(press, 32, 120, 12, 2)], EXERCISES), 'elevated', 'the existing spike rule is kept');
});

test('P12.1 elevated fatigue: a very heavy week against the baseline is ELEVATED (temporary), with its reason', () => {
  const a = assess([...normal(0, 3), ...[0, 2, 4].map((d) => mk(press, 21 + d, 80, 10, 2))], 27);
  assert.deepEqual([a.level, a.status, a.score], ['ELEVATED', 'temporary_fatigue', 2]);
  assert.deepEqual(a.signals.reasons, ['workload_ratio_very_high']);
});

test('P12.1 repeated high-effort sessions plus the workload make HIGH: new HIGH is temporary, HIGH after elevated is sustained', () => {
  const a = assess([...normal(0, 3), ...heavy(3)], 27);
  assert.deepEqual([a.level, a.score, a.status], ['HIGH', 3, 'temporary_fatigue']);
  assert.deepEqual(a.signals.reasons, ['workload_ratio_very_high', 'repeated_high_effort']);
  assert.equal(a.signals.effortPoints, 1);
  // the week after an elevated week: HIGH with ELEVATED a week earlier is sustained fatigue
  const b = assess([...normal(0, 3), ...[0, 2, 4].map((d) => mk(press, 21 + d, 80, 10, 2)), ...[0, 1, 2, 3].map((d) => mk(press, 28 + d, 80, 10, 0))], 34);
  assert.equal(b.previousLevel, 'ELEVATED');
  assert.deepEqual([b.level, b.status], ['HIGH', 'sustained_fatigue']);
});

test('P12.1 recovery-required: HIGH now and a week ago, which recommends a deload; it cannot come from one week', () => {
  const a = assess(SUSTAINED, 34);
  assert.deepEqual([a.level, a.previousLevel, a.status], ['RECOVERY_REQUIRED', 'HIGH', 'deload_recommended']);
  assert.equal(assess([...normal(0, 3), ...heavy(3)], 27).level, 'HIGH', 'one heavy week stops at HIGH');
  assert.notEqual(assess([...normal(0, 3), ...heavy(3)], 27).status, 'deload_recommended', 'no premature deload');
});

test('P12.1 dense weeks count: six sessions in seven days is a load signal', () => {
  const six = [...normal(0, 3), ...[0, 1, 2, 3, 4, 5].map((d) => mk(press, 21 + d, 40, 10, 2))];
  const a = assess(six, 27);
  assert.equal(a.signals.densityPoints, 1);
  assert.ok(a.signals.reasons.includes('dense_week'));
});

test('P12.2 an unusual day does not flip the state: windows keep it stable until the evidence really changes', () => {
  const levels = [];
  for (let day = 34; day < 48; day++) levels.push(assess([...SUSTAINED, ...normal(5, 6)], day).level);
  const flips = levels.filter((l, i) => i && l !== levels[i - 1]).length;
  assert.ok(flips <= 3, `levels over two weeks: ${levels.join(',')}`);
  assert.notEqual(assess([...normal(0, 5), mk(press, 34, 40, 10, 2)], 34).level, 'HIGH', 'one ordinary extra session never reaches HIGH');
});

test('P12.6 plateau without fatigue is a progression matter: NORMAL fatigue, PLATEAU outcome, no deload', () => {
  const stalled = [mk(curl, 0, 10, 9, 2), ...[1, 2, 3, 4, 5].map((i) => mk(curl, i * 3, 10, 9, 2))];
  const a = assess(stalled, 16);
  assert.deepEqual([a.level, a.status], ['NORMAL', 'normal']);
  const rec = decide(curl, stalled, 16, undefined, profile({ equipment: ['barbell'] }));
  assert.equal(rec.longitudinal.outcome, 'PLATEAU');
  assert.equal(rec.deload, undefined);
});

test('P12.6 stalls count as fatigue only when a load signal corroborates them', () => {
  const stalls = (ex, id) => ({ exerciseId: id, exposures: [{ day: 0, kind: 'baseline' }, ...[2, 4, 6, 8].map((day) => ({ day, kind: 'flat' }))] });
  const perf = [stalls(0, 'a'), stalls(0, 'b')];
  const none = F.fatigueSignals([], perf, 9);
  assert.deepEqual([none.stallPoints, none.score], [1, 0], 'two stalled exercises alone score nothing');
  const sessions = [{ day: 1, volume: 100, ratedSets: 0 }, { day: 2, volume: 100, ratedSets: 0 }, ...[3, 4, 5, 6, 7, 8].map((day) => ({ day, volume: 100, ratedSets: 0 }))];
  const withLoad = F.fatigueSignals(sessions, perf, 9);
  assert.equal(withLoad.densityPoints, 1);
  assert.deepEqual([withLoad.stallPoints, withLoad.score], [1, 2], 'with a load signal the stalls count');
  assert.ok(withLoad.reasons.includes('repeated_stalls'));
});

test('P12.6 plateau with sustained fatigue goes to the recovery path, not to progression or variation', () => {
  const stalled = [...normal(0, 3, curl, 10).map((w, i) => w), ...[3, 4, 5].flatMap((w) => [0, 1, 2, 3].map((d) => mk(curl, w * 7 + d, 10, 9, 0)))];
  const history = [...stalled, ...heavy(3), ...heavy(4)];
  const rec = decide(curl, history, 34, undefined, profile({ equipment: ['dumbbell'] }));
  assert.ok(rec.longitudinal.state.consecutiveStalls >= 3);
  assert.equal(assess(history, 34).level, 'RECOVERY_REQUIRED');
  assert.deepEqual([rec.longitudinal.outcome, rec.longitudinal.reason], ['RECOVER', 'recovery_hold']);
  assert.equal(rec.longitudinal.variation, undefined, 'no variation is suggested while fatigue is sustained');
  // the same stalls with normal fatigue are a plateau and the variation logic runs
  const calm = decide(curl, [mk(curl, 0, 10, 9, 2), ...[1, 2, 3, 4, 5].map((i) => mk(curl, i * 3, 10, 9, 2))], 16, undefined, profile({ equipment: ['dumbbell'] }));
  assert.deepEqual([calm.longitudinal.outcome, calm.longitudinal.reason], ['CONSIDER_VARIATION', 'variation_available']);
});

test('P12.3 the deload decision walks normal -> temporary -> sustained -> recommended -> active -> recovery complete -> normal', () => {
  const statuses = [];
  statuses.push(assess(normal(0, 5), 34).status);
  statuses.push(assess([...normal(0, 3), ...heavy(3)], 27).status);
  statuses.push(assess([...normal(0, 3), ...[0, 2, 4].map((d) => mk(press, 21 + d, 80, 10, 2)), ...heavy(4)], 34).status);
  statuses.push(assess(SUSTAINED, 34).status);
  const start = addDays(S, 34);
  statuses.push(assess(SUSTAINED, 36, [start]).status);
  statuses.push(assess(SUSTAINED, 42, [start]).status);
  statuses.push(assess(SUSTAINED, 60, [start]).status);
  assert.deepEqual(statuses, ['normal', 'temporary_fatigue', 'sustained_fatigue', 'deload_recommended', 'deload_active', 'recovery_complete', 'normal']);
  assert.deepEqual([R.deloadDays, R.resumeDays, R.cooldownDays], [7, 7, 14]);
});

test('P12.3 the engine never starts a deload alone: only startDeload does, and only when the engine recommends one', () => {
  const state = { workouts: SUSTAINED, exercises: EXERCISES, profile: prof(), deloads: undefined };
  const today = addDays(S, 34);
  assert.equal(E.deload.recoveryStatus(state, today).status, 'deload_recommended');
  assert.equal(T.personalizedLoad(press, SUSTAINED, prof(), EXERCISES, today).deload.setsRemoved, undefined, 'recommended changes no prescription');
  const started = E.deload.startDeload(state, today);
  assert.equal(started.started, true);
  assert.deepEqual(started.state.deloads, [today]);
  assert.equal(state.deloads, undefined, 'the input state is not mutated');
  const early = E.deload.startDeload({ ...state, workouts: normal(0, 5) }, today);
  assert.deepEqual([early.started, early.reason], [false, 'not_recommended']);
  assert.equal(early.state.deloads, undefined);
  assert.equal(E.deload.startDeload(state, 'not-a-date').started, false);
  // starting twice on the same day records one start
  assert.deepEqual(E.deload.startDeload(started.state, today).started, false);
});

test('P12.4 deload prescription: lighter load, one fewer set, higher RIR; progression and exercise selection are untouched', () => {
  const history = normal(0, 5, press, 60);
  const start = addDays(S, 35);
  const normalRec = decide(press, history, 36);
  const rec = decide(press, history, 36, [start]);
  assert.equal(normalRec.weight, 60);
  assert.equal(rec.weight, 50, 'two steps on the athlete\'s own list (60 -> 55 -> 50)');
  assert.ok(LIST.machine.includes(rec.weight), 'snapped to the available loads');
  assert.equal(rec.action, 'recover');
  assert.equal(rec.targetRir, Math.min(5, normalRec.targetRir + R.rirAdded));
  assert.deepEqual({ ...rec.deload }, { status: 'deload_active', level: rec.deload.level, trend: rec.deload.trend, reasons: rec.deload.reasons, setsRemoved: 1, loadSteps: 2, rirAdded: 2 });
  assert.equal(rec.recommendedRest, normalRec.recommendedRest);
  const sets = [0, 1, 2].map(() => ({ ...set(press, 60, undefined), completed: false }));
  const warm = { ...set(press, 20, 8), type: 'warmup' };
  const trimmed = T.trimSetsForDeload([warm, ...sets]);
  assert.equal(trimmed.filter((s) => s.type !== 'warmup').length, 2, 'one fewer working set');
  assert.ok(trimmed.includes(warm), 'warm-ups are untouched');
  assert.equal(T.trimSetsForDeload(sets.slice(0, 1)).length, 1, 'never below one set');
  const done = [{ ...sets[0], completed: true }, sets[1], sets[2]];
  assert.ok(T.trimSetsForDeload(done).includes(done[0]), 'completed sets are never removed');
  assert.equal(F.deloadSetCount(3), 2); assert.equal(F.deloadSetCount(2), 1); assert.equal(F.deloadSetCount(1), 1);
  assert.equal(F.deloadTargetRir(2), 4); assert.equal(F.deloadTargetRir(4), 5);
});

test('P12.4 deload keeps assisted, timed and bodyweight semantics: assistance goes UP, timed holds, no load is invented', () => {
  const start = addDays(S, 35);
  const aHistory = [0, 1, 2, 3, 4].map((i) => mk(assisted, i * 3, 20, 9, 2));
  const normalA = decide(assisted, aHistory, 36);
  const a = decide(assisted, aHistory, 36, [start]);
  assert.ok(a.weight >= normalA.weight, 'more assistance is the lighter load');
  assert.ok(a.weight > 20 || a.weight === normalA.weight);
  const plankHistory = [0, 1, 2].map((i) => session(plank, addDays(S, i * 3), [{ id: 'q' + i, type: 'working', seconds: 30, completed: true }, { id: 'r' + i, type: 'working', seconds: 30, completed: true }]));
  const p = decide(plank, plankHistory, 36, [start]);
  assert.equal(p.weight, undefined, 'a timed movement never gets a load');
  assert.equal(p.deload.setsRemoved, 1);
  assert.equal(p.deload.status, 'deload_active');
});

test('P12.4 deload does not change which exercises are prescribed, nor the goal programming or equipment', () => {
  const start = addDays(S, 35);
  const planned = session(press, addDays(S, 36), [0, 1, 2].map(() => set(press, undefined, undefined)), { status: 'planned' });
  const history = normal(0, 5, press, 60);
  const adapted = T.applyWorkoutAdaptation(planned, EXERCISES, history, prof(), [start]);
  assert.deepEqual(adapted.exercises.map((e) => e.exerciseId), planned.exercises.map((e) => e.exerciseId));
  assert.equal(adapted.exercises[0].recommendedWeight, 50);
  assert.deepEqual(adapted.exercises[0].repRange, E.goalProgram.programExercise(press, 'general').repRange);
  const src = code('src/engine/fatigue.ts') + code('src/engine/deload.ts');
  assert.doesNotMatch(src, /replaceWorkoutExercise|selectForPattern|rankForPattern|\.pattern\b/, 'fatigue never changes exercises or patterns');
});

test('P12.5 a deload never contaminates history: no workout or set is edited, and its sessions are not progression evidence', () => {
  const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
  const start = addDays(S, 35);
  const before = [...normal(0, 5, press, 60), mk(press, 36, 50, 10, 4, 2), mk(press, 38, 50, 10, 4, 2)];
  const json = JSON.stringify(before);
  deepFreeze(before);
  const after = decide(press, before, 41, [start]);
  assert.equal(JSON.stringify(before), json);
  assert.equal(T.isDeloadWorkout(before[15], [start]), true);
  assert.equal(T.isDeloadWorkout(before[0], [start]), false);
  assert.equal(T.progressionEvidence(before, [start]).length, 15, 'the deload sessions are left out of the evidence');
  // the lighter deload sessions do not become the new baseline: resume repeats the last NORMAL load
  const resumed = decide(press, before, 44, [start]);
  assert.equal(resumed.deload.status, 'recovery_complete');
  assert.equal(resumed.weight, 60, 'the light deload weight is not the new baseline');
  assert.ok(after.weight <= 55);
});

test('P12.7 recovery completion: no increase for seven days after the deload, then normal progression returns', () => {
  const start = addDays(S, 14);
  const topped = [0, 3, 6, 9, 12, 22].map((d) => mk(press, d, 60, 12, 2));
  const normalRec = decide(press, topped, 24);
  assert.equal(normalRec.action, 'increase', 'without a deload this would add load');
  const resuming = decide(press, topped, 24, [start]);
  assert.equal(resuming.deload.status, 'recovery_complete');
  assert.deepEqual([resuming.action, resuming.weight, resuming.deload.resuming], ['hold', 60, true]);
  assert.match(resuming.reason, /Recovery after a deload is complete/);
  const later = [...topped, mk(press, 30, 60, 12, 2)];
  const back = decide(press, later, 33, [start]);
  assert.equal(back.action, 'increase');
  assert.equal(back.weight, decide(press, later, 33).weight, 'normal progression is back');
  assert.equal(back.deload, undefined);
});

test('P12.8 return to training: the existing gap rule decides the load and the deload does not stack on it', () => {
  const start = addDays(S, 35);
  const history = normal(0, 5, press, 60);
  const normalGap = decide(press, history, 34 + 30);
  assert.ok(normalGap.returnToTraining, 'a 30-day gap triggers the existing rule');
  const withDeload = decide(press, history, 34 + 30, [start]);
  assert.equal(withDeload.weight, normalGap.weight, 'one reduction, not two');
  assert.deepEqual(withDeload.returnToTraining, normalGap.returnToTraining);
  assert.doesNotMatch(code('src/engine/fatigue.ts'), /RETURN_GAP_DAYS|returnTierForGap|gapDays/, 'no second gap algorithm');
  assert.match(code('src/engine/training.ts'), /loadStepsBelow\(ex, lastWorked, steps, profile\)/, 'return to training and deload share one step-down definition');
});

test('P12.9 recovery trend: improving / steady / worsening from the score against a week earlier', () => {
  assert.equal(assess([...normal(0, 3), ...heavy(3)], 27).trend, 'worsening');
  assert.equal(assess(SUSTAINED, 34).trend, 'steady');
  assert.equal(assess([...SUSTAINED, ...normal(5, 7)], 48).trend, 'improving');
});

test('P12.10 recovery check-ins never reach the training engine: the prescription is identical with or without them', () => {
  const history = SUSTAINED;
  const a = decide(press, history, 34);
  const noisy = prof({});
  const log = [{ date: addDays(S, 33), sleepHours: 3, sleepQuality: 1, soreness: 5, fatigue: 5, stress: 5, readiness: 1, pain: true }];
  const b = T.personalizedLoad(press, history, noisy, EXERCISES, addDays(S, 34), undefined);
  assert.deepEqual(a, b);
  assert.doesNotMatch(code('src/engine/fatigue.ts') + code('src/engine/deload.ts'), /recoveryLog|RecoveryCheckIn|sleep|soreness|readiness|pain|illness/i, 'no check-in, symptom or medical field is read');
  assert.equal(log.length, 1);
});

test('P12.11 Coach and AI cannot start a deload or change a prescription: they hold no write path to it', () => {
  for (const file of ['src/coach/askCoach.ts', 'src/coach/coach.ts', 'src/coach/decisionPipeline.ts', 'src/coach/signals.ts', 'src/coach/types.ts', 'src/aiGateway.ts', 'src/aiGrounding.ts', 'src/aiContract.ts']) {
    assert.doesNotMatch(code(file), /startDeload|deloads\s*=[^=]|trimSetsForDeload|recommendedWeight\s*=[^=]|applyWorkoutAdaptation/, `${file} cannot write training state`);
  }
  const state = { workouts: SUSTAINED, exercises: EXERCISES, profile: prof() };
  const json = JSON.stringify(state);
  const status = E.deload.recoveryStatus(state, addDays(S, 34));
  assert.equal(status.status, 'deload_recommended');
  status.status = 'normal'; // tampering with a returned status changes nothing
  assert.equal(JSON.stringify(state), json);
  assert.equal(E.deload.recoveryStatus(state, addDays(S, 34)).status, 'deload_recommended');
  // the only writer of AppState.deloads in the app is the explicit startDeload()
  const main = uiSource();
  assert.equal((main.match(/update\(x=>startDeload\(/g) || []).length, 1);
});

test('P12.12 determinism: the same history and date give the same assessment and prescription, in any storage order', () => {
  const run = (h) => JSON.stringify([T.recoveryAssessment(h, EXERCISES, addDays(S, 34)), T.personalizedLoad(press, h, prof(), EXERCISES, addDays(S, 34))]);
  const ref = run(SUSTAINED);
  for (let i = 0; i < 3; i++) assert.equal(run(SUSTAINED), ref);
  assert.equal(run([...SUSTAINED].reverse()), ref);
  assert.doesNotMatch(code('src/engine/fatigue.ts') + code('src/engine/deload.ts'), /Math\.random|Date\.now|new Date\(|localStorage|fetch\(/, 'no randomness, clock, storage or network');
});

test('P12.9 persistence: AppState.deloads is optional, normalised, backward compatible and survives a save and reload', async () => {
  global.localStorage = { _m: new Map(), getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); }, clear() { this._m.clear(); } };
  const { repository, fresh, migratePersistedState, normalizeDeloads } = E.loadRepository();
  assert.equal(migratePersistedState({ schemaVersion: 4 }).deloads, undefined, 'older saved data has no deloads and loads unchanged');
  assert.deepEqual(normalizeDeloads(['2026-03-02', '2026-03-02', 'nope', 5, '2026-02-01', '2026-13-45']), ['2026-02-01', '2026-03-02']);
  assert.deepEqual(normalizeDeloads('x'), []);
  const s = fresh();
  s.deloads = ['2026-03-02'];
  repository.save(s);
  assert.deepEqual(repository.load().deloads, ['2026-03-02']);
});

test('P12.1 each signal needs its own threshold: effort (3 hard sessions), decline (half of the exposures), newcomer ramp-up, cooldown', () => {
  const hard = (days) => days.map((day) => ({ day, volume: 100, avgRir: 0, ratedSets: 3 }));
  assert.equal(F.fatigueSignals(hard([10, 11]), [], 12).effortPoints, 0, 'two hard sessions are not repeated high effort');
  assert.equal(F.fatigueSignals(hard([10, 11, 12]), [], 12).effortPoints, 1);
  const exposures = (kinds) => [{ exerciseId: 'x', exposures: [{ day: 1, kind: 'baseline' }, ...kinds.map((kind, i) => ({ day: 2 + i, kind }))] }];
  assert.equal(F.fatigueSignals([], exposures(['regressed', 'flat', 'progressed', 'progressed']), 8).declinePoints, 0, 'a quarter regressed is not a decline');
  assert.equal(F.fatigueSignals([], exposures(['regressed', 'regressed', 'progressed', 'progressed']), 8).declinePoints, 1, 'half regressed is');
  assert.equal(F.fatigueSignals([], exposures(['regressed', 'regressed', 'regressed']), 8).declinePoints, 0, 'three exposures are too few to call a decline');
  // a newcomer's second week is not a workload spike against a one-week "baseline"
  const ramp = [...[0, 2, 4].map((d) => mk(press, d, 40, 10, 2)), ...[7, 9, 11].map((d) => mk(press, d, 80, 10, 2))];
  assert.equal(assess(ramp, 13).level, 'NORMAL');
  // no second recommendation straight after a deload
  const cooling = assess(SUSTAINED, 34, [addDays(S, 20)]);
  assert.equal(cooling.level, 'RECOVERY_REQUIRED');
  assert.equal(cooling.status, 'sustained_fatigue', 'within the cooldown the engine does not recommend again');
});

test('P12.6 HIGH fatigue (not only sustained) also defers a plateau verdict', () => {
  const history = [...normal(0, 4, curl, 10), ...heavy(3)];
  const a = assess(history, 27);
  assert.equal(a.level, 'HIGH');
  const rec = decide(curl, history, 27, undefined, profile({ equipment: ['dumbbell'] }));
  assert.ok(rec.longitudinal.state.consecutiveStalls >= 3);
  assert.deepEqual([rec.longitudinal.outcome, rec.longitudinal.reason], ['RECOVER', 'recovery_hold']);
});

test('P12.8 an active deload plus a long gap: the existing return-to-training load stands and nothing is reduced twice', () => {
  const history = normal(0, 5, press, 60);
  const start = addDays(S, 60);
  const gap = decide(press, history, 64);
  const both = decide(press, history, 64, [start]);
  assert.ok(gap.returnToTraining);
  assert.equal(both.deload.status, 'deload_active');
  assert.equal(both.weight, gap.weight);
  assert.equal(both.deload.setsRemoved, 1, 'sets and effort still follow the deload');
});

test('P12.8 a short layoff (one return step) inside a deload is not stacked with the deload\'s two steps', () => {
  const history = normal(0, 5, press, 60); // last session on day 30
  const gap = decide(press, history, 50);
  const both = decide(press, history, 50, [addDays(S, 48)]);
  assert.equal(gap.returnToTraining.steps, 1);
  assert.equal(both.deload.status, 'deload_active');
  assert.equal(both.weight, gap.weight, 'the return-to-training load, not a second reduction');
});
