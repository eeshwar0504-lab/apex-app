'use strict';
/*
 * P1.5: invalid training inputs cannot produce invalid prescriptions, corrupted calculations or undefined progression.
 * Invalid = NaN, Infinity, negative, impossible (beyond src/engine/limits.ts), wrong type, malformed load lists,
 * invalid training days, invalid assistance / durations. Bad values are IGNORED as evidence, never "accepted quietly".
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, EXERCISES, byId, set, session, threeSets, profile, prescribe, addDays, DAY0 } = require('./phase1-helpers.cjs');

const press = byId('machine_chest_press');
const pull = byId('assisted_pullup');
const plank = byId('plank');
const HOSTILE = [NaN, Infinity, -Infinity, -1, -0.0001, 1e9, 1e6, 501, '8', null, undefined, {}, [], true];
const finiteOrUndefined = (v) => v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= 0);

test('trainingDays: anything invalid becomes 3; valid values clamp to 2-6 whole days; the plan always has that many training days', () => {
  const cases = [[NaN, 3], [Infinity, 3], [-Infinity, 3], ['4', 3], [null, 3], [undefined, 3], [{}, 3], [7, 6], [1, 2], [0, 2], [-3, 2], [2.6, 3], [4, 4], [6, 6], [2, 2]];
  for (const [input, expected] of cases) {
    assert.equal(T.sanitizeTrainingDays(input), expected, String(input));
    const plan = T.buildPlan(profile({ trainingDays: input }), EXERCISES, []);
    assert.equal(plan.days.length, 7);
    assert.equal(plan.days.filter((d) => !d.rest).length, expected, `plan days for ${String(input)}`);
  }
});

test('hostile reps / weights / durations never become evidence and never throw', () => {
  for (const bad of HOSTILE) {
    const badReps = [{ id: 'a', type: 'working', weight: 20, reps: bad, completed: true }];
    const r = T.progression(press, badReps);
    const invalidReps = !(typeof bad === 'number' && Number.isFinite(bad) && bad >= 0 && bad <= 500);
    if (invalidReps) assert.equal(r.action, 'calibrate', `reps=${String(bad)}`);
    const weightHistory = [session(press, DAY0, [{ id: 'b', type: 'working', weight: bad, reps: 10, completed: true }, { id: 'c', type: 'working', weight: bad, reps: 10, completed: true }])];
    const p = prescribe(press, weightHistory, profile());
    assert.ok(finiteOrUndefined(p.weight), `weight=${String(bad)} -> ${p.weight}`);
    const invalidWeight = !(typeof bad === 'number' && Number.isFinite(bad) && bad > 0 && bad <= 1000);
    if (invalidWeight) assert.notEqual(p.kind, 'baseline', `an invalid weight (${String(bad)}) must not be treated as exact history`);
    const timedBad = T.progression(plank, [{ id: 't', type: 'timed', seconds: bad, completed: true }]);
    if (!(typeof bad === 'number' && Number.isFinite(bad) && bad > 0 && bad <= 7200)) assert.equal(timedBad.action, 'calibrate', `seconds=${String(bad)}`);
  }
});

test('the plausibility limits are the boundary: just inside is evidence, just outside is not', () => {
  assert.notEqual(T.progression(press, [{ id: 'a', type: 'working', weight: 20, reps: 500, completed: true }]).action, 'calibrate');
  assert.equal(T.progression(press, [{ id: 'a', type: 'working', weight: 20, reps: 501, completed: true }]).action, 'calibrate');
  const heavy = (w) => prescribe(press, [session(press, DAY0, threeSets(press, w, 10))], profile());
  assert.equal(heavy(1000).kind, 'baseline');
  assert.notEqual(heavy(1001).kind, 'baseline');
  assert.equal(T.summarizeSets(press, [set(press, 1e9, 10)]).volume, 0, 'an impossible load adds no volume');
  assert.equal(T.summarizeSets(press, [set(press, 20, 1e6)]).volume, 0, 'impossible reps add no volume');
});

test('invalid assisted values are not evidence', () => {
  for (const bad of [NaN, Infinity, -5, '20', null, 1e9]) {
    const h = [session(pull, DAY0, [{ id: 'a', type: 'working', assistance: bad, reps: 10, completed: true }, { id: 'b', type: 'working', assistance: bad, reps: 10, completed: true }])];
    const r = prescribe(pull, h, profile());
    assert.notEqual(r.kind, 'baseline', `assistance=${String(bad)}`);
    assert.ok(finiteOrUndefined(r.weight));
  }
});

test('malformed load lists never produce a non-finite, negative or off-list prescription', () => {
  const lists = ['10,15', 25, {}, null, [NaN, -5, 0], [Infinity], [0.0001], ['20', 30], [30, 10, 10.04, 20], [1e9, 25]];
  for (const list of lists) {
    const p = profile({ loadIncrementsKg: { machine: list, [press.id]: list } });
    for (const reps of [3, 10, 12]) {
      const r = prescribe(press, [session(press, DAY0, threeSets(press, 20, reps))], p);
      assert.ok(typeof r.weight === 'number' && Number.isFinite(r.weight) && r.weight > 0, `${JSON.stringify(list)} reps ${reps} -> ${r.weight}`);
    }
  }
  assert.deepEqual(T.loadAvailability(press, profile({ loadIncrementsKg: { machine: [30, 10, 10.04, 20, 1e9, 0.0001] } })).options, [10, 20, 30]);
  assert.equal(T.snapToAvailableLoad(press, NaN, profile()), undefined);
  assert.equal(T.snapToAvailableLoad(press, -5, profile({ loadIncrementsKg: { machine: [10, 20] } })), undefined);
  assert.equal(T.snapToAvailableLoad(press, Infinity, profile({ loadIncrementsKg: { machine: [10, 20] } })), undefined);
});

test('FUZZ: every catalogue exercise, hostile histories, hostile profiles: prescriptions are finite or undefined, never NaN', () => {
  let seed = 987654;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const good = () => Math.round((1 + rnd() * 80) * 2) / 2;
  let checked = 0;
  for (const ex of EXERCISES) {
    for (let i = 0; i < 40; i++) {
      const sets = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => ({
        id: 's' + rnd(),
        type: pick(['working', 'working', 'warmup', 'drop', 'timed', 'assisted']),
        weight: rnd() < 0.4 ? pick(HOSTILE) : good(),
        assistance: rnd() < 0.3 ? pick(HOSTILE) : rnd() < 0.5 ? good() : undefined,
        reps: rnd() < 0.4 ? pick(HOSTILE) : Math.floor(rnd() * 20),
        seconds: rnd() < 0.3 ? pick(HOSTILE) : Math.floor(rnd() * 60),
        rir: rnd() < 0.3 ? pick([NaN, -1, 99, null, 2]) : Math.floor(rnd() * 4),
        completed: rnd() < 0.9
      }));
      const hist = [session(ex, DAY0, sets), session(ex, addDays(DAY0, 2), sets.slice().reverse())];
      const prof = profile({ trainingDays: pick(HOSTILE), experience: pick(['beginner', 'advanced', 'x', null]), loadIncrementsKg: rnd() < 0.5 ? { machine: pick([[10, 20], 'x', [NaN], null, [5, 5.04, 15]]), cable: pick([[2.5, 5], {}, [-1]]) } : undefined });
      const asOf = pick([addDays(DAY0, 3), addDays(DAY0, 40), 'nope', undefined, '', 42]);
      const r = T.personalizedLoad(ex, hist, prof, EXERCISES, asOf);
      assert.ok(finiteOrUndefined(r.weight), `${ex.id}: ${r.weight}`);
      assert.equal(typeof r.reason, 'string');
      assert.ok(Array.isArray(r.evidence) && r.evidence.every((e) => !/NaN|undefined|Infinity/.test(e)), `${ex.id}: ${JSON.stringify(r.evidence)}`);
      const p = T.progression(ex, sets);
      assert.ok(finiteOrUndefined(p.weight), `${ex.id} progression ${p.weight}`);
      const fb = T.feedbackLoad(ex, pick(HOSTILE), pick(['easy', 'heavy', 'right']), { reps: pick(HOSTILE), rir: pick(HOSTILE) }, ex.repRange, 2, prof);
      assert.ok(fb === undefined || (typeof fb === 'number' && Number.isFinite(fb) && fb >= 0), `${ex.id} feedback ${fb}`);
      const s = T.summarizeSets(ex, sets);
      for (const k of ['reps', 'load', 'volume']) assert.ok(Number.isFinite(s[k]) && s[k] >= 0, `${ex.id} ${k}=${s[k]}`);
      const made = T.makeSet(pick(['working', 'assisted', 'timed', 'warmup']), ex, pick(HOSTILE));
      for (const k of ['weight', 'assistance', 'reps', 'seconds']) assert.ok(made[k] === undefined || (Number.isFinite(made[k]) && made[k] >= 0), `${ex.id} makeSet ${k}=${made[k]}`);
      const plan = T.buildPlan(prof, EXERCISES, []);
      assert.equal(plan.days.filter((d) => !d.rest).length >= 2, true);
      checked++;
    }
  }
  assert.ok(checked >= EXERCISES.length * 40);
});

test('persistence boundary drops impossible set values (reps, weight, assistance, seconds) and keeps the set', () => {
  const store = new Map();
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { repository, fresh } = E.loadRepository();
  const s = fresh();
  s.onboardingComplete = true;
  s.workouts = [session(press, DAY0, [{ id: 'a', type: 'working', weight: 1e9, reps: 1e6, seconds: 1e9, assistance: 1e9, completed: true }, set(press, 20, 10)])];
  repository.save(s);
  const back = repository.load();
  assert.equal(back.onboardingComplete, true);
  const [bad, ok] = back.workouts[0].exercises[0].sets;
  for (const k of ['weight', 'reps', 'seconds', 'assistance']) assert.equal(bad[k], undefined, k);
  assert.equal(bad.completed, true, 'the set itself survives');
  assert.equal(ok.weight, 20);
});
