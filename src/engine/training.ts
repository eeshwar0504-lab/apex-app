import { dayNumber, dayOfTimestamp, workoutDay } from '../data/dates';
import { goalTargetRir, programExercise } from './goalProgram';
import { MAX_PLAUSIBLE_LOAD_KG, MAX_PLAUSIBLE_REPS, MAX_PLAUSIBLE_SECONDS } from './limits';
import type {
  Exercise,
  GoalKind,
  SetLog,
  SetType,
  UserProfile,
  Workout,
  WorkoutExercise,
  PlanDay,
  Plan,
  LoadDetail
} from '../core/types';

export type ProgressionAction =
  | 'calibrate'
  | 'increase'
  | 'hold'
  | 'reduce'
  | 'recover';

export interface ProgressionResult {
  action: ProgressionAction;
  weight?: number;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
  nextRepRange: [number, number];
  recommendedRest: number;
}

export interface LoadRecommendation {
  weight?: number;
  confidence: 'low' | 'medium' | 'high';
  kind: 'baseline' | 'comparable_estimate' | 'calibration';
  reason: string;
  evidence: string[];
  targetRir: number;
  /** Present when the load was set by the return-to-training rule (see docs/RETURN_TO_TRAINING.md). */
  returnToTraining?: { gapDays: number; tier: string; steps: number };
  /** The progression decision this load came from (exact-history tier only). */
  action?: ProgressionAction;
  /** Rest recommended by that decision, in seconds (exact-history tier only). */
  recommendedRest?: number;
}

export interface LoadAvailability {
  available: boolean;
  options: number[];
  incrementKg?: number;
  source: 'exercise' | 'equipment' | 'none';
  reason: string;
}

export interface SafetyResult {
  allowed: boolean;
  severity: 'none' | 'caution' | 'block';
  reasons: string[];
  adjustedWeight?: number;
  adjustedSets?: number;
}

export interface PerformanceSummary {
  completedSets: number;
  reps: number;
  load: number;
  volume: number;
  topLoad?: number;
  bestReps?: number;
  avgRir?: number;
}

export interface ExerciseComparison {
  exercise: Exercise;
  score: number;
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
}

const roundTo = (n: number, step: number) =>
  step > 0
    ? Math.round(n / step) * step
    : Math.round(n * 10) / 10;

export const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/* ============================================================
   LOAD / EXERCISE SEMANTICS
   ============================================================ */

export function loadUnit(ex: Exercise) {
  switch (ex.loadSemantics) {
    case 'per_hand':
      return 'kg / hand';
    case 'assistance':
      return 'kg assistance';
    case 'stack':
      return ex.equipment.includes('cable') && !ex.equipment.includes('machine')
        ? 'cable stack kg'
        : 'machine stack kg';
    case 'time':
      return 'seconds';
    case 'bodyweight':
      return 'bodyweight';
    case 'none':
      return '—';
    default:
      return 'kg total';
  }
}

/**
 * Builds explicit load semantics for a recorded set.
 * The canonical `weight` value is preserved so existing progression/history
 * remains compatible.
 */
export function loadDetailForSet(
  ex: Exercise,
  value?: number,
  existing?: LoadDetail
): LoadDetail {
  if (ex.loadSemantics === 'per_hand') {
    const perHand = value ?? existing?.perHandKg;
    const total =
      existing?.totalKg ??
      dumbbellTotalLoad(ex, perHand);

    return {
      kind: 'dumbbell',
      perHandKg: perHand,
      totalKg: total
    };
  }

  if (ex.loadSemantics === 'stack') {
    const stack = value ?? existing?.stackKg;

    return {
      kind:
        ex.equipment.includes('cable') &&
        !ex.equipment.includes('machine')
          ? 'cable_stack'
          : 'machine_stack',
      stackKg: stack,
      totalKg: stack
    };
  }

  if (ex.loadSemantics === 'assistance') {
    const assistance =
      value ??
      existing?.assistanceKg ??
      0;

    return {
      kind: 'assistance',
      assistanceKg: assistance
    };
  }

  if (ex.loadSemantics === 'bodyweight') {
    return {kind:'bodyweight'};
  }

  if (ex.loadSemantics === 'time') {
    return {kind:'timed'};
  }

  if (ex.loadSemantics === 'none') {
    return {kind:'none'};
  }

  const total =
    value ??
    existing?.totalKg;

  const barWeightKg =
    existing?.barWeightKg;

  const breakdown =
    ex.equipment.includes('barbell')
      ? barbellLoadBreakdown(
          total,
          barWeightKg
        )
      : {
          totalKg: total,
          barWeightKg: undefined,
          plateLoadKg: undefined
        };

  return {
    kind:
      ex.equipment.includes('barbell')
        ? 'barbell'
        : 'none',
    totalKg: breakdown.totalKg,
    barWeightKg: breakdown.barWeightKg,
    plateLoadKg: breakdown.plateLoadKg
  };
}

/**
 * Formats a load without ever displaying meaningless "0 kg" for bodyweight
 * or timed movements.
 */

/**
 * Returns the total external load represented by a per-hand dumbbell value.
 *
 * Bilateral dumbbell work uses both hands; unilateral work counts the active
 * hand only. The stored canonical weight remains the per-hand value.
 */
export function dumbbellTotalLoad(
  ex: Exercise,
  perHandKg: number | undefined
): number | undefined {
  if (
    ex.loadSemantics !== 'per_hand' ||
    perHandKg === undefined ||
    !Number.isFinite(perHandKg)
  ) {
    return undefined;
  }

  return perHandKg * (ex.unilateral ? 1 : 2);
}

/**
 * Builds a barbell load breakdown without assuming a universal bar weight.
 *
 * If barWeightKg is not explicitly known, APEX records total load only.
 * Plates are derived from total - bar only when both values are meaningful.
 */
export function barbellLoadBreakdown(
  totalKg: number | undefined,
  barWeightKg?: number
) {
  if (
    totalKg === undefined ||
    !Number.isFinite(totalKg) ||
    totalKg <= 0
  ) {
    return {
      totalKg: undefined,
      barWeightKg,
      plateLoadKg: undefined
    };
  }

  const plateLoadKg =
    barWeightKg !== undefined &&
    Number.isFinite(barWeightKg) &&
    barWeightKg >= 0 &&
    totalKg >= barWeightKg
      ? totalKg - barWeightKg
      : undefined;

  return {
    totalKg,
    barWeightKg,
    plateLoadKg
  };
}

export function formatLoad(ex: Exercise, value?: number) {
  if (ex.loadSemantics === 'bodyweight') return 'Bodyweight';
  if (ex.loadSemantics === 'none') return 'No external load';
  if (ex.loadSemantics === 'time') {
    return `${ex.repRange[0]}–${ex.repRange[1]} sec`;
  }

  if (value == null) {
    return ex.loadSemantics === 'assistance'
      ? 'Enter assistance'
      : 'Not calibrated';
  }

  if (ex.loadSemantics === 'assistance') {
    return `${value} kg assistance`;
  }

  if (ex.loadSemantics === 'per_hand') {
    return `${value} kg each hand`;
  }

  if (ex.loadSemantics === 'stack') {
    return `${value} kg stack`;
  }

  if (ex.equipment.includes('barbell')) {
    return `${value} kg total`;
  }

  return `${value} kg total`;
}

/**
 * Human-readable breakdown for workout controls/history.
 *
 * Examples:
 * - "10 kg each hand · 20 kg total"
 * - "60 kg total · 20 kg bar + 40 kg plates"
 * - "50 kg stack"
 */
export function formatLoadDetail(
  ex: Exercise,
  value?: number,
  detail?: LoadDetail
) {
  if (ex.loadSemantics === 'bodyweight') return 'Bodyweight';
  if (ex.loadSemantics === 'none') return 'No external load';
  if (ex.loadSemantics === 'time') return `${ex.repRange[0]}–${ex.repRange[1]} sec`;
  if (value === undefined && !detail) return formatLoad(ex, value);

  if (ex.loadSemantics === 'per_hand') {
    const perHand = value ?? detail?.perHandKg;
    if (perHand === undefined) return 'Enter load per hand';
    const total =
      detail?.totalKg ??
      dumbbellTotalLoad(ex, perHand);
    return total === undefined
      ? `${perHand} kg each hand`
      : `${perHand} kg each hand · ${total} kg total`;
  }

  if (ex.loadSemantics === 'stack') {
    const stack = value ?? detail?.stackKg;
    return stack === undefined ? 'Enter stack load' : `${stack} kg stack`;
  }

  if (ex.equipment.includes('barbell')) {
    const total = value ?? detail?.totalKg;
    if (total === undefined) return 'Enter total load';
    const bar = detail?.barWeightKg;
    const plates = detail?.plateLoadKg;
    if (bar !== undefined && plates !== undefined) {
      return `${total} kg total · ${bar} kg bar + ${plates} kg plates`;
    }
    if (bar !== undefined) {
      return `${total} kg total · ${bar} kg bar + plates`;
    }
    return `${total} kg total · bar + plates`;
  }

  return formatLoad(ex, value);
}

/**
 * Timed prescription is deliberately separate from external load.
 */
export function timedPrescription(ex: Exercise) {
  if (ex.loadSemantics !== 'time') return undefined;
  return {
    minSec: ex.repRange[0],
    maxSec: ex.repRange[1],
    unit: 'seconds' as const
  };
}

/**
 * Determines whether a recorded load is meaningful for the
 * exercise's load semantics.
 *
 * Bodyweight / none / time do not require an external numeric load.
 *
 * Normal externally loaded exercises require a positive finite load.
 *
 * Assistance can legitimately be zero because zero assistance is
 * meaningful: the user is performing the movement without assistance.
 */

/**
 * Formats the prescribed work duration for timed exercises.
 * Work duration is independent from the exercise's rest timer.
 */
export function formatTimedDuration(
  seconds: number | undefined
): string {
  if (
    seconds === undefined ||
    !Number.isFinite(seconds)
  ) {
    return '—';
  }

  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;

  if (minutes === 0) {
    return `${remaining} sec`;
  }

  return `${minutes}:${String(remaining).padStart(2,'0')}`;
}

export function meaningfulLoad(
  ex: Exercise,
  value: number | undefined
): boolean {
  if (
    ex.loadSemantics === 'bodyweight' ||
    ex.loadSemantics === 'none' ||
    ex.loadSemantics === 'time'
  ) {
    return true;
  }

  if (value === undefined || !Number.isFinite(value)) {
    return false;
  }

  if (ex.loadSemantics === 'assistance') {
    return value >= 0;
  }

  return value > 0;
}

/**
 * Validates a load recommendation according to exercise semantics.
 */
export function validateLoadRecommendation(
  ex: Exercise,
  weight: number | undefined
): boolean {
  if (weight === undefined || !Number.isFinite(weight)) {
    return false;
  }

  if (
    ex.loadSemantics === 'bodyweight' ||
    ex.loadSemantics === 'none' ||
    ex.loadSemantics === 'time'
  ) {
    return true;
  }

  if (ex.loadSemantics === 'assistance') {
    return weight >= 0;
  }

  return weight > 0;
}

/**
 * Sanitizes a calculated recommendation.
 *
 * Normal loaded exercises can NEVER resolve to zero.
 */
export function sanitizeRecommendedLoad(
  ex: Exercise,
  weight: number | undefined
): number | undefined {
  if (weight === undefined || !Number.isFinite(weight)) {
    return undefined;
  }

  if (
    ex.loadSemantics === 'bodyweight' ||
    ex.loadSemantics === 'none'
  ) {
    return 0;
  }

  if (ex.loadSemantics === 'time') {
    return Math.max(0, Math.round(weight));
  }

  if (ex.loadSemantics === 'assistance') {
    const step = ex.incrementKg > 0 ? ex.incrementKg : 1;
    return Math.max(0, roundTo(weight, step));
  }

  const step = ex.incrementKg > 0 ? ex.incrementKg : 0.5;
  if (weight <= 0) return undefined;
  const rounded = roundTo(weight, step);
  return Math.max(step, rounded > 0 ? rounded : step);
}

