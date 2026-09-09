import type {Exercise,GoalKind,SetLog,SetType,UserProfile,Workout,WorkoutExercise,PlanDay,Plan} from '../core/types';

export type ProgressionAction='calibrate'|'increase'|'hold'|'reduce'|'recover';
export interface ProgressionResult{action:ProgressionAction;weight?:number;reason:string;confidence:'low'|'medium'|'high';nextRepRange:[number,number];recommendedRest:number;}
export interface SafetyResult{allowed:boolean;severity:'none'|'caution'|'block';reasons:string[];adjustedWeight?:number;adjustedSets?:number;}
export interface PerformanceSummary{completedSets:number;reps:number;load:number;volume:number;topLoad?:number;bestReps?:number;avgRir?:number;}
const roundTo=(n:number,step:number)=>step>0?Math.round(n/step)*step:Math.round(n*10)/10;
export const uid=(prefix:string)=>`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
export function comparable(a:Exercise,b:Exercise){return a.pattern===b.pattern&&a.loadSemantics===b.loadSemantics;}
export function loadUnit(ex:Exercise){switch(ex.loadSemantics){case'per_hand':return'kg / hand';case'assistance':return'kg assistance';case'stack':return'stack kg';case'time':return'seconds';case'bodyweight':return'bodyweight';case'none':return'—';default:return'kg total';}}
export function formatLoad(ex:Exercise,value?:number){if(value==null)return ex.loadSemantics==='bodyweight'?'Bodyweight':'Not calibrated';if(ex.loadSemantics==='assistance')return`${value} kg assistance`;if(ex.loadSemantics==='time')return`${value}s`;if(ex.loadSemantics==='bodyweight')return'Bodyweight';if(ex.loadSemantics==='per_hand')return`${value} kg / hand`;return`${value} kg`;}
export function summarizeSets(ex:Exercise,sets:SetLog[]):PerformanceSummary{
 const done=sets.filter(s=>s.completed), reps=done.reduce((a,s)=>a+(s.reps||0),0), load=done.reduce((a,s)=>a+(s.weight||0),0);
 const volume=done.reduce((a,s)=>{if(ex.loadSemantics==='time'||ex.loadSemantics==='none'||ex.loadSemantics==='bodyweight')return a;const mult=ex.loadSemantics==='per_hand'?2:1;return a+(s.weight||0)*(s.reps||0)*mult;},0);
 const rs=done.map(s=>s.rir).filter((x):x is number=>typeof x==='number');
 const loads=done.map(s=>s.weight||0).filter(Boolean);
 return{completedSets:done.length,reps,load,volume,topLoad:loads.length?Math.max(...loads):undefined,bestReps:reps?Math.max(...done.map(s=>s.reps||0)):undefined,avgRir:rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:undefined};
}
export function volumeForWorkout(w:Workout,exercises:Exercise[]){return w.exercises.reduce((sum,we)=>{const ex=exercises.find(x=>x.id===we.exerciseId);return sum+(ex?summarizeSets(ex,we.sets).volume:0)},0);}
function recentCompleted(sets:SetLog[]){return sets.filter(s=>s.completed&&s.type!=='warmup').slice(-6);}
export function progression(ex:Exercise,recent:SetLog[],context?:{goal?:GoalKind;fatigue?:'low'|'normal'|'elevated';experience?:string}):ProgressionResult{
 const valid=recentCompleted(recent); if(!valid.length)return{action:'calibrate',reason:'No comparable completed work yet. Establish a controlled baseline.',confidence:'low',nextRepRange:ex.repRange,recommendedRest:ex.restSec};
 const top=ex.repRange[1],bottom=ex.repRange[0],last=valid[valid.length-1],fatigue=context?.fatigue||'normal';
 const allTop=valid.slice(-3).length>=2&&valid.slice(-3).every(s=>(s.reps||0)>=top);
 const low=valid.slice(-3).filter(s=>(s.reps||0)<bottom).length>=2;
 const rirs=valid.map(s=>s.rir).filter((x):x is number=>x!==undefined);
 if(fatigue==='elevated')return{action:'recover',weight:last.weight,reason:'Recent context suggests elevated training load; protect repeatable performance.',confidence:'medium',nextRepRange:ex.repRange,recommendedRest:ex.restSec+15};
 if(low)return{action:'reduce',weight:last.weight,reason:'Comparable performance has repeatedly fallen below the target range.',confidence:'medium',nextRepRange:ex.repRange,recommendedRest:ex.restSec+15};
 if(allTop&&last.weight!==undefined){const jump=ex.loadSemantics==='assistance'?-ex.incrementKg:ex.incrementKg;const next=roundTo(last.weight+jump,ex.incrementKg);return{action:'increase',weight:Math.max(0,next),reason:`Repeatedly reached ${top} reps; use a small ${Math.abs(ex.incrementKg)} kg step.`,confidence:'high',nextRepRange:ex.repRange,recommendedRest:ex.restSec};}
 if(rirs.length&&rirs.reduce((a,b)=>a+b,0)/rirs.length<=0.5)return{action:'hold',weight:last.weight,reason:'Recent sets were very close to failure. Repeat the load before adding more.',confidence:'medium',nextRepRange:ex.repRange,recommendedRest:ex.restSec+15};
 return{action:'hold',weight:last.weight,reason:'Build repeatable performance inside the target range before changing load.',confidence:'high',nextRepRange:ex.repRange,recommendedRest:ex.restSec};
}
export function safetyCheck(ex:Exercise,current:number|undefined,proposed:number|undefined,sets:number,weeklySets=0):SafetyResult{
 const reasons:string[]=[]; if(proposed!==undefined&&current!==undefined&&current>0){const delta=ex.loadSemantics==='assistance'?current-proposed:proposed-current;if(delta>current*.15)reasons.push('Proposed load change exceeds a conservative 15% step.');if(delta>current*.1)reasons.push('Consider a smaller progression step.');}
 if(sets>5)reasons.push('More than five prescribed sets for one movement needs review.'); if(weeklySets>16)reasons.push('Weekly exposure is high; review recovery and redundancy.');
 const hard=proposed!==undefined&&current!==undefined&&current>0&&((ex.loadSemantics!=='assistance'&&proposed>current*1.25)||(ex.loadSemantics==='assistance'&&proposed<current*.75));
 return hard?{allowed:false,severity:'block',reasons:['Load jump is too large for an automatic change.',...reasons]}:{allowed:true,severity:reasons.length?'caution':'none',reasons};
}
export function recommendedRest(ex:Exercise,p:'adaptive'|'short'|'standard'|'long'|'custom',custom?:number,effort?:number){if(p==='short')return Math.max(45,ex.restSec-30);if(p==='standard')return ex.restSec;if(p==='long')return ex.restSec+30;if(p==='custom')return custom||ex.restSec;return Math.round((ex.restSec+(effort!=null&&effort<=1?15:0))/15)*15;}
function chooseByPattern(es:Exercise[],pattern:string,equipment:string[]){return es.find(e=>e.pattern===pattern&&e.equipment.some(q=>equipment.includes(q)))||es.find(e=>e.pattern===pattern)||es.find(e=>e.pattern.includes(pattern));}
export function buildPlan(profile:UserProfile,exercises:Exercise[],goals:any[]=[]){
 const available=exercises.filter(e=>e.equipment.some(x=>profile.equipment.includes(x))||e.equipment.includes('bodyweight')), upper=['horizontal_push','vertical_pull','horizontal_pull','vertical_push','arm_flexion','arm_extension','shoulder_abduction'].map(p=>chooseByPattern(available,p,profile.equipment)).filter(Boolean) as Exercise[], lower=['squat','hinge','knee_flexion','knee_extension','calf','core'].map(p=>chooseByPattern(available,p,profile.equipment)).filter(Boolean) as Exercise[];
 const full=[...upper.slice(0,3),...lower.slice(0,3)],days:PlanDay[]=[],n=Math.max(2,Math.min(6,profile.trainingDays)),labels=['MON','TUE','WED','THU','FRI','SAT','SUN'];
 const trainingIndexes=n<=3?[0,2,4].slice(0,n):[0,1,3,4,5,6].slice(0,n);
 for(let i=0;i<7;i++){if(trainingIndexes.includes(i)){const upperDay=trainingIndexes.indexOf(i)%2===0;days.push({id:uid('day'),dayIndex:i,label:n<=3?`FULL BODY ${upperDay?'A':'B'}`:`${upperDay?'UPPER':'LOWER'} ${String.fromCharCode(65+Math.floor(trainingIndexes.indexOf(i)/2))}`,rest:false,workoutId:uid('wref')});}else days.push({id:uid('day'),dayIndex:i,label:'RECOVERY',rest:true});}
 return{name:`APEX ${profile.primaryGoal.replace('_',' ')} program`,days,exerciseSets:{upper:upper.map(e=>e.id),lower:lower.map(e=>e.id),full:full.map(e=>e.id)}};
}
export function createWorkout(name:string,date:string,ids:string[],exercises:Exercise[],planId:string,source:'scheduled'|'custom'|'extra'='scheduled',version=1,history?:SetLog[][]):Workout{
 // Local state can outlive changes to the canonical exercise library. Omit invalid
 // IDs here rather than creating a workout that will crash when it is rendered.
 const items:WorkoutExercise[]=ids.flatMap((id,i)=>{const ex=exercises.find(x=>x.id===id);if(!ex)return[];const count=i<4?3:2;const prev=history?.[i]||[],p=progression(ex,prev);const sets=Array.from({length:count},()=>makeSet('working',ex,p.weight));return[{exerciseId:id,sets,prescribedSets:count,repRange:ex.repRange,recommendedWeight:p.weight,restSec:ex.restSec,order:0}];}).map((item,order)=>({...item,order}));
 return{id:uid('workout'),planId,name,scheduledDate:date,status:'planned',exercises:items,source,version,updatedAt:new Date().toISOString()};
}
export function makeSet(type:SetType,ex:Exercise,weight?:number):SetLog{const timed=type==='timed'||ex.loadSemantics==='time',assist=type==='assisted'||ex.loadSemantics==='assistance';return{id:uid('set'),type,weight:timed||ex.loadSemantics==='bodyweight'||ex.loadSemantics==='none'||assist?undefined:weight,reps:timed?undefined:ex.repRange[0],seconds:timed?ex.repRange[0]:undefined,completed:false,side:ex.unilateral?'both':undefined,assistance:assist?weight:undefined};}
export function updateSetType(set:SetLog,type:SetType,ex:Exercise):SetLog{const n={...set,type};if(type==='timed'||ex.loadSemantics==='time'){delete n.weight;delete n.reps;n.seconds=n.seconds||ex.repRange[0];}else if(type==='bodyweight'||ex.loadSemantics==='bodyweight'||ex.loadSemantics==='none'){delete n.weight;delete n.seconds;n.reps=n.reps||ex.repRange[0];}else if(type==='assisted'||ex.loadSemantics==='assistance'){n.assistance=n.assistance??n.weight;delete n.seconds;}else{n.weight=n.weight??undefined;n.reps=n.reps||ex.repRange[0];delete n.seconds;}return n;}
export function detectAchievements(w:Workout,es:Exercise[],previous:Workout[]){const out:any[]=[];for(const we of w.exercises){const ex=es.find(e=>e.id===we.exerciseId);if(!ex)continue;const done=we.sets.filter(s=>s.completed),old=previous.flatMap(p=>p.exercises.filter(x=>x.exerciseId===ex.id).flatMap(x=>x.sets.filter(s=>s.completed)));const top=Math.max(0,...done.map(s=>s.weight||0)),oldTop=Math.max(0,...old.map(s=>s.weight||0));const best=Math.max(0,...done.map(s=>s.reps||0)),oldBest=Math.max(0,...old.map(s=>s.reps||0));const vol=summarizeSets(ex,we.sets).volume,oldVol=previous.flatMap(p=>p.exercises.filter(x=>x.exerciseId===ex.id)).reduce((a,x)=>a+summarizeSets(ex,x.sets).volume,0);if(top>oldTop&&top)out.push({exerciseId:ex.id,kind:'load',label:`New load best: ${formatLoad(ex,top)}`,value:top,unit:loadUnit(ex)});if(best>oldBest&&best)out.push({exerciseId:ex.id,kind:'rep',label:`New rep best: ${best} reps`,value:best,unit:'reps'});const e1rm=(sets:SetLog[])=>Math.max(0,...sets.filter(s=>s.completed&&s.weight&&s.reps&&s.reps>=1&&s.reps<=10).map(s=>(s.weight||0)*(1+(s.reps||0)/30)));const est=e1rm(done),oldEst=e1rm(old);if(est>oldEst&&est>0)out.push({exerciseId:ex.id,kind:'estimated_strength',label:`Estimated strength best: ${formatLoad(ex,est)}`,value:est,unit:'estimated 1RM'});if(vol>oldVol&&vol)out.push({exerciseId:ex.id,kind:'volume',label:'New session volume best',value:vol,unit:'kg·reps'});if(ex.loadSemantics==='time'){const sec=Math.max(0,...done.map(s=>s.seconds||0));if(sec)out.push({exerciseId:ex.id,kind:'timed',label:`New time best: ${sec}s`,value:sec,unit:'seconds'});}}return out;}
export function markMissedWorkouts(ws:Workout[],todayISO:string){return ws.map(w=>w.status==='planned'&&w.scheduledDate<todayISO?{...w,status:'missed' as const,updatedAt:new Date().toISOString()}:w);}
export function createRescheduled(w:Workout,date:string){return{...structuredClone(w),id:uid('workout'),scheduledDate:date,status:'planned' as const,source:w.source,version:w.version+1,updatedAt:new Date().toISOString()};}

export type EquipmentFit='available'|'unknown'|'unavailable';

export function equipmentFit(ex:Exercise, available:string[]|undefined):EquipmentFit{
 if(!available||!available.length)return 'unknown';
 const normalized=available.map(x=>x.toLowerCase().trim());
 const aliases=(x:string)=>normalized.some(a=>a===x||a.includes(x)||x.includes(a));
 if(ex.equipment.length===0||ex.equipment.some(e=>aliases(e)))return 'available';
 if(ex.equipment.some(e=>['bodyweight','floor','bench'].includes(e)&&aliases(e)))return 'available';
 return 'unavailable';
}

export function smartAlternatives(ex:Exercise, exercises:Exercise[], available:string[]|undefined){
 return ex.alternatives.map(id=>exercises.find(x=>x.id===id)).filter((x):x is Exercise=>!!x)
   .map(x=>({exercise:x,fit:equipmentFit(x,available),samePattern:x.pattern===ex.pattern,sameLoad:x.loadSemantics===ex.loadSemantics}))
   .sort((a,b)=>(a.fit==='available'?0:a.fit==='unknown'?1:2)-(b.fit==='available'?0:b.fit==='unknown'?1:2) || Number(b.samePattern)-Number(a.samePattern) || Number(b.sameLoad)-Number(a.sameLoad));
}

export function rescheduleWorkout(w:Workout,date:string){const original=structuredClone(w);original.status='rescheduled';original.updatedAt=new Date().toISOString();const replacement=createRescheduled(w,date);return{original,replacement};}
export function cloneSetForRepeat(set:SetLog,ex:Exercise):SetLog{const copy={...set,id:uid('set'),completed:false,timestamp:undefined};if(ex.loadSemantics==='time'){delete copy.weight;copy.seconds=copy.seconds||ex.repRange[0];}if(ex.loadSemantics==='bodyweight'||ex.loadSemantics==='none'){delete copy.weight;delete copy.seconds;copy.reps=copy.reps||ex.repRange[0];}return copy;}
export function addWorkoutSet(w:Workout,id:string,exercises:Exercise[],template?:SetLog){const out=structuredClone(w),we=out.exercises.find(x=>x.exerciseId===id),ex=exercises.find(x=>x.id===id);if(!we||!ex||we.sets.length>=8)return w;const t=template||we.sets[we.sets.length-1];we.sets.push(cloneSetForRepeat(t,ex));we.prescribedSets=we.sets.length;out.version++;out.updatedAt=new Date().toISOString();return out;}
export function removeWorkoutSet(w:Workout,id:string,setId:string){const out=structuredClone(w),we=out.exercises.find(x=>x.exerciseId===id);if(!we||we.sets.length<=1)return w;we.sets=we.sets.filter(x=>x.id!==setId);we.prescribedSets=we.sets.length;out.version++;out.updatedAt=new Date().toISOString();return out;}
export function reorderWorkoutExercise(w:Workout,from:number,to:number){const out=structuredClone(w);if(from<0||to<0||from>=out.exercises.length||to>=out.exercises.length||from===to)return w;const [x]=out.exercises.splice(from,1);out.exercises.splice(to,0,x);out.exercises.forEach((e,i)=>e.order=i);out.version++;out.updatedAt=new Date().toISOString();return out;}
export function replaceWorkoutExercise(w:Workout,oldId:string,newEx:Exercise,allExercises?:Exercise[]){const out=structuredClone(w),we=out.exercises.find(x=>x.exerciseId===oldId),oldEx=allExercises?.find(x=>x.id===oldId);if(!we||oldId===newEx.id)return w;const equivalent=!!oldEx&&oldEx.pattern===newEx.pattern&&oldEx.loadSemantics===newEx.loadSemantics&&oldEx.repRange[1]-oldEx.repRange[0]===newEx.repRange[1]-newEx.repRange[0];const prior=we.sets;we.exerciseId=newEx.id;we.sets=equivalent?prior.map(s=>({...s,id:uid('set'),timestamp:undefined,completed:false})):Array.from({length:prior.length},()=>makeSet('working',newEx));we.prescribedSets=we.sets.length;we.repRange=newEx.repRange;we.recommendedWeight=equivalent?we.recommendedWeight:undefined;we.restSec=newEx.restSec;we.replacementFrom=oldId;we.baselineExerciseId=oldId;we.status='replaced';out.version++;out.updatedAt=new Date().toISOString();return out;}
export function markWorkoutExerciseSkipped(w:Workout,id:string){const out=structuredClone(w),we=out.exercises.find(x=>x.exerciseId===id);if(!we)return w;we.status=we.status==='skipped'?'planned':'skipped';out.version++;out.updatedAt=new Date().toISOString();return out;}
export function sessionAssessment(w:Workout,es:Exercise[],previous:Workout[]){const completed=w.exercises.flatMap(we=>we.sets.filter(s=>s.completed)),planned=w.exercises.reduce((a,e)=>a+e.prescribedSets,0);return{completedSets:completed.length,plannedSets:planned,completion:planned?completed.length/planned:0,volume:volumeForWorkout(w,es),avgRir:(()=>{const r=completed.map(s=>s.rir).filter((x):x is number=>typeof x==='number');return r.length?r.reduce((a,b)=>a+b,0)/r.length:undefined})(),achievements:detectAchievements(w,es,previous),skipped:w.exercises.filter(e=>e.status==='skipped').length};}
export function applyWorkoutAdaptation(w:Workout,es:Exercise[],recent:Workout[]){const out=structuredClone(w);for(const we of out.exercises){const ex=es.find(e=>e.id===we.exerciseId);if(!ex)continue;const sets=recent.flatMap(r=>r.exercises.filter(x=>x.exerciseId===ex.id).flatMap(x=>x.sets));const p=progression(ex,sets);if(p.weight!==undefined&&p.action!=='calibrate')we.recommendedWeight=p.weight;we.restSec=p.recommendedRest;}return out;}
export function createCustomWorkout(name:string,date:string,ids:string[],es:Exercise[],planId='custom'):Workout{return createWorkout(name,date,ids,es,planId,'custom',1);}
export function cloneTemplateWorkout(template:{name:string;exerciseIds:string[]},date:string,es:Exercise[]):Workout{return createCustomWorkout(template.name,date,template.exerciseIds,es);}
export function planWithDays(plan:Plan,days:PlanDay[]):Plan{return{...structuredClone(plan),days,version:plan.version+1,updatedAt:new Date().toISOString(),history:[...(plan.history||[]),{version:plan.version,createdAt:new Date().toISOString(),reason:'Plan structure edited',days:structuredClone(plan.days)}]};}
