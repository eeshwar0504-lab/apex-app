/**
 * Fatigue, deload and recovery status (Phase 12).
 *
 * Pure and deterministic: no clock, randomness, storage or AI. Everything is DERIVED from the training history (and the list of
 * deload start days the athlete accepted), so there is no fatigue state to drift out of sync. Recovery check-ins are NOT inputs:
 * they stay evidence for the Coach (src/engine/recovery.ts). Nothing here is medical: it never diagnoses, infers illness or
 * claims anything about the body. Every threshold below is an APEX product rule, not a medical or scientific constant.
 *
 * SIGNALS, as of a day D (windows end on D):
 *   load signals
 *     workload   the last 7 days' volume against the mean weekly volume of the (up to) 21 days before them (needs >= 2 sessions and
 *                at least 14 days of history in that baseline, so a newcomer's ramp-up is not a spike). ratio >= 1.5 -> 2 points, >= 1.3 -> 1 point. The existing single-session spike (the latest session is
 *                more than 25% above the one before it, see workloadFatigue) is kept: it gives 1 point when the ratio gives none.
 *     effort     3 or more sessions in the last 14 days whose rated working sets (at least 3) averaged RIR <= 0.5 -> 1 point
 *     density    6 or more sessions in the last 7 days -> 1 point
 *   performance signals (they only count when at least one load signal is present, so a plateau alone is never fatigue)
 *     stalls     2 or more exercises trained in the last 14 days with 3+ consecutive non-progressing exposures -> 1 point
 *     decline    at least 4 comparable exposures in the last 14 days and at least half of them regressed -> 1 point
 *
 * FATIGUE STATE (score = total points):
 *   NORMAL             score 0
 *   ELEVATED           score 1 or 2 (one unusual workout reaches this at most)
 *   HIGH               score >= 3
 *   RECOVERY_REQUIRED  HIGH on D and HIGH on D - 7 (sustained: it cannot come from one unusual week)
 * Entry and exit are by these rules only; because every window is 7 to 28 days wide, one quiet or one hard day cannot flip a
 * state back and forth. Leaving RECOVERY_REQUIRED happens through the deload (below) or by the evidence falling under 3.
 *
 * DELOAD STATUS (first match wins):
 *   deload_active       an accepted deload started within the last 7 days (DELOAD_DAYS)
 *   recovery_complete   the 7 days after an accepted deload ended: normal training with no load increase (see resume rule)
 *   deload_recommended  RECOVERY_REQUIRED, at least 6 sessions in the last 28 days, and no deload ended in the last 14 days
 *   sustained_fatigue   HIGH with ELEVATED or worse a week earlier (or RECOVERY_REQUIRED but not recommendable yet)
 *   temporary_fatigue   ELEVATED, or HIGH that is new
 *   normal              NORMAL
 * A deload is never started by the engine alone: the athlete accepts a recommendation (startDeload), and only then does the
 * prescription change.
 *
 * DELOAD PRESCRIPTION (only while deload_active; established prescription concepts only):
 *   load   2 load steps below the last worked load, using the existing step rule (the athlete's own load list; assistance goes UP)
 *   sets   one fewer working set per exercise, never below 1
 *   effort target RIR + 2, at most 5
 * Exercises, patterns, equipment, goal programming, rep ranges, timed movements and warm-ups are unchanged. Sessions inside a
 * deload window are not progression evidence (they are lighter on purpose), and the window is a function of the stored start day,
 * so no workout or set log is ever edited.
 *
 * RESUME: for 7 days after a deload an increase is not prescribed (the load that was last worked normally is repeated); then normal
 * progression returns. If the existing return-to-training rule applies, it decides the load and the deload does not stack on it.
 *
 * TREND: improving / steady / worsening from the score now against the score a week earlier. Status information only.
 */

export type FatigueLevel = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'RECOVERY_REQUIRED';
export type DeloadStatus = 'normal' | 'temporary_fatigue' | 'sustained_fatigue' | 'deload_recommended' | 'deload_active' | 'recovery_complete';
export type RecoveryTrend = 'improving' | 'steady' | 'worsening';
export type FatigueReason = 'workload_spike' | 'workload_ratio_high' | 'workload_ratio_very_high' | 'repeated_high_effort' | 'dense_week' | 'repeated_stalls' | 'performance_declining';

