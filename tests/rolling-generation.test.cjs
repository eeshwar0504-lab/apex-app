'use strict';
/*
 * Phase 9: deterministic rolling workout generation (src/engine/rolling.ts).
 * The window of future scheduled workouts is kept filled from the plan template; history is never rewritten; the same
 * state, day and clock always give the same workouts.
 */
const { uiSource } = require('./ui-source.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, T, EXERCISES, profile } = require('./phase1-helpers.cjs');

const R = E.rolling;
const { addDaysLocal } = E.dates;
const ANCHOR = '2026-03-02';
const ALL_EQUIPMENT = ['machine', 'cable', 'dumbbell', 'bench', 'barbell', 'bodyweight'];
const at = (n, from = ANCHOR) => addDaysLocal(from, n);
const noonOf = (date) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d, 12, 0).toISOString(); };
const nowOf = (date) => `${date}T12:00:00.000Z`;
const opts = (today, extra = {}) => ({ today, now: nowOf(today), ...extra });

function stateFor({ days = 3, goal = 'general', equipment = ALL_EQUIPMENT, anchor = ANCHOR, preferences = {} } = {}) {
  const prof = profile({ trainingDays: days, primaryGoal: goal, goals: [goal], equipment });
  const exercises = E.goalProgram.programExercises(EXERCISES, goal);
  const built = T.buildPlan(prof, exercises, [{ kind: goal }]);
  const plan = { id: 'plan-test', name: built.name, mode: 'continuous', days: built.days, version: 1, createdAt: noonOf(anchor), updatedAt: noonOf(anchor), exerciseSets: built.exerciseSets };
  return { onboardingComplete: true, profile: prof, plan, workouts: [], exercises, goals: [], preferences, eventLog: [] };
}
const maintain = (s, today, extra) => R.maintainTrainingHorizon(s, opts(today, extra));
const scheduled = (s) => s.workouts.filter((w) => w.source === 'scheduled');
const inWindow = (s, today, horizon = 7) => scheduled(s).filter((w) => w.scheduledDate >= today && w.scheduledDate < at(horizon, today));
const complete = (w) => ({
  ...structuredClone(w), status: 'completed', completedAt: noonOf(w.scheduledDate), updatedAt: noonOf(w.scheduledDate),
  exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, completed: true, reps: e.repRange[1], rir: 2, weight: x.weight ?? e.recommendedWeight })) })),
});
const replaceWorkout = (s, id, fn) => ({ ...s, workouts: s.workouts.map((w) => (w.id === id ? fn(w) : w)) });

test('P9.1 the initial horizon is the same week onboarding always produced: one workout per template training day, on its date', () => {
  for (const days of [2, 3, 4, 5, 6]) {
    const s0 = stateFor({ days });
    const s1 = maintain(s0, ANCHOR);
    const made = scheduled(s1);
    const trainingDays = s0.plan.days.filter((d) => !d.rest);
    assert.equal(made.length, trainingDays.length, `${days} days`);
    assert.deepEqual(made.map((w) => w.scheduledDate), trainingDays.map((d) => at(d.dayIndex)), 'on anchor + dayIndex');
    assert.deepEqual(made.map((w) => w.name), trainingDays.map((d) => d.label));
    for (const w of made) {
      assert.equal(w.status, 'planned');
      assert.equal(w.source, 'scheduled');
      assert.equal(w.planId, 'plan-test');
      assert.equal(w.originalPlanVersion, 1);
      assert.equal(w.currentPlanVersion, 1);
      assert.ok(w.exercises.length >= 1 && w.exercises.length <= 7);
    }
  }
});

test('P9.1 each workout uses the plan selection for its day type, at most 7 exercises, with the usual set counts', () => {
  const s = maintain(stateFor({ days: 4 }), ANCHOR);
  for (const w of scheduled(s)) {
    const key = w.name.includes('UPPER') ? 'upper' : w.name.includes('LOWER') ? 'lower' : 'full';
    assert.deepEqual(w.exercises.map((e) => e.exerciseId), s.plan.exerciseSets[key].slice(0, 7));
    w.exercises.forEach((e, i) => assert.equal(e.sets.length, i < 4 ? 3 : 2));
  }
});

