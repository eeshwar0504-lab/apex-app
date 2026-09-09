import type {AppState, Exercise, Observation, Workout} from '../core/types';
import {volumeForWorkout, summarizeSets, comparable} from './training';

export type EvidenceGrade='high'|'medium'|'low';
export interface Insight {title:string; detail:string; evidence:string[]; confidence:EvidenceGrade; kind:'fact'|'inference'|'recommendation';}
export interface Adaptation {type:'load'|'reps'|'rest'|'volume'|'recovery'|'schedule'|'replace'; title:string; detail:string; evidence:string[]; confidence:EvidenceGrade; requiresConfirmation:boolean;}

export function completedWorkouts(s:AppState){return s.workouts.filter(w=>w.status==='completed').sort((a,b)=>(a.completedAt||a.scheduledDate).localeCompare(b.completedAt||b.scheduledDate));}
export function exerciseHistory(s:AppState,id:string){return completedWorkouts(s).flatMap(w=>w.exercises.filter(e=>e.exerciseId===id).map(e=>({workout:w,entry:e})));}
export function recentVolumes(s:AppState){return completedWorkouts(s).slice(-6).map(w=>({date:w.scheduledDate,volume:volumeForWorkout(w,s.exercises)}));}

export function homeInsights(s:AppState):Insight[]{
 const done=completedWorkouts(s), out:Insight[]=[];
 if(!done.length){out.push({title:'Build evidence first',detail:'Your first completed session gives APEX a baseline for progression.',evidence:['No completed sessions yet'],confidence:'low',kind:'recommendation'});return out;}
 const recent=done.slice(-3), volumes=recent.map(w=>volumeForWorkout(w,s.exercises));
 out.push({title:`${done.length} completed session${done.length===1?'':'s'}`,detail:'Your logged performance is the factual training record APEX uses for adaptation.',evidence:[`${done.length} completed sessions in local history`],confidence:'high',kind:'fact'});
 if(recent.length>=2&&volumes[volumes.length-1]>volumes[volumes.length-2]*1.2)
   out.push({title:'Recent volume increased',detail:'The latest completed session was more than 20% above the previous one. Keep the next session controlled rather than chasing more work.',evidence:[`Previous: ${Math.round(volumes[volumes.length-2])} kg·reps`,`Latest: ${Math.round(volumes[volumes.length-1])} kg·reps`],confidence:'medium',kind:'recommendation'});
 const unfinished=s.workouts.find(w=>w.status==='in_progress');
 if(unfinished)out.unshift({title:'Workout in progress',detail:`${unfinished.name} can be resumed without starting over.`,evidence:['Active local session exists'],confidence:'high',kind:'recommendation'});
 return out.slice(0,3);
}

export function readiness(s:AppState):{label:string;detail:string;level:'baseline'|'normal'|'elevated'}{
 const done=completedWorkouts(s).slice(-3);
 if(!done.length)return {label:'Baseline',detail:'Not enough history for a readiness inference.',level:'baseline'};
 const last=done[done.length-1], prev=done[done.length-2];
 if(prev && volumeForWorkout(last,s.exercises)>volumeForWorkout(prev,s.exercises)*1.25)return {label:'Elevated load',detail:'Recent session volume was substantially higher than the prior session.',level:'elevated'};
 return {label:'Normal',detail:'Recent training provides usable evidence without a strong fatigue flag.',level:'normal'};
}

export function buildObservations(s:AppState):Observation[]{
 const observations:Observation[]=[];
 for(const ex of s.exercises){
   const h=exerciseHistory(s,ex.id); if(h.length<3)continue;
   const completed=h.flatMap(x=>x.entry.sets.filter(set=>set.completed&&set.type!=='warmup'));
   const rirs=completed.map(x=>x.rir).filter((x):x is number=>x!==undefined);
   const avg=rirs.length?rirs.reduce((a,b)=>a+b,0)/rirs.length:undefined;
   if(avg!==undefined && avg<=1){
     observations.push({id:`obs-${ex.id}-effort`,type:'effort',statement:`${ex.name} has recently been logged close to failure.`,evidence:[`${rirs.length} sets with RIR recorded`,`Average RIR ${avg.toFixed(1)}`],confidence:rirs.length>=5?'high':'medium',status:'active',purpose:'progression',lastRelevant:h[h.length-1].workout.scheduledDate});
   }
   const vols=h.slice(-3).map(x=>summarizeSets(ex,x.entry.sets).volume);
   if(vols.length===3&&vols.every((v,i)=>i===0||v>=vols[i-1])){
     observations.push({id:`obs-${ex.id}-volume`,type:'progress',statement:`${ex.name} has maintained or increased comparable training volume across recent sessions.`,evidence:vols.map(v=>`${Math.round(v)} kg·reps`),confidence:'medium',status:'active',purpose:'progression',lastRelevant:h[h.length-1].workout.scheduledDate});
   }
 }
 return observations;
}

