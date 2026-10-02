# Training semantics (Phase 1)

These are the rules the training engine implements. Each one is covered by a test named in brackets.

## 1. One prescription

`personalizedLoad(exercise, workouts, profile, exercises, asOf)` is the only place a load is decided.
`progression()` is the decision inside it; `applyWorkoutAdaptation()` (next-session preparation), the advisory
"Progress / Protect" text and the session screen all read from it, so they cannot disagree
[progression-consistency.test.cjs].

`hydrateWorkoutRecommendations` (UI) carries the recommendation into a workout with
`loadRecommendationIntoSets()`. On the **first** hydration every uncompleted working set takes the recommendation
(loads pre-filled when the workout was created are stale: the plan is built before any history exists). Later
hydrations only fill a missing load and never overwrite what the athlete chose. Warm-ups and completed sets are never
touched [assisted-semantics.test.cjs].

## 2. Precedence (`progression`)

First match wins:

1. no usable evidence -> `calibrate`
2. timed movement -> `hold` (duration is tracked; there is no load to change)
3. repeatedly below the rep range -> `reduce` (direct performance evidence beats any context)
4. top of range **and** elevated workload -> `recover` (holds the load; suppresses only an increase)
5. top of range -> `increase`
6. very low RIR -> `hold`
7. otherwise `hold`

The existing readiness rule (latest session volume more than 25% above the previous one, `workloadFatigue()`) is the
fatigue signal, and `readiness()` uses the same function. Recovery check-ins (sleep, soreness, ...) are Coach
evidence only and never reach progression.

Order after the decision: return-to-training (see `docs/RETURN_TO_TRAINING.md`) takes the lower of its target and the
normal prescription; then the athlete's load list snaps the result.

## 3. Load lists

With a configured list (`profile.loadIncrementsKg`), the target is snapped exactly, without pre-rounding to the
exercise increment:

| decision | result |
|---|---|
| increase | smallest available load at or above (last worked + one exercise increment) |
| reduce / return to training | largest available load at or below the target |
| hold / recover | nearest available load to the last worked load (an exact tie goes to the lower load) |

Assisted movements mirror increase and reduce. Only finite, positive, plausible numbers in a real array are used
(rounded to 0.1 first, then validated). First-ever calibration uses the exercise's own increment, never the list
spacing.

## 4. Assisted exercises

* **external weight** (`total`, `stack`, `per_hand`): kg moved, stored in `SetLog.weight`.
* **assistance**: kg of counter-weight removed from bodyweight, stored **only** in `SetLog.assistance`. Lower
  assistance is harder and is progress. Older data that stored assistance in `weight` is still read.
* **effective resistance** = bodyweight - assistance. APEX does not assume a body weight, so it never computes it:
  assisted sets carry no volume (like bodyweight movements) and the best load is the **lowest** assistance.
* Everything reads the load through `setLoad()` / `bestLoad()`: progression, history, comparable estimates,
  return-to-training, volume, PRs ("New assistance best"), plateau signals, feedback, set construction.
* A load is only transferable between exercises that measure load the same way; an assistance load is never
  estimated from a stack or per-hand load.

## 5. Warm-ups

A warm-up is logged but is not training evidence. It never counts for progression, exact-history loads, comparable
estimates, the gap since the last exposure, volume, PRs, plateau signals, session completion, or whether a session
"logged sets" (a session of only warm-ups is abandoned) [warmup-semantics.test.cjs].

## 6. Timed movements

Duration (`seconds`) is the evidence; there is no load. A timed exercise is never reduced for missing reps and its
prescription is left alone by next-session preparation. Invalid durations are not evidence.

## 7. Input validation

NaN, Infinity, negatives, wrong types and implausible values (beyond `src/engine/limits.ts`: 1000 kg, 500 reps,
7200 s) are ignored as evidence, never accepted quietly. The UI clamps typed values, `repository.merge` drops invalid
stored values (keeping the set), and the engine ignores anything that still arrives. Training days: a whole number
from 2 to 6, anything invalid becomes 3 [training-input-validation.test.cjs].