/**
 * Return the real load choices available to the user for this exercise.
 * Equipment presence and load availability are deliberately separate.
 */
export function loadAvailability(
  ex: Exercise,
  profile?: UserProfile
): LoadAvailability {
  if (
    ex.loadSemantics === 'bodyweight' ||
    ex.loadSemantics === 'none' ||
    ex.loadSemantics === 'time'
  ) {
    return {
      available: true,
      options: [],
      source: 'none',
      reason: 'This exercise does not require an external load selection.'
    };
  }

  const configured = profile?.loadIncrementsKg;
  const keys = [ex.id, ...ex.equipment];
  const raw = keys.flatMap(key => {
    const list = configured?.[key] as unknown;
    return Array.isArray(list) ? list : [];
  });
  const options = [...new Set(
    raw
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .map(value => roundTo(value, 0.1))
      // validate AFTER rounding: 0.0001 rounds to 0, which is not a load
      .filter(value => value > 0 && value <= MAX_PLAUSIBLE_LOAD_KG)
  )].sort((a,b) => a-b);

  if (options.length) {
    return {
      available: true,
      options,
      incrementKg: options.length > 1 ? Math.min(...options.slice(1).map((v,i) => v-options[i]).filter(v => v>0)) : ex.incrementKg || undefined,
      source: configured?.[ex.id] ? 'exercise' : 'equipment',
      reason: 'Using the load options you configured for this equipment/exercise.'
    };
  }

  if (ex.incrementKg > 0) {
    return {
      available: true,
      options: [],
      incrementKg: ex.incrementKg,
      source: 'exercise',
      reason: `No custom load list is configured. The exercise's ${ex.incrementKg} kg minimum increment is used for calibration and progression.`
    };
  }

  return {
    available: false,
    options: [],
    source: 'none',
    reason: 'No defensible load increment is recorded. APEX will ask for an explicit calibration load rather than inventing one.'
  };
}

/** Snap a load to a real configured option when one exists. */
export function snapToAvailableLoad(
  ex: Exercise,
  weight: number | undefined,
  profile?: UserProfile,
  direction: 'nearest' | 'up' | 'down' = 'nearest'
): number | undefined {
  const availability = loadAvailability(ex, profile);
  const options = availability.options;

  /*
   * With a configured load list the target is snapped exactly as given. It is NOT first rounded to the exercise
   * increment: that would throw away information (a logged 21 kg would become 20 kg and then tie between two
   * options). Without a list the value is rounded to the exercise increment as before.
   */
  const clean = options.length
    ? (typeof weight === 'number' && Number.isFinite(weight) && (weight > 0 || (ex.loadSemantics === 'assistance' && weight >= 0)) ? weight : undefined)
    : sanitizeRecommendedLoad(ex, weight);
  if (clean === undefined) return undefined;
  if (!options.length) return clean;

  if (direction === 'up') return options.find(value => value >= clean) ?? options.at(-1);
  if (direction === 'down') return [...options].reverse().find(value => value <= clean) ?? options[0];

  return options.reduce((best,value) =>
    Math.abs(value-clean) < Math.abs(best-clean) ? value : best,
    options[0]
  );
}

/** Return the next real selectable load above/below the current one. */
export function adjacentAvailableLoad(
  ex: Exercise,
  current: number | undefined,
  profile: UserProfile | undefined,
  direction: 'up' | 'down'
): number | undefined {
  const availability = loadAvailability(ex, profile);
  if (availability.options.length) {
    const base = current === undefined
      ? (direction === 'up' ? availability.options[0] : availability.options.at(-1))
      : snapToAvailableLoad(ex, current, profile);
    if (base === undefined) return undefined;
    const index = availability.options.indexOf(base);
    if (index < 0) return base;
    const nextIndex = direction === 'up' ? index + 1 : index - 1;
    return availability.options[nextIndex];
  }

  const step = availability.incrementKg || ex.incrementKg;
  if (!step || current === undefined) return undefined;
  return sanitizeRecommendedLoad(ex, current + (direction === 'up' ? step : -step));
}

/* ============================================================
   EXERCISE COMPARABILITY
   ============================================================ */

/**
 * Returns a graded similarity score instead of a simple
 * comparable / not-comparable decision.
 *
 * This prevents APEX from blindly transferring load between
 * unrelated exercises.
 */
export function comparisonScore(
  a: Exercise,
  b: Exercise
): number {
  if (a.id === b.id) {
    return 1;
  }

  let score = 0;

  if (a.family === b.family) {
    score += 0.30;
  }

  if (a.pattern === b.pattern) {
    score += 0.25;
  }

  const primaryOverlap = a.primaryMuscles.filter(
    muscle => b.primaryMuscles.includes(muscle)
  ).length;

  if (primaryOverlap > 0) {
    score += Math.min(
      0.20,
      primaryOverlap * 0.08
    );
  }

  const secondaryOverlap = a.secondaryMuscles.filter(
    muscle => b.secondaryMuscles.includes(muscle)
  ).length;

  if (secondaryOverlap > 0) {
    score += Math.min(
      0.08,
      secondaryOverlap * 0.04
    );
  }

  if (a.loadSemantics === b.loadSemantics) {
    score += 0.10;
  }

  if (a.unilateral === b.unilateral) {
    score += 0.04;
  }

  const equipmentOverlap = a.equipment.filter(
    equipment => b.equipment.includes(equipment)
  ).length;

  if (equipmentOverlap > 0) {
    score += Math.min(
      0.03,
      equipmentOverlap * 0.015
    );
  }

  return Math.min(1, score);
}

/**
 * Backwards-compatible boolean helper.
 */
export function comparable(
  a: Exercise,
  b: Exercise
): boolean {
  return comparisonScore(a, b) >= 0.50;
}

/**
 * Ranks exercises that could provide useful comparative evidence.
 */
export function rankComparableExercises(
  target: Exercise,
  exercises: Exercise[],
  availableIds?: Set<string>
): ExerciseComparison[] {
  return exercises
    .filter(ex => ex.id !== target.id)
    .map(ex => {
      const score = comparisonScore(target, ex);

      const reasons: string[] = [];

      if (target.family === ex.family) {
        reasons.push('same exercise family');
      }

      if (target.pattern === ex.pattern) {
        reasons.push('same movement pattern');
      }

      const primaryOverlap =
        target.primaryMuscles.filter(
          muscle => ex.primaryMuscles.includes(muscle)
        );

      if (primaryOverlap.length) {
        reasons.push(
          `shared primary muscle: ${primaryOverlap
            .slice(0, 2)
            .join(', ')}`
        );
      }

      if (target.loadSemantics === ex.loadSemantics) {
        reasons.push('same load semantics');
      }

      if (target.unilateral === ex.unilateral) {
        reasons.push('same unilateral/bilateral structure');
      }

      if (availableIds?.has(ex.id)) {
        reasons.push('available in current exercise set');
      }

      const confidence: ExerciseComparison['confidence'] =
        score >= 0.70
          ? 'high'
          : score >= 0.50
            ? 'medium'
            : 'low';

      return {
        exercise: ex,
        score,
        confidence,
        reasons
      };
    })
    .filter(item => item.score >= 0.30)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.exercise.name.localeCompare(
        b.exercise.name
      );
    });
}

/* ============================================================
   PERFORMANCE HELPERS
   ============================================================ */

/* ---- authoritative set semantics (see docs/TRAINING_SEMANTICS.md) ----
 *
 *  external weight  (total / stack / per_hand): kg moved, stored in SetLog.weight.
 *  assistance       (assisted movements):       kg of counter-weight REMOVED from bodyweight, stored ONLY in
 *                                               SetLog.assistance. Lower assistance = harder = progress.
 *  effective resistance = bodyweight - assistance. APEX does not assume a body weight, so it never computes it:
 *                                               assisted sets carry no volume (like bodyweight movements) and
 *                                               their "best" load is the LOWEST assistance.
 *  warm-up sets are logged but are not training evidence: they never count for progression, volume, PRs,
 *  load history, plateau signals or whether a session "logged sets".
 */

/** A set that counts as training work: completed and not a warm-up. */
export function isWorkingSet(set: SetLog): boolean {
  return set.completed === true && set.type !== 'warmup';
}

/**
 * The ONE place the load of a set is read. Assisted movements read SetLog.assistance (older saved data that
 * stored assistance in weight is still understood); everything else reads SetLog.weight.
 */
export function setLoad(ex: Exercise, set: SetLog): number | undefined {
  const value =
    ex.loadSemantics === 'assistance'
      ? (typeof set.assistance === 'number' && Number.isFinite(set.assistance) ? set.assistance : set.weight)
      : set.weight;
  return typeof value === 'number' && Number.isFinite(value) && value <= MAX_PLAUSIBLE_LOAD_KG ? value : undefined;
}

/** Best load among working sets: the heaviest external load, or the LOWEST assistance. */
export function bestLoad(ex: Exercise, sets: SetLog[]): number | undefined {
  const values = sets
    .filter(isWorkingSet)
    .map(set => setLoad(ex, set))
    .filter((value): value is number => value !== undefined && meaningfulLoad(ex, value));
  if (!values.length) return undefined;
  return ex.loadSemantics === 'assistance' ? Math.min(...values) : Math.max(...values);
}

/** The performance a set must carry to be evidence: duration for timed movements, repetitions otherwise. */
function hasValidPerformance(ex: Exercise, set: SetLog): boolean {
  if (ex.loadSemantics === 'time') {
    return typeof set.seconds === 'number' && Number.isFinite(set.seconds) && set.seconds > 0 && set.seconds <= MAX_PLAUSIBLE_SECONDS;
  }
  return typeof set.reps === 'number' && Number.isFinite(set.reps) && set.reps >= 0 && set.reps <= MAX_PLAUSIBLE_REPS;
}

function completedTime(workout: Workout): number {
  const stamp = Date.parse(workout.completedAt ?? '');
  if (Number.isFinite(stamp)) return stamp;
  const scheduled = Date.parse(`${workout.scheduledDate}T12:00:00Z`);
  return Number.isFinite(scheduled) ? scheduled : 0;
}

/** Completed workouts in chronological order (stable), independent of the order records are stored in. */
export function chronologicalCompleted(workouts: Workout[]): Workout[] {
  return workouts
    .map((workout, index) => ({ workout, index }))
    .filter(item => item.workout.status === 'completed')
    .sort((a, b) => completedTime(a.workout) - completedTime(b.workout) || a.index - b.index)
    .map(item => item.workout);
}

function recentCompleted(
  ex: Exercise,
  sets: SetLog[]
) {
  return sets
    .filter(set => isWorkingSet(set) && hasValidPerformance(ex, set))
    .slice(-6);
}

function averageMeaningfulLoad(
  ex: Exercise,
  sets: SetLog[]
): number | undefined {
  const valid = sets
    .filter(isWorkingSet)
    .map(set => setLoad(ex, set))
    .filter((value): value is number => value !== undefined && meaningfulLoad(ex, value));

  if (!valid.length) {
    return undefined;
  }

  return (
    valid.reduce(
      (sum, value) => sum + value,
      0
    ) / valid.length
  );
}

function latestMeaningfulLoad(
  ex: Exercise,
  sets: SetLog[]
): number | undefined {
  const valid = sets
    .filter(isWorkingSet)
    .map(set => setLoad(ex, set))
    .filter((value): value is number => value !== undefined && meaningfulLoad(ex, value));

  return valid.at(-1);
}

/**
 * Workload-spike fatigue signal: the existing APEX readiness rule (the latest completed session's volume is more
 * than 25% above the previous one). intelligence.readiness() uses this same function.
 */
