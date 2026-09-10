# APEX 2.1.0 build status

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
