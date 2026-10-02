'use strict';
/*
 * Phase 7: platform hardening and correctness.
 * Rest preference, local-day Coach dates, persistence arbitration, SQLite migrations, dead code and docs.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine, root } = require('./longitudinal/load-engine.cjs');

const E = loadEngine();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walkSrc = (fn) => {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(ts|tsx)$/.test(entry.name)) fn(file, fs.readFileSync(file, 'utf8'));
    }
  };
  walk(path.join(root, 'src'));
};

/* ------------------------------------------------------------------------------------------------------------- */
/* P7.2 local-day "today" in the Coach                                                                            */
/* ------------------------------------------------------------------------------------------------------------- */
const ZONES = ['UTC', 'Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Auckland'];
function inZone(tz, fn) {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
}
const ex = E.exercisesMod.EXERCISES.find((e) => e.id === 'machine_chest_press');
function coachState(journalDate) {
  return {
    schemaVersion: 4,
    profile: { id: 'p', name: 'T', experience: 'beginner', equipment: ['machine'], primaryGoal: 'strength', goals: ['strength'], trainingDays: 3, sessionMinutes: 45, body: {}, createdAt: '2026-01-01T00:00:00Z' },
    goals: [], plan: undefined, workouts: [], exercises: E.exercisesMod.EXERCISES, achievements: [], measurements: [], observations: [],
    journal: [{ id: 'j1', date: journalDate, scope: 'general', tags: ['safety'], text: 'something felt off', createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' }],
    preferences: {}, activeRoute: 'coach', onboardingComplete: true, coachMemory: [], eventLog: [],
  };
}
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min);

test('P7.2 buildCoachContext uses the LOCAL calendar day: a safety note dated today counts just after local midnight (IST, Auckland)', () => {
  for (const tz of ZONES) inZone(tz, () => {
    const now = at(2026, 3, 15, 0, 30); // local 00:30; in IST and Auckland the UTC date is still 2026-03-14
    const ctx = E.intelligence.buildCoachContext(coachState('2026-03-15'), { now: now.toISOString(), exerciseId: ex.id });
    assert.equal(ctx.signals.safety, 'discomfort', `${tz}: a note dated the local day is "today"`);
  });
});

test('P7.2 buildCoachContext does not count a note dated tomorrow-in-local-time just before local midnight (Los Angeles, UTC already tomorrow)', () => {
  for (const tz of ZONES) inZone(tz, () => {
    const now = at(2026, 3, 14, 23, 30); // local 23:30; in Los Angeles the UTC date is already 2026-03-15
    const ctx = E.intelligence.buildCoachContext(coachState('2026-03-15'), { now: now.toISOString(), exerciseId: ex.id });
    assert.notEqual(ctx.signals.safety, 'discomfort', `${tz}: a note dated tomorrow (local) is not today's evidence`);
    const today = E.intelligence.buildCoachContext(coachState('2026-03-14'), { now: now.toISOString(), exerciseId: ex.id });
    assert.equal(today.signals.safety, 'discomfort', `${tz}: a note dated the local day counts`);
  });
});

test('P7.2 answerCoachQuestion uses the same local day as buildCoachContext', () => {
  for (const tz of ZONES) inZone(tz, () => {
    const s = coachState('2026-03-15');
    const now = at(2026, 3, 15, 0, 30).toISOString();
    const c = E.intelligence.buildCoachContext(s, { now, exerciseId: ex.id });
    const answer = E.coachMod.answerCoachQuestion(s, 'How has my training been this week?', c);
    assert.equal(answer.intent, 'safety', `${tz}: the safety note dated today gates the answer`);
    const early = at(2026, 3, 14, 23, 30).toISOString();
    const c2 = E.intelligence.buildCoachContext(s, { now: early, exerciseId: ex.id });
    const answer2 = E.coachMod.answerCoachQuestion(s, 'How has my training been this week?', c2);
    assert.notEqual(answer2.intent, 'safety', `${tz}: a note dated tomorrow (local) does not gate it`);
  });
});

test('P7.2 no UTC prefix of a timestamp is used as a calendar day anywhere in src (legitimate array slices are fine)', () => {
  const offenders = [];
  const patterns = [
    /\bnow\b[^;\n]{0,80}\.slice\(\s*0\s*,\s*10\s*\)/,
    /\.timestamp\.slice\(\s*0\s*,\s*10\s*\)/,
    /completedAt\??\.slice\(\s*0\s*,\s*10\s*\)/,
    /toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/,
  ];
  walkSrc((file, text) => {
    if (file.endsWith(path.join('data', 'dates.ts'))) return; // the one module allowed to build days from UTC arithmetic
    for (const re of patterns) if (re.test(text)) offenders.push(`${path.relative(root, file)} ${re}`);
  });
  assert.deepEqual(offenders, []);
});
