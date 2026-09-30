'use strict';
/*
 * Independent oracle. Nothing in here calls APEX's progression/personalizedLoad.
 * HARD  = violates a defined contract or corrupts data.
 * WARN  = valid-but-unexpected; needs human REVIEW (never auto-labelled a bug).
 */
const { loadEngine } = require('../load-engine.cjs');

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const EXTERNAL = (ex) => !['bodyweight', 'none', 'time', 'assistance'].includes(ex.loadSemantics);
const availableUnder = (ex, equipment) => ex.equipment.includes('bodyweight') || ex.equipment.some((e) => equipment.includes(e));

/* Data-integrity invariants over the whole state. */
function checkState(state, simDate, log) {
  const E = loadEngine();
  const out = [];
  const add = (severity, name, detail) => out.push({ category: 'data_integrity', severity, name, detail });
  for (const i of E.integrity.inspectState(state)) add(i.severity === 'error' ? 'hard' : 'warn', 'APEX integrity: ' + i.message, { path: i.path });
  const exIds = new Set(state.exercises.map((e) => e.id));
  const exById = new Map(state.exercises.map((e) => [e.id, e]));
  const workoutIds = new Set();
  const scheduledDates = new Set();
  for (const w of state.workouts) {
    if (workoutIds.has(w.id)) add('hard', 'duplicate workout id', { id: w.id });
    workoutIds.add(w.id);
    if (w.source === 'scheduled' && w.status !== 'missed') {
      const key = w.scheduledDate + '|' + w.name;
      if (scheduledDates.has(key)) add('hard', 'duplicate scheduled session on the same date', { key });
      scheduledDates.add(key);
    }
    if (w.status === 'completed') {
      if (w.scheduledDate > simDate) add('hard', 'completed session dated in the future', { date: w.scheduledDate, simDate });
      if (w.completedAt && w.completedAt.slice(0, 10) > simDate) add('hard', 'completedAt in the future', { completedAt: w.completedAt });
      const done = w.exercises.flatMap((we) => we.sets).filter((s) => s.completed).length;
      if (done === 0) add('hard', 'completed workout has no completed sets (a session with no logged sets must be abandoned, not completed)', { id: w.id, date: w.scheduledDate });
      const eq = log && log.equipmentByDate ? log.equipmentByDate[w.scheduledDate] : undefined;
      for (const we of w.exercises) {
        const ex = exById.get(we.exerciseId);
        if (!exIds.has(we.exerciseId)) add('hard', 'orphan exercise id in workout', { exerciseId: we.exerciseId, workout: w.id });
        if (ex && eq && !availableUnder(ex, eq)) add('hard', 'unavailable equipment prescribed', { exercise: ex.id, needs: ex.equipment, had: eq, date: w.scheduledDate });
        for (const s of we.sets) {
          if (s.weight !== undefined && (!isNum(s.weight) || s.weight < 0)) add('hard', 'invalid load', { v: s.weight, ex: we.exerciseId });
          if (s.reps !== undefined && (!isNum(s.reps) || s.reps < 0)) add('hard', 'invalid reps', { v: s.reps, ex: we.exerciseId });
          if (s.rir !== undefined && (!isNum(s.rir) || s.rir < 0 || s.rir > 10)) add('hard', 'invalid RIR', { v: s.rir, ex: we.exerciseId });
          if (s.completed && s.weight !== undefined && s.reps !== undefined && (s.reps > 200 || s.weight * s.reps > 20000)) add('hard', 'impossible volume for a set', { w: s.weight, r: s.reps });
        }
      }
    }
  }
  const seenAch = new Set();
  for (const a of state.achievements) {
    if (a.workoutId && !workoutIds.has(a.workoutId)) add('hard', 'orphan achievement (no such workout)', { id: a.id, workoutId: a.workoutId });
    const k = a.workoutId + '|' + a.exerciseId + '|' + a.kind + '|' + a.label;
    if (seenAch.has(k)) add('hard', 'duplicate achievement for the same workout', { k });
    seenAch.add(k);
  }
  for (const m of state.measurements) {
    if (m.weightKg !== undefined && (!isNum(m.weightKg) || m.weightKg <= 0 || m.weightKg > 400)) add('hard', 'invalid body weight', { v: m.weightKg });
    if (m.date > simDate) add('hard', 'body measurement dated in the future', { date: m.date });
  }
  return out;
}

/*
 * Independent statement of the documented return-to-training table (docs/RETURN_TO_TRAINING.md):
 * gap < 14 days: none; 14-27: 1 increment; 28-55: 2; 56+: 3; never above the last worked load,
 * never more than half of it, never below the smallest meaningful load.
 */