export function workloadFatigue(workouts: Workout[], exercises: Exercise[]): 'normal' | 'elevated' {
  if (!exercises.length) return 'normal';
  const done = chronologicalCompleted(workouts).slice(-3);
  const last = done.at(-1);
  const previous = done.at(-2);
  if (!last || !previous) return 'normal';
  const previousVolume = volumeForWorkout(previous, exercises);
  return previousVolume > 0 && volumeForWorkout(last, exercises) > previousVolume * 1.25 ? 'elevated' : 'normal';
}

/* ============================================================
   PROGRESSION
   ============================================================ */

/*
 * The single authoritative progression decision. Precedence (first match wins):
 *
 *   1. no usable evidence                         -> calibrate
 *   2. timed movement                             -> hold (duration is tracked, there is no load to change)
 *   3. repeatedly below the rep range             -> reduce   (direct performance evidence beats any context)
 *   4. top of range AND elevated workload context -> recover  (suppresses ONLY an increase; load is held)
 *   5. top of range                               -> increase
 *   6. very low RIR                               -> hold (shorter-rest flavour)
 *   7. otherwise                                  -> hold
 *
 * personalizedLoad() layers return-to-training and the athlete's real load list on top of this decision.
 */
export function progression(
  catalogueEx: Exercise,
  recent: SetLog[],
  context?: {
    goal?: GoalKind;
    fatigue?: 'low' | 'normal' | 'elevated';
    experience?: string;
  }
): ProgressionResult {

  // the exercise as the goal prescribes it (idempotent: an already programmed exercise is not shifted twice)
  const ex = programExercise(catalogueEx, context?.goal);
  const valid = recentCompleted(ex, recent);

  if (!valid.length) {
    return {
      action: 'calibrate',
      reason:
        'No comparable completed work yet. Establish a controlled baseline.',
      confidence: 'low',
      nextRepRange: ex.repRange,
      recommendedRest: ex.restSec
    };
  }

  if (ex.loadSemantics === 'time') {
    return {
      action: 'hold',
      reason:
        'Timed movement: APEX tracks duration and never adds or removes load. Keep the target duration and build repeatable holds.',
      confidence: 'medium',
      nextRepRange: ex.repRange,
      recommendedRest: ex.restSec
    };
  }

  const top = ex.repRange[1];
  const bottom = ex.repRange[0];
  const last = valid[valid.length - 1];

  const fatigue =
    context?.fatigue ?? 'normal';

  const assisted = ex.loadSemantics === 'assistance';

  const lastWeight =
    sanitizeRecommendedLoad(
      ex,
      setLoad(ex, last)
    );

  const recentThree =
    valid.slice(-3);

  const allTop =
    recentThree.length >= 2 &&
    recentThree.every(
      set =>
        (set.reps ?? 0) >= top
    );

  const low =
    recentThree.filter(
      set =>
        (set.reps ?? 0) < bottom
    ).length >= 2;

  const rirs = valid
    .map(set => set.rir)
    .filter(
      (value): value is number =>
        value !== undefined &&
        Number.isFinite(value)
    );

  const avgRir =
    rirs.length
      ? rirs.reduce(
          (sum, value) => sum + value,
          0
        ) / rirs.length
      : undefined;

  const step =
    ex.incrementKg > 0
      ? ex.incrementKg
      : 0.5;

  if (low) {
    /*
     * "reduce" must actually reduce: one increment less load (or one
     * increment more assistance on assisted movements), never below the
     * exercise's smallest meaningful load. Loads are snapped to the
     * athlete's available loads by personalizedLoad().
     */
    const reducedLoad =
      lastWeight !== undefined
        ? sanitizeRecommendedLoad(
            ex,
            lastWeight + (assisted ? step : -step)
          )
        : undefined;
    return {
      action: 'reduce',
      weight: reducedLoad ?? lastWeight,
      reason:
        `Comparable performance has repeatedly fallen below the target range; reduce by one ${step} kg step.`,
      confidence: 'medium',
      nextRepRange: ex.repRange,
      recommendedRest:
        ex.restSec + 15
    };
  }

  if (
    allTop &&
    lastWeight !== undefined &&
    fatigue === 'elevated'
  ) {
    return {
      action: 'recover',
      weight: lastWeight,
      reason:
        'You reached the top of the range, but recent training load rose sharply; hold this load for one more session before adding more.',
      confidence: 'medium',
      nextRepRange: ex.repRange,
      recommendedRest:
        ex.restSec + 15
    };
  }

  if (
    allTop &&
    lastWeight !== undefined
  ) {
    const next =
      sanitizeRecommendedLoad(
        ex,
        lastWeight + (assisted ? -step : step)
      );

    return {
      action: 'increase',
      weight: next,
      reason:
        `Repeatedly reached ${top} reps; use a small ${step} kg progression step.`,
      confidence: 'high',
      nextRepRange: ex.repRange,
      recommendedRest:
        ex.restSec
    };
  }

  if (
    avgRir !== undefined &&
    avgRir <= 0.5
  ) {
    return {
      action: 'hold',
      weight: lastWeight,
      reason:
        'Recent sets were very close to failure. Repeat the load before adding more.',
      confidence: 'medium',
      nextRepRange: ex.repRange,
      recommendedRest:
        ex.restSec + 15
    };
  }

  return {
    action: 'hold',
    weight: lastWeight,
    reason:
      'Build repeatable performance inside the target range before changing load.',
    confidence: 'high',
    nextRepRange: ex.repRange,
    recommendedRest:
      ex.restSec
  };
}

/* ============================================================
   INITIAL LOAD INTELLIGENCE
   ============================================================ */

/* ============================================================
   RETURN TO TRAINING (layoff handling)
   ============================================================ */

/**
 * Documented return-to-training rule (see docs/RETURN_TO_TRAINING.md).
 *
 * The gap is the whole days between the last completed exposure to the exact
 * exercise and the date the load is prescribed for.
 *
 *   gap < 14 days      short gap        0 increments (normal progression)
 *   14 - 27 days       about 2 weeks    1 increment below the last worked load
 *   28 - 55 days       about 4 weeks    2 increments below the last worked load
 *   56+ days           extended layoff  3 increments below the last worked load
 *
 * "Increment" is the exercise's own load increment, so the result stays
 * compatible with the available equipment. The reduction is bounded: it never
 * exceeds half of the last worked load and never goes below the smallest
 * meaningful load. No increase is prescribed on the return session. The first
 * return session is itself new history (its date resets the gap), so normal
 * progression resumes on the following exposure. This is a conservative
 * product rule, not a scientific threshold.
 */
export const RETURN_GAP_DAYS = { twoWeek: 14, fourWeek: 28, extended: 56 } as const;

export type ReturnTier = 'short' | 'two_week' | 'four_week' | 'extended';

export function returnTierForGap(gapDays: number | undefined): { tier: ReturnTier; steps: number } {
  if (gapDays === undefined || !Number.isFinite(gapDays) || gapDays < RETURN_GAP_DAYS.twoWeek) return { tier: 'short', steps: 0 };
  if (gapDays < RETURN_GAP_DAYS.fourWeek) return { tier: 'two_week', steps: 1 };
  if (gapDays < RETURN_GAP_DAYS.extended) return { tier: 'four_week', steps: 2 };
  return { tier: 'extended', steps: 3 };
}

/** Whole days since the last completed working exposure to this exercise; undefined without a date or history. */
export function trainingGapDays(ex: Exercise, workouts: Workout[], asOf?: string): number | undefined {
  const target = dayNumber(dayOfTimestamp(asOf));
  if (target === undefined) return undefined;
  let latest: number | undefined;
  for (const workout of workouts) {
    if (workout.status !== 'completed') continue;
    const exposed = workout.exercises.some(entry => entry.exerciseId === ex.id && entry.sets.some(set => isWorkingSet(set) && (setLoad(ex, set) !== undefined ? meaningfulLoad(ex, setLoad(ex, set)) : meaningfulLoad(ex, undefined))));
    if (!exposed) continue;
    const day = dayNumber(workoutDay(workout));
    if (day !== undefined && (latest === undefined || day > latest)) latest = day;
  }
  return latest === undefined ? undefined : Math.max(0, target - latest);
}

function returnToTrainingLoad(
  ex: Exercise,
  lastWorked: number | undefined,
  progressed: number | undefined,
  gapDays: number | undefined,
  profile?: UserProfile
): { applied: false } | { applied: true; weight: number; tier: ReturnTier; steps: number; step: number; reason: string } {
  const { tier, steps } = returnTierForGap(gapDays);
  if (!steps || lastWorked === undefined) return { applied: false };
  const availability = loadAvailability(ex, profile);
  const step = availability.incrementKg || (ex.incrementKg > 0 ? ex.incrementKg : 0.5);
  const assisted = ex.loadSemantics === 'assistance';
  let target: number | undefined;
  if (availability.options.length) {
    // Walk down the athlete's real load choices, one choice per step. A reduction of more than half the
    // last worked load is never taken (assistance is bounded only by the step count).
    const options = availability.options;
    const nearest = snapToAvailableLoad(ex, lastWorked, profile);
    const index = nearest === undefined ? -1 : options.indexOf(nearest);
    if (index >= 0) {
      for (let k = steps; k >= 0; k--) {
        const candidate = assisted ? options[Math.min(options.length - 1, index + k)] : options[Math.max(0, index - k)];
        if (assisted || lastWorked - candidate <= lastWorked * 0.5 + 1e-9 || k === 0) { target = candidate; break; }
      }
    }
  }
  if (target === undefined) {
    const span = assisted ? steps * step : Math.min(steps * step, lastWorked * 0.5);
    target = sanitizeRecommendedLoad(ex, assisted ? lastWorked + span : lastWorked - span);
  }
  if (target === undefined) return { applied: false };
  // Never above the normal prescription (no increase on the return session); assistance is the mirror image.
  const weight = progressed === undefined ? target : assisted ? Math.max(target, progressed) : Math.min(target, progressed);
  const label = tier === 'two_week' ? 'about two weeks' : tier === 'four_week' ? 'about four weeks' : 'an extended break';
  return {
    applied: true, weight, tier, steps, step,
    reason: `Return to training after ${gapDays} days (${label}): restart ${steps} load step${steps === 1 ? '' : 's'} ${assisted ? 'more assisted' : 'below'} your last worked load. Normal progression resumes after this session.`
  };
}

/**
 * Calculates the target RIR used for first-exposure guidance.
 */
function targetRirForProfile(
  profile?: UserProfile
): number {
  return goalTargetRir(profile?.primaryGoal, profile?.experience);
}

/**
 * Extract all completed exercise sets for an exact exercise.
 */
function directExerciseSets(
  ex: Exercise,
  workouts: Workout[]
): SetLog[] {
  return chronologicalCompleted(workouts)
    .flatMap(workout => workout.exercises)
    .filter(entry => entry.exerciseId === ex.id)
    .flatMap(entry => entry.sets)
    .filter(set => {
      if (!isWorkingSet(set)) return false;
      const load = setLoad(ex, set);
      return load !== undefined && meaningfulLoad(ex, load);
    });
}

/**
 * Finds useful comparable exercise evidence.
 */
function comparableExerciseEvidence(
  target: Exercise,
  workouts: Workout[],
  exercises: Exercise[]
) {
  const comparisons =
    rankComparableExercises(
      target,
      exercises
    );

  const completedWorkouts =
    workouts.filter(
      workout =>
        workout.status === 'completed'
    );

  return comparisons
    // a load is only transferable between exercises that measure load the same way
    .filter(comparison => comparison.exercise.loadSemantics === target.loadSemantics)
    .slice(0, 6)
    .map(comparison => {
      const sets =
        completedWorkouts
          .flatMap(workout => workout.exercises)
          .filter(entry => entry.exerciseId === comparison.exercise.id)
          .flatMap(entry => entry.sets)
          .filter(set => {
            if (!isWorkingSet(set)) return false;
            const load = setLoad(comparison.exercise, set);
            return load !== undefined && meaningfulLoad(comparison.exercise, load);
          });

      const load =
        averageMeaningfulLoad(
          comparison.exercise,
          sets
        );

      return {
        comparison,
        load
      };
    })
    .filter(
      item =>
        item.load !== undefined
    );
}

