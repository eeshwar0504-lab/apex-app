import type {Exercise,SetLog,Workout} from '../core/types';
import {ApexLine} from '../ui/primitives';
import {describeSet} from '../ui/previous';
import {fmt} from '../ui/shared';

/*
 * THE GHOST SET. Last time's performance sits quietly behind the current target. When the athlete beats it, the ghost dissolves
 * into the new performance; nothing is celebrated, the comparison is the message.
 */
export function GhostSet({ex,current,ghost,dissolve=false}:{ex:Exercise;current:Pick<SetLog,'weight'|'assistance'|'reps'|'seconds'|'loadDetail'|'type'>;ghost?:SetLog;dissolve?:boolean}){
 const now=describeSet(ex,current);
 if(!ghost)return null;
 return <div className={`apex-ghost${dissolve?' is-dissolving':''}`} aria-label="Previous performance">
  <div className={dissolve?'mo-settle':undefined}><small>NOW</small><strong>{now||'—'}</strong></div>
  <div className="apex-ghost-prev"><small>LAST TIME</small><span>{describeSet(ex,ghost)||'—'}</span></div>
  {dissolve&&<span className="a3-sr-only" role="status">Better than last time.</span>}
 </div>;
}

/*
 * CAUSE → EFFECT. After a set is logged, one coherent line shows what it changed: the set, the exercise, the session and the week.
 * It draws once (emerge); it is not five separate animations.
 */
export function CausePath({steps}:{steps:Array<{label:string;value:string;progress:number}>}){
 return <ol className="apex-cause" aria-label="What this set changed">
  {steps.map((x,i)=><li key={x.label} style={{['--i' as string]:i} as React.CSSProperties}>
   <small>{x.label}</small>
   <strong>{x.value}</strong>
   <ApexLine value={x.progress} variant="progress"/>
  </li>)}
 </ol>;
}

/* The rest timer: the APEX Line is the clock. It contracts as time passes and settles when rest is over. */
export function RestLine({remaining,total,done}:{remaining:number;total:number;done:boolean}){
 const p=total>0?Math.max(0,Math.min(1,remaining/total)):0;
 return <div className={`apex-rest${done?' is-done':''}`} role="timer" aria-live="off" aria-label={done?'Rest is over':`Rest, ${fmt(remaining)} left`}>
  <ApexLine value={p} variant="timer"/>
  <strong className="apex-rest-time">{done?'READY':fmt(remaining)}</strong>
 </div>;
}

/* The finished session as one artifact: every exercise with a mark for each set that was done, skipped or left. */
export function SessionArtifact({workout,exercises}:{workout:Workout;exercises:Exercise[]}){
 return <div className="apex-artifact" data-session-artifact>
  {workout.exercises.map((we,i)=>{
   const ex=exercises.find(e=>e.id===we.exerciseId);
   const sets=we.sets.filter(x=>x.type!=='warmup');
   return <div className="apex-artifact-row" key={`${we.exerciseId}-${i}`}>
    <span>{ex?.name||'Exercise'}</span>
    <span className="apex-pips" aria-label={`${sets.filter(x=>x.completed).length} of ${sets.length} sets done`}>
     {sets.map(x=><i key={x.id} className={x.completed?'is-done':x.disposition==='skipped'?'is-skipped':''}/>)}
    </span>
   </div>;
  })}
 </div>;
}