## 8. Dates

Timestamps are absolute instants; calendar days are local-zone `YYYY-MM-DD` strings (`src/data/dates.ts`).
A timestamp becomes a day in the local zone; day arithmetic is independent of zone and daylight saving
[date-model.test.cjs, run in UTC, IST, Los Angeles and Auckland].

## 9. Equipment and substitution

* One compatibility rule, `exerciseFitsEquipment()`: no equipment needed, or bodyweight, or at least one listed piece
  is available (exact, case-insensitive names). `equipmentFit`, `buildPlan` and the ranking use it.
* One ranking, `substituteScore()` / `rankSubstitutes()`; one equivalence rule, `isEquivalentSubstitution()`
  (same pattern, same load meaning, same rep-range width). An equivalent substitute carries the prescription, anything
  else starts a new baseline.
* A plan never contains an empty or single-exercise training day: with too little equipment an UPPER or LOWER set with
  fewer than 3 exercises falls back to the full-body set [equipment-integrity.test.cjs, exercise-selection.test.cjs].

## 10. Goals (goal programming)

**Product decision (made in the Phase 1 closure pass).** The product defined the five goals only as labels
(Strength, Hypertrophy, Fat loss, Fitness, General). No document, type or data field said what a goal changes, and every
catalogue exercise is authored for moderate, hypertrophy-style work (8-12 reps for most compounds and arms, 10-15 for
calves, raises and extensions). The decision is therefore conservative: General is the neutral baseline, the catalogue
stays the source of what an exercise supports, and each other goal makes a small, bounded change to the **target** the
progression engine works against. A goal never decides a load.

```
GOAL -> goal program (src/engine/goalProgram.ts) -> programmed exercise + target RIR -> progression engine -> workout
```

`GOAL_PROGRAMS` in `src/engine/goalProgram.ts` is the single authoritative table. Plan building, the prescription, the
progression decision, rest and every screen read rep range and rest from `programExercise()` and the target effort from
`goalTargetRir()`, so they cannot disagree.

| goal | compound lifts (squat, hinge, push, pull) | isolation lifts | rest | target RIR |
|---|---|---|---|---|
| general | catalogue range (baseline) | catalogue range | catalogue | experience baseline (advanced 1, otherwise 2) |
| hypertrophy | catalogue range (already moderate) | catalogue range | catalogue | one closer to failure (never below 2 for a beginner, never below 1) |
| strength | window shifted down 3 reps (8-12 becomes 5-9) | catalogue range | compound +30 s | baseline |
| fat loss | catalogue range (training quality preserved) | catalogue range | -15 s (never below 45 s) | baseline |
| fitness | window shifted up 2 reps (8-12 becomes 10-14) | catalogue range | catalogue | one more in reserve (at most 3) |

* **Interaction with the catalogue.** The goal never replaces the catalogue. It shifts the catalogue window by a bounded
  amount and keeps its width, so the range is always possible (minimum 3 reps, `low < high`) and never more than 3 reps
  from what the catalogue supports. Timed, no-load and bodyweight movements keep their catalogue reps (a goal cannot add
  load to them); their rest still follows the goal. Rest stays between 45 and 300 s, within 30 s of the catalogue.
* **Sets per exercise** are not changed by any goal (3 for the first four exercises of a session, 2 afterwards). A safe
  volume rule is not defined by the product, and fat loss must not turn into an extreme-volume mode.
* **Selection emphasis.** Goals still do not add, drop or reorder movement patterns, and the catalogue carries no
  metadata for a richer goal preference. The one effect on selection is narrow (section 12, factor 3): strength and
  hypertrophy prefer a movement whose load is measured, because that is what their prescriptions progress. Equipment
  filtering and substitution ranking are identical for every goal (the shift preserves the rep-window width the
  equivalence rule compares).
* **Where it lives.** The goal is `profile.primaryGoal`. The programmed values are never persisted: the catalogue is
  rebuilt on every load and programmed for the profile's current goal (`repository.merge`), and the app re-programs it
  whenever state changes (`withGoalProgram` in `main.tsx`). A planned exercise with no logged sets follows the current
  goal when its workout is prepared or hydrated. An unknown or missing goal is General.
