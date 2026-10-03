# APEX 5.0.0 build status

## Release 5.0.0 (versionCode 9)

APEX 5.0 design implementation: the APEX Line, Session Thread, Guided/Standard/Advanced view levels, Training Map and mission briefing, Ghost Set and cause-path logging, Progress Observatory, structured Coach observations, Exercise Dossier, onboarding calibration and the four-theme system. The training engine, Coach, knowledge base, persistence and native layers are unchanged. Pre-workout equipment: one row per equipment-requiring exercise ("Equipment available?", Available / Not available), the saved profile preselects Available, and an unavailable item offers the deterministic top alternative behind an explicit Use alternative. Release signing still needs the owner keystore; no Android device run. Test counts are recorded by the suites, not here.

## Release 4.0.0

Major release on top of 3.1.2. Android versionCode 7. Core correctness (custom load lists, one assisted representation, fatigue/recovery path, timed exercises, input validation, warm-up semantics, goal-aware programming, local-date model, one equipment rule and substitution ranking); Coach boundary work; data/platform integrity; profile, goal and journal editing, library actions, confirmation flows, accessibility and the PWA decision (not a PWA, `docs/PWA_DECISION.md`); exercise graph with progressions/regressions, safety metadata and one similarity/ranking mechanism; an optional, grounded, untrusted AI explanation layer behind a strict deterministic boundary (`docs/AI_BOUNDARY.md`, off by default, no cloud UI, no keys). Native Capacitor SQLite and Android runtime remain unverified by the Node test harness.

## Phase 7: platform hardening and correctness (after 4.0.0, not yet released or committed)

Version and Android `versionCode` are unchanged (4.0.0 / 7). No new features.

