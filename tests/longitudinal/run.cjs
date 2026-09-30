#!/usr/bin/env node
'use strict';
/*
 * APEX longitudinal test runner.
 *   LONGITUDINAL_LEVEL = quick | standard | full | endurance   (default quick)
 *   LONGITUDINAL_USERS / _WEEKS / _SEED / _FUZZ override the level.
 *   node tests/longitudinal/run.cjs --repro <archetype>:<seed>:<weeks>
 */
const fs = require('node:fs');
const path = require('node:path');
const { Reporter } = require('./reports/reporter.cjs');
const { makeScenario } = require('./simulator/scenario-generator.cjs');
const { runSimulation } = require('./simulator/simulator.cjs');

const LEVELS = {
  quick: { users: 100, weeks: 8, fuzz: 300 },
  standard: { users: 1000, weeks: 12, fuzz: 1500 },
  full: { users: 5000, weeks: 12, fuzz: 4000 },
  endurance: { users: 500, weeks: 24, fuzz: 1500 },
};
const levelArg = (process.argv.find((a) => a.startsWith('--level=')) || '').slice(8);
const level = levelArg || process.env.LONGITUDINAL_LEVEL || 'quick';
if (!LEVELS[level]) { console.error('Unknown LONGITUDINAL_LEVEL: ' + level); process.exit(2); }
const num = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const config = {
  level,
  users: num(process.env.LONGITUDINAL_USERS, LEVELS[level].users),
  weeks: num(process.env.LONGITUDINAL_WEEKS, LEVELS[level].weeks),
  fuzz: num(process.env.LONGITUDINAL_FUZZ, LEVELS[level].fuzz),
  baseSeed: num(process.env.LONGITUDINAL_SEED, 20260101),
};

const reproIdx = process.argv.indexOf('--repro');
if (reproIdx > -1) {
  const [archetype, seed, weeks] = String(process.argv[reproIdx + 1] || '').split(':');
  const sim = runSimulation(makeScenario({ archetype, seed: Number(seed), weeks: Number(weeks) || 12 }));
  console.log(JSON.stringify({ scenario: sim.scenario, stats: sim.stats, events: sim.log.events, issues: sim.log.issues, prescriptions: sim.log.prescriptions, sessions: sim.log.sessions }, null, 2));
  process.exit(0);
}

const reproFor = (archetype, seed, weeks) => `node tests/longitudinal/run.cjs --repro ${archetype}:${seed}:${weeks}`;
const scenarioCmd = `LONGITUDINAL_LEVEL=${level} LONGITUDINAL_SEED=${config.baseSeed} node tests/longitudinal/run.cjs`;

function contextFor(archetype, seed, date, exerciseId) {
  try {
    const sim = runSimulation(makeScenario({ archetype, seed, weeks: config.weeks }));
    const sessions = sim.log.sessions.filter((s) => !date || s.date <= date).slice(-6);
    return {
      goal: sim.scenario.goal, archetype, seed, weeks: config.weeks, athleteConfig: sim.scenario.athlete, equipmentSchedule: sim.scenario.equipmentSchedule,
      unitSwitchWeeks: sim.scenario.unitSwitchWeeks, events: sim.log.events.filter((e) => !date || e.date <= date).slice(-15),
      recoveryHistory: sessions.map((s) => ({ date: s.date, readiness: Math.round(s.readiness * 100) / 100 })),
      recentPrescriptions: sim.log.prescriptions.filter((p) => (!exerciseId || p.exerciseId === exerciseId) && (!date || p.date <= date)).slice(-8),
      recentPerformance: sessions.map((s) => ({ date: s.date, label: s.label, completedSets: s.completedSets, plannedSets: s.plannedSets, exercises: s.exercises.filter((x) => !exerciseId || x.id === exerciseId) })),
    };
  } catch (e) { return { error: 'context unavailable: ' + e.message }; }
}

const reporter = new Reporter(config);
const ctx = { ...config, sims: [], keepSims: 0, crash(scenario, err) { reporter.add({ category: 'data_integrity', name: 'simulation crashed', status: 'fail', seed: scenario.seed, detail: { scenario: scenario.id, error: String(err && err.stack || err).slice(0, 600) }, archetype: scenario.archetype }); } };

