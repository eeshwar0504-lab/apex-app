/**
 * Coach 2.0 briefing (Phase 15).
 *
 * A deterministic synthesis of decisions the engines have ALREADY made, turned into one prioritised, actionable summary. It reads:
 *   - the existing Coach decision (its safety gate),
 *   - the Phase 11 longitudinal decision and the engine's own prescription for each of today's exercises,
 *   - the Phase 12 fatigue / deload status,
 *   - the Phase 14 weekly analytics.
 * It owns no progression or fatigue model, never writes a load, never names an exercise or a number that an engine did not produce,
 * and makes no medical statement. Nothing here can change training: it returns text and facts.
 *
 * PRIORITY (lower is more urgent; at most three distinct items are returned, one per kind, the first is the next step):
 *   0 safety_first            the existing Coach safety gate is not clear
 *   1 recovery_deload         deload recommended / active, or sustained fatigue
 *   2 conservative_reentry    an exercise today is on the return-to-training rule
 *   3 resume_after_missed     two or more missed sessions in 14 days, or 7+ days without a session
 *   4 review_stalled_exercise a Phase 11 plateau, or a plateau verdict deferred by fatigue
 *   5 follow_progression      the engine prescribes an increase
 *   6 review_consistency      under half of the planned sessions done this week (3+ days in, 2+ planned)
 *   7 maintain_load           the engine holds the load
 *   8 train_as_planned        nothing needs attention
 * With fewer than two completed sessions the status is insufficient_data and the briefing says so.
 */
import type { AppState, Exercise, Workout } from '../core/types';
import { addDaysLocal, dayNumber, workoutDay } from '../data/dates';
import { buildCoachContext } from '../engine/intelligence';
import { chronologicalCompleted, personalizedLoad } from '../engine/training';
import { recoveryStatus } from '../engine/deload';
import { weeklyAnalytics } from '../engine/weeklyAnalytics';
import type { WeeklyAnalytics } from '../engine/weeklyAnalytics';
import { coach } from './coach';

export type CoachStepKind =
  | 'safety_first' | 'recovery_deload' | 'conservative_reentry' | 'resume_after_missed' | 'review_stalled_exercise'
  | 'follow_progression' | 'review_consistency' | 'maintain_load' | 'train_as_planned';
export type CoachStatus = 'on_track' | 'attention' | 'recovery' | 'insufficient_data';
export type CoachSeverity = 'info' | 'attention' | 'important';

export interface CoachBriefItem {
  id: string;
  kind: CoachStepKind;
  priority: number;
  severity: CoachSeverity;
  text: string;
  reason: string;
  exerciseIds: string[];
  metrics: { label: string; value: string }[];
}

export interface ExerciseDecision {
  exerciseId: string;
  name: string;
  action?: string;
  weight?: number;
  outcome: string;
  reason: string;
  deloadStatus?: string;
}

export interface CoachBriefing {
  date: string;
  status: CoachStatus;
  headline: string;
  observations: string[];
  nextStep: CoachBriefItem;
  items: CoachBriefItem[];
  /** The engine decisions behind today's exercises, read only. */
  today: { workoutName?: string; exercises: ExerciseDecision[] };
  weekly?: WeeklyAnalytics;
  limitations: string[];
}

const MAX_ITEMS = 3;
const MAX_EXERCISES = 7;
const noon = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12, 0).toISOString(); };
const names = (list: string[]) => list.length <= 2 ? list.join(' and ') : `${list.slice(0, 2).join(', ')} and ${list.length - 2} more`;

function todaysWorkout(state: AppState, today: string): Workout | undefined {
  return state.workouts.find(w => w.status === 'in_progress')
    || state.workouts.find(w => w.scheduledDate === today && (w.status === 'planned' || w.status === 'rescheduled'))
    || state.workouts.filter(w => w.status === 'planned' && w.scheduledDate > today).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0];
}