* **Changing goal.** New prescriptions follow the new goal. Completed workouts, logged sets, PRs and the plan days are
  never rewritten, and an exercise that already has logged sets in a workout keeps the range it was performed under
  [goal-program.test.cjs, goal-plan.test.cjs].
* **Progression.** The same rules decide for every goal (section 2). Only the target range they compare reps against
  differs, so 9 reps three times is the top of the strength range (increase) and mid-range for general (hold).

## 11. Rolling workout generation (`src/engine/rolling.ts`)

The plan is a 7-day template (`Plan.days`, `dayIndex` 0 to 6) that repeats from the day the plan was created
(`Plan.createdAt`, as a local calendar day). The app keeps a window of FUTURE scheduled workouts filled from that
template. Generation is pure and deterministic: the same state, local `today` and `now` give the same workouts, with the
same ids (`wk-<planId>-<date>-<label>`) and no randomness [rolling-generation.test.cjs].

* **Horizon.** Every calendar day from `today` through `today + horizon - 1` that the template marks as a training day
  gets a scheduled workout. The default is 7 days, exactly the week onboarding always produced, so a new plan starts the
  same as before. `preferences.horizonDays` (a whole number from 7 to 28; anything else means 7) changes it. There is
  deliberately no UI: nothing in the product needs one yet.
* **Slots.** A slot is a template training day on a calendar date. A slot is FILLED when any workout with source
  `scheduled` exists on that date, in any status: planned, in progress, completed, skipped (this includes a session
  abandoned with no sets), missed, rescheduled (the original keeps the date it was moved from) or a rescheduled
  replacement. Only unfilled slots are generated, so nothing is duplicated, and a skipped or moved session is not
  regenerated. `extra` and `custom` workouts neither fill nor change a slot.
* **When it runs.** `maintainTrainingHorizon` runs once hydration has finished and again whenever the workouts, plan,
  profile or horizon change, when the app returns to the foreground, and each minute while it is open (so a day that
  passes is noticed). Completing, skipping or removing a workout, and a new day, all lead to the same rule: fill the
  unfilled slots in the window. Calling it again with the same state and day returns the same object and changes nothing.
* **Removed workouts.** A future workout that no longer exists leaves its slot unfilled, and the next run regenerates
  it (identical, because the id and content are deterministic).
* **Missed days and long gaps.** Dates before `today` are never generated. Planned sessions from earlier days become
  `missed` (the existing `markMissedWorkouts` rule, now run by the same entry point on every day change and not only on
  start), and generation resumes from today. There is no separate gap algorithm: the return-to-training rule
  (`docs/RETURN_TO_TRAINING.md`) applies through the prescription below.
* **History.** Existing workouts are never rewritten. The only change to one is `planned` to `missed`. Completed
  workouts stay byte-for-byte identical.
* **Prescription.** Exercises come from the plan's selection (`Plan.exerciseSets`) filtered by the one equipment rule,
  with at most 7 per workout; sets, reps and rest come from the programmed catalogue for the current goal. Once any
  history exists, loads, rest and rep targets come from `applyWorkoutAdaptation`, which uses `personalizedLoad` as of the
  workout's own date, so progression and return to training apply exactly as when a workout is completed. A training day
  is never empty: a slot whose exercises no longer fit the equipment is skipped, not generated empty.
* **Not in this phase.** The plan template itself is not rebuilt when the profile changes. Editing training days, goal
  or equipment in the profile affects the equipment filter and the programmed targets of newly generated workouts, but
  does not change which days train (that was already true before rolling generation, which only ever built one week).
  Exercise selection is ranked, not first-match (section 12).
* **Persistence.** Generated workouts are ordinary workouts in `AppState.workouts`, saved, arbitrated and migrated by the
  repository like any others. `horizonDays` is an optional preference needing no migration. Each generation adds a
  `workouts_generated` entry to the event log.

## 12. Exercise selection and the catalogue (`src/engine/selection.ts`)

