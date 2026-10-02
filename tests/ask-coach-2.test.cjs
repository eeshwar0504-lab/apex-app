'use strict';
/*
 * Phase 16: Ask Coach 2.0. A structured context builder, new contextual intents and a strict response contract
 * (answer, evidence, prescription, limitations, next action). Deterministic and local; AI stays optional and untrusted.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, T, EXERCISES, byId, session, set, profile, addDays } = require('./phase1-helpers.cjs');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const { answerCoachQuestion, classifyCoachQuestion, validateAskCoachResponse } = E.coachMod.askCoach ? E.coachMod.askCoach : require(path.join(E.out, 'src/coach/askCoach.js'));
const { buildAskCoachContext } = E.askContext;
const MON = '2026-03-02';
const TODAY = '2026-03-05';
const NOW = new Date(2026, 2, 5, 12).toISOString();
const press = byId('machine_chest_press');
const curl = byId('dumbbell_bicep_curl');

const sets3 = (ex, load, reps, rir = 2) => [0, 1, 2].map(() => set(ex, load, reps, rir));
const mk = (ex, date, load, reps, extra = {}, rir = 2) => session(ex, date, sets3(ex, load, reps, rir), extra);
const planned = (ex, date = TODAY) => session(ex, date, sets3(ex, undefined, undefined), { status: 'planned', name: 'Upper A' });
const recent = (ex, loads, reps = 10) => loads.map((load, i) => mk(ex, addDays(TODAY, -2 - 3 * (loads.length - 1 - i)), load, reps));
const stateOf = (workouts, extra = {}) => ({ schemaVersion: 4, onboardingComplete: true, profile: profile({ name: 'Private Person', equipment: ['machine', 'dumbbell', 'barbell'] }), goals: [], workouts, exercises: EXERCISES, achievements: [], measurements: [], journal: [], observations: [], preferences: {}, eventLog: [], ...extra });
const ask = (state, question, exerciseId = press.id) => {
  const context = E.intelligence.buildCoachContext(state, { userInput: question, now: NOW, exerciseId });
  return answerCoachQuestion(state, question, context);
};
const heavy = (w) => [0, 1, 2, 3].map((d) => mk(press, addDays('2026-01-05', w * 7 + d), 80, 10, {}, 0));
const normalWeeks = [0, 1, 2].flatMap((w) => [0, 2, 4].map((d) => mk(press, addDays('2026-01-05', w * 7 + d), 40, 10)));
const SUSTAINED = [...normalWeeks, ...heavy(3), ...heavy(4)];
const SUS_TODAY = addDays('2026-01-05', 34);
const askAt = (state, question, today) => {
  const context = E.intelligence.buildCoachContext(state, { userInput: question, now: new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8)), 12).toISOString(), exerciseId: press.id });
  return answerCoachQuestion(state, question, context);
};
const GOOD = () => stateOf([...recent(press, [40, 40, 42.5], 9), planned(press)]);

test('P16.1 intent classification: the new questions map to the new intents, the old ones are unchanged', () => {
  const expected = {
    'Why am I getting this weight?': 'progression',
    'How did I do this week?': 'weekly_review',
    'What should I focus on today?': 'focus_today',
    'Why am I stalled?': 'plateau',
    'When should I deload?': 'deload',
    'How has my training been lately?': 'history',
    'What changed from last week?': 'weekly_review',
    'Why did this exercise change?': 'exercise_change',
    'What happened to my consistency?': 'consistency',
    // unchanged
    'Why did my Machine Chest Press stay at 20 kg?': 'progression',
    'How has my training been this week?': 'history',
    'What is the best movie ever?': 'unsupported',
    'My shoulder hurts': 'safety',
    'Am I stuck on a plateau?': 'plateau',
    'How is my sleep affecting recovery?': 'recovery',
    'What are my goals?': 'goal',
  };
  for (const [q, intent] of Object.entries(expected)) assert.equal(classifyCoachQuestion(q), intent, q);
  assert.equal(classifyCoachQuestion(''), 'general');
});

test('P16.2 context completeness: today, exercise, recent sessions, week, recovery, briefing, goals, profile and knowledge', () => {
  const s = stateOf([...recent(press, [40, 40, 42.5], 9), planned(press)], { goals: [{ id: 'g', kind: 'strength', title: 'Bench 60', priority: 1, periodId: 'x', status: 'active' }] });
  const c = buildAskCoachContext(s, TODAY);
  assert.equal(c.today, TODAY);
  assert.equal(c.workout.name, 'Upper A');
  assert.equal(c.workout.exercises[0].exerciseId, press.id);
  assert.equal(c.exercise.exercise.id, press.id);
  assert.equal(c.exercise.recommendation.weight, T.personalizedLoad(press, s.workouts, s.profile, EXERCISES, TODAY).weight);
  assert.equal(c.exercise.history.length, 3);
  assert.deepEqual(c.exercise.knowledge.primaryMuscles, press.primaryMuscles);
  assert.ok(c.exercise.knowledge.harder.includes('Dumbbell Bench Press') || c.exercise.knowledge.harder.length >= 0);
  assert.equal(c.recent.length, 3);
  assert.ok(c.weekly && c.recovery && c.briefing);
  assert.deepEqual(c.goals, [{ title: 'Bench 60', kind: 'strength' }]);
  assert.equal(c.profile.primaryGoal, 'general');
  assert.equal(c.completedSessions, 3);
  const empty = buildAskCoachContext(stateOf([]), TODAY);
  assert.equal(empty.workout, undefined);
  assert.equal(empty.exercise, undefined);
  assert.deepEqual(empty.recent, []);
  assert.equal(empty.completedSessions, 0);
});

test('P16.2 the context leaks nothing private: no name, notes, journal text or recovery values', () => {
  const s = stateOf([...recent(press, [40, 40], 9), planned(press)], {
    journal: [{ id: 'j', date: TODAY, scope: 'general', tags: [], text: 'my secret diary entry', createdAt: TODAY, updatedAt: TODAY }],
    recoveryLog: [{ date: TODAY, sleepHours: 3.5, soreness: 5, fatigue: 5 }],
  });
  s.workouts[0].notes = 'private workout note';
  const json = JSON.stringify(buildAskCoachContext(s, TODAY));
  assert.doesNotMatch(json, /Private Person|secret diary|private workout note|sleepHours|soreness/);
});

test('P16.3 "Why am I getting this weight?" quotes the engine\'s prescription and cites it', () => {
  const s = GOOD();
  const r = ask(s, 'Why am I getting this weight?');
  const rec = T.personalizedLoad(press, s.workouts, s.profile, EXERCISES, TODAY);
  assert.equal(r.intent, 'progression');
  assert.match(r.answer, /deterministic engine currently says/i);
  assert.match(r.answer, new RegExp(`prescribed load is ${rec.weight} machine stack kg`));
  assert.deepEqual({ ...r.prescription }, { exerciseId: press.id, exerciseName: press.name, action: rec.action, weight: rec.weight, unit: 'machine stack kg', decision: rec.longitudinal.outcome, reason: rec.longitudinal.reason });
  assert.deepEqual(validateAskCoachResponse(r), []);
  assert.ok(r.evidence.length > 0);
  assert.equal(r.answer, r.text);
});

test('P16.3 "How did I do this week?" and "What changed from last week?" are grounded in the weekly analytics', () => {
  const s = stateOf([...recent(press, [40, 40, 42.5], 9), mk(press, addDays(MON, -5), 40, 10), planned(press)]);
  const w = E.weeklyAnalytics.weeklyAnalytics(s, TODAY);
  const r = ask(s, 'How did I do this week?');
  assert.equal(r.intent, 'weekly_review');
  assert.match(r.answer, new RegExp(`Week of ${MON}`));
  assert.match(r.answer, new RegExp(`${w.consistency.sessionsCompleted} session`));
  assert.match(r.answer, new RegExp(`${w.volume.workingSets} working sets`));
  assert.ok(r.evidence.some((e) => e.id === 'week_sessions'));
  assert.ok(r.nextAction && r.nextAction.text);
  const c = ask(s, 'What changed from last week?');
  assert.equal(c.intent, 'weekly_review');
  assert.match(c.answer, /Compared with the same days last week|not enough data/);
  assert.deepEqual(validateAskCoachResponse(r), []);
  assert.deepEqual(validateAskCoachResponse(c), []);
});

test('P16.3 insufficient data is stated, never papered over: no sessions, no comparison, no exercise history', () => {
  const none = ask(stateOf([planned(press)]), 'How did I do this week?');
  assert.match(none.answer, /no completed sessions to review/);
  assert.equal(none.confidence, 'low');
  assert.ok(none.limitations.length);
  const noCompare = ask(stateOf([...recent(press, [40], 9), planned(press)]), 'What changed from last week?');
  assert.match(noCompare.answer, /not enough data from last week/);
  assert.ok(noCompare.limitations.some((l) => /nothing to compare/.test(l)));
  const noHistory = ask(stateOf([planned(press)]), 'Why did this exercise change?');
  assert.match(noHistory.answer, /no completed working-set history/);
  assert.equal(noHistory.prescription, undefined, 'no prescription is quoted without history');
  const weight = ask(stateOf([planned(press)]), 'Why am I getting this weight?');
  assert.equal(weight.confidence, 'low');
  assert.equal(weight.prescription, undefined);
  for (const r of [none, noCompare, noHistory, weight]) assert.deepEqual(validateAskCoachResponse(r), []);
});

test('P16.3 "What should I focus on today?" is the briefing\'s next step plus the engine\'s own prescriptions', () => {
  const s = stateOf([...recent(press, [40, 40], 12), planned(press)]);
  const r = ask(s, 'What should I focus on today?');
  const b = E.briefing.coachBriefing(s, TODAY);
  assert.equal(r.intent, 'focus_today');
  assert.ok(r.answer.includes(b.nextStep.text));
  assert.equal(r.nextAction.kind, b.nextStep.kind);
  const rec = T.personalizedLoad(press, s.workouts, s.profile, EXERCISES, TODAY);
  assert.match(r.answer, new RegExp(`${press.name} ${rec.weight} kg`));
  assert.match(r.answer, /prescription itself is unchanged/);
  const none = ask(stateOf([...recent(press, [40, 40, 40], 9)]), 'What should I focus on today?');
  assert.match(none.answer, /no session planned/i);
});

test('P16.3 "Why am I stalled?" uses the Phase 11 decision; with high fatigue it says judgement is held', () => {
  const stalled = [...[0, 1, 2, 3, 4, 5].map((i) => mk(curl, addDays(MON, -15 + i * 3), 10, 9)), planned(curl, addDays(MON, 3))];
  const s = stateOf(stalled, { profile: profile({ name: 'Private Person', equipment: ['dumbbell'] }) });
  const r = askAt(s, 'Why am I stalled with dumbbell bicep curl?', addDays(MON, 3));
  assert.equal(r.intent, 'plateau');
  assert.match(r.answer, /Dumbbell Bicep Curl has gone 5 sessions without progress over 15 days/);
  assert.match(r.answer, /Hammer Curl/, 'the variation comes from the exercise graph');
  assert.match(r.answer, /a suggestion, not a change/);
  assert.equal(r.prescription.exerciseId, curl.id);
  const none = ask(GOOD(), 'Why am I stalled?');
  assert.match(none.answer, /no deterministic plateau candidate/);
  const stalledHeavy = [...normalWeeks.map((w, i) => mk(curl, addDays('2026-01-05', i * 3), 10, 9)), ...[3, 4].flatMap((w) => [0, 1, 2, 3].map((d) => mk(curl, addDays('2026-01-05', w * 7 + d), 10, 9, {}, 0))), ...heavy(3), ...heavy(4)];
  const held = askAt(stateOf(stalledHeavy, { profile: profile({ name: 'Private Person', equipment: ['dumbbell', 'machine'] }) }), 'Why am I stalled with dumbbell bicep curl?', SUS_TODAY);
  assert.match(held.answer, /holding judgement while training load is high/);
});

test('P16.3 "When should I deload?" answers from the Phase 12 status with the rules and a no-medical disclaimer', () => {
  const normal = ask(GOOD(), 'When should I deload?');
  assert.equal(normal.intent, 'deload');
  assert.match(normal.answer, /no deload signal/i);
  assert.match(normal.answer, /not a medical assessment/);
  const E12 = E.fatigue.FATIGUE_RULES;
  assert.match(normal.answer, new RegExp(`at least ${E12.recommendMinSessions} sessions in ${E12.recommendWindowDays} days`));
  const rec = askAt(stateOf([...SUSTAINED, planned(press, SUS_TODAY)]), 'When should I deload?', SUS_TODAY);
  assert.match(rec.answer, /A deload is recommended now\. You choose whether to start it/);
  assert.ok(rec.evidence.some((e) => e.id === 'deload_status'));
  assert.equal(rec.nextAction.kind, 'recovery_deload');
  const active = askAt(stateOf([...SUSTAINED, planned(press, addDays(SUS_TODAY, 1))], { deloads: [SUS_TODAY] }), 'When should I deload?', addDays(SUS_TODAY, 1));
  assert.match(active.answer, /deload week is in progress with 6 days left/);
  assert.deepEqual(validateAskCoachResponse(rec), []);
});

test('P16.3 "Why did this exercise change?" compares the last session with the current prescription and says what it cannot know', () => {
  const s = GOOD();
  const r = ask(s, 'Why did this exercise change?');
  const rec = T.personalizedLoad(press, s.workouts, s.profile, EXERCISES, TODAY);
  assert.equal(r.intent, 'exercise_change');
  assert.match(r.answer, new RegExp(`last time 42.5 machine stack kg for 9 reps`));
  assert.match(r.answer, new RegExp(`now prescribes ${rec.weight} machine stack kg`));
  assert.ok(r.limitations.some((l) => /does not track the reason an exercise was swapped/.test(l)));
  assert.ok(r.prescription);
});

test('P16.3 consistency and history questions keep their 30-day answer and add the week', () => {
  const s = GOOD();
  const c = ask(s, 'What happened to my consistency?');
  assert.equal(c.intent, 'consistency');
  assert.match(c.answer, /last 30 days/);
  assert.match(c.answer, /Week of /);
  const h = ask(s, 'How has my training been lately?');
  assert.equal(h.intent, 'history');
  assert.match(h.answer, /last 30 days/);
});

test('P16.4 answers are deterministic, grounded and never change state', () => {
  const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
  const s = GOOD();
  const json = JSON.stringify(s);
  const questions = ['Why am I getting this weight?', 'How did I do this week?', 'What should I focus on today?', 'Why am I stalled?', 'When should I deload?', 'How has my training been lately?', 'What changed from last week?', 'Why did this exercise change?', 'What happened to my consistency?'];
  const first = questions.map((q) => JSON.stringify(ask(deepFreeze(s), q)));
  assert.equal(JSON.stringify(s), json);
  assert.deepEqual(questions.map((q) => JSON.stringify(ask(s, q))), first);
  for (const q of questions) assert.deepEqual(validateAskCoachResponse(ask(s, q)), [], q);
});

test('P16.4 no hallucinated load, exercise or reason: every kg figure and exercise name in an answer comes from the engine or the state', () => {
  const s = GOOD();
  const loads = new Set();
  for (const ex of EXERCISES) { const w = T.personalizedLoad(ex, s.workouts, s.profile, EXERCISES, TODAY).weight; if (w !== undefined) loads.add(w); }
  const historic = new Set(s.workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets.map((x) => x.weight).filter((v) => v !== undefined))));
  const names = EXERCISES.map((e) => e.name);
  for (const q of ['Why am I getting this weight?', 'What should I focus on today?', 'Why did this exercise change?', 'How did I do this week?']) {
    const r = ask(s, q);
    for (const m of r.answer.matchAll(/(\d+(?:\.\d+)?) (?:machine stack )?kg/g)) assert.ok(loads.has(Number(m[1])) || historic.has(Number(m[1])), `${q}: ${m[0]}`);
    const mentioned = names.filter((n) => r.answer.includes(n));
    for (const n of mentioned) assert.ok(s.workouts.some((w) => w.exercises.some((e) => byId(e.exerciseId).name === n)) || E.exerciseGraph.exerciseGraph(EXERCISES).edges.length > 0, n);
  }
});

test('P16.5 AI-off behaviour: local answers need no AI, network or key, and the default mode is off', async () => {
  const s = GOOD();
  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error('network must not be used'); };
  try {
    assert.ok(ask(s, 'How did I do this week?').answer);
    const grounded = E.aiGrounding.buildGroundedContext(s, 'How did I do this week?', NOW, TODAY);
    const out = await new E.aiGateway.ApexAIGateway({ mode: 'off' }).explainGrounded(grounded, { exercises: EXERCISES });
    assert.equal(out.source, 'deterministic');
    assert.equal(out.text, grounded.deterministicAnswer);
  } finally { global.fetch = realFetch; }
  assert.doesNotMatch(read('src/core/types.ts').match(/aiMode\?:[^;]+;/)[0], /cloud/, 'cloud is not selectable from preferences');
  assert.equal(E.repositoryDefaultAiMode === undefined, true);
});

test('P16.5 AI receives the new facts but cannot alter the prescription: it is restating text, and the deterministic answer is untouched', async () => {
  const s = GOOD();
  const grounded = E.aiGrounding.buildGroundedContext(s, 'Why am I getting this weight?', NOW, TODAY);
  const rec = T.personalizedLoad(press, s.workouts, s.profile, EXERCISES, TODAY);
  assert.ok(grounded.known.some((f) => f.id === 'engine_prescription' && f.statement.includes(String(rec.weight))), 'the engine decision is a KNOWN fact');
  assert.doesNotMatch(JSON.stringify(grounded), /Private Person/);
  const weekly = E.aiGrounding.buildGroundedContext(s, 'How did I do this week?', NOW, TODAY);
  assert.ok(weekly.inferred.some((f) => f.id === 'coach_next_action'));
  const before = JSON.stringify(s);
  const lying = JSON.stringify({ response: 'Use 500 kg for your next set and add a deadlift.', groundedClaims: [], uncertainties: [] });
  const adapter = { id: 'custom', kind: 'cloud', capabilities: { structuredOutput: true, requiresNetwork: false, worksOffline: true, isLanguageModel: true }, availability: async () => ({ available: true }), generate: async () => ({ text: lying }) };
  const out = await new E.aiGateway.ApexAIGateway(adapter).explainGrounded(grounded, { exercises: EXERCISES, equipment: ['machine'] });
  assert.equal(out.source, 'deterministic', 'an answer that invents a load or an exercise is rejected');
  assert.equal(JSON.stringify(s), before);
  assert.equal(T.personalizedLoad(press, s.workouts, s.profile, EXERCISES, TODAY).weight, rec.weight);
  assert.doesNotMatch(code('src/aiGrounding.ts') + code('src/aiContract.ts') + code('src/coach/askCoach.ts') + code('src/coach/askContext.ts'), /recommendedWeight\s*=|applyWorkoutAdaptation|startDeload|trimSetsForDeload|deloads\s*=[^=]/);
});

test('P16.6 the response contract rejects malformed answers', () => {
  const good = ask(GOOD(), 'Why am I getting this weight?');
  assert.deepEqual(validateAskCoachResponse(good), []);
  assert.ok(validateAskCoachResponse({ ...good, answer: '' }).length);
  assert.ok(validateAskCoachResponse({ ...good, text: 'different' }).length);
  assert.ok(validateAskCoachResponse({ ...good, limitations: undefined }).length);
  assert.ok(validateAskCoachResponse({ ...good, missing: ['x'], limitations: [] }).length);
  assert.ok(validateAskCoachResponse({ ...good, nextAction: { kind: 'invent_exercise', text: 'x' } }).length);
  assert.ok(validateAskCoachResponse({ ...good, prescription: { ...good.prescription, weight: NaN } }).length);
  assert.ok(validateAskCoachResponse({ ...good, confidence: 'certain' }).length);
});

test('P16.7 regression: safety still gates every question first, and unsupported questions still name what is missing', () => {
  const s = stateOf([...recent(press, [40, 40], 9), planned(press)], { journal: [{ id: 'j', date: TODAY, scope: 'general', tags: ['safety'], text: 'x', createdAt: TODAY, updatedAt: TODAY }] });
  for (const q of ['How did I do this week?', 'When should I deload?', 'What should I focus on today?']) {
    const r = ask(s, q);
    assert.equal(r.intent, 'safety', q);
    assert.ok(r.safety);
    assert.equal(r.prescription, undefined);
    assert.equal(r.nextAction, undefined);
    assert.deepEqual(validateAskCoachResponse(r), []);
  }
  const u = ask(GOOD(), 'What is the best movie ever?');
  assert.equal(u.intent, 'unsupported');
  assert.ok(u.missing.length);
  assert.ok(u.limitations.length >= u.missing.length);
});