test('P9.2 the horizon is 7 days by default and 7..28 from preferences; anything else falls back or clamps', () => {
  assert.equal(R.DEFAULT_HORIZON_DAYS, 7);
  assert.equal(R.horizonDays({}), 7);
  assert.equal(R.horizonDays({ preferences: { horizonDays: 14 } }), 14);
  assert.equal(R.horizonDays({ preferences: { horizonDays: 3 } }), 7, 'never below a week');
  assert.equal(R.horizonDays({ preferences: { horizonDays: 90 } }), 28, 'capped');
  for (const bad of ['14', 10.5, NaN, null, undefined]) assert.equal(R.horizonDays({ preferences: { horizonDays: bad } }), 7, String(bad));
  assert.equal(R.horizonDays({}, 21), 21, 'an explicit override wins');
  const s = maintain(stateFor({ days: 3, preferences: { horizonDays: 14 } }), ANCHOR);
  assert.equal(scheduled(s).length, 6, 'two cycles of three days');
  assert.equal(scheduled(s)[5].scheduledDate, at(11));
});

test('P9.3 completing a workout does not change the horizon, and the next day adds exactly the newly visible slot', () => {
  let s = maintain(stateFor({ days: 3 }), ANCHOR);
  const first = scheduled(s)[0];
  s = replaceWorkout(s, first.id, complete);
  assert.equal(maintain(s, ANCHOR), s, 'completed still fills its slot: nothing to do');
  const next = maintain(s, at(1));
  assert.deepEqual(scheduled(next).map((w) => w.scheduledDate), [at(0), at(2), at(4), at(7)], 'day 7 enters the window on day 1');
  assert.equal(inWindow(next, at(1)).length, 3, 'three training days in any 7-day window');
});

test('P9.3 a skipped workout is not regenerated; the horizon still fills as days pass', () => {
  let s = maintain(stateFor({ days: 3 }), ANCHOR);
  const second = scheduled(s)[1];
  s = replaceWorkout(s, second.id, (w) => ({ ...w, status: 'skipped', updatedAt: nowOf(ANCHOR) }));
  assert.equal(maintain(s, ANCHOR), s, 'a skipped slot stays skipped');
  const later = maintain(s, at(3));
  assert.equal(scheduled(later).filter((w) => w.scheduledDate === second.scheduledDate).length, 1);
  assert.equal(later.workouts.find((w) => w.id === second.id).status, 'skipped');
  assert.equal(inWindow(later, at(3)).filter((w) => w.status === 'planned').length, 3, 'day 4 stays planned and days 7 and 9 are new; the skipped day is not among them');
});

test('P9.3 a zero-set abandoned session (status skipped) is not regenerated the same day', () => {
  let s = maintain(stateFor({ days: 3 }), ANCHOR);
  s = replaceWorkout(s, scheduled(s)[0].id, (w) => T.abandonWorkout(w, nowOf(ANCHOR)));
  assert.equal(s.workouts[0].status, 'skipped');
  assert.equal(maintain(s, ANCHOR), s);
});

test('P9.3 a removed future workout is regenerated, identically; removing them all restores the whole window', () => {
  const s0 = maintain(stateFor({ days: 4 }), ANCHOR);
  const victim = scheduled(s0)[2];
  const removed = { ...s0, workouts: s0.workouts.filter((w) => w.id !== victim.id) };
  const back = maintain(removed, ANCHOR);
  const again = back.workouts.find((w) => w.id === victim.id);
  assert.ok(again, 'the same slot has the same deterministic id');
  assert.deepEqual(again, victim, 'and the same content');
  assert.equal(back.workouts.length, s0.workouts.length);
  const none = maintain({ ...s0, workouts: [] }, ANCHOR);
  assert.deepEqual(scheduled(none).map((w) => w.scheduledDate).sort(), scheduled(s0).map((w) => w.scheduledDate).sort());
});

