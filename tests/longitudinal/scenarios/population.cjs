'use strict';
/* Large-scale population: many synthetic users x many weeks, checked continuously by the oracle. */
const { makeScenario, ARCHETYPES } = require('../simulator/scenario-generator.cjs');
const { runSimulation } = require('../simulator/simulator.cjs');
const { prOracle } = require('../oracle/progression-oracle.cjs');
const { loadEngine } = require('../load-engine.cjs');

/* Async only to yield to the event loop: repository.save() queues microtasks that must drain. */
async function run(ctx) {
  const E = loadEngine();
  const archetypes = Object.keys(ARCHETYPES);
  const exercises = E.exercisesMod.EXERCISES;
  const totals = { users: 0, workouts: 0, sets: 0, weeks: 0, prescriptions: 0, persistenceChecks: 0, unitChecks: 0, substitutions: 0, prs: 0, contextChecks: 0, plateauChecks: 0, plateauFlags: 0, recoveryCheckIns: 0, hostileCheckIns: 0, layoffPrescriptions: 0, abandonedSessions: 0 };
  const perArchetype = {};
  const merged = new Map(); // deduped findings across the whole population
  const passes = {};
  const failedRuns = [];
  const bump = (cat, ok) => { passes[cat] = passes[cat] || { pass: 0, fail: 0 }; passes[cat][ok ? 'pass' : 'fail']++; };
  const catOf = { progression: 'progressive_overload', equipment: 'equipment', units: 'units', persistence: 'persistence', data_integrity: 'data_integrity', prs: 'prs' };

  for (let u = 0; u < ctx.users; u++) {
    if (u % 4 === 0) await new Promise((r) => setImmediate(r));
    const archetype = archetypes[u % archetypes.length];
    const seed = ctx.baseSeed + u;
    const scenario = makeScenario({ archetype, seed, weeks: ctx.weeks });
    let sim;
    try { sim = runSimulation(scenario); }
    catch (err) {
      ctx.crash(scenario, err);
      continue;
    }
    totals.users++; totals.workouts += sim.stats.workouts; totals.sets += sim.stats.sets; totals.weeks += scenario.weeks;
    totals.prescriptions += sim.log.prescriptions.length; totals.persistenceChecks += sim.log.persistenceChecks; totals.unitChecks += sim.log.unitChecks;
    totals.substitutions += sim.stats.substitutions; totals.prs += sim.stats.prs;
    for (const k of ['contextChecks', 'plateauChecks', 'plateauFlags', 'recoveryCheckIns', 'hostileCheckIns', 'layoffPrescriptions']) totals[k] += sim.log[k] || 0;
    totals.abandonedSessions += sim.stats.abandoned || 0;
    const pr = prOracle(sim.state, exercises);
    const issues = [...sim.log.issues, ...pr.issues.map((i) => ({ ...i, count: 1, seed, scenarioId: scenario.id }))];
    const cats = new Set(['progressive_overload', 'equipment', 'units', 'persistence', 'data_integrity', 'prs']);
    const hardCats = new Set();
    for (const i of issues) {
      const cat = catOf[i.category] || i.category;
      if (i.severity === 'hard') hardCats.add(cat);
      const key = [i.severity, cat, i.name].join('|');
      const e = merged.get(key);
      if (e) { e.count += i.count || 1; if (!e.userSet.has(seed)) { e.userSet.add(seed); e.users++; } continue; }
      merged.set(key, { userSet: new Set([seed]), severity: i.severity, category: cat, name: i.name, detail: i.detail, count: i.count || 1, users: 1, firstSeed: seed, scenarioId: scenario.id, archetype, date: i.date });
    }
    for (const c of cats) bump(c, !hardCats.has(c));
    if (hardCats.size) failedRuns.push({ scenario, hardCats: [...hardCats] });

    // archetype statistics (evidence for the report, not a verdict)
    const st = (perArchetype[archetype] = perArchetype[archetype] || { users: 0, workouts: 0, gainPct: [], struggle: [], prs: 0, missed: 0 });
    st.users++; st.workouts += sim.stats.workouts; st.prs += sim.stats.prs; st.missed += sim.stats.missed;
    const byEx = new Map();
    for (const rx of sim.log.prescriptions) { if (rx.weight > 0) { const a = byEx.get(rx.exerciseId) || []; a.push(rx.weight); byEx.set(rx.exerciseId, a); } }
    for (const arr of byEx.values()) if (arr.length >= 4) st.gainPct.push((arr[arr.length - 1] / arr[0] - 1) * 100);
    let low = 0, tot = 0;
    for (const s of sim.log.sessions) for (const x of s.exercises) { const ex = exercises.find((e) => e.id === x.id); for (const set of x.sets) if (set.ok && set.r !== undefined) { tot++; if (set.r < ex.repRange[0]) low++; } }
    st.struggle.push(tot ? low / tot : 0);
    if (ctx.keepSims && u < ctx.keepSims) ctx.sims.push(sim);
  }

  const stats = {};
  for (const [a, s] of Object.entries(perArchetype)) {
    const mean = (x) => (x.length ? x.reduce((p, c) => p + c, 0) / x.length : 0);
    stats[a] = { users: s.users, workouts: s.workouts, avgLoadGainPct: Math.round(mean(s.gainPct) * 10) / 10, avgBelowRangeRate: Math.round(mean(s.struggle) * 1000) / 1000, prs: s.prs, missedSessions: s.missed };
  }
  return { totals, findings: [...merged.values()], passes, archetypeStats: stats, failedRuns };
}
module.exports = { run };
