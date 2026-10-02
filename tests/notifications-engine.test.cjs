'use strict';
/*
 * Phase 20: the notification plan (src/engine/notifications.ts) and the native scheduler contract (src/native/localNotifications.ts).
 * The engine is the real compiled module; the native file is checked as source because the Capacitor plugin only exists on a device.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, byId, session, set, profile, addDays, EXERCISES } = require('./phase1-helpers.cjs');

const N = E.notifications;
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const prefs = (over = {}) => ({ notifications: { enabled: true, workoutReminders: true, missedWorkout: true, weeklyReview: true, ...over } });
const planned = (id, date, name = 'Upper A') => ({ id, name, status: 'planned', scheduledDate: date, exercises: [] });
const stateOf = (workouts, over = {}, extra = {}) => ({ preferences: prefs(over), workouts, ...extra });
const kinds = (list) => list.map((i) => i.kind).sort();

test('P20.1 disabled notifications produce nothing, each preference removes only its own kind', () => {
  const w = [planned('a', '2026-03-12'), { id: 'm', name: 'Lower', status: 'missed', scheduledDate: '2026-03-10', updatedAt: at(2026, 3, 10, 9).toISOString(), exercises: [] }];
  const now = at(2026, 3, 10, 10);
  assert.deepEqual(N.notificationIntents(stateOf(w, { enabled: false }), now), []);
  assert.deepEqual(kinds(N.notificationIntents(stateOf(w), now)), ['missed', 'weekly', 'workout']);
  assert.deepEqual(kinds(N.notificationIntents(stateOf(w, { workoutReminders: false }), now)), ['missed', 'weekly']);
  assert.deepEqual(kinds(N.notificationIntents(stateOf(w, { missedWorkout: false }), now)), ['weekly', 'workout']);
  assert.deepEqual(kinds(N.notificationIntents(stateOf(w, { weeklyReview: false }), now)), ['missed', 'workout']);
});

test('P20.2 the training reminder is the next planned session at 07:00 local on its day, never a completed or skipped one', () => {
  const w = [planned('old', '2026-03-01'), { ...planned('done', '2026-03-11'), status: 'completed' }, planned('next', '2026-03-13'), planned('later', '2026-03-15')];
  const [i] = N.notificationIntents(stateOf(w, { weeklyReview: false, missedWorkout: false }), at(2026, 3, 10, 10));
  assert.equal(i.id, 'workout-next');
  assert.equal(i.scheduledFor, at(2026, 3, 13, 7).toISOString());
  assert.equal(i.actionRoute, 'train');
});

test('P20.3 the missed-session follow-up is the same evening, a short window after that, and nothing late at night or the next day', () => {
  const missed = (when) => stateOf([{ id: 'm', name: 'Lower', status: 'missed', scheduledDate: '2026-03-10', updatedAt: when.toISOString(), exercises: [] }], { workoutReminders: false, weeklyReview: false });
  const upd = at(2026, 3, 10, 9);
  const one = (now) => N.notificationIntents(missed(upd), now);
  assert.equal(one(at(2026, 3, 10, 10))[0].scheduledFor, at(2026, 3, 10, 19).toISOString());
  assert.equal(one(at(2026, 3, 10, 19, 30))[0].scheduledFor, at(2026, 3, 10, 19, 40).toISOString());
  assert.deepEqual(one(at(2026, 3, 10, 21, 5)), []);
  assert.deepEqual(one(at(2026, 3, 11, 8)), [], 'not repeated on a later day');
});

test('P20.4 the weekly review is planned for the coming Sunday evening in advance, with no stale numbers in its text', () => {
  const weekly = (now) => N.notificationIntents(stateOf([], { workoutReminders: false, missedWorkout: false }), now)[0];
  assert.equal(weekly(at(2026, 3, 11, 9)).id, 'weekly-2026-03-15', 'Wednesday plans the coming Sunday');
  assert.equal(weekly(at(2026, 3, 15, 10)).id, 'weekly-2026-03-15', 'Sunday morning: today');
  assert.equal(weekly(at(2026, 3, 15, 20)).id, 'weekly-2026-03-22', 'Sunday after 19:00: the next one');
  assert.equal(weekly(at(2026, 3, 11, 9)).scheduledFor, at(2026, 3, 15, 19).toISOString());
  assert.doesNotMatch(weekly(at(2026, 3, 11, 9)).body, /\d+ session/);
  assert.equal(weekly(at(2026, 3, 11, 9)).actionRoute, 'progress');
});

test('P20.5 a deload recommendation becomes one Coach reminder; it is the engine\'s decision, never started or stored by the reminder', () => {
  const press = byId('machine_chest_press');
  const mk = (date, load, reps, rir) => session(press, date, [0, 1, 2].map(() => set(press, load, reps, rir)));
  const base = '2026-01-05';
  const normal = [0, 1, 2].flatMap((w) => [0, 2, 4].map((d) => mk(addDays(base, w * 7 + d), 40, 10, 2)));
  const heavy = [3, 4].flatMap((w) => [0, 1, 2, 3].map((d) => mk(addDays(base, w * 7 + d), 80, 10, 0)));
  const today = addDays(base, 34);
  const state = { schemaVersion: 4, onboardingComplete: true, profile: profile({ equipment: ['machine'] }), goals: [], workouts: [...normal, ...heavy], exercises: EXERCISES, preferences: prefs({ weeklyReview: false }), eventLog: [] };
  const [y, m, d] = today.split('-').map(Number);
  const rec = N.notificationIntents(state, at(y, m, d, 10)).filter((i) => i.kind === 'recovery');
  assert.equal(rec.length, 1);
  assert.equal(rec[0].actionRoute, 'coach');
  assert.match(rec[0].body, /decision is yours/);
  assert.equal(state.deloads, undefined, 'planning never writes a deload');
  assert.deepEqual(N.notificationIntents({ ...state, preferences: prefs({ weeklyReview: false, workoutReminders: false }) }, at(y, m, d, 10)).filter((i) => i.kind === 'recovery'), []);
  const calm = { ...state, workouts: normal };
  assert.deepEqual(N.notificationIntents(calm, at(y, m, d, 10)).filter((i) => i.kind === 'recovery'), []);
});

test('P20.6 planning is deterministic: the same state and moment give the same list, and no engine mutates the state', () => {
  const w = [planned('a', '2026-03-12'), planned('b', '2026-03-14')];
  const s = stateOf(w);
  const before = JSON.stringify(s);
  const now = at(2026, 3, 10, 10);
  assert.deepEqual(N.notificationIntents(s, now), N.notificationIntents(s, now));
  assert.equal(JSON.stringify(s), before);
});

test('P20.7 reconciling: a plan applied twice schedules the same thing, a fired notification is not repeated, a pending one keeps its time', () => {
  const s = stateOf([{ id: 'm', name: 'Lower', status: 'missed', scheduledDate: '2026-03-10', updatedAt: at(2026, 3, 10, 9).toISOString(), exercises: [] }], { workoutReminders: false, weeklyReview: false });
  const t1 = at(2026, 3, 10, 19, 30);
  const p1 = N.reconcileIntents(N.notificationIntents(s, t1), {}, t1);
  assert.equal(p1.schedule.length, 1);
  const firstTime = p1.schedule[0].scheduledFor;
  const t2 = at(2026, 3, 10, 19, 35); // edits keep re-planning: the clock-derived time must not keep sliding
  const p2 = N.reconcileIntents(N.notificationIntents(s, t2), p1.ledger, t2);
  assert.equal(p2.schedule[0].scheduledFor, firstTime);
  assert.deepEqual(N.reconcileIntents(N.notificationIntents(s, t2), p2.ledger, t2).schedule, p2.schedule, 'idempotent');
  const t3 = at(2026, 3, 10, 20, 5); // it has fired by now; re-opening the app must not send it again
  assert.deepEqual(N.reconcileIntents(N.notificationIntents(s, t3), p2.ledger, t3).schedule, []);
});

test('P20.8 a moved session is planned at its new time, a past time is never scheduled, old ledger entries are forgotten', () => {
  const now = at(2026, 3, 10, 10);
  const a = N.notificationIntents(stateOf([planned('a', '2026-03-12')], { weeklyReview: false }), now);
  const p = N.reconcileIntents(a, {}, now);
  const moved = N.notificationIntents(stateOf([planned('a', '2026-03-14')], { weeklyReview: false }), now);
  assert.equal(N.reconcileIntents(moved, p.ledger, now).schedule[0].scheduledFor, at(2026, 3, 14, 7).toISOString());
  const todayLate = N.notificationIntents(stateOf([planned('a', '2026-03-10')], { weeklyReview: false }), at(2026, 3, 10, 10));
  assert.deepEqual(N.reconcileIntents(todayLate, {}, at(2026, 3, 10, 10)).schedule, [], '07:00 has passed');
  const old = { stale: at(2026, 1, 1).toISOString(), recent: at(2026, 3, 9).toISOString() };
  assert.deepEqual(Object.keys(N.reconcileIntents([], old, now).ledger), ['recent']);
});

test('P20.9 notification ids are stable, unique, inside the APEX range and independent of order', () => {
  const ids = ['workout-a', 'workout-b', 'weekly-2026-03-15', 'recovery-2026-03-10', 'missed-m'];
  const a = N.notificationIds(ids);
  const b = N.notificationIds([...ids].reverse());
  for (const id of ids) {
    assert.equal(a.get(id), N.notificationIds([id]).get(id), 'stable on its own');
    assert.ok(a.get(id) >= N.APEX_NOTIFICATION_MIN && a.get(id) <= N.APEX_NOTIFICATION_MAX);
  }
  assert.equal(new Set(a.values()).size, ids.length);
  assert.equal(new Set(b.values()).size, ids.length);
});

test('P20.10 only known surfaces can be opened from a notification', () => {
  for (const r of ['home', 'train', 'progress', 'coach']) assert.equal(N.isNotificationRoute(r), true);
  for (const r of ['', 'settings', '../x', undefined, 4, null]) assert.equal(N.isNotificationRoute(r), false);
  for (const i of N.notificationIntents(stateOf([planned('a', '2026-03-12')]), at(2026, 3, 10, 10))) assert.equal(N.isNotificationRoute(i.actionRoute), true);
});

test('P20.11 native scheduler: cancel first, nothing when off or not permitted, no repeated prompts, serialised, offline', () => {
  const src = read('src/native/localNotifications.ts');
  assert.ok(src.indexOf('LocalNotifications.cancel') < src.indexOf('state.preferences.notifications.enabled'), 'stale ones are cancelled before anything else');
  assert.match(src, /if \(!state\.preferences\.notifications\.enabled\) return;/);
  assert.match(src, /if \(permission !== 'granted'\) return;/);
  assert.match(src, /ASKED_KEY/, 'the automatic permission prompt happens once');
  assert.match(src, /chain = chain\.then\(\(\) => applySync/, 'syncs never interleave');
  assert.match(src, /\.catch\(\(\) => \{ \/\* notification delivery is optional \*\/ \}\)/);
  assert.match(src, /createChannel/);
  assert.match(src, /isNotificationRoute\(route\)/);
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|axios/, 'no network');
  assert.doesNotMatch(src, /\bsetInterval\b|\bsetTimeout\b/, 'delivery is the system alarm, not an app timer');
});

test('P20.12 the app re-plans on resume, on a new local day and on schedule changes, not on every route change', () => {
  const app = read('src/App.tsx');
  assert.match(app, /appStateChange/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /\[s\.preferences\.notifications,s\.workouts,s\.deloads,hydrated,clockTick\]/);
  assert.doesNotMatch(app, /syncLocalNotifications\(\{\.\.\.s,activeRoute:route\}\)/);
});

test('P20.13 Android: the merged manifest declares notification permission and boot restore through the plugin', () => {
  const plugin = read('node_modules/@capacitor/local-notifications/android/src/main/AndroidManifest.xml');
  for (const p of ['POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED']) assert.match(plugin, new RegExp(p));
  assert.match(plugin, /LocalNotificationRestoreReceiver/);
});

test('P20.14 once today\'s 07:00 has passed the reminder moves to the next session that is still ahead (it is not lost)', () => {
  const w = [planned('today', '2026-03-10'), planned('tomorrow', '2026-03-11')];
  const prefsOnly = { weeklyReview: false, missedWorkout: false };
  assert.equal(N.notificationIntents(stateOf(w, prefsOnly), at(2026, 3, 10, 6, 0))[0].id, 'workout-today');
  const late = N.notificationIntents(stateOf(w, prefsOnly), at(2026, 3, 10, 10, 0));
  assert.equal(late[0].id, 'workout-tomorrow');
  assert.equal(late[0].scheduledFor, at(2026, 3, 11, 7).toISOString());
  assert.deepEqual(N.notificationIntents(stateOf([planned('today', '2026-03-10')], prefsOnly), at(2026, 3, 10, 10, 0)), []);
});
