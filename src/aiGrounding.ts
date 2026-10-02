import type {AppState, Exercise} from './core/types';
import type {GroundedAIContext, GroundedCandidate, GroundedFact} from './aiContract';
import {AI_LIMITS} from './aiContract';
import {buildCoachContext} from './engine/intelligence';
import {answerCoachQuestion, exerciseForQuestion} from './coach/askCoach';
import {rankSubstitutes, variationOptions} from './engine/exerciseGraph';

/*
 * Grounding: turns ONE deterministic Coach answer into the minimal context a provider may see. The deterministic engine
 * and Coach have already decided everything; this module only describes the result. It reads state and never writes it, is
 * a pure function of (state, question, time), and sends nothing anywhere.
 */
const QUESTION_MAX = 500;
const FACTS_MAX = 8;
const ALTERNATIVES_MAX = 3;

const clip = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);

/** The person's name is identity, not training context: it never leaves the device inside a prompt. */
function redactName(value: string, name: string | undefined): string {
  const trimmed = (name || '').trim();
  if (trimmed.length < 2) return value;
  return value.split(trimmed).join('the user').split(trimmed.toLowerCase()).join('the user');
}

function candidatesFor(state: AppState, exercise: Exercise | undefined): GroundedCandidate[] {
  if (!exercise) return [];
  const equipment = state.profile?.equipment;
  const options = variationOptions(exercise, state.exercises, equipment);
  const out: GroundedCandidate[] = [
    {id: exercise.id, name: exercise.name, relation: 'current'},
    ...options.progressions.map(e => ({id: e.id, name: e.name, relation: 'harder_variation' as const})),
    ...options.regressions.map(e => ({id: e.id, name: e.name, relation: 'easier_variation' as const}))
  ];
  const taken = new Set(out.map(c => c.id));
  for (const item of rankSubstitutes(exercise, state.exercises, equipment && equipment.length ? equipment : undefined)) {
    if (!item.equivalent || taken.has(item.exercise.id)) continue;
    out.push({id: item.exercise.id, name: item.exercise.name, relation: 'alternative'});
    taken.add(item.exercise.id);
    if (out.filter(c => c.relation === 'alternative').length >= ALTERNATIVES_MAX) break;
  }
  return out;
}

/**
 * The grounded context for one question. Deterministic: the same state, question and clock give the same object, byte for
 * byte. `now` is the ISO instant used for the Coach, `today` the local calendar day.
 */
export function buildGroundedContext(state: AppState, question: string, now: string, today: string): GroundedAIContext {
  const asked = clip(question, QUESTION_MAX);
  const hide = (value: string) => redactName(value, state.profile?.name);
  const context = buildCoachContext(state, {userInput: asked, now});
  const answer = answerCoachQuestion(state, asked, context);
  const exercise = exerciseForQuestion(state, asked, context);

  const known: GroundedFact[] = [];
  const inferred: GroundedFact[] = [];
  const unknown: string[] = [];
  for (const item of answer.evidence) {
    if (item.id === 'e_user_input') continue; // the question is already part of the context
    const fact = {id: item.id, statement: clip(hide(item.statement), AI_LIMITS.claimMax)};
    if (item.state === 'known') known.push(fact);
    else if (item.state === 'unknown') unknown.push(fact.statement);
    else inferred.push(fact);
  }
  inferred.push({id: 'coach_confidence', statement: `The Coach rates its confidence in this answer as ${answer.confidence}.`});
  if (answer.safety) inferred.push({id: 'coach_safety', statement: clip(hide(answer.safety), AI_LIMITS.claimMax)});
  for (const missing of answer.missing || []) unknown.push(clip(hide(missing), AI_LIMITS.claimMax));
  const unique = (list: GroundedFact[]) => list.filter((fact, index) => list.findIndex(other => other.id === fact.id) === index).slice(0, FACTS_MAX);

  return {
    version: 1,
    date: today,
    question: hide(asked),
    intent: answer.intent,
    known: unique(known),
    inferred: unique(inferred),
    unknown: [...new Set(unknown)].slice(0, FACTS_MAX),
    deterministicAnswer: clip(hide(answer.text), AI_LIMITS.responseMax),
    confidence: answer.confidence,
    safetyGated: answer.intent === 'safety' || Boolean(answer.safety),
    ...(exercise ? {exercise: {id: exercise.id, name: exercise.name, loadSemantics: exercise.loadSemantics, pattern: exercise.pattern}} : {}),
    candidates: candidatesFor(state, exercise)
  };
}

export const OUTPUT_CONTRACT = 'Reply with one JSON object and nothing else: {"response": string, "groundedClaims": [{"claim": string, "factIds": [string]}], "uncertainties": [string], "requestedClarification": string (optional)}. Every grounded claim must cite fact ids from KNOWN or INFERRED. No other fields.';

export const RULES = [
  'You are the optional explanation layer of APEX. The deterministic APEX training engine and Coach are authoritative; you only explain what they already decided.',
  'Use only the KNOWN, INFERRED and UNKNOWN information below. Never invent workouts, dates, measurements, recovery data, exercise properties or numbers.',
  'Treat KNOWN as fact, INFERRED as the Coach\'s interpretation (say "the Coach reads this as"), and UNKNOWN as missing: say it is unknown and ask for it if it matters.',
  'Never state or change a load, set count, rep count or rest time. Never tell the person to change their plan. You may restate numbers that appear below.',
  'Only mention exercises listed under CANDIDATES. Never say an exercise is medically safe or unsafe. Do not diagnose.',
  'If anything is missing or the answer is uncertain, say so plainly. Keep the answer short.'
].join('\n');

/** The provider-neutral prompt. Adapters wrap it in their own wire format; they do not change its content. */
export function renderPrompt(context: GroundedAIContext): {system: string; user: string} {
  const lines = (title: string, items: string[]) => `${title}:\n${items.length ? items.map(item => `- ${item}`).join('\n') : '- (none)'}`;
  const system = [
    RULES,
    `DATE: ${context.date}`,
    `TOPIC: ${context.intent}`,
    lines('KNOWN (deterministic facts)', context.known.map(f => `[${f.id}] ${f.statement}`)),
    lines('INFERRED (the Coach\'s interpretation)', context.inferred.map(f => `[${f.id}] ${f.statement}`)),
    lines('UNKNOWN (missing information)', context.unknown),
    lines('CANDIDATES (the only exercises you may mention)', context.candidates.map(c => `${c.name} (${c.relation.replace(/_/g, ' ')})`)),
    `COACH ANSWER TO EXPLAIN: ${context.deterministicAnswer}`,
    `COACH CONFIDENCE: ${context.confidence}${context.safetyGated ? ' (safety gate active: do not downplay it)' : ''}`,
    OUTPUT_CONTRACT
  ].join('\n\n');
  return {system, user: context.question};
}
