/**
 * Longitudinal exercise progression (Phase 11).
 *
 * training.ts decides a session's load (progression() and personalizedLoad()). This module adds the longer view: how an
 * exercise has been going across sessions. It is pure and deterministic: no clock, no randomness, no storage, no AI. The
 * state is DERIVED from the workout history every time (nothing is persisted), so it can never disagree with the history and
 * a past workout is never rewritten.
 *
 * The module never calculates a load. It classifies where the athlete is (the transition table below) and may name a
 * variation from the exercise graph. Increments, snapping to available loads, assisted and timed semantics, custom loads and
 * the return-to-training gap rule all stay in training.ts. The Coach and the AI may read the decision; they cannot change it.
 *
 * STATE (per exercise, derived from `Exposure`s: one per training day the exercise was worked):
 *   - an exposure is `progressed` when its best load is harder than the previous exposure's (higher; LOWER assistance), or the
 *     load is equal and the best performance (reps, or seconds for timed movements) is higher;
 *   - `regressed` when the load is easier, or equal with lower performance; `flat` when nothing changed;
 *   - an exposure that follows a gap the return-to-training rule treats as a break (RETURN_GAP_DAYS.twoWeek) is `reentry`:
 *     it starts a new run and is never counted as a stall. The first exposure is the `baseline`.
 *   - consecutiveStalls = trailing exposures that are `regressed` or `flat`, back to the last progressed/reentry/baseline one.
 *
 * TRANSITION TABLE (first matching row wins; every row has one reason code):
 *   1. no exposure yet                                              CONTINUE            first_exposure
 *   2. the return-to-training rule applies (gap >= 14 days)         CONSERVATIVE_REENTRY return_to_training
 *   3. elevated workload AND (base action is `recover` OR stalls >= 3)   RECOVER         recovery_hold
 *      ("elevated" is the workload spike OR the Phase 12 fatigue level HIGH / RECOVERY_REQUIRED, see fatigue.ts)
 *   4. base action is `increase` AND a higher load exists           PROGRESS            progressed
 *   5. stalls >= 5 AND the stalls span >= 14 days AND a variation is valid   CONSIDER_VARIATION variation_available
 *   6. stalls >= 5 AND the stalls span >= 14 days                   PLATEAU             persistent_plateau
 *   7. stalls >= 3                                                  PLATEAU             repeated_stall
 *   8. base action is `increase` but the load list has no higher load  HOLD             load_ceiling
 *   9. stalls == 2                                                  HOLD                temporary_hold
 *  10. stalls == 1 AND (base action is `reduce` OR the exposure was below the range)  HOLD held_after_low_performance
 *  11. stalls == 1                                                  HOLD                isolated_stall
 *  12. timed movement with no stall                                 HOLD                timed_hold
 *  13. otherwise                                                    CONTINUE            continuing
 * A plateau needs repeated evidence: 3 exposures on 3 different days (an exposure is one day), and "persistent" additionally
 * needs 5 exposures spread over at least two weeks. One poor session is an isolated stall, two are a temporary hold. Soreness
 * and recovery never create a plateau: the stall count reads performance only; elevated workload can only defer the verdict (row 3).
 *
 * VARIATION (only from rows 5 and 6, so a variation existing is never a reason by itself). Candidates keep the movement
 * pattern, fit the athlete's equipment, and are not harder than the athlete's experience. First applicable rule wins:
 *   V1 harder_variation       the athlete cannot add load (the load list is at its top, or the movement has no load) and the
 *                             last exposure reached the top of the range -> a progression edge from the exercise graph;
 *   V2 easier_variation       the last two exposures were below the range -> a regression edge;
 *   V3 alternative_variation  otherwise, or when V1/V2 have no candidate -> a catalogue alternative that keeps the prescription
 *                             meaningful (isEquivalentSubstitution), the one the athlete has trained least, then id.
 * No candidate means no variation is invented: the decision stays PLATEAU (persistent_plateau) on its hold behaviour.
 */
import type { Exercise } from '../core/types';
import { exerciseFitsEquipment, exerciseGraph, isEquivalentSubstitution } from './exerciseGraph';

