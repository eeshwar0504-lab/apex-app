'use strict';
/* The oracle must be able to FAIL: seed known-bad states/prescriptions and require detection. */
const inv = require('./invariants.cjs');
const { loadEngine } = require('../load-engine.cjs');
const { makeScenario } = require('../simulator/scenario-generator.cjs');
const { runSimulation } = require('../simulator/simulator.cjs');

function run(ctx) {
  const E = loadEngine();
  const out = [];
  const sim = runSimulation(makeScenario({ archetype: 'consistent_beginner', seed: ctx.baseSeed + 5000, weeks: 3 }));
  const clone = () => JSON.parse(JSON.stringify(sim.state));
  const lastDate = '2026-01-21';
  const mutate = (name, fn, expect) => {
    const s = clone(); s.exercises = E.exercisesMod.EXERCISES; fn(s);
    const issues = inv.checkState(s, lastDate, sim.log).filter((i) => i.severity === 'hard');
    out.push({ category: 'data_integrity', name: `oracle self-check detects: ${name}`, status: issues.some((i) => expect.test(i.name)) ? 'pass' : 'fail', detail: { issues: issues.slice(0, 3).map((i) => i.name) }, seed: ctx.baseSeed });
  };
  const firstSet = (s) => s.workouts.find((w) => w.status === 'completed').exercises[0].sets[0];
  mutate('negative load', (s) => { firstSet(s).weight = -5; }, /invalid load/);
  mutate('NaN reps', (s) => { firstSet(s).reps = NaN; }, /invalid reps/);
  mutate('RIR out of range', (s) => { firstSet(s).rir = 42; }, /invalid RIR/);
  mutate('duplicate workout id', (s) => { s.workouts.push({ ...s.workouts[0] }); }, /duplicate workout id/);
  mutate('completed session dated in the future', (s) => { s.workouts.find((w) => w.status === 'completed').scheduledDate = '2099-01-01'; }, /future/);
  mutate('orphan exercise id', (s) => { s.workouts.find((w) => w.status === 'completed').exercises[0].exerciseId = 'no_such_exercise'; }, /orphan exercise/);
  mutate('orphan achievement', (s) => { s.achievements.push({ id: 'x', workoutId: 'nope', kind: 'load', label: 'l' }); }, /orphan achievement/);
  mutate('impossible set volume', (s) => { const st = firstSet(s); st.reps = 500; st.weight = 100; st.completed = true; }, /impossible volume/);
  mutate('unavailable equipment prescribed', (s) => { const w = s.workouts.find((x) => x.status === 'completed'); const barbell = E.exercisesMod.EXERCISES.find((e) => e.equipment.every((q) => q === 'machine')); w.exercises[0].exerciseId = barbell.id; sim.log.equipmentByDate[w.scheduledDate] = ['dumbbell']; }, /unavailable equipment/);
  // prescription oracle: an unsupported large jump must be flagged
  const ex = E.exercisesMod.EXERCISES.find((e) => e.id === 'machine_chest_press');
  const st = { workouts: [{ status: 'completed', exercises: [{ exerciseId: ex.id, sets: [1, 2, 3].map(() => ({ completed: true, type: 'working', weight: 20, reps: 9 })) }] }] };
  const flagged = inv.checkPrescriptions([{ exerciseId: ex.id, weight: 40, kind: 'baseline', reason: '' }], st, E.exercisesMod.EXERCISES, E.training, ['machine']);
  out.push({ category: 'progressive_overload', name: 'oracle self-check detects an unsupported +100% load jump', status: flagged.some((i) => i.severity === 'hard') ? 'pass' : 'fail', detail: flagged, seed: ctx.baseSeed });
  const okRx = inv.checkPrescriptions([{ exerciseId: ex.id, weight: 20, kind: 'baseline', reason: '' }], st, E.exercisesMod.EXERCISES, E.training, ['machine']);
  out.push({ category: 'progressive_overload', name: 'oracle self-check accepts a legitimate hold', status: okRx.length === 0 ? 'pass' : 'fail', detail: okRx, seed: ctx.baseSeed });
  // return-to-training oracle: each known-bad prescription after a layoff must be flagged, a correct one accepted
  const layoffState = { workouts: [{ status: 'completed', scheduledDate: '2026-01-05', completedAt: '2026-01-05T10:00:00Z', exercises: [{ exerciseId: ex.id, sets: [1, 2, 3].map(() => ({ completed: true, type: 'working', weight: 20, reps: 10 })) }] }] };
  const layoff = (date, weight) => inv.checkPrescriptions([{ date, exerciseId: ex.id, weight, kind: 'baseline', reason: '' }], layoffState, E.exercisesMod.EXERCISES, E.training, ['machine'], {});
  const hardOf = (list) => list.filter((i) => i.severity === 'hard');
  out.push({ category: 'missed_workouts', name: 'oracle self-check detects a 30-day layoff ignored (same load prescribed)', status: hardOf(layoff('2026-02-04', 20)).length ? 'pass' : 'fail', detail: layoff('2026-02-04', 20), seed: ctx.baseSeed });
  out.push({ category: 'missed_workouts', name: 'oracle self-check detects an INCREASE on the return session', status: hardOf(layoff('2026-02-04', 22.5)).length ? 'pass' : 'fail', detail: layoff('2026-02-04', 22.5), seed: ctx.baseSeed });
  out.push({ category: 'missed_workouts', name: 'oracle self-check detects an excessive return reduction (40% off after a 14-day gap)', status: hardOf(layoff('2026-01-19', 12)).length ? 'pass' : 'fail', detail: layoff('2026-01-19', 12), seed: ctx.baseSeed });
  out.push({ category: 'missed_workouts', name: 'oracle self-check accepts the documented return loads (14 d -> 17.5, 30 d -> 15, 60 d -> 12.5) and normal holds under 14 d', status: [['2026-01-19', 17.5], ['2026-02-04', 15], ['2026-03-06', 12.5], ['2026-01-12', 20]].every(([d, w]) => hardOf(layoff(d, w)).length === 0) ? 'pass' : 'fail', detail: [['2026-01-19', 17.5], ['2026-02-04', 15], ['2026-03-06', 12.5], ['2026-01-12', 20]].map(([d, w]) => layoff(d, w)), seed: ctx.baseSeed });
  // zero-set oracle: a completed workout with no logged sets is a hard failure
  mutate('completed workout with zero logged sets', (s2) => { const w = s2.workouts.find((x) => x.status === 'completed'); w.exercises.forEach((we) => we.sets.forEach((st2) => { st2.completed = false; })); }, /no completed sets/);
  // Coach context oracle: a Coach that prescribes a load from recovery context, or invents a plateau, must be caught
  const ctxOracle = require('./context.cjs');
  const realCoach = E.coachMod;
  const fakeE = (coach) => ({ ...E, coachMod: { ...realCoach, coach } });
  const ctxState = JSON.parse(JSON.stringify(sim.state)); ctxState.exercises = E.exercisesMod.EXERCISES;
  ctxState.recoveryLog = [{ date: '2026-01-21', sleepHours: 4, soreness: 5 }];
  const cleanIssues = ctxOracle.checkCoachContext(E, ctxState, '2026-01-21', E.exercisesMod.EXERCISES, [], {});
  out.push({ category: 'recovery', name: 'oracle self-check accepts the real Coach on recovery + plateau evidence', status: cleanIssues.filter((i) => i.severity === 'hard').length === 0 ? 'pass' : 'fail', detail: cleanIssues.slice(0, 3), seed: ctx.baseSeed });
  const weightCoach = (c) => { const r = realCoach.coach(c); return { ...r, decision: { ...r.decision, prescription: { ...(r.decision.prescription || {}), weight: 10 } } }; };
  out.push({ category: 'recovery', name: 'oracle self-check detects a Coach that prescribes a load from recovery context', status: ctxOracle.checkCoachContext(fakeE(weightCoach), ctxState, '2026-01-21', E.exercisesMod.EXERCISES, [], {}).some((i) => /load\/sets prescription/.test(i.name)) ? 'pass' : 'fail', detail: {}, seed: ctx.baseSeed });
  const mutatingCoach = (c) => { c.state.recoveryLog = []; return realCoach.coach(c); };
  out.push({ category: 'recovery', name: 'oracle self-check detects a Coach call that mutates application state', status: ctxOracle.checkCoachContext(fakeE(mutatingCoach), JSON.parse(JSON.stringify(ctxState)), '2026-01-21', E.exercisesMod.EXERCISES, [], {}).some((i) => /mutated application state/.test(i.name)) ? 'pass' : 'fail', detail: {}, seed: ctx.baseSeed });
  const lyingEvidence = { ...realCoach, coachEvidenceFromState: () => ({ context: undefined, plateaus: [{ exerciseId: 'machine_chest_press', exerciseName: 'x', sessions: 4, detail: '' }] }) };
  out.push({ category: 'plateau', name: 'oracle self-check detects plateau evidence that the independent rule does not support', status: ctxOracle.checkCoachContext({ ...E, coachMod: lyingEvidence }, { ...ctxState, workouts: [] }, '2026-01-21', E.exercisesMod.EXERCISES, [], {}).some((i) => /differs from the independent plateau rule/.test(i.name)) ? 'pass' : 'fail', detail: {}, seed: ctx.baseSeed });
  const pr = require('./progression-oracle.cjs').prOracle({ workouts: [{ id: 'a', status: 'completed', exercises: [{ exerciseId: 'x', sets: [{ completed: true, type: 'working', weight: 10, reps: 5 }] }] }, { id: 'b', status: 'completed', exercises: [{ exerciseId: 'x', sets: [{ completed: true, type: 'working', weight: 10, reps: 5 }] }] }], achievements: [{ workoutId: 'b', exerciseId: 'x', kind: 'load' }] }, []);
  out.push({ category: 'prs', name: 'oracle self-check detects a false load PR', status: pr.issues.some((i) => i.severity === 'hard') ? 'pass' : 'fail', detail: pr.issues, seed: ctx.baseSeed });
  return out;
}
module.exports = { run };
