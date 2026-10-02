'use strict';
/*
 * Phase 14: weekly training analytics (src/engine/weeklyAnalytics.ts). Read-only, deterministic, no volume judgement,
 * built on the Phase 11 progression and Phase 12 fatigue engines.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, T, EXERCISES, byId, session, set, profile, addDays, uid } = require('./phase1-helpers.cjs');

const A = E.weeklyAnalytics;
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const MON = '2026-03-02'; // a Monday
const TODAY = '2026-03-05'; // Thursday of that week
const press = byId('machine_chest_press');
const curl = byId('dumbbell_bicep_curl');
const row = byId('seated_cable_row');

const sets3 = (ex, load, reps) => [0, 1, 2].map(() => set(ex, load, reps, 2));
const mk = (ex, date, load, reps, extra = {}) => session(ex, date, sets3(ex, load, reps), extra);
const stateOf = (workouts, extra = {}) => ({ schemaVersion: 4, onboardingComplete: true, profile: profile(), goals: [], workouts, exercises: EXERCISES, achievements: [], measurements: [], journal: [], observations: [], preferences: {}, eventLog: [], ...extra });
const weekly = (workouts, today = TODAY, extra) => A.weeklyAnalytics(stateOf(workouts, extra), today);

test('P14.1 weeks start on Monday in the local calendar; the current week is compared over the same days', () => {
  assert.equal(A.weekStartOf('2026-03-02'), '2026-03-02');
  assert.equal(A.weekStartOf('2026-03-08'), '2026-03-02', 'Sunday belongs to the week that started on Monday');
  assert.equal(A.weekStartOf('2026-03-09'), '2026-03-09');
  assert.equal(A.weekStartOf('2026-01-01'), '2025-12-29', 'across a year boundary');
  assert.equal(A.weekStartOf('not-a-day'), undefined);
  assert.deepEqual({ ...A.weekWindow('2026-03-05') }, { start: '2026-03-02', end: '2026-03-08', elapsedDays: 4 });
  assert.equal(A.weekWindow('2026-03-08').elapsedDays, 7);
  assert.equal(A.weeklyAnalytics(stateOf([]), 'bad'), undefined);
  const w = weekly([]);
  assert.deepEqual({ ...w.priorWeek }, { start: '2026-02-23', end: '2026-02-26' }, 'the same four days a week earlier');
});

test('P14.1 sessions land in the week of their LOCAL day, in any time zone', () => {
  for (const tz of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Auckland']) {
    const before = process.env.TZ;
    process.env.TZ = tz;
    try {
      const at = (y, m, d, h, min) => new Date(y, m - 1, d, h, min).toISOString();
      const sunday = session(press, '2026-03-01', sets3(press, 40, 10), { completedAt: at(2026, 3, 1, 23, 30) });
      const monday = session(press, '2026-03-02', sets3(press, 40, 10), { completedAt: at(2026, 3, 2, 0, 30) });
      const w = A.weeklyAnalytics(stateOf([sunday, monday]), '2026-03-04');
      assert.equal(w.consistency.sessionsCompleted, 1, `${tz}: only Monday 00:30 local is in the week that starts 03-02`);
      assert.equal(w.volume.workingSets, 3);
      const prior = A.weeklyAnalytics(stateOf([sunday, monday]), '2026-03-08');
      assert.equal(prior.comparison.sessions.prior, 1, `${tz}: Sunday night belongs to the week before`);
    } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
  }
});

test('P14.2 volume: working sets and tonnage of completed sessions in the week, no double counting', () => {
  const w = weekly([mk(press, MON, 40, 10), mk(press, addDays(MON, 2), 45, 10), mk(press, addDays(MON, -3), 40, 10), mk(press, addDays(MON, 6), 40, 10)]);
  assert.equal(w.volume.workingSets, 6, 'the Saturday-before and the future Sunday session are outside the week up to today');
  assert.equal(w.volume.tonnage, Math.round(T.volumeForWorkout(mk(press, MON, 40, 10), EXERCISES) + T.volumeForWorkout(mk(press, MON, 45, 10), EXERCISES)));
  assert.equal(w.volume.exercises, 1);
  const again = weekly([mk(press, MON, 40, 10), mk(press, addDays(MON, 2), 45, 10)]);
  assert.deepEqual(again.volume, weekly([mk(press, MON, 40, 10), mk(press, addDays(MON, 2), 45, 10), mk(press, addDays(MON, 6), 40, 10)]).volume, 'a session after today changes nothing');
  const planned = session(press, TODAY, sets3(press, 40, 10), { status: 'planned' });
  assert.equal(weekly([planned]).volume.workingSets, 0, 'a planned session has no volume');
});

test('P14.2 muscle attribution: primary muscles are direct, secondary indirect, a muscle in both counts once as direct', () => {
  const w = weekly([mk(press, MON, 40, 10)]);
  const by = Object.fromEntries(w.volume.byMuscle.map((m) => [m.muscle, m]));
  for (const m of press.primaryMuscles) assert.deepEqual([by[m].directSets, by[m].indirectSets], [3, press.secondaryMuscles.includes(m) ? 0 : 0]);
  for (const m of press.secondaryMuscles.filter((x) => !press.primaryMuscles.includes(x))) assert.deepEqual([by[m].directSets, by[m].indirectSets], [0, 3], `${m} is indirect only`);
  const both = { ...structuredClone(press), id: 'both_ex', secondaryMuscles: [...press.primaryMuscles, 'forearms'] };
  const s = stateOf([session(both, MON, sets3(both, 40, 10))], { exercises: [...EXERCISES, both] });
  const m = A.weeklyAnalytics(s, TODAY).volume.byMuscle;
  assert.equal(m.find((x) => x.muscle === press.primaryMuscles[0]).indirectSets, 0, 'not counted twice');
  assert.equal(m.find((x) => x.muscle === 'forearms').indirectSets, 3);
  const direct = w.volume.byMuscle.reduce((a, x) => a + x.sharePct, 0);
  assert.ok(direct >= 99 && direct <= 101, `shares add up to about 100 (${direct})`);
  assert.deepEqual(w.coverage, w.volume.byMuscle, 'coverage is the same distribution');
  assert.ok(w.volume.byMuscle.every((x, i, all) => !i || all[i - 1].directSets >= x.directSets), 'most direct sets first');
});

test('P14.2 warm-ups and invalid or incomplete sets are excluded completely', () => {
  const dirty = session(press, MON, [
    ...sets3(press, 40, 10),
    { ...set(press, 20, 10), type: 'warmup' }, { ...set(press, 30, 8), type: 'warmup' },
    { ...set(press, 40, 10), completed: false },
    set(press, 40, 0), // zero reps is not a performed set
    { ...set(press, 40, undefined) },
  ]);
  const clean = mk(press, MON, 40, 10);
  const a = weekly([dirty]), b = weekly([clean]);
  assert.equal(a.volume.workingSets, 3);
  assert.deepEqual(a.volume, b.volume);
  assert.deepEqual(a.volume.byMuscle, b.volume.byMuscle);
  const onlyWarm = weekly([session(press, MON, [{ ...set(press, 20, 10), type: 'warmup' }])]);
  assert.equal(onlyWarm.volume.workingSets, 0);
  assert.equal(onlyWarm.volume.byMuscle.length, 0);
});

test('P14.3 consistency: planned, completed, missed, skipped, moved and custom sessions follow the existing semantics', () => {
  const ws = [
    mk(press, MON, 40, 10),                                                          // scheduled, completed
    mk(press, addDays(MON, 1), 40, 10, { status: 'missed', exercises: [] }),         // scheduled, missed
    mk(press, addDays(MON, 2), 40, 10, { status: 'skipped' }),                       // scheduled, skipped
    mk(press, addDays(MON, 2), 40, 10, { status: 'rescheduled' }),                   // the original of a moved session: not planned
    mk(press, TODAY, 40, 10, { status: 'planned', exercises: [] }),                  // due today: planned
    mk(press, addDays(MON, 5), 40, 10, { status: 'planned' }),                       // future: not due yet
    mk(press, addDays(MON, 3), 40, 10, { source: 'custom' }),                        // custom, completed: a session, not a plan item
  ];
  const c = weekly(ws).consistency;
  assert.equal(c.plannedSessions, 4, 'completed, missed, skipped and today\'s; not the moved original and not the future one');
  assert.equal(c.scheduledCompleted, 1);
  assert.equal(c.sessionsCompleted, 2, 'a custom session counts as a completed session');
  assert.equal(c.missed, 1); assert.equal(c.skipped, 1);
  assert.equal(c.adherencePct, 25, 'adherence counts scheduled sessions only');
  assert.equal(c.trainingDays, 2);
  assert.equal(weekly([mk(press, addDays(MON, 3), 40, 10, { source: 'custom' })]).consistency.adherencePct, null, 'nothing planned: no percentage');
  assert.equal(weekly([]).consistency.adherencePct, null);
});

test('P14.3 streak: consecutive weeks with a completed session; an empty current week does not break it yet', () => {
  const w = (n) => mk(press, addDays(MON, -7 * n), 40, 10);
  assert.equal(weekly([w(0), w(1), w(2)]).consistency.streakWeeks, 3);
  assert.equal(weekly([w(1), w(2)]).consistency.streakWeeks, 2, 'this week has no session yet');
  assert.equal(weekly([w(0), w(2)]).consistency.streakWeeks, 1, 'a gap week ends it');
  assert.equal(weekly([w(3)]).consistency.streakWeeks, 0);
});

test('P14.5 week comparison: the same days a week earlier, and an explicit "not enough data" instead of a misleading percentage', () => {
  const cur = [mk(press, MON, 40, 10), mk(press, addDays(MON, 2), 40, 10)];
  const lastWeek = [mk(press, addDays(MON, -7), 40, 10), mk(press, addDays(MON, -6), 40, 10), mk(press, addDays(MON, -3), 40, 10)];
  const w = weekly([...cur, ...lastWeek]);
  assert.equal(w.comparison.sessions.state, 'ok');
  assert.deepEqual([w.comparison.sessions.current, w.comparison.sessions.prior, w.comparison.sessions.delta], [2, 2, 0], 'Mon-Thu of last week: the Friday session is outside the same-days span');
  assert.equal(w.comparison.workingSets.deltaPct, 0);
  const lone = weekly(cur);
  for (const key of ['sessions', 'workingSets', 'tonnage', 'progressed', 'fatigueScore']) {
    assert.equal(lone.comparison[key].state, 'not_enough_data', key);
    assert.equal(lone.comparison[key].delta, null);
    assert.equal(lone.comparison[key].deltaPct, null);
  }
  assert.equal(lone.comparison.adherencePct.state, 'not_enough_data');
  const none = weekly([mk(press, addDays(MON, -7), 40, 10)], TODAY);
  assert.equal(none.comparison.sessions.state, 'ok');
  assert.equal(none.comparison.sessions.current, 0);
  assert.equal(none.comparison.sessions.deltaPct, -100);
  const fromZero = weekly([...cur, mk(press, addDays(MON, -7), 40, 10, { status: 'skipped' })]);
  assert.equal(fromZero.comparison.sessions.state, 'not_enough_data', 'a skipped session is no earlier data');
});

test('P14.3 progression uses the Phase 11 engine: exercise change comes from exposure kinds, stalls from the longitudinal decision', () => {
  const history = [mk(curl, addDays(MON, -14), 10, 9), mk(curl, addDays(MON, -11), 10, 9), mk(curl, MON, 12, 9), mk(press, addDays(MON, -5), 40, 10), mk(press, addDays(MON, 1), 40, 10)];
  const w = weekly(history, TODAY, { profile: profile({ equipment: ['dumbbell', 'machine'] }) });
  const byEx = Object.fromEntries(w.progression.exercises.map((x) => [x.exerciseId, x]));
  assert.equal(byEx[curl.id].change, 'progressed');
  assert.equal(byEx[curl.id].loadChange, 2);
  assert.equal(byEx[press.id].change, 'flat');
  assert.equal(byEx[press.id].performanceChange, 0);
  assert.deepEqual([w.progression.progressed, w.progression.flat, w.progression.regressed], [1, 1, 0]);
  const rec = T.personalizedLoad(press, history, profile({ equipment: ['dumbbell', 'machine'] }), EXERCISES, TODAY);
  assert.equal(byEx[press.id].decision.outcome, rec.longitudinal.outcome, 'the same decision, not a competing model');
  assert.equal(byEx[press.id].decision.reason, rec.longitudinal.reason);
  // a long stall is reported as stalled
  const stalled = [0, 1, 2, 3, 4, 5].map((i) => mk(curl, addDays(MON, -15 + i * 3), 10, 9));
  const s = weekly(stalled, addDays(MON, 3), { profile: profile({ equipment: ['barbell'] }) });
  assert.equal(s.progression.stalled, 1);
  assert.match(s.progression.exercises[0].decision.outcome, /PLATEAU|CONSIDER_VARIATION/);
  assert.equal(code('src/engine/weeklyAnalytics.ts').match(/consecutiveStalls\s*>=/g), null, 'no stall threshold of its own');
});

test('P14.4 recovery and fatigue are the Phase 12 assessment, never a second model', () => {
  const heavy = (w) => [0, 1, 2, 3].map((d) => mk(press, addDays('2026-01-05', w * 7 + d), 80, 10, { }));
  const hard = (x) => ({ ...x, exercises: x.exercises.map((e) => ({ ...e, sets: e.sets.map((q) => ({ ...q, rir: 0 })) })) });
  const normal = [0, 1, 2].flatMap((w) => [0, 2, 4].map((d) => mk(press, addDays('2026-01-05', w * 7 + d), 40, 10)));
  const history = [...normal, ...heavy(3).map(hard), ...heavy(4).map(hard)];
  const today = addDays('2026-01-05', 34);
  const w = A.weeklyAnalytics(stateOf(history), today);
  const direct = T.recoveryAssessment(history, EXERCISES, today, undefined, 'general');
  assert.deepEqual({ level: w.recovery.level, score: w.recovery.score, trend: w.recovery.trend, status: w.recovery.status }, { level: direct.level, score: direct.score, trend: direct.trend, status: direct.status });
  assert.equal(w.recovery.status, 'deload_recommended');
  const withDeload = A.weeklyAnalytics(stateOf(history, { deloads: [today] }), addDays(today, 1));
  assert.equal(withDeload.recovery.status, 'deload_active');
  assert.equal(w.comparison.fatigueScore.state, 'ok');
  assert.doesNotMatch(code('src/engine/weeklyAnalytics.ts'), /FATIGUE_RULES|assessFatigue|fatigueSignals|workloadFatigue/, 'no fatigue model here');
});

test('P14.6 no judgement: the analytics only count and compare', () => {
  const src = code('src/engine/weeklyAnalytics.ts');
  assert.doesNotMatch(src, /\b(optimal|ideal|too (much|little|low|high)|insufficient volume|under-?trained|over-?trained|should)\b/i);
  const w = weekly([mk(press, MON, 40, 10)]);
  assert.deepEqual(Object.keys(w.volume).sort(), ['byMuscle', 'exercises', 'tonnage', 'workingSets']);
  for (const m of w.volume.byMuscle) assert.deepEqual(Object.keys(m).sort(), ['directSets', 'indirectSets', 'muscle', 'sharePct']);
});

test('P14.7 empty and sparse data are explicit, not misleading', () => {
  const w = weekly([]);
  assert.equal(w.empty, true);
  assert.deepEqual([w.volume.workingSets, w.volume.byMuscle.length, w.consistency.sessionsCompleted, w.progression.exercises.length], [0, 0, 0, 0]);
  assert.equal(w.comparison.sessions.state, 'not_enough_data');
});

test('P14.7 deterministic and read-only: the same state gives the same analytics, in any storage order, and nothing is mutated', () => {
  const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
  const history = [mk(curl, addDays(MON, -7), 10, 9), mk(curl, MON, 12, 9), mk(press, addDays(MON, 1), 40, 10), mk(press, addDays(MON, -6), 40, 10)];
  const json = JSON.stringify(history);
  const s = stateOf(history);
  const a = JSON.stringify(A.weeklyAnalytics(deepFreeze(s), TODAY));
  assert.equal(JSON.stringify(history), json);
  assert.equal(JSON.stringify(A.weeklyAnalytics(stateOf([...history].reverse()), TODAY)), a, 'storage order does not matter');
  for (let i = 0; i < 3; i++) assert.equal(JSON.stringify(A.weeklyAnalytics(stateOf(history), TODAY)), a);
  assert.doesNotMatch(code('src/engine/weeklyAnalytics.ts'), /Math\.random|Date\.now|new Date\(|localStorage|fetch\(/);
  assert.doesNotMatch(code('src/engine/weeklyAnalytics.ts'), /state\.workouts\s*=[^=]|\.workouts\.(push|splice|sort|reverse)\(/, 'never writes workouts');
});

test('P14.8 warm-ups never reach the weekly progression either (identical with and without heavy warm-ups)', () => {
  const clean = [mk(press, addDays(MON, -7), 40, 10), mk(press, MON, 42.5, 10)];
  const warm = clean.map((w) => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, sets: [{ ...set(press, 300, 20, 0), type: 'warmup' }, ...e.sets] })) }));
  assert.deepEqual(weekly(warm), weekly(clean));
  assert.ok(uid('x'));
});
