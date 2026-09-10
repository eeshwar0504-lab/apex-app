export type GoalKind =
  | 'strength'
  | 'hypertrophy'
  | 'fat_loss'
  | 'fitness'
  | 'general';

export type Experience =
  | 'beginner'
  | 'intermediate'
  | 'advanced';

export type SetType =
  | 'warmup'
  | 'working'
  | 'drop'
  | 'failure'
  | 'amrap'
  | 'rest_pause'
  | 'myo_reps'
  | 'tempo'
  | 'cluster'
  | 'timed'
  | 'bodyweight'
  | 'assisted'
  | 'unilateral';

export type LoadSemantics =
  | 'per_hand'
  | 'total'
  | 'stack'
  | 'assistance'
  | 'bodyweight'
  | 'time'
  | 'none';

/**
 * Runtime representation of how an exercise's external load is measured.
 *
 * The numeric `weight` field remains the canonical progression value.
 * This optional detail makes the UI and history explicit about what
 * that number means.
 */
export type LoadDetailKind =
  | 'dumbbell'
  | 'barbell'
  | 'machine_stack'
  | 'cable_stack'
  | 'assistance'
  | 'bodyweight'
  | 'timed'
  | 'none';

export interface LoadDetail {
  kind: LoadDetailKind;
  perHandKg?: number;
  totalKg?: number;
  barWeightKg?: number;
  plateLoadKg?: number;
  stackKg?: number;
  assistanceKg?: number;
}

export type PlanMode =
  | 'finite'
  | 'target_date'
  | 'continuous';

export type WorkoutStatus =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'missed'
  | 'rescheduled'
  | 'extra';

export type Side =
  | 'left'
  | 'right'
  | 'both';

/**
 * High-level state of a guided workout session.
 */
export type GuidedSessionPhase =
  | 'prep'
  | 'equipment'
  | 'ready'
  | 'set_ready'
  | 'set_active'
  | 'feedback'
  | 'rest'
  | 'exercise_complete'
  | 'complete';

/**
 * Why a set was not performed normally.
 */
export type SetDisposition =
  | 'completed'
  | 'skipped'
  | 'replaced'
  | 'not_started';

/**
 * Session-level calibration state.
 */
export type CalibrationState =
  | 'not_needed'
  | 'pending'
  | 'estimating'
  | 'calibrating'
  | 'established';

/**
 * Rest timer state.
 */
export type RestState = {
  active: boolean;
  startedAt?: string;
  targetSec: number;
  elapsedSec?: number;
  completedAt?: string;
  skipped?: boolean;
};

/**
 * Feedback captured after a set/exercise.
 */
export interface SetFeedback {
  rir?: number;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  pain?: boolean;
  discomfort?: boolean;
  note?: string;
  timestamp: string;
}

/**
 * Runtime load recommendation for the current exercise/set.
 *
 * `kind` describes how the recommendation was established.
 * `source` describes the evidence/source behind it.
 *
 * This is session guidance and does not automatically mutate the
 * underlying workout prescription.
 */
export interface LoadRecommendation {
  weight?: number;
  minWeight?: number;
  maxWeight?: number;

  confidence:
    | 'low'
    | 'medium'
    | 'high';

  kind?:
    | 'baseline'
    | 'comparable_estimate'
    | 'calibration'
    | 'user_adjustment';

  source:
    | 'exercise_estimate'
    | 'exercise_history'
    | 'recent_performance'
    | 'progression'
    | 'user_adjustment'
    | 'none';

  reason?: string;

  loadSemantics?: LoadSemantics;
  loadDetail?: LoadDetail;
  incrementKg?: number;

  generatedAt: string;
}

/**
 * Equipment verification state for today's session.
 */
export type SessionEquipmentStatus =
  | 'profile_available'
  | 'confirmed'
  | 'unavailable';

/**
 * Complete runtime state of the currently guided workout.
 *
 * These core fields remain required because active-session recovery
 * depends on them being persisted.
 */
export interface GuidedSessionState {
  phase: GuidedSessionPhase;

  /** Index of the exercise currently in focus. */
  exerciseIndex: number;

  /** Index of the set currently in focus. */
  setIndex: number;

  /** IDs of sets completed during this session. */
  completedSetIds: string[];

  /** IDs of sets explicitly skipped during this session. */
  skippedSetIds: string[];