`buildPlan` chooses one exercise for each movement pattern with a deterministic ranking. It replaced "the first catalogue
match", which depended on the order the catalogue was written in [exercise-selection.test.cjs].

**Candidates are filtered, never ranked down.** An exercise is a candidate only if its pattern equals the requested pattern
(selection can never leave the pattern, and there is no cross-pattern fallback: when nothing in a pattern fits the
equipment the pattern is simply absent) and it fits the equipment by the one equipment rule (section 9).

**Ranking order.** Compared left to right as a lexicographic tuple (no weights); a later factor decides only when every
earlier one ties:

| # | Factor | Meaning |
|---|---|---|
| 1 | fit | usable now ahead of "unknown" (equipment not listed) |
| 2 | suitable | the exercise's catalogue difficulty is not above the athlete's experience; it ranks, it does not filter, so a beginner with only a barbell still gets a barbell lift |
| 3 | goal | strength and hypertrophy prefer a measured load (stack, total, per hand, assistance); every other goal is neutral |
| 4 | continuity | already in the athlete's plan for the pattern (2), or listed as an alternative to one (1) |
| 5 | exposure | completed working-set sessions the athlete already has with it (warm-ups and unfinished workouts do not count) |
| 6 | default | the catalogue's established default for the pattern (`ESTABLISHED_DEFAULTS`), so a new plan does not churn |
| 7 | coverage | trains a primary muscle no earlier pick in the same session set trains as a primary muscle (yes or no, not a count) |
| 8 | progress | the load is measured, so the progression engine can progress it |
| 9 | relations | how many catalogue alternatives the athlete can use |
| 10 | light | fewer required pieces of equipment |
| 11 | id | the exercise id, ascending: the final, total tie-break |

* **Stable and deterministic.** The same inputs always give the same exercise, whatever order the catalogue is stored in
  and however equipment names are capitalised. Adding exercises the athlete cannot use never changes a selection.
* **Not inputs.** Recovery and fatigue (check-ins never reach the prescription engine; the one fatigue signal describes a
  session), and harder or easier variations: moving someone to a progression is a progression decision, not a
  plan-building one. Loads, rep ranges, progression and set counts are untouched.
* **When it runs.** Only when a plan is built (onboarding, and rolling generation's fallback when a plan has no stored
  selection). It never swaps an exercise in a workout that exists, and rolling generation uses the plan's stored selection
  (`Plan.exerciseSets`), so existing plans do not change.
* **Minimum session.** An UPPER or LOWER set with fewer than 3 exercises uses the full-body set instead (it used to apply
  only when the set was empty), so thin equipment never yields a one-exercise day.
* **Intended differences from the first-match plans**, each explained by a rule above and pinned by the golden plans in
  `tests/golden/plans.json`: a beginner is no longer defaulted to the intermediate Romanian deadlift when a beginner hinge
  exists (2); a bench without a barbell no longer yields a barbell bench press (2); athletes with only dumbbells get a row
  that needs only a dumbbell (9, 10); strength and hypertrophy athletes with a cable get the loaded Pallof press instead
  of the plank (3). Full-equipment intermediate athletes with the general goal get exactly the plan they always had.

**Catalogue 2.0 (35 to 45 exercises).** Added only where a pattern had a gap and the existing equipment vocabulary
(machine, cable, dumbbell, barbell, bench, kettlebell, bodyweight) and its rules could express the movement:

| Pattern | Added | Level |
|---|---|---|
| horizontal pull | One-Arm Dumbbell Row, Barbell Row | beginner, intermediate |
| horizontal push | Push-Up | beginner |
| vertical push | Overhead Barbell Press | intermediate |
| squat | Barbell Back Squat | intermediate |
| unilateral squat | Reverse Lunge | beginner |
| hinge | Glute Bridge, Kettlebell Deadlift, Barbell Deadlift | beginner, beginner, intermediate |
| core | Pallof Press | beginner |