test('P9.3 reopening the app on a later day fills the window from that day', () => {
  const s = maintain(maintain(stateFor({ days: 3 }), ANCHOR), at(5));
  assert.equal(inWindow(s, at(5)).length, 3);
  assert.ok(scheduled(s).every((w) => w.scheduledDate >= ANCHOR));
});

test('P9.5 missed days: earlier planned sessions are marked missed by the existing rule and the future is filled', () => {
  const s0 = maintain(stateFor({ days: 3 }), ANCHOR);
  const s = maintain(s0, at(3));
  const byDate = (d) => s.workouts.find((w) => w.scheduledDate === d);
  assert.equal(byDate(at(0)).status, 'missed');
  assert.equal(byDate(at(2)).status, 'missed');
  assert.equal(byDate(at(4)).status, 'planned');
  assert.equal(byDate(at(0)).updatedAt, nowOf(at(3)), 'stamped with the supplied clock');
  assert.deepEqual(
    s.workouts.map((w) => w.status).slice(0, 3),
    T.markMissedWorkouts(s0.workouts, at(3)).map((w) => w.status),
    'the same statuses the existing markMissedWorkouts produces',
  );
  assert.deepEqual(scheduled(s).filter((w) => w.status === 'planned').map((w) => w.scheduledDate), [at(4), at(7), at(9)]);
});

test('P9.5 a rescheduled session keeps its original slot consumed and its replacement is not duplicated', () => {
  let s = maintain(stateFor({ days: 3 }), ANCHOR);
  const target = scheduled(s)[1]; // day 2
  const { original, replacement } = T.rescheduleWorkout(target, at(3)); // moved to a rest day
  assert.equal(original.status, 'rescheduled');
  s = { ...s, workouts: [...s.workouts.filter((w) => w.id !== target.id), original, replacement] };
  assert.equal(maintain(s, ANCHOR), s, 'the day it left and the day it moved to are both filled: nothing is generated');
  const later = maintain(s, at(1));
  assert.equal(later.workouts.filter((w) => w.scheduledDate === at(2)).length, 1, 'the vacated day is not regenerated');
  assert.equal(later.workouts.filter((w) => w.scheduledDate === at(3)).length, 1, 'and the moved session is not duplicated');
  assert.equal(later.workouts.find((w) => w.id === replacement.id).status, 'planned');
});

test('P9.6 a long gap: old sessions become missed, generation resumes from today, and loads follow personalizedLoad as of each date (return to training)', () => {
  let s = maintain(stateFor({ days: 3 }), ANCHOR);
  const first = scheduled(s)[0];
  const liftId = first.exercises[0].exerciseId;
  const lift = s.exercises.find((e) => e.id === liftId);
  s = replaceWorkout(s, first.id, (w) => complete({ ...w, exercises: w.exercises.map((e) => (e.exerciseId === liftId ? { ...e, recommendedWeight: 40, sets: e.sets.map((x) => ({ ...x, weight: 40 })) } : e)) }));
  const gapDay = at(40);
  const back = maintain(s, gapDay);
  assert.ok(back.workouts.filter((w) => w.id !== first.id && w.scheduledDate < gapDay).every((w) => w.status === 'missed'), 'everything earlier was missed');
  const future = scheduled(back).filter((w) => w.scheduledDate >= gapDay);
  assert.equal(future.length, 3);
  const completed = back.workouts.filter((w) => w.status === 'completed');
  for (const w of future) {
    const entry = w.exercises.find((e) => e.exerciseId === liftId);
    if (!entry) continue;
    const rec = T.personalizedLoad(lift, completed, back.profile, back.exercises, w.scheduledDate);
    assert.ok(rec.returnToTraining, 'a 40-day gap is a return to training');
    assert.equal(entry.recommendedWeight, rec.weight, 'the existing rule, not a new one');
    const noGap = T.personalizedLoad(lift, completed, back.profile, back.exercises, at(1));
    assert.ok(entry.recommendedWeight < noGap.weight, `re-entry (${entry.recommendedWeight}) is lighter than the no-gap prescription (${noGap.weight})`);
  }
});

