import type {AppState, Exercise} from '../core/types';
import {plateauCandidates, consistencySummary} from '../engine/analytics';
import {latestRecoveryCheckIn} from '../engine/recovery';
import {chronologicalCompleted, trainingGapDays, workloadFatigue} from '../engine/training';
import {addDaysLocal} from '../data/dates';
import type {CoachContextSignals, CoachStateSignals, PlateauSignal} from './types';

function recoveryState(context: CoachContextSignals | undefined): CoachStateSignals['recovery'] {
 if (!context) return 'missing';
 const poor = (context.sleepHours !== undefined && context.sleepHours < 6)
  || (context.sleepQuality !== undefined && context.sleepQuality <= 2)
  || (context.soreness !== undefined && context.soreness >= 4)
  || (context.fatigue !== undefined && context.fatigue >= 4)
  || (context.readiness !== undefined && context.readiness <= 2);
 const good = (context.sleepHours !== undefined && context.sleepHours >= 7)
  && (context.sleepQuality === undefined || context.sleepQuality >= 4)
  && (context.soreness === undefined || context.soreness <= 2)
  && (context.fatigue === undefined || context.fatigue <= 2)
  && (context.readiness === undefined || context.readiness >= 4);
 return poor && good ? 'conflicted' : poor ? 'poor' : good ? 'good' : 'normal';
}

function recentSafety(state: AppState, today: string, context?: CoachContextSignals): CoachStateSignals['safety'] {
 if (context?.pain) return 'pain';
 if (context?.recentIllness) return 'recent_illness';
 if (context?.discomfort) return 'discomfort';
 const cutoff = addDaysLocal(today, -7);
 if (state.journal.some((entry) => entry.date >= cutoff && entry.date <= today && entry.tags.includes('safety'))) return 'discomfort';
 const feedback = state.workouts.some((workout) => workout.scheduledDate >= cutoff && workout.scheduledDate <= today
  && Object.values(workout.guidedSession?.setFeedback || {}).some((item) => item?.pain || item?.discomfort));
 return feedback ? 'discomfort' : undefined;
}

function performanceSignal(state: AppState, exercise?: Exercise): CoachStateSignals['performance'] {
 if (!exercise) return 'insufficient';
 const rows = chronologicalCompleted(state.workouts)
  .flatMap((workout) => workout.exercises.filter((entry) => entry.exerciseId === exercise.id)
   .map((entry) => entry.sets.filter((set) => set.completed && set.type !== 'warmup')
    .reduce((total, set) => total + (Number.isFinite(set.reps) ? set.reps! : 0), 0)))
  .slice(-3);
 if (rows.length < 2 || rows.some((value) => value <= 0)) return 'insufficient';
 if (rows[rows.length - 1] > rows[0]) return 'improving';
 if (rows[rows.length - 1] < rows[0]) return 'declining';
 return 'stable';
}

/** Produces read-only Coach facts from local state; it cannot prescribe or mutate. */
export function coachEvidenceFromState(state: AppState, today: string, exercise?: Exercise): {
 context?: CoachContextSignals;
 plateaus: PlateauSignal[];
 signals: CoachStateSignals;
}{
 const checkIn = latestRecoveryCheckIn(state.recoveryLog, today);
 const context: CoachContextSignals | undefined = checkIn
  ? {sleepHours: checkIn.sleepHours, sleepQuality: checkIn.sleepQuality, soreness: checkIn.soreness,
    fatigue: checkIn.fatigue, stress: checkIn.stress, readiness: checkIn.readiness,
    recentIllness: checkIn.recentIllness, pain: checkIn.pain, discomfort: checkIn.discomfort}
  : undefined;
 const safety = recentSafety(state, today, context);
 const effectiveContext = context || (safety ? {pain: safety === 'pain', discomfort: safety === 'discomfort'} : undefined);
 if (effectiveContext && safety === 'pain') effectiveContext.pain = true;
 if (effectiveContext && safety === 'discomfort') effectiveContext.discomfort = true;
 const cutoff = addDaysLocal(today, -21);
 const gap = exercise ? trainingGapDays(exercise, state.workouts, today) : undefined;
 return {
  context: effectiveContext,
  plateaus: plateauCandidates(state),
  signals: {
   recovery: recoveryState(context), recoveryDate: checkIn?.date, safety,
   workload: workloadFatigue(state.workouts, state.exercises),
   consistency30: consistencySummary(state, 30).completed,
   missedSessions21: state.workouts.filter((workout) => workout.status === 'missed' && workout.scheduledDate >= cutoff && workout.scheduledDate <= today).length,
   returnToTrainingDays: gap !== undefined && gap >= 14 ? gap : undefined,
   performance: performanceSignal(state, exercise),
  },
 };
}
