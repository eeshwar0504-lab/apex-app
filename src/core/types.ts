export type GoalKind = 'strength'|'hypertrophy'|'fat_loss'|'fitness'|'general';
export type Experience = 'beginner'|'intermediate'|'advanced';
export type SetType = 'warmup'|'working'|'drop'|'failure'|'amrap'|'rest_pause'|'myo_reps'|'tempo'|'cluster'|'timed'|'bodyweight'|'assisted'|'unilateral';
export type LoadSemantics = 'per_hand'|'total'|'stack'|'assistance'|'bodyweight'|'time'|'none';
export type PlanMode = 'finite'|'target_date'|'continuous';
export type WorkoutStatus = 'planned'|'in_progress'|'completed'|'skipped'|'missed'|'rescheduled'|'extra';
export type Side = 'left'|'right'|'both';

export interface UserProfile {
  id:string; name:string; experience:Experience; goals:GoalKind[]; primaryGoal:GoalKind;
  trainingDays:number; sessionMinutes:number; equipment:string[];
  body:{weightKg?:number;heightCm?:number}; createdAt:string;
}
export interface Goal {
  id:string; kind:GoalKind; title:string; priority:number;
  target?:{label:string;value:number;unit:string}; targetDate?:string;
  periodId:string; status:'active'|'achieved'|'paused';
}
export interface Exercise {
  id:string; name:string; aliases:string[]; family:string; pattern:string;
  primaryMuscles:string[]; secondaryMuscles:string[]; equipment:string[];
  difficulty:Experience; unilateral:boolean; loadSemantics:LoadSemantics;
  incrementKg:number; repRange:[number,number]; restSec:number;
  cues:string[]; setup:string[]; steps:string[]; breathing:string;
  tempo?:string; mistakes:string[]; safety:string[]; alternatives:string[];
  progressions?:string[]; regressions?:string[]; contraindicationNotes?:string[];
  loadDescription?:string;
}
export interface SetLog {
  id:string; type:SetType; weight?:number; reps?:number; seconds?:number; rir?:number;
  side?:Side; completed:boolean; note?:string; timestamp?:string;
  assistance?:number; tempo?:string;
}
export interface WorkoutExercise {
  exerciseId:string; sets:SetLog[]; prescribedSets:number; repRange:[number,number];
  recommendedWeight?:number; restSec:number; order:number; note?:string;
  baselineExerciseId?:string; status?:'planned'|'completed'|'skipped'|'replaced'; replacementFrom?:string;
}
export interface Workout {
  id:string; planId:string; name:string; scheduledDate:string; status:WorkoutStatus;
  startedAt?:string; completedAt?:string; exercises:WorkoutExercise[]; notes?:string;
  originalPlanVersion?:number; currentPlanVersion?:number; source:'scheduled'|'custom'|'extra';
  pausedAt?:string; pausedTotalSec?:number;
  /** Persisted, session-only guidance. It never changes the underlying program. */
  guidedSession?:{phase:'prep'|'equipment'|'ready'|'set_ready'|'set_active'|'feedback'|'rest'|'exercise_complete'|'complete';exerciseIndex:number;setIndex:number;substitutions?:Record<string,string>;workingLoads?:Record<string,number>;updatedAt:string};
  version:number; updatedAt:string;
}
export interface WorkoutTemplate {
  id:string; name:string; description?:string; exerciseIds:string[];
  createdAt:string; updatedAt:string;
}
export interface PlanDay {id:string;dayIndex:number;label:string;workoutId?:string;rest:boolean;}
export interface Plan {
  id:string; name:string; mode:PlanMode; weeks?:number; targetDate?:string;
  days:PlanDay[]; version:number; createdAt:string; updatedAt:string;
  history?:{version:number;createdAt:string;reason:string;days:PlanDay[]}[];
  exerciseSets?:Record<string,string[]>;
}
export interface Achievement {
  id:string; workoutId:string; exerciseId:string;
  kind:'load'|'rep'|'volume'|'estimated_strength'|'timed'|'milestone';
  label:string; value:number; unit:string; timestamp:string;
}
export interface Measurement {id:string;date:string;weightKg?:number;values:Record<string,number>;}
export interface JournalEntry {id:string;date:string;scope:'workout'|'exercise'|'set'|'general';refId?:string;text:string;tags:string[];}
export interface Observation {
  id:string; type:string; statement:string; evidence:string[];
  confidence:'low'|'medium'|'high'; status:'active'|'expired'; purpose:string; lastRelevant:string;
}
export interface CoachMemory {id:string;text:string;purpose:string;source:'user'|'conversation';createdAt:string;}
export interface AppState {
  schemaVersion:number; profile?:UserProfile; goals:Goal[]; plan?:Plan; workouts:Workout[];
  exercises:Exercise[]; achievements:Achievement[]; measurements:Measurement[];
  journal:JournalEntry[]; observations:Observation[];
  preferences:{
    haptics:boolean;sounds:boolean;smartRir:boolean;
    restPreference:'adaptive'|'short'|'standard'|'long'|'custom';restCustomSec?:number;
    reducedMotion:boolean;diagnostics:boolean;fontScale:'system'|'large'|'larger';highContrast:boolean;
    notifications:{enabled:boolean;workoutReminders:boolean;missedWorkout:boolean;weeklyReview:boolean};
  };
  activeRoute:string; activeWorkoutId?:string; onboardingComplete:boolean;
  coachMemory:CoachMemory[]; workoutTemplates?:WorkoutTemplate[];
  learnedPreferences?:Record<string,string>; eventLog?:{id:string;type:string;timestamp:string;payload?:Record<string,unknown>}[];
}
