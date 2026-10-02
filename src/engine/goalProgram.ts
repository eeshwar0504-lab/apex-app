import type {Exercise, Experience, GoalKind} from '../core/types';

/**
 * The ONE authoritative definition of goal-specific programming (see docs/TRAINING_SEMANTICS.md, "Goals").
 *
 *   GOAL -> goal program -> programmed exercise (rep range, rest) + target RIR -> progression engine -> workout
 *
 * A goal never decides a load: progression()/personalizedLoad() stay the only authority for that. A goal only sets the
 * TARGET the progression engine works against. The exercise catalogue stays the source of what an exercise supports:
 * a goal shifts the catalogue rep window (same width) and rest by bounded amounts, never replaces them, and never
 * produces an impossible range. Everything the athlete sees or the engine reads (rep range, rest) comes from
 * programExercise(), so plan building, prescription, progression, rest and the display cannot disagree.
 */
export interface GoalProgram {
  /** Reps added to (positive) or removed from (negative) the catalogue rep window of a compound lift. */
  compoundRepShift: number;
  /** The same for an isolation lift. */
  isolationRepShift: number;
  /** Seconds added to (positive) or removed from the catalogue rest of a compound lift. */
  compoundRestSec: number;
  /** The same for an isolation lift. */
  isolationRestSec: number;
  /** Reps in reserve added to the experience-based target (negative = harder). */
  rirOffset: number;
}

const NEUTRAL: GoalProgram = {compoundRepShift: 0, isolationRepShift: 0, compoundRestSec: 0, isolationRestSec: 0, rirOffset: 0};

export const GOAL_PROGRAMS: Readonly<Record<GoalKind, Readonly<GoalProgram>>> = {
  // general is the neutral baseline: the catalogue exactly as authored
  general: NEUTRAL,
  // the catalogue ranges (8-12 compound, 10-15 isolation) are already moderate, hypertrophy-oriented; the goal asks for
  // sets taken a little closer to failure
  hypertrophy: {...NEUTRAL, rirOffset: -1},
  // lower reps and longer rest on compound lifts only; isolation work is untouched
  strength: {...NEUTRAL, compoundRepShift: -3, compoundRestSec: 30},
  // resistance-training quality is preserved (same loads, reps and effort); only the rest between sets is shorter
  fat_loss: {...NEUTRAL, compoundRestSec: -15, isolationRestSec: -15},
  // slightly higher reps on compound lifts and a more conservative effort target
  fitness: {...NEUTRAL, compoundRepShift: 2, rirOffset: 1}
};

const COMPOUND_PATTERNS = new Set(['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'unilateral_squat']);
/** Movements measured by something other than reps at a load keep their catalogue prescription (time, no load, bodyweight). */
const FIXED_PRESCRIPTION = new Set(['time', 'none', 'bodyweight']);

const MIN_REPS = 3;
const MIN_REST_SEC = 45;
const MAX_REST_SEC = 300;

export function isGoalKind(value: unknown): value is GoalKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(GOAL_PROGRAMS, value);
}

/** The program for a goal; a missing or unknown goal is the neutral baseline (never an error). */
export function goalProgram(goal: unknown): Readonly<GoalProgram> {
  return isGoalKind(goal) ? GOAL_PROGRAMS[goal] : NEUTRAL;
}

export function isCompoundPattern(pattern: string): boolean {
  return COMPOUND_PATTERNS.has(pattern);
}

/**
 * The exercise as the given goal prescribes it. Idempotent and goal-switch safe: the catalogue values are remembered on
 * the copy, so programming an already programmed exercise for another goal starts from the catalogue again.
 * The catalogue object is never mutated.
 */
export function programExercise(ex: Exercise, goal: unknown): Exercise {
  const program = goalProgram(goal);
  const goalKey = isGoalKind(goal) ? goal : 'general';
  const baseReps: [number, number] = ex.catalogueRepRange ?? ex.repRange;
  const baseRest = ex.catalogueRestSec ?? ex.restSec;
  if (ex.programmedFor === goalKey) return ex;

  const compound = isCompoundPattern(ex.pattern);
  let repRange: [number, number] = [baseReps[0], baseReps[1]];
  if (!FIXED_PRESCRIPTION.has(ex.loadSemantics)) {
    const shift = compound ? program.compoundRepShift : program.isolationRepShift;
    const width = baseReps[1] - baseReps[0];
    const low = Math.max(Math.min(MIN_REPS, baseReps[0]), baseReps[0] + shift);
    repRange = [low, low + width];
  }
  const restDelta = compound ? program.compoundRestSec : program.isolationRestSec;
  const restSec = restDelta === 0 ? baseRest : Math.min(MAX_REST_SEC, Math.max(Math.min(MIN_REST_SEC, baseRest), baseRest + restDelta));

  if (goalKey === 'general' && repRange[0] === baseReps[0] && repRange[1] === baseReps[1] && restSec === baseRest && ex.catalogueRepRange === undefined) {
    return {...ex, programmedFor: goalKey};
  }
  return {...ex, repRange, restSec, catalogueRepRange: [baseReps[0], baseReps[1]], catalogueRestSec: baseRest, programmedFor: goalKey};
}

const programCache = new WeakMap<readonly Exercise[], Map<string, Exercise[]>>();

/** programExercise over a list, memoised so the same catalogue and goal always give the same array. */
export function programExercises(list: readonly Exercise[], goal: unknown): Exercise[] {
  const key = isGoalKind(goal) ? goal : 'general';
  let byGoal = programCache.get(list);
  if (!byGoal) { byGoal = new Map(); programCache.set(list, byGoal); }
  let programmed = byGoal.get(key);
  if (!programmed) { programmed = list.map(ex => programExercise(ex, key)); byGoal.set(key, programmed); }
  return programmed;
}

/** Target reps in reserve: the experience-based baseline shifted by the goal, bounded 1..3 (a beginner never below 2). */
export function goalTargetRir(goal: unknown, experience?: Experience | string): number {
  const base = experience === 'advanced' ? 1 : 2;
  const floor = experience === 'beginner' || experience === undefined ? 2 : 1;
  return Math.min(3, Math.max(floor, base + goalProgram(goal).rirOffset));
}