Every addition has a stable id, aliases, family, pattern, primary and secondary muscles, equipment, difficulty, cues,
setup, steps, mistakes, a load description and at least two alternatives; intermediate lifts carry safety notes
(`safetyConsiderations`, informational, no medical claims). Five progression links were added, each the same movement
made harder with a rising difficulty: chest-supported row to barbell row, goblet squat to barbell back squat, dumbbell
shoulder press to overhead barbell press, glute bridge to hip thrust, kettlebell deadlift to barbell deadlift (12 in
total; regressions are derived). The graph and every validator report no issues.

**Still not covered.** Pull-ups, hanging leg raises, dips and trap-bar deadlifts need `pull_up_bar`, `dip_bar` or
`trap_bar`, which the catalogue vocabulary and the "a bodyweight movement needs no equipment" rule cannot express yet.
Carries, rotation, shrugs, forearms, adductors, abductors and back extensions were not added: they have no pattern in the
plan, and adding patterns to the plan is a separate decision. Contraindication notes remain empty on purpose.

## 13. Longitudinal progression (`src/engine/longitudinal.ts`)

`progression()` and `personalizedLoad()` still decide every load, exactly as before (increments, snapping to the athlete's
load list, assisted and timed semantics, custom loads, the return-to-training rule). Phase 11 adds the longer view: how an
exercise has gone across sessions. `personalizedLoad()` now also returns `longitudinal`, a classification with a reason
code. **It never changes `weight`, `action` or `recommendedRest`** (a test compares them with `progression()` directly).
Phase 9 rolling generation reaches it through `applyWorkoutAdaptation`, which is unchanged; the Phase 10 ranking is untouched.

**State (derived, not stored).** Built on every call from completed workouts, one *exposure* per training day (two sessions
on one day are one exposure, so a plateau cannot be manufactured in a day). Per exposure: best load (highest; lowest
assistance), best performance at that load (reps, or seconds for timed movements), whether the last three sets reached the
top of the goal-programmed range, whether two of them were below its bottom, and average RIR. Per exercise: exposure count,
progressions, consecutive stalls and their span in days, trailing below-range exposures, peak and last load, direction of
the last change, recent RIR, and the exposures the athlete has to the exercise's catalogue alternatives (the variation history, used by rule V3).
An exposure *progressed* when its load is harder than the previous one's, or the load is equal and its best performance
is higher. It *regressed* on an easier load or lower performance at the same load, and is *flat* otherwise. An exposure after a
gap of 14 days or more (the existing `RETURN_GAP_DAYS.twoWeek`, via `returnTierForGap`; there is no second gap algorithm) is
a *re-entry*: a new baseline, never a stall. **Consecutive stalls** are the trailing regressed/flat exposures back to the last
progressed, re-entry or baseline one.

**Transition table** (first matching row wins; one reason code per row):

| # | Condition | Outcome | Reason |
|---|---|---|---|
| 1 | no exposure yet | CONTINUE | `first_exposure` |
| 2 | the return-to-training rule applies (gap of 14+ days to the prescribed date) | CONSERVATIVE_REENTRY | `return_to_training` |
| 3 | workload elevated (`workloadFatigue`) and (base action is `recover` or stalls ≥ 3) | RECOVER | `recovery_hold` |
| 4 | base action is `increase` and a higher load exists | PROGRESS | `progressed` |
| 5 | stalls ≥ 5, spanning ≥ 14 days, and a valid variation exists | CONSIDER_VARIATION | `variation_available` |
| 6 | stalls ≥ 5, spanning ≥ 14 days | PLATEAU | `persistent_plateau` |
| 7 | stalls ≥ 3 | PLATEAU | `repeated_stall` |
| 8 | base action is `increase` but the load list has no higher load | HOLD | `load_ceiling` |
| 9 | stalls = 2 | HOLD | `temporary_hold` |
| 10 | stalls = 1 and (base action is `reduce` or the exposure was below the range) | HOLD | `held_after_low_performance` |
| 11 | stalls = 1 | HOLD | `isolated_stall` |
| 12 | timed movement, no stall | HOLD | `timed_hold` |
| 13 | otherwise | CONTINUE | `continuing` |

