import type {AppState, Exercise} from '../core/types';
import {consistencySummary, goalMomentum, plateauCandidates} from '../engine/analytics';
import {goalProgress, trainingLoadSummary} from '../engine/intelligence';
import {chronologicalCompleted, personalizedLoad, progression} from '../engine/training';
import {coachEvidenceFromState} from './signals';
import {coach} from './coach';
import type {CoachConfidence, CoachContext, CoachEvidence, CoachStateSignals} from './types';

export type CoachQuestionIntent = 'workout_status' | 'exercise_performance' | 'progression' | 'plateau' | 'recovery' | 'safety' | 'history' | 'consistency' | 'goal' | 'return_to_training' | 'general' | 'unsupported';
export interface CoachQuestionResponse {
 intent: CoachQuestionIntent;
 text: string;
 confidence: CoachConfidence;
 evidence: CoachEvidence[];
 missing?: string[];
 safety?: string;
}

export function classifyCoachQuestion(question: string): CoachQuestionIntent {
 const q = question.toLowerCase();
 if (/pain|hurt|injur|dizz|ill|sick|discomfort/.test(q)) return 'safety';
 if (/plateau|stuck|haven.t progressed|not progress/.test(q)) return 'plateau';
 if (/return|layoff|away|missed.*week/.test(q)) return 'return_to_training';
 if (/sleep|sore|soreness|fatigue|recover|ready|train today/.test(q)) return 'recovery';
 if (/progress|increase|weight|load|why.*stay/.test(q)) return 'progression';
 if (/this week|history|recent training|how.*training|performance/.test(q)) return 'history';
 if (/consistent|consistency|missed workout|adher/.test(q)) return 'consistency';
 if (/goal|target/.test(q)) return 'goal';
 if (/today|next session|workout|what.*do/.test(q)) return 'workout_status';
 if (/exercise|rir|set|rep/.test(q)) return 'exercise_performance';
 return question.trim() ? 'unsupported' : 'general';
}

function evidence(id: string, statement: string, confidence: CoachConfidence = 'medium'): CoachEvidence {
 return {id, statement, source: 'history', state: 'known', quality: confidence === 'high' ? 'high' : 'medium', pattern: 'signal', confidence, role: 'supporting', recency: 'recent', direction: 'neutral'};
}

function exerciseForQuestion(state: AppState, question: string, context: CoachContext): Exercise | undefined {
 const q = question.toLowerCase();
 return state.exercises.find((item) => q.includes(item.name.toLowerCase())) || context.exercise;
}

function safetyResponse(context: CoachContext, signals: CoachStateSignals, baseEvidence: CoachEvidence[]): CoachQuestionResponse | undefined {
 const decision = coach({...context, signals}).decision;
 if (decision.safety.status === 'clear') return undefined;
 return {intent: 'safety', text: decision.reason, confidence: decision.confidence, evidence: decision.evidence, safety: decision.safety.reason,
  missing: ['Clarify the symptom and whether it is safe to continue before treating this as a normal training question.']};
}

