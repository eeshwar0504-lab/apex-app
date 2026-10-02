import type {Experience, GoalKind, UserProfile} from '../core/types';
import {isGoalKind} from './goalProgram';
import {TRAINING_DAYS_MAX, TRAINING_DAYS_MIN} from './training';

/**
 * Profile editing: the one place a profile edit is validated and applied. The screen only collects text; every rule is
 * here so it is testable and cannot drift from what the training engine accepts (training days 2-6, see
 * docs/TRAINING_SEMANTICS.md). Stored values are always canonical units (kg, cm); the draft is in the units the athlete
 * sees, converted through the same unit helpers the rest of the app uses.
 */
export const PROFILE_EQUIPMENT = ['barbell', 'bench', 'dumbbell', 'cable', 'machine', 'bodyweight', 'pull_up_bar', 'kettlebell', 'rack', 'dip_bar', 'trap_bar'] as const;
export const PROFILE_EXPERIENCE: readonly Experience[] = ['beginner', 'intermediate', 'advanced'];

export const PROFILE_LIMITS = {
  nameMax: 60,
  sessionMinutes: [15, 240] as const,
  bodyWeightKg: [20, 400] as const,
  heightCm: [100, 250] as const
};

export interface ProfileDraft {
  name: string;
  experience: string;
  primaryGoal: string;
  trainingDays: number | string;
  sessionMinutes: number | string;
  equipment: readonly string[];
  /** In the athlete's display unit; empty keeps the stored value. */
  bodyWeight: string;
  /** In the athlete's display unit; empty keeps the stored value. */
  height: string;
}

export interface ProfileUnitConverters {
  fromWt: (value: number) => number;
  fromLen: (value: number) => number;
}

export type ProfileErrors = Partial<Record<'name' | 'experience' | 'primaryGoal' | 'trainingDays' | 'sessionMinutes' | 'equipment' | 'bodyWeight' | 'height', string>>;

export type ProfileEditResult = {ok: true; profile: UserProfile} | {ok: false; errors: ProfileErrors};

const wholeNumber = (value: number | string): number | undefined => {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : undefined;
};

const optionalMeasure = (text: string): number | undefined | 'invalid' => {
  if (text.trim() === '') return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : 'invalid';
};

export function validateProfileDraft(draft: ProfileDraft, convert: ProfileUnitConverters): {errors: ProfileErrors; weightKg?: number; heightCm?: number} {
  const errors: ProfileErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Enter a name.';
  else if (name.length > PROFILE_LIMITS.nameMax) errors.name = `Use ${PROFILE_LIMITS.nameMax} characters or fewer.`;
  if (!PROFILE_EXPERIENCE.includes(draft.experience as Experience)) errors.experience = 'Choose beginner, intermediate or advanced.';
  if (!isGoalKind(draft.primaryGoal)) errors.primaryGoal = 'Choose one of the five goals.';
  const days = wholeNumber(draft.trainingDays);
  if (days === undefined || days < TRAINING_DAYS_MIN || days > TRAINING_DAYS_MAX) errors.trainingDays = `Train ${TRAINING_DAYS_MIN} to ${TRAINING_DAYS_MAX} days a week.`;
  const minutes = wholeNumber(draft.sessionMinutes);
  const [minLo, minHi] = PROFILE_LIMITS.sessionMinutes;
  if (minutes === undefined || minutes < minLo || minutes > minHi) errors.sessionMinutes = `Sessions run ${minLo} to ${minHi} minutes.`;
  const known = new Set<string>(PROFILE_EQUIPMENT);
  if (!draft.equipment.length) errors.equipment = 'Choose at least one equipment option.';
  else if (draft.equipment.some(item => !known.has(item))) errors.equipment = 'One of the equipment options is not recognised.';

  let weightKg: number | undefined;
  const weight = optionalMeasure(draft.bodyWeight);
  if (weight === 'invalid') errors.bodyWeight = 'Enter a number.';
  else if (weight !== undefined) {
    weightKg = Math.round(convert.fromWt(weight) * 10) / 10;
    if (!(weightKg >= PROFILE_LIMITS.bodyWeightKg[0] && weightKg <= PROFILE_LIMITS.bodyWeightKg[1])) errors.bodyWeight = 'That body weight is outside the supported range.';
  }
  let heightCm: number | undefined;
  const height = optionalMeasure(draft.height);
  if (height === 'invalid') errors.height = 'Enter a number.';
  else if (height !== undefined) {
    heightCm = Math.round(convert.fromLen(height) * 10) / 10;
    if (!(heightCm >= PROFILE_LIMITS.heightCm[0] && heightCm <= PROFILE_LIMITS.heightCm[1])) errors.height = 'That height is outside the supported range.';
  }
  return {errors, weightKg, heightCm};
}

/**
 * Applies a validated draft to the stored profile (or creates one). Nothing but the profile changes: workouts, history,
 * PRs and goals are never touched. The primary goal is always the first entry of `profile.goals`; other goals the athlete
 * already had stay.
 */
export function applyProfileDraft(profile: UserProfile | undefined, draft: ProfileDraft, convert: ProfileUnitConverters, createId: () => string, now: string): ProfileEditResult {
  const {errors, weightKg, heightCm} = validateProfileDraft(draft, convert);
  if (Object.keys(errors).length) return {ok: false, errors};
  const primaryGoal = draft.primaryGoal as GoalKind;
  const base: UserProfile = profile ?? {id: createId(), name: '', experience: 'beginner', goals: [], primaryGoal, trainingDays: 3, sessionMinutes: 45, equipment: [], body: {}, loadIncrementsKg: {}, createdAt: now} as UserProfile;
  const next: UserProfile = {
    ...base,
    name: draft.name.trim(),
    experience: draft.experience as Experience,
    primaryGoal,
    goals: [primaryGoal, ...(base.goals || []).filter(goal => goal !== primaryGoal)],
    trainingDays: wholeNumber(draft.trainingDays) as number,
    sessionMinutes: wholeNumber(draft.sessionMinutes) as number,
    equipment: [...new Set(draft.equipment)],
    body: {
      ...(base.body || {}),
      ...(weightKg !== undefined ? {weightKg} : {}),
      ...(heightCm !== undefined ? {heightCm} : {})
    }
  };
  return {ok: true, profile: next};
}