/**
 * Deterministic first-set guidance.
 *
 * Priority:
 *
 * 1. Exact exercise history
 * 2. Closely comparable personal history
 * 3. Smallest known meaningful equipment increment
 * 4. Explicit calibration when no defensible number exists
 *
 * APEX never claims a universal "correct" starting weight.
 */
export function personalizedLoad(
  catalogueEx: Exercise,
  workouts: Workout[],
  profile?: UserProfile,
  exercises: Exercise[] = [],
  /** Date (YYYY-MM-DD or ISO) the load is being prescribed for. Enables return-to-training handling. */
  asOf?: string
): LoadRecommendation {
  const ex = programExercise(catalogueEx, profile?.primaryGoal);
  const targetRir = targetRirForProfile(profile);

  if (ex.loadSemantics === 'bodyweight' || ex.loadSemantics === 'none') {
    return {
      weight: 0,
      confidence: 'high',
      kind: 'baseline',
      reason: 'This movement uses bodyweight or no external resistance.',
      evidence: [`Load semantics: ${ex.loadSemantics}`],
      targetRir
    };
  }

  if (ex.loadSemantics === 'time') {
    return {
      confidence: 'high',
      kind: 'baseline',
      reason: 'This movement is prescribed by time rather than external load.',
      evidence: ['Load semantics: time', `Target duration: ${ex.repRange[0]}–${ex.repRange[1]}s`],
      targetRir
    };
  }

  const availability = loadAvailability(ex, profile);
  const direct = directExerciseSets(ex, workouts);

  /* 1. Exact exercise evidence is always strongest. */
  if (direct.length) {
    const result = progression(ex, direct, {
      goal: profile?.primaryGoal,
      experience: profile?.experience,
      fatigue: workloadFatigue(workouts, exercises)
    });
    const latest = latestMeaningfulLoad(ex, direct);
    const gapDays = trainingGapDays(ex, workouts, asOf);
    const reentry = returnToTrainingLoad(ex, latest, result.weight, gapDays, profile);
    const assisted = ex.loadSemantics === 'assistance';
    /*
     * Snapping respects the athlete's real load list and never silently reverses the decision:
     *   increase -> the smallest available load at or above (last + one increment), i.e. a real step up
     *   reduce / return-to-training -> the largest available load at or below the target, i.e. a real step down
     *   hold / recover / calibrate -> the nearest available load to the last worked load (a tie goes to the lower one)
     * Assisted movements mirror increase and reduce (less assistance is the harder direction).
     */
    const direction: 'nearest' | 'up' | 'down' = reentry.applied
      ? (assisted ? 'up' : 'down')
      : result.action === 'increase'
        ? (assisted ? 'down' : 'up')
        : result.action === 'reduce'
          ? (assisted ? 'up' : 'down')
          : 'nearest';
    const listed = availability.options.length > 0 && latest !== undefined;
    const incrementKg = ex.incrementKg > 0 ? ex.incrementKg : 0.5;
    const sign = assisted ? -1 : 1;
    const unrounded =
      result.action === 'increase' ? (latest as number) + sign * incrementKg
      : result.action === 'reduce' ? (latest as number) - sign * incrementKg
      : (latest as number);
    const candidate = snapToAvailableLoad(
      ex,
      reentry.applied ? reentry.weight : listed ? unrounded : (result.weight ?? latest),
      profile,
      direction
    );

    if (candidate !== undefined) {
      return {
        weight: candidate,
        action: result.action,
        recommendedRest: result.recommendedRest,
        confidence: reentry.applied ? 'medium' : result.confidence,
        kind: 'baseline',
        reason: reentry.applied ? reentry.reason : result.reason,
        ...(reentry.applied ? { returnToTraining: { gapDays: gapDays as number, tier: reentry.tier, steps: reentry.steps } } : {}),
        evidence: [
          ...(reentry.applied ? [`Training gap: ${gapDays} days (${reentry.tier.replace('_',' ')})`, `Return-to-training: ${reentry.steps} load step${reentry.steps === 1 ? '' : 's'} below your last worked load`] : []),
          `${direct.length} completed exercise-specific set${direct.length === 1 ? '' : 's'}`,
          latest !== undefined ? `Latest personal load: ${formatLoad(ex, latest)}` : 'No previous meaningful load available',
          `Target: ${ex.repRange[0]}–${ex.repRange[1]} reps`,
          `Target effort: RIR ${targetRir}`,
          availability.options.length ? `Available loads: ${availability.options.join(', ')} kg` : `Exercise increment: ${availability.incrementKg ?? ex.incrementKg} kg`
        ],
        targetRir
      };
    }
  }

  /* 2. Comparable personal history, only when semantics are compatible. */
  if (exercises.length) {
    const comparableEvidence = comparableExerciseEvidence(ex, workouts, exercises);
    if (comparableEvidence.length) {
      const strongest = comparableEvidence[0];
      const weighted = comparableEvidence.reduce((sum,item) => sum + (item.load as number) * item.comparison.score, 0);
      const scores = comparableEvidence.reduce((sum,item) => sum + item.comparison.score, 0);
      const raw = scores > 0 ? weighted / scores : undefined;
      const candidate = snapToAvailableLoad(ex, raw, profile);

      if (candidate !== undefined) {
        return {
          weight: candidate,
          confidence: strongest.comparison.confidence === 'high' ? 'medium' : 'low',
          kind: 'comparable_estimate',
          reason: 'Estimated from your completed work on a closely related exercise. This is a starting estimate, not a proven exercise-specific baseline.',
          evidence: [
            `Comparable exercise: ${strongest.comparison.exercise.name}`,
            ...strongest.comparison.reasons.slice(0,4),
            `Evidence from ${comparableEvidence.length} comparable exercise record${comparableEvidence.length === 1 ? '' : 's'}`,
            `Experience: ${profile?.experience ?? 'not recorded'}`,
            `Target effort: RIR ${targetRir}`
          ],
          targetRir
        };
      }
    }
  }

  /*
   * 3. Exercise-specific deterministic calibration.
   * No bodyweight multiplier and no universal starting weight.
   * The estimate is derived from exercise mechanics/class metadata,
   * target reps, experience, target RIR and real load increments.
   */
  // the class formula scales the exercise's own increment; a coarse load list must not inflate the starting load
  const increment = ex.incrementKg > 0 ? ex.incrementKg : (availability.incrementKg ?? 0);
  if (increment > 0) {
    const compoundPatterns = new Set(['squat','hinge','horizontal_push','horizontal_pull','vertical_push','vertical_pull']);
    const isolationPatterns = new Set(['arm_flexion','arm_extension','shoulder_abduction','knee_flexion','knee_extension','calf']);
    const compound = compoundPatterns.has(ex.pattern);
    const isolation = isolationPatterns.has(ex.pattern);

    let classFactor = compound ? 4 : isolation ? 2 : 3;
    if (ex.loadSemantics === 'per_hand') classFactor = compound ? 2 : 1;
    if (ex.loadSemantics === 'stack') classFactor = compound ? 4 : 2;

    const experienceFactor = profile?.experience === 'advanced' ? 1.5 : profile?.experience === 'intermediate' ? 1.2 : 1;
    const repFactor = ex.repRange[1] >= 15 ? 0.8 : ex.repRange[0] >= 12 ? 0.9 : ex.repRange[0] <= 5 ? 1.15 : 1;
    const rirFactor = targetRir <= 1 ? 1.05 : 1;
    const raw = increment * classFactor * experienceFactor * repFactor * rirFactor;
    const candidate = snapToAvailableLoad(ex, raw, profile, 'nearest') ?? sanitizeRecommendedLoad(ex, increment);

    if (candidate !== undefined) {
      return {
        weight: candidate,
        confidence: 'low',
        kind: 'calibration',
        reason: 'No exercise-specific history exists yet. APEX derived a conservative exercise-class starting point from the movement pattern, load semantics, experience, target reps, target RIR and the smallest known load increment. This set establishes your personal baseline.',
        evidence: [
          `Exercise class: ${compound ? 'compound' : isolation ? 'isolation' : 'mixed'}`,
          `Mechanics: ${ex.pattern.replace(/_/g,' ')}`,
          `Load semantics: ${ex.loadSemantics}`,
          `Experience: ${profile?.experience ?? 'not recorded'}`,
          `Target: ${ex.repRange[0]}–${ex.repRange[1]} reps`,
          `Target effort: RIR ${targetRir}`,
          availability.options.length ? `Configured loads: ${availability.options.join(', ')} kg` : `Known increment: ${increment} kg`,
          'No exercise-specific baseline available'
        ],
        targetRir
      };
    }
  }

  /* 4. No defensible numeric load: explicit calibration is safer than fiction. */
  return {
    confidence: 'low',
    kind: 'calibration',
    reason: 'APEX does not have enough reliable information to calculate a defensible numeric load. Enter a controlled calibration load; APEX will use the result as your personal baseline.',
    evidence: [
      `Experience: ${profile?.experience ?? 'not recorded'}`,
      `Goal: ${profile?.primaryGoal ?? 'not recorded'}`,
      `Target: ${ex.repRange[0]}–${ex.repRange[1]} reps`,
      `Target effort: RIR ${targetRir}`,
      'No exercise-specific or comparable load evidence'
    ],
    targetRir
  };
}

/* ============================================================
   PERFORMANCE / VOLUME
   ============================================================ */

/**
 * Set values reach the engine from the UI and from storage, both of which
 * validate them. As a last line of defence the calculations that feed the UI
 * (volume, PRs) treat anything that is not a finite, non-negative number as 0
 * instead of letting NaN, Infinity or a negative value into a total.
 */
function safeNum(value: unknown, max = Infinity): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? value : 0;
}

export function summarizeSets(
  ex: Exercise,
  sets: SetLog[]
): PerformanceSummary {

  // warm-ups are not training work (see the set-semantics note)
  const done = sets.filter(isWorkingSet);
  const assisted = ex.loadSemantics === 'assistance';

  const reps =
    done.reduce(
      (sum, set) =>
        sum + safeNum(set.reps, MAX_PLAUSIBLE_REPS),
      0
    );

  // external load only: assistance is not mass moved, so it adds no load and no volume
  const external = !assisted && ex.loadSemantics !== 'time' && ex.loadSemantics !== 'none' && ex.loadSemantics !== 'bodyweight';

  const load =
    external
      ? done.reduce((sum, set) => sum + safeNum(setLoad(ex, set)), 0)
      : 0;

  const volume =
    external
      ? done.reduce(
          (sum, set) => {
            const multiplier =
              ex.loadSemantics === 'per_hand'
                ? (ex.unilateral ? 1 : 2)
                : 1;

            return sum + safeNum(setLoad(ex, set)) * safeNum(set.reps, MAX_PLAUSIBLE_REPS) * multiplier;
          },
          0
        )
      : 0;

  const rirs =
    done
      .map(set => set.rir)
      .filter(
        (
          value
        ): value is number =>
          typeof value ===
            'number' &&
          Number.isFinite(value)
      );

  return {
    completedSets:
      done.length,
    reps,
    load,
    volume,
    topLoad:
      bestLoad(ex, done),
    bestReps:
      reps
        ? Math.max(
            ...done.map(
              set =>
                safeNum(set.reps, MAX_PLAUSIBLE_REPS)
            )
          )
        : undefined,
    avgRir:
      rirs.length
        ? rirs.reduce(
            (sum, value) =>
              sum + value,
            0
          ) / rirs.length
        : undefined
  };
}

export function volumeForWorkout(
  w: Workout,
  exercises: Exercise[]
) {
  return w.exercises.reduce(
    (sum, workoutExercise) => {

      const ex =
        exercises.find(
          exercise =>
            exercise.id ===
            workoutExercise.exerciseId
        );

      return (
        sum +
        (
          ex
            ? summarizeSets(
                ex,
                workoutExercise.sets
              ).volume
            : 0
        )
      );
    },
    0
  );
}

