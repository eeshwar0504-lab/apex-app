/*
 * Plausibility limits for logged set values. A value beyond a limit is treated as a typing or data error, never as
 * evidence: the engine ignores it and the persistence boundary drops it. The limits are deliberately generous (they
 * exist to stop absurd values such as 1e9 kg, not to judge anyone's training).
 */
export const MAX_PLAUSIBLE_LOAD_KG = 1000;
export const MAX_PLAUSIBLE_REPS = 500;
export const MAX_PLAUSIBLE_SECONDS = 7200;
