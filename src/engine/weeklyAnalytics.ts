/**
 * Weekly training analytics (Phase 14).
 *
 * A read-only, deterministic view of one calendar week of existing history. It is derived on every call from the workouts, the
 * accepted deload days and the profile; nothing is stored, written or sent anywhere. It owns no progression or fatigue model: the
 * progression section reads the Phase 11 longitudinal decision and exposure kinds, and the recovery section reads the Phase 12
 * fatigue assessment. It makes no judgement about volume (no "good", "bad" or "optimal"): it counts and compares.
 *
 * WEEK. Weeks start on Monday in the athlete's local calendar. The current week runs from its Monday to `today`; it is compared
 * with the SAME NUMBER OF DAYS from the previous Monday, so a partly finished week is never compared with a whole one.
 * A comparison whose earlier span has no completed session says `not_enough_data` instead of producing a percentage.
 *
 * VOLUME. Only completed workouts whose local day falls in the week, and only counted sets: completed, not a warm-up, with a real
 * performance (reps or seconds above zero). Tonnage is the existing volumeForWorkout. A set counts once toward each muscle the
 * exercise lists, as DIRECT for its primary muscles and as INDIRECT for its secondary muscles (a muscle that is both counts once,
 * as direct). Shares are relative to the week's direct sets.
 *
 * CONSISTENCY. Planned = scheduled-source workouts dated from the Monday through today, except sessions that were moved
 * (status rescheduled; their replacement is counted on its new day). Completed counts every completed session; the plan-adherence
 * rate only counts completed scheduled sessions against planned ones, and is null when nothing was planned.
 */
import type { AppState, Exercise, Workout } from '../core/types';
import { addDaysLocal, dayNumber, workoutDay } from '../data/dates';
import { exposureKinds } from './longitudinal';
import { chronologicalCompleted, exerciseExposures, isWorkingSet, personalizedLoad, progressionEvidence, recoveryAssessment, volumeForWorkout } from './training';
import type { LongitudinalOutcome, LongitudinalReason } from './longitudinal';
import type { DeloadStatus, FatigueLevel, RecoveryTrend } from './fatigue';

export type ComparisonState = 'ok' | 'not_enough_data';

export interface Comparison {
  current: number | null;
  prior: number | null;
  delta: number | null;
  /** Whole percent against the prior value; null when the prior value is zero or missing. */
  deltaPct: number | null;
  state: ComparisonState;
}

export interface WeekWindow {
  /** Monday of the week, YYYY-MM-DD. */
  start: string;
  /** Sunday of the week. */
  end: string;
  /** Days from the Monday through today, inclusive (1 to 7). */
  elapsedDays: number;
}

export interface MuscleVolume {
  muscle: string;
  directSets: number;
  indirectSets: number;
  /** Whole percent of the week's direct sets; 0 for a muscle trained only indirectly. */
  sharePct: number;
}

export interface WeekVolume {
  workingSets: number;
  tonnage: number;
  exercises: number;
  byMuscle: MuscleVolume[];
}

export interface WeekConsistency {
  sessionsCompleted: number;
  plannedSessions: number;
  scheduledCompleted: number;
  missed: number;
  skipped: number;
  /** Whole percent of planned scheduled sessions that were completed; null when nothing was planned. */
  adherencePct: number | null;
  trainingDays: number;
  /** Consecutive weeks (this one counted once it has a session) with at least one completed session. */
  streakWeeks: number;
}

export interface ExerciseWeek {
  exerciseId: string;
  name: string;
  /** What the exercise did this week, from the Phase 11 exposure kinds. */
  change: 'progressed' | 'regressed' | 'flat' | 'reentry' | 'new';
  loadChange: number | null;
  performanceChange: number | null;
  /** The Phase 11 longitudinal decision as of today. */
  decision: { outcome: LongitudinalOutcome; reason: LongitudinalReason; stalls: number };
}

