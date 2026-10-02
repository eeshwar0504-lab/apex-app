import type {Goal} from '../core/types';
import {dayNumber} from '../data/dates';
import {isGoalKind} from './goalProgram';

/**
 * Goal editing (the athlete's objectives list, not the primary goal on the profile): one validation and apply path for
 * create, edit, status change and delete. A goal never touches workouts, history, PRs or the profile's primary goal.
 */
export const GOAL_UNITS = ['kg', 'reps', 'sessions', 'minutes', 'cm', '%'] as const;
export const GOAL_STATUSES: readonly Goal['status'][] = ['active', 'paused', 'achieved'];
export const GOAL_LIMITS = {titleMax: 80, labelMax: 40, targetMax: 100000};

export interface GoalDraft {
  title: string;
  kind: string;
  /** Empty when the goal has no numeric target. */
  targetValue: string;
  targetLabel: string;
  targetUnit: string;
  /** YYYY-MM-DD or empty. */
  targetDate: string;
}

export type GoalErrors = Partial<Record<'title' | 'kind' | 'targetValue' | 'targetLabel' | 'targetUnit' | 'targetDate', string>>;
export type GoalResult = {ok: true; goal: Goal} | {ok: false; errors: GoalErrors};

export function validateGoalDraft(draft: GoalDraft, today: string, existing?: Goal): GoalErrors {
  const errors: GoalErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = 'Give the goal a title.';
  else if (title.length > GOAL_LIMITS.titleMax) errors.title = `Use ${GOAL_LIMITS.titleMax} characters or fewer.`;
  if (!isGoalKind(draft.kind)) errors.kind = 'Choose one of the five goal types.';
  if (draft.targetValue.trim() !== '') {
    const value = Number(draft.targetValue);
    if (!Number.isFinite(value) || value <= 0) errors.targetValue = 'The target must be a number above zero.';
    else if (value > GOAL_LIMITS.targetMax) errors.targetValue = 'That target is outside the supported range.';
    if (!(GOAL_UNITS as readonly string[]).includes(draft.targetUnit)) errors.targetUnit = 'Choose a unit.';
    if (draft.targetLabel.trim().length > GOAL_LIMITS.labelMax) errors.targetLabel = `Use ${GOAL_LIMITS.labelMax} characters or fewer.`;
  }
  if (draft.targetDate.trim() !== '') {
    const day = draft.targetDate.trim();
    if (dayNumber(day) === undefined) errors.targetDate = 'Enter a real calendar date.';
    else if (day < today && day !== existing?.targetDate) errors.targetDate = 'Choose today or a later date.';
  }
  return errors;
}

/** Creates (no `existing`) or edits a goal. Identity, priority, period and status of an edited goal are kept. */
export function applyGoalDraft(existing: Goal | undefined, draft: GoalDraft, ctx: {today: string; nextPriority: number; newId: () => string; newPeriodId: () => string}): GoalResult {
  const errors = validateGoalDraft(draft, ctx.today, existing);
  if (Object.keys(errors).length) return {ok: false, errors};
  const value = draft.targetValue.trim() === '' ? undefined : Number(draft.targetValue);
  const {target: _target, targetDate: _targetDate, ...rest} = (existing ?? {}) as Partial<Goal>;
  const date = draft.targetDate.trim();
  const goal = {
    ...(existing ? rest : {id: ctx.newId(), priority: ctx.nextPriority, periodId: ctx.newPeriodId(), status: 'active' as const}),
    kind: draft.kind as Goal['kind'],
    title: draft.title.trim(),
    ...(value === undefined ? {} : {target: {label: draft.targetLabel.trim() || 'Target', value, unit: draft.targetUnit}}),
    ...(date ? {targetDate: date} : {})
  } as Goal;
  return {ok: true, goal};
}

/** Removes one goal and closes the gap in the priority order; every other goal is otherwise unchanged. */
export function removeGoal(goals: readonly Goal[], id: string): Goal[] {
  return goals.filter(goal => goal.id !== id).sort((a, b) => a.priority - b.priority).map((goal, index) => (goal.priority === index + 1 ? goal : {...goal, priority: index + 1}));
}

export function setGoalStatus(goals: readonly Goal[], id: string, status: Goal['status']): Goal[] {
  if (!GOAL_STATUSES.includes(status)) return [...goals];
  return goals.map(goal => (goal.id === id ? {...goal, status} : goal));
}

export function draftFromGoal(goal: Goal): GoalDraft {
  return {
    title: goal.title,
    kind: goal.kind,
    targetValue: goal.target?.value !== undefined ? String(goal.target.value) : '',
    targetLabel: goal.target?.label ?? 'Target',
    targetUnit: goal.target?.unit ?? 'kg',
    targetDate: goal.targetDate ?? ''
  };
}