"Base action" is what `progression()` decided for the session. Thresholds are constants (`LONGITUDINAL_THRESHOLDS`: 3, 5, 14
days, 2). They are conservative product rules, not scientific constants.

**Plateau.** One poor session is an isolated stall, two are a temporary hold, three on different days are a repeated stall
(PLATEAU), and five over at least two weeks are a persistent plateau. The stall count reads performance only. Soreness and
recovery never create a plateau: elevated workload can only *defer* the verdict (row 3). Check-ins still do not reach the engine.
A plateau holds the load; it never lowers it by itself (a `reduce` still comes only from the existing below-range rule).

**Variation.** Considered only from rows 5 and 6, so a variation existing is never a reason by itself. Candidates keep the
movement pattern, fit the athlete's equipment (`exerciseFitsEquipment`) and are not above the athlete's experience.
V1 *harder*: the athlete cannot add load (top of the load list, or a movement without load) and reached the top of the range, so a
graph progression. V2 *easier*: two exposures below the range, so a graph regression. V3 *alternative* (otherwise, or when V1/V2
have none): a catalogue alternative that `isEquivalentSubstitution` accepts, the one trained least, then id. No candidate means
none is invented: the outcome stays PLATEAU. The variation is **advice**: nothing swaps an exercise in a stored or active
workout; the athlete applies it through the existing substitution flow.

**Integrity.** The module reads history and returns new objects; it never rewrites a workout, a set log or the profile,
and a decision applies only to future prescriptions. It is deterministic (no clock, randomness, storage or AI). The Coach and AI
may read the decision; they have no path that writes a load, an exercise or this state. No persisted field was added, so no
migration was needed.

**Not covered / unchanged.** The Coach's existing plateau evidence (`src/coach`) is a separate, unchanged signal; Phase 15
may consume these reason codes. No deload or fatigue accumulation (Phase 12). A load is never lowered for a plateau.


## 14. Fatigue, deload and recovery (`src/engine/fatigue.ts`, `src/engine/deload.ts`)

Every threshold below is an **APEX product rule, not a medical or scientific constant**. Nothing here diagnoses, treats or
infers anything about the body, and no medical readiness score exists. The model reads **training data only**: recovery
check-ins stay evidence for the Coach (`recovery.ts`) and are not an input (a test proves the prescription is identical with
or without them). The state is **derived** from workout history on every call; the only stored fact is the start day of a
deload the athlete accepted (`AppState.deloads`, optional, normalised in the repository, backward compatible, covered by the
Phase 7 save/reload arbitration tests; no SQLite schema change was needed because the state is one JSON row).

**Signals** (as of a day D; windows end on D; the constants are `FATIGUE_RULES`):

| Signal | Rule | Points |
|---|---|---|
| workload | last 7 days' volume ÷ mean weekly volume of the up-to-21 days before (needs 2+ sessions and 14+ days of history there) ≥ 1.5 / ≥ 1.3; else the existing single-session spike (latest session > 125% of the one before, `workloadFatigue`) | 2 / 1 / 1 |
| effort | 3+ sessions in 14 days with ≥ 3 rated working sets averaging RIR ≤ 0.5 | 1 |
| density | 6+ sessions in 7 days | 1 |
| stalls | 2+ exercises (trained in 14 days) with 3+ consecutive non-progressing exposures (Phase 11) | 1 |
| decline | 4+ comparable exposures in 14 days, at least half regressed | 1 |

Stalls and decline count **only when at least one load signal (workload, effort, density) is present**: a plateau alone is never
fatigue, and fatigue is never a plateau.

**Fatigue state** from the score: `NORMAL` 0, `ELEVATED` 1–2, `HIGH` ≥ 3, and `RECOVERY_REQUIRED` = HIGH on D **and** on D − 7.
One unusual session reaches ELEVATED at most. The windows (7 to 28 days) are what prevent oscillation, and a new athlete's
ramp-up is not read as a spike.