  /** Exercise IDs explicitly skipped during this session. */
  skippedExerciseIds: string[];

  /** Runtime substitutions made during this session only. */
  substitutions?: Record<string, string>;

  /** Current working loads selected during this session. */
  workingLoads?: Record<string, number>;

  /** Current load recommendations. */
  recommendations?: Record<string, LoadRecommendation>;

  /** Equipment state for the current session. */
  sessionEquipment?: Record<
    string,
    SessionEquipmentStatus
  >;

  /** Feedback captured for individual sets. */
  setFeedback?: Record<string, SetFeedback>;

  /** Current rest timer state, if any. */
  rest?: RestState;

  /** Whether the current exercise/load is still being calibrated. */
  calibration?: Record<string, CalibrationState>;

  /** Session start timestamp. */
  startedAt?: string;

  /** Timestamp when the session was last paused. */
  pausedAt?: string;

  /** Total accumulated paused time in seconds. */
  pausedTotalSec: number;

  /** Timestamp when the current guided state was last persisted. */
  updatedAt: string;

  /** Why the current session is paused. */
  pauseReason?:
    | 'user'
    | 'background';

  /** Most recent lifecycle/background checkpoint. */
  lastCheckpointAt?: string;

  /** Monotonic session-state version. */
  version: number;
}

export interface UserProfile {
  id: string;
  name: string;

  experience: Experience;

  goals: GoalKind[];
  primaryGoal: GoalKind;

  trainingDays: number;
  sessionMinutes: number;
  equipment: string[];

  body: {
    weightKg?: number;
    heightCm?: number;
  };

  /**
   * User-configured real load increments.
   *
   * Key may be an exercise ID or equipment identifier.
   */
  loadIncrementsKg?: Record<
    string,
    number[]
  >;

  /**
   * Optional known barbell weight.
   */
  barbellBarKg?: number;

  createdAt: string;
}

export interface Goal {
  id: string;
  kind: GoalKind;
  title: string;
  priority: number;

  target?: {
    label: string;
    value: number;
    unit: string;
  };

  targetDate?: string;

  periodId: string;

  status:
    | 'active'
    | 'achieved'
    | 'paused';
}

export interface Exercise {
  id: string;
  name: string;

  aliases: string[];

  family: string;
  pattern: string;

  primaryMuscles: string[];
  secondaryMuscles: string[];

  equipment: string[];

  difficulty: Experience;
  unilateral: boolean;
  loadSemantics: LoadSemantics;

  incrementKg: number;

  repRange: [number, number];
  restSec: number;

  cues: string[];
  setup: string[];
  steps: string[];
  breathing: string;

  tempo?: string;

  mistakes: string[];
  safety: string[];
  alternatives: string[];

  progressions?: string[];
  regressions?: string[];
  contraindicationNotes?: string[];

  loadDescription?: string;

  /**
   * Target duration range for timed exercises, in seconds.
   */
  durationRangeSec?: [number, number];
}

export interface SetLog {
  id: string;
  type: SetType;

  /**
   * Canonical progression/load value.
   */
  weight?: number;

  /**
   * Explicit representation of what `weight` means.
   */
  loadDetail?: LoadDetail;

  reps?: number;
  seconds?: number;

  rir?: number;

  side?: Side;

  completed: boolean;

  /**
   * More precise state than `completed === false`.
   */
  disposition?: SetDisposition;

  note?: string;
  timestamp?: string;

  /**
   * Legacy/runtime assistance value.
   */
  assistance?: number;

  tempo?: string;
}

export interface WorkoutExercise {
  exerciseId: string;

  sets: SetLog[];

  prescribedSets: number;

  repRange: [number, number];

  /**
   * Target duration range for timed exercises.
   */
  durationRangeSec?: [number, number];

  /**
   * Recommended working load.
   */
  recommendedWeight?: number;

  /**
   * Explicit semantics for the recommended load.
   */
  recommendedLoadDetail?: LoadDetail;

  restSec: number;

  order: number;

  note?: string;

  originalPlanVersion?: number;
  currentPlanVersion?: number;

  /**
   * If this exercise replaced another exercise,
   * retain the original exercise identity.
   */
  baselineExerciseId?: string;

  status?:
    | 'planned'
    | 'completed'
    | 'skipped'
    | 'replaced';

  replacementFrom?: string;

  /**
   * Why a session-only substitution occurred.
   */
  replacementReason?: string;
}