/** What the engines say about today's exercises. Read only: the prescription is personalizedLoad, unchanged. */
export function todaysExerciseDecisions(state: AppState, today: string, workout?: Workout): ExerciseDecision[] {
  if (!workout) return [];
  const out: ExerciseDecision[] = [];
  for (const entry of workout.exercises.slice(0, MAX_EXERCISES)) {
    const ex = state.exercises.find(e => e.id === entry.exerciseId) as Exercise | undefined;
    if (!ex || entry.status === 'skipped') continue;
    const rec = personalizedLoad(ex, state.workouts, state.profile, state.exercises, today, state.deloads);
    out.push({
      exerciseId: ex.id, name: ex.name, action: rec.action, weight: rec.weight,
      outcome: rec.longitudinal?.outcome ?? 'CONTINUE', reason: rec.longitudinal?.reason ?? 'continuing', deloadStatus: rec.deload?.status,
    });
  }
  return out;
}

export function coachBriefing(state: AppState, today: string): CoachBriefing | undefined {
  if (dayNumber(today) === undefined) return undefined;
  const weekly = weeklyAnalytics(state, today);
  const workout = todaysWorkout(state, today);
  const decisions = todaysExerciseDecisions(state, today, workout);
  const done = chronologicalCompleted(state.workouts);
  const limitations: string[] = [];
  const items: CoachBriefItem[] = [];
  const add = (kind: CoachStepKind, priority: number, severity: CoachSeverity, text: string, reason: string, exerciseIds: string[] = [], metrics: CoachBriefItem['metrics'] = []) => {
    items.push({ id: `brief_${kind}`, kind, priority, severity, text, reason, exerciseIds, metrics });
  };

  // 0. the existing Coach safety gate (it owns what counts as a safety signal)
  const decision = coach(buildCoachContext(state, { now: noon(today) })).decision;
  if (decision.safety.status !== 'clear') add('safety_first', 0, 'important', 'Check how you feel before you train. APEX does not interpret symptoms.', decision.safety.reason);

  // 1. fatigue and deload (Phase 12)
  const status = recoveryStatus(state, today);
  if (status?.status === 'deload_recommended') add('recovery_deload', 1, 'important', 'A deload week is recommended: lighter loads, one fewer set per exercise and a higher target RIR. You decide whether to start it.', 'Training load has stayed high for two weeks in a row.', [], [{ label: 'Fatigue level', value: status.level }]);
  else if (status?.status === 'deload_active') add('recovery_deload', 1, 'info', `Deload week in progress (${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'} left). Follow the lighter prescription.`, 'You started a deload.');
  else if (status?.status === 'sustained_fatigue') add('recovery_deload', 1, 'attention', 'Training load is high and has been for a while. If it stays high next week APEX will recommend a deload.', 'Fatigue level is HIGH after an elevated week.', [], [{ label: 'Fatigue level', value: status.level }]);

  // 2. re-entry (Phase 11 + the existing return-to-training rule)
  const reentry = decisions.filter(d => d.outcome === 'CONSERVATIVE_REENTRY');
  if (reentry.length) add('conservative_reentry', 2, 'attention', `Return gently on ${names(reentry.map(d => d.name))}: the prescribed load is already reduced and normal progression resumes afterwards.`, 'A training gap triggered the return-to-training rule.', reentry.map(d => d.exerciseId));

  // 3. missed training
  const missed = state.workouts.filter(w => w.status === 'missed' && w.scheduledDate >= addDaysLocal(today, -14) && w.scheduledDate < today).length;
  const lastDone = done.at(-1);
  const sinceLast = lastDone ? (dayNumber(today) as number) - (dayNumber(workoutDay(lastDone)) as number) : undefined;
  if (done.length && (missed >= 2 || (sinceLast !== undefined && sinceLast >= 7))) {
    add('resume_after_missed', 3, 'attention', 'Pick training back up with your next planned session; do not try to make up the missed ones.', missed >= 2 ? `${missed} planned sessions were missed in the last 14 days.` : `It has been ${sinceLast} days since your last session.`, [], [{ label: 'Missed (14 days)', value: String(missed) }]);
  }

  // 4. stalled exercises (Phase 11)
  const stalled = decisions.filter(d => ['PLATEAU', 'CONSIDER_VARIATION'].includes(d.outcome));
  const deferred = decisions.filter(d => d.reason === 'recovery_hold' && d.outcome === 'RECOVER' && (weekly?.progression.exercises.find(x => x.exerciseId === d.exerciseId)?.decision.stalls ?? 0) >= 3);
  if (stalled.length) add('review_stalled_exercise', 4, 'attention', `Review ${names(stalled.map(d => d.name))}: progress has stalled. Hold the load and check technique and context before changing anything.`, 'Several sessions without progress.', stalled.map(d => d.exerciseId));
  else if (deferred.length) add('review_stalled_exercise', 4, 'info', `${names(deferred.map(d => d.name))} has stalled, but APEX is holding judgement while training load is high.`, 'A plateau is not judged while fatigue is high.', deferred.map(d => d.exerciseId));

  // 5. progression
  const progressing = decisions.filter(d => d.outcome === 'PROGRESS' && d.weight !== undefined);
  if (progressing.length) add('follow_progression', 5, 'info', `Follow the progression: ${progressing.slice(0, 2).map(d => `${d.name} at ${d.weight} kg`).join(', ')}${progressing.length > 2 ? ` and ${progressing.length - 2} more` : ''}.`, 'Your recent performance supports an increase.', progressing.map(d => d.exerciseId));

  // 6. consistency
  const c = weekly?.consistency;
  if (weekly && c && c.plannedSessions >= 2 && weekly.week.elapsedDays >= 3 && c.adherencePct !== null && c.adherencePct < 50) add('review_consistency', 6, 'attention', `Review your week: ${c.scheduledCompleted} of ${c.plannedSessions} planned sessions are done.`, 'Under half of this week\'s planned sessions are complete.', [], [{ label: 'Adherence', value: `${c.adherencePct}%` }]);

  // 7/8. nothing needs attention
  const holding = decisions.filter(d => d.outcome === 'HOLD' || d.outcome === 'CONTINUE');
  if (holding.length && workout) add('maintain_load', 7, 'info', 'Keep the prescribed loads: the engine is holding them while performance builds.', 'No progression is due yet.', holding.map(d => d.exerciseId));
  add('train_as_planned', 8, 'info', workout ? `Train ${workout.name} as planned.` : 'There is no session planned. Your next one will appear on the Train screen.', workout ? 'Nothing needs attention.' : 'No workout is scheduled.');

  const ordered = items.sort((a, b) => a.priority - b.priority).slice(0, MAX_ITEMS);
  const insufficient = done.length < 2;
  if (insufficient) limitations.push('Fewer than two completed sessions: trends, progression and comparisons need more history.');
  if (!status) limitations.push('Recovery status unavailable for this date.');
  if (!workout) limitations.push('No active or planned workout, so there are no exercise decisions to summarise.');

  const observations: string[] = [];
  if (weekly) {
    const cc = weekly.consistency;
    observations.push(`This week: ${cc.sessionsCompleted} session${cc.sessionsCompleted === 1 ? '' : 's'} done${cc.plannedSessions ? ` of ${cc.plannedSessions} planned` : ''}, ${weekly.volume.workingSets} working sets.`);
    const s = weekly.comparison.sessions;
    observations.push(s.state === 'ok' ? `Compared with the same days last week: ${(s.delta as number) >= 0 ? '+' : ''}${s.delta} session${Math.abs(s.delta as number) === 1 ? '' : 's'}.` : 'Not enough data yet to compare with last week.');
    if (weekly.progression.progressed || weekly.progression.stalled) observations.push(`${weekly.progression.progressed} exercise${weekly.progression.progressed === 1 ? '' : 's'} progressed${weekly.progression.stalled ? `, ${weekly.progression.stalled} stalled` : ''}.`);
  }
  if (status && status.status !== 'normal') observations.push(`Training load status: ${status.status.replace(/_/g, ' ')} (fatigue level ${status.level}, ${status.trend}).`);

  const top = ordered[0];
  const state_: CoachStatus = insufficient ? 'insufficient_data'
    : top.kind === 'safety_first' || top.kind === 'recovery_deload' && top.severity !== 'info' ? 'recovery'
    : ordered.some(i => i.severity !== 'info') ? 'attention' : 'on_track';
  const headline = insufficient ? 'Not enough history yet' : state_ === 'recovery' ? 'Recovery comes first' : state_ === 'attention' ? 'A few things to look at' : 'On track';
  return { date: today, status: state_, headline, observations: observations.slice(0, 4), nextStep: top, items: ordered, today: { workoutName: workout?.name, exercises: decisions }, ...(weekly ? { weekly } : {}), limitations };
}
