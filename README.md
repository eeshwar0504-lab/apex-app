# APEX 2.1.0

APEX 2.1.0 is a local-first, adaptive training companion built around guided workout sessions and intelligent workout tracking.

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
npm install
npm run dev
npm test
npm run build
```

Android:
```bash
npm run cap:sync
```

The GitHub Actions workflow builds the Android debug APK.

See `PHASES.md` for the full 26-phase product map and `BUILD_STATUS.md` for the current implementation state.


## Current continuation status
APEX is approximately **83% complete** against the 26-phase product plan by implementation depth. The current focus is training intelligence, session resilience, analytics, notification infrastructure, accessibility, and final production hardening.


## Current continuation
Session pause/resume is persisted and event-logged; active elapsed time excludes intentional pauses while rest timers remain wall-clock based.


## Latest continuation
Safety check flow, canonical exercise knowledge validation, ranked substitution intelligence, and a provider-agnostic AI boundary were added. Core remains offline-first and AI is optional.


## Optional local AI
APEX can operate entirely without AI. Advanced users/integrators may provide a local Ollama-compatible endpoint through `LocalOllamaProvider`; no paid API is required by the core app. An OpenAI-compatible adapter is also available as an optional integration boundary.
