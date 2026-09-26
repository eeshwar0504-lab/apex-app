import type {
  CoachAction,
  CoachAdaptation,
  CoachContext,
  CoachDecision,
  CoachDecisionRequest,
  CoachEvaluation,
  CoachEvidence,
  CoachObservationRequest,
  CoachResult,
  CoachPrescription,
  AdaptationScope,
} from './types';
import { runCoachDecision } from './decisionPipeline';

const id = (prefix: string, timestamp: string): string =>
  `${prefix}_${timestamp.replace(/[^0-9A-Z]/gi, '')}`;

function buildObservation(
  decision: CoachDecision,
): CoachObservationRequest | undefined {
  const action = decision.action;

  if (
    action === 'stop' ||
    action === 'refer' ||
    action === 'ask' ||
    action === 'pause'
  ) {
    return undefined;
  }

  return {
    id: id('obs', decision.timestamp),
    observe: [
      'Whether the prescribed action was completed as intended.',
      'Actual performance, effort, symptoms, and contextual feedback.',
    ],
    successCriteria: [
      'The user can complete the prescribed action safely and as intended.',
      'Observed performance is sufficiently interpretable for the next coaching decision.',
    ],
    failureCriteria: [
      'The user cannot complete the action as intended.',
      'A safety concern emerges.',
      'The observed result is materially different from the expected result.',
    ],
    nextEvaluation:
      decision.prescription?.setId
        ? 'after_set'
        : decision.prescription?.exerciseId
          ? 'after_exercise'
          : 'after_workout',
  };
}

function withObservation(decision: CoachDecision): CoachDecision {
  const followUp = buildObservation(decision);

  if (!followUp) {
    return decision;
  }

  return {
    ...decision,
    followUp,
    adaptationScope: decision.action === 'continue' ? 'set' : undefined,
  };
}

export function decide(request: CoachDecisionRequest): CoachResult {
  const result = runCoachDecision(request);

  return {
    ...result,
    decision: withObservation(result.decision),
  };
}

export function coach(
  context: CoachContext,
  requestedAction?: CoachAction,
): CoachResult {
  return decide({
    context,
    requestedAction,
  });
}

export interface CoachObservationInput {
  context: CoachContext;
  decision?: CoachDecision;
  observation: CoachEvidence[];
  outcome?: CoachEvaluation['outcome'];
  interpretation?: string;
}

function inferOutcome(input: CoachObservationInput): CoachEvaluation['outcome'] {
  if (input.outcome) {
    return input.outcome;
  }

  const hasUnsafe = input.observation.some(
    (item) =>
      item.state === 'conflicted' ||
      item.pattern === 'signal' &&
        /pain|unsafe|injury|sharp|dizzy|faint/i.test(item.statement),
  );

  if (hasUnsafe) {
    return 'unsafe';
  }

  if (input.observation.length === 0) {
    return 'inconclusive';
  }

  const hasLowQuality = input.observation.some(
    (item) => item.quality === 'low' || item.quality === 'missing',
  );

  return hasLowQuality ? 'inconclusive' : 'as_expected';
}