**Deload status** (first match): `deload_active` (an accepted deload started within 7 days) → `recovery_complete` (the 7 days
after it) → `deload_recommended` (RECOVERY_REQUIRED, 6+ sessions in 28 days, and no deload ended in the last 14 days) →
`sustained_fatigue` (HIGH with ELEVATED+ a week earlier, or RECOVERY_REQUIRED inside the cooldown) → `temporary_fatigue`
(ELEVATED, or new HIGH) → `normal`. The engine never starts a deload: the athlete accepts the recommendation with an
explicit button (`startDeload`, which re-checks the status and otherwise returns the state unchanged). The Coach and AI can
read the status; the invariant tests prove they hold no path that writes `deloads`, loads or sets.

**Deload prescription** (only while `deload_active`; established concepts only): load = **2 load steps below the last worked
load** (the same step-down used by return to training: the athlete's own load list; assistance goes up; never more than half the
load); **one fewer working set** (never below one; uncompleted sets only, once, when the session is first hydrated; warm-ups
untouched); **target RIR + 2** (max 5). Exercises, patterns, equipment, goal programming, rep ranges and timed movements are
unchanged, and a timed or bodyweight movement gets no invented load. The deload layer lives in `personalizedLoad`, so rolling
generation and the session screen consume it normally; `rolling.ts` only passes `deloads` through.

**History.** Sessions done inside a deload window are not progression evidence (they are lighter on purpose), so the deload
never lowers the athlete's baseline; the window is a function of the stored start day. No workout or set log is ever edited.

**Recovery completion.** For 7 days after a deload an increase is not prescribed (the last normally worked load is repeated); then
normal progression returns.

**Return to training.** There is no second gap algorithm. `RETURN_GAP_DAYS`/`returnTierForGap` still decide the load after a
break; when that rule applies inside a deload the deload does not stack a second reduction on it (sets and RIR still follow
the deload).

**Plateau and fatigue (Phase 11 interaction).** Plateau without fatigue → progression/variation (Phase 11, unchanged). HIGH or
RECOVERY_REQUIRED fatigue with 3+ stalls → the longitudinal decision is `RECOVER / recovery_hold` and no variation is suggested.
(The transition table is unchanged; its "elevated workload" input now also covers HIGH and RECOVERY_REQUIRED.)

**Trend.** `improving` / `steady` / `worsening` from the score against a week earlier, exposed with the status for the Coach
and later analytics; no UI beyond one Home card (status text and the "Start deload week" button).


## 15. Warm-up generation (`src/engine/warmup.ts`)

**Data model.** A warm-up is an ordinary `SetLog` with `type: 'warmup'` (no new field). `isWorkingSet()` is still the one filter, so
warm-ups never reach progression evidence, longitudinal exposures, working-set history, volume, PRs, stall or fatigue/deload
calculations, `sessionAssessment` completion counts or load recommendations (a test runs identical histories with and without
heavy warm-ups through all of them). Generated warm-ups are derived once, when a workout is first hydrated, and then live on the
workout like any set, so completing, skipping and editing them needs no new persistence. A warm-up never changes a working load.

**Rules** (APEX product rules, deterministic, no randomness). "Rank" is where the working load sits on the athlete's own load
choices (listed loads at or below it, else load ÷ exercise increment). All loads come from `snapToAvailableLoad` / the exercise
increment, never a second load system.

| Case | Warm-up |
|---|---|
| timed or no-load movement | none |
| rank < 4 (light) | none |
| compound, muscles not yet prepared this session | 2 ramp sets at 50% and 75%; 3 at 40%, 60%, 80% when rank ≥ 10 and the load is a total (barbell, leg press) |
| compound, muscles already prepared | 1 set at 70% when rank ≥ 8, else none |
| isolation, not prepared | 1 set at 60% when rank ≥ 6, else none |
| isolation, prepared | none |
| bodyweight compound, not prepared | 1 repetition-only preparation set (half the bottom rep target, at least 5), no load |
| assisted compound, not prepared | 1 set with 2 load steps MORE assistance (the existing step-down), never less |