export function adaptationsForWorkout(s:AppState,w:Workout):Adaptation[]{
 const out:Adaptation[]=[]; const read=readiness(s);
 for(const we of w.exercises){
   const ex=s.exercises.find(e=>e.id===we.exerciseId); if(!ex)continue;
   const history=exerciseHistory(s,ex.id).filter(x=>x.workout.id!==w.id).slice(-4);
   const sets=history.flatMap(x=>x.entry.sets);
   if(!sets.length)continue;
   const completed=sets.filter(x=>x.completed&&x.type!=='warmup');
   if(completed.length<2)continue;
   const bottom=ex.repRange[0],top=ex.repRange[1];
   const recent=completed.slice(-3);
   const reached=recent.length>=2&&recent.every(x=>(x.reps||0)>=top);
   if(reached&&read.level!=='elevated'){
     const last=recent[recent.length-1];
     out.push({type:'load',title:`Progress ${ex.name}`,detail:`Recent comparable sets repeatedly reached ${top} reps. A small equipment-specific load step is supported.`,evidence:[`Last ${recent.length} comparable sets reached the top of the range`,`Last load: ${last.weight??'bodyweight'}`],confidence:'high',requiresConfirmation:false});
   } else if(recent.filter(x=>(x.reps||0)<bottom).length>=2){
     out.push({type:'recovery',title:`Protect ${ex.name}`,detail:'Recent comparable performance has repeatedly fallen below the target range. Hold or reduce rather than forcing progression.',evidence:[`${recent.filter(x=>(x.reps||0)<bottom).length} recent sets below ${bottom} reps`],confidence:'medium',requiresConfirmation:false});
   }
 }
 return out;
}

export function updatePersonalIntelligence(s:AppState):AppState{
 const next=buildObservations(s);
 const existing=s.observations.filter(o=>o.status==='active'&&!next.some(n=>n.id===o.id));
 return {...s,observations:[...existing,...next]};
}

export interface GoalProgress {
  percent:number|null;
  current:number|null;
  target:number;
  unit:string;
  label:string;
  status:'active'|'achieved'|'not-measurable';
}

export function goalProgress(s:AppState,g:import('../core/types').Goal):GoalProgress{
  if(!g.target||!Number.isFinite(g.target.value)||g.target.value<=0)
    return {percent:null,current:null,target:0,unit:'',label:g.title,status:'not-measurable'};
  const done=completedWorkouts(s);
  let current:number|undefined;
  if(g.target.unit==='sessions') current=done.length;
  else if(g.target.unit==='kg'){
    const vals=s.achievements.filter(a=>a.kind==='load'&&a.value>0).map(a=>a.value);
    current=vals.length?Math.max(...vals):undefined;
  } else if(g.target.unit==='reps'){
    const vals=s.achievements.filter(a=>a.kind==='rep'&&a.value>0).map(a=>a.value);
    current=vals.length?Math.max(...vals):undefined;
  } else if(g.target.unit==='minutes'){
    const vals=done.map(w=>{const a=w.startedAt&&w.completedAt?((new Date(w.completedAt).getTime()-new Date(w.startedAt).getTime())/60000):0;return a;}).filter(x=>x>0);
    current=vals.length?Math.max(...vals):undefined;
  } else if(g.target.unit==='cm'){
    const vals=s.measurements.flatMap(m=>Object.values(m.values)).filter(Number.isFinite);
    current=vals.length?Math.max(...vals):undefined;
  }
  const pct=current===undefined?0:Math.min(100,Math.round(current/g.target.value*100));
  return {percent:pct,current:current??null,target:g.target.value,unit:g.target.unit,label:g.target.label,status:pct>=100?'achieved':'active'};
}

export function goalMilestones(s:AppState,g:import('../core/types').Goal){
  const progress=goalProgress(s,g);
  if(progress.percent===null)return [];
  const percent=progress.percent;
  return [25,50,75,100].map(threshold=>({
    threshold,
    reached:percent>=threshold,
    label:threshold===100?'Target reached':`${threshold}% of target`,
    current:progress.current,
    target:progress.target,
    unit:progress.unit
  }));
}

export function trainingLoadSummary(s:AppState){
  const done=completedWorkouts(s);
  const sessions=done.slice(-8).map(w=>({
    date:w.scheduledDate,
    volume:volumeForWorkout(w,s.exercises),
    sets:w.exercises.reduce((n,e)=>n+e.sets.filter(x=>x.completed&&x.type!=='warmup').length,0)
  }));
  const recent=sessions.slice(-4), prior=sessions.slice(-8,-4);
  const avg=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
  return {
    sessions,
    recentAverageVolume:avg(recent.map(x=>x.volume)),
    priorAverageVolume:avg(prior.map(x=>x.volume)),
    consistency30:done.filter(w=>{const d=new Date(w.scheduledDate);const cutoff=new Date();cutoff.setDate(cutoff.getDate()-30);return d>=cutoff}).length,
    workingSets30:done.filter(w=>{const d=new Date(w.scheduledDate);const cutoff=new Date();cutoff.setDate(cutoff.getDate()-30);return d>=cutoff}).reduce((n,w)=>n+w.exercises.reduce((a,e)=>a+e.sets.filter(x=>x.completed&&x.type!=='warmup').length,0),0)
  };
}
export function explainObservation(o:Observation){return `${o.statement} Evidence: ${o.evidence.join('; ')}. Confidence: ${o.confidence}. Purpose: ${o.purpose}.`;}
