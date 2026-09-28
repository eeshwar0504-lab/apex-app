# APEX 3.0 — Full Automated UI/UX QA

This package adds a broad Playwright QA suite without replacing the existing functional E2E tests.

## Install

Copy:

```text
tests/e2e/apex-qa.spec.ts
```

into:

```text
tests/e2e/
```

The suite intentionally reuses the existing `tests/e2e/helpers.ts`.

## Run

```powershell
npx playwright test tests/e2e/apex-qa.spec.ts --reporter=line
```

## Coverage

The suite covers:

- Home viewport integrity
- horizontal overflow
- right-edge overflow
- critical element viewport geometry
- bottom navigation fixed/sticky behavior
- bottom-nav position after scrolling
- primary navigation
- Command Center routing
- all first-class routes
- accessible interactive names
- practical touch-target dimensions
- normal/reduced motion
- accessibility persistence
- large text layout integrity
- high contrast layout integrity
- Train
- Progress
- You
- 360px / 390px / 412px mobile widths
- 768px tablet layout
- splash visibility window
- reduced-motion splash path
- screenshots for major screens
- route-wide 412px overflow checks

## What it does NOT claim

Playwright browser emulation is not identical to a physical Android WebView/GPU.

Therefore final APEX release QA still needs:

1. automated Playwright QA
2. GitHub Actions build
3. physical Android smoke test

## Visual regression policy

This suite captures screenshots as evidence but does NOT establish golden baselines yet.

APEX 3.0 is still being redesigned. Once a screen is approved, its screenshot can be promoted to a Playwright snapshot baseline.

Do not create golden baselines from an unfinished design.
