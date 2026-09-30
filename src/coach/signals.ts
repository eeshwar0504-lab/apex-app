import type {AppState} from '../core/types';
import {plateauCandidates} from '../engine/analytics';
import {latestRecoveryCheckIn} from '../engine/recovery';
import type {CoachContextSignals, PlateauSignal} from './types';

/**
 * Builds the evidence the application supplies to the Coach from stored state:
 * the most recent recovery check-in and the deterministic plateau signals.
 * Nothing returned here changes a prescription; the Coach explains it and the
 * user decides.
 */
export function coachEvidenceFromState(state:AppState,today:string):{context?:CoachContextSignals;plateaus:PlateauSignal[]}{
 const checkIn=latestRecoveryCheckIn(state.recoveryLog,today);
 const context:CoachContextSignals|undefined=checkIn
  ?{sleepHours:checkIn.sleepHours,sleepQuality:checkIn.sleepQuality,soreness:checkIn.soreness,fatigue:checkIn.fatigue,stress:checkIn.stress,readiness:checkIn.readiness}
  :undefined;
 return {context,plateaus:plateauCandidates(state)};
}
