'use strict';
/*
 * P3: one canonical date model. Timestamps are absolute instants; calendar days are local-zone YYYY-MM-DD strings.
 * Every boundary below is exercised in several zones, including IST (Asia/Kolkata, where the UTC date and the local
 * date differ for the first 5.5 hours of every day).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, T, EXERCISES, byId, set, threeSets, profile, addDays } = require('./phase1-helpers.cjs');

const ZONES = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Auckland'];
const press = byId('machine_chest_press');

function inZone(tz, fn) {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
}
const eachZone = (name, fn) => test(name, () => { for (const tz of ZONES) inZone(tz, () => fn(tz)); });
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min);
/** A completed workout finished at the given LOCAL time. */
const finishedAt = (date, h, min) => {
  const [y, m, d] = date.split('-').map(Number);
  const when = at(y, m, d, h, min).toISOString();
  return { id: 'w' + date + h + min, planId: 'p', name: 'S', scheduledDate: date, status: 'completed', source: 'scheduled', version: 1, completedAt: when, updatedAt: when, exercises: [{ exerciseId: press.id, order: 0, prescribedSets: 3, repRange: press.repRange, restSec: 90, sets: threeSets(press, 20, 10) }] };
};

eachZone('P3.4 a local time maps to the same calendar day at 23:30, 23:59, 00:00 and 00:30 in every zone', (tz) => {
  for (const [h, min] of [[23, 30], [23, 59], [0, 0], [0, 30], [12, 0]]) {
    const when = at(2026, 3, 15, h, min);
    assert.equal(E.dates.localDate(when), '2026-03-15', `${tz} ${h}:${min}`);
    assert.equal(E.dates.dayOfTimestamp(when.toISOString()), '2026-03-15', `${tz} ${h}:${min} via ISO`);
    assert.equal(E.dates.workoutDay({ completedAt: when.toISOString(), scheduledDate: '2026-03-01' }), '2026-03-15', 'completion day wins over the scheduled day');
  }
});

test('P3.2 the old bug: in IST the UTC date of 00:30 local is the PREVIOUS day; the canonical conversion is not', () => {
  inZone('Asia/Kolkata', () => {
    const iso = at(2026, 3, 15, 0, 30).toISOString();
    assert.equal(iso.slice(0, 10), '2026-03-14', 'the trap');
    assert.equal(E.dates.dayOfTimestamp(iso), '2026-03-15');
  });
});

eachZone('P3.1 todayLocal() follows the local clock at the day boundaries (not the UTC date)', (tz) => {
  const { mock } = require('node:test');
  for (const [d, h, min, want] of [[14, 23, 30, '2026-03-14'], [14, 23, 59, '2026-03-14'], [15, 0, 0, '2026-03-15'], [15, 0, 30, '2026-03-15']]) {
    mock.timers.enable({ apis: ['Date'], now: at(2026, 3, d, h, min) });
    try { assert.equal(E.dates.todayLocal(), want, `${tz} ${d} ${h}:${min}`); } finally { mock.timers.reset(); }
  }
});

eachZone('P3.1 calendar arithmetic is independent of zone and daylight saving', () => {
  const add = E.dates.addDaysLocal;
  assert.equal(add('2026-03-08', 1), '2026-03-09', 'US DST start');
  assert.equal(add('2026-03-29', 1), '2026-03-30', 'EU DST start');
  assert.equal(add('2026-11-01', 1), '2026-11-02', 'US DST end');
  assert.equal(add('2026-10-25', 1), '2026-10-26', 'EU DST end');
  assert.equal(add('2028-02-28', 1), '2028-02-29', 'leap day');
  assert.equal(add('2027-02-28', 1), '2027-03-01');
  assert.equal(add('2026-12-31', 1), '2027-01-01');
  assert.equal(add('2026-03-01', -1), '2026-02-28');
  assert.equal(add('2026-03-15', -30), '2026-02-13');
  assert.equal(E.dates.dayNumber('2026-03-16') - E.dates.dayNumber('2026-03-15'), 1);
  assert.equal(add('nonsense', 3), 'nonsense');
  assert.equal(E.dates.dayOfTimestamp('not a date'), undefined);
  assert.equal(E.dates.dayOfTimestamp('2026-13-45'), undefined);
  assert.equal(E.dates.dayOfTimestamp(undefined), undefined);
});

