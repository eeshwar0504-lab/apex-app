# APEX 4.1.0

APEX 4.1.0 is a local-first, adaptive training companion built around guided workout sessions and intelligent workout tracking.

## Principles
- Training and tracking first
- Near-black + amber/gold premium UI
- Offline/local-first core
- Deterministic training engine as source of truth
- AI is optional and provider-agnostic
- User control and explainability
- No paid infrastructure required for the core product

## Development
```bash
npm ci
npm run dev
npm test          # Node suites
npm run verify    # tests + release audit
npm run build
```

Android (needs the Android SDK and JDK 21):
```bash
npm run build && npm run cap:sync
cd android && ./gradlew assembleDebug        # debug APK
cd android && ./gradlew assembleRelease bundleRelease   # release APK and AAB
```
Release builds are unsigned unless the signing credentials are supplied from outside the repository: copy
`android/keystore.properties.example` to `android/keystore.properties` (git-ignored) or set `APEX_KEYSTORE_PATH`,
`APEX_KEYSTORE_PASSWORD`, `APEX_KEY_ALIAS` and `APEX_KEY_PASSWORD`. No signing key is in the repository.

The GitHub Actions workflow (`.github/workflows/android-apk.yml`) installs from the lockfile, runs the tests and the release audit,
builds the web app, then builds the debug APK, the release APK and the release bundle, and uploads them. A second workflow
(`apex-automated-qa.yml`) runs the Playwright QA gate.

See `PHASES.md` for the original 26-phase product map (historical) and `BUILD_STATUS.md` for the current implementation state.


## Current status
APEX 4.1.0 is the current release candidate. The deterministic engine, Coach, exercise graph, persistence and backup, local notifications and the optional AI explanation layer are implemented and covered by the automated suites (`npm test`, `npm run verify`, Playwright, the browser corpus, the longitudinal simulator). Counts are recorded in `BUILD_STATUS.md`, not here.

**Not verified:** the Android runtime. No emulator or device could be run on the development machine (hardware acceleration needs an administrator), so the native SQLite engine, real notification delivery, the share-sheet backup export and TalkBack have never been exercised on Android. A simulated native bridge in Chromium covers the JavaScript wiring only. `docs/ANDROID_DEVICE_CERTIFICATION.md` is the record and the procedure. The release APK and bundle are produced unsigned; signing needs the owner's keystore, which is an external secret.


## Current continuation
Session pause/resume is persisted and event-logged; active elapsed time excludes intentional pauses while rest timers remain wall-clock based.


## Latest continuation
Safety check flow, canonical exercise knowledge validation, ranked substitution intelligence, and a provider-agnostic AI boundary were added. Core remains offline-first and AI is optional.


## Optional local AI
APEX can operate entirely without AI. Advanced users/integrators may provide a local Ollama-compatible endpoint through `LocalOllamaProvider`; no paid API is required by the core app. An OpenAI-compatible adapter is also available as an optional integration boundary.
