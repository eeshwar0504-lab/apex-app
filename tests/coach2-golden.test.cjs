'use strict';
/*
 * Phases 14-16 golden cases. Three representative athletes, each with the weekly analytics summary, the Coach briefing and the Ask
 * Coach answers pinned in tests/golden/coach2.json. Regenerate only after deliberately changing a documented rule:
 *   UPDATE_GOLDEN=1 node --test tests/coach2-golden.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, EXERCISES, byId, session, set, profile, addDays } = require('./phase1-helpers.cjs');

const { answerCoachQuestion } = require(path.join(E.out, 'src/coach/askCoach.js'));
const FILE = path.join(__dirname, 'golden', 'coach2.json');
const press = byId('machine_chest_press');
const sets3 = (load, reps, rir = 2) => [0, 1, 2].map(() => set(press, load, reps, rir));
const mk = (date, load, reps, rir = 2, extra = {}) => session(press, date, sets3(load, reps, rir), extra);
const planned = (date) => session(press, date, sets3(undefined, undefined), { status: 'planned', name: 'Upper A' });
const stateOf = (workouts, extra = {}) => ({ schemaVersion: 4, onboardingComplete: true, profile: profile({ name: 'Golden', equipment: ['machine'] }), goals: [], workouts, exercises: EXERCISES, achievements: [], measurements: [], journal: [], observations: [], preferences: {}, eventLog: [], ...extra });
const TODAY = '2026-03-05';
const MON = '2026-03-02';
const heavy = (w) => [0, 1, 2, 3].map((d) => mk(addDays('2026-01-05', w * 7 + d), 80, 10, 0));
const normalWeeks = [0, 1, 2].flatMap((w) => [0, 2, 4].map((d) => mk(addDays('2026-01-05', w * 7 + d), 40, 10)));

const SCENARIOS = {
  steady_hold: { today: TODAY, state: stateOf([mk(addDays(TODAY, -8), 40, 9), mk(addDays(TODAY, -5), 40, 9), mk(addDays(TODAY, -2), 42.5, 9), mk(addDays(MON, -5), 40, 10), planned(TODAY)]) },
  ready_to_progress: { today: TODAY, state: stateOf([mk(addDays(TODAY, -5), 40, 12), mk(addDays(TODAY, -2), 40, 12), planned(TODAY)]) },
  sustained_load: { today: addDays('2026-01-05', 34), state: stateOf([...normalWeeks, ...heavy(3), ...heavy(4), planned(addDays('2026-01-05', 34))]) },
};
const QUESTIONS = ['How did I do this week?', 'What should I focus on today?', 'When should I deload?', 'Why am I getting this weight?'];

function summarise(name) {
  const { state, today } = SCENARIOS[name];
  const [y, m, d] = today.split('-').map(Number);
  const w = E.weeklyAnalytics.weeklyAnalytics(state, today);
  const b = E.briefing.coachBriefing(state, today);
  return {
    weekly: {
      week: w.week, sessions: w.consistency.sessionsCompleted, planned: w.consistency.plannedSessions, adherencePct: w.consistency.adherencePct, workingSets: w.volume.workingSets,
      muscles: w.volume.byMuscle.map((x) => [x.muscle, x.directSets, x.indirectSets, x.sharePct]), progressed: w.progression.progressed, flat: w.progression.flat, stalled: w.progression.stalled,
      recovery: w.recovery && [w.recovery.level, w.recovery.status, w.recovery.trend], comparison: Object.fromEntries(Object.entries(w.comparison).map(([k, c]) => [k, [c.state, c.current, c.prior, c.delta]])),
    },
    briefing: { status: b.status, headline: b.headline, next: [b.nextStep.kind, b.nextStep.severity, b.nextStep.text], items: b.items.map((i) => i.kind), observations: b.observations },
    ask: Object.fromEntries(QUESTIONS.map((q) => {
      const context = E.intelligence.buildCoachContext(state, { userInput: q, now: new Date(y, m - 1, d, 12).toISOString(), exerciseId: press.id });
      const r = answerCoachQuestion(state, q, context);
      return [q, { intent: r.intent, confidence: r.confidence, answer: r.answer, nextAction: r.nextAction && r.nextAction.kind, limitations: r.limitations, prescription: r.prescription && [r.prescription.action, r.prescription.weight] }];
    })),
  };
}

test('P14-16 golden cases: weekly analytics, Coach briefing and Ask Coach answers for three representative athletes', () => {
  const actual = Object.fromEntries(Object.keys(SCENARIOS).map((n) => [n, summarise(n)]));
  if (process.env.UPDATE_GOLDEN === '1') { fs.writeFileSync(FILE, JSON.stringify(actual, null, 2) + '\n'); return; }
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(fs.readFileSync(FILE, 'utf8')));
});

test('P14-16 golden sanity: the pinned cases cover a hold, a progression and a deload recommendation', () => {
  const golden = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  assert.equal(golden.steady_hold.briefing.next[0], 'maintain_load');
  assert.equal(golden.ready_to_progress.briefing.next[0], 'follow_progression');
  assert.equal(golden.sustained_load.briefing.next[0], 'recovery_deload');
  assert.equal(golden.sustained_load.briefing.status, 'recovery');
  assert.match(golden.sustained_load.ask['When should I deload?'].answer, /A deload is recommended now/);
});