"Prepared" means every primary muscle of the exercise is a primary or secondary muscle of an earlier exercise in the same session
(skipped exercises prepare nothing). A ramp load is the largest valid load at or below the percentage, above the previous ramp
set, never below a known barbell weight, and dropped (not approximated) when the athlete's list has nothing that light. Ramp reps
are 8 / 6 / 5 / 3 by percentage, never above the top of the rep range.

**Session behaviour.** Warm-ups appear first in each exercise, labelled "WARM-UP n / m" with their own load; working counters ("SET n / m",
"x / m complete", planned/completed totals, calendar marks) count working sets only. Completing a warm-up goes straight to a 45 s
rest (no "how did that feel" step, which would adjust the working load). Skipping one never blocks the exercise or session.
Editing one (reps, weight, the +/- load buttons, type) stays on that set: the working prescription and `recommendedWeight` are
untouched. A set added while a warm-up is selected is a working set; the last working set cannot be removed; `prescribedSets`
counts working sets.


## 16. Weekly analytics, Coach 2.0 and Ask Coach 2.0

All three layers are read-only and deterministic (same state and day, same output; no AI, network, clock or randomness). None of them owns
a progression, fatigue or prescription model: they read the Phase 11 longitudinal decision, the Phase 12 fatigue/deload assessment and the
engine's own `personalizedLoad`, and warm-ups never enter any of it.

**Weekly analytics** (`src/engine/weeklyAnalytics.ts`). Weeks start on Monday in the local calendar. The current week runs from its Monday
to today and is compared with the same number of days a week earlier; a comparison whose earlier span has no completed session reports
`not_enough_data` instead of a percentage. Volume counts only completed workouts in the week and only counted sets (completed, not a warm-up,
with reps or seconds above zero); each exercise's primary muscles get direct sets, its secondary muscles indirect sets (a muscle in both counts
once, as direct); shares are relative to direct sets, with no good/bad or optimal-volume judgement. Consistency: planned = scheduled-source
workouts from Monday through today except moved ones (`rescheduled`); adherence counts completed scheduled sessions only and is null when nothing
was planned; custom sessions count as sessions but not as plan items; streak = consecutive weeks with a completed session. Progression: each
trained exercise's change comes from the Phase 11 exposure kinds, its stall verdict from the longitudinal decision. Recovery is the Phase 12
assessment (level, trend, deload status). Shown on Progress, Overview.

**Coach 2.0 briefing** (`src/coach/briefing.ts`). One prioritised, actionable summary built from decisions the engines already made, at most
three items, one per kind, most urgent first: 0 safety (the existing Coach gate) · 1 deload / sustained fatigue · 2 conservative re-entry ·
3 resume after missed training (2+ missed in 14 days or 7+ days idle) · 4 review a stalled exercise · 5 follow a progression · 6 review
consistency (under half of the planned sessions, 3+ days into the week, 2+ planned) · 7 keep the load · 8 train as planned. Every item has a
reason, a severity and metrics taken from the engines. With fewer than two completed sessions the status is `insufficient_data` and it says
so. The Coach never writes a load, names an exercise or number an engine did not produce, or makes a medical statement. Shown on the Coach
screen (briefing card) and as one "Next:" line on the Home Coach card; the existing Coach decision card and pipeline are unchanged.

**Ask Coach 2.0** (`src/coach/askContext.ts`, `src/coach/askCoach.ts`). One pure context builder gathers today's session and exercise (with the
engine's prescription), recent sessions, the week, the exercise's history and decision, fatigue/deload, goals, a small profile subset and the
exercise graph; it leaves out identity, notes, journal text and recovery values. New intents: weekly review ("how did I do this week", "what
changed from last week"), focus today, deload, exercise change, and a richer plateau answer ("why am I stalled"). The response contract
separates `answer`, `evidence`, `prescription` (the engine's decision, quoted), `limitations` (insufficient data, stated) and `nextAction`
(a suggestion only); `validateAskCoachResponse` checks it. The safety gate still answers first. The optional AI only restates facts: the
engine prescription and next step are added to its KNOWN/INFERRED facts, it is off by default, and an answer that invents a load or an
exercise is rejected.