function buildAdaptation(
  input: CoachObservationInput,
  evaluation: CoachEvaluation,
): CoachAdaptation | undefined {
  if (evaluation.outcome === 'unsafe') {
    return {
      id: id('adapt', evaluation.timestamp),
      timestamp: evaluation.timestamp,
      scope: 'set',
      action: 'stop',
      reason: 'The observed outcome contains a safety concern, so normal progression should not continue.',
      evidence: input.observation,
      confidence: evaluation.confidence,
      changes: ['Stop the current training action and reassess the relevant context.'],
      requiresUserConfirmation: true,
    };
  }

  if (evaluation.outcome === 'inconclusive') {
    return {
      id: id('adapt', evaluation.timestamp),
      timestamp: evaluation.timestamp,
      scope: 'set',
      action: 'review',
      reason: 'The observed evidence is insufficient to justify a consequential training change.',
      evidence: input.observation,
      confidence: 'low',
      changes: ['Collect clearer evidence before changing the training prescription.'],
      requiresUserConfirmation: false,
    };
  }

  if (evaluation.outcome === 'worse_than_expected') {
    return {
      id: id('adapt', evaluation.timestamp),
      timestamp: evaluation.timestamp,
      scope: 'set',
      action: 'modify',
      reason: 'Observed performance was worse than expected, so the smallest appropriate adjustment should be considered before broader restructuring.',
      evidence: input.observation,
      confidence: evaluation.confidence,
      changes: ['Modify the next appropriate training exposure conservatively.'],
      requiresUserConfirmation: false,
    };
  }

  if (evaluation.outcome === 'better_than_expected') {
    return {
      id: id('adapt', evaluation.timestamp),
      timestamp: evaluation.timestamp,
      scope: 'set',
      action: 'continue',
      reason: 'Observed performance was better than expected; one better outcome is not sufficient evidence for a structural program change.',
      evidence: input.observation,
      confidence: evaluation.confidence,
      changes: ['Continue collecting comparable evidence before making a larger progression decision.'],
      requiresUserConfirmation: false,
    };
  }

  return undefined;
}

export function evaluateObservation(
  input: CoachObservationInput,
): CoachResult {
  const timestamp = input.context.now;
  const outcome = inferOutcome(input);

  const confidence =
    outcome === 'unsafe'
      ? 'high'
      : outcome === 'inconclusive'
        ? 'low'
        : input.observation.every((item) => item.quality === 'high')
          ? 'high'
          : 'medium';

  const evaluation: CoachEvaluation = {
    id: id('eval', timestamp),
    timestamp,
    decisionId: input.decision?.id,
    outcome,
    evidence: input.observation,
    interpretation:
      input.interpretation ||
      (outcome === 'as_expected'
        ? 'Observed reality is consistent with the current prescription.'
        : outcome === 'better_than_expected'
          ? 'Observed reality was better than expected, but this single observation does not establish a need for structural progression.'
          : outcome === 'worse_than_expected'
            ? 'Observed reality was worse than expected and should inform the next smallest appropriate adjustment.'
            : outcome === 'unsafe'
              ? 'Observed reality contains a safety concern and normal optimization should not continue.'
              : 'The available observation is not sufficiently interpretable for a consequential training change.'),
    confidence,
  };

  const adaptation = buildAdaptation(input, evaluation);
  evaluation.recommendedAdaptation = adaptation;

  const nextAction: CoachPrescription | CoachAction = adaptation
    ? {
        action: adaptation.action,
        instruction: adaptation.changes[0] || adaptation.reason,
        reason: adaptation.reason,
      }
    : {
        action: 'continue',
        exerciseId: input.context.exerciseId,
        setId: input.context.setId,
        instruction: 'Continue collecting comparable evidence before making a consequential change.',
        reason: 'The current observation does not justify a larger adaptation.',
      };

  return {
    decision:
      input.decision || decide({ context: input.context }).decision,
    evaluation,
    adaptation,
    nextAction,
    explanation: evaluation.interpretation,
    evidence: input.observation,
  };
}

export function applyUserOverride(
  result: CoachResult,
  action: CoachAction,
  instruction?: string,
): CoachResult {
  const original = result.decision;

  const prescription: CoachPrescription = {
    ...(original.prescription || {}),
    action,
    exerciseId: original.prescription?.exerciseId,
    setId: original.prescription?.setId,
    instruction:
      instruction ||
      `User selected ${action}; continue from the user's actual training choice.`,
    reason: 'User override recorded separately from the coach recommendation.',
  };

  return {
    ...result,
    decision: {
      ...original,
      action,
      prescription,
      requiresUserConfirmation: false,
      reason: 'User override recorded separately from the coach recommendation.',
    },
    nextAction: prescription,
    explanation: prescription.instruction,
  };
}

export type { AdaptationScope };