eachZone('P3.3 return-to-training counts whole LOCAL days: 13 -> normal, 14 -> return, across midnight', (tz) => {
  const last = '2026-03-02';
  for (const [h, min] of [[23, 59], [0, 0], [0, 30], [23, 30]]) {
    const hist = [finishedAt(last, h, min)];
    const gap = (asOf) => T.trainingGapDays(press, hist, asOf);
    assert.equal(gap(addDays(last, 13)), 13, `${tz} ${h}:${min}`);
    assert.equal(gap(addDays(last, 14)), 14, `${tz} ${h}:${min}`);
    const rec = (asOf) => T.personalizedLoad(press, hist, profile(), EXERCISES, asOf);
    assert.equal(rec(addDays(last, 13)).returnToTraining, undefined);
    assert.equal(rec(addDays(last, 14)).returnToTraining.gapDays, 14);
  }
});

eachZone('P3.3 a workout finished at 00:30 local belongs to THAT local day (completedAt vs scheduledDate)', () => {
  const late = finishedAt('2026-03-02', 0, 30);
  late.scheduledDate = '2026-03-01'; // planned for the evening before, finished just after midnight
  assert.equal(E.dates.workoutDay(late), '2026-03-02');
  assert.equal(T.trainingGapDays(press, [late], '2026-03-12'), 10);
});

eachZone('P3.3 consistency windows and streaks use local completion days', () => {
  const s = (workouts) => ({ workouts, exercises: EXERCISES });
  const w = finishedAt('2026-03-02', 23, 30);
  const c = (now) => E.analytics.consistencySummary(s([w]), 30, now).completed;
  assert.equal(c(at(2026, 4, 1, 0, 30)), 1, 'day 30 after: still inside the 30-day window');
  assert.equal(c(at(2026, 4, 1, 23, 59)), 1);
  assert.equal(c(at(2026, 4, 2, 0, 30)), 0, 'day 31 after: outside');
  const days = ['2026-03-02', '2026-03-03', '2026-03-04'].map((d) => ({ ...finishedAt(d, 23, 50), scheduledDate: '2026-03-02' }));
  assert.equal(E.analytics.consistencySummary(s(days), 30, at(2026, 3, 5, 9)).streak, 3, 'the streak follows completion days, not the shared scheduled date');
});

eachZone('P3.3 notifications: the missed-session follow-up and weekly review use the local day', () => {
  const state = (updatedAt) => ({ preferences: { notifications: { enabled: true, workoutReminders: false, missedWorkout: true, weeklyReview: true } }, workouts: [{ id: 'm', name: 'Upper', status: 'missed', scheduledDate: '2026-03-14', updatedAt, exercises: [] }] });
  const now = at(2026, 3, 15, 0, 30); // a Sunday, just after local midnight
  assert.equal(now.getDay(), 0);
  const sameDay = E.notifications.notificationIntents(state(at(2026, 3, 15, 0, 10).toISOString()), now);
  assert.ok(sameDay.some((i) => i.kind === 'missed'), 'finished the same local day');
  const yesterday = E.notifications.notificationIntents(state(at(2026, 3, 14, 23, 30).toISOString()), now);
  assert.ok(!yesterday.some((i) => i.kind === 'missed'), 'updated on the previous local day');
  assert.ok(sameDay.some((i) => i.id === 'weekly-2026-03-15'), 'the weekly review id is the local date');
});

test('P3.2 no UTC-date shortcut remains in the app: calendar days come from src/data/dates.ts', () => {
  const root = path.resolve(__dirname, '..', 'src');
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name) || entry.name === 'dates.ts') continue;
      const text = fs.readFileSync(file, 'utf8');
      if (/toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/.test(text)) offenders.push(path.relative(root, file));
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});

test('P3.10 a calendar day must be a real day: impossible dates are invalid, not rolled over', () => {
  const D = E.dates;
  for (const bad of ['2026-02-30', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-06-00', '2025-02-29', '2026-6-1', 'today', '', undefined]) assert.equal(D.dayNumber(bad), undefined, String(bad));
  for (const good of ['2026-02-28', '2024-02-29', '2000-02-29', '2026-12-31', '2026-01-01']) assert.notEqual(D.dayNumber(good), undefined, good);
  assert.equal(D.dayNumber('2026-03-01') - D.dayNumber('2026-02-28'), 1);
  assert.equal(D.dayNumber('2024-03-01') - D.dayNumber('2024-02-28'), 2, '2024 is a leap year');
  assert.equal(D.addDaysLocal('2026-02-30', 1), '2026-02-30', 'an invalid day is returned unchanged, never silently moved');
});
