# APEX v2 — Release Readiness

## Current status
APEX is feature-complete against the 26-phase plan. The remaining release gate is external Android/device certification, which cannot be truthfully simulated in this source sandbox.

APEX is in final production-hardening and approaching release-candidate validation.
The application source now includes explicit native notification ownership/deep-link boundaries and additional release-contract tests.

### Verified locally
- Missed-workout notification intents now receive a future delivery window rather than an immediate timestamp that could be filtered out.
- 40/40 Node regression tests pass.
- Deterministic training engine remains authoritative.
- State integrity validation is active.
- Encrypted backup path exists.
- Native SQLite and notification adapters are isolated behind boundaries.
- Accessibility controls and modal semantics are present.
- Android CI workflow contains the debug APK build gate.

### Must pass before 100%
- Clean GitHub Actions Android build from the uploaded source.
- Install and exercise the APK on a physical Android device.
- Verify SQLite persistence across process death.
- Verify backup/restore with both passphrase and recovery key.
- Verify notification permission, scheduling, cancellation and deep navigation.
- Verify lock/background/call interruption during an active workout.
- Verify TalkBack, large text, reduced motion and touch targets.
- Complete final exercise knowledge validation.
- Complete performance/security review.
- Complete release UI/UX pass.

## Completion policy
Implementation coverage is complete across the 26-phase plan. Production certification still requires a real Android build/device run; this is a validation gate, not unfinished product functionality.

### Latest hardening pass
- Added persistent text-size controls: System / Large / Larger.
- Added high-contrast mode and reduced-motion class enforcement.
- Added pure accessibility normalization helpers with regression coverage.


### Latest release-candidate verification pass
- Added a dependency-free release audit covering required architecture files, offline font policy, encrypted backup primitives, notification ownership, repository integrity, and Android CI build gates.
- CI now runs the regression suite and release audit before compiling the Android application.
- Added `npm run verify` as the combined regression + release-contract command.
- APK artifacts are retained for 14 days in CI.


### Latest AI boundary pass
- Optional local Ollama-compatible adapter added with a 15-second timeout and failure-safe behavior.
- Optional OpenAI-compatible adapter added without introducing an SDK or making any provider mandatory.
- Gateway bounds supplied context and always preserves the deterministic engine as authoritative.


### Final completion pass
- Removed fake onboarding defaults: experience, goal, training days, session duration, and equipment now require explicit user choices.
- Added regression coverage for the onboarding contract.
- Core feature implementation is complete; remaining work is physical-device certification only.
