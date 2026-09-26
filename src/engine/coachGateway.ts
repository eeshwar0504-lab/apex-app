import type {AppState, Exercise} from '../core/types';
import {readiness,trainingLoadSummary,goalProgress} from './intelligence';
import {progression,summarizeSets} from './training';

export type CoachAnswer={text:string;facts:string[];inference?:string;recommendation?:string;uncertainty?:string};

export function groundedCoachAnswer(state:AppState,question:string):CoachAnswer{
  const q=question.toLowerCase();
  const done=state.workouts.filter(w=>w.status==='completed');
  const load=trainingLoadSummary(state);
  const r=readiness(state);
  if(q.includes('rir')){
    return {text:'RIR means reps in reserve: your estimate of how many clean reps remained at the end of a set.',facts:['RIR is optional in APEX.','It is interpreted alongside actual reps, load, set type and context.'],uncertainty:'RIR is a subjective estimate, so APEX does not treat it as a precise physiological measurement.'};
  }
  if(q.includes('progress')||q.includes('increase')||q.includes('weight')){
    const candidate=state.exercises.find(e=>q.includes(e.name.toLowerCase()));
    if(candidate){
      const hist=done.flatMap(w=>w.exercises.filter(x=>x.exerciseId===candidate.id));
      const sets=hist.flatMap(x=>x.sets);
      const p=progression(candidate,sets);
      return {text:`For ${candidate.name}, the current deterministic engine suggests ${p.action}.`,facts:[`${hist.length} logged exercise appearances.`,`Recommended range: ${p.nextRepRange[0]}–${p.nextRepRange[1]} reps.`,p.reason],recommendation:p.weight!==undefined?`Next load: ${p.weight} ${candidate.loadSemantics==='per_hand'?'kg/hand':'kg'}.`:undefined,uncertainty:p.confidence==='low'?'There is not enough comparable history yet.':undefined};
    }
    return {text:`APEX has ${done.length} completed sessions to use as training evidence.`,facts:[`${load.consistency30} completed sessions in the last 30 days.`,`${load.workingSets30} working sets in the last 30 days.`],inference:'Progression is determined per exercise from comparable performance rather than from a global score.'};
  }
  if(q.includes('recovery')||q.includes('fatigue')||q.includes('ready')){
    return {text:`Current training context is ${r.label}.`,facts:[r.detail,`${done.length} completed sessions are available locally.`],uncertainty:'This is a training-context signal, not a medical or physiological diagnosis.'};
  }
  if(q.includes('goal')){
    const goals=state.goals.filter(g=>g.status==='active').map(g=>{const p=goalProgress(state,g);return `${g.title}: ${p.percent}%`;});
    return {text:goals.length?`You have ${goals.length} active goal${goals.length===1?'':'s'}.`:'You have no active goals yet.',facts:goals};
  }
  if(q.includes('observation')){
    return {text:`APEX currently has ${state.observations.length} stored personal observations.`,facts:state.observations.filter(o=>o.status==='active').slice(-5).map(o=>o.statement),uncertainty:'Observations expire when their evidence is no longer relevant.'};
  }
  return {text:'I can explain the evidence APEX currently has, but I will not invent an answer when the local record is insufficient.',facts:[`${done.length} completed sessions`,`${state.exercises.length} canonical exercises`,`${state.achievements.length} achievements`],uncertainty:'Ask about progression, RIR, recovery, goals, observations, or a specific exercise.'};
}


/**
 * Headless APEX Coach Core integration.
 * The existing groundedCoachAnswer() remains the compatibility/conversational
 * surface; these functions expose the new deterministic coach boundary.
 */
import {
  coach,
  decide,
  evaluateObservation,
  applyUserOverride,
} from '../coach';
import type {
  CoachAction,
  CoachContext,
  CoachDecision,
  CoachDecisionRequest,
  CoachEvidence,
  CoachEvaluation,
  CoachResult,
} from '../coach';

export function coachDecision(
  context: CoachContext,
  requestedAction?: CoachAction,
): CoachResult {
  return coach(context, requestedAction);
}

export function runCoachDecision(
  request: CoachDecisionRequest,
): CoachResult {
  return decide(request);
}

export function evaluateCoachObservation(input: {
  context: CoachContext;
  decision?: CoachDecision;
  observation: CoachEvidence[];
  outcome?: CoachEvaluation['outcome'];
  interpretation?: string;
}): CoachResult {
  return evaluateObservation(input);
}

export function overrideCoachDecision(
  result: CoachResult,
  action: CoachAction,
  instruction?: string,
): CoachResult {
  return applyUserOverride(result, action, instruction);
}
