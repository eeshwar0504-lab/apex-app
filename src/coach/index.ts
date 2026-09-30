export {
  coach,
  decide,
  evaluateObservation,
  applyUserOverride,
} from './coach';

export {runCoachDecision} from './decisionPipeline';
export {coachEvidenceFromState} from './signals';

export type {
  AdaptationScope,
  CandidateAction,
  CoachAction,
  CoachAdaptation,
  CoachConfidence,
  CoachContext,
  CoachContextSignals,
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