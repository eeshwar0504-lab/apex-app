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
* A plan never contains an empty training day: with too little equipment an UPPER or LOWER day falls back to the
  full-body set [equipment-integrity.test.cjs].

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
* **Selection emphasis.** No goal changes which exercises are chosen. Selection stays equipment-driven and the
  catalogue carries no metadata that supports a goal-specific preference. Equipment filtering and substitution ranking
  are identical for every goal (the shift preserves the rep-window width the equivalence rule compares).
* **Where it lives.** The goal is `profile.primaryGoal`. The programmed values are never persisted: the catalogue is
  rebuilt on every load and programmed for the profile's current goal (`repository.merge`), and the app re-programs it
  whenever state changes (`withGoalProgram` in `main.tsx`). A planned exercise with no logged sets follows the current
  goal when its workout is prepared or hydrated. An unknown or missing goal is General.
* **Changing goal.** New prescriptions follow the new goal. Completed workouts, logged sets, PRs and the plan days are
  never rewritten, and an exercise that already has logged sets in a workout keeps the range it was performed under
  [goal-program.test.cjs, goal-plan.test.cjs].
* **Progression.** The same rules decide for every goal (section 2). Only the target range they compare reps against
  differs, so 9 reps three times is the top of the strength range (increase) and mid-range for general (hold).
