# APEX 3.0 Visual QA

This suite is an automated guardrail for the APEX 3.0 mobile visual system.

It checks:
- 412x915 mobile viewport integrity
- horizontal overflow
- right-edge clipping
- bottom navigation viewport anchoring
- bottom navigation remaining fixed while scrolling
- Home critical surfaces staying inside the viewport
- Train / Progress / You layout integrity
- tablet viewport integrity
- splash animation presence and minimum visible duration
- reduced-motion splash behavior
- screenshot evidence for key screens

Run:

```powershell
npx playwright test tests/e2e/visual-qa.spec.ts --reporter=line
```

The screenshots are evidence artifacts, not pixel baselines yet. Once the APEX 3.0 visual design is finalized, approved screenshots can be promoted to Playwright snapshot baselines for true visual-regression testing.