test('P9.7 duplicate prevention and idempotence: repeated calls change nothing and never duplicate a date or an id', () => {
  let s = stateFor({ days: 4 });
  for (let d = 0; d < 60; d++) {
    const today = at(d);
    s = maintain(s, today);
    const twice = maintain(s, today);
    assert.equal(twice, s, `day ${d}: a second call is a no-op (the same object)`);
    const sched = scheduled(s);
    assert.equal(new Set(sched.map((w) => w.scheduledDate)).size, sched.length, `day ${d}: one scheduled workout per date`);
    assert.equal(new Set(s.workouts.map((w) => w.id)).size, s.workouts.length, `day ${d}: unique ids`);
    assert.equal(inWindow(s, today).length, 4, `day ${d}: the horizon holds four training days`);
    for (const w of sched.filter((x) => x.scheduledDate === today && x.status === 'planned')) s = replaceWorkout(s, w.id, complete);
  }
});

test('P9.7 generateRollingWorkouts returns only what is missing, and nothing once the horizon is full', () => {
  const s = maintain(stateFor({ days: 3 }), ANCHOR);
  assert.deepEqual(R.generateRollingWorkouts(s, opts(ANCHOR)), []);
  assert.equal(R.missingSlots(s, opts(ANCHOR)).length, 0);
  const gen = R.generateRollingWorkouts(s, opts(at(1)));
  assert.deepEqual(gen.map((w) => w.scheduledDate), [at(7)]);
  assert.ok(!s.workouts.some((w) => w.id === gen[0].id));
});

test('P9.8 history immutability: completed and past workouts are byte-for-byte unchanged after two months of daily maintenance', () => {
  let s = stateFor({ days: 4, goal: 'strength' });
  const snapshots = new Map();
  for (let d = 0; d < 60; d++) {
    const today = at(d);
    s = maintain(s, today);
    for (const w of scheduled(s).filter((x) => x.scheduledDate === today && x.status === 'planned' && d % 3 !== 0)) s = replaceWorkout(s, w.id, complete);
    for (const w of s.workouts) if (w.status === 'completed' && !snapshots.has(w.id)) snapshots.set(w.id, JSON.stringify(w));
    for (const [id, json] of snapshots) assert.equal(JSON.stringify(s.workouts.find((w) => w.id === id)), json, `day ${d}: ${id} unchanged`);
  }
  assert.ok(snapshots.size > 10);
  // anything else that changed did so only by planned -> missed
  const final = new Map(s.workouts.map((w) => [w.id, w]));
  for (const w of final.values()) assert.ok(['completed', 'planned', 'missed'].includes(w.status), w.status);
});

test('P9.8 the input state is never mutated', () => {
  const s0 = maintain(stateFor({ days: 3 }), ANCHOR);
  const before = JSON.stringify(s0);
  maintain(s0, at(10));
  R.generateRollingWorkouts(s0, opts(at(10)));
  assert.equal(JSON.stringify(s0), before);
});

test('P9.9 determinism: the same state, day and clock give identical workouts, ids and timestamps included', () => {
  const base = stateFor({ days: 5, goal: 'hypertrophy' }); // built once: buildPlan itself draws random ids for the template days
  const a = maintain(base, at(9));
  const b = maintain(structuredClone(base), at(9));
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(R.generateRollingWorkouts(base, opts(at(3))), R.generateRollingWorkouts(structuredClone(base), opts(at(3))));
  const later = maintain(base, at(9), { now: '2030-01-01T00:00:00.000Z' });
  assert.deepEqual(later.workouts.map((w) => w.id), a.workouts.map((w) => w.id), 'ids never depend on the clock');
});

test('P9.9 the plan anchor and generated days are the same in every time zone', () => {
  const ZONES = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Auckland'];
  const outputs = ZONES.map((tz) => {
    const before = process.env.TZ;
    process.env.TZ = tz;
    try { return JSON.stringify(scheduled(maintain(stateFor({ days: 4 }), ANCHOR)).map((w) => [w.id, w.scheduledDate, w.name])); }
    finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
  });
  assert.equal(new Set(outputs).size, 1);
});

