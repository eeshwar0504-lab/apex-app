'use strict';
/*
 * P6.3 metamorphic relations: changing the REPRESENTATION of the same training facts must not change the decision.
 *   - the order records are stored in
 *   - the calendar position of the whole history (shift every date by k days)
 *   - display units
 *   - equivalent load representations (assistance in weight vs assistance; list order, duplicates, rounding,
 *     list keyed by equipment vs by exercise; loadDetail present or absent)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, EXERCISES, byId, set, session, threeSets, profile, addDays, DAY0 } = require('./phase1-helpers.cjs');

const press = byId('machine_chest_press');
const row = byId('seated_cable_row');
const pull = byId('assisted_pullup');
const plank = byId('plank');
const NOW = new Date(2026, 3, 10, 9, 0);

function history() {
  const w = [];
  const reps = [10, 12, 12, 9, 12, 12, 8, 12];
  reps.forEach((r, i) => {
    const date = addDays(DAY0, i * 3);
    w.push(session(press, date, threeSets(press, 20 + (i % 3) * 2.5, r)));
    w.push(session(row, addDays(date, 1), threeSets(row, 30, r - 1)));
  });
  w.push(session(pull, addDays(DAY0, 2), threeSets(pull, 30, 8)));
  w.push(session(pull, addDays(DAY0, 17), threeSets(pull, 27.5, 9)));
  w.push(session(plank, addDays(DAY0, 5), [{ id: 'p1', type: 'timed', seconds: 40, completed: true }]));
  return w;
}
function shuffle(list, seed) {
  const a = list.slice();
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) % 4294967296; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const decisions = (workouts, prof, asOf) => ({
  loads: EXERCISES.map((ex) => { const r = T.personalizedLoad(ex, workouts, prof, EXERCISES, asOf); return [ex.id, r.weight, r.kind, r.action, r.reason]; }),
  fatigue: T.workloadFatigue(workouts, EXERCISES),
  readiness: E.intelligence.readiness({ workouts, exercises: EXERCISES }).level,
  plateaus: E.analytics.plateauCandidates({ workouts, exercises: EXERCISES }).map((p) => [p.exerciseId, p.sessions]),
  trend: E.analytics.volumeTrend({ workouts, exercises: EXERCISES }),
  momentum: E.analytics.goalMomentum({ workouts, exercises: EXERCISES }),
  balance: E.analytics.trainingBalance({ workouts, exercises: EXERCISES }),
  consistency: E.analytics.consistencySummary({ workouts, exercises: EXERCISES }, 30, NOW),
  insights: E.intelligence.homeInsights({ workouts, exercises: EXERCISES }).map((i) => i.title)
});

test('record order never changes a decision (every prescription, signal and analytic)', () => {
  const base = history();
  const asOf = addDays(DAY0, 30);
  const expected = decisions(base, profile(), asOf);
  for (const seed of [1, 7, 42, 99, 2026]) {
    assert.deepEqual(decisions(shuffle(base, seed), profile(), asOf), expected, `seed ${seed}`);
  }
  assert.deepEqual(decisions(base.slice().reverse(), profile(), asOf), expected);
});

test('shifting the whole history and the prescription date by k days changes nothing (calendar invariance)', () => {
  const shift = (workouts, k) => workouts.map((w) => {
    const completedAt = new Date(new Date(w.completedAt).getTime());
    const [y, m, d] = addDays(w.scheduledDate, k).split('-').map(Number);
    completedAt.setFullYear(y, m - 1, d);
    return { ...w, scheduledDate: addDays(w.scheduledDate, k), completedAt: completedAt.toISOString(), updatedAt: completedAt.toISOString() };
  });
  const base = history();
  const asOf = addDays(DAY0, 40);
  const strip = (d) => ({ loads: d.loads, fatigue: d.fatigue, plateaus: d.plateaus });
  const expected = strip(decisions(base, profile(), asOf));
  for (const k of [0, 1, 37, 120, 400, -20]) {
    for (const tz of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles']) {
      const before = process.env.TZ;
      process.env.TZ = tz;
      try { assert.deepEqual(strip(decisions(shift(base, k), profile(), addDays(asOf, k))), expected, `k=${k} ${tz}`); }
      finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
    }
  }
});

test('display units never change a prescription; displayed text converts consistently', () => {
  const asOf = addDays(DAY0, 30);
  E.units.setUnits('metric');
  const metric = decisions(history(), profile(), asOf).loads;
  E.units.setUnits('imperial');
  try {
    assert.deepEqual(decisions(history(), profile(), asOf).loads, metric, 'the engine works in kilograms only');
    for (const kg of [0.5, 1, 2.5, 10, 22.5, 60, 142.5, 200]) {
      const lb = E.units.wt(kg);
      assert.ok(Math.abs(lb - kg * 2.2046226218) <= 0.05, `${kg} kg -> ${lb} lb`);
      assert.ok(Math.abs(E.units.fromWt(lb) - kg) <= 0.03, `${lb} lb -> ${kg} kg round trip`);
    }
    assert.equal(E.units.displayText('use a small 2.5 kg progression step'), 'use a small 5.5 lb progression step');
  } finally { E.units.setUnits('metric'); }
});

test('equivalent load-list representations give the same prescription', () => {
  const asOf = addDays(DAY0, 3);
  const hist = [session(press, DAY0, threeSets(press, 25, 12))];
  const canonical = T.personalizedLoad(press, hist, profile({ loadIncrementsKg: { machine: [10, 15, 25, 30] } }), EXERCISES, asOf);
  const variants = [
    { machine: [30, 10, 15, 25] },
    { machine: [10, 15, 15, 25, 25, 30] },
    { machine: [10.04, 14.96, 25.02, 29.98] },
    { [press.id]: [10, 15, 25, 30] },
    { machine: [10, 15, 25, 30, NaN, -1, 0] }
  ];
  for (const v of variants) assert.deepEqual(T.personalizedLoad(press, hist, profile({ loadIncrementsKg: v }), EXERCISES, asOf), { ...canonical, evidence: canonical.evidence.map((e) => e) }, JSON.stringify(v));
});

test('loadDetail is presentation: removing or altering it never changes a decision', () => {
  const asOf = addDays(DAY0, 3);
  const plain = [session(press, DAY0, threeSets(press, 22.5, 12))];
  const detailed = [session(press, DAY0, threeSets(press, 22.5, 12).map((s) => ({ ...s, loadDetail: { kind: 'machine_stack', stackKg: 99, totalKg: 99 } })))];
  assert.deepEqual(T.personalizedLoad(press, detailed, profile(), EXERCISES, asOf), T.personalizedLoad(press, plain, profile(), EXERCISES, asOf));
});

test('assisted: the legacy (weight) and current (assistance) representations are interchangeable, also in PRs and analytics', () => {
  const mk = (field) => [0, 3, 6, 9].map((d, i) => session(pull, addDays(DAY0, d), [0, 1, 2].map(() => ({ id: 'x' + Math.random(), type: 'working', [field]: 30 - i * 2.5, reps: 8, completed: true }))));
  const a = mk('assistance');
  const b = mk('weight');
  const asOf = addDays(DAY0, 12);
  assert.deepEqual(T.personalizedLoad(pull, a, profile(), EXERCISES, asOf), T.personalizedLoad(pull, b, profile(), EXERCISES, asOf));
  const today = (field) => session(pull, asOf, [{ id: 'n', type: 'working', [field]: 20, reps: 8, completed: true }]);
  assert.deepEqual(T.detectAchievements(today('assistance'), EXERCISES, a).map((x) => [x.kind, x.value]), T.detectAchievements(today('weight'), EXERCISES, b).map((x) => [x.kind, x.value]));
  assert.deepEqual(E.analytics.plateauCandidates({ workouts: a, exercises: EXERCISES }), E.analytics.plateauCandidates({ workouts: b, exercises: EXERCISES }));
});

test('monotonicity: better performance on the same load never lowers the next prescription', () => {
  const asOf = addDays(DAY0, 3);
  for (const load of [10, 20, 42.5, 100]) {
    let previous = -Infinity;
    for (const reps of [2, 4, 6, 7, 8, 10, 11, 12, 14]) {
      const w = prescribeLoad(load, reps, asOf);
      assert.ok(w >= previous, `${load} kg: ${reps} reps gave ${w} after ${previous}`);
      previous = w;
    }
  }
  function prescribeLoad(load, reps, when) { return T.personalizedLoad(press, [session(press, DAY0, threeSets(press, load, reps))], profile(), EXERCISES, when).weight; }
});
