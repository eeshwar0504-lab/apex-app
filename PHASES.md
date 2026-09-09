# APEX v2.0 — 26 Phase Implementation Map

This is the from-scratch implementation baseline. Secondary infrastructure is deliberately non-blocking; training and UX take priority.

| Phase | Area | Implementation baseline |
|---|---|---|
| 0 | Product/architecture | Typed domain model, repository boundary, deterministic engine |
| 1 | Design system | Tokens, typography, surfaces, spacing, motion, components |
| 2 | Brand identity | APEX symbol, combined marks, splash, favicon assets |
| 3 | Onboarding | Progressive goal/experience/schedule/equipment setup |
| 4 | Exercise knowledge | Structured canonical exercise graph + aliases/alternatives |
| 5 | Training engine | Prescription, progression, load semantics, context |
| 6 | Workout experience | Focused session, set controls, persistence, rest |
| 7 | Exercise Coach | Text-first setup, steps, breathing, cues, safety, alternatives |
| 8 | Workout intelligence | Performance-context feedback and adaptive recommendations |
| 9 | Completion | Session summary architecture and achievements |
| 10 | Adaptive Home | Context-ranked editorial Home |
| 11 | Progress | Strength/volume/exposure/body/achievement views |
| 12 | History | Immutable session timeline |
| 13 | Goals | Goal portfolio + targets/milestones |
| 14 | Plan Studio | Editable days/workouts with version bumping |
| 15 | Exercise Library | Search, aliases, filters, canonical detail |
| 16 | Equipment | Equipment-aware exercise/program foundations |
| 17 | Personal intelligence | Evidence-based observations model |
| 18 | AI Coach | Local deterministic Coach + provider-agnostic interface |
| 19 | Command Center | Structured navigation/intent layer |
| 20 | Learn | Adaptive glossary |
| 21 | Notifications | Preference layer + actionable architecture |
| 22 | Backup/data | Portable JSON export/import baseline; encryption boundary documented |
| 23 | Resilience | Local persistence, recoverable active sessions, safe destructive actions |
| 24 | Accessibility/polish | Responsive layouts, touch targets, reduced motion, safe areas |
| 25 | Testing | Core progression and semantic tests; CI build gate |
| 26 | Android build | Capacitor + GitHub Actions debug APK pipeline |

## Explicit scope rule
Cloud-provider OAuth, remote AI, and other external integrations never block the core training product. They plug into interfaces later. Core training remains local and free.

## Persistence note
The app repository is deliberately storage-agnostic. `sqliteAdapter.ts` provides the Android SQLite adapter contract while the browser fallback keeps the project runnable as a PWA. The domain layer does not access SQLite APIs directly.
