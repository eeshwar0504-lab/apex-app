'use strict';
/* Plateau evidence reaches the Coach, is explained with options and honest confidence, and never mutates the plan. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./longitudinal/load-engine.cjs');
const { analytics, coachMod, training: T, exercisesMod } = loadEngine();

const ex = exercisesMod.EXERCISES.find((e) => e.id === 'machine_chest_press');
let n = 0;
const sess = (date, reps, weight = 20) => ({
  id: 'w' + ++n, planId: 'p', name: 'A', scheduledDate: date, status: 'completed', source: 'scheduled', version: 1, completedAt: date + 'T10:00:00.000Z',
  exercises: [{ exerciseId: ex.id, order: 0, prescribedSets: 3, repRange: [8, 12], restSec: 90, sets: reps.map((r) => ({ id: 's' + ++n, type: 'working', weight, reps: r, rir: 2, completed: true })) }],
});
const state = (workouts) => ({
  schemaVersion: 4, goals: [], workouts, exercises: exercisesMod.EXERCISES, achievements: [], measurements: [], journal: [], observations: [],
  preferences: {}, activeRoute: 'home', onboardingComplete: true, coachMemory: [], workoutTemplates: [], learnedPreferences: {}, eventLog: [],
  profile: { name: 'T', experience: 'beginner', equipment: ['machine'], primaryGoal: 'strength', goals: ['strength'] },
});
const ctx = (s, extra = {}) => ({ state: s, profile: s.profile, goals: s.goals, primaryGoal: 'strength', recentWorkoutIds: [], recentExerciseEntryIds: [], now: '2026-02-01T10:00:00.000Z', ...extra });
const flat = (k) => Array.from({ length: k }, (_, i) => sess('2026-01-' + String(i * 3 + 1).padStart(2, '0'), [9, 9, 9]));

test('plateauCandidates is deterministic and only flags identical comparable rep output', () => {
  const s = state(flat(4));
  assert.equal(JSON.stringify(analytics.plateauCandidates(s)), JSON.stringify(analytics.plateauCandidates(JSON.parse(JSON.stringify(s)))));
  assert.equal(analytics.plateauCandidates(s)[0].exerciseId, ex.id);
  assert.equal(analytics.plateauCandidates(s)[0].sessions, 4);
  assert.equal(analytics.plateauCandidates(state([sess('2026-01-01', [8, 8, 8]), sess('2026-01-04', [9, 9, 9]), sess('2026-01-07', [10, 9, 9])])).length, 0);
  assert.equal(analytics.plateauCandidates(state(flat(2))).length, 0, 'two sessions is not enough evidence');
});

test('plateau evidence reaches the Coach and is explained with options', () => {
  const s = state(flat(4));
  const ev = coachMod.coachEvidenceFromState(s, '2026-01-12');
  assert.equal(ev.plateaus.length, 1);
  const r = coachMod.coach(ctx(s, { plateaus: ev.plateaus, context: ev.context }));
  const d = r.decision;
  assert.equal(d.action, 'review');
  assert.ok(d.evidence.some((e) => e.id === 'e_plateau_' + ex.id && e.source === 'history'));
  assert.match(r.explanation, /Options:/);
  assert.match(r.explanation, /not a diagnosis/);
  assert.match(r.explanation, /APEX has not changed your plan/);
  assert.equal(d.requiresUserConfirmation, false);
  assert.ok(d.candidates.some((c) => c.id === 'continue'), 'the user can still continue unchanged');
});

test('confidence is honest: three sessions are weak evidence, four are moderate', () => {
  const s3 = state(flat(3));
  const s4 = state(flat(4));
  const three = coachMod.coach(ctx(s3, { plateaus: analytics.plateauCandidates(s3) }));
  const four = coachMod.coach(ctx(s4, { plateaus: analytics.plateauCandidates(s4) }));
  assert.equal(three.decision.confidence, 'low');
  assert.match(three.decision.confidenceReason, /weak evidence/);
  assert.equal(four.decision.confidence, 'medium');
  assert.match(four.decision.confidenceReason, /moderate evidence/);
});

test('no plateau evidence: the Coach does not invent one', () => {
  const s = state([sess('2026-01-01', [8, 8, 8]), sess('2026-01-04', [9, 9, 9]), sess('2026-01-07', [10, 10, 10])]);
  const r = coachMod.coach(ctx(s, { plateaus: analytics.plateauCandidates(s) }));
  assert.notEqual(r.decision.action, 'review');
  assert.ok(!r.decision.candidates.some((c) => c.id === 'review_plateau'));
});

test('a plateau never silently mutates state or the prescription', () => {
  const s = state(flat(4));
  const before = JSON.stringify(s);
  const loadBefore = T.personalizedLoad(ex, s.workouts, s.profile, s.exercises, '2026-01-12');
  const ev = coachMod.coachEvidenceFromState(s, '2026-01-12');
  const r = coachMod.coach(ctx(s, { plateaus: ev.plateaus }));
  assert.equal(JSON.stringify(s), before, 'coach and evidence extraction are read-only');
  assert.deepEqual(T.personalizedLoad(ex, s.workouts, s.profile, s.exercises, '2026-01-12'), loadBefore);
  assert.equal(r.decision.prescription.weight, undefined, 'the Coach review carries no load');
  assert.equal(r.decision.prescription.sets, undefined);
  assert.equal(loadBefore.weight, 20, 'the engine still holds the load: nothing was broken out automatically');
});

test('identical rep output at an increasing load is progress, not a plateau (found by the longitudinal run: 83% false positives)', () => {
  const progressing = state([sess('2026-01-01', [12, 12, 12], 20), sess('2026-01-04', [12, 12, 12], 22.5), sess('2026-01-07', [12, 12, 12], 25), sess('2026-01-10', [12, 12, 12], 27.5)]);
  assert.equal(analytics.plateauCandidates(progressing).length, 0);
  const reduced = state([sess('2026-01-01', [9, 9, 9], 20), sess('2026-01-04', [9, 9, 9], 17.5), sess('2026-01-07', [9, 9, 9], 17.5)]);
  assert.equal(analytics.plateauCandidates(reduced).length, 0, 'a changed load is not comparable');
  const stalled = state([sess('2026-01-01', [9, 9, 9], 20), sess('2026-01-04', [9, 9, 9], 20), sess('2026-01-07', [9, 9, 9], 20)]);
  assert.equal(analytics.plateauCandidates(stalled).length, 1);
});
