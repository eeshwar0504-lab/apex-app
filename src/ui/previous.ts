import type {Exercise,SetLog,Workout} from '../core/types';
import {setLoad,isWorkingSet} from '../engine/training';
import {formatLoad} from './shared';

/*
 * Previous performance, read straight from completed workouts (nothing is estimated or invented). It feeds the Ghost Set and the
 * "your history" views; it never feeds a prescription.
 */
type LastSession={workoutId:string;date:string;sets:SetLog[]};
export function lastSession(workouts:Workout[],exerciseId:string,excludeId?:string):LastSession|undefined{
 const done=workouts.filter(w=>w.status==='completed'&&w.id!==excludeId).sort((a,b)=>String(a.completedAt||a.scheduledDate).localeCompare(String(b.completedAt||b.scheduledDate)));
 for(let i=done.length-1;i>=0;i--){
  const entry=done[i].exercises.find(e=>e.exerciseId===exerciseId);
  const sets=entry?.sets.filter(x=>x.completed&&isWorkingSet(x))||[];
  if(sets.length)return {workoutId:done[i].id,date:done[i].scheduledDate,sets};
 }
 return undefined;
}
/* the ghost of the Nth working set is the same-numbered set last time (the last one if there were fewer) */
export const ghostSet=(last:LastSession|undefined,workingIndex:number):SetLog|undefined=>last?last.sets[Math.min(Math.max(workingIndex,0),last.sets.length-1)]:undefined;
export function describeSet(ex:Exercise,set:Pick<SetLog,'weight'|'assistance'|'reps'|'seconds'|'loadDetail'|'type'>):string{
 const load=setLoad(ex,set as SetLog);
 const left=ex.loadSemantics==='bodyweight'?'Bodyweight':ex.loadSemantics==='none'?'':load!==undefined?formatLoad(ex,load):'';
 const right=ex.loadSemantics==='time'?(set.seconds!==undefined?`${set.seconds} sec`:''):set.reps!==undefined?`${set.reps} reps`:'';
 return [left,right].filter(Boolean).join(' × ');
}
/* better than last time = a heavier load, or the same load for more reps (or a longer hold) */
export function beatsGhost(ex:Exercise,current:SetLog,ghost:SetLog):boolean{
 if(ex.loadSemantics==='time')return (current.seconds??0)>(ghost.seconds??0);
 const a=setLoad(ex,current)??0,b=setLoad(ex,ghost)??0;
 if(ex.loadSemantics==='assistance')return a<b||(a===b&&(current.reps??0)>(ghost.reps??0));
 return a>b||(a===b&&(current.reps??0)>(ghost.reps??0));
}
