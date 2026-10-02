/**
 * Ranked exercise selection for plan building.
 *
 * buildPlan needs one exercise for each movement pattern. This module chooses it. The choice is a deterministic
 * lexicographic ranking, not a weighted sum, so no factor can be traded against another by an arbitrary weight, and the
 * same inputs always give the same exercise. There is no randomness, no clock and no storage order: ties end at the id.
 *
 * Candidates are first filtered, never ranked down:
 *   - the exercise's pattern must equal the requested pattern (selection can never leave the pattern);
 *   - the exercise must fit the athlete's equipment (the one rule in exerciseGraph.ts: exerciseFitsEquipment).
 *
 * The remaining candidates are compared on these factors, in this order (a later factor only decides when every earlier
 * one ties). Higher is better unless stated:
 *   1. fit        equipment fit: usable now ('available') ahead of 'unknown' (athlete listed no equipment). Unusable is filtered.
 *   2. suitable   the exercise's catalogue difficulty is not above the athlete's experience (a beginner is not given an
 *                 intermediate lift while a beginner-level option exists).
 *   3. goal       goal compatibility. Strength and hypertrophy prefer movements whose load can be measured and progressed
 *                 (external load or assistance); every other goal is neutral, because the catalogue carries no metadata that
 *                 supports a preference for them.
 *   4. continuity the exercise is already in the athlete's plan for this pattern (context.incumbents: 2), or the catalogue
 *                 lists it as an alternative to one (1). A plan does not churn when the catalogue grows or the ranking is tuned.
 *   5. exposure   completed working-set sessions the athlete already has with it, so trained lifts keep their history.
 *   6. default    the catalogue's established default for the pattern (ESTABLISHED_DEFAULTS), 1 or 0. It sits after exposure, so an
 *                 athlete's own history outranks it, and ahead of everything below, so a new plan keeps the exercise each pattern
 *                 has always used unless an earlier factor says otherwise.
 *   7. coverage   1 when the exercise trains a primary muscle that no earlier pick in the same session set trains as a
 *                 primary muscle, else 0. It keeps a session from repeating itself. It is yes/no on purpose: counting muscles
 *                 would reward a longer muscle list, not a better exercise.
 *   8. progress   1 when the movement's load is measured (external load or assistance), so the progression engine can progress
 *                 it; every goal. It keeps a loadable movement ahead of a bodyweight one when everything above ties.
 *   9. relations  how many catalogue alternatives the athlete can use, so a well-connected movement is easier to swap.
 *                 Harder and easier variations (progressions, regressions) never influence selection: moving someone to a
 *                 different variation is a progression decision, not a plan-building one.
 *  10. light      fewer required pieces of equipment (lower is better).
 *  11. id         the exercise id, ascending. This is the final, total tie-break.
 *
 * Recovery and fatigue are deliberately not factors: check-ins never reach the prescription engine (src/engine/recovery.ts),
 * and the engine's one fatigue signal (workloadFatigue) describes a session, not an exercise.
 *
 * Nothing here changes a load, a rep range, a progression or a set count.
 */
import type { Exercise, Workout } from '../core/types';
import { equipmentFit, exerciseFitsEquipment, exerciseGraph, requiredEquipment } from './exerciseGraph';

/**
 * The exercise each movement pattern has always defaulted to (the first catalogue entry before ranking existed), named by
 * id so it no longer depends on the order the catalogue is written in. It is the baseline for a new plan, and it only
 * wins when the earlier factors (equipment fit, suitability, goal, continuity, exposure) tie.
 */
export const ESTABLISHED_DEFAULTS: Readonly<Record<string, string>> = {
  horizontal_push: 'machine_chest_press',
  vertical_pull: 'lat_pulldown',
  horizontal_pull: 'seated_cable_row',
  vertical_push: 'dumbbell_shoulder_press',
  arm_flexion: 'dumbbell_bicep_curl',
  arm_extension: 'cable_triceps_pushdown',
  shoulder_abduction: 'dumbbell_lateral_raise',
  squat: 'leg_press',
  hinge: 'romanian_deadlift',
  knee_flexion: 'leg_curl_machine',
  knee_extension: 'leg_extension',
  calf: 'calf_raise_machine',
  core: 'plank',
};

