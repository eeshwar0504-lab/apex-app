import type {AppState, WorkoutStatus, SetLog} from '../core/types';

const statuses = new Set<WorkoutStatus>(['planned','in_progress','completed','skipped','missed','rescheduled','extra']);
const setTypes = new Set(['warmup','working','drop','failure','amrap','rest_pause','myo_reps','tempo','cluster','timed','bodyweight','assisted','unilateral']);

export interface IntegrityIssue {
  path:string;
  message:string;
  severity:'warning'|'error';
}

export function inspectState(state: AppState): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  if (!state || typeof state !== 'object') return [{path:'root',message:'State is not an object.',severity:'error'}];
  if (!Array.isArray(state.workouts)) issues.push({path:'workouts',message:'Workout collection is invalid.',severity:'error'});
  if (!Array.isArray(state.exercises)) issues.push({path:'exercises',message:'Exercise collection is invalid.',severity:'error'});
  const exerciseIds = new Set<string>();
  for (const e of state.exercises || []) {
    if (!e?.id) issues.push({path:'exercises',message:'Exercise without an id.',severity:'error'});
    else if (exerciseIds.has(e.id)) issues.push({path:`exercises.${e.id}`,message:'Duplicate canonical exercise id.',severity:'error'});
    else exerciseIds.add(e.id);
    if (e?.alternatives) for (const id of e.alternatives) if (!exerciseIds.has(id)) {
      // Forward references are allowed because the graph is validated after the full list below.
    }
  }
  const seenWorkout = new Set<string>();
  for (const w of state.workouts || []) {
    if (!w?.id) issues.push({path:'workouts',message:'Workout without an id.',severity:'error'});
    if (w?.id && seenWorkout.has(w.id)) issues.push({path:`workouts.${w.id}`,message:'Duplicate workout id.',severity:'error'});
    if (w?.id) seenWorkout.add(w.id);
    if (w?.status && !statuses.has(w.status)) issues.push({path:`workouts.${w.id}.status`,message:'Unknown workout status.',severity:'error'});
    if (!Array.isArray(w?.exercises)) issues.push({path:`workouts.${w?.id||'unknown'}.exercises`,message:'Exercise list is invalid.',severity:'error'});
    const orders = new Set<number>();
    for (const we of w?.exercises || []) {
      if (!we.exerciseId) issues.push({path:`workouts.${w.id}.exercises`,message:'Workout exercise has no exercise id.',severity:'error'});
      if (!Array.isArray(we.sets)) issues.push({path:`workouts.${w.id}.${we.exerciseId}.sets`,message:'Set collection is invalid.',severity:'error'});
      if (orders.has(we.order)) issues.push({path:`workouts.${w.id}.exercises`,message:'Duplicate exercise order.',severity:'warning'});
      orders.add(we.order);
      const seenSet = new Set<string>();
      for (const set of we.sets || []) {
        if (!set?.id) issues.push({path:`workouts.${w.id}.${we.exerciseId}.sets`,message:'Set without an id.',severity:'warning'});
        if (set?.id && seenSet.has(set.id)) issues.push({path:`workouts.${w.id}.${we.exerciseId}.sets.${set.id}`,message:'Duplicate set id.',severity:'error'});
        if (set?.id) seenSet.add(set.id);
        if (set?.type && !setTypes.has(set.type)) issues.push({path:`workouts.${w.id}.${we.exerciseId}.sets.${set.id}`,message:'Unknown set type.',severity:'error'});
        if (set?.weight != null && (!Number.isFinite(set.weight) || set.weight < 0)) issues.push({path:`workouts.${w.id}.${we.exerciseId}.sets.${set.id}`,message:'Invalid weight.',severity:'error'});
        if (set?.reps != null && (!Number.isFinite(set.reps) || set.reps < 0)) issues.push({path:`workouts.${w.id}.${we.exerciseId}.sets.${set.id}`,message:'Invalid reps.',severity:'error'});
        if (set?.seconds != null && (!Number.isFinite(set.seconds) || set.seconds < 0)) issues.push({path:`workouts.${w.id}.${we.exerciseId}.sets.${set.id}`,message:'Invalid duration.',severity:'error'});
        if (set?.rir != null && (!Number.isFinite(set.rir) || set.rir < 0 || set.rir > 10)) issues.push({path:`workouts.${w.id}.${we.exerciseId}.sets.${set.id}`,message:'RIR must be between 0 and 10.',severity:'warning'});
      }
    }
  }
  for (const e of state.exercises || []) {
    for (const rel of [...(e.alternatives||[]),...(e.progressions||[]),...(e.regressions||[])]) {
      if (!exerciseIds.has(rel)) issues.push({path:`exercises.${e.id}`,message:`Knowledge graph references unknown exercise "${rel}".`,severity:'warning'});
    }
  }
  if (state.plan) {
    const workoutIds = new Set((state.workouts||[]).map(w=>w.id));
    for (const d of state.plan.days||[]) if (!d.rest && d.workoutId && !workoutIds.has(d.workoutId)) {
      issues.push({path:`plan.days.${d.id}`,message:'Plan day references an unknown workout.',severity:'warning'});
    }
  }
  return issues;
}

export function isUsableState(state: AppState): boolean {
  return inspectState(state).every(i => i.severity !== 'error');
}
