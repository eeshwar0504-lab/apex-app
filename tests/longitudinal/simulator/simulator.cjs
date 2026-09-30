'use strict';
/*
 * Longitudinal driver. It performs the orchestration the APEX app performs
 * (build plan -> create the day's workout -> hydrate recommendations with the
 * REAL engine -> log what the independent athlete actually did -> complete)
 * and never bypasses the engine for any recommendation.
 */
const { loadEngine } = require('../load-engine.cjs');
const { Rng, hashSeed } = require('./random.cjs');
const { AthleteModel } = require('./athlete-model.cjs');
const { EQUIPMENT } = require('./scenario-generator.cjs');
const inv = require('../oracle/invariants.cjs');
const ctxOracle = require('../oracle/context.cjs');

const START = Date.UTC(2026, 0, 5); // a Monday
const iso = (dayIndex) => new Date(START + dayIndex * 86400000).toISOString().slice(0, 10);
const EXTERNAL = (ex) => !['bodyweight', 'none', 'time', 'assistance'].includes(ex.loadSemantics);

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

/* Independent definition of equipment availability (the contract buildPlan documents). */
function availableUnder(ex, equipment) {
  return ex.equipment.includes('bodyweight') || ex.equipment.some((e) => equipment.includes(e));
}

function runSimulation(scenario, options = {}) {
  const E = loadEngine();
  const T = E.training;
  const exercises = E.exercisesMod.EXERCISES;
  const rng = new Rng(hashSeed(scenario.seed, scenario.archetype, 'sim'));
  const athlete = new AthleteModel({ ...scenario.athlete, breakWindows: scenario.breakWindows }, rng.fork('athlete'));
  const storage = options.storage || memoryStorage();
  global.localStorage = storage;
  const repoMod = E.loadRepository();

  let equipment = [...EQUIPMENT[scenario.equipmentSchedule[0].set]];
  const profile = {
    id: 'sim-' + scenario.id, name: 'Sim ' + scenario.archetype, experience: scenario.athlete.experience,
    goals: [scenario.goal], primaryGoal: scenario.goal, trainingDays: 4, sessionMinutes: 60,
    equipment: [...equipment], body: { weightKg: scenario.athlete.bodyWeightKg }, createdAt: iso(0) + 'T08:00:00.000Z',
  };
  const fullPlan = T.buildPlan({ ...profile, equipment: EQUIPMENT.FULL }, exercises, []);
  const plan = { ...fullPlan, id: 'plan-' + scenario.id, version: 1, days: fullPlan.days.map((d) => ({ ...d, workoutId: undefined })) };
  let state = repoMod.fresh();
  state.profile = profile; state.plan = plan; state.onboardingComplete = true;
  state.preferences = { ...state.preferences, units: 'metric' };
  state.goals = [{ id: 'goal-1', kind: scenario.goal, title: scenario.goal, priority: 1, status: 'active', createdAt: iso(0) }];
  state.nutrition = { targets: { proteinG: 140, waterL: 3 }, log: {} };
  if (options.mutateState) options.mutateState(state);

  const log = { sessions: [], prescriptions: [], events: [], persistenceChecks: 0, unitChecks: 0, contextChecks: 0, plateauChecks: 0, recoveryCheckIns: 0, hostileCheckIns: 0, layoffPrescriptions: 0, equipmentByDate: {}, issues: [] };
  const stats = { workouts: 0, sets: 0, abandoned: 0, missed: 0, substitutions: 0, prs: 0, skippedExercises: 0, weeks: scenario.weeks };
  const bwTrail = [];
  let bw = scenario.athlete.bodyWeightKg;
  const totalDays = scenario.weeks * 7;
  let missedRun = 0;
  const issueIndex = new Map();
  function pushIssue(it) {
    const k = [it.severity, it.category, it.name, it.detail && (it.detail.exercise || it.detail.path || it.detail.k || '')].join('|');
    const e = issueIndex.get(k);
    if (e) { e.count++; return; }
    const n = { ...it, count: 1, seed: scenario.seed, scenarioId: scenario.id };
    issueIndex.set(k, n); log.issues.push(n);
  }
  const note = (category, severity, name, detail) => pushIssue({ category, severity, name, detail });

  function toggleUnits(date) {
    const before = JSON.stringify({ w: state.workouts, m: state.measurements });
    const next = state.preferences.units === 'imperial' ? 'metric' : 'imperial';
    state.preferences = { ...state.preferences, units: next };
    E.units.setUnits(next);
    const after = JSON.stringify({ w: state.workouts, m: state.measurements });
    log.unitChecks++;
    if (before !== after) note('units', 'hard', 'unit toggle mutated canonical stored data', { date });
    for (const wk of state.workouts.slice(-3)) for (const we of wk.exercises) for (const s of we.sets) {
      if (s.weight === undefined) continue;
      const rt = E.units.fromWt(E.units.wt(s.weight));
      if (Math.abs(rt - s.weight) > 0.03) note('units', 'hard', 'unit round trip outside tolerance', { date, kg: s.weight, roundTrip: rt, units: next });
    }
    log.events.push({ date, type: 'units', units: next });
  }

  function persistenceRoundTrip(date) {
    const snapshot = JSON.parse(JSON.stringify(state));
    repoMod.repository.save(state);
    const loaded = repoMod.repository.load();
    log.persistenceChecks++;
    for (const d of inv.compareStates(snapshot, loaded)) note('persistence', 'hard', d.message, { date, ...d });
    state = loaded; state.exercises = exercises; // "restart": continue from what was actually restored
    E.units.setUnits(state.preferences.units);
  }

  function buildWorkout(planDay, date) {
    const label = String(planDay.label);
    const list = label.includes('UPPER') ? plan.exerciseSets.upper : label.includes('LOWER') ? plan.exerciseSets.lower : plan.exerciseSets.full;
    const ids = [];
    for (const id of list.slice(0, Math.min(7, list.length))) {
      const ex = exercises.find((x) => x.id === id);
      if (!ex) continue;
      if (availableUnder(ex, equipment)) { ids.push(id); continue; }
      const alts = T.smartAlternatives(ex, exercises, equipment);
      const alt = alts.map((a) => a.exercise || a).find((a) => a && availableUnder(a, equipment) && !ids.includes(a.id) && !list.includes(a.id));
      if (alt) { ids.push(alt.id); stats.substitutions++; log.events.push({ date, type: 'substitution', from: id, to: alt.id }); }
      else { stats.skippedExercises++; log.events.push({ date, type: 'no_substitute', exercise: id }); }
    }
    const w = T.createWorkout(label, date, ids, exercises, plan.id, 'scheduled', 1);
    w.originalPlanVersion = 1; w.currentPlanVersion = 1;
    return w;
  }

  function hydrate(w, date) {
    const done = state.workouts.filter((x) => x.status === 'completed');
    const rxs = [];
    for (const we of w.exercises) {
      const ex = exercises.find((e) => e.id === we.exerciseId);
      const rec = T.personalizedLoad(ex, done, state.profile, exercises, date);
      let weight = we.recommendedWeight;
      if (EXTERNAL(ex)) {
        const snapped = T.snapToAvailableLoad(ex, rec.weight, state.profile);
        weight = snapped !== undefined ? snapped : rec.weight;
        we.recommendedWeight = weight;
        we.sets = we.sets.map((s) => (s.completed ? s : { ...s, weight }));
      }
      athlete.ensure(ex);
      rxs.push({ date, exerciseId: ex.id, e1rm: athlete.strength.get(ex.id), weight, kind: rec.kind, reason: rec.reason, targetRir: rec.targetRir, repRange: we.repRange, sets: we.sets.length });
    }
    return rxs;
  }

  function perform(w, date, day) {
    const rxs = hydrate(w, date);
    log.prescriptions.push(...rxs);
    // validate against the history as it stood when the load was prescribed (this session not yet logged)
    for (const v of inv.checkPrescriptions(rxs, state, exercises, T, equipment, log)) pushIssue({ ...v, date });
    // the Coach reads recovery + plateau evidence; it must explain it without touching the prescription
    for (const v of ctxOracle.checkCoachContext(E, state, date, exercises, rxs, log)) pushIssue({ ...v, date });
    const ds = athlete.startDay(day);
    w.startedAt = date + 'T17:00:00.000Z';
    const trained = [];
    let completedSets = 0, plannedSets = 0;
    const tired = ds.readiness < 0.8 && rng.chance(0.4);
    // occasionally the athlete turns up and leaves without logging anything (illness, time pressure)
    const walkOut = rng.chance(0.015);
    w.exercises.forEach((we, xi) => {
      const ex = exercises.find((e) => e.id === we.exerciseId);
      if (walkOut || (tired && xi >= w.exercises.length - 2)) { we.status = 'skipped'; we.sets.forEach((s) => (s.completed = false)); plannedSets += we.sets.length; return; }
      athlete.ensure(ex);
      we.sets.forEach((set, si) => {
        plannedSets++;
        if (ex.loadSemantics === 'time') {
          set.seconds = Math.max(5, Math.round(rng.gauss(ex.repRange[0] + 5, 5) * ds.readiness));
          set.completed = true; set.timestamp = date + 'T17:30:00.000Z'; completedSets++; stats.sets++; return;
        }
        let load;
        if (EXTERNAL(ex)) load = set.weight;
        else if (ex.loadSemantics === 'assistance') load = Math.max(5, scenario.athlete.bodyWeightKg - (set.assistance ?? we.recommendedWeight ?? 20));
        else load = scenario.athlete.bodyWeightKg * 0.6;
        const r = athlete.performSet(ex, load ?? 1, we.repRange, si);
        if (r.reps < 1) { set.completed = false; return; }
        set.reps = r.reps; if (r.rir !== undefined) set.rir = r.rir; else delete set.rir;
        set.completed = true; set.timestamp = date + 'T17:30:00.000Z'; completedSets++; stats.sets++;
      });
      trained.push(ex);
    });
    if (completedSets === 0) {
      // The app does not record a session with no logged sets as completed: it is abandoned.
      const at = date + 'T18:30:00.000Z';
      if (T.hasLoggedSets(w)) note('zero_set', 'hard', 'hasLoggedSets() reports logged sets although the athlete logged none', { date });
      const abandoned = T.abandonWorkout(w, at);
      if (abandoned.status === 'completed') note('zero_set', 'hard', 'abandonWorkout produced a completed workout', { date });
      state.workouts.push(abandoned);
      stats.abandoned++; log.events.push({ date, type: 'abandoned_no_sets', label: w.name });
      athlete.rest(1);
      return;
    }
    w.status = 'completed'; w.completedAt = date + 'T18:30:00.000Z'; w.updatedAt = w.completedAt;
    const previous = state.workouts.filter((x) => x.status === 'completed');
    state.workouts.push(w);
    const ach = T.detectAchievements(w, exercises, previous);
    for (const a of ach) state.achievements.push({ id: 'ach-' + w.id + '-' + state.achievements.length, workoutId: w.id, ...a, timestamp: w.completedAt });
    stats.prs += ach.length; stats.workouts++;
    athlete.afterSession(trained, plannedSets ? completedSets / plannedSets : 0);
    // evening recovery check-in drawn from the athlete's own state (sometimes hostile) through the real boundary
    const q = (x) => Math.min(5, Math.max(1, 1 + Math.round(x * 4)));
    let checkIn = { date, sleepHours: Math.round((4 + 4 * ds.sleep) * 2) / 2, sleepQuality: q(ds.sleep), soreness: q(ds.soreness), fatigue: q(athlete.fatigue) };
    if (rng.chance(0.05)) { checkIn = { ...checkIn, ...rng.pick([{ sleepHours: 500 }, { sleepHours: -3 }, { soreness: NaN }, { fatigue: Infinity }, { sleepQuality: 'great' }, { soreness: 99 }]) }; log.hostileCheckIns++; }
    const beforeLog = state.recoveryLog ? state.recoveryLog.length : 0;
    state.recoveryLog = E.recovery.upsertRecoveryCheckIn(state.recoveryLog, checkIn);
    log.recoveryCheckIns++;
    for (const c of state.recoveryLog.slice(-1)) {
      const bad = (c.sleepHours !== undefined && !(c.sleepHours >= 0 && c.sleepHours <= 24)) || ['sleepQuality', 'soreness', 'fatigue', 'stress', 'readiness'].some((k) => c[k] !== undefined && !(Number.isInteger(c[k]) && c[k] >= 1 && c[k] <= 5));
      if (bad) note('recovery', 'hard', 'recovery check-in outside the accepted range survived the boundary', { date, c });
    }
    if (state.recoveryLog.length < beforeLog) note('recovery', 'hard', 'recovery log lost entries', { date });
    log.sessions.push({ date, day, label: w.name, readiness: ds.readiness, completedSets, plannedSets, exercises: w.exercises.map((we) => ({ id: we.exerciseId, sets: we.sets.map((s) => ({ w: s.weight, r: s.reps, rir: s.rir, ok: s.completed })) })) });
  }

  for (let day = 0; day < totalDays; day++) {
    const date = iso(day), week = Math.floor(day / 7), weekday = day % 7;
    for (const s of scenario.equipmentSchedule) if (s.fromWeek === week && weekday === 0) { equipment = [...EQUIPMENT[s.set]]; state.profile.equipment = [...equipment]; log.events.push({ date, type: 'equipment', set: s.set }); }
    for (const g of scenario.goalChanges) if (g.week === week && weekday === 0) { state.profile.primaryGoal = g.goal; state.profile.goals = [g.goal]; state.goals.push({ id: 'goal-' + g.week, kind: g.goal, title: g.goal, priority: 2, status: 'active', createdAt: date }); log.events.push({ date, type: 'goal', goal: g.goal }); }
    for (const d of scenario.daysChange) if (d.week === week && weekday === 0) { state.profile.trainingDays = d.days; log.events.push({ date, type: 'trainingDays', days: d.days }); }
    log.equipmentByDate[date] = [...equipment];
    if (weekday === 0 && scenario.unitSwitchWeeks.includes(week)) toggleUnits(date);

    if (day % 2 === 0) {
      bw += scenario.bodyTrend / 3 + rng.gauss(0, 0.25);
      if (rng.chance(0.03)) bw += rng.pick([-1.5, 1.8]);
      const kg = Math.round(bw * 10) / 10;
      bwTrail.push(kg);
      state.measurements.push({ id: 'm-' + day, date, weightKg: kg, values: {} });
    }
    state.nutrition.log[date] = { proteinG: Math.max(0, Math.round(rng.gauss(125, 30))), calories: Math.round(rng.gauss(2400, 300)), carbsG: Math.round(rng.gauss(250, 50)), fatsG: Math.round(rng.gauss(75, 15)), waterL: Math.round(rng.float(1.2, 3.6) * 10) / 10, meals: rng.int(2, 5) };

    const planDay = plan.days[weekday];
    if (planDay && !planDay.rest && planDay.label !== 'RECOVERY') {
      const attended = athlete.attends(day, weekday);
      const w = buildWorkout(planDay, date);
      if (!w.exercises.length) { w.status = 'skipped'; state.workouts.push(w); log.events.push({ date, type: 'empty_workout', label: planDay.label }); }
      else if (!attended) { w.status = 'planned'; state.workouts.push(w); missedRun++; log.events.push({ date, type: 'missed', label: planDay.label }); }
      else { if (missedRun >= 7) athlete.detrain(Math.floor(missedRun / 7)); missedRun = 0; perform(w, date, day); }
    } else athlete.rest(1);
    state.workouts = T.markMissedWorkouts(state.workouts, iso(day + 1));
    stats.missed = state.workouts.filter((x) => x.status === 'missed').length;

    // always draw, so runs with and without persistence consume the random stream identically (metamorphic comparability)
    const doPersist = rng.chance(scenario.persistence);
    if (options.persistence !== false && doPersist) persistenceRoundTrip(date);
    if (!options.skipInvariants) for (const it of inv.checkState(state, date, log)) pushIssue({ ...it, date });
  }

  return { scenario, state, log, stats, athlete, bwTrail };
}

module.exports = { runSimulation, iso, memoryStorage, availableUnder };