export interface WeekProgression {
  exercises: ExerciseWeek[];
  progressed: number;
  regressed: number;
  flat: number;
  stalled: number;
}

export interface WeekRecovery {
  level: FatigueLevel;
  score: number;
  trend: RecoveryTrend;
  status: DeloadStatus;
  reasons: string[];
}

export interface WeeklyAnalytics {
  week: WeekWindow;
  /** The earlier span used for comparison: the same number of days a week before. */
  priorWeek: { start: string; end: string };
  volume: WeekVolume;
  consistency: WeekConsistency;
  progression: WeekProgression;
  recovery: WeekRecovery | null;
  comparison: {
    sessions: Comparison;
    workingSets: Comparison;
    tonnage: Comparison;
    adherencePct: Comparison;
    progressed: Comparison;
    fatigueScore: Comparison;
  };
  /** Trained muscles, most direct sets first (ties by name). */
  coverage: MuscleVolume[];
  /** True when the week has no completed session. */
  empty: boolean;
}

/** The Monday of the local week containing `day` (1970-01-01 was a Thursday). */
export function weekStartOf(day: string): string | undefined {
  const n = dayNumber(day);
  if (n === undefined) return undefined;
  return addDaysLocal(day, -(((n + 3) % 7) + 7) % 7);
}

export function weekWindow(today: string): WeekWindow | undefined {
  const start = weekStartOf(today);
  const a = dayNumber(start);
  const t = dayNumber(today);
  if (!start || a === undefined || t === undefined) return undefined;
  return { start, end: addDaysLocal(start, 6), elapsedDays: t - a + 1 };
}

const counted = (set: Workout['exercises'][number]['sets'][number]) =>
  isWorkingSet(set) && ((Number.isFinite(set.reps) && (set.reps as number) > 0) || (Number.isFinite(set.seconds) && (set.seconds as number) > 0));

const inSpan = (day: string, start: string, end: string) => day >= start && day <= end;
const completedIn = (workouts: Workout[], start: string, end: string) => workouts.filter(w => w.status === 'completed' && inSpan(workoutDay(w), start, end));

function volumeOf(workouts: Workout[], exercises: Exercise[]): WeekVolume {
  const direct = new Map<string, number>();
  const indirect = new Map<string, number>();
  let workingSets = 0;
  const trained = new Set<string>();
  for (const w of workouts) for (const entry of w.exercises) {
    const ex = exercises.find(e => e.id === entry.exerciseId);
    const n = entry.sets.filter(counted).length;
    if (!n) continue;
    workingSets += n;
    trained.add(entry.exerciseId);
    if (!ex) continue;
    for (const m of ex.primaryMuscles) direct.set(m, (direct.get(m) ?? 0) + n);
    for (const m of ex.secondaryMuscles) if (!ex.primaryMuscles.includes(m)) indirect.set(m, (indirect.get(m) ?? 0) + n);
  }
  const totalDirect = [...direct.values()].reduce((a, b) => a + b, 0);
  const muscles = [...new Set([...direct.keys(), ...indirect.keys()])];
  const byMuscle = muscles
    .map(muscle => ({ muscle, directSets: direct.get(muscle) ?? 0, indirectSets: indirect.get(muscle) ?? 0, sharePct: totalDirect ? Math.round(((direct.get(muscle) ?? 0) / totalDirect) * 100) : 0 }))
    .sort((a, b) => b.directSets - a.directSets || b.indirectSets - a.indirectSets || (a.muscle < b.muscle ? -1 : 1));
  return { workingSets, tonnage: Math.round(workouts.reduce((a, w) => a + volumeForWorkout(w, exercises), 0)), exercises: trained.size, byMuscle };
}

