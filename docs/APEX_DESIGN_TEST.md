# The APEX Design Test

Every new interface feature has to pass five questions. If it does not, simplify it.

1. **Does it make the product easier to understand?** The Guided view is the default; a first-time user sees the exercise, how to do it, the weight, the reps and one action.
2. **Does it communicate something meaningful?** Motion, colour and the APEX Line only ever show cause, state, progress, location or continuity. A routine action gets no full-screen animation.
3. **Does it preserve APEX's visual identity?** Near-black, ivory type, restrained amber ("gold is earned"), tonal surfaces, no neon, no confetti, no gradients as decoration.
4. **Does it remain simple for Guided users?** Anything beyond the essentials sits behind a Standard or Advanced disclosure, in the same component, never in a second app.
5. **Does it preserve access to deeper functionality?** Nothing was removed: RIR, set types, tempo, notes, history, evidence, reasoning and manual controls are one level away.

## Where each system lives

| System | Where |
|---|---|
| APEX Line | `ApexLine` in `src/ui/primitives.tsx`: session progress, rest timer, week baseline, goal trajectory, completion signal |
| Session Thread | the `session-thread` view-transition name on Home, the briefing, the workout, the dock, the completion artifact and the week node; `SessionDock` |
| Guided / Standard / Advanced | `src/ui/experience.tsx` (one context, one preference, `preferences.uiExperience`); changes density only |
| Motion vocabulary | `mo-emerge`, `mo-settle`, `mo-travel`, `mo-fold`, `mo-recede`, `mo-breathe`, `mo-release` and the view transitions in `src/apex5.css` |
| Training Map | `src/screens/TrainingMap.tsx`, `src/ui/week.ts`, scale Session / Week / Block / History on Train |
| Ghost Set | `GhostSet` in `src/screens/WorkoutParts.tsx`, fed by `src/ui/previous.ts` (reads history, never prescribes) |
| Cause → effect | `CausePath`: set, exercise, session, week, drawn once after a set is logged |
| Observatory | `src/screens/Progress.tsx`, `ProgressParts.tsx`: overview, dimensions, evidence (every point opens its sets) |
| Coach | observation system in `Coach.tsx`, structured answers, contextual `CoachSheet`, inline answer in the dossier |
| Exercise Dossier | `ExerciseSheet` in `Library.tsx`, opens over the workout and grows from the tap |

## What APEX does not do

No generic fitness neon, no confetti, no streak guilt, no social feed, no dashboard of equal widgets, no gesture-only critical action, no chatbot-first Coach, no fake personalisation, no decorative 3D, no advanced controls forced on a beginner, and no change to the training logic when the UI Experience changes.
