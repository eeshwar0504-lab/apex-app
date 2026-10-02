'use strict';
/*
 * P1.1 / P4.8: custom load lists must never silently stall or reverse progression.
 * Rule (docs/TRAINING_SEMANTICS.md):
 *   increase            -> smallest available load at or above (last worked + one exercise increment)
 *   reduce / return     -> largest available load at or below the target
 *   hold / recover      -> nearest available load to the last worked load (a tie goes to the lower one)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { T, byId, threeSets, set, session, profile, prescribe, addDays, DAY0 } = require('./phase1-helpers.cjs');

const press = byId('machine_chest_press'); // stack, increment 2.5 kg, reps 8-12
const withList = (list) => profile({ loadIncrementsKg: { machine: list } });
const lastOf = (load, reps) => [session(press, DAY0, threeSets(press, load, reps))];

test('increase: a real step up, not the same load (was: 25 -> 27.5 -> tie -> 25, a silent stall)', () => {
  const p = withList([10, 15, 25, 30]);
  assert.equal(prescribe(press, lastOf(25, 12), p).weight, 30);
  assert.equal(prescribe(press, lastOf(15, 12), p).weight, 25);
  assert.equal(prescribe(press, lastOf(10, 12), p).weight, 15);
});

test('increase at the top of the list holds the top load (nothing higher exists) and never goes below it', () => {
  const p = withList([10, 15, 25, 30]);
  const r = prescribe(press, lastOf(30, 12), p);
  assert.equal(r.weight, 30);
  assert.equal(r.action, 'increase');
});

test('exact boundary: last + increment lands exactly on an available load', () => {
  assert.equal(prescribe(press, lastOf(20, 12), withList([20, 22.5, 25])).weight, 22.5);
});

test('a list finer than the exercise increment still moves by at least one increment', () => {
  assert.equal(prescribe(press, lastOf(20, 12), withList([20, 21, 22.5, 25])).weight, 22.5);
});

test('reduce: a real step down, and never below the lowest available load', () => {
  assert.equal(prescribe(press, [session(press, DAY0, [set(press, 25, 4), set(press, 25, 5), set(press, 25, 5)])], withList([10, 15, 25, 30])).weight, 15);
  assert.equal(prescribe(press, [session(press, DAY0, [set(press, 25, 4), set(press, 25, 5), set(press, 25, 5)])], withList([20, 22.5, 25])).weight, 22.5);
  const floor = prescribe(press, [session(press, DAY0, [set(press, 10, 3), set(press, 10, 3), set(press, 10, 3)])], withList([10, 15, 25]));
  assert.equal(floor.weight, 10, 'the lowest available load is the floor');
  assert.equal(floor.action, 'reduce');
});

test('between-step load: a load that is not on the list snaps to the nearest one (tie: lower)', () => {
  const p = withList([15, 25]);
  assert.equal(prescribe(press, lastOf(20, 10), p).weight, 15, 'exact tie goes to the lower load');
  assert.equal(prescribe(press, lastOf(21, 10), p).weight, 25, 'the logged 21 kg is closer to 25 than to 15 (it is not pre-rounded to 20)');
  assert.equal(prescribe(press, lastOf(17.5, 10), p).weight, 15);
});

test('asymmetric list: steps follow the list, not a fixed gap', () => {
  const p = withList([10, 12.5, 15, 30, 50]);
  assert.equal(prescribe(press, lastOf(15, 12), p).weight, 30);
  assert.equal(prescribe(press, [session(press, DAY0, [set(press, 30, 4), set(press, 30, 4), set(press, 30, 4)])], p).weight, 15);
  assert.equal(prescribe(press, lastOf(30, 12), p).weight, 50);
});

test('repeated progression climbs the list in order and never reverses or stalls before the top', () => {
  const p = withList([10, 12.5, 15, 17.5, 20]);
  let date = DAY0;
  let load = 10;
  const history = [];
  const seen = [];
  for (let i = 0; i < 7; i++) {
    history.push(session(press, date, threeSets(press, load, 12)));
    const next = prescribe(press, history, p, addDays(date, 2)).weight;
    seen.push(next);
    load = next;
    date = addDays(date, 2);
  }
  assert.deepEqual(seen, [12.5, 15, 17.5, 20, 20, 20, 20]);
});

test('coarse list steps trip the existing workload-spike signal: one session of "recover" (hold), then progression resumes', () => {
  const p = withList([10, 15, 25, 30, 40]);
  let date = DAY0;
  let load = 10;
  const history = [];
  const actions = [];
  const loads = [];
  for (let i = 0; i < 6; i++) {
    history.push(session(press, date, threeSets(press, load, 12)));
    const r = prescribe(press, history, p, addDays(date, 2));
    actions.push(r.action);
    loads.push(r.weight);
    load = r.weight;
    date = addDays(date, 2);
  }
  // 10->15 (+50% volume) and 15->25 (+67%) each trip the spike rule, so the next top-of-range session is held once;
  // 25->30 is only +20%, so progression continues at once. Loads never reverse.
  assert.deepEqual(loads, [15, 15, 25, 25, 30, 40]);
  assert.deepEqual(actions, ['increase', 'recover', 'increase', 'recover', 'increase', 'increase']);
  for (let i = 1; i < loads.length; i++) assert.ok(loads[i] >= loads[i - 1], 'never reverses');
});

test('ordering invariant over random lists: increase >= hold >= reduce for the same last load', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (let i = 0; i < 400; i++) {
    const size = 2 + Math.floor(rnd() * 6);
    const list = [...new Set(Array.from({ length: size }, () => Math.round((2.5 + rnd() * 60) * 2) / 2))].sort((a, b) => a - b);
    if (list.length < 2) continue;
    const last = rnd() < 0.7 ? list[Math.floor(rnd() * list.length)] : Math.round((2.5 + rnd() * 60) * 2) / 2;
    const p = withList(list);
    const inc = prescribe(press, lastOf(last, 12), p).weight;
    const hold = prescribe(press, lastOf(last, 10), p).weight;
    const red = prescribe(press, [session(press, DAY0, [set(press, last, 3), set(press, last, 3), set(press, last, 3)])], p).weight;
    assert.ok(list.includes(inc) && list.includes(hold) && list.includes(red), `only configured loads: ${JSON.stringify({ list, last, inc, hold, red })}`);
    assert.ok(inc >= hold, `increase below hold: ${JSON.stringify({ list, last, inc, hold })}`);
    assert.ok(hold >= red, `hold below reduce: ${JSON.stringify({ list, last, hold, red })}`);
  }
});

test('return-to-training with a list: one real load per step, never an increase, progression resumes afterwards', () => {
  const p = withList([10, 15, 25, 30]);
  const hist = lastOf(30, 12);
  assert.equal(prescribe(press, hist, p, addDays(DAY0, 13)).weight, 30, 'under 14 days: normal progression at the top');
  assert.equal(prescribe(press, hist, p, addDays(DAY0, 14)).weight, 25, '14 days: one step down, not the +increase');
  assert.equal(prescribe(press, hist, p, addDays(DAY0, 28)).weight, 15, '28 days: two steps (30 -> 15 is exactly half)');
  assert.equal(prescribe(press, hist, p, addDays(DAY0, 56)).weight, 15, '56 days: a third step would exceed half the load');
  const back = [...hist, session(press, addDays(DAY0, 14), threeSets(press, 25, 12))];
  assert.equal(prescribe(press, back, p, addDays(DAY0, 17)).weight, 30, 'after the return session normal progression resumes');
});

test('malformed lists are ignored, not half-applied', () => {
  for (const bad of ['10,15,25', 25, {}, null, [NaN, -5, 0, 'x', null], [Infinity]]) {
    const r = prescribe(press, lastOf(20, 12), profile({ loadIncrementsKg: { machine: bad } }));
    assert.equal(r.weight, 22.5, `malformed list ${JSON.stringify(bad)} must behave like no list`);
  }
  const mixed = profile({ loadIncrementsKg: { machine: [NaN, -5, 0, '7', null, 12, 12.04, 20] } });
  assert.deepEqual(T.loadAvailability(press, mixed).options, [12, 20], 'only finite positive numbers, rounded and de-duplicated');
});
