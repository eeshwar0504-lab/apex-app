'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {loadEngine} = require('./longitudinal/load-engine.cjs');
const {coachMod, exercisesMod, recovery: R, training: T} = loadEngine();

const ex = exercisesMod.EXERCISES.find((item) => item.id === 'machine_chest_press');
let id = 0;
const workout = (date, reps = 10, status = 'completed', weight = 20) => ({
 id: `w${++id}`, name: 'Upper', planId: 'p', scheduledDate: date, status, source: 'scheduled', version: 1, completedAt: status === 'completed' ? `${date}T10:00:00.000Z` : undefined,
 exercises: [{exerciseId: ex.id, order: 0, prescribedSets: 3, repRange: [8, 12], restSec: 90, sets: [1,2,3].map(() => ({id:`s${++id}`, type:'working', weight, reps, rir:2, completed:true}))}],
});
const state = () => ({schemaVersion:4, profile:{id:'p',name:'T',experience:'beginner',equipment:['machine'],primaryGoal:'strength',goals:['strength'],trainingDays:3,sessionMinutes:45,body:{},createdAt:'2026-01-01T00:00:00Z'}, goals:[], plan:undefined, workouts:[workout('2026-01-01'),workout('2026-01-04'),workout('2026-01-07')], exercises:exercisesMod.EXERCISES, achievements:[],measurements:[],journal:[],observations:[],preferences:{},activeRoute:'coach',onboardingComplete:true,coachMemory:[],eventLog:[]});
const context = (s, extra={}) => { const current=s.workouts.find((item)=>item.status==='completed'); return {state:s,profile:s.profile,goals:s.goals,primaryGoal:'strength',workout:current,workoutId:current?.id,exercise:ex,exerciseId:ex.id,workoutExercise:current?.exercises[0],recentWorkoutIds:[],recentExerciseEntryIds:[],now:'2026-01-08T10:00:00.000Z',...extra}; };

test('Phase 2 recovery states are traceable and poor recovery selects conservative guidance without a load', () => {
 const s = state(); s.recoveryLog = [R.normalizeRecoveryCheckIn({date:'2026-01-08',sleepHours:4,sleepQuality:1,soreness:5,fatigue:5,readiness:1})];
 const facts = coachMod.coachEvidenceFromState(s, '2026-01-08', ex);
 const result = coachMod.coach(context(s, {context:facts.context,plateaus:facts.plateaus,signals:facts.signals}));
 assert.equal(facts.signals.recovery, 'poor');
 assert.equal(result.decision.selectedCandidateId, 'lighter_session_option');
 assert.equal(Object.hasOwn(result.decision.prescription, 'weight'), false);
 assert.ok(result.evidence.some((item) => item.id === 'e_recovery_state' && item.direction === 'negative'));
});

test('Phase 2 safety from persisted safety records takes precedence over plateau and recovery commentary', () => {
 const s = state(); s.workouts.push(workout('2026-01-10'), workout('2026-01-13')); s.journal.push({id:'j',date:'2026-01-14',scope:'workout',text:'Safety check: Sharp pain.',tags:['safety']});
 const facts = coachMod.coachEvidenceFromState(s, '2026-01-14', ex);
 const result = coachMod.coach(context(s, {now:'2026-01-14T10:00:00.000Z',context:facts.context,plateaus:facts.plateaus,signals:facts.signals}));
 assert.equal(facts.signals.safety, 'discomfort');
 assert.equal(result.decision.safety.status, 'caution');
 assert.equal(result.decision.action, 'ask');
 assert.notEqual(result.decision.action, 'review');
});

test('Phase 2 detects missed sessions, return-to-training and performance without changing training state', () => {
 const s = state(); s.workouts.push({...workout('2026-01-06', 0, 'missed'), status:'missed'}); s.workouts = [workout('2025-12-01', 10), s.workouts.at(-1)];
 const before = JSON.stringify(s); const beforeLoad = T.personalizedLoad(ex, s.workouts, s.profile, s.exercises, '2026-01-20');
 const facts = coachMod.coachEvidenceFromState(s, '2026-01-20', ex);
 const result = coachMod.coach(context(s, {now:'2026-01-20T10:00:00.000Z',context:facts.context,plateaus:facts.plateaus,signals:facts.signals}));
 assert.equal(facts.signals.missedSessions21, 1);
 assert.ok(facts.signals.returnToTrainingDays >= 14);
 assert.equal(result.decision.selectedCandidateId, 'review_return_to_training');
 assert.equal(JSON.stringify(s), before);
 assert.deepEqual(T.personalizedLoad(ex, s.workouts, s.profile, s.exercises, '2026-01-20'), beforeLoad);
});

test('Phase 2 confidence drops for missing or conflicting evidence and does not create a high normal decision', () => {
 const s = state(); const missing = coachMod.coach(context(s, {signals:{recovery:'missing'}}));
 const conflicted = coachMod.coach(context(s, {signals:{recovery:'conflicted'}}));
 assert.equal(missing.decision.confidence, 'low');
 assert.equal(conflicted.decision.confidence, 'low');
 assert.match(conflicted.decision.confidenceReason, /conflicts/i);
});

test('Phase 2 Ask Coach deterministically answers supported contexts and names missing evidence', () => {
 const s = state(); const c = context(s);
 const progression = coachMod.answerCoachQuestion(s, 'Why did my Machine Chest Press stay at 20 kg?', c);
 const history = coachMod.answerCoachQuestion(s, 'How has my training been this week?', c);
 const unknown = coachMod.answerCoachQuestion(s, 'What is the best movie ever?', c);
 assert.equal(progression.intent, 'progression'); assert.match(progression.text, /deterministic engine/i);
 assert.equal(history.intent, 'history'); assert.match(history.text, /last 30 days/i);
 assert.equal(unknown.intent, 'unsupported'); assert.ok(unknown.missing.length);
});

test('Phase 2 Coach is deterministic, ignores irrelevant history order, and cannot emit or mutate a training prescription', () => {
 const s = state(); const facts = coachMod.coachEvidenceFromState(s, '2026-01-08', ex); const c = context(s, {context:facts.context,plateaus:facts.plateaus,signals:facts.signals});
 const before = JSON.stringify(s); const a = coachMod.coach(c); const b = coachMod.coach({...c, state:{...s, journal:[...s.journal,{id:'irrelevant',date:'2020-01-01',scope:'general',text:'hello',tags:[]}]}});
 assert.deepEqual(a.decision, coachMod.coach(c).decision);
 assert.equal(a.decision.action, b.decision.action);
 assert.equal(JSON.stringify(s), before);
 for (const key of ['weight','minWeight','maxWeight','repsMin','repsMax','sets','restSec']) assert.equal(Object.hasOwn(a.decision.prescription, key), false, key);
});
