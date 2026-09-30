# APEX longitudinal testing system

Simulates weeks/months of realistic use by many independent synthetic athletes through the **real** APEX engine and validates the
loop `context -> recommendation -> action -> logging -> feedback -> recovery -> progression -> next recommendation`.

```
npm run test:longitudinal:quick       # ~100 users x 8 weeks, ~5 s (default CI profile)
npm run test:longitudinal             # standard: 1,000 users x 12 weeks, ~1 min
npm run test:longitudinal:full        # 5,000 users x 12 weeks, ~5 min
npm run test:longitudinal:endurance   # 500 users x 24 weeks
npm run test:longitudinal:browser     # representative real-browser corpus (Playwright, 5 scenarios)
node tests/longitudinal/run.cjs --repro <archetype>:<seed>:<weeks>   # full timeline of one user
```

Env overrides: `LONGITUDINAL_LEVEL`, `LONGITUDINAL_USERS`, `LONGITUDINAL_WEEKS`, `LONGITUDINAL_SEED`, `LONGITUDINAL_FUZZ`.
Everything is seeded; a failure prints its seed and a reproduction command.

## Layout
| Path | Purpose |
|---|---|
| `load-engine.cjs` | Compiles the real TypeScript engine (no copied formulas) into a cached temp tree. Substitutes a no-op for the native SQLite plugin (Android-only); localStorage persistence, merge/repair and integrity are the real code. |
| `simulator/` | `random` (seeded RNG), `athlete-model` (independent athlete: e1RM, adaptation, fatigue, sleep, attendance, noisy RIR), `scenario-generator` (12 archetypes), `simulator` (day-by-day driver; never bypasses the engine). |
| `oracle/` | `invariants` (integrity/equipment/PR/progression consistency), `progression-oracle` (exact expectations for the documented double-progression rules; PR reconstruction), `metamorphic`, `selftest` (proves the oracle can fail). |
| `scenarios/` | `population` (users x weeks), `focused` (RIR, plateau, recovery, missed workouts, equipment/substitutions, units, PRs, body weight, persistence), `edge-cases` (fuzz + corrupt input). |
| `browser/` | Playwright config + spec for the real-browser corpus. |
| `reports/reporter.cjs` | Writes the reports below. |

## Outputs (git-ignored, under `test-results/`)
`longitudinal-report.md` (readable by another AI), `longitudinal-summary.json`, `longitudinal/failure-NNNNNN.{json,md}`,
`longitudinal-browser.json` (merged into the report on the next run).

## Classification
**PASS** contract met · **FAIL** hard failure (data corruption, crash, violated defined rule, silent data loss) ·
**REVIEW** valid-but-unexpected or specification-ambiguous behaviour for a human decision (never auto-labelled a bug).
The runner exits non-zero only on FAIL.

## Coverage added in the review-fix pass
| Area | Independent oracle |
|---|---|
| Return to training (gap tiers 14/28/56 days) | `oracle/invariants.cjs` `TABLE` (restated from `docs/RETURN_TO_TRAINING.md`), applied to every prescription after a gap |
| Zero-set sessions | simulator abandons them like the app; completed workout with no sets is a HARD failure |
| Plateau evidence | `oracle/context.cjs` `expectedPlateaus` (same working load, non-zero output, identical rep output) vs `coachEvidenceFromState` |
| Recovery context | every simulated session stores an athlete-derived (sometimes hostile) check-in, asks the Coach, and requires identical prescriptions with and without the recovery log |
| Corrupt state recovery | `scenarios/edge-cases.cjs`: notice, preserved bytes, recovery count vs an independent count, restart persistence, explicit fresh start |
| Oracle self-check | seeded layoff violations, zero-set completion, Coach load prescription, state mutation, false plateau evidence |
