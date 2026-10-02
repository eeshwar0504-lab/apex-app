/**
 * The structured context behind Ask Coach 2.0 (Phase 16).
 *
 * One pure builder gathers everything an answer may use, from local state only: today's session and exercise with the engine's own
 * prescription, recent sessions, the week (Phase 14), the exercise's history and longitudinal decision (Phase 11), fatigue and
 * deload (Phase 12), goals, a small profile subset and the exercise knowledge graph. It is read only and deterministic, and it is
 * the only thing the answer layer (and, through grounding, the optional AI) draws on. It deliberately omits identity, notes,
 * journal text and recovery check-in values.
 */
import type { AppState, Exercise, Workout } from '../core/types';
import { workoutDay } from '../data/dates';
import { exerciseGraph } from '../engine/exerciseGraph';
import { recoveryStatus } from '../engine/deload';
import { chronologicalCompleted, isWorkingSet, personalizedLoad } from '../engine/training';
import type { FatigueAssessment } from '../engine/fatigue';
import type { LoadRecommendation } from '../engine/training';
import { exerciseTrend, weeklyAnalytics } from '../engine/weeklyAnalytics';
import type { WeeklyAnalytics } from '../engine/weeklyAnalytics';
import { coachBriefing, todaysExerciseDecisions } from './briefing';
import type { CoachBriefing, ExerciseDecision } from './briefing';

export interface AskExerciseContext {
  exercise: Exercise;
  recommendation: LoadRecommendation;
  /** Newest last: the last few training days of this exercise with how each compared with the one before. */
  history: { date: string; load?: number; topPerformance: number; kind: string }[];
  knowledge: { pattern: string; primaryMuscles: string[]; secondaryMuscles: string[]; alternatives: string[]; harder: string[]; easier: string[] };
}

export interface AskCoachContext {
  today: string;
  workout?: { id: string; name: string; status: string; date: string; exercises: ExerciseDecision[] };
  exercise?: AskExerciseContext;
  recent: { date: string; name: string; workingSets: number }[];
  weekly?: WeeklyAnalytics;
  recovery?: FatigueAssessment;
  briefing?: CoachBriefing;
  goals: { title: string; kind: string }[];
  profile: { experience?: string; primaryGoal?: string; trainingDays?: number };
  preferences: { units?: string; aiMode?: string };
  completedSessions: number;
}

function exerciseContext(state: AppState, ex: Exercise, today: string): AskExerciseContext {
  const recommendation = personalizedLoad(ex, state.workouts, state.profile, state.exercises, today, state.deloads);
  const graph = exerciseGraph(state.exercises);
  return {
    exercise: ex,
    recommendation,
    history: exerciseTrend(state, ex),
    knowledge: {
      pattern: ex.pattern, primaryMuscles: [...ex.primaryMuscles], secondaryMuscles: [...ex.secondaryMuscles],
      alternatives: graph.alternativesOf(ex.id).map(e => e.name), harder: graph.progressionsOf(ex.id).map(e => e.name), easier: graph.regressionsOf(ex.id).map(e => e.name),
    },
  };
}

/** `workout` and `exercise` are what the screen is showing, when anything is. */
export function buildAskCoachContext(state: AppState, today: string, focus: { workout?: Workout; exercise?: Exercise } = {}): AskCoachContext {
  const workout = focus.workout
    || state.workouts.find(w => w.id === state.activeWorkoutId)
    || state.workouts.find(w => w.status === 'in_progress')
    || state.workouts.find(w => w.scheduledDate === today && w.status === 'planned')
    || state.workouts.find(w => w.status === 'planned');
  const first = workout?.exercises[0] && state.exercises.find(e => e.id === workout.exercises[0].exerciseId);
  const exercise = focus.exercise || first || undefined;
  const briefing = coachBriefing(state, today);
  return {
    today,
    ...(workout ? { workout: { id: workout.id, name: workout.name, status: workout.status, date: workout.scheduledDate, exercises: todaysExerciseDecisions(state, today, workout) } } : {}),
    ...(exercise ? { exercise: exerciseContext(state, exercise, today) } : {}),
    recent: chronologicalCompleted(state.workouts).slice(-3).map(w => ({ date: workoutDay(w), name: w.name, workingSets: w.exercises.reduce((n, e) => n + e.sets.filter(isWorkingSet).length, 0) })),
    weekly: weeklyAnalytics(state, today),
    recovery: recoveryStatus(state, today),
    ...(briefing ? { briefing } : {}),
    goals: state.goals.filter(g => g.status === 'active').map(g => ({ title: g.title, kind: g.kind })),
    profile: { experience: state.profile?.experience, primaryGoal: state.profile?.primaryGoal, trainingDays: state.profile?.trainingDays },
    preferences: { units: state.preferences.units, aiMode: state.preferences.aiMode },
    completedSessions: chronologicalCompleted(state.workouts).length,
  };
}