/** Deterministic question layer. It uses local APEX facts and never writes state or invents a prescription. */
export function answerCoachQuestion(state: AppState, question: string, context: CoachContext): CoachQuestionResponse {
 const target = exerciseForQuestion(state, question, context);
 const stateEvidence = coachEvidenceFromState(state, context.now.slice(0, 10), target);
 const safety = safetyResponse({...context, context: {...stateEvidence.context, ...context.context}, plateaus: stateEvidence.plateaus}, stateEvidence.signals, []);
 if (safety) return safety;
 const intent = classifyCoachQuestion(question);
 const done = chronologicalCompleted(state.workouts);
 const base = coach({...context, context: {...stateEvidence.context, ...context.context}, plateaus: stateEvidence.plateaus, signals: stateEvidence.signals});
 if (intent === 'recovery') {
  const recovery = stateEvidence.signals.recovery;
  if (recovery === 'missing') return {intent, text: 'APEX has no recent recovery check-in, so it cannot interpret today’s recovery context. Your deterministic prescription remains unchanged.', confidence: 'low', evidence: base.evidence, missing: ['Record sleep, soreness, fatigue, or readiness for today.']};
  return {intent, text: `Your recovery context is ${recovery}. ${base.explanation}`, confidence: base.decision.confidence, evidence: base.evidence};
 }
 if (intent === 'progression' || intent === 'exercise_performance') {
  if (!target) return {intent, text: 'APEX needs a current or named exercise to explain exercise-specific performance or progression.', confidence: 'low', evidence: base.evidence, missing: ['Name an exercise or open a workout with an active exercise.']};
  const rows = done.flatMap((workout) => workout.exercises.filter((entry) => entry.exerciseId === target.id));
  if (!rows.length) return {intent, text: `APEX has no completed working-set history for ${target.name} yet. Log comparable sets before asking for a progression explanation.`, confidence: 'low', evidence: base.evidence, missing: ['Completed comparable working sets.']};
  const result = personalizedLoad(target, state.workouts, state.profile, state.exercises, context.now.slice(0, 10));
  return {intent, text: `For ${target.name}, the deterministic engine currently says ${result.action}. ${result.reason} The Coach is explaining that result; it does not replace it.`, confidence: result.confidence, evidence: [...base.evidence, ...result.evidence.map((item, index) => evidence(`engine_${index}`, item, result.confidence))]};
 }
 if (intent === 'plateau') {
  const plateaus = stateEvidence.plateaus;
  if (!plateaus.length) return {intent, text: 'APEX has no deterministic plateau candidate in the available comparable history.', confidence: 'medium', evidence: base.evidence};
  return {intent, text: `APEX found a possible plateau in ${plateaus.map((item) => item.exerciseName).join(', ')}. This is a review signal, not a plan change or diagnosis.`, confidence: plateaus.every((item) => item.sessions >= 4) ? 'medium' : 'low', evidence: base.evidence};
 }
 if (intent === 'return_to_training') {
  if (!stateEvidence.signals.returnToTrainingDays) return {intent, text: 'APEX has no current return-to-training signal for this exercise. The deterministic engine will apply its return rule when the recorded gap reaches it.', confidence: 'medium', evidence: base.evidence};
  return {intent, text: `This exercise has a ${stateEvidence.signals.returnToTrainingDays}-day gap. APEX's deterministic return-to-training rule owns the load decision; the Coach recommends rebuilding tolerance from that prescribed session.`, confidence: 'high', evidence: base.evidence};
 }
 if (intent === 'workout_status') {
  const workout = context.workout;
  return workout ? {intent, text: `${workout.name} is currently ${workout.status}. ${base.explanation}`, confidence: base.decision.confidence, evidence: base.evidence}
   : {intent, text: 'APEX has no active or planned workout to discuss today.', confidence: 'low', evidence: base.evidence, missing: ['Create or schedule a workout.']};
 }
 if (intent === 'consistency' || intent === 'history') {
  const consistency = consistencySummary(state, 30);
  const load = trainingLoadSummary(state);
  const momentum = goalMomentum(state);
  return {intent, text: `In the last 30 days, APEX recorded ${consistency.completed} completed session${consistency.completed === 1 ? '' : 's'} and ${load.workingSets30} working sets. ${momentum.detail}`, confidence: done.length >= 2 ? 'medium' : 'low', evidence: [...base.evidence, evidence('history_summary', `${consistency.completed} completed sessions in 30 days.`)]};
 }
 if (intent === 'goal') {
  const goals = state.goals.filter((goal) => goal.status === 'active');
  if (!goals.length) return {intent, text: 'APEX has no active goal to interpret.', confidence: 'low', evidence: base.evidence, missing: ['Set an active training goal.']};
  const summaries = goals.map((goal) => { const progress = goalProgress(state, goal); return progress.percent === null ? goal.title : `${goal.title}: ${progress.percent}%`; });
  return {intent, text: `Active goal context: ${summaries.join('; ')}.`, confidence: 'medium', evidence: [...base.evidence, ...summaries.map((item, index) => evidence(`goal_${index}`, item))]};
 }
 return {intent: 'unsupported', text: 'APEX can answer grounded questions about today’s workout, an exercise, progression, plateau, recovery, history, consistency, goals, or return to training. It does not have enough supported context for that question.', confidence: 'low', evidence: base.evidence, missing: ['Ask about a supported APEX training context.']};
}