/* ============================================================
   SAFETY
   ============================================================ */

export function safetyCheck(
  ex: Exercise,
  current: number | undefined,
  proposed: number | undefined,
  sets: number,
  weeklySets = 0
): SafetyResult {

  const reasons: string[] = [];

  /* Invalid proposed load */

  if (
    proposed !== undefined &&
    !validateLoadRecommendation(
      ex,
      proposed
    )
  ) {
    return {
      allowed: false,
      severity: 'block',
      reasons: [
        'Proposed load is invalid for this exercise.'
      ]
    };
  }

  /* Normal loaded exercise must never receive zero */

  if (
    proposed !== undefined &&
    ex.loadSemantics !==
      'bodyweight' &&
    ex.loadSemantics !==
      'none' &&
    ex.loadSemantics !==
      'time' &&
    ex.loadSemantics !==
      'assistance' &&
    proposed <= 0
  ) {
    return {
      allowed: false,
      severity: 'block',
      reasons: [
        'A normal loaded exercise cannot use zero as an automatic load recommendation.'
      ]
    };
  }

  /* Automatic load-change safety */

  if (
    proposed !== undefined &&
    current !== undefined &&
    current > 0
  ) {

    const delta =
      ex.loadSemantics ===
      'assistance'
        ? current - proposed
        : proposed - current;

    if (
      delta > current * 0.15
    ) {
      reasons.push(
        'Proposed load change exceeds a conservative 15% step.'
      );
    }

    if (
      delta > current * 0.10
    ) {
      reasons.push(
        'Consider a smaller progression step.'
      );
    }
  }

  if (sets > 5) {
    reasons.push(
      'More than five prescribed sets for one movement needs review.'
    );
  }

  if (weeklySets > 16) {
    reasons.push(
      'Weekly exposure is high; review recovery and redundancy.'
    );
  }

  const hard =
    proposed !== undefined &&
    current !== undefined &&
    current > 0 &&
    (
      (
        ex.loadSemantics !==
          'assistance' &&
        proposed >
          current * 1.25
      ) ||
      (
        ex.loadSemantics ===
          'assistance' &&
        proposed <
          current * 0.75
      )
    );

  if (hard) {
    return {
      allowed: false,
      severity: 'block',
      reasons: [
        'Load jump is too large for an automatic change.',
        ...reasons
      ]
    };
  }

  return {
    allowed: true,
    severity:
      reasons.length
        ? 'caution'
        : 'none',
    reasons
  };
}

/* ============================================================
   REST
   ============================================================ */

export function recommendedRest(
  ex: Exercise,
  preference:
    | 'adaptive'
    | 'short'
    | 'standard'
    | 'long'
    | 'custom',
  custom?: number,
  effort?: number
) {

  if (
    preference === 'short'
  ) {
    return Math.max(
      45,
      ex.restSec - 30
    );
  }

  if (
    preference === 'standard'
  ) {
    return ex.restSec;
  }

  if (
    preference === 'long'
  ) {
    return ex.restSec + 30;
  }

  if (
    preference === 'custom'
  ) {
    return (
      custom ||
      ex.restSec
    );
  }

  return Math.round(
    (
      ex.restSec +
      (
        effort != null &&
        effort <= 1
          ? 15
          : 0
      )
    ) / 15
  ) * 15;
}

/* ============================================================
   IMMEDIATE SET FEEDBACK
   ============================================================ */

function feedbackDirection(
  ex: Exercise,
  feedback:
    | 'heavy'
    | 'right'
    | 'easy'
): number {

  if (
    feedback === 'right'
  ) {
    return 0;
  }

  /*
   * Normal resistance:
   *
   * easy  -> increase
   * heavy -> decrease
   *
   * Assistance is inverted:
   *
   * easy  -> less assistance
   * heavy -> more assistance
   */

  if (
    ex.loadSemantics ===
    'assistance'
  ) {
    return feedback === 'easy'
      ? -1
      : 1;
  }

  return feedback === 'easy'
    ? 1
    : -1;
}

/**
 * Adjust current working load using:
 *
 * - user feedback
 * - actual reps
 * - actual RIR
 * - target reps
 * - target RIR
 * - equipment increment
 *
 * Automatic changes remain bounded.
 */
export function feedbackLoad(
  ex: Exercise,
  current: number | undefined,
  feedback: 'heavy' | 'right' | 'easy',
  actual?: Pick<SetLog,'reps'|'rir'>,
  target?: [number, number],
  targetRir = 2,
  profile?: UserProfile
) {
  if (ex.loadSemantics === 'bodyweight' || ex.loadSemantics === 'time' || ex.loadSemantics === 'none') {
    const valid = current === undefined || (typeof current === 'number' && Number.isFinite(current) && current >= 0);
    return valid ? current : sanitizeRecommendedLoad(ex, current);
  }

  const base = sanitizeRecommendedLoad(ex, current);
  if (base === undefined) return undefined;
  if (feedback === 'right') return snapToAvailableLoad(ex, base, profile);

  const reps = actual?.reps;
  const rir = actual?.rir;
  const belowTarget = target !== undefined && reps !== undefined && reps < target[0];
  const aboveTarget = target !== undefined && reps !== undefined && reps >= target[1];
  const clearlyEasy = aboveTarget && (rir === undefined || rir > targetRir);
  const clearlyHeavy = belowTarget || (rir !== undefined && rir < targetRir);

  // 'upward' is the direction the stored number moves: assisted movements are harder with LESS assistance
  const upward = ex.loadSemantics === 'assistance' ? feedback === 'heavy' : feedback === 'easy';
  const shouldMove = feedback === 'heavy' ? true : feedback === 'easy' ? true : (clearlyEasy || clearlyHeavy);
  if (!shouldMove) return snapToAvailableLoad(ex, base, profile);

  const availability = loadAvailability(ex, profile);
  if (availability.options.length) {
    const currentOption = snapToAvailableLoad(ex, base, profile);
    if (currentOption === undefined) return base;
    const index = availability.options.indexOf(currentOption);
    const jump = (feedback === 'heavy' || feedback === 'easy') && (clearlyHeavy || clearlyEasy) ? 2 : 1;
    const nextIndex = upward ? Math.min(availability.options.length-1,index+jump) : Math.max(0,index-jump);
    return availability.options[nextIndex];
  }

  const step = availability.incrementKg || ex.incrementKg || 0.5;
  const percent = Math.min(base * 0.10, step * 2);
  const change = Math.max(step, percent);
  const adjusted = upward ? base + change : base - change;
  return sanitizeRecommendedLoad(ex, adjusted);
}

/* ============================================================
   PLAN BUILDING
   ============================================================ */

function chooseByPattern(
  exercises: Exercise[],
  pattern: string,
  equipment: string[]
) {

  return (
    exercises.find(
      exercise =>
        exercise.pattern === pattern &&
        exerciseFitsEquipment(exercise, equipment)
    ) ||
    exercises.find(
      exercise =>
        exercise.pattern ===
        pattern
    ) ||
    exercises.find(
      exercise =>
        exercise.pattern.includes(
          pattern
        )
    )
  );
}

/** Training days per week: a whole number from 2 to 6; anything invalid (NaN, Infinity, text) becomes 3. */
export function sanitizeTrainingDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 3;
  return Math.max(2, Math.min(6, Math.round(value)));
}

export function buildPlan(
  profile: UserProfile,
  exercises: Exercise[],
  goals: any[] = []
) {

  const available =
    exercises.filter(
      exercise =>
        exerciseFitsEquipment(
          exercise,
          profile.equipment
        )
    );

  const upperPatterns = [
    'horizontal_push',
    'vertical_pull',
    'horizontal_pull',
    'vertical_push',
    'arm_flexion',
    'arm_extension',
    'shoulder_abduction'
  ];

  const lowerPatterns = [
    'squat',
    'hinge',
    'knee_flexion',
    'knee_extension',
    'calf',
    'core'
  ];

  const upper =
    upperPatterns
      .map(
        pattern =>
          chooseByPattern(
            available,
            pattern,
            profile.equipment
          )
      )
      .filter(
        (
          exercise
        ): exercise is Exercise =>
          Boolean(exercise)
      );

  const lower =
    lowerPatterns
      .map(
        pattern =>
          chooseByPattern(
            available,
            pattern,
            profile.equipment
          )
      )
      .filter(
        (
          exercise
        ): exercise is Exercise =>
          Boolean(exercise)
      );

  const full = [
    ...upper.slice(0, 3),
    ...lower.slice(0, 3)
  ];

  const days: PlanDay[] = [];

  const trainingDays = sanitizeTrainingDays(profile.trainingDays);

  const trainingIndexes =
    trainingDays <= 3
      ? [0, 2, 4].slice(
          0,
          trainingDays
        )
      : [0, 1, 3, 4, 5, 6].slice(
          0,
          trainingDays
        );

  for (
    let dayIndex = 0;
    dayIndex < 7;
    dayIndex++
  ) {

    if (
      trainingIndexes.includes(
        dayIndex
      )
    ) {

      const trainingIndex =
        trainingIndexes.indexOf(
          dayIndex
        );

      const upperDay =
        trainingIndex % 2 === 0;

      const label =
        trainingDays <= 3
          ? `FULL BODY ${
              upperDay ? 'A' : 'B'
            }`
          : `${
              upperDay
                ? 'UPPER'
                : 'LOWER'
            } ${String.fromCharCode(
              65 +
                Math.floor(
                  trainingIndex / 2
                )
            )}`;

      days.push({
        id: uid('day'),
        dayIndex,
        label,
        rest: false,
        workoutId: uid('wref')
      });

    } else {

      days.push({
        id: uid('day'),
        dayIndex,
        label: 'RECOVERY',
        rest: true
      });
    }
  }

  return {
    name:
      `APEX ${profile.primaryGoal.replace(
        '_',
        ' '
      )} program`,
    days,
    /*
     * A training day is never empty: with very little equipment (bodyweight or kettlebell only) no upper-body
     * movement exists, so an UPPER or LOWER day falls back to the full-body set instead of becoming a workout
     * with zero exercises.
     */
    exerciseSets: {
      upper:
        (upper.length ? upper : full).map(
          exercise =>
            exercise.id
        ),
      lower:
        (lower.length ? lower : full).map(
          exercise =>
            exercise.id
        ),
      full:
        full.map(
          exercise =>
            exercise.id
        )
    }
  };
}

/* ============================================================
   WORKOUT CREATION
   ============================================================ */

/**
 * Creates a workout while defensively ignoring invalid exercise IDs.
 *
 * When historical sets are supplied, progression uses that history.
 *
 * When no history exists, the smallest known meaningful increment
 * is used as a conservative first calibration point.
 *
 * The full guided-session path should use personalizedLoad()
 * with complete profile/workout history for richer estimates.
 */
