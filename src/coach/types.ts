import type {
  AppState,
  Exercise,
  Goal,
  GoalKind,
  LoadDetail,
  LoadSemantics,
  SetLog,
  UserProfile,
  Workout,
  WorkoutExercise,
} from '../core/types';

/** Confidence used by the APEX coaching system when making a decision. */
export type CoachConfidence =
  | 'high'
  | 'medium'
  | 'low';

/** Epistemic status of an important coaching input or conclusion. */
export type KnowledgeConfidence =
  | 'established'
  | 'strong_context_dependent'
  | 'reasonable'
  | 'limited_emerging'
  | 'uncertain'
  | 'coaching_convention'
  | 'unsupported';

/** What APEX believes about the state of a piece of information. */
export type EvidenceState =
  | 'known'
  | 'probable'
  | 'plausible'
  | 'unknown'
  | 'conflicted';

/** The conceptual scope at which an adaptation may be applied. */
export type AdaptationScope =
  | 'set'
  | 'exercise'
  | 'session'
  | 'workout'
  | 'week'
  | 'phase'
  | 'program';

/** Conceptual action vocabulary of the APEX Coach. */
export type CoachAction =
  | 'prescribe'
  | 'continue'
  | 'modify'
  | 'progress'
  | 'regress'
  | 'repeat'
  | 'rest'
  | 'substitute'
  | 'skip'
  | 'pause'
  | 'stop'
  | 'ask'
  | 'review'
  | 'replan'
  | 'complete'
  | 'refer';

/** Safety state before normal training optimization is considered. */
export type SafetyStatus =
  | 'clear'
  | 'caution'
  | 'stop'
  | 'refer';

/** Quality classification for an observation/evidence item. */
export type DataQuality =
  | 'high'
  | 'medium'
  | 'low'
  | 'missing'
  | 'conflicted';

/** Signal classification used to prevent overreacting to noisy data. */
export type EvidencePattern =
  | 'signal'
  | 'noise'
  | 'confounder'
  | 'missing'
  | 'measurement_error';

/** The stage of the conceptual APEX decision pipeline. */
export type DecisionGate =
  | 'safety'
  | 'objective'
  | 'context'
  | 'constraints'
  | 'evidence'
  | 'data_quality'
  | 'conflicts'
  | 'confidence'
  | 'candidate_actions'
  | 'consequences'
  | 'decision'
  | 'prescription'
  | 'observation'
  | 'evaluation'
  | 'adaptation';

/**
 * The smallest useful description of the user's current coaching context.
 * This is deliberately independent of React/UI state.
 */
export interface CoachContext {
  state: AppState;

  profile?: UserProfile;
  goals: Goal[];
  primaryGoal?: GoalKind;

  planId?: string;
  workoutId?: string;
  workout?: Workout;

  exerciseId?: string;
  exercise?: Exercise;
  workoutExercise?: WorkoutExercise;

  setId?: string;
  set?: SetLog;

  /** Relevant recent workout IDs, newest first. */
  recentWorkoutIds: string[];

  /** Relevant recent exercise-entry IDs, newest first. */
  recentExerciseEntryIds: string[];

  /** Context supplied directly by the user for this decision. */
  userInput?: string;

  /** Explicit contextual observations supplied by the application/user. */
  context?: CoachContextSignals;

  /** Deterministic plateau signals (analytics.plateauCandidates). Evidence only; never a prescription change. */
  plateaus?: PlateauSignal[];

  /** Current timestamp used for deterministic decision evaluation. */
  now: string;
}

/**
 * Noisy contextual signals. They are evidence, not automatic prescriptions.
 */
/** A deterministic plateau signal: comparable sessions with no change in completed-rep output. */
export interface PlateauSignal {
  exerciseId: string;
  exerciseName: string;
  sessions: number;
  detail: string;
}

export interface CoachContextSignals {
  sleepHours?: number;
  sleepQuality?: number;
  fatigue?: number;
  stress?: number;
  soreness?: number;
  motivation?: number;
  readiness?: number;
  pain?: boolean;
  discomfort?: boolean;
  equipmentAvailable?: string[];
  equipmentUnavailable?: string[];
  timeAvailableMin?: number;
  scheduleChanged?: boolean;
  recentIllness?: boolean;
  nutritionConcern?: boolean;
  hydrationConcern?: boolean;
  note?: string;
}

/** A single piece of evidence considered by the coach. */
export interface CoachEvidence {
  id: string;
  statement: string;
  source:
    | 'user'
    | 'history'
    | 'current_session'
    | 'profile'
    | 'program'
    | 'knowledge'
    | 'system';
  state: EvidenceState;
  quality: DataQuality;
  pattern: EvidencePattern;
  confidence: CoachConfidence;
  timestamp?: string;
  references?: string[];
}

