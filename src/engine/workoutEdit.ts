import type {Exercise, Workout, WorkoutExercise} from '../core/types';
import {dayNumber} from '../data/dates';
import {equipmentFit, makeSet} from './training';

/**
 * Library actions and plan edits share one rule for changing a future workout: only a workout that has not started can
 * be edited, only with an exercise the athlete can do, and the edit adds a new, empty exercise entry. Completed,
 * missed, skipped and started workouts are history and are never touched.
 */
export const EDITABLE_STATUSES: readonly Workout['status'][] = ['planned', 'rescheduled'];
export const NEW_EXERCISE_SETS = 2;

/** A workout that has not started: planned or rescheduled, no set logged, no guided session open. */
export function isEditableWorkout(workout: Workout): boolean {
  if (!EDITABLE_STATUSES.includes(workout.status)) return false;
  if (workout.completedAt || workout.startedAt) return false;
  if (workout.guidedSession && workout.guidedSession.phase !== 'prep') return false;
  return !workout.exercises.some(entry => entry.sets.some(set => set.completed));
}

/** The soonest editable workout scheduled for `today` or later (ties: stored order). */
export function nextEditableWorkout(workouts: readonly Workout[], today: string): Workout | undefined {
  const todayNumber = dayNumber(today);
  if (todayNumber === undefined) return undefined;
  return workouts
    .map((workout, index) => ({workout, index, day: dayNumber(workout.scheduledDate)}))
    .filter(item => item.day !== undefined && item.day >= todayNumber && isEditableWorkout(item.workout))
    .sort((a, b) => (a.day as number) - (b.day as number) || a.index - b.index)[0]?.workout;
}

export type AddExerciseResult =
  | {ok: true; workout: Workout}
  | {ok: false; reason: 'not-editable' | 'already-in-workout' | 'equipment-unavailable'; message: string};

/**
 * Adds `ex` (already programmed for the athlete's goal) to a workout as a new entry with two empty working sets. Load
 * and rest are filled by the normal preparation of the workout, exactly as for every other exercise.
 */
export function addExerciseToWorkout(
  workout: Workout,
  ex: Exercise,
  options: {equipment?: readonly string[]; now: string; allowDuplicate?: boolean}
): AddExerciseResult {
  if (!isEditableWorkout(workout)) return {ok: false, reason: 'not-editable', message: 'That workout has already started or finished, so it cannot be changed.'};
  if (!options.allowDuplicate && workout.exercises.some(entry => entry.exerciseId === ex.id)) {
    return {ok: false, reason: 'already-in-workout', message: `${ex.name} is already in ${workout.name}.`};
  }
  if (options.equipment && equipmentFit(ex, [...options.equipment]) === 'unavailable') {
    return {ok: false, reason: 'equipment-unavailable', message: `${ex.name} needs equipment that is not in your setup. Update your equipment in your profile first.`};
  }
  const entry: WorkoutExercise = {
    exerciseId: ex.id,
    sets: Array.from({length: NEW_EXERCISE_SETS}, () => makeSet('working', ex)),
    prescribedSets: NEW_EXERCISE_SETS,
    repRange: ex.repRange,
    restSec: ex.restSec,
    order: workout.exercises.length
  };
  return {ok: true, workout: {...workout, version: workout.version + 1, updatedAt: options.now, exercises: [...workout.exercises, entry]}};
}
