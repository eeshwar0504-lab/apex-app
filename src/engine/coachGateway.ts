import type {AppState} from '../core/types';
import {buildCoachContext} from './intelligence';
import {answerCoachQuestion} from '../coach/askCoach';

export type CoachAnswer={text:string;facts:string[];inference?:string;recommendation?:string;uncertainty?:string};

export function groundedCoachAnswer(state:AppState,question:string):CoachAnswer{
  const answer=answerCoachQuestion(state,question,buildCoachContext(state,{userInput:question}));
  return {
    text:answer.text,
    facts:answer.evidence.map(item=>item.statement),
    inference:answer.safety,
    uncertainty:answer.missing?.join(' ')
  };
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
