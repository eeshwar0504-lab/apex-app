'use strict';
/*
 * Disposition of the 12 REVIEW items raised by the first full longitudinal run (5,000 users x 12 weeks),
 * updated after the final review-fix pass. Each item carries exactly one classification:
 *   REAL BUG - FIXED | PRODUCT DECISION - IMPLEMENTED | INTENTIONAL - DOCUMENTED | HARNESS/ORACLE ISSUE - FIXED |
 *   VALIDATION GAP - FIXED | REMAINING PRODUCT DECISION | REMAINING VALIDATION GAP
 */
module.exports = [
  {
    id: 1, original: 'Engine signalled "reduce" (repeatedly below rep range) but the prescribed load was not reduced (210,660 occurrences, 4,792 users)',
    classification: 'REAL BUG - FIXED',
    evidence: 'progression() low-performance branch returned { action: "reduce", weight: lastWeight }; nothing downstream lowered the load, so an athlete repeatedly under the rep floor was re-prescribed the identical load forever. Smallest case: sets 20x4, 20x5, 20x5 -> action "reduce", weight 20.',
    decision: '"reduce" now lowers the load by exactly one exercise increment (one increment MORE assistance on assisted movements), never below the smallest meaningful load; personalizedLoad snaps to the next lower available load (next higher assistance for assisted movements with custom loads - a second latent direction bug found while adding the return-to-training rule). The trigger rule is unchanged.',
    codeChanged: 'src/engine/training.ts (progression, personalizedLoad)', regressionTest: 'tests/progression-reduce.test.cjs (6 tests) + longitudinal exact case "reduce means reduce" + mutation check',
  },
  {
    id: 2, original: 'Completed workout has no completed sets (527 occurrences, 22 poor-recovery users)',
    classification: 'PRODUCT DECISION - IMPLEMENTED',
    evidence: 'The harness athlete originally skipped sets it could not lift, which exposed that the app let a session with zero logged sets be finished as a normal completed workout (and then fed achievements, adaptation and history).',
    decision: 'A workout with zero logged sets can no longer be completed. The session-complete screen says "No sets logged" and the only action is "End without recording": the workout is stored as skipped (abandoned), with no completion, achievements, observations or adaptation. The simulator now produces such sessions (~1.5% of attended days) and the oracle treats a completed workout with no sets as a HARD failure. (The original harness athlete flaw was also fixed.)',
    codeChanged: 'src/engine/training.ts (hasLoggedSets, abandonWorkout), src/main.tsx (onDone guard, session-complete screen)', regressionTest: 'tests/zero-set-workout.test.cjs; oracle invariant (hard); Playwright zero-set flow',
  },
  {
    id: 3, original: 'poor_recovery_trainee spends ~35% of sets below the rep range',
    classification: 'REAL BUG - FIXED',
    evidence: 'Traces showed APEX holding the same load while the athlete failed the rep floor session after session: the item-1 bug. After that fix the below-range share for this archetype fell from 35.6% to ~18-19% and every other archetype is <=11%. The residual comes from the independent athlete model (poor sleep 0.4, high fatigue gain) and is a healthy stress case.',
    decision: 'No threshold was relaxed and no load was lowered artificially; fixed by item 1.',
    codeChanged: 'same fix as item 1', regressionTest: 'covered by item 1 tests',
  },
  {
    id: 4, original: 'Exact case: action "reduce" keeps the previous load (20 -> 20)',
    classification: 'REAL BUG - FIXED',
    evidence: 'Same root cause as item 1, reproduced deterministically by the exact-rule table.',
    decision: 'Fixed together with item 1; the exact case asserts 20 -> 17.5.', codeChanged: 'src/engine/training.ts', regressionTest: 'tests/progression-reduce.test.cjs; oracle/progression-oracle.cjs',
  },
  {
    id: 5, original: 'No plateau-breaking mechanism (deload/variation) exists',
    classification: 'PRODUCT DECISION - IMPLEMENTED',
    evidence: 'BUILD_STATUS.md documents only "deterministic plateau candidate signals with no silent plan changes", but plateauCandidates() was not wired to any screen. Wiring it exposed two false-positive flaws in the signal itself (found by the longitudinal run: it flagged identical rep totals at an INCREASING load, and exercises with no recorded output, in ~80% of sessions).',
    decision: 'Implemented as Coach evidence: plateau signals flow Coach context -> evidence -> "review" decision with options, an explicit "not a diagnosis" statement and honest confidence (3 sessions = low, 4 = medium). No automatic plan or load change. The signal now requires the same working load and non-zero output (comparable sessions).',
    codeChanged: 'src/engine/analytics.ts, src/coach/{types,signals,decisionPipeline,index}.ts, src/main.tsx (Coach screen "Your options")', regressionTest: 'tests/plateau-coach.test.cjs; oracle/context.cjs (independent plateau rule); longitudinal plateau checks',
  },
  {
    id: 6, original: 'Sleep/soreness/fatigue are not inputs to load prescription',
    classification: 'PRODUCT DECISION - IMPLEMENTED',
    evidence: 'src/coach/types.ts declares these as "evidence, not automatic prescriptions" and no screen collected them.',
    decision: 'Kept as evidence only. A Recovery check-in card on the Coach screen collects sleep hours, sleep quality, soreness and fatigue (optional); values are clamped/rejected at the input and persistence boundaries, stored in state.recoveryLog, and reach the Coach as low-confidence self-reported context with an explicit "does not change your prescription" statement and a "train lighter (your choice)" option. The training engine never reads recovery data; extreme values leave every load unchanged (verified metamorphically in every simulated session).',
    codeChanged: 'src/engine/recovery.ts, src/core/types.ts, src/data/repository.ts, src/coach/*, src/main.tsx (RecoveryCheckInCard)', regressionTest: 'tests/recovery-context.test.cjs; oracle/context.cjs; longitudinal recovery check-ins (incl. hostile values)',
  },
  {
    id: 7, original: 'Load after a two-week break equals/exceeds load before it',
    classification: 'PRODUCT DECISION - IMPLEMENTED',
    evidence: 'personalizedLoad() took no date: identical history gave an identical load after 1 week or 1 year. (The original comparison in the harness was also wrong - it used the prescription, not the load actually worked.)',
    decision: 'Explicit, deterministic, bounded return-to-training rule (docs/RETURN_TO_TRAINING.md): gap <14 days unchanged; 14-27 days 1 load step lower; 28-55 days 2 steps lower; 56+ days 3 steps lower; one step = the exercise increment (or one real equipment choice); never more than half of the last worked load, never below the smallest meaningful load, never an increase on the return session; assisted movements receive more assistance. The return session resets the gap so normal progression resumes.',
    codeChanged: 'src/engine/training.ts (personalizedLoad asOf, trainingGapDays, returnToTrainingLoad), src/main.tsx (passes today)', regressionTest: 'tests/return-to-training.test.cjs (11 tests); independent layoff oracle (TABLE in oracle/invariants.cjs) checked on every prescription after a gap; mutation check',
  },
  {
    id: 8, original: 'Load after a four-week break equals/exceeds load before it',
    classification: 'PRODUCT DECISION - IMPLEMENTED',
    evidence: 'Same as item 7.', decision: 'Same as item 7 (28-55 days: two steps below the last worked load).', codeChanged: 'same as item 7', regressionTest: 'same as item 7',
  },
  {
    id: 9, original: 'Engine helpers do not clamp negative/huge JSON-representable set values (negative volume from negative reps)',
    classification: 'VALIDATION GAP - FIXED',
    evidence: 'Fuzz found sessionAssessment/volume returning -5e10 for reps -50 at 1e9 kg and feedbackLoad returning a negative load for a bodyweight exercise. UI inputs and persistence already validated; the engine itself did not.',
    decision: 'Boundaries unchanged (UI clamps incl. seconds/RIR, repository repair). Added the smallest meaningful last-line defence in the engine: set values that are not finite non-negative numbers count as 0 in summarizeSets/detectAchievements and feedbackLoad sanitises invalid current loads. Fuzz now finds no leak at engine level.',
    codeChanged: 'src/engine/training.ts (safeNum, summarizeSets, detectAchievements, feedbackLoad), src/main.tsx (clamps)', regressionTest: 'tests/engine-validation.test.cjs; tests/persistence-repair.test.cjs; longitudinal fuzz + end-to-end hostile-values check',
  },
  {
    id: 10, original: 'Engine functions do not validate NaN/Infinity/non-numeric set values',
    classification: 'VALIDATION GAP - FIXED',
    evidence: 'Same path as item 9: NaN volume and Infinity PR values reached outputs for NaN/Infinity/string sets.',
    decision: 'Fixed by the same engine defence; number inputs still cannot produce these values and persistence still rejects them.',
    codeChanged: 'src/engine/training.ts', regressionTest: 'tests/engine-validation.test.cjs; longitudinal fuzz (non-JSON inputs)',
  },
  {
    id: 11, original: 'Corrupt persisted state (duplicate workout ids) is replaced by an empty app without keeping a copy',
    classification: 'VALIDATION GAP - FIXED',
    evidence: 'readLocal() returned fresh() for any unusable payload, silently destroying the only copy of the data, and the app then looked like a fresh install.',
    decision: 'The payload is preserved (apex-state-v4-rejected, with one previous generation), a persistent recovery notice is raised, and a blocking "We couldn\'t read your saved data" screen offers "Recover what can be read" (every valid workout is kept; unreadable ones are dropped and counted; colliding ids are re-id-ed; exact duplicates dropped) or an explicit, confirmed "Start fresh". The notice survives restarts and autosave. Integrity validation is unchanged.',
    codeChanged: 'src/data/repository.ts (recoveryNotice, recoverRejected, startFresh), src/main.tsx (RecoveryGate)', regressionTest: 'tests/corrupt-recovery.test.cjs (10 tests); longitudinal corrupt-state + recovery UX checks; Playwright recovery flow',
  },
  {
    id: 12, original: 'Corrupt persisted state (unknown exercise + unknown status) is replaced by an empty app without keeping a copy',
    classification: 'VALIDATION GAP - FIXED',
    evidence: 'Same path as item 11.', decision: 'Same fix as item 11 (unknown-status workouts are dropped and counted, never guessed).', codeChanged: 'src/data/repository.ts', regressionTest: 'tests/corrupt-recovery.test.cjs',
  },
];