function consistencyOf(state: AppState, start: string, today: string): WeekConsistency {
  // `today` is the last day of the span (the real today, or the matching day a week earlier)
  const week = state.workouts.filter(w => inSpan(w.scheduledDate, start, today) && w.source === 'scheduled' && w.status !== 'rescheduled');
  const done = completedIn(state.workouts, start, today);
  const scheduledDone = week.filter(w => w.status === 'completed').length;
  // consecutive weeks with a completed session, counting back from the current week (an empty current week does not break it yet)
  const days = new Set(state.workouts.filter(w => w.status === 'completed').map(w => weekStartOf(workoutDay(w))).filter((d): d is string => !!d));
  let streak = 0;
  let cursor = start;
  if (!days.has(cursor)) cursor = addDaysLocal(cursor, -7);
  while (days.has(cursor)) { streak++; cursor = addDaysLocal(cursor, -7); }
  return {
    sessionsCompleted: done.length,
    plannedSessions: week.length,
    scheduledCompleted: scheduledDone,
    missed: week.filter(w => w.status === 'missed').length,
    skipped: week.filter(w => w.status === 'skipped').length,
    adherencePct: week.length ? Math.round((scheduledDone / week.length) * 100) : null,
    trainingDays: new Set(done.map(w => workoutDay(w))).size,
    streakWeeks: streak,
  };
}

function compare(current: number | null, prior: number | null, enough: boolean): Comparison {
  if (!enough || current === null || prior === null) return { current, prior, delta: null, deltaPct: null, state: 'not_enough_data' };
  return { current, prior, delta: Math.round((current - prior) * 100) / 100, deltaPct: prior > 0 ? Math.round(((current - prior) / prior) * 100) : null, state: 'ok' };
}

/** What each exercise did in a span, from the Phase 11 exposures (deload sessions are not evidence). */
function exerciseKindsIn(state: AppState, evidence: Workout[], start: string, end: string) {
  const out: { ex: Exercise; change: ExerciseWeek['change']; loadChange: number | null; performanceChange: number | null }[] = [];
  const ids = new Set<string>();
  for (const w of completedIn(evidence, start, end)) for (const e of w.exercises) if (e.sets.some(counted)) ids.add(e.exerciseId);
  const lo = dayNumber(start) as number;
  const hi = dayNumber(end) as number;
  for (const id of [...ids].sort()) {
    const ex = state.exercises.find(e => e.id === id);
    if (!ex) continue;
    const { exposures } = exerciseExposures(ex, evidence, state.profile?.primaryGoal);
    const kinds = exposureKinds(exposures, ex.loadSemantics === 'assistance');
    let last = -1;
    exposures.forEach((e, i) => { if (e.day >= lo && e.day <= hi) last = i; });
    if (last < 0) continue;
    const kind = kinds[last];
    const prev = last > 0 ? exposures[last - 1] : undefined;
    out.push({
      ex,
      change: kind === 'baseline' ? 'new' : kind,
      loadChange: prev && prev.load !== undefined && exposures[last].load !== undefined ? Math.round(((exposures[last].load as number) - prev.load) * 100) / 100 : null,
      performanceChange: prev ? exposures[last].topPerformance - prev.topPerformance : null,
    });
  }
  return out;
}