/** Safety gate result. Safety always precedes normal optimization. */
export interface SafetyAssessment {
  status: SafetyStatus;
  reason: string;
  evidence: CoachEvidence[];
  recommendedAction?: CoachAction;
  requiresProfessionalEvaluation?: boolean;
}

/** The training objective being protected by the decision. */
export interface CoachingObjective {
  primary: GoalKind | string;
  secondary: GoalKind[] | string[];
  description: string;
  priority: number;
}

/** A possible action considered before the final decision. */
export interface CandidateAction {
  id: string;
  action: CoachAction;
  title: string;
  description: string;
  objectiveFit: number;
  sustainabilityFit: number;
  recoveryFit: number;
  adherenceFit: number;
  preferenceFit: number;
  safetyStatus: SafetyStatus;
  reversibility: 'easy' | 'moderate' | 'structural';
  consequences: string[];
  evidence: CoachEvidence[];
}

/** Consequences associated with a candidate or selected action. */
export interface CoachingConsequence {
  scope: AdaptationScope;
  description: string;
  severity: 'none' | 'low' | 'moderate' | 'high';
  reversible: boolean;
  requiresUserInvolvement: boolean;
}

/**
 * The actual prescription delivered by the coach.
 * Fields remain optional because not every coaching action is a set prescription.
 */
export interface CoachPrescription {
  action: CoachAction;
  exerciseId?: string;
  setId?: string;

  weight?: number;
  minWeight?: number;
  maxWeight?: number;
  loadSemantics?: LoadSemantics;
  loadDetail?: LoadDetail;

  repsMin?: number;
  repsMax?: number;
  targetRir?: number;
  targetSeconds?: number;
  restSec?: number;

  sets?: number;
  exerciseOrder?: number;

  /** Human-readable instruction suitable for the UI. */
  instruction: string;

  /** Why the prescription is being made. */
  reason: string;
}

/** A decision made by the coach at a particular point in time. */
export interface CoachDecision {
  id: string;
  timestamp: string;

  gate: DecisionGate;
  action: CoachAction;

  objective: CoachingObjective;
  safety: SafetyAssessment;

  evidence: CoachEvidence[];
  candidates: CandidateAction[];
  selectedCandidateId?: string;
  consequences: CoachingConsequence[];

  prescription?: CoachPrescription;

  confidence: CoachConfidence;
  confidenceReason: string;

  /** User-facing explanation of the selected decision. */
  reason: string;

  /** What APEX should observe after this decision. */
  followUp?: CoachObservationRequest;

  /** Scope of any adaptation caused by this decision. */
  adaptationScope?: AdaptationScope;

  /** True when user confirmation is required before execution. */
  requiresUserConfirmation: boolean;
}

/** What the coach wants to observe after making a decision. */
export interface CoachObservationRequest {
  id: string;
  observe: string[];
  successCriteria?: string[];
  failureCriteria?: string[];
  nextEvaluation: 'after_set' | 'after_exercise' | 'after_workout' | 'later';
}

/** Result of evaluating what actually happened after a prescription. */
export interface CoachEvaluation {
  id: string;
  timestamp: string;
  decisionId?: string;

  outcome:
    | 'as_expected'
    | 'better_than_expected'
    | 'worse_than_expected'
    | 'inconclusive'
    | 'unsafe';

  evidence: CoachEvidence[];
  interpretation: string;
  confidence: CoachConfidence;
  recommendedAdaptation?: CoachAdaptation;
}

/** A change the coach proposes after evaluating observed reality. */
export interface CoachAdaptation {
  id: string;
  timestamp: string;
  scope: AdaptationScope;
  action: CoachAction;
  reason: string;
  evidence: CoachEvidence[];
  confidence: CoachConfidence;
  changes: string[];
  requiresUserConfirmation: boolean;
}

/** Full result returned by the headless coach for one decision request. */
export interface CoachResult {
  decision: CoachDecision;
  evaluation?: CoachEvaluation;
  adaptation?: CoachAdaptation;

  /** The next user-facing action. */
  nextAction: CoachPrescription | CoachAction;

  /** Optional concise explanation for conversational surfaces. */
  explanation: string;

  /** Evidence retained for audit/debugging. */
  evidence: CoachEvidence[];
}

/**
 * Explicit decision request. Keeping this separate from CoachContext allows
 * future coach calls that do not require an active exercise/set.
 */
export interface CoachDecisionRequest {
  context: CoachContext;
  requestedGate?: DecisionGate;
  requestedAction?: CoachAction;
}