export const LONGITUDINAL_THRESHOLDS = {
  /** Trailing non-progressing exposures that make a repeated stall (a plateau). */
  repeatedStall: 3,
  /** Trailing non-progressing exposures that make a persistent plateau... */
  persistentStall: 5,
  /** ...when they also span at least this many days. */
  persistentSpanDays: 14,
  /** Consecutive exposures below the range that make "repeated failure" (an easier variation). */
  repeatedLow: 2,
} as const;

export type LongitudinalOutcome =
  | 'CONTINUE'
  | 'PROGRESS'
  | 'HOLD'
  | 'PLATEAU'
  | 'CONSIDER_VARIATION'
  | 'RECOVER'
  | 'CONSERVATIVE_REENTRY';

export type LongitudinalReason =
  | 'first_exposure'
  | 'return_to_training'
  | 'recovery_hold'
  | 'progressed'
  | 'variation_available'
  | 'persistent_plateau'
  | 'repeated_stall'
  | 'load_ceiling'
  | 'temporary_hold'
  | 'held_after_low_performance'
  | 'isolated_stall'
  | 'timed_hold'
  | 'continuing';

export type BaseAction = 'calibrate' | 'increase' | 'hold' | 'reduce' | 'recover';
export type ExposureKind = 'baseline' | 'progressed' | 'regressed' | 'flat' | 'reentry';

/** One training day of one exercise. Built by training.ts from completed working sets. */
export interface Exposure {
  /** Local calendar day number (dates.dayNumber). */
  day: number;
  /** Best load of the day (highest; LOWEST assistance). Undefined for bodyweight and timed movements. */
  load?: number;
  /** Best performance at that load: reps, or seconds for a timed movement. */
  topPerformance: number;
  /** The last (up to three) sets were all at or above the top of the range, with at least two sets. */
  atTop: boolean;
  /** At least two of the last three sets were below the bottom of the range. */
  low: boolean;
  /** Average reps in reserve over the day's sets that logged it. */
  avgRir?: number;
  /** The day follows a gap the return-to-training rule treats as a break. */
  afterGap: boolean;
}

export interface ProgressionState {
  exposures: number;
  progressions: number;
  consecutiveStalls: number;
  /** Days from the anchor exposure (last progressed/reentry/baseline) to the latest exposure. */
  stallSpanDays: number;
  /** Trailing exposures below the range. */
  consecutiveLow: number;
  peakLoad?: number;
  lastLoad?: number;
  lastTopPerformance?: number;
  lastAtTop: boolean;
  lastLow: boolean;
  /** Average RIR over the last three exposures that logged one. */
  recentAvgRir?: number;
  direction: 'none' | 'up' | 'flat' | 'down';
  /** Exposures the athlete has to the catalogue's alternatives for this exercise: the variation history (read only by rule V3). */
  related: { exerciseId: string; exposures: number }[];
}

export interface VariationChoice {
  exerciseId: string;
  kind: 'harder' | 'easier' | 'alternative';
  rule: 'harder_variation' | 'easier_variation' | 'alternative_variation';
}

export interface LongitudinalDecision {
  outcome: LongitudinalOutcome;
  reason: LongitudinalReason;
  explanation: string;
  state: ProgressionState;
  /** Present only for CONSIDER_VARIATION. Advisory: nothing is swapped automatically. */
  variation?: VariationChoice;
}

const EXPLANATIONS: Record<LongitudinalReason, string> = {
  first_exposure: 'No completed work on this exercise yet, so there is no longitudinal evidence. Establish a baseline.',
  return_to_training: 'A training gap of two weeks or more applies the return-to-training rule: restart conservatively before normal progression resumes.',
  recovery_hold: 'Recent training load is elevated (a workload spike, or the fatigue model says HIGH). Hold the current load; a plateau is not judged while fatigue is elevated.',
  progressed: 'Performance supports progression: the existing progression rule adds one increment.',
  variation_available: 'Progress has stalled for five or more sessions over at least two weeks, and the exercise graph offers a valid variation.',
  persistent_plateau: 'Progress has stalled for five or more sessions over at least two weeks and no valid variation exists. Keep the current load and build repeatable work.',
  repeated_stall: 'Progress has stalled for three or more sessions on different days. Hold the load and build repeatable performance before changing anything.',
  load_ceiling: 'Performance supports progression, but the configured load list has no higher load. Hold the top available load.',
  temporary_hold: 'Two sessions without progress. Hold the load; this is not yet a plateau.',
  held_after_low_performance: 'The last session was below the target range. Hold (or reduce, as the progression rule decides) before trying to progress.',
  isolated_stall: 'One session without progress. Repeat the load; a single session is not evidence of a plateau.',
  timed_hold: 'Timed movement: APEX tracks duration and never adds or removes load. Keep building repeatable holds.',
  continuing: 'Performance is still improving or building inside the target range. Continue as prescribed.',
};

