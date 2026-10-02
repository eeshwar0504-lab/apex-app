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

export type SetDisposition =
  | 'completed'
  | 'skipped'
  | 'replaced'
  | 'not_started';

export type CalibrationState =
  | 'not_needed'
  | 'pending'
  | 'estimating'
  | 'calibrating'
  | 'established';

export type RestState = {
  active: boolean;
  startedAt?: string;
  targetSec: number;
  elapsedSec?: number;
  completedAt?: string;
  skipped?: boolean;
};

export interface SetFeedback {
  rir?: number;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  pain?: boolean;
  discomfort?: boolean;
  note?: string;
  timestamp: string;
}

export interface LoadRecommendation {
  weight?: number;
  minWeight?: number;
  maxWeight?: number;

  confidence:
    | 'low'
    | 'medium'
    | 'high';

  /**
   * How the recommendation was established.
   */
  kind?:
    | 'baseline'
    | 'comparable_estimate'
    | 'calibration'
    | 'user_adjustment';

  /**
   * Evidence used to produce the recommendation.
   *
   * This is explanatory metadata only. It must never override
   * deterministic APEX training logic.
   */
  evidence?: string[];

  /**
   * Target RIR used by the recommendation engine.
   */
  targetRir?: number;

  /**
   * Primary source behind the recommendation.
   */
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

export type SessionEquipmentStatus =
  | 'profile_available'
  | 'confirmed'
  | 'unavailable';

export interface GuidedSessionState {
  phase: GuidedSessionPhase;

  exerciseIndex: number;

  setIndex: number;

  completedSetIds: string[];

  skippedSetIds: string[];

  skippedExerciseIds: string[];

  substitutions?: Record<string, string>;

  workingLoads?: Record<string, number>;

  recommendations?: Record<string, LoadRecommendation>;

  sessionEquipment?: Record<
    string,
    SessionEquipmentStatus
  >;

  setFeedback?: Record<string, SetFeedback>;

  rest?: RestState;

  calibration?: Record<string, CalibrationState>;

  startedAt?: string;

  pausedAt?: string;

  pausedTotalSec: number;

  updatedAt: string;

  pauseReason?:
    | 'user'
    | 'background';

  lastCheckpointAt?: string;

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

  loadIncrementsKg?: Record<
    string,
    number[]
  >;

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

export type SafetyConsiderationKind =
  | 'technique_sensitive'
  | 'setup'
  | 'load_control'
  | 'equipment_check'
  | 'range_of_motion'
  | 'balance';

/** A descriptive note about a movement. Never a diagnosis, never advice about a person's health (see exerciseSafety.ts). */
export interface SafetyConsideration {
  kind: SafetyConsiderationKind;
  note: string;
  /** The change that goes with the note. */
  modification?: string;
  /** Only where the exercise data warrants it: a suggestion to ask a qualified coach. */
  guidance?: string;
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
  safetyConsiderations?: SafetyConsideration[];

  loadDescription?: string;

  durationRangeSec?: [number, number];

  /** Set by programExercise(): the catalogue values the goal program started from, and the goal applied. */
  catalogueRepRange?: [number, number];
  catalogueRestSec?: number;
  programmedFor?: GoalKind;
}

export interface SetLog {
  id: string;
  type: SetType;

  weight?: number;

  loadDetail?: LoadDetail;

  reps?: number;
  seconds?: number;

  rir?: number;

  side?: Side;

  completed: boolean;

  disposition?: SetDisposition;

  note?: string;
  timestamp?: string;

  assistance?: number;

  tempo?: string;
}

export interface WorkoutExercise {
  exerciseId: string;

  sets: SetLog[];

  prescribedSets: number;

  repRange: [number, number];

  durationRangeSec?: [number, number];

  recommendedWeight?: number;

  recommendedLoadDetail?: LoadDetail;

  restSec: number;

  order: number;

  note?: string;

  originalPlanVersion?: number;
  currentPlanVersion?: number;

  baselineExerciseId?: string;

  status?:
    | 'planned'
    | 'completed'
    | 'skipped'
    | 'replaced';

  replacementFrom?: string;

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

  pausedAt?: string;
  pausedTotalSec?: number;

  pauseReason?:
    | 'user'
    | 'background';

  guidedSession?: GuidedSessionState & {
    workingLoads?: Record<string, number>;

    sessionEquipment?: Record<
      string,
      SessionEquipmentStatus
    >;
  };

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

/**
 * One self-reported recovery check-in (per calendar day). Context for the Coach only;
 * it never changes a prescription. Scales 1-5, sleepHours 0-24.
 */
export interface RecoveryCheckIn {
  date: string;
  sleepHours?: number;
  sleepQuality?: number;
  soreness?: number;
  fatigue?: number;
  stress?: number;
  readiness?: number;
  /** Context only: never read by the training prescription engine. */
  recentIllness?: boolean;
  pain?: boolean;
  discomfort?: boolean;
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

  nutrition?: {
    targets: {
      proteinG?: number;
      calories?: number;
      carbsG?: number;
      fatsG?: number;
      waterL?: number;
    };
    log: Record<string, {
      proteinG: number;
      calories: number;
      carbsG: number;
      fatsG: number;
      waterL: number;
      meals: number;
    }>;
  };

  journal: JournalEntry[];

  observations: Observation[];

  recoveryLog?: RecoveryCheckIn[];

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

    theme?: 'apex' | 'classic' | 'steel' | 'aurora' | 'crimson';

    units?: 'metric' | 'imperial';

    /** Optional AI explanations. Off by default; cloud is never selectable here (it needs explicit configuration). */
    aiMode?: 'off' | 'rule-based' | 'local-model';

    notifications: {
      enabled: boolean;
      workoutReminders: boolean;
      missedWorkout: boolean;
      weeklyReview: boolean;
    };
  };

  activeRoute: string;

  activeWorkoutId?: string;

  onboardingComplete: boolean;

  coachMemory: CoachMemory[];

  workoutTemplates?: WorkoutTemplate[];

  learnedPreferences?: Record<
    string,
    string
  >;

  eventLog?: {
    id: string;
    type: string;
    timestamp: string;
    payload?: Record<string, unknown>;
  }[];
}