export interface Workout {
  id: string;

  planId: string;

  name: string;

  scheduledDate: string;

  status: WorkoutStatus;

  startedAt?: string;
  completedAt?: string;

  exercises: WorkoutExercise[];

  notes?: string;

  originalPlanVersion?: number;
  currentPlanVersion?: number;

  source:
    | 'scheduled'
    | 'custom'
    | 'extra';

  /**
   * Legacy/runtime pause fields.
   *
   * GuidedSessionState is the source of truth for active
   * guided-session behavior.
   */
  pausedAt?: string;
  pausedTotalSec?: number;

  pauseReason?:
    | 'user'
    | 'background';

  /**
   * Persisted guided-session state.
   */
  guidedSession?: GuidedSessionState & {
    workingLoads?: Record<string, number>;

    sessionEquipment?: Record<
      string,
      SessionEquipmentStatus
    >;
  };

  /**
   * Lightweight workout-local event history.
   *
   * This is intentionally separate from the global AppState event log.
   */
  eventLog?: {
    id: string;
    type: string;
    timestamp: string;
    payload?: Record<string, unknown>;
  }[];

  version: number;

  updatedAt: string;
}

export interface WorkoutTemplate {
  id: string;

  name: string;

  description?: string;

  exerciseIds: string[];

  createdAt: string;
  updatedAt: string;
}

export interface PlanDay {
  id: string;

  dayIndex: number;

  label: string;

  workoutId?: string;

  rest: boolean;
}

export interface Plan {
  id: string;

  name: string;

  mode: PlanMode;

  weeks?: number;

  targetDate?: string;

  days: PlanDay[];

  version: number;

  createdAt: string;
  updatedAt: string;

  /**
   * Immutable plan history.
   */
  history?: {
    version: number;
    createdAt: string;
    reason: string;
    days: PlanDay[];
  }[];

  exerciseSets?: Record<
    string,
    string[]
  >;
}

export interface Achievement {
  id: string;

  workoutId: string;

  exerciseId: string;

  kind:
    | 'load'
    | 'rep'
    | 'volume'
    | 'estimated_strength'
    | 'timed'
    | 'milestone';

  label: string;

  value: number;

  unit: string;

  timestamp: string;
}

export interface Measurement {
  id: string;

  date: string;

  weightKg?: number;

  values: Record<
    string,
    number
  >;
}

export interface JournalEntry {
  id: string;

  date: string;

  scope:
    | 'workout'
    | 'exercise'
    | 'set'
    | 'general';

  refId?: string;

  text: string;

  tags: string[];
}

export interface Observation {
  id: string;

  type: string;

  statement: string;

  evidence: string[];

  confidence:
    | 'low'
    | 'medium'
    | 'high';

  status:
    | 'active'
    | 'expired';

  purpose: string;

  lastRelevant: string;
}

export interface CoachMemory {
  id: string;

  text: string;

  purpose: string;

  source:
    | 'user'
    | 'conversation';

  createdAt: string;
}

export interface AppState {
  schemaVersion: number;

  profile?: UserProfile;

  goals: Goal[];

  plan?: Plan;

  workouts: Workout[];

  exercises: Exercise[];

  achievements: Achievement[];

  measurements: Measurement[];

  journal: JournalEntry[];

  observations: Observation[];

  preferences: {
    haptics: boolean;

    sounds: boolean;

    smartRir: boolean;

    restPreference:
      | 'adaptive'
      | 'short'
      | 'standard'
      | 'long'
      | 'custom';

    restCustomSec?: number;

    reducedMotion: boolean;

    diagnostics: boolean;

    fontScale:
      | 'system'
      | 'large'
      | 'larger';

    highContrast: boolean;

    notifications: {
      enabled: boolean;
      workoutReminders: boolean;
      missedWorkout: boolean;
      weeklyReview: boolean;
    };
  };

  /**
   * Current APEX route.
   */
  activeRoute: string;

  /**
   * Workout currently being operated on.
   */
  activeWorkoutId?: string;

  onboardingComplete: boolean;

  coachMemory: CoachMemory[];

  workoutTemplates?: WorkoutTemplate[];

  learnedPreferences?: Record<
    string,
    string
  >;

  /**
   * Global lightweight event history.
   */
  eventLog?: {
    id: string;
    type: string;
    timestamp: string;
    payload?: Record<string, unknown>;
  }[];
}