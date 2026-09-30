'use strict';
/* Metamorphic relations: expectations about how outputs must relate, without a reference implementation. */
const { loadEngine } = require('../load-engine.cjs');
const { makeScenario } = require('../simulator/scenario-generator.cjs');
const { runSimulation } = require('../simulator/simulator.cjs');
const { set } = require('./progression-oracle.cjs');
const { Rng } = require('../simulator/random.cjs');

const rec = (name, status, detail, seed) => ({ category: 'metamorphic', name, status, detail, seed });
const workoutOf = (exerciseId, sets, date, id) => ({ id, planId: 'p', name: 'X', scheduledDate: date, status: 'completed', completedAt: date + 'T10:00:00Z', source: 'scheduled', version: 1, exercises: [{ exerciseId, sets, prescribedSets: sets.length, repRange: [8, 12], restSec: 90, order: 0 }] });

function run(ctx) {
  const E = loadEngine();
  const T = E.training;
  const ex = E.exercisesMod.EXERCISES;
  const chest = ex.find((e) => e.id === 'machine_chest_press');
  const profile = { experience: 'beginner', primaryGoal: 'general', equipment: ['machine', 'cable', 'dumbbell', 'barbell', 'bench', 'bodyweight'] };
  const seed = ctx.baseSeed;
  const out = [];

  // 1. identical inputs -> identical deterministic output (whole simulations)
  const sc = makeScenario({ archetype: 'consistent_beginner', seed: seed + 3000, weeks: Math.min(ctx.weeks, 8) });
  const a = runSimulation(sc), b = runSimulation(sc);
  const norm = (s) => JSON.stringify(s.log.prescriptions.map((p) => [p.date, p.exerciseId, p.weight, p.kind]));
  out.push(rec('identical inputs produce identical prescriptions over a full simulation', norm(a) === norm(b) ? 'pass' : 'fail', { prescriptions: a.log.prescriptions.length }, sc.seed));

  // 2. kg -> lb -> kg keeps canonical load (unit toggles never change prescriptions)
  const scU = { ...sc, unitSwitchWeeks: [1, 2, 3, 4, 5, 6, 7] };
  const u = runSimulation(scU);
  out.push(rec('unit toggling does not alter any prescription (canonical kg is authoritative)', norm(u) === norm(a) ? 'pass' : 'fail', { toggles: u.log.unitChecks }, sc.seed));

  // 3. removing equipment must not leave that equipment prescribed
  const scE = { ...sc, equipmentSchedule: [{ fromWeek: 0, set: 'FULL' }, { fromWeek: 2, set: 'HOME' }] };
  const e = runSimulation(scE);
  const viol = e.log.issues.filter((i) => /unavailable/.test(i.name));
  out.push(rec('removing equipment leaves none of it prescribed', viol.length ? 'fail' : 'pass', viol.slice(0, 2), sc.seed));

  // 4. adding irrelevant history must not change an exercise with exact history
  const base = [workoutOf('machine_chest_press', [set(20, 10, 2), set(20, 10, 2), set(20, 10, 2)], '2026-02-01', 'w1')];
  const noise = [workoutOf('bicep_curl_dumbbell', [set(6, 12, 2), set(6, 12, 2)], '2026-02-02', 'w2'), workoutOf('calf_raise', [set(40, 15, 2)], '2026-02-03', 'w3')].filter((w) => ex.some((x) => x.id === w.exercises[0].exerciseId));
  const r1 = T.personalizedLoad(chest, base, profile, ex), r2 = T.personalizedLoad(chest, [...base, ...noise], profile, ex);
  out.push(rec('irrelevant history for other exercises does not change a recommendation that has exact history', r1.weight === r2.weight ? 'pass' : 'fail', { without: r1.weight, withNoise: r2.weight, noiseWorkouts: noise.length }, seed));

  // 5. controlled improvement must not yield a weaker recommendation
  const rng = new Rng(seed + 3100);
  let bad = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const w = 10 + rng.int(0, 30) * 2.5, reps = rng.int(6, 11), rir = rng.int(0, 4);
    const lo = T.personalizedLoad(chest, [workoutOf(chest.id, [set(w, reps, rir), set(w, reps, rir), set(w, reps, rir)], '2026-02-01', 'l')], profile, ex).weight;
    const hi = T.personalizedLoad(chest, [workoutOf(chest.id, [set(w, reps + 1, rir), set(w, reps + 1, rir), set(w, reps + 1, rir)], '2026-02-01', 'h')], profile, ex).weight;
    n++; if (hi < lo) bad++;
  }
  out.push(rec('better recorded reps never produce a lower load recommendation (400 random pairs)', bad ? 'fail' : 'pass', { violations: bad, pairs: n }, seed));

  // 6. duplicate records must not double progression
  const top = [set(20, 12, 2), set(20, 12, 2), set(20, 12, 2)];
  const w1 = workoutOf(chest.id, top, '2026-02-01', 'd1');
  const single = T.personalizedLoad(chest, [w1], profile, ex).weight;
  const doubled = T.personalizedLoad(chest, [w1, { ...w1, id: 'd1-dup', exercises: [{ ...w1.exercises[0], sets: top.map((s) => ({ ...s, id: s.id + 'x' })) }] }], profile, ex).weight;
  out.push(rec('duplicated session record does not double the progression step', doubled === single ? 'pass' : 'fail', { single, doubled, increment: chest.incrementKg }, seed));

  // 7. reload preserves behaviour: covered end-to-end in focused persistence scenario (same relation)
  // 8. purity: personalizedLoad must not mutate its inputs
  const snap = JSON.stringify([base, profile]);
  T.personalizedLoad(chest, base, profile, ex);
  out.push(rec('recommendation calculation does not mutate its inputs', JSON.stringify([base, profile]) === snap ? 'pass' : 'fail', {}, seed));
  return out;
}
module.exports = { run };
