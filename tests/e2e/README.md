# APEX E2E test suite

The E2E suite validates the app as a user would experience it, on top of the existing Node/engine tests.

## Coverage

- onboarding gating and plan creation
- responsive UI at desktop, tablet and mobile viewports
- horizontal overflow / clipped interactive controls
- command center navigation
- Home / Train / Progress / You navigation
- Coach input via Enter and button click
- Coach decision/confidence output
- training session launch
- equipment confirmation gating
- active-set logger controls
- pause/resume interaction
- animation presence
- reduced-motion behavior
- basic accessibility naming and dialog semantics
- traces, screenshots and videos on failures

## Commands

```bash
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:ui
npm run test:e2e:report
npm run verify:full
```

The Android/native layer still needs physical-device validation. Browser E2E is the automated first line; it does not replace real Android lifecycle, haptics, notifications, SQLite, keyboard, and device-performance checks.
