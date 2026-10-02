import type {AppState, Exercise} from '../core/types';
import {consistencySummary, goalMomentum} from '../engine/analytics';
import {goalProgress, trainingLoadSummary} from '../engine/intelligence';
import {chronologicalCompleted, loadUnit, personalizedLoad} from '../engine/training';
import {FATIGUE_RULES} from '../engine/fatigue';
import {dayOfTimestamp, localDate} from '../data/dates';
import {coachEvidenceFromState} from './signals';
import {coach} from './coach';
import {buildAskCoachContext} from './askContext';
import type {AskCoachContext} from './askContext';
import type {CoachStepKind} from './briefing';
import type {CoachConfidence, CoachContext, CoachEvidence, CoachStateSignals} from './types';

export type CoachQuestionIntent = 'workout_status' | 'exercise_performance' | 'progression' | 'plateau' | 'recovery' | 'safety' | 'history' | 'consistency' | 'goal' | 'return_to_training' | 'weekly_review' | 'focus_today' | 'deload' | 'exercise_change' | 'general' | 'unsupported';

/** The engine's own prescription for an exercise, quoted. Nothing in it is calculated by the Coach. */
export interface AskPrescription {
 exerciseId: string;
 exerciseName: string;
 action?: string;
 weight?: number;
 unit: string;
 /** The Phase 11 longitudinal outcome and reason code. */
 decision: string;
 reason: string;
 deloadStatus?: string;
}

export interface AskNextAction {
 kind: CoachStepKind;
 text: string;
}

/**
 * The Ask Coach response contract. `answer` (also `text`), `evidence`, `prescription`, `limitations` and `nextAction` are separate
 * on purpose: the answer is the conclusion, the evidence is what it rests on, the prescription is the engine's current decision
 * (quoted, never computed here), limitations say what is missing, and the next action is a suggestion, never a change.
 */
export interface CoachQuestionResponse {
 intent: CoachQuestionIntent;
 text: string;
 answer: string;
 confidence: CoachConfidence;
 evidence: CoachEvidence[];
 missing?: string[];
 limitations: string[];
 safety?: string;
 prescription?: AskPrescription;
 nextAction?: AskNextAction;
}

const STEP_KINDS: readonly CoachStepKind[] = ['safety_first', 'recovery_deload', 'conservative_reentry', 'resume_after_missed', 'review_stalled_exercise', 'follow_progression', 'review_consistency', 'maintain_load', 'train_as_planned'];

/** Returns the ways a response breaks the contract (empty when it holds). Used by tests and by any caller that wants a hard check. */
export function validateAskCoachResponse(r: CoachQuestionResponse): string[] {
 const problems: string[] = [];
 if (!r.answer || r.answer !== r.text) problems.push('answer must be a non-empty string equal to text');
 if (!['high', 'medium', 'low'].includes(r.confidence)) problems.push('confidence');
 if (!Array.isArray(r.evidence) || r.evidence.some(e => !e.id || !e.statement)) problems.push('evidence items need an id and a statement');
 if (!Array.isArray(r.limitations)) problems.push('limitations must be a list');
 if (r.missing && r.limitations.length < r.missing.length) problems.push('every missing item must appear in limitations');
 if (r.prescription && (!r.prescription.exerciseId || (r.prescription.weight !== undefined && !Number.isFinite(r.prescription.weight)))) problems.push('prescription');
 if (r.nextAction && !STEP_KINDS.includes(r.nextAction.kind)) problems.push('nextAction.kind');
 if (r.nextAction && !r.nextAction.text) problems.push('nextAction.text');
 return problems;
}

