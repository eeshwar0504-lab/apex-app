# Return to training (layoff handling)

APEX prescribes a load from the athlete's own logged sets. After a long gap the last worked load may no longer be
the right starting point, so the prescription now takes the date it is prescribed for into account.

## Rule

The **gap** is the number of whole days between the last completed exposure to the exact exercise and the date the
load is prescribed for (`personalizedLoad(..., asOf)`).

| Gap | Tier | Load compared with the last worked load |
|---|---|---|
| under 14 days | short gap | unchanged (normal progression) |
| 14 - 27 days | about two weeks | 1 load step lower |
| 28 - 55 days | about four weeks | 2 load steps lower |
| 56 days or more | extended layoff | 3 load steps lower |

* **One load step** is the exercise's own increment (`incrementKg`), or one real selectable load when the athlete has
  configured their available loads (plates, dumbbells, machine stack). Only real loads are ever prescribed.
* **Bounded:** the reduction never exceeds half of the last worked load and never goes below the smallest meaningful
  load. A reduction never overshoots the step count: extra steps stop at the half-load bound.
* **Never an increase** on the return session, even if the last sessions were at the top of the rep range.
* **Assisted movements** move the other way: one step = one increment **more** assistance (snapped up to the next
  real assistance choice).
* **Already reducing:** if the normal rules already say "reduce", the lower of the two loads is used (the reductions
  do not stack).
* **Progression resumes** after the first return session. That session is new history dated today, so the gap is
  zero and the ordinary double-progression rules apply again.
* **Units:** everything is computed in kilograms; imperial is display only, so the prescription never depends on units.
* **No date, invalid date or no history:** no layoff handling (a session dated after "today" is a zero-day gap).

## Why these numbers

The tiers (about two weeks, about four weeks, substantially longer) are a **conservative product rule**, not a
scientifically validated model. They deliberately use the existing increment architecture instead of percentages, so
the result is explainable ("two load steps lower because you were away 30 days"), bounded and compatible with the
equipment the athlete really has. The constants live in one place (`RETURN_GAP_DAYS` in `src/engine/training.ts`) and
can be tuned by the product owner.

## Verification

* `tests/return-to-training.test.cjs` - boundaries (13/14/27/28/55/56 days), no increase, bounds, assisted movements,
  custom equipment loads, unit switching, progression after the first return session, invalid dates.
* Longitudinal oracle (`tests/longitudinal/oracle/invariants.cjs`) - an independent restatement of this table is
  applied to every prescription that follows a gap; its self-check proves it detects an ignored layoff, an increase on
  return, and an excessive reduction.