- **Rest preference.** `applySetFeedback` now takes the rest preference from `state.preferences` (it read it from the profile, where it does not exist, so the user's setting was ignored after set feedback).
- **Local day.** The Coach's "today" (`buildCoachContext`, `answerCoachQuestion`) and two history labels now use the local calendar day, not the UTC date of an ISO string.
- **Persistence arbitration.** Every save is stamped `savedAt` (it moves only when content changes). The native-versus-local comparison uses it, so edits that carry no timestamp of their own (profile, goals, journal, recovery, preferences) can no longer lose to an older copy. A workout's scheduled day is no longer treated as a mutation time. Data saved before this change still compares by its workout, event and plan timestamps.
- **SQLite migrations.** `src/data/sqliteMigrations.ts` owns the ordered migration list; `SQLITE_SCHEMA_VERSION` is derived from it and stamped on every row (it was a literal 4). A v4 database is read unchanged; a database from a newer app is left untouched. Tested with a fake database only. Native SQLite is still NOT VERIFIED on a device.
- **Removed:** the unused `smartRir` preference (old saved data that has it still loads), `src/engine/coachGateway.ts` (no runtime importer), the stray no-extension workflow `.github/workflows/android-apk`, and the root `manifest.webmanifest` (never published; consistent with `docs/PWA_DECISION.md`).
- **Deferred, unchanged on purpose:** `safetyCheck` in `src/engine/training.ts` is not called by any runtime path. Whether to wire it up or remove it is an open decision.
- **Docs:** README, RELEASE_READINESS and PWA_DECISION corrected (no invented completion percentage).

Validation after Phase 7: `npm test` 417/417, `npm run verify` (417/417, release audit PASS, 0 warnings), `npm run build`, QA contracts 25/25, Playwright (training, coach, product-workflows, body-data) 16/16, longitudinal quick 720 PASS / 0 FAIL (identical to the 4.0.0 commit). Not re-run: the full Playwright suite, the browser corpus, longitudinal standard/endurance/full, and any Android build or device check.

## Phase 9: rolling workout generation (after Phase 7, not yet released or committed)

Version and `versionCode` are unchanged (4.0.0 / 7).

- `src/engine/rolling.ts` is a pure engine module. `maintainTrainingHorizon` marks earlier planned sessions missed (the existing rule) and fills every unfilled template slot in a 7-day window (`preferences.horizonDays`, 7 to 28, no UI). Same state, day and clock give identical workouts and ids; a repeated call returns the same object; completed history is never rewritten. Rules are in `docs/TRAINING_SEMANTICS.md` section 11.
- `main.tsx` no longer builds workouts: onboarding calls the engine, and a lifecycle effect (after hydration, on workout/plan/profile change, on returning to the foreground, and every minute) keeps the horizon filled. It replaces the mount-only missed-workout pass. Plan Studio shows a day's next upcoming session instead of the first week's.
- Not changed: exercise selection (first catalogue match), progression, recovery, warm-ups, the plan template (profile edits to training days still do not re-template), SQLite and the repository.

Validation after Phase 9: `npm test` 445/445, `npm run verify` (release audit PASS, 0 warnings), `npm run build`, QA contracts 25/25, the Playwright e2e suite 81/81, longitudinal quick 722 PASS / 0 FAIL (720 before, plus two new rolling-generation records). Not re-run: the browser corpus, longitudinal standard/endurance/full, any Android build or device check.

## Phase 10: exercise selection and catalogue 2.0 (after Phase 9, not yet released or committed)

Version and `versionCode` are unchanged (4.0.0 / 7).

- `src/engine/selection.ts` replaces first-match selection in `buildPlan` with a deterministic ranking (equipment fit, suitability, goal, continuity, exposure, catalogue default, muscle coverage, progressability, alternatives, fewer equipment pieces, then id). Candidates must match the pattern and fit the equipment; there is no cross-pattern fallback. Order and rationale: `docs/TRAINING_SEMANTICS.md` section 12. Loads, progression and rep ranges are untouched.
- The catalogue grows from 35 to 45 exercises (One-Arm Dumbbell Row, Barbell Row, Push-Up, Overhead Barbell Press, Barbell Back Squat, Reverse Lunge, Glute Bridge, Kettlebell Deadlift, Barbell Deadlift, Pallof Press) and gains five justified progression links (12 in total). The graph, knowledge and safety validators report no issues.
- A UPPER or LOWER session set with fewer than 3 exercises now uses the full-body set (it applied only when empty).
- Intended plan differences are pinned by `tests/golden/plans.json`; a full-equipment intermediate athlete with the general goal gets the same plan as before. Existing plans and rolling generation are unchanged (they use the stored selection).
- Not covered: pull-ups, hanging leg raises, dips and trap-bar deadlifts (the equipment vocabulary and the bodyweight-needs-no-equipment rule cannot express them yet).

Validation after Phase 10: `npm test` 475/475, `npm run verify` (release audit PASS, 0 warnings), `npm run build`, QA contracts 25/25, the Playwright e2e suite 81/81, longitudinal quick 722 PASS / 0 FAIL. Mutation checks: 13 mutations of the ranking and the minimum-session rule are each caught by the tests. Not re-run: the browser corpus, longitudinal standard/endurance/full, any Android build or device check.

## Phase 11: progression 2.0 (after Phase 10, not yet released or committed)

Version and `versionCode` are unchanged (4.0.0 / 7).

- `src/engine/longitudinal.ts` derives a per-exercise progression state from workout history (nothing is stored) and applies one documented transition table (13 rows; outcomes CONTINUE, PROGRESS, HOLD, PLATEAU, CONSIDER_VARIATION, RECOVER, CONSERVATIVE_REENTRY, each with a reason code and explanation). Rules, thresholds, plateau definition and variation rules are in `docs/TRAINING_SEMANTICS.md` section 13.
- `personalizedLoad()` now returns `longitudinal` alongside the unchanged load. Loads, actions and rest are identical to before (asserted against `progression()`); rolling generation (Phase 9) and ranking (Phase 10) are untouched and consume it through `applyWorkoutAdaptation`.
- A persistent plateau (5 stalled exposures over 14+ days) may name a variation from the exercise graph (harder / easier / equivalent alternative) within equipment and experience limits. It is advisory: nothing is swapped automatically.
- Re-entry reuses the return-to-training gap rule; elevated workload only defers a plateau verdict; history is never rewritten; no persisted field or migration was added.
- Tests: `tests/progression-longitudinal.test.cjs` (32 tests) and two longitudinal scenarios (ten weeks: progress, a wall, a layoff, re-entry; determinism).

Validation after Phase 11: `npm test` 507/507, `npm run verify` (release audit PASS, 0 warnings), `npm run build`, QA contracts 25/25, the Playwright e2e suite 81/81, longitudinal quick 724 PASS / 0 FAIL. Mutation checks: 17 of 18 mutations of the transition table, state derivation, variation rules and integration are caught by the tests; the survivor removes a redundant pattern check in the variation filter (graph validation and the equivalence rule already guarantee it), and a test pins the behaviour. Not re-run: the browser corpus, longitudinal standard/endurance/full, any Android build or device check.

## Phase 12: deload and recovery 2.0 (after Phase 11, not yet released or committed)

Version and `versionCode` are unchanged (4.0.0 / 7).

- `src/engine/fatigue.ts` is a deterministic fatigue model (workload ratio and spike, repeated high effort, dense weeks, stalls, decline) with states NORMAL / ELEVATED / HIGH / RECOVERY_REQUIRED, a deload status (normal, temporary_fatigue, sustained_fatigue, deload_recommended, deload_active, recovery_complete) and a recovery trend. Rules, thresholds and the product-rule disclaimer are in `docs/TRAINING_SEMANTICS.md` section 14. Recovery check-ins are not an input.
- A deload is started only by the athlete (`startDeload` in `src/engine/deload.ts`, one Home button) and only while the engine recommends one. While active it prescribes 2 load steps lower, one fewer set and RIR + 2 through `personalizedLoad`; deload sessions are not progression evidence; the 7 days after it carry no increase. The existing return-to-training rule is reused (`loadStepsBelow` is shared) and never stacked.
- A plateau is fatigue only with corroborating load signals; HIGH fatigue with stalls defers the Phase 11 plateau verdict (`RECOVER / recovery_hold`). The Phase 11 table, Phase 9 rolling (one pass-through argument) and Phase 10 ranking are otherwise untouched.
- Persistence: one optional field, `AppState.deloads` (accepted start days), normalised in the repository and covered by the Phase 7 arbitration tests. No schema change.
- Tests: `tests/fatigue-deload.test.cjs` (27 tests), a `deloads` case in `tests/phase7-persistence.test.cjs`, and two longitudinal scenarios (ten weeks with an accepted deload; determinism).

Validation after Phase 12: `npm test` 536/536, `npm run verify` (release audit PASS, 0 warnings), `npm run build`, QA contracts 25/25, the Playwright e2e suite 81/81, longitudinal quick 726 PASS / 0 FAIL. Mutation checks: 22 of 22 mutations of the fatigue rules, deload prescription, evidence filter, resume and gating are caught by the tests. The Home deload card has no browser test. Not re-run: the browser corpus, longitudinal standard/endurance/full, any Android build or device check.

## Phase 13: warm-up system 2.0 (after Phase 12, not yet released or committed)

Version and `versionCode` are unchanged (4.0.0 / 7).

- `src/engine/warmup.ts` generates warm-ups deterministically from the working load, the exercise load semantics, the athlete's own load list and what earlier exercises in the session already prepared. Rules and equipment semantics are in `docs/TRAINING_SEMANTICS.md` section 15. Machines, dumbbells, barbells (never under a known bar), bodyweight (repetition preparation only), assisted (more assistance, never reversed) and no-load or timed movements are covered; light work gets none.
- A warm-up is an ordinary set of type `warmup`: no new field, no new persistence. Every analytics path already filters it through `isWorkingSet`, and tests prove identical results with and without heavy warm-ups for progression, longitudinal exposure, volume, PRs, completion counts, fatigue/deload and selection exposure.
- Session: generated once at first hydration, labelled WARM-UP n / m, completed (short rest, no feedback step), skipped (never blocks the session) or edited (stays on that set; the working load is never touched). Working-set counters, `prescribedSets`, add/remove set and calendar marks count working sets only.
- Tests: `tests/warmup.test.cjs` (19), `tests/golden/warmups.json` (14 golden cases) and one Playwright test; 22 mutations of the generator and its wiring are caught.

Validation after Phase 13: `npm test` 555/555, `npm run verify` (release audit PASS, 0 warnings), `npm run build`, QA contracts 25/25, the Playwright e2e suite 82/82, longitudinal quick 726 PASS / 0 FAIL. Not re-run: the browser corpus, longitudinal standard/endurance/full, any Android build or device check.

## Phases 14-16: weekly analytics, Coach 2.0, Ask Coach 2.0 (after Phase 13, not yet released or committed)

Version and `versionCode` are unchanged (4.0.0 / 7). Rules are in `docs/TRAINING_SEMANTICS.md` section 16.

- Phase 14: `src/engine/weeklyAnalytics.ts` derives a read-only local-calendar week (Monday start): volume and direct/indirect muscle sets (warm-ups and invalid sets excluded), consistency (planned, completed, missed, skipped, adherence, streak), progression (Phase 11 exposure kinds and decisions), recovery (the Phase 12 assessment) and a same-days week comparison with explicit `not_enough_data`. Shown on Progress, Overview.
- Phase 15: `src/coach/briefing.ts` synthesises the existing engine decisions into at most three prioritised, actionable items with reasons, severity and metrics, or `insufficient_data`. It never writes a load or invents an exercise. Shown on the Coach screen and as one "Next:" line on Home.
- Phase 16: `src/coach/askContext.ts` is the single structured context (no identity, notes or check-in values); `askCoach.ts` gains weekly review, focus today, deload, exercise change and a richer plateau answer, and a strict contract (answer, evidence, prescription, limitations, next action). The AI grounding now carries the engine prescription and next step as facts; AI stays optional, off by default and unable to change a prescription.
- No persisted field, no migration, no change to the training engine or to the existing Coach decision pipeline.
- Tests: `tests/weekly-analytics.test.cjs` (14), `tests/coach-briefing.test.cjs` (17), `tests/ask-coach-2.test.cjs` (17), `tests/coach2-golden.test.cjs` + `tests/golden/coach2.json` (3 athletes), one Playwright test; 25 of 25 mutations of the analytics, briefing priorities and Ask Coach contract are caught.

Validation after Phases 14-16: `npm test` 605/605, `npm run verify` (release audit PASS, 0 warnings), `npm run build`, QA contracts 25/25, the Playwright e2e suite 83/83, longitudinal quick 726 PASS / 0 FAIL. Not re-run: the browser corpus, longitudinal standard/endurance/full, any Android build or device check.

## Phases 17-18: motion system and UI decomposition (after Phase 16, not yet released or committed)

**Phase 17.** `src/apex-motion.css` (loaded last) is the one place for motion tokens (durations, easings, press scale, stagger, distances), shared press feedback (zero-specificity, skips disabled/busy controls), screen/sheet/list/message/rest-timer/progress transitions, a skeleton, focus rings and viewport behaviour. Only transform and opacity are animated. Reduced motion (OS setting or the APEX preference) collapses the tokens, so nothing travels and nothing waits; `ui/motion.ts` reads the same tokens, so script and CSS agree. Sheets now exit through an `is-closing` state (idempotent, so a double tap or Escape plus a tap closes once; focus restoration unchanged). Screens record navigation direction (`data-nav-dir`) so Android back arrives from where you came, and a back press within 140 ms of the last is ignored. Enter animations use fill-mode `backwards` so they no longer hold their end state over `:active`. The Coach shows a skeleton while an optional AI explanation is pending. No engine, data or behaviour change.

**Phase 18.** `src/main.tsx` (4,584 lines) is now the 26-line entry. Extracted: `App.tsx` (shell, routing, state flow), `ui/` (primitives, dialogs, navigation/command sheet, motion, shared formatting, state and set helpers) and `screens/` (Home, Train, Workout, SetEditor, Progress, Coach, You, Nutrition, Library, Onboarding). Code was moved, not rewritten; layering is ui <- screens <- App <- main with no cycles. Source-contract tests read the UI tree through `tests/ui-source.cjs`. Two test edits were forced by the move and keep their intent: the package.json import path, and the onboarding test now checks `generateRollingWorkouts` (its old `createWorkout` match was an unused import that the extraction removed). A dead constant (`PROFILE_EQUIPMENT_OPTIONS`) was dropped.

Tests: `tests/motion-system.test.cjs` (10), `tests/ui-architecture.test.cjs` (6), `tests/e2e/motion.spec.ts` (4). Not re-run: the browser corpus, longitudinal standard/endurance/full, any Android build or device check.

## Phases 19-22 and the final validation (4.1.0 release candidate, after Phase 18)

**Phase 19, persistence and backup.** The backup envelope carries a checksum; restore refuses a damaged, truncated, malformed, empty or newer-than-supported backup (envelope or data version) before anything is replaced, so a restore is all or nothing, and the state it replaced is kept as one undo generation ("Undo last restore" in Settings). Plain-list records (goals, measurements, journal, templates) get the workout list's guarantee: non-objects dropped, exact duplicates dropped, a different record reusing an id re-id'd, a clean list untouched, so hydrate/save cycles never add or remove a record. An unreadable native (SQLite) payload is preserved before the next save can overwrite it (with a recovery notice when nothing local exists); native write failures are recorded and visible through `repository.nativeStatus()`. Tests: `tests/persistence-hardening.test.cjs` (14). The migration runner, arbitration and corrupt-recovery suites from Phase 7 are unchanged.

**Phase 20, notifications.** One scheduler (the existing `notificationIntents` plus the native adapter), now deterministic and de-duplicated: a ledger keeps a fired notification from firing again and a pending one at its first time; the missed-session follow-up is the same evening, then a short window, never late at night; the weekly review is planned for the coming Sunday evening in advance and carries no stale numbers; the training reminder moves to the next session still ahead when today's 07:00 has passed (previously it was lost); an engine deload recommendation becomes one Coach reminder (it never starts a deload). The adapter cancels everything APEX scheduled before it schedules, schedules nothing when off or not permitted, asks for permission once automatically and when the user turns reminders on (never repeatedly), creates a channel, serialises syncs, and re-plans on resume, on a new local day and on schedule changes. A tap opens only a known surface. Tests: `tests/notifications-engine.test.cjs` (14).

**Phase 21, AI.** The contract is versioned (`AI_CONTRACT_VERSION`, an optional `contractVersion` in replies). New sentence-level rejections: invented recovery figures, claims that contradict or invent an engine decision (deload, progression, plateau; same stance as the context is kept), and irrelevant text. Self-reported check-in values never reach a provider, not even inside the Coach answer text. Tests: `tests/ai-adversarial.test.cjs` (15).

**Phase 22, release engineering.** Version 4.1.0, versionCode 8 (the update path and application id are unchanged). Release signing is read from `android/keystore.properties` or `APEX_KEYSTORE_*` variables, never the repository; without them the release APK and AAB are unsigned. Debug builds carry a `-debug` version suffix; the manifest sets `allowBackup=false`, drops the unused biometric permissions, and the FileProvider exposes only the app cache. CI installs from the lockfile (`npm ci`), runs the tests, the release audit and the build, builds the debug APK, release APK and AAB, names them by version and uploads them. The release audit now checks version agreement, signing structure, backup setting and ignore rules. `npm audit`: 0 vulnerabilities after one transitive fix. `noUnusedLocals` is on and the dead code it found (unused stepper helpers, an unused function and locals) was removed. Backup export on Android now goes through Filesystem and Share (a blob download does nothing in the WebView).

**Phase 8, Android certification: BLOCKED by an external dependency.** The SDK tools and an x86_64 system image were installed and an AVD created, but the emulator needs hardware acceleration, which needs an administrator on this machine; an arm64 image is refused on an x86_64 host; no device is attached. Nothing was run on Android. A simulated native bridge (`tests/e2e/native-bridge.spec.ts`, 7) covers the JavaScript wiring only. `docs/ANDROID_DEVICE_CERTIFICATION.md` has the details and the exact steps to finish.

**Browser corpus.** Run for the first time since Phase 13: three specs were stale against intended behaviour (warm-ups now precede the first working set; the Progress tab gained a weekly Sessions card) and were updated, not weakened. 28/28.

Final validation (all on this machine, 2026-10-02/03): `npm test` 664+ pass, 0 fail (re-run in the final pass); `npm run verify` audit PASS, 0 warnings; `npm run build`; QA contracts 25/25; full Playwright suite 92/92 plus the native-bridge additions; browser corpus 28/28; longitudinal quick 726/0, standard 6126 PASS / 0 FAIL / 1 REVIEW, full 30126 PASS / 0 FAIL / 1 REVIEW, endurance 3126 PASS / 0 FAIL / 1 REVIEW (the single REVIEW is the documented, unreachable "engine does not validate NaN set values" item). Debug APK, release APK and AAB build; release signing wiring verified with a throw-away key. Not verified: anything on Android.

## Release 3.1.2 (previous)

QA-fix release on top of 3.1.1. Android versionCode 6. Fixes `reduce` so it lowers the load; adds a documented return-to-training rule (`docs/RETURN_TO_TRAINING.md`); surfaces plateau evidence and an optional recovery check-in in the Coach as evidence only; abandons zero-set workouts instead of completing them; preserves and recovers unreadable saved data; hardens engine volume/PR helpers against invalid values. Native Capacitor SQLite and Android runtime remain unverified by the Node test harness.

## Release 3.1.1

APEX 3.0 visual reconstruction complete (reference-matched screens, system states, Units, Log Set screen). Android versionCode 5. QA: visual matrix, full Playwright E2E, unit tests, release audit and debug APK build all passing; physical-device verification pending.

## Current continuation pass — training continuity + plan integrity

This pass continues from the uploaded APEX baseline and hardens the core training loop before optional integrations.

### Training continuity
- Initial generated workouts now use the correct plan day type instead of alternating by array position.
- Initial scheduled workouts carry the originating plan version.
- Plan days are linked to their real workout IDs after generation, with a fallback resolver for older local state.
- Completing a workout can update the next planned session's low-impact prescription from actual evidence through the deterministic adaptation engine.
- Plan edits now advance the workout's `currentPlanVersion`, preserving the distinction between original and current plan context.

### Rescheduling / session semantics
- Rescheduling now preserves the original session as `rescheduled` and creates a separate future scheduled event.
- Train surface exposes explicit Move and Skip actions.
- Reschedule and extra-workout actions write immutable event-log entries.
- Scheduled, rescheduled, skipped, missed and extra work remain distinguishable in history.

### Exercise replacement / editing
- Replacement now checks canonical pattern + load semantics before preserving set structure.
- Comparable replacements receive a fresh set identity while keeping the exercise history boundary explicit.
- Non-comparable replacements reset the baseline instead of pretending performance is directly equivalent.
- Set repetition now uses the real exercise's load semantics rather than a fake placeholder exercise.

### Templates / offline UX
- Templates can be saved, reused and deleted.
- Template use is event-logged.
- Removed the remote Google Fonts dependency so the core UI does not require a network font request.
- Added styling for the new training continuity controls.

### Verification
- Existing Node test suite: **10/10 passing**.
- Full React/Vite/Capacitor build could not be run in this sandbox because npm dependency installation timed out; GitHub Actions remains the intended clean build environment.

## Cost
No paid service is required for the core training experience. External AI/cloud providers remain optional and behind architecture boundaries.

## Latest continuation pass — progress context + measurable goals

### Progress / goals / body context
- Progress surface remains fact-first and now sits alongside explicit goal targets.
- Goals support optional numeric targets, units and target dates rather than title-only objectives.
- Added a dedicated private Body Data surface for weight and optional circumference measurements.
- Measurement entries are date-stamped and immutable; profile weight context is updated without rewriting historical measurements.
- Measurement logging is event-tracked for future longitudinal intelligence.
- Command Center can navigate directly to goals and body measurements.
- You now have an explicit place to build the longitudinal evidence layer before adding more advanced analytics.

### Verification
- Existing Node test suite: **10/10 passing**.
- TypeScript source parsing reaches dependency-resolution/type-checking; the sandbox has no installed React/Capacitor packages, so full application compilation remains delegated to the GitHub Actions build environment.

## Next priority
Deepen exercise-level progress analytics and longitudinal goal milestones, then wire native SQLite as the Android source of truth, followed by encrypted backup/preferences, notification scheduling, and optional provider-agnostic AI.

## Latest continuation pass — exercise trends + feedback

### Progress intelligence
- Progress now supports exercise-level drill-down using the user's actual completed sessions.
- Exercise history shows dated best-load/repetition evidence and recorded RIR when available.
- Goal tracking now displays measurable progress for supported session/load/repetition targets without inventing progress where evidence is absent.
- Recent muscle exposure remains visible as working-set evidence rather than a synthetic score.
- Session completion now includes an optional four-state effort/feel signal and stores it as a local workout journal entry plus event-log evidence.
- Body Data now includes a dated longitudinal measurement history alongside the entry form.

### Verification
- Existing Node test suite: **10/10 passing**.
- Core TypeScript domain/engine sources type-check successfully with the available compiler; full React compilation requires the project dependencies used by GitHub Actions.

### Product completion estimate
- **~78% of the 26-phase product plan**, weighted by actual implementation depth rather than screen count. The remaining work is concentrated in native SQLite source-of-truth wiring, encrypted backup UX, notification scheduling, deeper equipment/library intelligence, accessibility hardening, broader automated testing, and optional provider-agnostic AI integration.

## Latest continuation pass — native persistence + encrypted portability

### Data architecture
- Added an asynchronous persistence path that prefers the native Capacitor SQLite store on Android and retains localStorage as a browser/dev fallback.
- App hydration now restores persisted state before normal save synchronization, preventing an initial render from overwriting native state.
- Reset now clears both browser fallback state and native SQLite state.

### Backup / recovery
- Added user-facing encrypted backup creation and restore controls in You.
- Backup format now uses a random AES-GCM data key with independently wrapped unlock paths for the user passphrase and APEX-generated recovery key.
- Recovery key is generated locally and shown only to the user; APEX does not require an account or server to create/restore the backup.
- Restore accepts the passphrase or recovery key and validates the restored APEX backup format before replacing local state.

### Verification
- Node training engine tests: **10/10 passing**.
- Core source checking remains clean apart from the expected missing Capacitor package typings in this dependency-free sandbox; GitHub Actions installs the declared packages before the Android build.

### Product completion estimate
- **~81% of the 26-phase product plan**, weighted by actual implementation depth. The remaining work is concentrated in deeper exercise/equipment intelligence, notification scheduling, accessibility/Android hardening, richer milestones/analytics, interruption/readiness polish, broader automated tests, and optional provider-agnostic AI.


## Continuation Pass — Pre-Workout Intelligence
- Added a dedicated pre-workout briefing before every session.
- Optional 1–5 readiness check-in is stored as workout context; no fabricated physiological score.
- Briefing surfaces recent evidence, today's adaptations, and first-movement prescription.
- Starting a session now merges briefing notes into the actual workout record.
- Added adaptive notification controls: master switch, workout reminders, missed-workout follow-up, weekly review.
- Core training engine tests remain 10/10 passing.
- Estimated 26-phase product completion: ~83% by implementation depth.


## Latest continuation — Exercise & Persistence Intelligence
- Added equipment-aware exercise discovery and replacement ranking.
- Exercise alternatives now expose equipment fit and comparable-pattern/load semantics.
- Repository hydration now reconciles SQLite and local fallback using state revision instead of blindly trusting one store.
- Training replacement flow explicitly communicates comparable vs new-baseline behavior.
- Core regression suite remains 10/10 passing.

## Latest continuation pass — milestones + workload context + notification planning

### Goal intelligence
- Added deterministic measurable goal progress evaluation.
- Added explicit 25/50/75/100% milestones.
- Goals can show target evidence reached without silently changing or auto-starting a new goal.
- Progress distinguishes measurable and non-measurable targets.

### Advanced performance evidence
- Achievement detection now includes an explicitly labeled estimated-strength record when valid weighted sets (1–10 reps) support an Epley-style estimate.
- Estimated strength is kept distinct from measured load so the UI does not present an estimate as a physical test result.
- Added recent workload context: 30-day completed sessions, working sets and recent-vs-prior four-session average volume.
- This is contextual analytics, not a fabricated physiological readiness score.

### Notification intelligence
- Added a deterministic notification-intent layer for workout reminders, missed-session follow-up and weekly review.
- The You screen now previews the intents APEX would prepare from current context and enabled preferences.
- Actual native Android scheduling/delivery remains isolated as the next platform integration rather than coupling training logic to a service.

### Verification
- Node test suite: **12/12 passing**.
- npm dependency installation timed out in the sandbox, so the complete Vite/Capacitor build remains delegated to the GitHub Actions environment.

## Current product-depth estimate
Approximately **87%** of the 26-phase plan is implemented at meaningful foundation/depth level. Remaining work is concentrated in native notification delivery, deeper knowledge-graph validation, advanced analytics/milestones, interruption/recovery hardening, accessibility, AI gateway, expanded tests, and final Android production QA/polish.


## Continuation — Native Notification Delivery
- Added Capacitor Local Notifications adapter.
- Native Android notification permissions are requested only when notifications are enabled.
- Pending APEX notifications are reconciled from deterministic notification intents.
- Notification delivery is optional and failure-safe: core training never depends on it.
- Added automated notification-planning tests.


## Latest continuation pass — session interruption + recovery

### Workout continuity
- Added persisted `pausedAt` and `pausedTotalSec` session fields.
- Workout elapsed time now excludes intentional pause time while continuing to use wall-clock time for accurate active-session duration.
- Pause/resume survives component remounts and repository persistence.
- Pause/resume writes immutable event-log entries for future longitudinal context.
- Rest countdown remains wall-clock based and is exposed with an accessible live region.
- Existing workout completion, adaptation, replacement, skip, reschedule and notification flows remain intact.

### Verification
- Node regression suite: **15/15 passing**.

### Product completion estimate
- **~91% of the 26-phase product plan**, weighted by actual implementation depth. Remaining work is concentrated in advanced knowledge validation, accessibility/QA, richer analytics, AI gateway integration, native lifecycle hardening, and final production polish.


## Latest continuation — knowledge graph + AI boundary
- Added canonical exercise knowledge validation and bounded relationship checks.
- Added similarity/ranked alternative utilities using movement pattern, load semantics, laterality, muscles, and equipment.
- Added provider-agnostic AI gateway boundary; no provider is required for core functionality.
- AI responses are explicitly marked grounded and receive only supplied facts/recommendations/uncertainties.


## Continuation pass — Analytics + Grounded Coach
- Added longitudinal consistency/adherence and recent volume trend analytics.
- Added deterministic plateau candidate signals with no silent plan changes.
- Replaced Coach's keyword-only responses with a grounded local coach gateway separating facts, inference, recommendation and uncertainty.
- Added accessibility/feedback controls for reduced motion, haptics and sounds.
- Added accessible labels/live presentation for Coach input and trend context.
- Core training tests remain passing.


## Latest continuation — Production integrity & evidence layer
- State integrity inspection and safe hydration
- Repository schema v4 boundary
- SQLite payload schema alignment
- Goal momentum and training-balance analytics
- Session quality helper
- Evidence-first interpretation UI
- Automated contracts expanded to 20 tests


## Latest continuation — Production Integrity & Accessibility Pass
- Strengthened persisted-state migration and nested preference merging.
- Expanded state integrity checks: duplicate IDs, duplicate set IDs, invalid numeric values, knowledge-graph references, and plan/workout references.
- Added System Health visibility in You so integrity/knowledge warnings are transparent rather than silently repaired.
- Improved modal semantics with dialog roles, modal labeling, and accessible close controls.
- Added architecture regression tests covering persistence, encrypted backup, AI grounding, knowledge graph, safety/recovery, notifications, accessibility, and Android CI.
- Automated verification: 28/28 tests passing.
- Dependency installation in the sandbox timed out; Android dependency installation remains delegated to GitHub Actions.


## Latest continuation — production notification ownership
- Native notification cancellation is now scoped to an APEX-reserved ID range; APEX never cancels arbitrary app notifications.
- Notification tap actions can deep-navigate through the native adapter.
- Release-contract tests cover notification ownership, routing, Android build contract, and physical-device readiness requirements.
- Workout pause fields are explicitly represented in the domain type.
- Latest automated test suite: 34/34 passing.


## Latest continuation — release notification hardening
- Fixed missed-workout follow-up scheduling so intents receive a future delivery time.
- Added notification/release contract regression coverage.
- Kept 100% reserved for physical-device, end-to-end and release-build validation.


## Latest continuation — accessibility hardening
- Persistent text scaling and high-contrast preferences
- Reduced-motion class enforcement
- Accessibility helper tests


## Latest continuation pass — optional local AI providers + final evidence boundary
- Added an optional zero-cost local Ollama-compatible provider; APEX core remains fully functional without it.
- Added an optional OpenAI-compatible adapter without adding an SDK dependency or persisting API keys in core state.
- Hardened the AI gateway with bounded prompt/context sizes and a provider-failure boundary so optional AI cannot break training.
- Added provider-level regression coverage and release-audit checks.
- Current automated verification: 44/44 tests passing in the release source.
- Product completion estimate remains approximately 99%; remaining work is real-device/release validation rather than feature inflation.


## Final implementation status
The 26-phase product implementation is complete. The remaining release checklist is physical Android/device certification and cannot be honestly marked as executed from the source-only sandbox.


## Latest continuation — longitudinal review fixes
- Fixed `reduce` so it lowers the prescribed load (one increment, or more assistance on assisted movements).
- Added a documented, deterministic return-to-training rule (`docs/RETURN_TO_TRAINING.md`).
- Plateau evidence (same-load, non-zero output) now reaches the Coach as options with honest confidence; no silent plan change.
- Added an optional Recovery check-in (sleep, sleep quality, soreness, fatigue). It is Coach evidence only and never a prescription input.
- A workout with zero logged sets is abandoned ("End without recording"), not completed.
- Unreadable saved data is preserved, announced and recoverable; starting fresh is an explicit, confirmed choice.
- Engine volume/PR helpers no longer let NaN, Infinity or negative set values into totals.
- Native Capacitor SQLite and Android runtime remain NOT VERIFIED (no emulator/device in the Node harness).


## Beginner-first workout simplification (presentation only)
- The engines are unchanged (selection, progression, fatigue, deload, warm-ups, analytics, Coach, persistence). Only what the athlete must see and tap changed.
- Default workout view: exercise, how to do it, today's weight, reps, START SET / LOG SET, rest, next. Everything else sits behind **More → Advanced controls** (a device display preference).
- The session brief uses the equipment from setup as the default answer; **Change** keeps the per-exercise override. "Why this weight?" and the readiness check-in are collapsed.
- The first set starts from the exercise screen with one START SET; the active set has a visible **LOG SET**. RIR is never recorded unless the athlete enters it. Set feedback and session feedback are optional ("Not sure · skip", "Done").
- Skip workout, Extra session, Remove set and Skip set ask first. The Journal pill opens the Journal. Home, Train and Progress show one next step until the first workout is completed.
- Tests: `tests/beginner-workout-ux.test.cjs`, `tests/e2e/beginner-workout.spec.ts`.