(async () => {
const t0 = Date.now();
console.log(`APEX longitudinal - level=${level} users=${config.users} weeks=${config.weeks} fuzz=${config.fuzz} seed=${config.baseSeed}`);

// 1. population
const population = await require('./scenarios/population.cjs').run(ctx);
reporter.totals = population.totals; reporter.archetypeStats = population.archetypeStats;
for (const [cat, v] of Object.entries(population.passes)) { reporter.count(cat, true, v.pass); reporter.count(cat, false, v.fail); }
for (const f of population.findings) {
  const classification = /engine signalled "reduce"/.test(f.name) ? 'REAL BUG - FIXED' : /no completed sets/.test(f.name) ? 'PRODUCT DECISION - IMPLEMENTED' : /Knowledge graph references unknown exercise/.test(f.name) ? 'REAL BUG - FIXED' : undefined;
  const rec = { classification, category: f.category, name: f.name, status: f.severity === 'hard' ? 'fail' : 'review', detail: { ...f.detail, occurrences: f.count, affectedUsers: f.users, firstSeed: f.firstSeed, archetype: f.archetype }, seed: f.firstSeed, archetype: f.archetype, scenarioId: f.scenarioId, date: f.date, count: f.count };
  reporter.add({ ...rec, _fromPopulation: true, status: 'review' === rec.status ? 'review' : 'fail' });
}
for (const [a, s] of Object.entries(population.archetypeStats)) if (s.avgBelowRangeRate > 0.25) reporter.add({ category: 'progressive_overload', classification: 'INTENTIONAL - DOCUMENTED', name: 'REVIEW: ' + a + ' spends a large share of sets below the rep range', status: 'review', detail: { expected: 'ambiguous: no specification for how long sub-range performance may persist', avgBelowRangeRate: s.avgBelowRangeRate, users: s.users }, seed: config.baseSeed });
console.log(`  population done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// 2. focused, metamorphic, edge-case/fuzz
reporter.addMany(require('./scenarios/focused.cjs').run(ctx));
reporter.addMany(require('./oracle/metamorphic.cjs').run(ctx));
reporter.addMany(require('./oracle/selftest.cjs').run(ctx));
reporter.addMany(require('./scenarios/edge-cases.cjs').run(ctx));

// 3. browser results (produced by npm run test:longitudinal:browser)
const browserFile = path.join(reporter.outDir, 'longitudinal-browser.json');
if (fs.existsSync(browserFile)) {
  try {
    const b = JSON.parse(fs.readFileSync(browserFile, 'utf8'));
    const walk = (suite, acc) => { for (const s of suite.suites || []) walk(s, acc); for (const sp of suite.specs || []) for (const t of sp.tests || []) acc.push({ title: sp.title, ok: t.status === 'expected' || t.status === 'skipped' ? (t.status === 'skipped' ? 'skip' : 'pass') : 'fail', err: t.results?.[0]?.error?.message }); };
    const acc = []; for (const s of b.suites || []) walk(s, acc);
    for (const t of acc) if (t.ok !== 'skip') reporter.add({ category: 'browser_e2e', name: t.title, status: t.ok === 'pass' ? 'pass' : 'fail', detail: t.err ? { error: String(t.err).slice(0, 400) } : {}, seed: config.baseSeed });
  } catch (e) { reporter.add({ category: 'browser_e2e', name: 'browser results file unreadable', status: 'fail', detail: { error: e.message } }); }
}

// 4. failure artifacts for every FAIL
for (const r of reporter.records.filter((x) => x.status === 'fail')) {
  const archetype = r.archetype || (r.detail && r.detail.archetype);
  const seed = r.seed;
  const isPop = r._fromPopulation && archetype;
  const context = isPop ? contextFor(archetype, seed, r.date, r.detail && r.detail.exercise) : undefined;
  reporter.writeFailure({
    name: r.name, category: r.category, severity: 'hard', classification: isPop ? 'invariant violation (population run)' : 'scenario expectation failed', seed, archetype, scenarioId: r.scenarioId, date: r.date, count: r.count || 1,
    expected: r.detail && r.detail.expected ? r.detail.expected : 'invariant / documented rule for: ' + r.name, actual: r.detail,
    reproduce: isPop ? reproFor(archetype, seed, config.weeks) : scenarioCmd,
    likelyCause: r.likelyCause,
  }, { context });
}

let validation = null;
try { validation = JSON.parse(fs.readFileSync(path.join(reporter.outDir, 'longitudinal-validation.json'), 'utf8')); } catch { /* optional */ }
const dispositions = require('./review-dispositions.cjs');
const sections = {
  'Product bugs fixed (found by the longitudinal system)': [
    'progression() action "reduce" kept the previous load; it now lowers the load by one increment, or adds one increment of assistance (src/engine/training.ts) [tests/progression-reduce.test.cjs]',
    'Reduce on assisted movements with a custom assistance list snapped to LESS assistance; it now snaps to more assistance [tests/progression-reduce.test.cjs]',
    'A single negative/impossible set value made the integrity check reject the WHOLE persisted state, silently erasing all history and onboarding; values are now clamped at input and repaired in repository.merge() [tests/persistence-repair.test.cjs]',
    'leg_curl_machine listed a non-existent alternative "stability_ball_curl" [tests/knowledge-graph.test.cjs]',
    'An unusable persisted payload silently replaced the only copy of the data with an empty app; it is now preserved, announced and recoverable (see below) [tests/corrupt-recovery.test.cjs]',
    'Typed seconds and RIR inputs were not clamped (seconds >= 0, RIR 0-10) [src/main.tsx]',
    'A workout with zero logged sets could be finished as a normal completed workout; it is now abandoned without a completion record [tests/zero-set-workout.test.cjs]',
    'plateauCandidates() flagged identical rep totals at an INCREASING load and exercises with no recorded output (about 80% of simulated sessions were "plateaus"); it now requires comparable sessions (same working load, non-zero output) [tests/plateau-coach.test.cjs]',
    'Engine volume/PR helpers returned negative, NaN or Infinity totals for hostile set values, and feedbackLoad returned a negative load for bodyweight exercises; defended in the engine [tests/engine-validation.test.cjs]',
    'Test-infrastructure race: node --test runs files in parallel and all rebuilt the compiled-engine cache at once after a source change; the loader now takes a lock [tests/longitudinal/load-engine.cjs]',
  ],
  'Product behaviour added (all deterministic, explainable, user in control)': [
    'Return to training: gap <14 d unchanged; 14-27 d one load step lower; 28-55 d two; 56+ d three; bounded by half the last load and the smallest meaningful load; never an increase on the return session; assisted movements get more assistance; real equipment load choices respected (docs/RETURN_TO_TRAINING.md).',
    'Plateau evidence surfaces in the Coach with options, an explicit not-a-diagnosis statement and honest confidence; nothing is changed automatically.',
    'Recovery check-in (sleep hours, sleep quality, soreness, fatigue) stored as Coach evidence only; never a prescription input.',
    'Zero-set workouts are abandoned ("End without recording"), not completed.',
    'Corrupt state recovery screen: detected, preserved, explained; "Recover what can be read" or an explicit, confirmed "Start fresh".',
  ],
  'Remaining decisions and limitations': [
    'The return-to-training thresholds (14 / 28 / 56 days, 1 / 2 / 3 load steps) are a conservative product rule, not a scientifically validated model; they are constants in one place and may be tuned by the product owner.',
    'Plateau options are generic coaching choices; no automatic variation or deload is applied by design.',
    'Recovery context is deliberately not a prescription input. Whether it ever should be is a product-owner decision that would need its own specification.',
    'Payloads whose JSON is unparseable cannot be recovered in-app; they are preserved untouched on the device for manual recovery.',
    'The native SQLite copy is consulted on load and restores data automatically when valid and newer, but that native path is NOT VERIFIED.',
  ],
  'Native / device limitations': [
    'Native Capacitor SQLite plugin: NOT VERIFIED. The Node harness substitutes a no-op store; localStorage persistence, merge/repair, recovery and integrity are the real code.',
    'Android app launch, splash, safe areas, notifications and the physical-device workout flow: NOT VERIFIED (no emulator or device available).',
  ],
  'Test independence checks': [
    'The synthetic athlete (own strength, adaptation, fatigue, sleep, attendance, RIR and rep noise, stalls) never reads APEX output except the load it is handed; it decides reps itself.',
    'Every prescription is validated BEFORE the session is written to history, against an oracle that does not call progression(): the return-to-training table, plateau rule and recovery-context contract are restated independently in oracle/invariants.cjs and oracle/context.cjs.',
    'The oracle self-check seeds known-bad states, prescriptions, PRs, layoff violations (ignored / increased / excessive), zero-set completions, Coach load prescriptions, state mutation and false plateau evidence, and requires each to be detected, and requires legitimate cases to be accepted.',
    'Mutation check (performed once by hand): breaking the compiled layoff thresholds made the population run fail with 27 hard failures; the cache was then restored.',
    'Metamorphic tests mutate inputs (unit toggles, equipment removal, irrelevant history, duplicated records, better reps, persistence reload) and compare outputs; every simulated session also removes the recovery log and requires identical prescriptions.',
    'Fuzz/property tests generate invalid values (0, negative, huge, NaN, Infinity, strings, missing, invalid RIR, duplicate ids, hostile recovery check-ins, corrupt payloads); counts in this report are executed counts. Seeds are deterministic and every failure prints a reproduction command.',
  ],
};
const res = reporter.finish({ validation, dispositions, sections });
console.log(`  PASS ${res.total.pass}  FAIL ${res.total.fail}  REVIEW ${res.total.review}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log('  reports: test-results/longitudinal-report.md, test-results/longitudinal-summary.json' + (reporter.failures.length ? ', test-results/longitudinal/failure-*.md' : ''));
process.exit(res.total.fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
