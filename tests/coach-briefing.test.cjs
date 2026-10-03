'use strict';
/*
 * Phase 15: Coach 2.0 briefing (src/coach/briefing.ts). It only synthesises decisions the engines already made, in a fixed
 * priority order; it never writes training state and never invents a prescription.
 */
const { uiSource } = require('./ui-source.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, T, EXERCISES, byId, session, set, profile, addDays } = require('./phase1-helpers.cjs');

const B = E.briefing;
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const MON = '2026-03-02';
const TODAY = '2026-03-05';
const press = byId('machine_chest_press');
const curl = byId('dumbbell_bicep_curl');

const sets3 = (ex, load, reps, rir = 2) => [0, 1, 2].map(() => set(ex, load, reps, rir));
const mk = (ex, date, load, reps, extra = {}, rir = 2) => session(ex, date, sets3(ex, load, reps, rir), extra);
const planned = (ex, date = TODAY, name = 'Upper A') => session(ex, date, sets3(ex, undefined, undefined), { status: 'planned', name });
const stateOf = (workouts, extra = {}) => ({ schemaVersion: 4, onboardingComplete: true, profile: profile({ equipment: ['machine', 'dumbbell', 'barbell'] }), goals: [], workouts, exercises: EXERCISES, achievements: [], measurements: [], journal: [], observations: [], preferences: {}, eventLog: [], ...extra });
const brief = (workouts, extra, today = TODAY) => B.coachBriefing(stateOf(workouts, extra), today);
const kinds = (b) => b.items.map((i) => i.kind);

// sessions every 3 days ending two days before TODAY
const recent = (ex, loads, reps = 10) => loads.map((load, i) => mk(ex, addDays(TODAY, -2 - 3 * (loads.length - 1 - i)), load, reps));
const history = (ex, loads, start = addDays(MON, -21), gap = 3, reps = 10) => loads.map((load, i) => mk(ex, addDays(start, i * gap), load, reps));

test('P15.1 insufficient data is explicit: fewer than two sessions gives status insufficient_data and a limitation', () => {
  const b = brief([planned(press)]);
  assert.equal(b.status, 'insufficient_data');
  assert.ok(b.nextStep.text && b.nextStep.reason, 'there is still a next step');
  assert.match(b.limitations.join(' '), /Fewer than two completed sessions/);
  assert.equal(b.headline, 'Not enough history yet');
  const one = brief([mk(press, addDays(MON, -3), 40, 10), planned(press)]);
  assert.equal(one.status, 'insufficient_data');
  assert.equal(B.coachBriefing(stateOf([]), 'bad-date'), undefined);
});

test('P15.1 no workout planned: say so, recommend nothing invented', () => {
  const b = brief(recent(press, [40, 40, 40]));
  assert.equal(b.nextStep.kind, 'train_as_planned');
  assert.match(b.nextStep.text, /no session planned/i);
  assert.match(b.limitations.join(' '), /No active or planned workout/);
  assert.deepEqual(b.today.exercises, []);
});

test('P15.2 progression: an engine increase becomes "follow the progression", quoting the engine\'s own load', () => {
  const ws = [...recent(press, [40, 40], 12), planned(press)];
  const b = brief(ws);
  const rec = T.personalizedLoad(press, ws, stateOf(ws).profile, EXERCISES, TODAY);
  assert.equal(rec.action, 'increase');
  assert.equal(b.nextStep.kind, 'follow_progression');
  assert.match(b.nextStep.text, new RegExp(`${press.name} at ${rec.weight} kg`));
  assert.deepEqual(b.nextStep.exerciseIds, [press.id]);
  assert.equal(b.today.exercises[0].weight, rec.weight);
  assert.equal(b.today.exercises[0].outcome, 'PROGRESS');
});

test('P15.2 hold: the engine holds the load, the Coach says to keep it', () => {
  const ws = [...history(press, [40, 40, 42.5], addDays(MON, -9), 3, 9), planned(press)];
  const b = brief(ws);
  assert.equal(b.nextStep.kind, 'maintain_load');
  assert.equal(b.status, 'on_track');
  assert.match(b.nextStep.text, /Keep the prescribed loads/);
});

test('P15.2 stalled exercise: a persistent plateau is surfaced for review, with no load or exercise invented', () => {
  const ws = [...[0, 1, 2, 3, 4, 5].map((i) => mk(curl, addDays(MON, -15 + i * 3), 10, 9)), planned(curl, addDays(MON, 3))];
  const b = brief(ws, { profile: profile({ equipment: ['barbell'] }) });
  assert.equal(b.nextStep.kind, 'review_stalled_exercise');
  assert.deepEqual(b.nextStep.exerciseIds, [curl.id]);
  assert.match(b.nextStep.text, /progress has stalled/);
  assert.ok(!/\d+(\.\d+)? kg/.test(b.nextStep.text), 'no load is suggested');
  assert.equal(b.status, 'attention');
});

test('P15.2 re-entry: a long gap is conservative re-entry and says the load is already reduced', () => {
  const ws = [...history(press, [40, 42.5, 42.5], addDays(MON, -60), 3), planned(press)];
  const b = brief(ws);
  assert.equal(b.today.exercises[0].outcome, 'CONSERVATIVE_REENTRY');
  assert.equal(b.nextStep.kind, 'conservative_reentry');
  assert.match(b.nextStep.text, /already reduced/);
  const rec = T.personalizedLoad(press, ws, stateOf(ws).profile, EXERCISES, TODAY);
  assert.equal(b.today.exercises[0].weight, rec.weight, 'the Coach quotes the engine\'s reduced load');
});

const heavy = (w) => [0, 1, 2, 3].map((d) => mk(press, addDays('2026-01-05', w * 7 + d), 80, 10, {}, 0));
const normalWeeks = [0, 1, 2].flatMap((w) => [0, 2, 4].map((d) => mk(press, addDays('2026-01-05', w * 7 + d), 40, 10)));
const SUSTAINED = [...normalWeeks, ...heavy(3), ...heavy(4)];
const SUS_TODAY = addDays('2026-01-05', 34);

test('P15.2 recovery: a recommended deload outranks everything else and sets status recovery', () => {
  const ws = [...SUSTAINED, planned(press, SUS_TODAY)];
  const b = brief(ws, undefined, SUS_TODAY);
  assert.equal(b.nextStep.kind, 'recovery_deload');
  assert.equal(b.nextStep.severity, 'important');
  assert.equal(b.status, 'recovery');
  assert.match(b.nextStep.text, /deload week is recommended/i);
  assert.match(b.nextStep.text, /You decide/);
  assert.equal(b.items[0].priority, 1);
});

test('P15.2 deload active and sustained fatigue are reported at the right severity', () => {
  const active = brief([...SUSTAINED, planned(press, addDays(SUS_TODAY, 1))], { deloads: [SUS_TODAY] }, addDays(SUS_TODAY, 1));
  assert.equal(active.nextStep.kind, 'recovery_deload');
  assert.equal(active.nextStep.severity, 'info');
  assert.match(active.nextStep.text, /Deload week in progress/);
  const week4 = [...normalWeeks, ...[0, 2, 4].map((d) => mk(press, addDays('2026-01-05', 21 + d), 80, 10, {}, 2)), ...heavy(4)];
  const sustained = brief([...week4, planned(press, SUS_TODAY)], undefined, SUS_TODAY);
  assert.equal(sustained.nextStep.kind, 'recovery_deload');
  assert.equal(sustained.nextStep.severity, 'attention');
});

test('P15.2 missed training: resume with the next planned session, never "make up" the missed ones', () => {
  const missed = [-10, -8].map((n) => mk(press, addDays(TODAY, n), 40, 10, { status: 'missed', exercises: [] }));
  const ws = [...recent(press, [40, 40, 40]), ...missed, planned(press)]; // trained 2 days ago: only the missed sessions can trigger this
  const b = brief(ws);
  assert.ok(kinds(b).includes('resume_after_missed'));
  const item = b.items.find((i) => i.kind === 'resume_after_missed');
  assert.match(item.reason, /2 planned sessions were missed/);
  assert.match(item.text, /do not try to make up/);
  const gap = brief([...history(press, [40, 40, 40], addDays(TODAY, -20), 2), planned(press)]);
  assert.equal(gap.items.find((i) => i.kind === 'resume_after_missed').reason.startsWith('It has been'), true);
});

test('P15.2 weekly consistency: under half of the planned sessions done is a review item (only with enough of the week gone)', () => {
  const ws = [
    mk(press, MON, 40, 10), ...[1, 2].map((n) => mk(press, addDays(MON, n), 40, 10, { status: 'missed', exercises: [] })),
    ...history(press, [40, 40], addDays(MON, -14), 3), planned(press),
  ];
  const b = brief(ws, undefined, TODAY);
  assert.ok(kinds(b).includes('review_consistency'), JSON.stringify(kinds(b)));
  assert.equal(b.items.find((i) => i.kind === 'review_consistency').metrics[0].value, '25%');
  const early = brief(ws, undefined, addDays(MON, 1));
  assert.ok(!kinds(early).includes('review_consistency'), 'two days into the week it is too early to say');
  const bad = [mk(press, MON, 40, 10, { status: 'missed', exercises: [] }), mk(press, addDays(MON, 1), 40, 10, { status: 'missed', exercises: [] }), ...recent(press, [40, 40]), planned(press, addDays(MON, 1))];
  assert.ok(!kinds(brief(bad, undefined, addDays(MON, 1))).includes('review_consistency'), '0% after two days is still too early (the guard is three days into the week)');
  assert.ok(kinds(brief(bad, undefined, addDays(MON, 2))).includes('review_consistency'), 'the third day is enough');
});

test('P15.3 safety comes first and uses the existing Coach gate (no symptom interpretation)', () => {
  const ws = [...history(press, [40, 40, 40], addDays(MON, -9), 3, 9), planned(press)];
  const b = brief(ws, { journal: [{ id: 'j', date: TODAY, scope: 'general', tags: ['safety'], text: 'something felt off', createdAt: TODAY, updatedAt: TODAY }] });
  assert.equal(b.nextStep.kind, 'safety_first');
  assert.equal(b.nextStep.priority, 0);
  assert.equal(b.status, 'recovery');
  assert.match(b.nextStep.text, /does not interpret symptoms/);
});

test('P15.3 priority: at most three distinct items, most urgent first, no repeats', () => {
  const ws = [...SUSTAINED, planned(press, SUS_TODAY)];
  const b = brief(ws, { journal: [{ id: 'j', date: SUS_TODAY, scope: 'general', tags: ['safety'], text: 'x', createdAt: SUS_TODAY, updatedAt: SUS_TODAY }] }, SUS_TODAY);
  assert.ok(b.items.length <= 3);
  assert.deepEqual(b.items.map((i) => i.priority), [...b.items.map((i) => i.priority)].sort((a, c) => a - c));
  assert.equal(new Set(kinds(b)).size, b.items.length);
  assert.deepEqual(kinds(b).slice(0, 2), ['safety_first', 'recovery_deload']);
  assert.equal(b.nextStep, b.items[0]);
});

test('P15.4 the Coach never writes or invents: every named exercise and load comes from the engine, and state is untouched', () => {
  const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
  const ws = [...recent(press, [40, 40], 12), ...recent(curl, [10, 10], 12), planned(press)];
  const s = stateOf(ws);
  const json = JSON.stringify(s);
  const b = B.coachBriefing(deepFreeze(s), TODAY);
  assert.equal(JSON.stringify(s), json);
  const plannedIds = new Set(ws.find((w) => w.status === 'planned').exercises.map((e) => e.exerciseId));
  for (const i of b.items) for (const id of i.exerciseIds) assert.ok(plannedIds.has(id), `${id} is in today's workout`);
  for (const d of b.today.exercises) {
    const rec = T.personalizedLoad(byId(d.exerciseId), ws, s.profile, EXERCISES, TODAY);
    assert.equal(d.weight, rec.weight);
    assert.equal(d.action, rec.action);
  }
  const numbers = (b.nextStep.text.match(/\d+(\.\d+)? kg/g) || []);
  for (const n of numbers) assert.ok(b.today.exercises.some((d) => `${d.weight} kg` === n), `${n} is an engine load`);
  const src = code('src/coach/briefing.ts') + code('src/coach/askContext.ts');
  assert.doesNotMatch(src, /recommendedWeight\s*=|applyWorkoutAdaptation|startDeload|deloads\s*=[^=]|replaceWorkoutExercise|state\.workouts\s*=[^=]/, 'no write path');
});

test('P15.4 no medical diagnosis or claim in any briefing text', () => {
  const MEDICAL = /diagnos|disease|syndrome|disorder|treat(ment)?\b|prescrib(e|ed) (medication|drug)|infection|clinical|medical advice|overtraining syndrome/i;
  const scenarios = [
    brief([planned(press)]), brief([...SUSTAINED, planned(press, SUS_TODAY)], undefined, SUS_TODAY),
    brief([...history(press, [40, 40, 42.5], addDays(MON, -9), 3, 9), planned(press)], { journal: [{ id: 'j', date: TODAY, scope: 'general', tags: ['safety'], text: 'x', createdAt: TODAY, updatedAt: TODAY }] }),
    brief([...history(press, [40, 42.5], addDays(MON, -60), 3), planned(press)]),
  ];
  for (const b of scenarios) {
    const text = [b.headline, ...b.observations, ...b.items.flatMap((i) => [i.text, i.reason]), ...b.limitations].join(' ');
    assert.doesNotMatch(text, MEDICAL);
  }
  assert.doesNotMatch(code('src/coach/briefing.ts'), MEDICAL);
});

test('P15.5 regression: the existing Coach decision is unchanged by the briefing, and the Coach screen keeps its existing pipeline', () => {
  const ws = [...history(press, [40, 40, 42.5], addDays(MON, -9), 3, 9), planned(press)];
  const s = stateOf(ws);
  const ctx = E.intelligence.buildCoachContext(s, { now: new Date(2026, 2, 5, 12).toISOString() });
  const before = JSON.stringify(E.coachMod.coach(ctx).decision);
  B.coachBriefing(s, TODAY);
  assert.equal(JSON.stringify(E.coachMod.coach(ctx).decision), before);
  const main = uiSource();
  assert.match(main, /aria-label="Coach briefing"/, 'the briefing is part of the Coach observation');
  assert.match(main, /const live=coach\(coachContext\(s\)\)/, 'the existing decision pipeline is still there');
  assert.match(main, /data-coach-next/);
});

test('P15.6 deterministic: same state and day give the same briefing, in any storage order', () => {
  const ws = [...history(press, [40, 40, 42.5], addDays(MON, -9), 3, 9), mk(curl, addDays(TODAY, -4), 10, 12), mk(curl, addDays(TODAY, -1), 10, 12), planned(press)]; // distinct days: sessions at the same instant are ordered by storage
  const run = (list) => JSON.stringify(B.coachBriefing(stateOf(list), TODAY));
  const ref = run(ws);
  for (let i = 0; i < 3; i++) assert.equal(run(ws), ref);
  assert.equal(run([...ws].reverse()), ref);
  assert.doesNotMatch(code('src/coach/briefing.ts'), /Math\.random|Date\.now|new Date\(\)|localStorage|fetch\(/);
});

test('P15.6 each step kind is reachable and carries a reason, severity and priority', () => {
  const seen = new Set();
  const cases = [
    brief([planned(press)]), brief([...recent(press, [40, 40], 12), planned(press)]), brief([...history(press, [40, 40, 42.5], addDays(MON, -9), 3, 9), planned(press)]),
    brief([...[0, 1, 2, 3, 4, 5].map((i) => mk(curl, addDays(MON, -15 + i * 3), 10, 9)), planned(curl, addDays(MON, 3))], { profile: profile({ equipment: ['barbell'] }) }, addDays(MON, 3)),
    brief([...history(press, [40, 42.5, 42.5], addDays(MON, -60), 3), planned(press)]), brief([...SUSTAINED, planned(press, SUS_TODAY)], undefined, SUS_TODAY),
  ];
  for (const b of cases) for (const i of b.items) { seen.add(i.kind); assert.ok(i.reason && ['info', 'attention', 'important'].includes(i.severity) && Number.isInteger(i.priority) && i.text); }
  for (const kind of ['follow_progression', 'maintain_load', 'review_stalled_exercise', 'conservative_reentry', 'recovery_deload', 'train_as_planned']) assert.ok(seen.has(kind), kind);
});
