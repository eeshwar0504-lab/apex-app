import type {AppState} from '../core/types';
import {volumeForWorkout} from './training';

export function consistencySummary(s:AppState,days=30){
 const cutoff=Date.now()-days*86400000;
 const completed=s.workouts.filter(w=>w.status==='completed'&&new Date(w.completedAt||w.scheduledDate).getTime()>=cutoff);
 const planned=s.workouts.filter(w=>w.scheduledDate>=new Date(cutoff).toISOString().slice(0,10)&&w.source==='scheduled');
 const rate=planned.length?Math.round(completed.length/planned.length*100):completed.length?100:0;
 const dates=[...new Set(completed.map(w=>w.scheduledDate))].sort();
 let streak=0,last='';
 for(const d of dates.reverse()){if(!last){last=d;streak=1;continue}const diff=(new Date(last).getTime()-new Date(d).getTime())/86400000;if(diff<=8){streak++;last=d}else break}
 return {completed:completed.length,planned:planned.length,rate,streak};
}
export function volumeTrend(s:AppState){
 const done=s.workouts.filter(w=>w.status==='completed').slice(-8);
 return done.map(w=>({date:w.scheduledDate,volume:Math.round(volumeForWorkout(w,s.exercises)),sets:w.exercises.reduce((n,e)=>n+e.sets.filter(x=>x.completed&&x.type!=='warmup').length,0)}));
}
export function plateauCandidates(s:AppState){
 const out:{exerciseId:string;exerciseName:string;sessions:number;detail:string}[]=[];
 for(const ex of s.exercises){
  const rows=s.workouts.filter(w=>w.status==='completed').flatMap(w=>w.exercises.filter(e=>e.exerciseId===ex.id).map(e=>({w,e}))).slice(-4);
  if(rows.length<3) continue;
  const scores=rows.map(({e})=>e.sets.filter(x=>x.completed&&x.type!=='warmup').reduce((n,x)=>n+(x.reps||0),0));
  if(scores.every(x=>x===scores[0])) out.push({exerciseId:ex.id,exerciseName:ex.name,sessions:rows.length,detail:'Comparable recent sessions show no change in completed-rep output. Review load, technique, recovery and exercise context before changing the plan.'});
 }
 return out.slice(0,6);
}


export function goalMomentum(s:AppState){
 const done=s.workouts.filter(w=>w.status==='completed').slice(-8);
 if(done.length<2) return {direction:'insufficient' as const,detail:'Complete more sessions before interpreting momentum.',changePct:0};
 const half=Math.max(1,Math.floor(done.length/2));
 const first=done.slice(0,half).reduce((n,w)=>n+volumeForWorkout(w,s.exercises),0)/half;
 const second=done.slice(-half).reduce((n,w)=>n+volumeForWorkout(w,s.exercises),0)/half;
 const change=first?Math.round((second-first)/first*100):0;
 const direction=change>8?'up':change<-8?'down':'stable';
 return {direction,detail:`Recent average training volume is ${change>=0?'+':''}${change}% versus the earlier comparison window.`,changePct:change};
}

export function trainingBalance(s:AppState){
 const counts:Record<string,number>={};
 for(const w of s.workouts.filter(x=>x.status==='completed').slice(-8)){
   for(const we of w.exercises){
     const ex=s.exercises.find(x=>x.id===we.exerciseId);
     if(!ex)continue;
     const sets=we.sets.filter(x=>x.completed&&x.type!=='warmup').length;
     for(const muscle of ex.primaryMuscles) counts[muscle]=(counts[muscle]||0)+sets;
   }
 }
 const values=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
 if(!values.length)return {highest:undefined,lowest:undefined,spread:0};
 return {highest:values[0],lowest:values[values.length-1],spread:values[0][1]-values[values.length-1][1]};
}

export function sessionQuality(s:AppState,wId:string){
 const w=s.workouts.find(x=>x.id===wId);
 if(!w)return {label:'Unknown',detail:'Session not found.',completed:0,planned:0,completion:0};
 const planned=w.exercises.reduce((n,e)=>n+e.prescribedSets,0);
 const completed=w.exercises.reduce((n,e)=>n+e.sets.filter(x=>x.completed).length,0);
 const completion=planned?Math.round(completed/planned*100):0;
 const skipped=w.exercises.filter(e=>e.status==='skipped').length;
 const label=completion>=95?'Complete':completion>=75?'Mostly complete':completion>=50?'Partial':'Light session';
 return {label,detail:`${completed} of ${planned} prescribed sets completed${skipped?` · ${skipped} exercise${skipped===1?'':'s'} skipped`:''}.`,completed,planned,completion};
}