test('P9.4 training frequency: the number of workouts per 7 days equals the plan, for every supported frequency, and scales with the horizon', () => {
  for (const days of [2, 3, 4, 5, 6]) {
    const s = maintain(stateFor({ days }), ANCHOR);
    assert.equal(inWindow(s, ANCHOR).length, days);
    const four = maintain(stateFor({ days, preferences: { horizonDays: 28 } }), ANCHOR);
    assert.equal(scheduled(four).length, days * 4, `${days} days x 4 weeks`);
  }
});

test('P9.4 equipment: every generated exercise fits the athlete\'s equipment, and a training day is never empty', () => {
  const fits = E.exerciseGraph.exerciseFitsEquipment;
  for (const equipment of [['dumbbell', 'bench'], ['machine'], ['cable', 'machine'], ['bodyweight'], ['kettlebell'], ['dumbbell']]) {
    const s = maintain(stateFor({ days: 4, equipment, preferences: { horizonDays: 14 } }), ANCHOR);
    for (const w of scheduled(s)) {
      assert.ok(w.exercises.length > 0, `${equipment}: ${w.name} is never empty`);
      for (const e of w.exercises) assert.ok(fits(s.exercises.find((x) => x.id === e.exerciseId), equipment), `${equipment}: ${e.exerciseId}`);
    }
  }
});

test('P9.4 equipment edited after planning: later workouts drop what no longer fits, earlier ones are untouched', () => {
  const s0 = maintain(stateFor({ days: 3, equipment: ALL_EQUIPMENT }), ANCHOR);
  const narrowed = { ...s0, profile: { ...s0.profile, equipment: ['dumbbell', 'bench'] } };
  const s1 = maintain(narrowed, at(7));
  assert.deepEqual(
    s1.workouts.slice(0, s0.workouts.length).map((w) => [w.id, w.scheduledDate, w.exercises]),
    s0.workouts.map((w) => [w.id, w.scheduledDate, w.exercises]),
    'existing workouts keep their exercises (they only became missed, as days passed)',
  );
  const fits = E.exerciseGraph.exerciseFitsEquipment;
  for (const w of s1.workouts.slice(s0.workouts.length)) for (const e of w.exercises) assert.ok(fits(s1.exercises.find((x) => x.id === e.exerciseId), ['dumbbell', 'bench']), e.exerciseId);
});

test('P9.4 goal: prescriptions follow the programmed catalogue for the primary goal', () => {
  const repRanges = {};
  for (const goal of ['strength', 'hypertrophy', 'fat_loss', 'fitness']) {
    const s = maintain(stateFor({ days: 3, goal }), ANCHOR);
    repRanges[goal] = JSON.stringify(scheduled(s)[0].exercises.map((e) => e.repRange));
    for (const w of scheduled(s)) for (const e of w.exercises) {
      if (e.sets.some((x) => x.completed)) continue;
      assert.deepEqual(e.repRange, s.exercises.find((x) => x.id === e.exerciseId).repRange, `${goal}: ${e.exerciseId}`);
    }
  }
  assert.notEqual(repRanges.strength, repRanges.fitness, 'different goals programme different rep windows');
});

test('P9.4 progression state: with history, generated loads equal the engine\'s prescription as of the workout date', () => {
  let s = maintain(stateFor({ days: 3 }), ANCHOR);
  for (const w of scheduled(s).slice(0, 2)) s = replaceWorkout(s, w.id, complete);
  s = maintain(s, at(3));
  const completed = s.workouts.filter((w) => w.status === 'completed');
  const fresh = scheduled(s).filter((w) => w.scheduledDate > at(4));
  assert.ok(fresh.length > 0);
  for (const w of fresh) for (const e of w.exercises) {
    const ex = s.exercises.find((x) => x.id === e.exerciseId);
    const rec = T.personalizedLoad(ex, completed, s.profile, s.exercises, w.scheduledDate);
    if (rec.kind === 'baseline' && rec.action !== undefined && rec.action !== 'calibrate' && rec.weight !== undefined) assert.equal(e.recommendedWeight, rec.weight, e.exerciseId);
  }
});

