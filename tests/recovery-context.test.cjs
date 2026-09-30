'use strict';
/* Sleep / fatigue / soreness: stored as context, validated at the boundaries, given to the Coach, never a load rule. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./longitudinal/load-engine.cjs');
const { recovery: R, coachMod, training: T, exercisesMod } = loadEngine();

function storage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
const ex = exercisesMod.EXERCISES.find((e) => e.id === 'machine_chest_press');
let n = 0;
const sess = (date, w, reps) => ({
  id: 'w' + ++n, planId: 'p', name: 'A', scheduledDate: date, status: 'completed', source: 'scheduled', version: 1, completedAt: date + 'T10:00:00.000Z',
  exercises: [{ exerciseId: ex.id, order: 0, prescribedSets: 3, repRange: [8, 12], restSec: 90, sets: [1, 2, 3].map(() => ({ id: 's' + ++n, type: 'working', weight: w, reps, rir: 2, completed: true })) }],
});
const mk = (fresh) => { const s = fresh(); s.onboardingComplete = true; s.profile = { name: 'T', experience: 'beginner', equipment: ['machine'], primaryGoal: 'strength', goals: ['strength'] }; s.goals = []; return s; };
const coachCtx = (s, now, extra) => ({ state: s, profile: s.profile, goals: [], primaryGoal: 'strength', recentWorkoutIds: [], recentExerciseEntryIds: [], now, ...extra });

test('normalizer: clamps finite out-of-range values, drops NaN / Infinity / strings, rejects bad dates', () => {
  const c = R.normalizeRecoveryCheckIn({ date: '2026-01-01', sleepHours: 99, sleepQuality: 0, soreness: 9, fatigue: 3.6, stress: NaN, readiness: Infinity });
  assert.deepEqual(c, { date: '2026-01-01', sleepHours: 24, sleepQuality: 1, soreness: 5, fatigue: 4 });
  assert.equal(R.normalizeRecoveryCheckIn({ date: '2026-01-01', sleepHours: -5 }).sleepHours, 0);
  assert.equal(R.normalizeRecoveryCheckIn({ date: '2026-01-01', sleepHours: '8', soreness: 'high', fatigue: null }), undefined);
  assert.equal(R.normalizeRecoveryCheckIn({ date: 'yesterday', sleepHours: 8 }), undefined);
  assert.equal(R.normalizeRecoveryCheckIn(null), undefined);
  assert.equal(R.normalizeRecoveryCheckIn({ date: '2026-01-01' }), undefined);
});

test('log: one entry per day (last wins), sorted, malformed entries dropped, stale check-ins not treated as today', () => {
  let log = R.upsertRecoveryCheckIn([], { date: '2026-01-02', sleepHours: 7 });
  log = R.upsertRecoveryCheckIn(log, { date: '2026-01-01', soreness: 2 });
  log = R.upsertRecoveryCheckIn(log, { date: '2026-01-02', sleepHours: 5 });
  assert.deepEqual(log.map((x) => [x.date, x.sleepHours]), [['2026-01-01', undefined], ['2026-01-02', 5]]);
  assert.equal(R.upsertRecoveryCheckIn(log, { date: 'bad' }).length, 2);
  assert.equal(R.normalizeRecoveryLog('not an array').length, 0);
  assert.equal(R.latestRecoveryCheckIn(log, '2026-01-02').sleepHours, 5);
  assert.equal(R.latestRecoveryCheckIn(log, '2026-01-20'), undefined);
});

test('persistence: values round-trip through save/load; hostile stored values are cleaned at the boundary', () => {
  global.localStorage = storage();
  const { repository, fresh } = loadEngine().loadRepository();
  const s = mk(fresh);
  s.recoveryLog = [{ date: '2026-01-01', sleepHours: 6.5, sleepQuality: 2, soreness: 4, fatigue: 5 }];
  repository.save(s);
  assert.deepEqual(repository.load().recoveryLog, s.recoveryLog);
  const hostile = JSON.parse(localStorage.getItem('apex-state-v4'));
  hostile.recoveryLog = [{ date: '2026-01-03', sleepHours: -100, soreness: 500 }, { date: 7 }, 'x', { date: '2026-01-04', fatigue: 'lots' }];
  localStorage.setItem('apex-state-v4', JSON.stringify(hostile));
  const back = repository.load();
  assert.equal(back.onboardingComplete, true, 'hostile recovery data must not cost the user their state');
  assert.deepEqual(back.recoveryLog, [{ date: '2026-01-03', sleepHours: 0, soreness: 5 }]);
  const restored = repository.importJson(repository.exportJson(back));
  assert.deepEqual(restored.recoveryLog, back.recoveryLog);
});

test('the Coach receives the context and explains it without changing the prescription', () => {
  const { fresh } = loadEngine().loadRepository();
  const s = mk(fresh);
  s.workouts = [sess('2026-01-01', 20, 10), sess('2026-01-04', 20, 10)];
  s.recoveryLog = [{ date: '2026-02-01', sleepHours: 3, sleepQuality: 1, soreness: 5, fatigue: 5, stress: 5, readiness: 1 }];
  const ev = coachMod.coachEvidenceFromState(s, '2026-02-01');
  assert.equal(ev.context.sleepHours, 3);
  const withCtx = coachMod.coach(coachCtx(s, '2026-02-01T09:00:00.000Z', { context: ev.context }));
  const without = coachMod.coach(coachCtx(s, '2026-02-01T09:00:00.000Z'));
  const e = withCtx.decision.evidence.find((x) => x.id === 'e_recovery');
  assert.ok(e && /sleep 3 h/.test(e.statement) && /soreness 5\/5/.test(e.statement));
  assert.equal(e.pattern, 'confounder');
  assert.equal(e.confidence, 'low', 'self-report is weak evidence');
  assert.match(withCtx.explanation, /evidence only and does not change your prescription/);
  assert.equal(withCtx.decision.action, without.decision.action, 'the decision does not flip on self-reported context');
  assert.ok(withCtx.decision.candidates.some((c) => c.id === 'lighter_session_option'), 'the user is offered a choice');
  assert.equal(withCtx.decision.prescription.weight, undefined);
});

test('extreme recovery values never rewrite the deterministic prescription', () => {
  const { fresh } = loadEngine().loadRepository();
  const s = mk(fresh);
  s.workouts = [sess('2026-01-01', 20, 12), sess('2026-01-04', 20, 12)];
  const before = T.personalizedLoad(ex, s.workouts, s.profile, s.exercises, '2026-01-06');
  const snapshot = JSON.stringify(s.workouts);
  for (const extreme of [{ sleepHours: 0, soreness: 5, fatigue: 5, stress: 5, readiness: 1, sleepQuality: 1 }, { sleepHours: 24, soreness: 1, fatigue: 1, readiness: 5 }]) {
    const t = { ...s, recoveryLog: R.upsertRecoveryCheckIn(s.recoveryLog, { date: '2026-01-06', ...extreme }) };
    const ev = coachMod.coachEvidenceFromState(t, '2026-01-06');
    coachMod.coach(coachCtx(t, '2026-01-06T09:00:00.000Z', { context: ev.context, plateaus: ev.plateaus }));
    assert.deepEqual(T.personalizedLoad(ex, t.workouts, t.profile, t.exercises, '2026-01-06'), before);
    assert.equal(JSON.stringify(t.workouts), snapshot);
  }
  assert.equal(before.weight, 22.5, 'engine progression is unchanged by recovery context');
});

test('pain still takes the safety path; recovery context does not override it', () => {
  const { fresh } = loadEngine().loadRepository();
  const s = mk(fresh);
  const r = coachMod.coach(coachCtx(s, '2026-01-06T09:00:00.000Z', { context: { pain: true, sleepHours: 9, readiness: 5 } }));
  assert.equal(r.decision.safety.status, 'caution');
  assert.equal(r.decision.action, 'ask');
});
