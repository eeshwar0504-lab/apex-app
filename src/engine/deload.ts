/**
 * The deload control path (Phase 12). The Coach and the AI may SAY that a deload is recommended; they cannot start one. Starting
 * a deload is an explicit athlete action that passes through startDeload(): the engine re-checks its own rules and only then
 * records the start day (AppState.deloads). Everything else (the lighter prescription, the resume window, the status) is derived
 * from that day and the training history by training.ts / fatigue.ts, so nothing else needs to be stored or edited.
 */
import type { AppState } from '../core/types';
import type { FatigueAssessment } from './fatigue';
import { recoveryAssessment } from './training';

type DeloadState = Pick<AppState, 'workouts' | 'exercises' | 'profile' | 'deloads'>;

/** The current fatigue / deload assessment for a local day (YYYY-MM-DD). Recovery check-ins are not read. */
export function recoveryStatus(state: DeloadState, today: string): FatigueAssessment | undefined {
  return recoveryAssessment(state.workouts, state.exercises, today, state.deloads, state.profile?.primaryGoal);
}

export type StartDeloadResult =
  | { started: true; state: AppState }
  | { started: false; state: AppState; reason: 'not_recommended' | 'invalid_date' };

/** Accepts the recommendation: allowed only while the engine's own status is deload_recommended. Otherwise the state is returned unchanged. */
export function startDeload(state: AppState, today: string): StartDeloadResult {
  const status = recoveryStatus(state, today);
  if (!status) return { started: false, state, reason: 'invalid_date' };
  if (status.status !== 'deload_recommended') return { started: false, state, reason: 'not_recommended' };
  return { started: true, state: { ...state, deloads: [...new Set([...(state.deloads ?? []), today])].sort() } };
}