test('P9.10 metamorphic: shifting the plan and the day by k days shifts every workout by k days and changes nothing else', () => {
  const shape = (s) => scheduled(s).map((w) => ({ name: w.name, ex: w.exercises.map((e) => [e.exerciseId, e.sets.length, e.repRange]) }));
  const a = maintain(stateFor({ days: 5, anchor: '2026-03-02' }), '2026-03-02');
  for (const k of [1, 6, 7, 45, 400]) {
    const anchor = at(k);
    const b = maintain(stateFor({ days: 5, anchor }), anchor);
    assert.deepEqual(shape(b), shape(a), `k=${k}`);
    assert.deepEqual(scheduled(b).map((w) => w.scheduledDate), scheduled(a).map((w) => at(k, w.scheduledDate)), `k=${k} dates`);
  }
});

test('P9.10 metamorphic: one 14-day horizon equals a 7-day horizon followed by another a week later', () => {
  const wide = maintain(stateFor({ days: 4, preferences: { horizonDays: 14 } }), ANCHOR);
  const stepped = maintain(maintain(stateFor({ days: 4 }), ANCHOR), at(7));
  const key = (s) => scheduled(s).map((w) => [w.scheduledDate, w.name, w.exercises.map((e) => e.exerciseId)]);
  assert.equal(key(wide).length, 8);
  assert.deepEqual(key(stepped), key(wide));
});

test('P9.10 extra and custom workouts neither fill a slot nor are touched', () => {
  const s0 = stateFor({ days: 3 });
  const extra = { id: 'extra-1', planId: 'plan-test', name: 'Extra', scheduledDate: ANCHOR, status: 'planned', source: 'extra', version: 1, exercises: [] };
  const custom = { ...extra, id: 'custom-1', source: 'custom', scheduledDate: at(2) };
  const s = maintain({ ...s0, workouts: [extra, custom] }, ANCHOR);
  assert.equal(scheduled(s).length, 3, 'the three scheduled slots are still generated');
  assert.deepEqual(s.workouts.filter((w) => w.source !== 'scheduled'), [extra, custom]);
});

test('P9 nothing happens without a plan, a profile or finished onboarding, and bad dates generate nothing', () => {
  const s0 = stateFor({ days: 3 });
  assert.equal(maintain({ ...s0, plan: undefined }, ANCHOR).workouts.length, 0);
  const noPlan = { ...s0, plan: undefined };
  assert.equal(maintain(noPlan, ANCHOR), noPlan);
  const noProfile = { ...s0, profile: undefined };
  assert.equal(maintain(noProfile, ANCHOR), noProfile);
  const notOnboarded = { ...s0, onboardingComplete: false };
  assert.equal(maintain(notOnboarded, ANCHOR), notOnboarded);
  assert.deepEqual(R.generateRollingWorkouts(s0, { today: 'not a date', now: nowOf(ANCHOR) }), []);
});

test('P9 generation is logged in the event log, with the dates it added', () => {
  const s = maintain(stateFor({ days: 3 }), ANCHOR);
  const evt = s.eventLog.find((e) => e.type === 'workouts_generated');
  assert.ok(evt);
  assert.deepEqual(evt.payload.dates, [at(0), at(2), at(4)]);
  assert.equal(maintain(s, ANCHOR).eventLog.length, 1, 'a no-op run logs nothing');
});

test('P9.11 app integration: main.tsx no longer builds workouts itself and keeps the horizon through the engine', () => {
  const main = uiSource();
  assert.doesNotMatch(main, /makeInitialWorkouts/);
  assert.doesNotMatch(main, /markMissedWorkouts\(/, 'the missed pass is part of maintainTrainingHorizon now');
  assert.match(main, /maintainTrainingHorizon\(/);
  assert.match(main, /generateRollingWorkouts\(/);
  assert.match(main, /visibilitychange/, 'a day that passes while the app is closed or backgrounded is noticed');
  const engine = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine', 'rolling.ts'), 'utf8');
  assert.doesNotMatch(engine, /Math\.random|Date\.now\(|new Date\(\)/, 'the generator reads no clock and no randomness');
  assert.doesNotMatch(engine, /localStorage|repository|sqlite/i, 'storage is the repository\'s job');
});