export function classifyCoachQuestion(question: string): CoachQuestionIntent {
 const q = question.toLowerCase();
 if (/pain|hurt|injur|dizz|ill|sick|discomfort/.test(q)) return 'safety';
 if (/deload|take.*recovery week|when should i (rest|take a break)/.test(q)) return 'deload';
 if (/focus.*today|what should i focus|today.*focus|priority today/.test(q)) return 'focus_today';
 if (/(why|what).*(exercise|lift|movement).*(chang|swap|differ|replac)|why did .* change|what changed (in|with|on) (this|my) /.test(q)) return 'exercise_change';
 if (/how did i do|what changed from last week|compared? (to|with) last week|last week|week over week|week.to.week/.test(q)) return 'weekly_review';
 if (/plateau|stuck|stall|haven.t progressed|not progress/.test(q)) return 'plateau';
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

export function exerciseForQuestion(state: AppState, question: string, context: CoachContext): Exercise | undefined {
 const q = question.toLowerCase();
 return state.exercises.find((item) => q.includes(item.name.toLowerCase())) || context.exercise;
}

function safetyResponse(context: CoachContext, signals: CoachStateSignals): Omit<CoachQuestionResponse, 'answer' | 'limitations'> | undefined {
 const decision = coach({...context, signals}).decision;
 if (decision.safety.status === 'clear') return undefined;
 return {intent: 'safety', text: decision.reason, confidence: decision.confidence, evidence: decision.evidence, safety: decision.safety.reason,
  missing: ['Clarify the symptom and whether it is safe to continue before treating this as a normal training question.']};
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function prescriptionOf(ask: AskCoachContext): AskPrescription | undefined {
 const e = ask.exercise;
 if (!e) return undefined;
 const rec = e.recommendation;
 return {exerciseId: e.exercise.id, exerciseName: e.exercise.name, action: rec.action, weight: rec.weight, unit: loadUnit(e.exercise),
  decision: rec.longitudinal?.outcome ?? 'CONTINUE', reason: rec.longitudinal?.reason ?? 'continuing', ...(rec.deload ? {deloadStatus: rec.deload.status} : {})};
}

function weeklyText(ask: AskCoachContext): {text: string; items: CoachEvidence[]} | undefined {
 const w = ask.weekly;
 if (!w) return undefined;
 const c = w.consistency;
 const items: CoachEvidence[] = [];
 const head = `Week of ${w.week.start} (${plural(w.week.elapsedDays, 'day')} so far): ${plural(c.sessionsCompleted, 'session')} completed${c.plannedSessions ? ` of ${c.plannedSessions} planned${c.adherencePct !== null ? ` (${c.adherencePct}% of the plan)` : ''}` : ''}, ${plural(w.volume.workingSets, 'working set')}.`;
 items.push(evidence('week_sessions', head));
 const parts = [head];
 const s = w.comparison.sessions, v = w.comparison.workingSets;
 if (s.state === 'ok' && v.state === 'ok') {
  const line = `Compared with the same days last week: sessions ${signed(s.delta as number)}, working sets ${signed(v.delta as number)}.`;
  parts.push(line); items.push(evidence('week_comparison', line));
 } else {
  const line = 'There is not enough data from last week to compare.';
  parts.push(line); items.push(evidence('week_comparison', line, 'low'));
 }
 const p = w.progression;
 if (p.exercises.length) {
  const line = `${plural(p.progressed, 'exercise')} progressed${p.regressed ? `, ${p.regressed} regressed` : ''}${p.stalled ? `, ${p.stalled} stalled` : ''}.`;
  parts.push(line); items.push(evidence('week_progression', line));
 }
 if (w.recovery && w.recovery.status !== 'normal') {
  const line = `Training load status: ${w.recovery.status.replace(/_/g, ' ')} (fatigue level ${w.recovery.level}, ${w.recovery.trend}).`;
  parts.push(line); items.push(evidence('week_recovery', line));
 }
 return {text: parts.join(' '), items};
}

function core(state: AppState, question: string, context: CoachContext, ask: () => AskCoachContext): Omit<CoachQuestionResponse, 'answer' | 'limitations'> {
 const today = dayOfTimestamp(context.now) ?? localDate();
 const target = exerciseForQuestion(state, question, context);
 const stateEvidence = coachEvidenceFromState(state, today, target);
 const safety = safetyResponse({...context, context: {...stateEvidence.context, ...context.context}, plateaus: stateEvidence.plateaus}, stateEvidence.signals);
 if (safety) return safety;
 const intent = classifyCoachQuestion(question);
 const done = chronologicalCompleted(state.workouts);
 const base = coach({...context, context: {...stateEvidence.context, ...context.context}, plateaus: stateEvidence.plateaus, signals: stateEvidence.signals});
 const focus = () => buildAskCoachContext(state, today, {workout: context.workout, exercise: target});

 if (intent === 'recovery') {
  const recovery = stateEvidence.signals.recovery;
  if (recovery === 'missing') return {intent, text: 'APEX has no recent recovery check-in, so it cannot interpret today’s recovery context. Your deterministic prescription remains unchanged.', confidence: 'low', evidence: base.evidence, missing: ['Record sleep, soreness, fatigue, or readiness for today.']};
  return {intent, text: `Your recovery context is ${recovery}. ${base.explanation}`, confidence: base.decision.confidence, evidence: base.evidence};
 }
 if (intent === 'deload') {
  const r = ask().recovery;
  if (!r) return {intent, text: 'APEX cannot assess training load for this date.', confidence: 'low', evidence: base.evidence, missing: ['A valid date.']};
  const rules = `APEX recommends a deload only after training load has been high for two weeks in a row (fatigue level HIGH now and a week ago) with at least ${FATIGUE_RULES.recommendMinSessions} sessions in ${FATIGUE_RULES.recommendWindowDays} days. These are training-load rules, not a medical assessment.`;
  const byStatus: Record<string, string> = {
   deload_recommended: 'A deload is recommended now. You choose whether to start it; the next seven days then use lighter loads, one fewer set per exercise and a higher target RIR.',
   deload_active: `A deload week is in progress with ${plural(r.daysLeft ?? 0, 'day')} left. Normal progression resumes afterwards.`,
   recovery_complete: `Your deload is complete. Loads stay at your last normally worked weight for ${plural(r.daysLeft ?? 0, 'more day')}, then progression resumes.`,
   sustained_fatigue: 'Not yet. Training load is HIGH after an elevated week. If it is still high a week from now, APEX will recommend a deload.',
   temporary_fatigue: 'Not now. Training load is above your recent baseline, but one busy week is not a reason to deload.',
   normal: 'There is no deload signal right now.',
  };
  const items = [evidence('deload_status', `Training load status: ${r.status.replace(/_/g, ' ')}; fatigue level ${r.level} (${r.trend}).`), ...r.signals.reasons.map(x => evidence(`deload_${x}`, `Signal: ${x.replace(/_/g, ' ')}.`))];
  return {intent, text: `${byStatus[r.status]} ${rules}`, confidence: done.length >= 6 ? 'medium' : 'low', evidence: [...base.evidence, ...items],
   ...(done.length < 6 ? {missing: ['Several weeks of training history make the load signals more reliable.']} : {})};
 }
 if (intent === 'focus_today') {
  const a = ask();
  const b = a.briefing;
  if (!b) return {intent, text: 'APEX cannot build today’s briefing for this date.', confidence: 'low', evidence: base.evidence, missing: ['A valid date.']};
  const lines = a.workout?.exercises.slice(0, 3).map(d => `${d.name}${d.weight !== undefined ? ` ${d.weight} kg` : ''} (${d.action ?? d.outcome.toLowerCase()})`) ?? [];
  const text = `${b.nextStep.text} ${b.nextStep.reason}${lines.length ? ` Engine prescriptions for ${a.workout?.name}: ${lines.join('; ')}.` : ''} The prescription itself is unchanged.`;
  return {intent, text, confidence: b.status === 'insufficient_data' ? 'low' : 'medium', evidence: [...base.evidence, ...b.items.map(i => evidence(i.id, `${i.text} (${i.reason})`))],
   ...(b.limitations.length ? {missing: b.limitations} : {})};
 }
 if (intent === 'weekly_review') {
  const a = ask();
  const w = weeklyText(a);
  if (!w || done.length === 0) return {intent, text: 'APEX has no completed sessions to review yet.', confidence: 'low', evidence: base.evidence, missing: ['Complete a workout to see your week.']};
  const missing = a.weekly?.comparison.sessions.state === 'not_enough_data' ? ['Last week has no completed sessions, so there is nothing to compare with.'] : undefined;
  return {intent, text: w.text, confidence: done.length >= 2 ? 'medium' : 'low', evidence: [...base.evidence, ...w.items], ...(missing ? {missing} : {})};
 }
 if (intent === 'exercise_change') {
  if (!target) return {intent, text: 'APEX needs a current or named exercise to explain what changed.', confidence: 'low', evidence: base.evidence, missing: ['Name an exercise or open a workout with an active exercise.']};
  const e = focus().exercise;
  if (!e || !e.history.length) return {intent, text: `APEX has no completed working-set history for ${target.name}, so nothing has changed yet.`, confidence: 'low', evidence: base.evidence, missing: ['Completed comparable working sets.']};
  const last = e.history[e.history.length - 1];
  const rec = e.recommendation;
  const unit = loadUnit(e.exercise);
  const lastText = `${last.load !== undefined ? `${last.load} ${unit}` : 'bodyweight'} for ${last.topPerformance} ${e.exercise.loadSemantics === 'time' ? 'seconds' : 'reps'} on ${last.date}`;
  const nowText = rec.weight !== undefined && rec.weight > 0 ? `${rec.weight} ${unit}` : 'no external load';
  return {intent, text: `${target.name}: last time ${lastText}; the engine now prescribes ${nowText} (${rec.action ?? 'calibrate'}). ${rec.reason} APEX does not record why an exercise was swapped, so it can only explain the prescription.`, confidence: rec.confidence,
   evidence: [...base.evidence, evidence('exercise_last', `Last session: ${lastText}.`), evidence('exercise_now', `Current prescription: ${nowText} (${rec.action ?? 'calibrate'}).`)],
   missing: ['APEX does not track the reason an exercise was swapped.']};
 }
 if (intent === 'progression' || intent === 'exercise_performance') {
  if (!target) return {intent, text: 'APEX needs a current or named exercise to explain exercise-specific performance or progression.', confidence: 'low', evidence: base.evidence, missing: ['Name an exercise or open a workout with an active exercise.']};
  const rows = done.flatMap((workout) => workout.exercises.filter((entry) => entry.exerciseId === target.id));
  if (!rows.length) return {intent, text: `APEX has no completed working-set history for ${target.name} yet. Log comparable sets before asking for a progression explanation.`, confidence: 'low', evidence: base.evidence, missing: ['Completed comparable working sets.']};
  const result = personalizedLoad(target, state.workouts, state.profile, state.exercises, today, state.deloads);
  const weightLine = result.weight !== undefined && result.weight > 0 ? ` Today's prescribed load is ${result.weight} ${loadUnit(target)}.` : '';
  return {intent, text: `For ${target.name}, the deterministic engine currently says ${result.action}. ${result.reason}${weightLine} The Coach is explaining that result; it does not replace it.`, confidence: result.confidence, evidence: [...base.evidence, ...result.evidence.map((item, index) => evidence(`engine_${index}`, item, result.confidence))]};
 }
 if (intent === 'plateau') {
  const a = ask();
  const stalled = (a.weekly?.progression.exercises ?? []).filter(x => x.decision.outcome === 'PLATEAU' || x.decision.outcome === 'CONSIDER_VARIATION');
  const own = target ? a.exercise?.recommendation.longitudinal : undefined;
  if (own && (own.outcome === 'PLATEAU' || own.outcome === 'CONSIDER_VARIATION') && target) {
   const variation = own.variation ? state.exercises.find(x => x.id === own.variation?.exerciseId) : undefined;
   return {intent, text: `${target.name} has gone ${plural(own.state.consecutiveStalls, 'session')} without progress over ${own.state.stallSpanDays} days. ${own.explanation}${variation ? ` The exercise graph offers ${variation.name} as a ${own.variation?.kind} option; that is a suggestion, not a change.` : ''}`, confidence: own.state.consecutiveStalls >= 5 ? 'medium' : 'low', evidence: [...base.evidence, evidence('stall_state', `${plural(own.state.consecutiveStalls, 'stalled session')} over ${own.state.stallSpanDays} days (${own.reason}).`)]};
  }
  if (own && own.outcome === 'RECOVER' && own.state.consecutiveStalls >= 3 && target) return {intent, text: `${target.name} has stalled, but APEX is holding judgement while training load is high. ${own.explanation}`, confidence: 'low', evidence: base.evidence};
  if (stalled.length) return {intent, text: `APEX found stalled exercises this week: ${stalled.map(x => `${x.name} (${plural(x.decision.stalls, 'session')} without progress)`).join(', ')}. This is a review signal, not a plan change or diagnosis.`, confidence: 'medium', evidence: [...base.evidence, ...stalled.map(x => evidence(`stall_${x.exerciseId}`, `${x.name}: ${x.decision.reason.replace(/_/g, ' ')}.`))]};
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
  const weekly = weeklyText(ask());
  return {intent, text: `In the last 30 days, APEX recorded ${consistency.completed} completed session${consistency.completed === 1 ? '' : 's'} and ${load.workingSets30} working sets. ${momentum.detail}${weekly ? ` ${weekly.text}` : ''}`, confidence: done.length >= 2 ? 'medium' : 'low', evidence: [...base.evidence, evidence('history_summary', `${consistency.completed} completed sessions in 30 days.`), ...(weekly?.items ?? [])]};
 }
 if (intent === 'goal') {
  const goals = state.goals.filter((goal) => goal.status === 'active');
  if (!goals.length) return {intent, text: 'APEX has no active goal to interpret.', confidence: 'low', evidence: base.evidence, missing: ['Set an active training goal.']};
  const summaries = goals.map((goal) => { const progress = goalProgress(state, goal); return progress.percent === null ? goal.title : `${goal.title}: ${progress.percent}%`; });
  return {intent, text: `Active goal context: ${summaries.join('; ')}.`, confidence: 'medium', evidence: [...base.evidence, ...summaries.map((item, index) => evidence(`goal_${index}`, item))]};
 }
 return {intent: 'unsupported', text: 'APEX can answer grounded questions about today’s workout, an exercise, progression, plateau, recovery, history, consistency, goals, or return to training. It does not have enough supported context for that question.', confidence: 'low', evidence: base.evidence, missing: ['Ask about a supported APEX training context.']};
}

const NEXT_ACTION_INTENTS = new Set<CoachQuestionIntent>(['weekly_review', 'focus_today', 'deload', 'plateau', 'consistency', 'history', 'workout_status']);
const PRESCRIPTION_INTENTS = new Set<CoachQuestionIntent>(['progression', 'exercise_performance', 'exercise_change', 'plateau']);

/**
 * Deterministic question layer. It uses local APEX facts and never writes state or invents a prescription: loads and decisions are
 * quoted from the engines, and every answer carries its evidence, its limitations and (when relevant) a suggested next action.
 */
export function answerCoachQuestion(state: AppState, question: string, context: CoachContext): CoachQuestionResponse {
 const today = dayOfTimestamp(context.now) ?? localDate();
 let memo: AskCoachContext | undefined;
 const target = exerciseForQuestion(state, question, context);
 const ask = () => (memo ??= buildAskCoachContext(state, today, {workout: context.workout, exercise: target}));
 const r = core(state, question, context, ask);
 const response: CoachQuestionResponse = {...r, answer: r.text, limitations: [...(r.missing ?? [])]};
 if (r.intent !== 'safety') {
  if (PRESCRIPTION_INTENTS.has(r.intent) && !(r.missing && r.intent !== 'exercise_change' && r.intent !== 'plateau')) {
   const rx = target ? prescriptionOf(ask()) : undefined;
   if (rx && rx.exerciseId === target?.id && chronologicalCompleted(state.workouts).some(w => w.exercises.some(e => e.exerciseId === target.id))) response.prescription = rx;
  }
  if (NEXT_ACTION_INTENTS.has(r.intent)) {
   const step = ask().briefing?.nextStep;
   if (step) response.nextAction = {kind: step.kind, text: step.text};
  }
 }
 return response;
}