export const SELECTION_FACTORS = ['fit', 'suitable', 'goal', 'continuity', 'exposure', 'default', 'coverage', 'progress', 'relations', 'light', 'id'] as const;

export interface SelectionContext {
  /** The athlete's equipment. */
  equipment: readonly string[];
  /** beginner, intermediate or advanced; anything else is treated as beginner. */
  experience?: string;
  /** The primary goal. */
  goal?: string;
  /** Completed workouts, for prior exposure. */
  history?: readonly Pick<Workout, 'status' | 'exercises'>[];
  /** Exercise ids already in the athlete's plan; they win ties that would otherwise churn the plan. */
  incumbents?: readonly string[];
  /** Muscles already covered by earlier picks in the same session set. */
  covered?: readonly string[];
}

export interface RankedCandidate {
  exercise: Exercise;
  /** The ranking key, in SELECTION_FACTORS order without the id. Compared left to right, higher first (`light` is stored negated). */
  key: number[];
}

const EXPERIENCE_RANK: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const LOAD_MEASURED = new Set(['stack', 'total', 'per_hand', 'assistance']);

const experienceRank = (value: string | undefined) => EXPERIENCE_RANK[String(value)] ?? 0;
const sessionsWith = (history: SelectionContext['history'], id: string) =>
  (history ?? []).filter(
    w => w.status === 'completed' && w.exercises.some(e => e.exerciseId === id && e.sets.some(s => s.completed && s.type !== 'warmup')),
  ).length;

/** Every usable candidate for a pattern, best first. Ties end at the id, so the order is total and stable. */
export function rankForPattern(pattern: string, exercises: readonly Exercise[], context: SelectionContext): RankedCandidate[] {
  const graph = exerciseGraph(exercises);
  const equipment = [...context.equipment];
  const athlete = experienceRank(context.experience);
  const incumbents = new Set(context.incumbents ?? []);
  const established = ESTABLISHED_DEFAULTS[pattern];
  const covered = new Set(context.covered ?? []);
  const usable = (ex: Exercise) => exerciseFitsEquipment(ex, equipment);
  const measuredGoal = context.goal === 'strength' || context.goal === 'hypertrophy';

  return exercises
    .filter(ex => ex.pattern === pattern && usable(ex))
    .map(ex => {
      const related = new Set(graph.alternativesOf(ex.id).map(r => r.id));
      const connected = [...related].filter(id => {
        const other = exercises.find(e => e.id === id);
        return other !== undefined && usable(other);
      }).length;
      const nearIncumbent = [...incumbents].some(id => related.has(id));
      const key = [
        equipmentFit(ex, equipment.length ? equipment : undefined) === 'available' ? 2 : 1,
        experienceRank(ex.difficulty) <= athlete ? 1 : 0,
        !measuredGoal || LOAD_MEASURED.has(ex.loadSemantics) ? 1 : 0,
        incumbents.has(ex.id) ? 2 : nearIncumbent ? 1 : 0,
        sessionsWith(context.history, ex.id),
        ex.id === established ? 1 : 0,
        ex.primaryMuscles.some(m => !covered.has(m)) ? 1 : 0,
        LOAD_MEASURED.has(ex.loadSemantics) ? 1 : 0,
        connected,
        -requiredEquipment(ex).length,
      ];
      return { exercise: ex, key };
    })
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return b.key[i] - a.key[i];
      return a.exercise.id < b.exercise.id ? -1 : a.exercise.id > b.exercise.id ? 1 : 0;
    });
}

/** The single best exercise for a pattern, or undefined when nothing in that pattern fits the equipment. */
export function selectForPattern(pattern: string, exercises: readonly Exercise[], context: SelectionContext): Exercise | undefined {
  return rankForPattern(pattern, exercises, context)[0]?.exercise;
}