export function createWorkout(
  name: string,
  date: string,
  ids: string[],
  exercises: Exercise[],
  planId: string,
  source:
    | 'scheduled'
    | 'custom'
    | 'extra' = 'scheduled',
  version = 1,
  history?: SetLog[][]
): Workout {

  const items =
    ids
      .flatMap(
        (id, index) => {

          const ex =
            exercises.find(
              exercise =>
                exercise.id === id
            );

          /*
           * Invalid IDs must never create
           * an unrenderable workout item.
           */
          if (!ex) {
            return [];
          }

          const count =
            index < 4 ? 3 : 2;

          const previous =
            history?.[index] || [];

          let recommendation:
            LoadRecommendation;

          if (
            previous.length
          ) {
            const progressionResult =
              progression(
                ex,
                previous
              );

            recommendation = {
              weight:
                sanitizeRecommendedLoad(
                  ex,
                  progressionResult.weight
                ),
              confidence:
                progressionResult.confidence,
              kind:
                'baseline',
              reason:
                progressionResult.reason,
              evidence: [
                `${previous.length} historical set${previous.length === 1 ? '' : 's'} supplied`,
                `Target: ${ex.repRange[0]}–${ex.repRange[1]} reps`
              ],
              targetRir: 2
            };

          } else {

            recommendation =
              personalizedLoad(
                ex,
                [],
                undefined,
                exercises
              );
          }

          const safeWeight =
            sanitizeRecommendedLoad(
              ex,
              recommendation.weight
            );

          const sets =
            Array.from(
              { length: count },
              () =>
                makeSet(
                  'working',
                  ex,
                  safeWeight
                )
            );

          return [
            {
              exerciseId: id,
              sets,
              prescribedSets: count,
              repRange:
                ex.repRange,
              recommendedWeight:
                safeWeight,
              restSec:
                ex.restSec,
              order: 0
            }
          ];
        }
      )
      .map(
        (
          item,
          order
        ) => ({
          ...item,
          order
        })
      );

  return {
    id: uid('workout'),
    planId,
    name,
    scheduledDate: date,
    status: 'planned',
    exercises: items,
    source,
    version,
    updatedAt:
      new Date().toISOString()
  };
}

/* ============================================================
   SET CREATION / TYPE MANAGEMENT
   ============================================================ */

/**
 * Carry the authoritative recommendation into a workout's uncompleted working sets.
 * On the FIRST hydration of a workout every such set takes the recommendation (loads pre-filled when the workout was
 * created are stale: the plan is built before any history exists). Later hydrations only fill a missing load, so
 * they never overwrite what the athlete chose. Warm-ups and completed sets are never touched. Assisted movements
 * write SetLog.assistance, everything else SetLog.weight. Movements without a load are returned unchanged.
 */
export function loadRecommendationIntoSets(
  ex: Exercise,
  sets: SetLog[],
  value: number | undefined,
  firstHydration: boolean
): SetLog[] {
  if (value === undefined || !Number.isFinite(value)) return sets;
  const assisted = ex.loadSemantics === 'assistance';
  const external = !['bodyweight', 'none', 'time', 'assistance'].includes(ex.loadSemantics);
  if (!assisted && !external) return sets;
  return sets.map(set => {
    if (set.completed || set.type === 'warmup') return set;
    const hasLoad = assisted ? set.assistance !== undefined : set.weight !== undefined && set.weight > 0;
    if (hasLoad && !firstHydration) return set;
    return assisted
      ? { ...set, assistance: value, loadDetail: { kind: 'assistance' as const, assistanceKg: value } }
      : { ...set, weight: value, loadDetail: loadDetailForSet(ex, value, { ...(set.loadDetail || {}), totalKg: undefined, stackKg: undefined, perHandKg: undefined } as any) };
  });
}