const GAP_CLOSE = 1e-9;
const EXPERIENCE_RANK: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const difficultyRank = (value: string | undefined) => EXPERIENCE_RANK[String(value)] ?? 0;
const byId = (a: Exercise, b: Exercise) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** How one exposure compares with the one before it. */
export function classifyExposure(previous: Exposure, current: Exposure, assisted: boolean): ExposureKind {
  if (current.afterGap) return 'reentry';
  if (previous.load !== undefined && current.load !== undefined && Math.abs(current.load - previous.load) > GAP_CLOSE) {
    const harder = assisted ? current.load < previous.load : current.load > previous.load;
    return harder ? 'progressed' : 'regressed';
  }
  if (current.topPerformance > previous.topPerformance) return 'progressed';
  if (current.topPerformance < previous.topPerformance) return 'regressed';
  return 'flat';
}

/** The kind of every exposure, in order: the first is the baseline. */
export function exposureKinds(exposures: readonly Exposure[], assisted: boolean): ExposureKind[] {
  return exposures.map((e, i) => (i === 0 ? 'baseline' : classifyExposure(exposures[i - 1], e, assisted)));
}

/** Derives the progression state from chronological exposures. */
export function deriveProgressionState(
  exposures: readonly Exposure[],
  options: { assisted?: boolean; related?: { exerciseId: string; exposures: number }[] } = {},
): ProgressionState {
  const assisted = options.assisted === true;
  const n = exposures.length;
  const kinds = exposureKinds(exposures, assisted);
  let k = n - 1;
  let stalls = 0;
  while (k >= 1 && (kinds[k] === 'regressed' || kinds[k] === 'flat')) { stalls++; k--; }
  let low = 0;
  for (let i = n - 1; i >= 0 && exposures[i].low; i--) low++;
  const loads = exposures.map(e => e.load).filter((v): v is number => v !== undefined);
  const rirs = exposures.slice(-3).map(e => e.avgRir).filter((v): v is number => v !== undefined);
  const last = exposures[n - 1];
  const lastKind = n ? kinds[n - 1] : undefined;
  return {
    exposures: n,
    progressions: kinds.filter(kind => kind === 'progressed').length,
    consecutiveStalls: stalls,
    stallSpanDays: stalls && k >= 0 ? last.day - exposures[k].day : 0,
    consecutiveLow: low,
    ...(loads.length ? { peakLoad: assisted ? Math.min(...loads) : Math.max(...loads) } : {}),
    ...(last?.load !== undefined ? { lastLoad: last.load } : {}),
    ...(last ? { lastTopPerformance: last.topPerformance } : {}),
    lastAtTop: last?.atTop === true,
    lastLow: last?.low === true,
    ...(rirs.length ? { recentAvgRir: rirs.reduce((a, b) => a + b, 0) / rirs.length } : {}),
    direction: lastKind === undefined ? 'none' : lastKind === 'progressed' ? 'up' : lastKind === 'regressed' ? 'down' : 'flat',
    related: [...(options.related ?? [])].sort((a, b) => (a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : 0)),
  };
}

export interface VariationInput {
  exercise: Exercise;
  catalogue: readonly Exercise[];
  state: ProgressionState;
  equipment: readonly string[];
  experience?: string;
  /** The configured load list has no higher load (or, for assistance, no lower one). */
  atCeiling: boolean;
}

