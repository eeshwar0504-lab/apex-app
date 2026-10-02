/**
 * Rolling workout generation.
 *
 * The plan is a 7-day template (`Plan.days`, dayIndex 0..6) that repeats from the day the plan was created. This module
 * keeps a window of FUTURE scheduled workouts filled from that template. It is pure: the same state, the same local
 * `today` and the same `now` always produce the same workouts, with the same ids, and nothing is random.
 *
 * Rules (also in docs/TRAINING_SEMANTICS.md):
 *  - HORIZON. Every calendar day from `today` through `today + horizon - 1` that the template marks as a training day
 *    gets a scheduled workout. The default horizon is 7 days, which is exactly what onboarding always produced, so a
 *    new plan starts with the same week as before. `preferences.horizonDays` (7..28) can change it; there is no UI.
 *  - SLOT. A slot is a template training day on a calendar date. A slot is FILLED when any scheduled-source workout
 *    exists on that date, in any status: planned, in progress, completed, skipped (including an abandoned empty
 *    session), missed, rescheduled (the original keeps the date it was moved from), or a rescheduled replacement.
 *    Only unfilled slots are generated, so nothing is ever duplicated and a skipped or moved session is not regenerated.
 *  - REMOVED. A future workout that no longer exists leaves its slot unfilled, and the next run regenerates it.
 *  - PAST. Dates before `today` are never generated. After a long gap the old planned sessions are marked missed (the
 *    existing markMissedWorkouts rule) and generation resumes from today.
 *  - HISTORY. Existing workouts are never rewritten, apart from the planned-to-missed status change above. Extra and
 *    custom workouts neither fill nor change a slot.
 *  - PRESCRIPTION. Exercises come from the plan's selection (`Plan.exerciseSets`) filtered by the one equipment rule,
 *    sets and reps come from the programmed catalogue, and once any history exists the loads, rest and rep targets come
 *    from applyWorkoutAdaptation, which uses personalizedLoad as of the workout's date (so progression and the
 *    return-to-training rule apply, as they do when a workout is completed). No new progression or recovery rule lives here.
 */
import type { AppState, Exercise, Plan, PlanDay, UserProfile, Workout } from '../core/types';
import { addDaysLocal, dayNumber, dayOfTimestamp } from '../data/dates';
import { exerciseFitsEquipment } from './exerciseGraph';
import { applyWorkoutAdaptation, buildPlan, createWorkout, markMissedWorkouts } from './training';

export const DEFAULT_HORIZON_DAYS = 7;
export const MIN_HORIZON_DAYS = 7;
export const MAX_HORIZON_DAYS = 28;
const CYCLE_DAYS = 7;
const MAX_EXERCISES_PER_WORKOUT = 7;

export type RollingInput = Pick<AppState, 'workouts' | 'exercises'> &
  Partial<Pick<AppState, 'profile' | 'plan' | 'goals' | 'preferences' | 'eventLog' | 'onboardingComplete' | 'deloads'>>;

export interface RollingOptions {
  /** The user's local calendar day, YYYY-MM-DD. */
  today: string;
  /** The current instant (ISO). Used only for timestamps, so a fixed value gives a fixed result. */
  now: string;
  /** Overrides the stored preference. */
  horizonDays?: number;
}

export interface Slot {
  date: string;
  day: PlanDay;
}

/** The horizon in days: a whole number from 7 to 28, else the default. */
export function horizonDays(input: Pick<RollingInput, 'preferences'>, override?: number): number {
  const raw = override ?? (input.preferences as { horizonDays?: unknown } | undefined)?.horizonDays;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return DEFAULT_HORIZON_DAYS;
  return Math.min(MAX_HORIZON_DAYS, Math.max(MIN_HORIZON_DAYS, raw));
}

/** The calendar day the plan's template starts from (the day onboarding created it). */
export function planAnchor(plan: Pick<Plan, 'createdAt'>): string | undefined {
  return dayOfTimestamp(plan.createdAt);
}

/** The template day that falls on `date`, or undefined for a rest day. */
export function templateDayFor(plan: Pick<Plan, 'createdAt' | 'days'>, date: string): PlanDay | undefined {
  const anchor = planAnchor(plan);
  const a = dayNumber(anchor);
  const d = dayNumber(date);
  if (a === undefined || d === undefined) return undefined;
  const cycleDay = (((d - a) % CYCLE_DAYS) + CYCLE_DAYS) % CYCLE_DAYS;
  const day = plan.days.find(item => item.dayIndex === cycleDay);
  return day && !day.rest ? day : undefined;
}