const TABLE = [[56, 3], [28, 2], [14, 1], [0, 0]];
const dayNum = (d) => Math.floor(Date.parse(String(d).slice(0, 10) + 'T00:00:00Z') / 86400000);
function layoffCheck(rx, ex, done, last, inc, add, log) {
  const dates = done.filter((w) => w.exercises.some((we) => we.exerciseId === ex.id && we.sets.some((s) => s.completed && isNum(s.weight) && s.weight > 0))).map((w) => String(w.completedAt || w.scheduledDate).slice(0, 10));
  if (!dates.length || !rx.date) return false;
  const gap = dayNum(rx.date) - dayNum(dates.sort().at(-1));
  const steps = TABLE.find(([min]) => gap >= min)[1];
  if (!steps) return false;
  if (log) log.layoffPrescriptions = (log.layoffPrescriptions || 0) + 1;
  const drop = last - rx.weight;
  if (drop < -1e-9) add('hard', 'load increased on the return session after a layoff', { last, prescribed: rx.weight, gapDays: gap });
  else if (last > inc * 1.0001 && drop <= 1e-9) add('hard', 'layoff of ' + gap + ' days was not reflected in the prescribed load', { last, prescribed: rx.weight, gapDays: gap, expectedSteps: steps });
  if (drop > steps * inc + inc / 2 + 1e-9) add('hard', 'return-to-training reduction larger than the documented maximum (' + steps + ' increment(s))', { last, prescribed: rx.weight, gapDays: gap, inc });
  if (drop > 0.5 * last + inc / 2 + 1e-9) add('hard', 'return-to-training reduction larger than half of the last worked load', { last, prescribed: rx.weight, gapDays: gap });
  if (drop < Math.min(steps * inc, 0.5 * last) - inc - 1e-9) add('hard', 'return-to-training reduction smaller than the documented minimum band', { last, prescribed: rx.weight, gapDays: gap, expectedSteps: steps, inc });
  return true;
}

/* Per-prescription behavioural invariants derived from the history the athlete really logged. */
function checkPrescriptions(rxs, state, exercises, T, equipment, log) {
  const out = [];
  const done = state.workouts.filter((w) => w.status === 'completed');
  for (const rx of rxs) {
    const ex = exercises.find((e) => e.id === rx.exerciseId);
    const add = (severity, name, detail) => out.push({ category: 'progression', severity, name, detail: { exercise: rx.exerciseId, prescribed: rx.weight, kind: rx.kind, ...detail } });
    if (!availableUnder(ex, equipment)) out.push({ category: 'equipment', severity: 'hard', name: 'prescribed exercise unavailable under current equipment', detail: { exercise: ex.id, needs: ex.equipment, had: equipment } });
    if (!EXTERNAL(ex)) continue;
    if (rx.weight !== undefined && (!isNum(rx.weight) || rx.weight < 0)) { add('hard', 'invalid prescribed load', {}); continue; }
    const hist = done.flatMap((w) => w.exercises.filter((we) => we.exerciseId === ex.id).flatMap((we) => we.sets)).filter((s) => s.completed && s.type !== 'warmup' && isNum(s.weight) && s.weight > 0);
    if (rx.weight === undefined || rx.weight === 0) { if (hist.length) add('warn', 'no numeric load prescribed although exact history exists', { history: hist.length }); continue; }
    if (!hist.length) continue; // first exposure: only the sanity checks above apply
    const last = hist[hist.length - 1].weight;
    const inc = Math.max(0.5, ex.incrementKg || 0.5);
    if (layoffCheck(rx, ex, done, last, inc, add, log)) continue;
    const top = ex.repRange[1];
    const last3 = hist.slice(-3);
    const supported = last3.length >= 2 && last3.every((s) => (s.reps ?? 0) >= top);
    const delta = rx.weight - last;
    if (/fallen below the target range/.test(rx.reason || '') && rx.weight >= last) add('warn', 'engine signalled "reduce" (repeatedly below rep range) but the prescribed load was not reduced', { last, recentReps: last3.map((s) => s.reps) });
    if (delta > 1e-9) {
      if (!supported) add(delta > 2 * inc + 1e-9 ? 'hard' : 'warn', 'load increased without supporting top-of-range performance', { last, delta, recentReps: last3.map((s) => s.reps), top });
      else if (delta > 2 * inc + 1e-9) add('hard', 'supported increase larger than two increments', { last, delta, inc });
    } else if (delta < -1e-9) {
      const bottom = ex.repRange[0];
      const belowRange = last3.filter((s) => (s.reps ?? 0) < bottom).length >= 2;
      if (!belowRange) add(-delta > 0.5 * last ? 'hard' : 'warn', 'load decreased versus last worked load without repeated sub-range performance', { last, delta, recentReps: last3.map((s) => s.reps) });
      else if (-delta > 3 * inc + 1e-9 && -delta > 0.5 * last) add('hard', 'reduction larger than both three increments and half the load', { last, delta, inc });
    }
  }
  return out;
}

/* Persistence: restored state must equal what was saved (canonical fields). */
function compareStates(a, b) {
  const out = [];
  const eq = (path, x, y) => { if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ message: 'persistence changed ' + path, path, saved: summarize(x), restored: summarize(y) }); };
  const summarize = (v) => { const s = JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 300) + '…' : s; };
  eq('workouts', a.workouts, b.workouts);
  eq('measurements', a.measurements, b.measurements);
  eq('achievements', a.achievements, b.achievements);
  eq('goals', a.goals, b.goals);
  eq('profile', a.profile, b.profile);
  eq('plan', a.plan, b.plan);
  eq('nutrition', a.nutrition, b.nutrition);
  eq('preferences.units', a.preferences.units, b.preferences.units);
  eq('onboardingComplete', a.onboardingComplete, b.onboardingComplete);
  eq('recoveryLog', a.recoveryLog, b.recoveryLog);
  return out;
}

module.exports = { checkState, checkPrescriptions, compareStates, availableUnder, EXTERNAL, isNum };