/** The variation the rules above name, or undefined. Pure; never applied. */
export function selectVariation(input: VariationInput): VariationChoice | undefined {
  const { exercise: ex, catalogue, state } = input;
  const athlete = difficultyRank(input.experience);
  const usable = (c: Exercise) => c.id !== ex.id && c.pattern === ex.pattern && exerciseFitsEquipment(c, [...input.equipment]) && difficultyRank(c.difficulty) <= athlete;
  const graph = exerciseGraph(catalogue);
  const unloaded = ex.loadSemantics === 'bodyweight' || ex.loadSemantics === 'none' || ex.loadSemantics === 'time';
  const exposuresOf = (id: string) => state.related.find(r => r.exerciseId === id)?.exposures ?? 0;
  const byDifficultyThenId = (a: Exercise, b: Exercise) => difficultyRank(a.difficulty) - difficultyRank(b.difficulty) || byId(a, b);

  if ((input.atCeiling || unloaded) && state.lastAtTop) {
    const harder = graph.progressionsOf(ex.id).filter(usable).sort(byDifficultyThenId)[0];
    if (harder) return { exerciseId: harder.id, kind: 'harder', rule: 'harder_variation' };
  }
  if (state.consecutiveLow >= LONGITUDINAL_THRESHOLDS.repeatedLow) {
    const easier = graph.regressionsOf(ex.id).filter(usable).sort(byId)[0];
    if (easier) return { exerciseId: easier.id, kind: 'easier', rule: 'easier_variation' };
  }
  const alternative = graph
    .alternativesOf(ex.id)
    .filter(c => usable(c) && isEquivalentSubstitution(ex, c))
    .sort((a, b) => exposuresOf(a.id) - exposuresOf(b.id) || byId(a, b))[0];
  return alternative ? { exerciseId: alternative.id, kind: 'alternative', rule: 'alternative_variation' } : undefined;
}

export interface TransitionInput {
  state: ProgressionState;
  /** What progression() decided for this session. */
  baseAction: BaseAction;
  /** The return-to-training rule's steps for the gap to the prescribed date (0 = short gap). */
  returnSteps: number;
  fatigue: 'low' | 'normal' | 'elevated';
  timed: boolean;
  atCeiling: boolean;
  /** The variation selectVariation found, if any; only read by rows 5 and 6. */
  variation?: VariationChoice;
}

/** The one transition function. See the table at the top of this file. */
export function transition(input: TransitionInput): LongitudinalDecision {
  const { state, baseAction } = input;
  const T = LONGITUDINAL_THRESHOLDS;
  const done = (outcome: LongitudinalOutcome, reason: LongitudinalReason, variation?: VariationChoice): LongitudinalDecision => ({
    outcome, reason, explanation: EXPLANATIONS[reason], state, ...(variation ? { variation } : {}),
  });
  const persistent = state.consecutiveStalls >= T.persistentStall && state.stallSpanDays >= T.persistentSpanDays;

  if (state.exposures === 0) return done('CONTINUE', 'first_exposure');
  if (input.returnSteps > 0) return done('CONSERVATIVE_REENTRY', 'return_to_training');
  if (input.fatigue === 'elevated' && (baseAction === 'recover' || state.consecutiveStalls >= T.repeatedStall)) return done('RECOVER', 'recovery_hold');
  if (baseAction === 'increase' && !input.atCeiling) return done('PROGRESS', 'progressed');
  if (persistent && input.variation) return done('CONSIDER_VARIATION', 'variation_available', input.variation);
  if (persistent) return done('PLATEAU', 'persistent_plateau');
  if (state.consecutiveStalls >= T.repeatedStall) return done('PLATEAU', 'repeated_stall');
  if (baseAction === 'increase') return done('HOLD', 'load_ceiling');
  if (state.consecutiveStalls === 2) return done('HOLD', 'temporary_hold');
  if (state.consecutiveStalls === 1) return done('HOLD', baseAction === 'reduce' || state.lastLow ? 'held_after_low_performance' : 'isolated_stall');
  if (input.timed) return done('HOLD', 'timed_hold');
  return done('CONTINUE', 'continuing');
}

/** True when the plateau rows could apply, so the variation search is only run when its result can be used. */
export function plateauIsPersistent(state: ProgressionState): boolean {
  return state.consecutiveStalls >= LONGITUDINAL_THRESHOLDS.persistentStall && state.stallSpanDays >= LONGITUDINAL_THRESHOLDS.persistentSpanDays;
}