const isScheduled = (w: Workout) => w.source === 'scheduled';

/** The template training slots in the horizon that have no scheduled workout yet, earliest first. */
export function missingSlots(input: RollingInput, options: RollingOptions): Slot[] {
  const plan = input.plan;
  if (!plan || !Array.isArray(plan.days) || dayNumber(options.today) === undefined) return [];
  const horizon = horizonDays(input, options.horizonDays);
  const filled = new Set(input.workouts.filter(isScheduled).map(w => w.scheduledDate));
  const slots: Slot[] = [];
  for (let offset = 0; offset < horizon; offset++) {
    const date = addDaysLocal(options.today, offset);
    if (filled.has(date)) continue;
    const day = templateDayFor(plan, date);
    if (day) slots.push({ date, day });
  }
  return slots;
}

const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The exercise ids for a template day: the plan's selection, filtered by the one equipment rule. */
function exerciseIdsFor(plan: Plan, label: string, profile: UserProfile, exercises: Exercise[], goals: unknown[]): string[] {
  const sets = plan.exerciseSets ?? buildPlan(profile, exercises, goals as any[]).exerciseSets;
  const key = label.includes('UPPER') ? 'upper' : label.includes('LOWER') ? 'lower' : 'full';
  const usable = (ids: string[]) =>
    ids.filter(id => {
      const ex = exercises.find(e => e.id === id);
      return ex !== undefined && exerciseFitsEquipment(ex, profile.equipment ?? []);
    });
  return usable(sets[key] ?? []).slice(0, MAX_EXERCISES_PER_WORKOUT);
}

/** One workout for one slot, with ids that depend only on the plan, the date and the position. */
function buildWorkout(slot: Slot, plan: Plan, profile: UserProfile, input: RollingInput, history: Workout[], now: string): Workout | undefined {
  const ids = exerciseIdsFor(plan, slot.day.label, profile, input.exercises, input.goals ?? []);
  if (!ids.length) return undefined; // a training day is never empty
  const base = createWorkout(slot.day.label, slot.date, ids, input.exercises, plan.id, 'scheduled', 1);
  const workoutId = `wk-${plan.id}-${slot.date}-${slug(slot.day.label)}`;
  let workout: Workout = {
    ...base,
    id: workoutId,
    originalPlanVersion: plan.version,
    currentPlanVersion: plan.version,
    updatedAt: now,
    exercises: base.exercises.map((entry, e) => ({
      ...entry,
      sets: entry.sets.map((set, s) => ({ ...set, id: `${workoutId}-e${e}-s${s}` })),
    })),
  };
  if (history.length) {
    workout = applyWorkoutAdaptation(workout, input.exercises, history, profile, input.deloads);
    workout.updatedAt = now;
  }
  return workout;
}

/** Only the workouts that are missing from the horizon. Nothing existing is read for writing or returned. */
export function generateRollingWorkouts(input: RollingInput, options: RollingOptions): Workout[] {
  const { plan, profile } = input;
  if (!plan || !profile) return [];
  const slots = missingSlots(input, options);
  if (!slots.length) return [];
  const history = input.workouts.filter(w => w.status === 'completed');
  return slots.flatMap(slot => {
    const workout = buildWorkout(slot, plan, profile, input, history, options.now);
    return workout ? [workout] : [];
  });
}

/**
 * The app-lifecycle entry point: marks planned sessions from earlier days as missed (the existing rule), then fills the
 * horizon. Returns the SAME object when there is nothing to do, so calling it again with the same state and day is a no-op.
 */
export function maintainTrainingHorizon<T extends RollingInput>(state: T, options: RollingOptions): T {
  if (state.onboardingComplete === false || !state.plan || !state.profile) return state;

  let workouts = state.workouts;
  if (workouts.some(w => w.status === 'planned' && w.scheduledDate < options.today)) {
    workouts = markMissedWorkouts(workouts, options.today).map((w, i) => (w !== state.workouts[i] ? { ...w, updatedAt: options.now } : w));
  }

  const generated = generateRollingWorkouts({ ...state, workouts }, options);
  if (workouts === state.workouts && !generated.length) return state;

  const next: T = { ...state, workouts: [...workouts, ...generated] };
  if (generated.length) {
    next.eventLog = [
      ...(state.eventLog ?? []),
      {
        id: `evt-generated-${options.now}`,
        type: 'workouts_generated',
        timestamp: options.now,
        payload: { dates: generated.map(w => w.scheduledDate), horizonDays: horizonDays(state, options.horizonDays) },
      },
    ];
  }
  return next;
}
