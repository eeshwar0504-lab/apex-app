'use strict';
/*
 * Independent oracle for the Coach context layer (recovery evidence + plateau evidence).
 * Contract under test (docs: src/coach/types.ts "evidence, not automatic prescriptions";
 * BUILD_STATUS "plateau candidate signals with no silent plan changes"):
 *   - plateau evidence = at least 3 comparable completed sessions (same working load) of an exercise whose
 *     total completed rep output is identical (looking at the most recent 4); unchanged reps at a higher
 *     load is progress, not a plateau;
 *   - the Coach may explain evidence and offer options but never changes state or a prescription;
 *   - recovery context is weak evidence (low confidence) and never alters the deterministic load.
 */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/* Independent re-statement of the plateau rule, derived from logged history only. */
function expectedPlateaus(state) {
  // chronological by when each session was completed, independent of how the records are stored
  const done = state.workouts.filter((w) => w.status === 'completed').map((w, i) => ({ w, i })).sort((a, b) => (Date.parse(a.w.completedAt || a.w.scheduledDate) - Date.parse(b.w.completedAt || b.w.scheduledDate)) || a.i - b.i).map((x) => x.w);
  const out = [];
  for (const ex of state.exercises) {
    const rows = done.filter((w) => w.exercises.some((we) => we.exerciseId === ex.id)).slice(-4);
    if (rows.length < 3) continue;
    const totals = rows.map((w) => w.exercises.filter((we) => we.exerciseId === ex.id).flatMap((we) => we.sets).filter((s) => s.completed && s.type !== 'warmup').reduce((n, s) => n + (isNum(s.reps) ? s.reps : 0) + (isNum(s.seconds) ? s.seconds : 0), 0));
    // the load of a session: the heaviest external load, or (assisted movements) the LOWEST assistance; warm-ups excluded
    const assisted = ex.loadSemantics === 'assistance';
    const loads = rows.map((w) => {
      const values = w.exercises.filter((we) => we.exerciseId === ex.id).flatMap((we) => we.sets).filter((x) => x.completed && x.type !== 'warmup').map((x) => (assisted ? (isNum(x.assistance) ? x.assistance : x.weight) : x.weight)).filter(isNum);
      if (!values.length) return 0;
      return assisted ? Math.min(...values) : Math.max(0, ...values);
    });
    if (!loads.every((l) => l === loads[0])) continue; // not comparable: the load changed, so unchanged reps are not a plateau
    if (totals[0] > 0 && totals.every((t) => t === totals[0])) out.push(ex.id); // zero output is absence of evidence
  }
  return out.slice(0, 6);
}

function checkCoachContext(E, state, date, exercises, rxs, log) {
  const out = [];
  const T = E.training;
  const add = (severity, name, detail) => out.push({ category: 'coach_context', severity, name, detail });
  const snapshot = JSON.stringify({ w: state.workouts, r: state.recoveryLog, a: state.achievements });
  let evidence;
  try { evidence = E.coachMod.coachEvidenceFromState(state, date); }
  catch (err) { add('hard', 'coach evidence extraction crashed', { error: String(err.message || err) }); return out; }
  log.contextChecks = (log.contextChecks || 0) + 1;

  if (evidence.plateaus.length) log.plateauFlags = (log.plateauFlags || 0) + 1;
  // 1. plateau evidence equals the independent expectation
  const want = expectedPlateaus(state);
  const got = evidence.plateaus.map((p) => p.exerciseId);
  log.plateauChecks = (log.plateauChecks || 0) + 1;
  if (JSON.stringify(want) !== JSON.stringify(got)) add('hard', 'plateau evidence differs from the independent plateau rule', { want, got });

  // 2. recovery evidence only from a recent, in-range check-in
  if (evidence.context) {
    const c = evidence.context;
    if (c.sleepHours !== undefined && !(c.sleepHours >= 0 && c.sleepHours <= 24)) add('hard', 'recovery context sleepHours out of range reached the Coach', { c });
    for (const k of ['sleepQuality', 'soreness', 'fatigue', 'stress', 'readiness']) if (c[k] !== undefined && !(c[k] >= 1 && c[k] <= 5)) add('hard', 'recovery context ' + k + ' out of range reached the Coach', { c });
  }

  // 3. the Coach explains but never mutates or prescribes a load
  let result;
  try {
    result = E.coachMod.coach({ state, profile: state.profile, goals: state.goals, primaryGoal: state.profile && state.profile.primaryGoal, recentWorkoutIds: [], recentExerciseEntryIds: [], now: date + 'T07:00:00.000Z', context: evidence.context, plateaus: evidence.plateaus });
  } catch (err) { add('hard', 'Coach crashed on plateau/recovery evidence', { error: String(err.message || err) }); return out; }
  const d = result.decision;
  if (JSON.stringify({ w: state.workouts, r: state.recoveryLog, a: state.achievements }) !== snapshot) add('hard', 'Coach call mutated application state', {});
  if (d.prescription && (d.prescription.weight !== undefined || d.prescription.sets !== undefined)) add('hard', 'Coach context decision carried a load/sets prescription', { action: d.action });
  if (evidence.plateaus.length) {
    if (d.action !== 'review') add('hard', 'plateau evidence did not produce a review decision', { action: d.action });
    for (const p of evidence.plateaus) if (!d.evidence.some((e) => e.id === 'e_plateau_' + p.exerciseId)) add('hard', 'plateau evidence missing from the Coach evidence list', { exerciseId: p.exerciseId });
    const weakest = Math.min(...evidence.plateaus.map((p) => p.sessions));
    if (weakest < 4 && d.confidence !== 'low') add('hard', 'three-session plateau reported with more than low confidence', { confidence: d.confidence });
    if (!/not a diagnosis/.test(result.explanation)) add('hard', 'plateau explanation claims certainty', {});
  } else if (d.action === 'review' || d.candidates.some((c) => c.id === 'review_plateau')) add('hard', 'Coach invented a plateau that the rule does not support', {});
  if (evidence.context) {
    const e = d.evidence.find((x) => x.id === 'e_recovery');
    if (!e) add('hard', 'recovery context missing from the Coach evidence list', {});
    else if (e.confidence !== 'low') add('hard', 'self-reported recovery treated as more than low-confidence evidence', { confidence: e.confidence });
    if (d.safety.status === 'clear' && !/does not change your prescription/.test(result.explanation)) add('hard', 'Coach did not state that recovery context leaves the prescription unchanged', {});
  }

  // 4. metamorphic: removing the recovery log must not change any prescription
  const stripped = { ...state, recoveryLog: undefined };
  const done = state.workouts.filter((w) => w.status === 'completed');
  for (const rx of (rxs || []).slice(0, 3)) {
    const ex = exercises.find((e) => e.id === rx.exerciseId);
    const a = T.personalizedLoad(ex, done, state.profile, exercises, date);
    const b = T.personalizedLoad(ex, stripped.workouts.filter((w) => w.status === 'completed'), stripped.profile, exercises, date);
    if (a.weight !== b.weight || a.reason !== b.reason) add('hard', 'recovery context changed a deterministic prescription', { exercise: rx.exerciseId, with: a.weight, without: b.weight });
  }
  return out;
}

module.exports = { checkCoachContext, expectedPlateaus };
