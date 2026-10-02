export {
  coach,
  decide,
  evaluateObservation,
  applyUserOverride,
} from './coach';

export {runCoachDecision} from './decisionPipeline';
export {coachEvidenceFromState} from './signals';
export {answerCoachQuestion, classifyCoachQuestion} from './askCoach';

export type {
  AdaptationScope,
  CandidateAction,
  CoachAction,
  CoachAdaptation,
  CoachConfidence,
  CoachContext,
  CoachContextSignals,
  CoachStateSignals,
  CoachDecision,
  CoachDecisionRequest,
  CoachEvaluation,
  CoachEvidence,
  CoachObservationRequest,
  CoachPrescription,
  CoachResult,
  CoachingConsequence,
  CoachingObjective,
  DataQuality,
  DecisionGate,
  EvidencePattern,
  EvidenceState,
  KnowledgeConfidence,
  PlateauSignal,
  SafetyAssessment,
  SafetyStatus,
} from './types';
