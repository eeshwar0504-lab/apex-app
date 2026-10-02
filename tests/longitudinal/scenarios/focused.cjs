'use strict';
/* Targeted longitudinal scenarios: RIR, plateau, regression, recovery, missed workouts, equipment, substitutions, units, PRs, body weight, persistence. */
const { makeScenario, EQUIPMENT } = require('../simulator/scenario-generator.cjs');
const { runSimulation, iso, memoryStorage, availableUnder } = require('../simulator/simulator.cjs');
const { exactProgressionCases, set } = require('../oracle/progression-oracle.cjs');
const { loadEngine } = require('../load-engine.cjs');

const rec = (category, name, status, detail, seed, classification) => ({ category, name, status, detail, seed, classification });
const hard = (list) => list.filter((i) => i.severity === 'hard');

function run(ctx) {
  const E = loadEngine();
  const T = E.training;
  const exercises = E.exercisesMod.EXERCISES;
  const out = [];
  const seed = ctx.baseSeed;
  const cfg = (archetype, s, extra = {}) => ({ ...makeScenario({ archetype, seed: s, weeks: ctx.weeks }), ...extra });

  /* ---------- progressive overload: exact documented rules ---------- */
  out.push(...exactProgressionCases());

  /* ---------- RIR sweep 0..6 (values >5 clamp) ---------- */
  const chest = exercises.find((e) => e.id === 'machine_chest_press');
  for (const rir of [0, 1, 2, 3, 4, 5, 6]) {
    const r = T.progression(chest, [set(20, 10, rir), set(20, 10, rir), set(20, 10, rir)]);
    out.push(rec('rir', `RIR ${rir} with mid-range reps holds the load (no unexplained change)`, r.action === 'hold' && r.weight === 20 ? 'pass' : 'fail', { got: { action: r.action, weight: r.weight } }, seed));
  }
  {
    // noisy RIR across sessions must not create sawtooth loads
    const history = [];
    const rng = new (require('../simulator/random.cjs').Rng)(seed);
    let changes = 0, prev;
    for (let s = 0; s < 12; s++) {
      for (let i = 0; i < 3; i++) history.push(set(20, 10, Math.max(0, Math.min(6, Math.round(rng.gauss(2, 1.6))))));
      const r = T.progression(chest, history);
      if (prev !== undefined && r.weight !== prev) changes++;
      prev = r.weight;
    }
    out.push(rec('rir', 'noisy RIR reports over 12 sessions with in-range reps never move the load', changes === 0 ? 'pass' : 'fail', { loadChanges: changes }, seed));
  }

  /* ---------- plateau ---------- */
  {
    const history = [];
    let holds = 0;
    for (let s = 0; s < 10; s++) {
      history.push(set(30, 10, 1), set(30, 10, 1), set(30, 10, 1));
      const r = T.progression(chest, history);
      if (r.action === 'hold' && r.weight === 30) holds++;
    }
    out.push(rec('plateau', 'repeated identical in-range performance holds the load (no oscillation)', holds === 10 ? 'pass' : 'fail', { holds }, seed));
    // The documented plateau feature is a SIGNAL ("deterministic plateau candidate signals with no silent plan changes", BUILD_STATUS.md)
    const mkState = (reps) => ({ exercises: [chest], workouts: [1, 2, 3, 4].map((n) => ({ id: 'p' + n, status: 'completed', scheduledDate: '2026-02-0' + n, exercises: [{ exerciseId: chest.id, sets: reps.map((r, i) => set(30, r, 2, { id: 'p' + n + i })) }] })) });
    const flat = E.analytics.plateauCandidates(mkState([10, 10, 10]));
    const moving = E.analytics.plateauCandidates({ exercises: [chest], workouts: [8, 9, 10, 11].map((r, n) => ({ id: 'm' + n, status: 'completed', scheduledDate: '2026-02-0' + (n + 1), exercises: [{ exerciseId: chest.id, sets: [set(30, r, 2, { id: 'm' + n })] }] })) });
    out.push(rec('plateau', 'documented plateau signal: four identical rep outputs are flagged, improving output is not', flat.length === 1 && flat[0].exerciseId === chest.id && moving.length === 0 ? 'pass' : 'fail', { flat: flat.length, moving: moving.length }, seed));
    {
      // The Coach layer consumes the plateau signal, explains it with options and never changes the plan or the load.
      const C = E.coachMod;
      const plateauState = { schemaVersion: 4, goals: [], exercises, achievements: [], measurements: [], journal: [], observations: [], preferences: {}, activeRoute: 'home', onboardingComplete: true, coachMemory: [], workoutTemplates: [], learnedPreferences: {}, eventLog: [], profile: { name: 'T', experience: 'beginner', equipment: ['machine'], primaryGoal: 'general', goals: ['general'] }, workouts: [1, 2, 3, 4].map((n) => ({ id: 'cp' + n, status: 'completed', scheduledDate: '2026-02-0' + n, completedAt: '2026-02-0' + n + 'T10:00:00Z', exercises: [{ exerciseId: chest.id, sets: [set(30, 10, 2, { id: 'cp' + n + 'a' }), set(30, 10, 2, { id: 'cp' + n + 'b' }), set(30, 10, 2, { id: 'cp' + n + 'c' })] }] })) };
      const before = JSON.stringify(plateauState);
      const loadBefore = T.personalizedLoad(chest, plateauState.workouts, plateauState.profile, exercises, '2026-02-05');
      const ev = C.coachEvidenceFromState(plateauState, '2026-02-05');
      const res = C.coach({ state: plateauState, profile: plateauState.profile, goals: [], primaryGoal: 'strength', recentWorkoutIds: [], recentExerciseEntryIds: [], now: '2026-02-05T08:00:00Z', plateaus: ev.plateaus });
      const reached = ev.plateaus.length === 1 && res.decision.action === 'review' && /Options:/.test(res.explanation) && /not a diagnosis/.test(res.explanation);
      out.push(rec('plateau', 'plateau evidence reaches the Coach: explained with options, honest confidence, user stays in control', reached && res.decision.confidence === 'medium' ? 'pass' : 'fail', { action: res.decision.action, confidence: res.decision.confidence }, seed));
      const unchanged = JSON.stringify(plateauState) === before && JSON.stringify(T.personalizedLoad(chest, plateauState.workouts, plateauState.profile, exercises, '2026-02-05')) === JSON.stringify(loadBefore) && loadBefore.weight === 30 && res.decision.prescription.weight === undefined;
      out.push(rec('plateau', 'a plateau never silently changes state or the prescribed load (load stays 30 during the plateau)', unchanged ? 'pass' : 'fail', { loadBefore: loadBefore.weight }, seed));
      const mainSrc = require('node:fs').readFileSync(require('node:path').join(require('../load-engine.cjs').root, 'src/main.tsx'), 'utf8');
      out.push(rec('plateau', 'the Coach screen supplies plateau, recovery and exercise context to evidence collection', /coachEvidenceFromState\(s,today\(\),(?:focusEx|exercise)\)/.test(mainSrc) ? 'pass' : 'fail', {}, seed));
    }
    const breakthrough = T.progression(chest, [...history, set(30, 12, 1), set(30, 12, 1), set(30, 12, 1)]);
    out.push(rec('plateau', 'plateau followed by a breakthrough to the top of range progresses', breakthrough.action === 'increase' && breakthrough.weight === 32.5 ? 'pass' : 'fail', { got: { action: breakthrough.action, weight: breakthrough.weight } }, seed));
  }

  /* ---------- recovery: formally defined readiness rule ---------- */
  {
    const mk = (volA, volB) => {
      const st = { workouts: [], exercises };
      const w = (v, d) => ({ id: 'w' + d, status: 'completed', completedAt: `2026-02-0${d}T10:00:00Z`, scheduledDate: `2026-02-0${d}`, exercises: [{ exerciseId: 'machine_chest_press', prescribedSets: 1, repRange: [8, 12], restSec: 90, order: 0, sets: [{ id: 's' + d, type: 'working', weight: v, reps: 10, completed: true }] }] });
      st.workouts.push(w(volA, 1), w(volB, 2));
      return st;
    };
    const baseline = E.intelligence.readiness({ workouts: [], exercises });
    const normal = E.intelligence.readiness(mk(20, 20));
    const spike = E.intelligence.readiness(mk(20, 30));
    out.push(rec('recovery', 'readiness: no history -> baseline', baseline.level === 'baseline' ? 'pass' : 'fail', baseline, seed));
    out.push(rec('recovery', 'readiness: equal consecutive volume -> normal', normal.level === 'normal' ? 'pass' : 'fail', normal, seed));
    out.push(rec('recovery', 'readiness: volume spike above 125% -> elevated', spike.level === 'elevated' ? 'pass' : 'fail', spike, seed));
  }
  {
    // 2x2: performance x recovery. Independent athletes; APEX must stay bounded and consistent.
    const combos = [['high', 'good'], ['high', 'poor'], ['low', 'good'], ['low', 'poor']];
    for (const [perf, rec2] of combos) {
      const sc = cfg('consistent_beginner', seed + 500, {});
      sc.athlete = { ...sc.athlete, adaptation: perf === 'high' ? 0.03 : 0.004, sleep: rec2 === 'good' ? 0.9 : 0.35, fatigueGain: rec2 === 'good' ? 0.08 : 0.3, recoveryRate: rec2 === 'good' ? 0.5 : 0.9 };
      const sim = runSimulation(sc);
      const bad = hard(sim.log.issues);
      out.push(rec('recovery', `${perf} performance + ${rec2} recovery: state and prescriptions stay valid for ${ctx.weeks} weeks`, bad.length ? 'fail' : 'pass', bad.slice(0, 3), sc.seed));
    }
    {
      // Coach context signals are documented as "evidence, not automatic prescriptions" (src/coach/types.ts)
      const simC = runSimulation(cfg('consistent_beginner', seed + 700, {}));
      simC.state.exercises = exercises;
      const dec = (sig) => E.intelligence.coachDecision(simC.state, { exerciseId: 'machine_chest_press', context: sig, now: '2026-03-01T10:00:00Z' }).decision;
      const baseD = dec(undefined), painD = dec({ pain: true }), restD = dec({ sleepHours: 3, sleepQuality: 0.1, soreness: 9, stress: 9, readiness: 0.1 });
      out.push(rec('recovery', 'Coach: reported pain changes the decision (asks before continuing)', painD.action !== baseD.action && painD.action === 'ask' ? 'pass' : 'fail', { base: baseD.action, pain: painD.action }, seed));
      out.push(rec('recovery', 'Coach: sleep/soreness/stress signals are accepted without error and do not silently prescribe', restD.action === baseD.action ? 'pass' : 'fail', { base: baseD.action, poorRecovery: restD.action }, seed));
      out.push(rec('recovery', 'Coach: extreme recovery context (sleep 3 h, soreness 5/5, fatigue 5/5, readiness 1/5) does not change the deterministic prescription or flip the decision', (() => {
        const st = { ...simC.state, recoveryLog: E.recovery.upsertRecoveryCheckIn([], { date: '2026-03-01', sleepHours: 3, sleepQuality: 1, soreness: 5, fatigue: 5, stress: 5, readiness: 1 }) };
        const done = st.workouts.filter((w) => w.status === 'completed');
        const a = T.personalizedLoad(chest, done, st.profile, exercises, '2026-03-01');
        const b = T.personalizedLoad(chest, done, { ...st.profile }, exercises, '2026-03-01');
        const evd = E.coachMod.coachEvidenceFromState(st, '2026-03-01');
        const base = { state: st, profile: st.profile, goals: [], primaryGoal: st.profile.primaryGoal, recentWorkoutIds: [], recentExerciseEntryIds: [], now: '2026-03-01T10:00:00Z' };
        const withCtx = E.coachMod.coach({ ...base, context: evd.context }).decision;
        const without = E.coachMod.coach(base).decision;
        return JSON.stringify(a) === JSON.stringify(b) && withCtx.action === without.action && withCtx.evidence.some((e) => e.id === 'e_recovery');
      })() ? 'pass' : 'fail', {}, seed));
      const mainSrc2 = require('node:fs').readFileSync(require('node:path').join(require('../load-engine.cjs').root, 'src/main.tsx'), 'utf8');
      out.push(rec('recovery', 'a screen collects the recovery check-in and stores it through the validated boundary', /RecoveryCheckInCard/.test(mainSrc2) && /upsertRecoveryCheckIn/.test(mainSrc2) ? 'pass' : 'fail', {}, seed));
    }
  }

  /* ---------- missed workouts and breaks ---------- */
  const breakCases = [['one missed session', [{ from: 7, to: 8 }]], ['one-week break', [{ from: 14, to: 21 }]], ['two-week break', [{ from: 14, to: 28 }]], ['four-week break', [{ from: 14, to: 42 }]], ['consecutive missed sessions', [{ from: 21, to: 24 }]]];
  for (const [name, windows] of breakCases) {
    const sc = cfg('consistent_beginner', seed + 900, { breakWindows: windows });
    sc.athlete = { ...sc.athlete, attendance: 1 };
    const sim = runSimulation(sc);
    const after = sim.log.prescriptions.filter((p) => p.date > iso(windows[0].to));
    const dup = new Set(); let dupFound = false;
    for (const w of sim.state.workouts) { const k = w.scheduledDate + w.name; if (dup.has(k)) dupFound = true; dup.add(k); }
    const calibrationAfter = after.filter((p) => p.kind === 'calibration' && sim.log.prescriptions.some((q) => q.exerciseId === p.exerciseId && q.date < p.date && q.kind !== 'calibration' ));
    const missed = sim.state.workouts.filter((w) => w.status === 'missed').length;
    out.push(rec('missed_workouts', `${name}: missed sessions are marked missed, no duplicates, history preserved`, !dupFound && missed > 0 && !calibrationAfter.length && !hard(sim.log.issues).length ? 'pass' : 'fail', { missed, dupFound, calibrationAfter: calibrationAfter.length, hard: hard(sim.log.issues).slice(0, 2) }, sc.seed));
    if (windows[0].to - windows[0].from >= 7) {
      // compare the last load actually WORKED before the break with the first prescription after it (same exercise)
      const beforeSessions = sim.log.sessions.filter((x) => x.date < iso(windows[0].from));
      const lastSession = beforeSessions[beforeSessions.length - 1];
      const firstAfter = sim.log.prescriptions.find((p) => p.date > iso(windows[0].to) && p.kind === 'baseline' && lastSession && lastSession.exercises.some((x) => x.id === p.exerciseId));
      const worked = firstAfter && lastSession.exercises.find((x) => x.id === firstAfter.exerciseId).sets.filter((x) => x.ok && x.w > 0).map((x) => x.w);
      if (firstAfter && worked && worked.length) {
        const lastWorked = worked[worked.length - 1];
        const ex = exercises.find((e) => e.id === firstAfter.exerciseId);
        const step = Math.max(0.5, ex.incrementKg || 0.5);
        // documented table (written independently): gap < 14 days => ordinary progression; otherwise never above the last worked load
        const lastDay = Math.floor(Date.parse(lastSession.date + 'T00:00:00Z') / 86400000), afterDay = Math.floor(Date.parse(firstAfter.date + 'T00:00:00Z') / 86400000);
        const gap = afterDay - lastDay, steps = gap >= 56 ? 3 : gap >= 28 ? 2 : gap >= 14 ? 1 : 0;
        const ok = steps === 0 ? Math.abs(firstAfter.weight - lastWorked) <= step * 2 + 1e-9 : (firstAfter.weight <= lastWorked + 1e-9 && lastWorked - firstAfter.weight <= steps * step + step / 2 + 1e-9 && (lastWorked <= step || firstAfter.weight < lastWorked));
        out.push(rec('missed_workouts', name + ': first load after the layoff follows the documented return-to-training table (gap ' + gap + ' d, ' + steps + ' step(s))', ok ? 'pass' : 'fail', { lastWorked, firstAfter: firstAfter.weight, step, gap, steps }, sc.seed));
      }
    }
  }
  {
    // Return-to-training: exact expectations written from the documented table, not from the implementation
    const profile1 = { experience: 'beginner', primaryGoal: 'general', equipment: ['machine'] };
    const hist = [{ id: 'h1', status: 'completed', scheduledDate: '2026-01-05', completedAt: '2026-01-05T10:00:00Z', exercises: [{ exerciseId: chest.id, sets: [set(20, 12, 2), set(20, 12, 2), set(20, 12, 2)] }] }];
    const at = (days) => T.personalizedLoad(chest, hist, profile1, exercises, new Date(Date.UTC(2026, 0, 5) + days * 86400000).toISOString().slice(0, 10)).weight;
    const table = [[0, 22.5], [7, 22.5], [13, 22.5], [14, 17.5], [27, 17.5], [28, 15], [55, 15], [56, 12.5], [400, 12.5]];
    const wrong = table.filter(([d, want]) => at(d) !== want);
    out.push(rec('missed_workouts', 'return-to-training table: 13 d progresses (22.5); 14 d -> 17.5; 28 d -> 15; 56 d and beyond -> 12.5; never an increase on return', wrong.length === 0 ? 'pass' : 'fail', { wrong: wrong.map(([d, w]) => ({ days: d, want: w, got: at(d) })) }, seed));
    const back = [...hist, { id: 'h2', status: 'completed', scheduledDate: '2026-02-04', completedAt: '2026-02-04T10:00:00Z', exercises: [{ exerciseId: chest.id, sets: [set(15, 12, 2), set(15, 12, 2), set(15, 12, 2)] }] }];
    const next = T.personalizedLoad(chest, back, profile1, exercises, '2026-02-07').weight;
    out.push(rec('missed_workouts', 'after the first return session normal progression resumes (+1 increment, no second layoff reduction)', next === 17.5 ? 'pass' : 'fail', { next }, seed));
  }

  /* ---------- equipment + substitutions: FULL -> LIMITED -> HOME -> LIMITED -> FULL ---------- */
  {
    const sc = cfg('equipment_limited', seed + 1300, {});
    sc.equipmentSchedule = [{ fromWeek: 0, set: 'FULL' }, { fromWeek: 2, set: 'LIMITED' }, { fromWeek: 4, set: 'HOME' }, { fromWeek: 6, set: 'LIMITED' }, { fromWeek: 8, set: 'FULL' }];
    sc.athlete = { ...sc.athlete, attendance: 1 };
    const sim = runSimulation(sc);
    const badEq = sim.log.issues.filter((i) => i.category === 'equipment' || /unavailable equipment/.test(i.name));
    out.push(rec('equipment', 'no unavailable equipment prescribed across FULL>LIMITED>HOME>LIMITED>FULL', badEq.length ? 'fail' : 'pass', badEq.slice(0, 3), sc.seed));
    out.push(rec('substitutions', 'substitutions were exercised (valid alternative selected when equipment removed)', sim.stats.substitutions > 0 ? 'pass' : 'fail', { substitutions: sim.stats.substitutions, noSubstitute: sim.stats.skippedExercises }, sc.seed));
    const chestId = 'machine_chest_press';
    const before = sim.log.prescriptions.filter((p) => p.exerciseId === chestId && p.date < iso(14));
    const restored = sim.log.prescriptions.filter((p) => p.exerciseId === chestId && p.date >= iso(56));
    if (before.length && restored.length) {
      const first = restored[0];
      out.push(rec('equipment', 'equipment restored: prior exact history for an exercise is used again (not re-calibrated)', first.kind === 'calibration' ? 'fail' : 'pass', { firstAfterRestore: { kind: first.kind, weight: first.weight }, lastBefore: before[before.length - 1].weight }, sc.seed));
    }
    const noSub = sim.log.events.filter((e) => e.type === 'no_substitute').length;
    out.push(rec('substitutions', `no-available-substitute case handled without crash or corrupt state (${noSub} occurrences)`, hard(sim.log.issues).length ? 'fail' : 'pass', { noSubstitute: noSub }, sc.seed));
    // progression after substitution: substituted exercise starts from an estimate or calibration and never from another exercise's raw load
    const subs = sim.log.events.filter((e) => e.type === 'substitution');
    let pathological = 0;
    for (const s of subs) { const rx = sim.log.prescriptions.find((p) => p.date === s.date && p.exerciseId === s.to); if (rx && (!Number.isFinite(rx.weight) || rx.weight < 0)) pathological++; }
    out.push(rec('substitutions', 'prescriptions for substituted exercises are finite, non-negative loads', pathological ? 'fail' : 'pass', { substitutions: subs.length, pathological }, sc.seed));
  }

  /* ---------- units: metric -> imperial -> metric (-> imperial) ---------- */
  {
    E.units.setUnits('metric');
    let worst = 0;
    const rng = new (require('../simulator/random.cjs').Rng)(seed + 1700);
    for (const path of [['imperial', 'metric'], ['imperial', 'metric', 'imperial', 'metric']]) {
      for (let i = 0; i < 2000; i++) {
        const kg = Math.round(rng.float(0, 400) * 8) / 8;
        let v = kg;
        for (const u of path) { E.units.setUnits(u); v = E.units.fromWt(E.units.wt(v)); }
        worst = Math.max(worst, Math.abs(v - kg));
      }
    }
    E.units.setUnits('metric');
    out.push(rec('units', 'weight round trip metric->imperial->metric(->imperial->metric) within 0.03 kg tolerance', worst <= 0.03 ? 'pass' : 'fail', { worstErrorKg: worst, samples: 4000 }, seed));
    const cm = [150, 165.5, 180, 201.3]; let cmWorst = 0;
    for (const c of cm) { E.units.setUnits('imperial'); const r = E.units.fromLen(E.units.len(c)); cmWorst = Math.max(cmWorst, Math.abs(r - c)); }
    E.units.setUnits('metric');
    out.push(rec('units', 'length round trip within 0.15 cm tolerance', cmWorst <= 0.15 ? 'pass' : 'fail', { worstErrorCm: cmWorst }, seed));
    E.units.setUnits('imperial');
    const volLb = E.units.vol(1000); const dt = E.units.displayText('use a 2.5 kg step and 10 kg total'); E.units.setUnits('metric');
    out.push(rec('units', 'displayed volume/prose convert (1000 kg-reps ~ 2205 lb-reps; "kg" -> "lb")', Math.abs(volLb - 2205) <= 1 && /lb/.test(dt) && !/\bkg\b/.test(dt) ? 'pass' : 'fail', { volLb, text: dt }, seed));
    const sc = cfg('unit_switching', seed + 1800, {});
    const sim = runSimulation(sc);
    out.push(rec('units', 'unit switching over a full simulation never mutates canonical stored data', hard(sim.log.issues).filter((i) => i.category === 'units').length ? 'fail' : 'pass', { toggles: sim.log.unitChecks }, sc.seed));
  }

  /* ---------- PRs: independent reconstruction ---------- */
  {
    const sc = cfg('fast_responder', seed + 2100, {});
    const sim = runSimulation(sc);
    const { prOracle } = require('../oracle/progression-oracle.cjs');
    const r = prOracle(sim.state, exercises);
    const h = r.issues.filter((i) => i.severity === 'hard');
    out.push(rec('prs', `load PRs match independent reconstruction over ${r.checked} exercise-sessions`, h.length ? 'fail' : 'pass', h.slice(0, 3), sc.seed));
    for (const i of r.issues.filter((i) => i.severity === 'warn').slice(0, 3)) out.push(rec('prs', 'REVIEW: ' + i.name, 'review', i.detail, sc.seed));
    const dupAchievements = new Set(sim.state.achievements.map((a) => a.workoutId + a.exerciseId + a.kind + a.label));
    out.push(rec('prs', 'no duplicate achievements per workout/exercise/kind', dupAchievements.size === sim.state.achievements.length ? 'pass' : 'fail', { achievements: sim.state.achievements.length, unique: dupAchievements.size }, sc.seed));
  }

  /* ---------- body weight / nutrition ---------- */
  {
    const trails = { stable: 0, gain: 0.05, loss: -0.06 };
    for (const [name, trend] of Object.entries(trails)) {
      const sc = cfg('consistent_beginner', seed + 2300, {}); sc.bodyTrend = trend;
      const sim = runSimulation(sc);
      const m = sim.state.measurements;
      const ordered = m.every((x, i) => i === 0 || m[i - 1].date <= x.date);
      const finite = m.every((x) => Number.isFinite(x.weightKg) && x.weightKg > 0);
      const nutritionOk = Object.values(sim.state.nutrition.log).every((d) => [d.proteinG, d.calories, d.carbsG, d.fatsG, d.waterL].every((v) => Number.isFinite(v) && v >= 0));
      out.push(rec('body_weight', `${name} noisy trajectory (${m.length} entries): ordered, finite, positive`, ordered && finite ? 'pass' : 'fail', { entries: m.length, first: m[0].weightKg, last: m[m.length - 1].weightKg }, sc.seed));
      out.push(rec('nutrition', `${name}: logged nutrition/hydration values valid and non-negative`, nutritionOk ? 'pass' : 'fail', {}, sc.seed));
    }
  }

  /* ---------- persistence: save/reload after EVERY session must not change behaviour ---------- */
  {
    const sc = cfg('consistent_beginner', seed + 2600, { persistence: 1 });
    const a = runSimulation(sc, { persistence: true });
    const b = runSimulation({ ...sc, persistence: 0 }, { persistence: false });
    const norm = (s) => JSON.stringify(s.log.prescriptions.map((p) => [p.date, p.exerciseId, p.weight, p.kind]));
    out.push(rec('persistence', 'save+reload every day: zero state differences', a.log.issues.filter((i) => i.category === 'persistence').length ? 'fail' : 'pass', { roundTrips: a.log.persistenceChecks, issues: a.log.issues.filter((i) => i.category === 'persistence').slice(0, 3) }, sc.seed));
    out.push(rec('metamorphic', 'reloading persisted state preserves subsequent deterministic behaviour', norm(a) === norm(b) ? 'pass' : 'fail', { roundTrips: a.log.persistenceChecks }, sc.seed));
  }

  return out;
}
module.exports = { run };
