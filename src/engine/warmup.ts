/**
 * Warm-up and ramp generation (Phase 13).
 *
 * Pure and deterministic: the same exercise, working load, profile and session context always give the same warm-up. No clock,
 * randomness, storage, network or AI. It adds no load system of its own: every load comes from the athlete's real load list or the
 * exercise's increment (snapToAvailableLoad), assistance keeps its meaning (more assistance is lighter), and an exercise with no
 * meaningful external load gets repetitions or nothing, never an invented weight.
 *
 * A warm-up is an ordinary SetLog with type 'warmup'. The engine already treats that type as "not training": isWorkingSet() is the
 * one filter, so warm-ups never reach progression evidence, longitudinal exposures, working-set history, volume, PRs, stall or
 * fatigue calculations, working-set completion counts or load recommendations. Nothing here changes a working set or a load.
 *
 * RULES. "rank" is how far up the athlete's own load choices the working load sits (the number of listed loads at or below it, or
 * working load / exercise increment when no list exists). Rank is what makes a load "heavy" or "light" without assuming any body
 * weight or universal plate set. Constants are in WARMUP_RULES; they are APEX product rules, not scientific constants.
 *   - time-based and no-load movements                          no warm-up                      (no_load)
 *   - working load unknown                                      no warm-up                      (no_working_load)
 *   - rank < 4 (light)                                          no warm-up                      (light_load)
 *   - compound, muscles not yet prepared this session
 *       rank >= 10 and a "total" load (barbell, leg press...)   3 ramp sets at 40%, 60%, 80%    (ramp)
 *       otherwise                                               2 ramp sets at 50%, 75%         (ramp)
 *   - compound, muscles already prepared by earlier exercises   1 ramp set at 70% when rank >= 8, else none (prepared)
 *   - isolation, muscles not prepared                           1 ramp set at 60% when rank >= 6 (isolation_prep), else none
 *   - isolation, muscles prepared                               none                            (prepared)
 *   - bodyweight, compound, not prepared                        1 movement-preparation set of half the bottom rep target, at least 5 reps
 *   - assisted, compound, not prepared                          1 set with 2 load steps MORE assistance (the existing step-down)
 * "Prepared" = every primary muscle of the exercise is a primary or secondary muscle of an earlier exercise in the same session.
 * A ramp load is the largest valid load at or below the percentage (so always under the working load), must be
 * above the previous ramp set (so no redundant sets), and on a barbell must not be below the athlete's known bar weight. A load that
 * cannot be made valid is dropped, not approximated. Ramp reps: 8 up to 50%, 6 up to 65%, 5 up to 75%, else 3 (never above the top
 * of the rep range).
 *
 * USER CONTROL. The athlete can complete, skip or edit a generated warm-up like any set; none of that touches the working
 * prescription (a warm-up's load edit stays on the set; it never becomes the exercise's recommended or working load).
 */
import type { Exercise, SetLog, UserProfile } from '../core/types';
import { programExercise } from './goalProgram';
import { loadAvailability, loadDetailForSet, loadStepsBelow, makeSet, snapToAvailableLoad } from './training';

export const WARMUP_RULES = {
  lightRank: 4,
  heavyTotalRank: 10,
  preparedRank: 8,
  isolationRank: 6,
  compoundFractions: [0.5, 0.75],
  heavyTotalFractions: [0.4, 0.6, 0.8],
  preparedFraction: 0.7,
  isolationFraction: 0.6,
  assistedSteps: 2,
  bodyweightMinReps: 5,
  /** Rest after a warm-up set, in seconds. */
  restSec: 45,
} as const;

const COMPOUND_PATTERNS = new Set(['squat', 'unilateral_squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull']);

export type WarmupReason = 'no_load' | 'no_working_load' | 'light_load' | 'prepared' | 'ramp' | 'isolation_prep' | 'movement_prep' | 'assisted_prep' | 'no_valid_load';

export interface WarmupSet {
  kind: 'ramp' | 'assisted' | 'movement';
  /** kg on the exercise's own scale: the load, or the assistance for an assisted movement. Absent for a repetition-only set. */
  load?: number;
  reps: number;
  /** Share of the working load for a ramp set. */
  fraction?: number;
}

export interface WarmupPrescription {
  sets: WarmupSet[];
  reason: WarmupReason;
}

export interface WarmupContext {
  /** Muscles the earlier exercises of this session have already worked (see preparedMuscles). */
  prepared?: readonly string[];
}

/** The muscles an exercise prepares for later exercises: its primary and secondary muscles. */
export function preparedMuscles(ex: Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles'>): string[] {
  return [...new Set([...ex.primaryMuscles, ...ex.secondaryMuscles])];
}

const repsFor = (fraction: number, top: number) => Math.min(top, fraction <= 0.5 ? 8 : fraction <= 0.65 ? 6 : fraction <= 0.75 ? 5 : 3);
const none = (reason: WarmupReason): WarmupPrescription => ({ sets: [], reason });

/** Position of the working load on the athlete's own load choices. */
function loadRank(ex: Exercise, working: number, profile?: UserProfile): number {
  const availability = loadAvailability(ex, profile);
  if (availability.options.length) return availability.options.filter(value => value <= working + 1e-9).length;
  const step = availability.incrementKg || (ex.incrementKg > 0 ? ex.incrementKg : 0.5);
  return Math.round(working / step);
}

/**
 * The warm-up for one exercise. `workingLoad` is the first working set's load (the assistance for an assisted movement). It is read
 * only; nothing is written back to it.
 */