/** The weekly analytics for the week containing `today` (a local calendar day, YYYY-MM-DD). Undefined for an invalid day. */
export function weeklyAnalytics(state: AppState, today: string): WeeklyAnalytics | undefined {
  const week = weekWindow(today);
  if (!week) return undefined;
  const priorStart = addDaysLocal(week.start, -7);
  const priorEnd = addDaysLocal(priorStart, week.elapsedDays - 1);
  const workouts = state.workouts;
  const evidence = progressionEvidence(workouts, state.deloads);

  const now = completedIn(workouts, week.start, today);
  const before = completedIn(workouts, priorStart, priorEnd);
  const volume = volumeOf(now, state.exercises);
  const priorVolume = volumeOf(before, state.exercises);
  const consistency = consistencyOf(state, week.start, today);
  const priorConsistency = consistencyOf(state, priorStart, priorEnd);

  const thisWeek = exerciseKindsIn(state, evidence, week.start, today);
  const progression: WeekProgression = { exercises: [], progressed: 0, regressed: 0, flat: 0, stalled: 0 };
  for (const item of thisWeek) {
    const rec = personalizedLoad(item.ex, workouts, state.profile, state.exercises, today, state.deloads);
    const d = rec.longitudinal;
    const decision = { outcome: (d?.outcome ?? 'CONTINUE') as LongitudinalOutcome, reason: (d?.reason ?? 'continuing') as LongitudinalReason, stalls: d?.state.consecutiveStalls ?? 0 };
    progression.exercises.push({ exerciseId: item.ex.id, name: item.ex.name, change: item.change, loadChange: item.loadChange, performanceChange: item.performanceChange, decision });
    if (item.change === 'progressed') progression.progressed++;
    else if (item.change === 'regressed') progression.regressed++;
    else if (item.change === 'flat') progression.flat++;
    if (decision.outcome === 'PLATEAU' || decision.outcome === 'CONSIDER_VARIATION') progression.stalled++;
  }
  const priorProgressed = exerciseKindsIn(state, evidence, priorStart, priorEnd).filter(i => i.change === 'progressed').length;

  const assessment = recoveryAssessment(workouts, state.exercises, today, state.deloads, state.profile?.primaryGoal);
  const priorAssessment = recoveryAssessment(workouts, state.exercises, priorEnd, state.deloads, state.profile?.primaryGoal);
  const recovery: WeekRecovery | null = assessment
    ? { level: assessment.level, score: assessment.score, trend: assessment.trend, status: assessment.status, reasons: [...assessment.signals.reasons] }
    : null;

  const priorHasData = before.length > 0;
  return {
    week,
    priorWeek: { start: priorStart, end: priorEnd },
    volume,
    consistency,
    progression,
    recovery,
    comparison: {
      sessions: compare(consistency.sessionsCompleted, priorConsistency.sessionsCompleted, priorHasData),
      workingSets: compare(volume.workingSets, priorVolume.workingSets, priorHasData),
      tonnage: compare(volume.tonnage, priorVolume.tonnage, priorHasData && priorVolume.tonnage > 0),
      adherencePct: compare(consistency.adherencePct, priorConsistency.adherencePct, priorConsistency.adherencePct !== null),
      progressed: compare(progression.progressed, priorProgressed, priorHasData),
      fatigueScore: compare(assessment?.score ?? null, priorAssessment?.score ?? null, priorHasData && !!assessment && !!priorAssessment),
    },
    coverage: volume.byMuscle,
    empty: now.length === 0,
  };
}

/** Completed sessions in time order, for callers that want the raw list behind a week. */
export function weekWorkouts(state: AppState, today: string): Workout[] {
  const week = weekWindow(today);
  return week ? chronologicalCompleted(completedIn(state.workouts, week.start, today)) : [];
}

/** The last few training days of one exercise, newest last, each with how it compared with the day before (Phase 11 exposure kinds). */
export function exerciseTrend(state: AppState, ex: Exercise, limit = 5): { date: string; load?: number; topPerformance: number; kind: string }[] {
  const evidence = progressionEvidence(state.workouts, state.deloads);
  const { exposures } = exerciseExposures(ex, evidence, state.profile?.primaryGoal);
  const kinds = exposureKinds(exposures, ex.loadSemantics === 'assistance');
  const dateOf = (day: number) => addDaysLocal('1970-01-01', day); // a day number counts calendar days from 1970-01-01
  const from = Math.max(0, exposures.length - limit);
  return exposures.slice(from).map((e, i) => ({ date: dateOf(e.day), ...(e.load !== undefined ? { load: e.load } : {}), topPerformance: e.topPerformance, kind: kinds[from + i] }));
}