/** Assistance is a finite, non-negative number of kg; anything else is 0. */
function cleanAssistance(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function makeSet(
  type: SetType,
  ex: Exercise,
  weight?: number
): SetLog {

  const timed =
    type === 'timed' ||
    ex.loadSemantics === 'time';

  const assistance =
    type === 'assisted' ||
    ex.loadSemantics === 'assistance';

  const bodyweight =
    ex.loadSemantics === 'bodyweight' ||
    ex.loadSemantics === 'none';

  const external =
    !timed && !bodyweight && !assistance;

  const cleanWeight =
    external
      ? sanitizeRecommendedLoad(ex, weight)
      : undefined;

  const set: SetLog = {
    id: uid('set'),
    type,

    weight: cleanWeight,

    loadDetail:
      loadDetailForSet(
        ex,
        cleanWeight
      ),

    reps:
      timed
        ? undefined
        : ex.repRange[0],

    seconds:
      timed
        ? ex.repRange[0]
        : undefined,

    completed: false,

    side:
      ex.unilateral
        ? 'both'
        : undefined,

    assistance:
      assistance
        ? cleanAssistance(weight)
        : undefined
  };

  if (assistance) {
    set.loadDetail = {
      kind: 'assistance',
      assistanceKg: cleanAssistance(weight)
    };
  }

  return set;
}

export function updateSetType(
  set: SetLog,
  type: SetType,
  ex: Exercise
): SetLog {

  const next: SetLog = {
    ...set,
    type
  };

  if (
    type === 'timed' ||
    ex.loadSemantics === 'time'
  ) {
    delete next.weight;
    delete next.reps;
    delete next.assistance;
    next.seconds =
      next.seconds ??
      ex.repRange[0];
    next.loadDetail = {
      kind: 'timed'
    };
    return next;
  }

  if (
    type === 'bodyweight' ||
    ex.loadSemantics === 'bodyweight' ||
    ex.loadSemantics === 'none'
  ) {
    delete next.weight;
    delete next.seconds;
    delete next.assistance;
    next.reps =
      next.reps ??
      ex.repRange[0];
    next.loadDetail =
      ex.loadSemantics === 'bodyweight'
        ? {kind:'bodyweight'}
        : {kind:'none'};
    return next;
  }

  if (
    type === 'assisted' ||
    ex.loadSemantics === 'assistance'
  ) {
    const assistance =
      Math.max(
        0,
        next.assistance ??
        next.weight ??
        next.loadDetail?.assistanceKg ??
        0
      );

    delete next.weight;
    delete next.seconds;
    next.assistance = assistance;
    next.loadDetail = {
      kind: 'assistance',
      assistanceKg: assistance
    };
    next.reps =
      next.reps ??
      ex.repRange[0];
    return next;
  }

  delete next.assistance;
  delete next.seconds;

  next.weight =
    sanitizeRecommendedLoad(
      ex,
      next.weight
    );

  next.reps =
    next.reps ??
    ex.repRange[0];

  next.loadDetail =
    loadDetailForSet(
      ex,
      next.weight,
      next.loadDetail
    );

  return next;
}

/* ============================================================
   ACHIEVEMENTS
   ============================================================ */

export function detectAchievements(
  w: Workout,
  exercises: Exercise[],
  previous: Workout[]
) {

  const output: any[] = [];

  for (const workoutExercise of w.exercises) {

    const ex = exercises.find(exercise => exercise.id === workoutExercise.exerciseId);
    if (!ex) {
      continue;
    }

    const assisted = ex.loadSemantics === 'assistance';
    // only working sets count; warm-ups are never a record
    const completed = workoutExercise.sets.filter(isWorkingSet);
    const priorEntries = previous.flatMap(workout => workout.exercises.filter(entry => entry.exerciseId === ex.id));
    const old = priorEntries.flatMap(entry => entry.sets.filter(isWorkingSet));

    /* load: heaviest external load, or (assisted) the LOWEST assistance */
    const top = bestLoad(ex, completed);
    const oldTop = bestLoad(ex, old);
    const loadBetter =
      top !== undefined &&
      (oldTop === undefined
        ? (assisted || top > 0)
        : assisted
          ? top < oldTop
          : top > oldTop);

    if (loadBetter && top !== undefined) {
      output.push({
        exerciseId: ex.id,
        kind: 'load',
        label: assisted
          ? `New assistance best: ${formatLoad(ex, top)}`
          : `New load best: ${formatLoad(ex, top)}`,
        value: top,
        unit: loadUnit(ex)
      });
    }

    /* reps */
    const best = Math.max(0, ...completed.map(set => safeNum(set.reps, MAX_PLAUSIBLE_REPS)));
    const oldBest = Math.max(0, ...old.map(set => safeNum(set.reps, MAX_PLAUSIBLE_REPS)));

    if (best > oldBest && best > 0) {
      output.push({
        exerciseId: ex.id,
        kind: 'rep',
        label: `New rep best: ${best} reps`,
        value: best,
        unit: 'reps'
      });
    }

    /* estimated strength (Epley) needs a real external load */
    const estimatedOneRepMax = (sets: SetLog[]) =>
      Math.max(
        0,
        ...(assisted
          ? []
          : sets
              .filter(set => safeNum(setLoad(ex, set)) > 0 && safeNum(set.reps, MAX_PLAUSIBLE_REPS) >= 1 && safeNum(set.reps, MAX_PLAUSIBLE_REPS) <= 10)
              .map(set => safeNum(setLoad(ex, set)) * (1 + safeNum(set.reps, MAX_PLAUSIBLE_REPS) / 30)))
      );

    const estimated = estimatedOneRepMax(completed);
    const oldEstimated = estimatedOneRepMax(old);

    if (estimated > oldEstimated && estimated > 0) {
      output.push({
        exerciseId: ex.id,
        kind: 'estimated_strength',
        label: `Estimated strength best: ${formatLoad(ex, estimated)}`,
        value: estimated,
        unit: 'estimated 1RM'
      });
    }

    /* session volume: this session against the best PREVIOUS single session */
    const volume = summarizeSets(ex, completed).volume;
    const oldVolume = Math.max(0, ...priorEntries.map(entry => summarizeSets(ex, entry.sets).volume));

    if (volume > oldVolume && volume > 0) {
      output.push({
        exerciseId: ex.id,
        kind: 'volume',
        label: 'New session volume best',
        value: volume,
        unit: 'kg·reps'
      });
    }

    /* timed: longest hold against the previous longest */
    if (ex.loadSemantics === 'time') {
      const seconds = Math.max(0, ...completed.map(set => safeNum(set.seconds, MAX_PLAUSIBLE_SECONDS)));
      const oldSeconds = Math.max(0, ...old.map(set => safeNum(set.seconds, MAX_PLAUSIBLE_SECONDS)));

      if (seconds > oldSeconds && seconds > 0) {
        output.push({
          exerciseId: ex.id,
          kind: 'timed',
          label: `New time best: ${seconds}s`,
          value: seconds,
          unit: 'seconds'
        });
      }
    }
  }

  return output;
}

/* ============================================================
   WORKOUT STATUS
   ============================================================ */

export function markMissedWorkouts(
  workouts: Workout[],
  todayISO: string
) {

  return workouts.map(
    workout =>
      workout.status ===
        'planned' &&
      workout.scheduledDate <
        todayISO
        ? {
            ...workout,
            status:
              'missed' as const,
            updatedAt:
              new Date().toISOString()
          }
        : workout
  );
}

export function createRescheduled(
  workout: Workout,
  date: string
) {

  return {
    ...structuredClone(
      workout
    ),

    id: uid('workout'),

    scheduledDate: date,

    status:
      'planned' as const,

    source:
      workout.source,

    version:
      workout.version + 1,

    updatedAt:
      new Date().toISOString()
  };
}

/* ============================================================
   EQUIPMENT
   ============================================================ */

export type EquipmentFit =
  | 'available'
  | 'unknown'
  | 'unavailable';

/**
 * The one equipment-compatibility rule (plan building, substitutions, the library and the session brief all use it):
 * an exercise is usable when it needs no equipment, when it is bodyweight, or when at least one of the pieces of
 * equipment it lists is available. Matching is by exact, case-insensitive name.
 */
export function usesNoEquipment(ex: Exercise): boolean {
  return ex.equipment.length === 0 || ex.equipment.includes('bodyweight');
}

/**
 * The equipment an exercise actually needs the athlete to have. "bodyweight" and "none" are not equipment: they are
 * the absence of a requirement, so they are never listed, confirmed or counted as missing. An exercise that can be
 * done with bodyweight (alone or as one option) needs nothing.
 */
export function requiredEquipment(ex: Exercise): string[] {
  if (usesNoEquipment(ex)) return [];
  return ex.equipment.filter(item => item && item !== 'none');
}

export function exerciseFitsEquipment(ex: Exercise, available: readonly string[]): boolean {
  if (usesNoEquipment(ex)) return true;
  const normalized = new Set(available.map(value => String(value).toLowerCase().trim()));
  return ex.equipment.some(required => normalized.has(required.toLowerCase().trim()));
}

export function equipmentFit(
  ex: Exercise,
  available:
    | string[]
    | undefined
): EquipmentFit {

  // a movement that needs no equipment is available whether or not the athlete has listed any
  if (usesNoEquipment(ex)) {
    return 'available';
  }

  if (
    !available ||
    !available.length
  ) {
    return 'unknown';
  }

  return exerciseFitsEquipment(ex, available)
    ? 'available'
    : 'unavailable';
}

/**
 * The one substitution score. Equipment fit dominates, then how much of the movement is preserved
 * (same pattern, same way of measuring load, same family), then whether the catalogue lists the pair.
 */
export function substituteScore(
  source: Exercise,
  candidate: Exercise,
  available: readonly string[] | undefined
): number {
  const fit = equipmentFit(candidate, available ? [...available] : undefined);
  let score = fit === 'available' ? 1000 : fit === 'unknown' ? 500 : 0;
  if (candidate.pattern === source.pattern) score += 120;
  if (candidate.loadSemantics === source.loadSemantics) score += 80;
  if (candidate.family === source.family) score += 50;
  if (candidate.alternatives.includes(source.id) || source.alternatives.includes(candidate.id)) score += 30;
  if (candidate.equipment.length < source.equipment.length) score += 10;
  // a swap that keeps the prescription meaningful (same pattern, load meaning and rep-range width) outranks one that resets the baseline
  if (isEquivalentSubstitution(source, candidate)) score += 100;
  return score;
}

/**
 * Every usable replacement for an exercise, best first: the catalogue's listed alternatives plus every other
 * exercise, minus anything the athlete cannot use (profile equipment) or has marked unavailable for this session.
 * Ties are broken by id so the order never depends on how the catalogue happens to be stored.
 */
export function rankSubstitutes(
  source: Exercise,
  exercises: Exercise[],
  available: readonly string[] | undefined,
  unavailableItems: readonly string[] = []
): { exercise: Exercise; score: number; equivalent: boolean }[] {
  const blocked = new Set(unavailableItems.map(item => item.toLowerCase().trim()));
  return exercises
    .filter(candidate => candidate.id !== source.id)
    .filter(candidate => !candidate.equipment.some(item => blocked.has(item.toLowerCase().trim())))
    .filter(candidate => equipmentFit(candidate, available ? [...available] : undefined) !== 'unavailable')
    .map(candidate => ({
      exercise: candidate,
      score: substituteScore(source, candidate, available),
      equivalent: isEquivalentSubstitution(source, candidate)
    }))
    .sort((x, y) => y.score - x.score || x.exercise.id.localeCompare(y.exercise.id));
}

/** The catalogue's listed alternatives for an exercise, best first, including ones the equipment rules exclude. */
export function smartAlternatives(
  ex: Exercise,
  exercises: Exercise[],
  available:
    | string[]
    | undefined
) {

  return ex.alternatives
    .map(id => exercises.find(exercise => exercise.id === id))
    .filter((exercise): exercise is Exercise => Boolean(exercise))
    .map(exercise => ({
      exercise,
      fit: equipmentFit(exercise, available),
      samePattern: exercise.pattern === ex.pattern,
      sameLoad: exercise.loadSemantics === ex.loadSemantics,
      similarity: comparisonScore(ex, exercise),
      score: substituteScore(ex, exercise, available)
    }))
    .sort((a, b) => b.score - a.score || b.similarity - a.similarity || a.exercise.id.localeCompare(b.exercise.id));
}

/* ============================================================
   RESCHEDULING / SET MANAGEMENT
   ============================================================ */

export function rescheduleWorkout(
  workout: Workout,
  date: string
) {

  const original =
    structuredClone(
      workout
    );

  original.status =
    'rescheduled';

  original.updatedAt =
    new Date().toISOString();

  const replacement =
    createRescheduled(
      workout,
      date
    );

  return {
    original,
    replacement
  };
}

export function cloneSetForRepeat(
  set: SetLog,
  ex: Exercise
): SetLog {

  const copy: SetLog = {
    ...set,
    id: uid('set'),
    completed: false,
    timestamp: undefined
  };

  if (ex.loadSemantics === 'time') {
    delete copy.weight;
    copy.seconds =
      copy.seconds ??
      ex.repRange[0];
    copy.loadDetail = {kind:'timed'};
  }

  if (
    ex.loadSemantics === 'bodyweight' ||
    ex.loadSemantics === 'none'
  ) {
    delete copy.weight;
    delete copy.seconds;
    copy.reps =
      copy.reps ??
      ex.repRange[0];
    copy.loadDetail =
      ex.loadSemantics === 'bodyweight'
        ? {kind:'bodyweight'}
        : {kind:'none'};
  }

  if (ex.loadSemantics === 'assistance') {
    delete copy.weight;
    copy.assistance =
      copy.assistance ??
      0;
    copy.loadDetail = {
      kind:'assistance',
      assistanceKg: copy.assistance
    };
  }

  if (
    ex.loadSemantics !== 'time' &&
    ex.loadSemantics !== 'bodyweight' &&
    ex.loadSemantics !== 'none' &&
    ex.loadSemantics !== 'assistance'
  ) {
    copy.weight =
      sanitizeRecommendedLoad(ex, copy.weight);
    copy.loadDetail =
      loadDetailForSet(
        ex,
        copy.weight,
        copy.loadDetail
      );
  }

  return copy;
}

export function addWorkoutSet(
  workout: Workout,
  exerciseId: string,
  exercises: Exercise[],
  template?: SetLog
) {

  const output =
    structuredClone(
      workout
    );

  const workoutExercise =
    output.exercises.find(
      entry =>
        entry.exerciseId ===
        exerciseId
    );

  const ex =
    exercises.find(
      exercise =>
        exercise.id ===
        exerciseId
    );

  if (
    !workoutExercise ||
    !ex ||
    workoutExercise.sets
      .length >= 8
  ) {
    return workout;
  }

  const templateSet =
    template ||
    workoutExercise.sets[
      workoutExercise
        .sets.length - 1
    ];

  if (!templateSet) {
    return workout;
  }

  workoutExercise.sets.push(
    cloneSetForRepeat(
      templateSet,
      ex
    )
  );

  workoutExercise.prescribedSets =
    workoutExercise.sets.length;

  output.version++;
  output.updatedAt =
    new Date().toISOString();

  return output;
}

export function removeWorkoutSet(
  workout: Workout,
  exerciseId: string,
  setId: string
) {

  const output =
    structuredClone(
      workout
    );

  const workoutExercise =
    output.exercises.find(
      entry =>
        entry.exerciseId ===
        exerciseId
    );

  if (
    !workoutExercise ||
    workoutExercise.sets
      .length <= 1
  ) {
    return workout;
  }

  workoutExercise.sets =
    workoutExercise.sets.filter(
      set =>
        set.id !== setId
    );

  workoutExercise.prescribedSets =
    workoutExercise.sets.length;

  output.version++;
  output.updatedAt =
    new Date().toISOString();

  return output;
}

export function reorderWorkoutExercise(
  workout: Workout,
  from: number,
  to: number
) {

  const output =
    structuredClone(
      workout
    );

  if (
    from < 0 ||
    to < 0 ||
    from >=
      output.exercises.length ||
    to >=
      output.exercises.length ||
    from === to
  ) {
    return workout;
  }

  const [exercise] =
    output.exercises.splice(
      from,
      1
    );

  if (!exercise) {
    return workout;
  }

  output.exercises.splice(
    to,
    0,
    exercise
  );

  output.exercises.forEach(
    (entry, index) => {
      entry.order =
        index;
    }
  );

  output.version++;
  output.updatedAt =
    new Date().toISOString();

  return output;
}

/* ============================================================
   EXERCISE REPLACEMENT
   ============================================================ */

/**
 * The one substitution-equivalence rule: a replacement carries the old prescription forward only when it moves the
 * same pattern, measures load the same way and has the same rep-range width. Anything else starts a new baseline.
 */
export function isEquivalentSubstitution(oldEx: Exercise, newEx: Exercise): boolean {
  return (
    oldEx.pattern === newEx.pattern &&
    oldEx.loadSemantics === newEx.loadSemantics &&
    oldEx.repRange[1] - oldEx.repRange[0] === newEx.repRange[1] - newEx.repRange[0]
  );
}

export function replaceWorkoutExercise(
  workout: Workout,
  oldId: string,
  newEx: Exercise,
  allExercises?: Exercise[]
) {

  const output =
    structuredClone(
      workout
    );

  const workoutExercise =
    output.exercises.find(
      entry =>
        entry.exerciseId ===
        oldId
    );

  const oldEx =
    allExercises?.find(
      exercise =>
        exercise.id ===
        oldId
    );

  if (
    !workoutExercise ||
    oldId === newEx.id
  ) {
    return workout;
  }

  const equivalent =
    oldEx
      ? isEquivalentSubstitution(oldEx, newEx)
      : false;

  const previousSets =
    workoutExercise.sets;

  workoutExercise.exerciseId =
    newEx.id;

  if (equivalent) {

    workoutExercise.sets =
      previousSets.map(
        set => ({
          ...set,
          id: uid('set'),
          completed: false,
          timestamp:
            undefined
        })
      );

  } else {

    workoutExercise.sets =
      Array.from(
        {
          length:
            previousSets.length
        },
        () =>
          makeSet(
            'working',
            newEx
          )
      );
  }

  workoutExercise.prescribedSets =
    workoutExercise.sets.length;

  workoutExercise.repRange =
    newEx.repRange;

  workoutExercise.recommendedWeight =
    equivalent
      ? sanitizeRecommendedLoad(
          newEx,
          workoutExercise
            .recommendedWeight
        )
      : undefined;

  workoutExercise.restSec =
    newEx.restSec;

  workoutExercise.replacementFrom =
    oldId;

  workoutExercise.baselineExerciseId =
    oldId;

  workoutExercise.status =
    'replaced';

  output.version++;
  output.updatedAt =
    new Date().toISOString();

  return output;
}

/* ============================================================
   SKIP / RESILIENCE
   ============================================================ */

/**
 * Ensure the persisted guided-session bookkeeping exists before changing it.
 *
 * Older APEX workouts may have a guided session without the Phase 7 arrays.
 * Recovery must upgrade that runtime state without rewriting the workout plan.
 */
function ensureGuidedSession(
  workout: Workout
) {
  const existing = workout.guidedSession;

  if (existing) {
    existing.completedSetIds ??= workout.exercises
      .flatMap(exercise => exercise.sets)
      .filter(set => set.completed)
      .map(set => set.id);

    existing.skippedSetIds ??= workout.exercises
      .flatMap(exercise => exercise.sets)
      .filter(set => set.disposition === 'skipped')
      .map(set => set.id);

    existing.skippedExerciseIds ??= workout.exercises
      .filter(exercise => exercise.status === 'skipped')
      .map(exercise => exercise.exerciseId);

    existing.pausedTotalSec ??= workout.pausedTotalSec ?? 0;
    existing.version ??= workout.version ?? 1;
    existing.updatedAt ??= workout.updatedAt;

    return existing;
  }

  const now = new Date().toISOString();

  workout.guidedSession = {
    phase: 'ready',
    exerciseIndex: 0,
    setIndex: 0,
    completedSetIds: workout.exercises
      .flatMap(exercise => exercise.sets)
      .filter(set => set.completed)
      .map(set => set.id),
    skippedSetIds: workout.exercises
      .flatMap(exercise => exercise.sets)
      .filter(set => set.disposition === 'skipped')
      .map(set => set.id),
    skippedExerciseIds: workout.exercises
      .filter(exercise => exercise.status === 'skipped')
      .map(exercise => exercise.exerciseId),
    pausedTotalSec: workout.pausedTotalSec ?? 0,
    updatedAt: now,
    version: workout.version ?? 1
  };

  return workout.guidedSession;
}

/**
 * Explicitly skip one set.
 *
 * A skipped set is NOT a missed workout and does not erase completed work.
 * It remains visible in history through its disposition.
 */
export function markWorkoutSetSkipped(
  workout: Workout,
  exerciseId: string,
  setId: string
) {
  const output = structuredClone(workout);

  const workoutExercise =
    output.exercises.find(
      entry => entry.exerciseId === exerciseId
    );

  const set =
    workoutExercise?.sets.find(
      entry => entry.id === setId
    );

  if (!workoutExercise || !set) {
    return workout;
  }

  if (set.completed) {
    return workout;
  }

  set.completed = false;
  set.disposition =
    set.disposition === 'skipped'
      ? 'not_started'
      : 'skipped';

  const guided = ensureGuidedSession(output);

  if (set.disposition === 'skipped') {
    if (!guided.skippedSetIds.includes(setId)) {
      guided.skippedSetIds.push(setId);
    }
  } else {
    guided.skippedSetIds =
      guided.skippedSetIds.filter(id => id !== setId);
  }

  guided.updatedAt = new Date().toISOString();
  guided.version = (guided.version || 0) + 1;

  output.version++;
  output.updatedAt = guided.updatedAt;

  return output;
}

/**
 * Explicitly skip an entire exercise.
 *
 * Existing completed sets are preserved. Unperformed sets are marked
 * skipped so the session assessment can distinguish intentional omission
 * from unfinished work.
 */
export function markWorkoutExerciseSkipped(
  workout: Workout,
  exerciseId: string
) {
  const output = structuredClone(workout);

  const workoutExercise =
    output.exercises.find(
      entry => entry.exerciseId === exerciseId
    );

  if (!workoutExercise) {
    return workout;
  }

  const guided = ensureGuidedSession(output);

  const currentlySkipped =
    workoutExercise.status === 'skipped';

  if (currentlySkipped) {
    workoutExercise.status = 'planned';

    guided.skippedExerciseIds =
      guided.skippedExerciseIds.filter(
        id => id !== exerciseId
      );

    for (const set of workoutExercise.sets) {
      if (!set.completed && set.disposition === 'skipped') {
        set.disposition = 'not_started';
        guided.skippedSetIds =
          guided.skippedSetIds.filter(
            id => id !== set.id
          );
      }
    }
  } else {
    workoutExercise.status = 'skipped';

    if (!guided.skippedExerciseIds.includes(exerciseId)) {
      guided.skippedExerciseIds.push(exerciseId);
    }

    for (const set of workoutExercise.sets) {
      if (!set.completed) {
        set.completed = false;
        set.disposition = 'skipped';

        if (!guided.skippedSetIds.includes(set.id)) {
          guided.skippedSetIds.push(set.id);
        }
      }
    }
  }

  guided.updatedAt = new Date().toISOString();
  guided.version = (guided.version || 0) + 1;

  output.version++;
  output.updatedAt = guided.updatedAt;

  return output;
}

/**
 * Reschedule a workout without converting it into a skipped or missed
 * workout.
 *
 * The original record becomes an immutable rescheduling event/history
 * record while the returned workout is a fresh planned occurrence.
 */
export function rescheduleWorkoutWithEvent(
  workout: Workout,
  date: string
) {
  const now = new Date().toISOString();

  const original = structuredClone(workout);
  original.status = 'rescheduled';
  original.updatedAt = now;
  original.version++;

  const replacement = createRescheduled(workout, date);

  return {
    original,
    replacement,
    event: {
      id: uid('evt'),
      type: 'workout_rescheduled',
      timestamp: now,
      payload: {
        workoutId: workout.id,
        originalDate: workout.scheduledDate,
        newDate: date,
        replacementWorkoutId: replacement.id
      }
    }
  };
}

/**
 * Mark an active session as paused at a persistence checkpoint.
 *
 * This helper does not depend on React or Capacitor and is therefore safe to
 * use from both UI lifecycle handling and recovery code.
 */
export function pauseWorkoutSession(
  workout: Workout,
  reason: 'user' | 'background' = 'user',
  at = new Date().toISOString()
) {
  const output = structuredClone(workout);
  const guided = ensureGuidedSession(output);

  if (output.status !== 'in_progress') {
    return output;
  }

  if (!output.pausedAt) {
    output.pausedAt = at;
    output.pausedTotalSec =
      output.pausedTotalSec ??
      guided.pausedTotalSec ??
      0;
  }

  guided.pausedAt = output.pausedAt;
  guided.pauseReason = reason;
  guided.lastCheckpointAt = at;
  guided.updatedAt = at;
  guided.pausedTotalSec = output.pausedTotalSec ?? 0;
  guided.version = (guided.version || 0) + 1;

  output.updatedAt = at;
  output.version++;

  return output;
}

/**
 * Resume a paused active session while preserving its exact guided position.
 */
export function resumeWorkoutSession(
  workout: Workout,
  at = new Date().toISOString()
) {
  const output = structuredClone(workout);
  const guided = ensureGuidedSession(output);

  if (output.status !== 'in_progress') {
    return output;
  }

  if (output.pausedAt) {
    const pausedMs =
      new Date(at).getTime() -
      new Date(output.pausedAt).getTime();

    if (Number.isFinite(pausedMs) && pausedMs > 0) {
      output.pausedTotalSec =
        (output.pausedTotalSec ?? 0) +
        Math.floor(pausedMs / 1000);
    }

    output.pausedAt = undefined;
  }

  guided.pausedAt = undefined;
  guided.pauseReason = undefined;
  guided.lastCheckpointAt = at;
  guided.updatedAt = at;
  guided.pausedTotalSec = output.pausedTotalSec ?? 0;
  guided.version = (guided.version || 0) + 1;

  output.updatedAt = at;
  output.version++;

  return output;
}

/**
 * Returns the safest persisted active-session snapshot.
 *
 * The function intentionally does not alter the workout. It is useful when
 * restoring an app after Android process reclamation: all position, timer
 * timestamps and set data already live inside the persisted workout.
 */
export function recoverWorkoutSession(
  workout: Workout
): Workout {
  const output = structuredClone(workout);

  if (output.status !== 'in_progress') {
    return output;
  }

  const guided = ensureGuidedSession(output);

  guided.completedSetIds = [
    ...new Set([
      ...guided.completedSetIds,
      ...output.exercises
        .flatMap(exercise => exercise.sets)
        .filter(set => set.completed)
        .map(set => set.id)
    ])
  ];

  guided.skippedSetIds = [
    ...new Set([
      ...guided.skippedSetIds,
      ...output.exercises
        .flatMap(exercise => exercise.sets)
        .filter(set => set.disposition === 'skipped')
        .map(set => set.id)
    ])
  ];

  guided.skippedExerciseIds = [
    ...new Set([
      ...guided.skippedExerciseIds,
      ...output.exercises
        .filter(exercise => exercise.status === 'skipped')
        .map(exercise => exercise.exerciseId)
    ])
  ];

  /*
   * Never advance the user's position during recovery. The exact exercise,
   * set, phase and timer timestamps are part of the persisted state.
   */
  guided.updatedAt = output.updatedAt || new Date().toISOString();
  return output;
}

/* ============================================================
   SESSION ASSESSMENT
   ============================================================ */

/**
 * A workout is only a real completed workout when at least one working (non-warm-up) set was logged.
 * A session that ended with zero logged sets is abandoned, never "completed".
 */
export function hasLoggedSets(workout: Workout): boolean {
  return workout.exercises.some(entry => entry.sets.some(isWorkingSet));
}

/** Mark a workout that ended without any logged set as abandoned (status "skipped"); it is not a completion. */
export function abandonWorkout(workout: Workout, at: string): Workout {
  return { ...workout, status: 'skipped', updatedAt: at };
}

export function sessionAssessment(
  workout: Workout,
  exercises: Exercise[],
  previous: Workout[]
) {

  const completed =
    workout.exercises.flatMap(
      workoutExercise =>
        workoutExercise.sets.filter(isWorkingSet)
    );

  const planned =
    workout.exercises.reduce(
      (
        sum,
        workoutExercise
      ) =>
        sum +
        workoutExercise.sets.filter(
          set =>
            set.disposition !== 'skipped' &&
            set.type !== 'warmup'
        ).length,
      0
    );

  const rirs =
    completed
      .map(
        set =>
          set.rir
      )
      .filter(
        (
          value
        ): value is number =>
          typeof value ===
            'number' &&
          Number.isFinite(value)
      );

  return {
    completedSets:
      completed.length,

    plannedSets:
      planned,

    completion:
      planned
        ? completed.length /
          planned
        : 0,

    volume:
      volumeForWorkout(
        workout,
        exercises
      ),

    avgRir:
      rirs.length
        ? rirs.reduce(
            (
              sum,
              value
            ) =>
              sum + value,
            0
          ) /
          rirs.length
        : undefined,

    skippedSets:
      workout.exercises.reduce(
        (sum, workoutExercise) =>
          sum +
          workoutExercise.sets.filter(
            set =>
              set.disposition === 'skipped'
          ).length,
        0
      ),

    skippedExercises:
      workout.exercises.filter(
        workoutExercise =>
          workoutExercise.status ===
          'skipped'
      ).length,

    achievements:
      detectAchievements(
        workout,
        exercises,
        previous
      ),

    skipped:
      workout.exercises.filter(
        workoutExercise =>
          workoutExercise.status ===
          'skipped'
      ).length
  };
}

/* ============================================================
   WORKOUT ADAPTATION
   ============================================================ */

/**
 * Prepare the NEXT planned workout from completed history. It does not decide anything itself: the load and rest
 * come from personalizedLoad() (the single authoritative prescription), so this can never disagree with what the
 * session screen recommends. `recent` is treated as completed history.
 */
export function applyWorkoutAdaptation(
  workout: Workout,
  exercises: Exercise[],
  recent: Workout[],
  profile?: UserProfile
) {

  const output =
    structuredClone(
      workout
    );

  const history =
    recent.map(item => ({ ...item, status: 'completed' as const }));

  for (
    const workoutExercise of
      output.exercises
  ) {

    const ex =
      exercises.find(
        exercise =>
          exercise.id ===
          workoutExercise.exerciseId
      );

    if (!ex) {
      continue;
    }

    const recommendation =
      personalizedLoad(
        ex,
        history,
        profile,
        exercises,
        workout.scheduledDate
      );

    if (
      recommendation.kind === 'baseline' &&
      recommendation.action !== undefined &&
      recommendation.action !== 'calibrate' &&
      recommendation.weight !== undefined
    ) {
      workoutExercise.recommendedWeight =
        recommendation.weight;
    }

    const programmed = programExercise(ex, profile?.primaryGoal);
    if (!workoutExercise.sets.some(set => set.completed)) {
      workoutExercise.repRange = programmed.repRange;
    }
    workoutExercise.restSec =
      recommendation.recommendedRest ?? programmed.restSec;
  }

  output.updatedAt =
    new Date().toISOString();

  return output;
}

/* ============================================================
   CUSTOM WORKOUTS / TEMPLATES
   ============================================================ */

export function createCustomWorkout(
  name: string,
  date: string,
  ids: string[],
  exercises: Exercise[],
  planId = 'custom'
): Workout {

  return createWorkout(
    name,
    date,
    ids,
    exercises,
    planId,
    'custom',
    1
  );
}

export function cloneTemplateWorkout(
  template: {
    name: string;
    exerciseIds: string[];
  },
  date: string,
  exercises: Exercise[]
): Workout {

  return createCustomWorkout(
    template.name,
    date,
    template.exerciseIds,
    exercises
  );
}

/* ============================================================
   PLAN VERSIONING
   ============================================================ */

export function planWithDays(
  plan: Plan,
  days: PlanDay[]
): Plan {

  const now =
    new Date().toISOString();

  return {
    ...structuredClone(
      plan
    ),

    days,

    version:
      plan.version + 1,

    updatedAt:
      now,

    history: [
      ...(plan.history || []),
      {
        version:
          plan.version,
        createdAt:
          now,
        reason:
          'Plan structure edited',
        days:
          structuredClone(
            plan.days
          )
      }
    ]
  };
}