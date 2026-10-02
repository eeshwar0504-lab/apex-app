# APEX 4.1.0 — Release Readiness

## Current status
APEX 4.1.0 (versionCode 8) is a release candidate. Automated validation (Node tests, release audit, web build, Playwright, the browser corpus, the longitudinal simulator) is the source of truth for what is verified; current counts are recorded in `BUILD_STATUS.md`, not here. The log below this section is history and its test counts are superseded.

**Code readiness** is complete for the roadmap (persistence and backup, notifications, AI boundary, UI and motion, release engineering). **Release readiness has two external gates that code cannot close:**
1. *Android runtime certification.* No emulator or device could be run on the development machine: the emulator needs hardware acceleration (an administrator must enable Windows Hypervisor Platform), and no phone is attached. The native SQLite engine, real notification delivery, the share-sheet backup export, process-death recovery and TalkBack are NOT VERIFIED. `docs/ANDROID_DEVICE_CERTIFICATION.md` records what was attempted and the exact steps to finish.
2. *Release signing.* The release APK and AAB are produced unsigned. Signing needs the owner's keystore, supplied from outside the repository (`android/keystore.properties` or the `APEX_KEYSTORE_*` variables or CI secrets). No key exists in the repository. The wiring was verified with a throw-away key that was then deleted.

Deferred decision: `safetyCheck` in `src/engine/training.ts` is defined and exported but is not called by any runtime path. Whether to connect it to load-setting or remove it is still to be decided.

## Historical log (superseded)
Everything from here down was written during earlier releases and is kept for the record. Counts such as "40/40" describe that moment only.

### Verified locally (at that time)
- Missed-workout notification intents now receive a future delivery window rather than an immediate timestamp that could be filtered out.
- 40/40 Node regression tests passed.
- Deterministic training engine remains authoritative.
- State integrity validation is active.
- Encrypted backup path exists.
- Native SQLite and notification adapters are isolated behind boundaries.
- Accessibility controls and modal semantics are present.
- Android CI workflow contains the debug APK build gate.

### Must pass before 100%
- Clean GitHub Actions Android build from the uploaded source.
- Install and exercise the APK on a physical Android device.
- Verify SQLite persistence across process death and successful reopen recovery.
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