export function warmupPrescription(
  catalogueEx: Exercise,
  workingLoad: number | undefined,
  profile?: UserProfile,
  context: WarmupContext = {}
): WarmupPrescription {
  const R = WARMUP_RULES;
  const ex = programExercise(catalogueEx, profile?.primaryGoal);
  const compound = COMPOUND_PATTERNS.has(ex.pattern);
  const prepared = new Set(context.prepared ?? []);
  const isPrepared = ex.primaryMuscles.length > 0 && ex.primaryMuscles.every(muscle => prepared.has(muscle));
  const low = ex.repRange[0];
  const top = ex.repRange[1];

  if (ex.loadSemantics === 'time' || ex.loadSemantics === 'none') return none('no_load');

  if (ex.loadSemantics === 'bodyweight') {
    if (!compound || isPrepared) return none(isPrepared ? 'prepared' : 'no_load');
    return { sets: [{ kind: 'movement', reps: Math.max(R.bodyweightMinReps, Math.ceil(low / 2)) }], reason: 'movement_prep' };
  }

  if (workingLoad === undefined || !Number.isFinite(workingLoad) || workingLoad < 0) return none('no_working_load');

  if (ex.loadSemantics === 'assistance') {
    if (!compound || isPrepared) return none(isPrepared ? 'prepared' : 'no_load');
    const assisted = loadStepsBelow(ex, workingLoad, R.assistedSteps, profile);
    if (assisted === undefined || !(assisted > workingLoad)) return none('no_valid_load');
    return { sets: [{ kind: 'assisted', load: assisted, reps: Math.max(R.bodyweightMinReps, Math.ceil(low * 0.6)) }], reason: 'assisted_prep' };
  }

  if (workingLoad <= 0) return none('no_working_load');
  const rank = loadRank(ex, workingLoad, profile);
  if (rank < R.lightRank) return none('light_load');

  let fractions: readonly number[];
  let reason: WarmupReason = 'ramp';
  if (compound && !isPrepared) fractions = rank >= R.heavyTotalRank && ex.loadSemantics === 'total' ? R.heavyTotalFractions : R.compoundFractions;
  else if (compound) { if (rank < R.preparedRank) return none('prepared'); fractions = [R.preparedFraction]; }
  else if (isPrepared) return none('prepared');
  else { if (rank < R.isolationRank) return none('light_load'); fractions = [R.isolationFraction]; reason = 'isolation_prep'; }

  const availability = loadAvailability(ex, profile);
  const step = availability.incrementKg || (ex.incrementKg > 0 ? ex.incrementKg : 0.5);
  const bar = ex.equipment.includes('barbell') && typeof profile?.barbellBarKg === 'number' && Number.isFinite(profile.barbellBarKg) ? profile.barbellBarKg : undefined;
  const sets: WarmupSet[] = [];
  let previous = 0;
  for (const fraction of fractions) {
    const raw = workingLoad * fraction;
    // largest valid load at or below the percentage: on the athlete's list, else a whole number of the exercise's increments
    const load = availability.options.length ? snapToAvailableLoad(ex, raw, profile, 'down') : Math.round(Math.floor(raw / step + 1e-9) * step * 100) / 100;
    if (load === undefined || !(load > 0)) continue;
    if (availability.options.length && load > raw + 1e-9) continue; // the list has nothing that light
    if (load <= previous + 1e-9) continue; // redundant
    if (bar !== undefined && load < bar - 1e-9) continue; // a barbell cannot be lighter than the bar
    sets.push({ kind: 'ramp', load, reps: repsFor(fraction, top), fraction });
    previous = load;
  }
  return sets.length ? { sets, reason } : none('no_valid_load');
}

/**
 * The generated warm-ups as set records (type 'warmup', not completed). Ids are deterministic from `idPrefix`. The load is stored
 * exactly as generated (never re-rounded, so a custom load stays valid) with its normal load detail.
 */
export function warmupSetLogs(catalogueEx: Exercise, prescription: WarmupPrescription, idPrefix: string, profile?: UserProfile): SetLog[] {
  const ex = programExercise(catalogueEx, profile?.primaryGoal);
  return prescription.sets.map((item, index) => {
    const set = makeSet('warmup', ex, item.load);
    set.id = `${idPrefix}-wu${index}`;
    set.reps = item.reps;
    if (item.load !== undefined && ex.loadSemantics !== 'assistance') {
      set.weight = item.load;
      set.loadDetail = loadDetailForSet(ex, item.load, ex.equipment.includes('barbell') && typeof profile?.barbellBarKg === 'number' ? { kind: 'barbell', barWeightKg: profile.barbellBarKg } : undefined);
    }
    return set;
  });
}

/**
 * Plans a whole session in order: each exercise is warmed up given what the exercises before it already prepared. Skipped exercises
 * prepare nothing. The planner only reads loads and returns new set records; the session decides when to apply them.
 */
export function createWarmupPlanner(profile?: UserProfile) {
  const prepared = new Set<string>();
  return {
    next(ex: Exercise, workingLoad: number | undefined, idPrefix: string, skipped = false): SetLog[] {
      if (skipped) return [];
      const sets = warmupSetLogs(ex, warmupPrescription(ex, workingLoad, profile, { prepared: [...prepared] }), idPrefix, profile);
      preparedMuscles(ex).forEach(muscle => prepared.add(muscle));
      return sets;
    },
  };
}