export const FATIGUE_RULES = {
  recentDays: 7,
  baselineDays: 21,
  baselineMinSessions: 2,
  baselineMinDays: 14,
  ratioElevated: 1.3,
  ratioVeryHigh: 1.5,
  spikeRatio: 1.25,
  effortWindowDays: 14,
  effortSessions: 3,
  effortMinRatedSets: 3,
  effortMaxAvgRir: 0.5,
  denseSessions: 6,
  performanceWindowDays: 14,
  stalledExposures: 3,
  stalledExercises: 2,
  declineMinExposures: 4,
  declineShare: 0.5,
  highScore: 3,
  sustainedLookbackDays: 7,
  recommendWindowDays: 28,
  recommendMinSessions: 6,
  deloadDays: 7,
  resumeDays: 7,
  cooldownDays: 14,
  loadSteps: 2,
  setsRemoved: 1,
  rirAdded: 2,
  maxRir: 5,
} as const;

/** One completed session. `day` is a local calendar day number (dates.dayNumber). */
export interface SessionRecord {
  day: number;
  volume: number;
  /** Average RIR over working sets that logged one, and how many did. */
  avgRir?: number;
  ratedSets: number;
}

/** One exercise's exposures (one per training day), already classified by longitudinal.classifyExposure. */
export interface ExercisePerformance {
  exerciseId: string;
  exposures: { day: number; kind: 'baseline' | 'progressed' | 'regressed' | 'flat' | 'reentry' }[];
}

export interface FatigueSignals {
  workloadPoints: number;
  effortPoints: number;
  densityPoints: number;
  stallPoints: number;
  declinePoints: number;
  /** Points that actually count (performance points need a load signal). */
  score: number;
  reasons: FatigueReason[];
}

export interface FatigueAssessment {
  asOf: number;
  level: FatigueLevel;
  score: number;
  /** The level and score a week earlier. */
  previousLevel: FatigueLevel;
  previousScore: number;
  trend: RecoveryTrend;
  signals: FatigueSignals;
  status: DeloadStatus;
  /** The start day of the deload that is active or just ended, if any. */
  deloadStart?: number;
  /** Days left of an active deload / of the resume window. */
  daysLeft?: number;
  sessionsLast28: number;
}

const inWindow = (day: number, asOf: number, days: number) => day <= asOf && day > asOf - days;

/** Signals as of `asOf`, using only records on or before it. */
export function fatigueSignals(sessions: readonly SessionRecord[], performance: readonly ExercisePerformance[], asOf: number): FatigueSignals {
  const R = FATIGUE_RULES;
  const known = sessions.filter(s => s.day <= asOf).sort((a, b) => a.day - b.day);
  const reasons: FatigueReason[] = [];

  const recent = known.filter(s => inWindow(s.day, asOf, R.recentDays));
  const baseline = known.filter(s => s.day <= asOf - R.recentDays && s.day > asOf - R.recentDays - R.baselineDays);
  let workloadPoints = 0;
  // the baseline spans only the weeks the athlete has actually trained (at least two), so a newcomer's ramp-up is not a spike
  const firstDay = known[0]?.day ?? asOf;
  const baselineSpan = Math.min(R.baselineDays, asOf - R.recentDays - firstDay + 1);
  if (baseline.length >= R.baselineMinSessions && baselineSpan >= R.baselineMinDays) {
    const weekly = baseline.reduce((a, s) => a + s.volume, 0) / (baselineSpan / R.recentDays);
    const ratio = weekly > 0 ? recent.reduce((a, s) => a + s.volume, 0) / weekly : 0;
    if (ratio >= R.ratioVeryHigh) { workloadPoints = 2; reasons.push('workload_ratio_very_high'); }
    else if (ratio >= R.ratioElevated) { workloadPoints = 1; reasons.push('workload_ratio_high'); }
  }
  const last = known.at(-1);
  const before = known.at(-2);
  if (workloadPoints === 0 && last && before && inWindow(last.day, asOf, R.recentDays) && before.volume > 0 && last.volume > before.volume * R.spikeRatio) {
    workloadPoints = 1;
    reasons.push('workload_spike');
  }

  const hard = known.filter(s => inWindow(s.day, asOf, R.effortWindowDays) && s.ratedSets >= R.effortMinRatedSets && s.avgRir !== undefined && s.avgRir <= R.effortMaxAvgRir);
  const effortPoints = hard.length >= R.effortSessions ? 1 : 0;
  if (effortPoints) reasons.push('repeated_high_effort');

  const densityPoints = recent.length >= R.denseSessions ? 1 : 0;
  if (densityPoints) reasons.push('dense_week');

  const trained = performance
    .map(p => ({ id: p.exerciseId, list: p.exposures.filter(e => e.day <= asOf).sort((a, b) => a.day - b.day) }))
    .filter(p => p.list.some(e => inWindow(e.day, asOf, R.performanceWindowDays)));
  const stalled = trained.filter(p => {
    let n = 0;
    for (let i = p.list.length - 1; i >= 1 && (p.list[i].kind === 'regressed' || p.list[i].kind === 'flat'); i--) n++;
    return n >= R.stalledExposures;
  }).length;
  const comparable = trained.flatMap(p => p.list.filter(e => inWindow(e.day, asOf, R.performanceWindowDays) && e.kind !== 'baseline' && e.kind !== 'reentry'));
  const stallPoints = stalled >= R.stalledExercises ? 1 : 0;
  const declinePoints = comparable.length >= R.declineMinExposures && comparable.filter(e => e.kind === 'regressed').length / comparable.length >= R.declineShare ? 1 : 0;

  const loadPoints = workloadPoints + effortPoints + densityPoints;
  // a plateau or decline alone is a progression matter, not fatigue
  const performancePoints = loadPoints > 0 ? stallPoints + declinePoints : 0;
  if (performancePoints && stallPoints) reasons.push('repeated_stalls');
  if (performancePoints && declinePoints) reasons.push('performance_declining');
  return { workloadPoints, effortPoints, densityPoints, stallPoints, declinePoints, score: loadPoints + performancePoints, reasons };
}

