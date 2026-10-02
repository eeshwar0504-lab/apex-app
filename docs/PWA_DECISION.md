# PWA decision

**Decision: APEX does not ship as a PWA. The installable product is the Capacitor Android app.**

## Evidence (state of the repository when this was decided)

* There was no served web app manifest and no service worker. `index.html` linked `/manifest.webmanifest`, but the only
  copy was a stray file at the repository root, outside `public/`, so the build never published it and every load
  requested a missing resource. The dead link was removed, and the stray root file was deleted in Phase 7 so the
  repository itself now matches this decision.
* A half-started install-prompt type and unused state in `src/main.tsx` were removed with it.
* The app's persistence is `localStorage` (`apex-state-v4`) with a native SQLite single-row store on Android. Neither is
  designed for a browser install: browsers may evict `localStorage` for sites that are not installed or are under storage
  pressure, and APEX holds the athlete's only copy of their training record.
* Offline behaviour is already complete in the Android shell (the web bundle ships inside the APK). A service worker would
  add a second caching layer that can serve a stale bundle against newer persisted data.
* Native-only capabilities APEX already uses or plans to use (local notifications, haptics, file export) go through the
  Capacitor adapters, not browser APIs.

## What this means

* No manifest, no service worker, no install prompt, no offline cache in the web build.
* The web build remains a development and QA surface (`npm run dev`, `npm run preview`, Playwright).
* `tests/pwa-decision.test.cjs` keeps the code consistent with this decision: no dangling manifest link, no service worker
  registration, no install-prompt code.

## Revisit when

All of the following become true: a browser-first audience is a product goal, persistence is moved to IndexedDB with an
explicit export/restore prompt, and a service-worker update strategy is designed so it can never serve a bundle older
than the stored data schema. Until then, shipping a manifest alone would advertise an install experience that cannot
protect the athlete's data.