const levelOf = (score: number): 'NORMAL' | 'ELEVATED' | 'HIGH' => (score >= FATIGUE_RULES.highScore ? 'HIGH' : score >= 1 ? 'ELEVATED' : 'NORMAL');

/** The deload that is active on `asOf`, or the most recent one that has ended, from the accepted start days. */
function deloadWindow(starts: readonly number[], asOf: number): { start: number; ended: boolean } | undefined {
  const past = starts.filter(s => s <= asOf).sort((a, b) => a - b);
  const start = past.at(-1);
  if (start === undefined) return undefined;
  return { start, ended: asOf >= start + FATIGUE_RULES.deloadDays };
}

/** The whole assessment: level, trend, deload status. `deloadStarts` are day numbers of accepted deloads. */
export function assessFatigue(sessions: readonly SessionRecord[], performance: readonly ExercisePerformance[], asOf: number, deloadStarts: readonly number[] = []): FatigueAssessment {
  const R = FATIGUE_RULES;
  const now = fatigueSignals(sessions, performance, asOf);
  const week = fatigueSignals(sessions, performance, asOf - R.sustainedLookbackDays);
  const nowLevel = levelOf(now.score);
  const weekLevel = levelOf(week.score);
  const level: FatigueLevel = nowLevel === 'HIGH' && weekLevel === 'HIGH' ? 'RECOVERY_REQUIRED' : nowLevel;
  const previousLevel: FatigueLevel = weekLevel;
  const trend: RecoveryTrend = now.score < week.score ? 'improving' : now.score > week.score ? 'worsening' : 'steady';
  const sessionsLast28 = sessions.filter(s => inWindow(s.day, asOf, R.recommendWindowDays)).length;

  const window = deloadWindow(deloadStarts, asOf);
  const base = { asOf, level, score: now.score, previousLevel, previousScore: week.score, trend, signals: now, sessionsLast28 };
  if (window && !window.ended) return { ...base, status: 'deload_active', deloadStart: window.start, daysLeft: window.start + R.deloadDays - asOf };
  const sinceEnd = window ? asOf - (window.start + R.deloadDays) : undefined;
  if (window && sinceEnd !== undefined && sinceEnd < R.resumeDays) return { ...base, status: 'recovery_complete', deloadStart: window.start, daysLeft: R.resumeDays - sinceEnd };
  const cooling = sinceEnd !== undefined && sinceEnd < R.cooldownDays;
  if (level === 'RECOVERY_REQUIRED' && sessionsLast28 >= R.recommendMinSessions && !cooling) return { ...base, status: 'deload_recommended' };
  if (level === 'RECOVERY_REQUIRED' || (level === 'HIGH' && weekLevel !== 'NORMAL')) return { ...base, status: 'sustained_fatigue' };
  if (level === 'NORMAL') return { ...base, status: 'normal' };
  return { ...base, status: 'temporary_fatigue' };
}

/** Working sets after a deload: one fewer, never below one. */
export function deloadSetCount(prescribed: number): number {
  return Math.max(1, prescribed - FATIGUE_RULES.setsRemoved);
}

/** The target RIR during a deload: two higher, at most 5. */
export function deloadTargetRir(rir: number): number {
  return Math.min(FATIGUE_RULES.maxRir, Math.max(rir, 0) + FATIGUE_RULES.rirAdded);
}
