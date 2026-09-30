import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-500.css';
import '@fontsource/playfair-display/latin-600.css';
import './styles.css';
import './apex3-phase2.css';
import './apex3-phase3.css';
import './apex3-phase4.css';
import './apex3-phase5.css';
import './apex3-phase6.css';
import './apex3-phase7.css';
import './apex3-phase8.css';
import './apex3-phase9.css';
import './apex3-phase10.css';
import './apex3-phase11.css';
import './apex3-phase12.css';
import './apex3-phase13.css';
import './apex3-phase14.css';
import './apex3-phase15.css';
import './apex3-design-system.css';
import {APEX_TRAINING_IMAGES,imageKindForExercise,type TrainingImageKind} from './imagery';
import type {AppState,Exercise,Goal,GoalKind,SetLog,SetType,UserProfile,Workout,WorkoutTemplate,Measurement} from './core/types';
import {EXERCISES,findExercises} from './knowledge/exercises';
import {repository} from './data/repository';
import type {RecoveryNotice} from './data/repository';
import {encryptBackup,decryptBackup,recoveryKey} from './data/backupCrypto';
import {buildPlan,createWorkout,createCustomWorkout,cloneTemplateWorkout,detectAchievements,formatLoad as engineFormatLoad,makeSet,recommendedRest,markMissedWorkouts,volumeForWorkout,updateSetType,uid,addWorkoutSet,removeWorkoutSet,reorderWorkoutExercise,replaceWorkoutExercise,markWorkoutExerciseSkipped,markWorkoutSetSkipped,rescheduleWorkoutWithEvent,pauseWorkoutSession,resumeWorkoutSession,recoverWorkoutSession,sessionAssessment,hasLoggedSets,abandonWorkout,applyWorkoutAdaptation,planWithDays,equipmentFit,smartAlternatives,personalizedLoad,loadAvailability,snapToAvailableLoad,adjacentAvailableLoad,loadDetailForSet,formatLoadDetail as engineFormatLoadDetail,dumbbellTotalLoad,barbellLoadBreakdown,formatTimedDuration} from './engine/training';
import {normalizeGuidedPosition,completeSet,applySetFeedback,continueAfterRest as continueGuidedAfterRest,advanceToNextExercise as advanceGuidedToNextExercise} from './engine/guidedSession';
import {homeInsights,readiness,buildObservations,adaptationsForWorkout,goalProgress,goalMilestones,trainingLoadSummary} from './engine/intelligence';
import {notificationIntents} from './engine/notifications';
import {syncLocalNotifications,listenForNotificationActions} from './native/localNotifications';
import {knowledgeReport} from './knowledge/knowledgeGraph';
import {inspectState} from './data/integrity';
import {coach,coachEvidenceFromState} from './coach';
import {upsertRecoveryCheckIn,RECOVERY_SCALE_FIELDS} from './engine/recovery';
import {consistencySummary,volumeTrend,goalMomentum,trainingBalance} from './engine/analytics';
import {accessibilityClass,fontScaleValue} from './data/accessibility';
import pkg from '../package.json';
import {App as CapacitorApp} from '@capacitor/app';
import {setUnits,getUnits,wt,wtInput,fromWt,len,fromLen,vol,volLabel,weightLabel,weightWord,lengthLabel,displayText} from './data/units';

const today=()=>new Date().toISOString().slice(0,10);
/* Engine strings are authored in kg; convert at the presentation boundary only. */
const formatLoad=(...a:Parameters<typeof engineFormatLoad>)=>displayText(engineFormatLoad(...a));
const formatLoadDetail=(...a:Parameters<typeof engineFormatLoadDetail>)=>displayText(engineFormatLoadDetail(...a));
const fmt=(n:number)=>`${String(Math.floor(Math.max(0,n)/60)).padStart(2,'0')}:${String(Math.max(0,n)%60).padStart(2,'0')}`;
const SET_TYPES:SetType[]=['warmup','working','drop','failure','amrap','rest_pause','myo_reps','tempo','cluster','timed','bodyweight','assisted','unilateral'];

function Icon({name,size=20}:{name:string;size?:number}){const c={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};const p:Record<string,React.ReactNode>={home:<><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,train:<><path d="M6 4v16M18 4v16M3 8v8M21 8v8M6 8h12M6 16h12"/></>,chart:<><path d="M4 19V5"/><path d="M4 19h17"/><path d="m7 15 4-4 3 2 5-7"/></>,user:<><circle cx="12" cy="8" r="4"/><path d="M4 21c1.4-4 4-6 8-6s6.6 2 8 6"/></>,search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,play:<path d="m8 5 11 7-11 7V5Z"/>,plus:<><path d="M12 5v14M5 12h14"/></>,minus:<path d="M5 12h14"/>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,check:<path d="m5 12 4 4L19 7"/>,chev:<path d="m9 18 6-6-6-6"/>,back:<path d="m15 18-6-6 6-6"/>,bolt:<path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>,target:<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>,history:<><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></>,settings:<><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></>,pause:<><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>,calendar:<><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></>,spark:<><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></>,activity:<><path d="M3 12h4l2-7 4 14 2-7h6"/></>,layers:<><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,shield:<><path d="M12 3 20 6v6c0 5-3.3 8-8 9-4.7-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-5"/></>,arrow:<path d="M5 12h14M13 6l6 6-6 6"/>,alert:<><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17h.01"/></>,crown:<><path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z"/></>,dumbbell:<><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/></>};return <svg {...c}>{p[name]||p.bolt}</svg>}


function ApexImage({kind,alt,className='',caption,eager=false}:{kind:TrainingImageKind;alt?:string;className?:string;caption?:string;eager?:boolean}){
 const asset=APEX_TRAINING_IMAGES[kind];
 const [failedKind,setFailedKind]=useState<TrainingImageKind|null>(null);
 const failed=failedKind===kind;
 return <figure className={`apex-image ${className} ${failed?'is-fallback':''}`}>
   {failed
     ?<div className="apex-image-fallback" aria-hidden="true"><Icon name="activity" size={24}/></div>
     :<img src={asset.src} alt={alt??asset.alt} loading={eager?'eager':'lazy'} decoding="async" onError={()=>setFailedKind(kind)}/>}
   {caption&&<figcaption>{caption}</figcaption>}
 </figure>;
}
function ApexRidge({className=''}:{className?:string}){
 return <svg className={`a3-ridge ${className}`} viewBox="0 0 400 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
  <defs>
   <radialGradient id="a3-sun" cx="72%" cy="34%" r="58%"><stop offset="0" style={{stopColor:'var(--apex3-gold-bright)',stopOpacity:0.5}}/><stop offset="0.45" style={{stopColor:'var(--apex3-gold)',stopOpacity:0.14}}/><stop offset="1" style={{stopColor:'var(--apex3-gold)',stopOpacity:0}}/></radialGradient>
   <linearGradient id="a3-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{stopColor:'var(--apex3-steel)',stopOpacity:0.5}}/><stop offset="1" style={{stopColor:'var(--apex3-bg)',stopOpacity:0.15}}/></linearGradient>
   <linearGradient id="a3-mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{stopColor:'var(--apex3-surface-strong)',stopOpacity:0.95}}/><stop offset="1" style={{stopColor:'var(--apex3-bg)',stopOpacity:1}}/></linearGradient>
  </defs>
  <rect width="400" height="220" fill="url(#a3-sun)"/>
  <path d="M0 150 L34 122 L58 136 L96 92 L124 118 L152 84 L188 126 L214 104 L246 138 L286 96 L318 124 L352 100 L400 132 V220 H0Z" fill="url(#a3-far)"/>
  <path d="M96 92 L108 105 M152 84 L165 99 M286 96 L297 109" className="a3-ridge-snow"/>
  <path d="M0 176 L44 146 L82 166 L128 120 L166 158 L214 128 L262 168 L310 132 L356 160 L400 140 V220 H0Z" fill="url(#a3-mid)"/>
  <path d="M0 200 L52 178 L100 194 L156 166 L212 192 L268 172 L330 196 L400 176 V220 H0Z" style={{fill:'var(--apex3-bg)'}}/>
 </svg>
}
function Splash({message}:{message?:string}){
 return <div className="apex3-splash"><ApexImage kind="strength-session" alt="" className="a3-splash-photo" eager/><ApexRidge className="a3-splash-ridge"/><img src="/brand/apex-mark-gold.png" alt=""/><b>APEX</b><span className="a3-splash-tag" aria-label="Train, track, progress, evolve"><i>TRAIN</i><i>TRACK</i><i>PROGRESS</i><i>EVOLVE</i></span><em className="a3-splash-claim">Your training is measured.<br/>Your progress is earned.</em>{message&&<small>{message}</small>}</div>
}
function ApexSpark({values,label,xLabels}:{values:number[];label:string;xLabels?:[string,string]}){
 if(values.length<2)return <p className="a3-muted a3-note">Not enough logged points yet.</p>;
 const w=320,h=xLabels?150:130,padL=38,padR=10,padT=10,padB=xLabels?24:10;
 const min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,0.1);
 const yOf=(v:number)=>h-padB-((v-min)/span)*(h-padT-padB);
 const pts=values.map((v,i)=>[padL+i*(w-padL-padR)/(values.length-1),yOf(v)] as [number,number]);
 const line=pts.map(p=>`${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
 const last=pts[pts.length-1];
 const grid=[max,(max+min)/2,min];
 const fmt=(v:number)=>String(Math.round(v*10)/10);
 return <svg className="a3-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
  <defs><linearGradient id="a3-spark-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{stopColor:'var(--apex3-gold)',stopOpacity:0.32}}/><stop offset="1" style={{stopColor:'var(--apex3-gold)',stopOpacity:0}}/></linearGradient></defs>
  {grid.map((g,i)=><g key={i}><line x1={padL} x2={w-padR} y1={yOf(g)} y2={yOf(g)} className="a3-spark-grid"/><text x={padL-6} y={yOf(g)+3.5} textAnchor="end" className="a3-spark-axis">{fmt(g)}</text></g>)}
  {xLabels&&<><text x={padL} y={h-6} className="a3-spark-axis">{xLabels[0]}</text><text x={w-padR} y={h-6} textAnchor="end" className="a3-spark-axis">{xLabels[1]}</text></>}
  <polygon points={`${padL},${h-padB} ${line} ${w-padR},${h-padB}`} fill="url(#a3-spark-fill)"/>
  <polyline points={line} className="a3-spark-line"/>
  <circle cx={last[0]} cy={last[1]} r="4.5" className="a3-spark-dot"/>
 </svg>
}
function SegBar<T extends string>({value,items,onChange,label}:{value:T;items:Array<[T,string]>;onChange:(v:T)=>void;label:string}){
 return <div className="a3-seg" style={{gridTemplateColumns:`repeat(${items.length}, minmax(0, 1fr))`}} role="tablist" aria-label={label}>{items.map(([k,l])=><button key={k} role="tab" aria-selected={value===k} className={value===k?'active':''} onClick={()=>onChange(k)}>{l}</button>)}</div>
}
function SegTabs({route,onNav}:{route:'coach'|'today';onNav:(r:string)=>void}){
 return <div className="a3-seg" role="tablist" aria-label="Coach and Today">
  <button role="tab" aria-selected={route==='coach'} className={route==='coach'?'active':''} onClick={()=>onNav('coach')}>Coach</button>
  <button role="tab" aria-selected={route==='today'} className={route==='today'?'active':''} onClick={()=>onNav('today')}>Today</button>
 </div>
}
type NutritionDay={proteinG:number;calories:number;carbsG:number;fatsG:number;waterL:number;meals:number};
const EMPTY_NUTRITION_DAY:NutritionDay={proteinG:0,calories:0,carbsG:0,fatsG:0,waterL:0,meals:0};
function nutritionDay(s:AppState,date=today()):NutritionDay{return {...EMPTY_NUTRITION_DAY,...(s.nutrition?.log?.[date]||{})}}
function Nutrition({s,update}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void}){
 const targets=s.nutrition?.targets||{};
 const day=nutritionDay(s);
 const [nutTab,setNutTab]=useState<'today'|'week'>('today');
 const [meal,setMeal]=useState({protein:'',carbs:'',fats:'',calories:''});
 const [tv,setTv]=useState({protein:String(targets.proteinG??''),calories:String(targets.calories??''),carbs:String(targets.carbsG??''),fats:String(targets.fatsG??''),water:String(targets.waterL??'')});
 const num=(v:string)=>{const n=Number(v);return v.trim()!==''&&Number.isFinite(n)&&n>=0?n:undefined};
 const pct=(v:number,t?:number)=>t&&t>0?Math.min(100,Math.round(v/t*100)):0;
 const mutateDay=(fn:(d:NutritionDay)=>NutritionDay)=>update(x=>({...x,nutrition:{targets:x.nutrition?.targets||{},log:{...(x.nutrition?.log||{}),[today()]:fn(nutritionDay(x))}}}));
 const logMeal=()=>{
  const p=num(meal.protein)||0,c=num(meal.carbs)||0,f=num(meal.fats)||0;
  const kcal=num(meal.calories)??Math.round(p*4+c*4+f*9);
  if(p+c+f+kcal===0)return;
  mutateDay(d=>({...d,proteinG:d.proteinG+p,carbsG:d.carbsG+c,fatsG:d.fatsG+f,calories:d.calories+kcal,meals:d.meals+1}));
  setMeal({protein:'',carbs:'',fats:'',calories:''});
 };
 const addWater=(l:number)=>mutateDay(d=>({...d,waterL:Math.round((d.waterL+l)*100)/100}));
 const saveTargets=()=>update(x=>({...x,nutrition:{log:x.nutrition?.log||{},targets:{proteinG:num(tv.protein),calories:num(tv.calories),carbsG:num(tv.carbs),fatsG:num(tv.fats),waterL:num(tv.water)}}}));
 const week=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const iso=d.toISOString().slice(0,10);return {iso,protein:nutritionDay(s,iso).proteinG}});
 const weekMax=Math.max(1,...week.map(x=>x.protein));
 const remaining=targets.proteinG?Math.max(0,targets.proteinG-day.proteinG):undefined;
 const rows:[string,number,number|undefined,string][]=[['Calories',day.calories,targets.calories,'kcal'],['Carbs',day.carbsG,targets.carbsG,'g'],['Fats',day.fatsG,targets.fatsG,'g'],['Water',day.waterL,targets.waterL,'L']];
 return <div className="a3-home a3-nutrition">
  <PageTitle eyebrow="NUTRITION · TODAY" title="Nutrition" sub="Log what you eat and drink against your own targets. APEX records the numbers; it does not prescribe a diet."/>
  <SegBar label="Nutrition range" value={nutTab} onChange={setNutTab} items={[['today','Today'],['week','Week']]}/>
  {nutTab==='today'&&<>
  <div className="a3-card a3-nut-hero">
   <ApexRing value={targets.proteinG?pct(day.proteinG,targets.proteinG):null} label="Protein" sub={targets.proteinG?`${Math.round(day.proteinG)} / ${targets.proteinG} g`:`${Math.round(day.proteinG)} g logged`}/>
   <div className="a3-stats a3-stats-2"><ApexStat label="Consumed" value={String(Math.round(day.proteinG))} unit="g"/><ApexStat label="Remaining" value={remaining===undefined?'—':String(Math.round(remaining))} unit="g"/></div>
  </div>
  <div className="a3-card a3-stack">
   <div className="a3-head"><h2>Daily totals</h2><span className="a3-chip">{day.meals} meal{day.meals===1?'':'s'}</span></div>
   {rows.map(([label,v,t,unit])=><div className="a3-meter-row" key={label}><span>{label}</span><ApexMeter value={pct(v,t)}/><strong>{Math.round(v*100)/100}{t?` / ${t}`:''} {unit}</strong></div>)}
   <div className="a3-actions"><button className="a3-pill" onClick={()=>addWater(0.25)}>+ 250 ml</button><button className="a3-pill" onClick={()=>addWater(0.5)}>+ 500 ml</button></div>
  </div>
  </>}
  {nutTab==='week'&&<section className="a3-block">
   <div className="a3-head"><h2>Protein this week</h2><span className="a3-eyebrow">Last 7 days</span></div>
   <div className="a3-card"><div className="a3-bars">{week.map(x=><div className="a3-bar-col" key={x.iso}><small>{x.protein?Math.round(x.protein):'—'}</small><i><b style={{height:`${x.protein?Math.max(8,Math.round(x.protein/weekMax*100)):0}%`}}/></i><span>{x.iso.slice(5)}</span></div>)}</div></div>
  </section>}
  {nutTab==='today'&&<>
  <section className="a3-card a3-stack">
   <div className="a3-head"><h2>Log a meal</h2></div>
   <div className="a3-fields">
    <label>Protein (g)<input inputMode="decimal" value={meal.protein} onChange={e=>setMeal(m=>({...m,protein:e.target.value}))}/></label>
    <label>Carbs (g)<input inputMode="decimal" value={meal.carbs} onChange={e=>setMeal(m=>({...m,carbs:e.target.value}))}/></label>
    <label>Fats (g)<input inputMode="decimal" value={meal.fats} onChange={e=>setMeal(m=>({...m,fats:e.target.value}))}/></label>
    <label>Calories (optional)<input inputMode="decimal" value={meal.calories} onChange={e=>setMeal(m=>({...m,calories:e.target.value}))} placeholder="Calculated if blank"/></label>
   </div>
   <button className="a3-cta" onClick={logMeal}>Add meal</button>
  </section>
  <section className="a3-card a3-stack">
   <div className="a3-head"><h2>Your targets</h2></div>
   <p className="a3-muted">Set the numbers you want to track against. Leave a field blank to track without a target.</p>
   <div className="a3-fields">
    <label>Protein (g)<input inputMode="decimal" value={tv.protein} onChange={e=>setTv(v=>({...v,protein:e.target.value}))}/></label>
    <label>Calories<input inputMode="decimal" value={tv.calories} onChange={e=>setTv(v=>({...v,calories:e.target.value}))}/></label>
    <label>Carbs (g)<input inputMode="decimal" value={tv.carbs} onChange={e=>setTv(v=>({...v,carbs:e.target.value}))}/></label>
    <label>Fats (g)<input inputMode="decimal" value={tv.fats} onChange={e=>setTv(v=>({...v,fats:e.target.value}))}/></label>
    <label>Water (L)<input inputMode="decimal" value={tv.water} onChange={e=>setTv(v=>({...v,water:e.target.value}))}/></label>
   </div>
   <button className="a3-cta a3-cta-ghost" onClick={saveTargets}>Save targets</button>
  </section>
  </>}
 </div>
}
function Today({s,onNav,onStart}:{s:AppState;onNav:(r:string)=>void;onStart:(w:Workout)=>void}){
 const read=readiness(s);
 const ins=homeInsights(s);
 const day=nutritionDay(s);
 const targets=s.nutrition?.targets||{};
 const focus=s.workouts.find(w=>w.status==='in_progress')||s.workouts.find(w=>w.scheduledDate===today()&&['planned','rescheduled'].includes(w.status));
 const dateLabel=new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
 const pct=(v:number,t?:number)=>t&&t>0?Math.min(100,Math.round(v/t*100)):null;
 return <div className="a3-home a3-today">
  <SegTabs route="today" onNav={onNav}/>
  <section className="a3-hero a3-today-hero" aria-label="Today">
   <ApexImage kind="group-training" alt="" className="a3-hero-image" eager/>
   <ApexRidge/>
   <div className="a3-hero-body">
    <span className="a3-eyebrow a3-gold">{dateLabel}</span>
    <h2>{focus?niceName(focus.name):'Recovery and review'}</h2>
    <p className="a3-meta"><Icon name="activity" size={14}/>Readiness · {read.label}</p>
    <p className="a3-muted">{read.detail}</p>
    <button className="a3-cta" onClick={()=>focus?onStart(focus):onNav('train')}>{focus?(focus.status==='in_progress'?'Resume Workout':'Start Workout'):'Open Train'}<Icon name="arrow" size={18}/></button>
   </div>
  </section>
  <div className="a3-rings">
   <ApexRing value={pct(day.proteinG,targets.proteinG)} label="Protein" sub={targets.proteinG?`${Math.round(day.proteinG)} / ${targets.proteinG} g`:`${Math.round(day.proteinG)} g logged`} onClick={()=>onNav('nutrition')}/>
   <ApexRing value={pct(day.waterL,targets.waterL)} label="Water" sub={targets.waterL?`${day.waterL} / ${targets.waterL} L`:`${day.waterL} L logged`} onClick={()=>onNav('nutrition')}/>
  </div>
  {ins.length>0&&<section className="a3-block"><div className="a3-head"><h2>Signals</h2><button className="a3-link" onClick={()=>onNav('coach')}>Coach <Icon name="arrow" size={14}/></button></div>
   <div className="a3-list">{ins.slice(0,2).map((x,i)=><article className="a3-card a3-row" key={i}><span className={`badge ${x.kind}`}>{x.kind}</span><div><strong>{x.title}</strong><p>{displayText(x.detail)}</p></div></article>)}</div>
  </section>}
  <button className="a3-card a3-row a3-tap" onClick={()=>onNav('nutrition')}><span className="a3-rowicon"><Icon name="activity"/></span><span><strong>Nutrition</strong><small>{day.meals} meal{day.meals===1?'':'s'} · {Math.round(day.calories)} kcal today</small></span><Icon name="chev"/></button>
 </div>
}
function ApexStat({label,value,unit}:{label:string;value:string;unit?:string}){return <div className="a3-card a3-stat"><span className="a3-eyebrow">{label}</span><strong>{value}{unit&&<small>{unit}</small>}</strong></div>}
function ApexRing({value,label,sub,onClick}:{value:number|null;label:string;sub?:string;onClick?:()=>void}){
 const pct=value===null?0:Math.max(0,Math.min(100,value));const r=34,c=2*Math.PI*r;
 const body=<><svg className="a3-ring" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r={r}/><circle cx="40" cy="40" r={r} className="a3-ring-fill" strokeDasharray={c} strokeDashoffset={c*(1-pct/100)}/></svg><span className="a3-ring-value">{value===null?'—':`${pct}%`}</span><span className="a3-ring-copy"><strong>{label}</strong>{sub&&<small>{sub}</small>}</span></>;
 return onClick?<button className="a3-card a3-ring-card a3-tap" onClick={onClick}>{body}</button>:<div className="a3-card a3-ring-card">{body}</div>
}
function ApexMeter({value}:{value:number}){return <div className="a3-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><i style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div>}


function recommendationFor(ex:Exercise,s:AppState){
  return personalizedLoad(ex,s.workouts,s.profile,s.exercises,today());
}

function hydrateWorkoutRecommendations(w:Workout,s:AppState):Workout{
  const next=structuredClone(w);
  const now=new Date().toISOString();
  const existing=next.guidedSession;

  next.guidedSession={
    ...(existing||{}),
    phase:existing?.phase||'prep',
    exerciseIndex:existing?.exerciseIndex||0,
    setIndex:existing?.setIndex||0,
    completedSetIds:existing?.completedSetIds||[],
    skippedSetIds:existing?.skippedSetIds||[],
    skippedExerciseIds:existing?.skippedExerciseIds||[],
    substitutions:existing?.substitutions||{},
    workingLoads:existing?.workingLoads||{},
    recommendations:existing?.recommendations||{},
    sessionEquipment:existing?.sessionEquipment||{},
    setFeedback:existing?.setFeedback||{},
    calibration:existing?.calibration||{},
    pausedTotalSec:existing?.pausedTotalSec||0,
    updatedAt:now,
    version:existing?.version||1
  };

  next.exercises=next.exercises.map(we=>{
    const ex=s.exercises.find(e=>e.id===we.exerciseId);
    if(!ex)return we;

    const rec=recommendationFor(ex,s);
    const isExternal=!["bodyweight","none","time","assistance"].includes(ex.loadSemantics);
    const availability=loadAvailability(ex,s.profile);
    const safeRec=isExternal
      ?snapToAvailableLoad(ex,rec.weight,s.profile)
      :rec.weight;

    const invalidLoaded=isExternal&&(
      we.recommendedWeight===0 ||
      (we.recommendedWeight!==undefined&&!Number.isFinite(we.recommendedWeight))
    );

    const recommendationWeight=safeRec!==undefined?safeRec:rec.weight;
    const nextWeight=isExternal
      ?(recommendationWeight!==undefined
          ?recommendationWeight
          :we.recommendedWeight)
      :we.recommendedWeight;

    /*
     * A workout created before a long break carries the load that was current then. On the FIRST hydration of the
     * workout the return-to-training load replaces those pre-filled, uncompleted loads so the set screen and the
     * recommendation agree. Later hydrations (resume) never overwrite what the athlete has since chosen.
     */
    const applyReturnLoad=isExternal&&!!(rec as any).returnToTraining&&!existing?.recommendations?.[ex.id]&&nextWeight!==undefined;
    const nextSets=we.sets.map(set=>{
      if(!isExternal||set.completed)return set;
      if(applyReturnLoad)return {...set,weight:nextWeight,loadDetail:loadDetailForSet(ex,nextWeight,{...(set.loadDetail||{}),totalKg:undefined,stackKg:undefined,perHandKg:undefined} as any)};
      if(set.weight!==undefined&&set.weight>0)return set;
      if(nextWeight!==undefined)return {...set,weight:nextWeight};
      return set;
    });

    const calibrationState=rec.kind==='calibration'
      ?'calibrating'
      :'established';

    next.guidedSession={
      ...completeGuidedSession(next.guidedSession),
      recommendations:{
        ...(next.guidedSession?.recommendations||{}),
        [ex.id]:({
          weight:recommendationWeight,
          confidence:rec.confidence,
          kind:rec.kind,
          reason:rec.reason,
          evidence:(rec as any).evidence,
          targetRir:rec.targetRir,
          loadSemantics:ex.loadSemantics,
          incrementKg:availability.incrementKg,
          generatedAt:now
        } as any)
      },
      calibration:{
        ...(next.guidedSession?.calibration||{}),
        [ex.id]:next.guidedSession?.calibration?.[ex.id]||calibrationState
      }
    };

    return {
      ...we,
      sets:nextSets,
      recommendedWeight:
        isExternal
          ?(nextWeight!==undefined?nextWeight:(invalidLoaded?undefined:we.recommendedWeight))
          :we.recommendedWeight,
      note:
        isExternal
          ?`${rec.kind==='calibration'?'Initial calibration':'Evidence-based recommendation'} · ${rec.reason}`
          :we.note
    };
  });

  return next;
}

function ensureGuidedSession(w:Workout):Workout{
  if(w.guidedSession)return w;
  return {
    ...w,
    guidedSession:{
      phase:'prep',
      exerciseIndex:0,
      setIndex:0,
      completedSetIds:[],
      skippedSetIds:[],
      skippedExerciseIds:[],
      substitutions:{},
      workingLoads:{},
      recommendations:{},
      sessionEquipment:{},
      setFeedback:{},
      calibration:{},
      pausedTotalSec:0,
      updatedAt:new Date().toISOString(),
      version:1
    }
  };
}


function defaultGuidedSession(): NonNullable<Workout['guidedSession']>{
  return {
    phase:'prep',
    exerciseIndex:0,
    setIndex:0,
    completedSetIds:[],
    skippedSetIds:[],
    skippedExerciseIds:[],
    substitutions:{},
    workingLoads:{},
    sessionEquipment:{},
    recommendations:{},
    setFeedback:{},
    calibration:{},
    pausedTotalSec:0,
    updatedAt:new Date().toISOString(),
    version:1
  };
}

function completeGuidedSession(value?:Workout['guidedSession']):NonNullable<Workout['guidedSession']>{
  return {
    ...defaultGuidedSession(),
    ...(value||{})
  } as NonNullable<Workout['guidedSession']>;
}

function App(){
 const [s,setS]=useState<AppState>(()=>repository.load()),[route,setRoute]=useState('home'),[sheet,setSheet]=useState<string|null>(null),[query,setQuery]=useState(''),[splash,setSplash]=useState(true),[hydrated,setHydrated]=useState(false),[recovery,setRecovery]=useState<RecoveryNotice|null>(null);
 const routeHistory=useRef<string[]>([]);
 const routeRef=useRef(route);
 useEffect(()=>{window.scrollTo({top:0,behavior:'instant'})},[route]);
 const sheetRef=useRef<string|null>(sheet);
 const stateRef=useRef(s);
 const lifecycleBusy=useRef(false);
 const backgroundPausedWorkoutId=useRef<string|undefined>(undefined);

 useEffect(()=>{stateRef.current=s},[s]);

 const persistState=async(next:AppState)=>{
   stateRef.current=next;
   await repository.saveAsync({...next,activeRoute:routeRef.current});
 };

 const update=(fn:(x:AppState)=>AppState)=>{
   setS(x=>{
     const next=fn(structuredClone(x));
     stateRef.current=next;
     return next;
   });
 };

 useEffect(()=>{routeRef.current=route},[route]);
 useEffect(()=>{sheetRef.current=sheet},[sheet]);

 /*
  * Keyboard-safe form behavior.
  * Android's IME can resize the WebView without automatically keeping the
  * focused control above a sticky workout action area. Keep the active
  * editable control visible after focus and while the visual viewport changes.
  */
 useEffect(()=>{
   const isEditable=(element:Element|null)=>{
     if(!element)return false;
     const tag=element.tagName.toLowerCase();
     if(tag==='textarea'||tag==='select')return true;
     if(tag!=='input')return false;
     const type=(element as HTMLInputElement).type;
     return !['button','checkbox','radio','range','submit','reset','file','hidden'].includes(type);
   };

   let scrollTimer:number|undefined;
   const keepFocusedVisible=()=>{
     const active=document.activeElement;
     if(!isEditable(active))return;

     window.clearTimeout(scrollTimer);
     scrollTimer=window.setTimeout(()=>{
       try{
         (active as HTMLElement).scrollIntoView({
           block:'center',
           inline:'nearest',
           behavior:s.preferences.reducedMotion?'auto':'smooth'
         });
       }catch{
         (active as HTMLElement).scrollIntoView();
       }
     },120);
   };

   const onFocusIn=(event:FocusEvent)=>{
     if(isEditable(event.target as Element|null))keepFocusedVisible();
   };

   document.addEventListener('focusin',onFocusIn);
   const viewport=window.visualViewport;
   viewport?.addEventListener('resize',keepFocusedVisible);
   viewport?.addEventListener('scroll',keepFocusedVisible);

   return()=>{
     document.removeEventListener('focusin',onFocusIn);
     viewport?.removeEventListener('resize',keepFocusedVisible);
     viewport?.removeEventListener('scroll',keepFocusedVisible);
     window.clearTimeout(scrollTimer);
   };
 },[s.preferences.reducedMotion]);

 const nav=(r:string)=>{
   const current=routeRef.current;

   if(r===current){
     setSheet(null);
     window.scrollTo({top:0,behavior:'instant'});
     return;
   }

   routeHistory.current=[
     ...routeHistory.current,
     current
   ].filter((value,index,array)=>
     index===0||value!==array[index-1]
   ).slice(-30);

   setRoute(r);
   setSheet(null);
   window.scrollTo({top:0,behavior:'instant'});
 };

 const goBack=()=>{
   if(sheetRef.current){
     setSheet(null);
     return;
   }

   const previous=routeHistory.current.pop();

   if(previous){
     setRoute(previous);
     window.scrollTo({top:0,behavior:'instant'});
     return;
   }

   if(routeRef.current!=='home'){
     setRoute('home');
     window.scrollTo({top:0,behavior:'instant'});
     return;
   }

   void CapacitorApp.exitApp();
 };
 useEffect(()=>{let live=true;repository.loadAsync().then(next=>{if(live){setS(next);setRoute(next.activeRoute||'home');setRecovery(repository.recoveryNotice());setHydrated(true)}}).catch(()=>setHydrated(true));return()=>{live=false}},[]);
 useEffect(()=>{
   let listener:{remove:()=>Promise<void>}|undefined;

   void CapacitorApp.addListener(
     'backButton',
     ()=>{
       goBack();
     }
   ).then(handle=>{listener=handle});

   return()=>{
     if(listener)void listener.remove();
   };
 },[]);

 /*
  * Session resilience:
  * - The active workout is persisted continuously through the normal state effect.
  * - Android backgrounding pauses the active session and freezes timestamp-based
  *   work/rest timers so returning to APEX restores the exact point of interruption.
  * - Foreground recovery never advances the exercise or set automatically.
  * - A process kill may prevent the background callback from running, so the
  *   continuously persisted checkpoint remains the final source of truth.
  */
 useEffect(()=>{
   if(!hydrated)return;

   let appListener:{remove:()=>Promise<void>}|undefined;

   const pauseForBackground=async()=>{
     if(lifecycleBusy.current)return;
     lifecycleBusy.current=true;

     try{
       const currentState=stateRef.current;
       const activeWorkout=currentState.workouts.find(
         x=>x.id===currentState.activeWorkoutId&&x.status==='in_progress'
       );

       if(!activeWorkout||activeWorkout.pausedAt)return;

       const at=new Date().toISOString();
       const guidedAny=activeWorkout.guidedSession as any;
       const nowMs=Date.now();

       const restStartedAt=guidedAny?.restStartedAt as string|undefined;
       const restTargetSec=Number(guidedAny?.restTargetSec)||0;
       const restRemaining=restStartedAt&&restTargetSec>0
         ?Math.max(0,restTargetSec-Math.floor((nowMs-new Date(restStartedAt).getTime())/1000))
         :undefined;

       const workStartedAt=guidedAny?.workStartedAt as string|undefined;
       const workTargetSec=Number(guidedAny?.workTargetSec)||0;
       const workRemaining=workStartedAt&&workTargetSec>0
         ?Math.max(0,workTargetSec-Math.floor((nowMs-new Date(workStartedAt).getTime())/1000))
         :undefined;

       const paused=pauseWorkoutSession(
         activeWorkout,
         'background',
         at
       );

       const nextWorkout={
         ...paused,
         guidedSession:paused.guidedSession
           ?{
              ...paused.guidedSession,
              updatedAt:at,
              lastCheckpointAt:at,
              ...(restRemaining!==undefined?{pausedRestRemainingSec:restRemaining}:{}),
              ...(workRemaining!==undefined?{pausedWorkRemainingSec:workRemaining}:{}),
              ...(restStartedAt?{pausedRestTargetSec:restTargetSec}:{}),
              ...(workStartedAt?{pausedWorkTargetSec:workTargetSec}:{}),
              ...(restStartedAt?{restStartedAt:undefined,restTargetSec:undefined}:{}),
              ...(workStartedAt?{workStartedAt:undefined,workTargetSec:undefined}:{})
            } as any
           :paused.guidedSession
       };

       const nextState={
         ...currentState,
         activeRoute:'workout',
         activeWorkoutId:activeWorkout.id,
         workouts:currentState.workouts.map(
           x=>x.id===activeWorkout.id?nextWorkout:x
         ),
         eventLog:[
           ...(currentState.eventLog||[]),
           {
             id:uid('evt'),
             type:'workout_backgrounded',
             timestamp:at,
             payload:{
               workoutId:activeWorkout.id,
               phase:activeWorkout.guidedSession?.phase,
               exerciseIndex:activeWorkout.guidedSession?.exerciseIndex,
               setIndex:activeWorkout.guidedSession?.setIndex
             }
           }
         ]
       };

       backgroundPausedWorkoutId.current=activeWorkout.id;
       await persistState(nextState);
       setS(nextState);
     }finally{
       lifecycleBusy.current=false;
     }
   };

   const recoverFromBackground=async()=>{
     if(lifecycleBusy.current)return;
     lifecycleBusy.current=true;

     try{
       const currentState=stateRef.current;
       const persistedBackgroundWorkout=currentState.workouts.find(
         x=>x.status==='in_progress'&&
           x.pausedAt&&
           x.pauseReason==='background'
       );
       const id=backgroundPausedWorkoutId.current||persistedBackgroundWorkout?.id;
       if(!id)return;

       const activeWorkout=currentState.workouts.find(
         x=>x.id===id&&x.status==='in_progress'
       );
       if(!activeWorkout||!activeWorkout.pausedAt)return;

       const at=new Date().toISOString();
       const guidedAny=activeWorkout.guidedSession as any;
       const resumed=resumeWorkoutSession(activeWorkout,at);
       const resumedGuided=resumed.guidedSession
         ?{...resumed.guidedSession} as any
         :undefined;

       if(resumedGuided){
         const pausedRestRemaining=Number(guidedAny?.pausedRestRemainingSec);
         const pausedRestTarget=Number(guidedAny?.pausedRestTargetSec);
         const pausedWorkRemaining=Number(guidedAny?.pausedWorkRemainingSec);
         const pausedWorkTarget=Number(guidedAny?.pausedWorkTargetSec);

         if(
           Number.isFinite(pausedRestRemaining)&&
           Number.isFinite(pausedRestTarget)&&
           pausedRestTarget>0
         ){
           resumedGuided.restStartedAt=new Date(
             Date.now()-(pausedRestTarget-pausedRestRemaining)*1000
           ).toISOString();
           resumedGuided.restTargetSec=pausedRestTarget;
         }

         if(
           Number.isFinite(pausedWorkRemaining)&&
           Number.isFinite(pausedWorkTarget)&&
           pausedWorkTarget>0
         ){
           resumedGuided.workStartedAt=new Date(
             Date.now()-(pausedWorkTarget-pausedWorkRemaining)*1000
           ).toISOString();
           resumedGuided.workTargetSec=pausedWorkTarget;
         }

         delete resumedGuided.pausedRestRemainingSec;
         delete resumedGuided.pausedRestTargetSec;
         delete resumedGuided.pausedWorkRemainingSec;
         delete resumedGuided.pausedWorkTargetSec;
         resumedGuided.lastCheckpointAt=at;
         resumedGuided.updatedAt=at;
       }

       const recovered=recoverWorkoutSession({
         ...resumed,
         guidedSession:resumedGuided,
         updatedAt:at
       });

       const nextState={
         ...currentState,
         activeRoute:'workout',
         activeWorkoutId:id,
         workouts:currentState.workouts.map(
           x=>x.id===id?recovered:x
         ),
         eventLog:[
           ...(currentState.eventLog||[]),
           {
             id:uid('evt'),
             type:'workout_recovered',
             timestamp:at,
             payload:{
               workoutId:id,
               phase:recovered.guidedSession?.phase,
               exerciseIndex:recovered.guidedSession?.exerciseIndex,
               setIndex:recovered.guidedSession?.setIndex
             }
           }
         ]
       };

       await persistState(nextState);
       setS(nextState);
       setRoute('workout');
       routeRef.current='workout';
       backgroundPausedWorkoutId.current=undefined;
     }finally{
       lifecycleBusy.current=false;
     }
   };

   void CapacitorApp.addListener(
     'appStateChange',
     ({isActive})=>{
       if(isActive)void recoverFromBackground();
       else void pauseForBackground();
     }
   ).then(handle=>{appListener=handle});

   /*
    * If Android reclaimed the WebView while APEX was in the background,
    * there is no in-memory ref left. Recover from the persisted background
    * pause marker on the first hydrated render.
    */
   const persistedBackgroundWorkout=stateRef.current.workouts.find(
     x=>x.status==='in_progress'&&
       x.pausedAt&&
       x.pauseReason==='background'
   );
   if(persistedBackgroundWorkout){
     backgroundPausedWorkoutId.current=persistedBackgroundWorkout.id;
     void recoverFromBackground();
   }

   const visibility=()=>{
     if(document.visibilityState==='hidden')void pauseForBackground();
     else if(document.visibilityState==='visible')void recoverFromBackground();
   };

   document.addEventListener('visibilitychange',visibility);

   return()=>{
     document.removeEventListener('visibilitychange',visibility);
     if(appListener)void appListener.remove();
   };
 },[hydrated]);

 useEffect(()=>{const t=setTimeout(()=>setSplash(false),3400);return()=>clearTimeout(t)},[]);
 useEffect(()=>{if(s.onboardingComplete){const m=markMissedWorkouts(s.workouts,today());if(JSON.stringify(m)!==JSON.stringify(s.workouts))setS(x=>({...x,workouts:m}));}},[]);
 useEffect(()=>{if(hydrated)void repository.saveAsync({...s,activeRoute:route})},[s,route,hydrated]);
 useEffect(()=>{if(hydrated)void syncLocalNotifications({...s,activeRoute:route})},[s.preferences.notifications,s.workouts,hydrated,route]);
 useEffect(()=>{let dispose:(()=>Promise<void>)|undefined; if(hydrated)void listenForNotificationActions(r=>nav(r)).then(fn=>{dispose=fn}); return()=>{if(dispose)void dispose()};},[hydrated]);
 const start=(w:Workout)=>{
  if(w.status==='in_progress'){
    update(x=>{
      const now=new Date().toISOString();
      const prepared=hydrateWorkoutRecommendations(ensureGuidedSession({...w,updatedAt:now}),x);
      return {
        ...x,
        activeWorkoutId:w.id,
        activeRoute:'workout',
        workouts:x.workouts.map(q=>q.id===w.id?{...q,...prepared}:q)
      };
    });
    nav('workout');
    return;
  }

  update(x=>{
    const now=new Date().toISOString();
    const prepared=hydrateWorkoutRecommendations(
      ensureGuidedSession({...w,updatedAt:now}),
      x
    );
    return {
      ...x,
      workouts:x.workouts.map(q=>q.id===w.id?{
        ...q,
        ...prepared,
        status:w.status,
        startedAt:undefined,
        updatedAt:now
      }:q)
    };
  });

  nav('brief:'+w.id);
};

 setUnits(s.preferences.units);
 const active=s.workouts.find(w=>w.id===s.activeWorkoutId&&w.status==='in_progress');
 const appClass=`app ${accessibilityClass(s.preferences.fontScale,s.preferences.highContrast,s.preferences.reducedMotion)}`;
 const appStyle={fontSize:`${fontScaleValue(s.preferences.fontScale)}em`};
 if(!hydrated&&!splash)return <div className={`app ${accessibilityClass(s.preferences.fontScale,s.preferences.highContrast,s.preferences.reducedMotion)}`} data-theme={s.preferences.theme||'apex'}><LoadingPanel/></div>;
 if(hydrated&&recovery)return <div className={appClass} style={appStyle} data-theme={s.preferences.theme||'apex'}><RecoveryGate notice={recovery} onRecovered={next=>{setS(next);setRoute(next.activeRoute||'home');setRecovery(null)}} onFresh={next=>{setS(next);setRoute('home');setRecovery(null)}}/></div>;
 if(!s.onboardingComplete)return <div className={appClass} style={appStyle} data-theme={s.preferences.theme||'apex'}>{splash&&<Splash message={hydrated?'Set up your training context…':'Restoring local training data…'}/>}<Onboarding onDone={(p,g,plan)=>{const ws=makeInitialWorkouts(p,plan,s.exercises);const linked={...plan,days:plan.days.map((d:any)=>d.rest?d:{...d,workoutId:ws.find((w:Workout)=>w.scheduledDate===todayPlus(d.dayIndex)&&w.name===d.label)?.id})};setS(x=>({...x,profile:p,goals:[g],plan:linked,workouts:ws,onboardingComplete:true,activeRoute:'home'}));nav('home')}}/></div>;
 return <div className={`app ${accessibilityClass(s.preferences.fontScale,s.preferences.highContrast,s.preferences.reducedMotion)}`} style={{fontSize:`${fontScaleValue(s.preferences.fontScale)}em`}} data-theme={s.preferences.theme||'apex'}>{splash&&<Splash/>}
 <header className="topbar" data-apex-header><button className="brand apex-brand" aria-label="APEX Home" onClick={()=>nav('home')}><img src="/brand/apex-mark-gold.png"/><span>APEX</span></button><div className="brand-caption">TRAIN · TRACK · PROGRESS · EVOLVE</div><div className="apex-top-status"><i/> SYSTEM READY</div><div className="top-actions"><button className="a3-iconbtn" title="Profile" aria-label="Profile" onClick={()=>nav('you')}><Icon name="user"/></button><button className="a3-iconbtn command-trigger" title="Command Center" aria-label="Command Center" onClick={()=>setSheet('command')}><Icon name="search"/></button></div></header>
 <main className="main">
 <div className="page-transition screen-page" data-apex-route={route} key={route}>
 {route==='home'&&<Home s={s} onNav={nav} onStart={start}/>}
 {route==='train'&&<Train s={s} onStart={start} onNav={nav} update={update}/>}
 {route.startsWith('brief:')&&<PreWorkout s={s} id={route.slice(6)} update={update} onStart={(w)=>{update(x=>{const now=new Date().toISOString();const prepared=hydrateWorkoutRecommendations(ensureGuidedSession({...w,status:'in_progress',startedAt:w.startedAt||now,updatedAt:now}),x);return {...x,activeWorkoutId:w.id,activeRoute:'workout',workouts:x.workouts.map(q=>q.id===w.id?{...q,...prepared}:q)}});nav('workout')}} onBack={()=>nav('train')}/>}
 {route==='workout'&&active&&<WorkoutView s={s} w={active} update={update} onExit={()=>nav('home')} onExercise={id=>setSheet('exercise:'+id)} onDone={w=>{if(!hasLoggedSets(w)){const at=new Date().toISOString();update(x=>({...x,activeRoute:'home',workouts:x.workouts.map(q=>q.id===w.id?abandonWorkout(w,at):q),activeWorkoutId:undefined,eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'workout_abandoned',timestamp:at,payload:{workoutId:w.id,reason:'no sets logged'}}]}));nav('home');return}const previous=s.workouts.filter(q=>q.status==='completed'&&q.id!==w.id);const achievements=detectAchievements(w,s.exercises,previous);update(x=>{const completed={...w,status:'completed' as const,completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};const next=x.workouts.filter(q=>q.status==='planned'&&q.planId===w.planId&&q.scheduledDate>=today()).sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate))[0];const adapted=next?applyWorkoutAdaptation(next,s.exercises,[...previous,w]):undefined;return{...x,activeRoute:'home',workouts:x.workouts.map(q=>q.id===w.id?completed:q.id===adapted?.id?adapted:q),activeWorkoutId:undefined,achievements:[...x.achievements,...achievements.map(a=>({id:uid('ach'),workoutId:w.id,...a,timestamp:new Date().toISOString()}))],observations:buildObservations(x),eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'workout_completed',timestamp:new Date().toISOString(),payload:{workoutId:w.id,nextWorkoutId:adapted?.id}}]}});nav('session:'+w.id)}}/>}
 {route.startsWith('session:')&&<SessionReview s={s} id={route.slice(8)} onNav={nav} update={update}/>}
 {route==='progress'&&<Progress s={s} onNav={nav}/>}
 {route==='history'&&<History s={s} onNav={nav}/>}
 {route==='goals'&&<Goals s={s} update={update}/>}
 {route==='measurements'&&<Measurements s={s} update={update}/>}
 {route==='plan'&&<PlanStudio s={s} update={update} onStart={start}/>}
 {route==='library'&&<Library s={s} query={query} setQuery={setQuery} onExercise={id=>setSheet('exercise:'+id)}/>}
 {route==='you'&&<You s={s} nav={nav} update={update}/>}
 {route==='coach'&&<Coach s={s} update={update} onNav={nav}/>}
 {route==='today'&&<Today s={s} onNav={nav} onStart={start}/>}
 {route==='nutrition'&&<Nutrition s={s} update={update}/>}
 {route==='learn'&&<Learn/>}
 {route==='templates'&&<Templates s={s} update={update} onStart={start}/>}
 </div>
 </main>
 <nav className="bottom premium-bottom-nav"><NavItem active={route==='home'} icon="home" label="Home" click={()=>nav('home')}/><NavItem active={route==='train'||route==='workout'} icon="train" label="Train" click={()=>nav(active?'workout':'train')}/><NavItem active={['progress','history','goals'].includes(route)||route.startsWith('session:')} icon="chart" label="Progress" click={()=>nav('progress')}/><NavItem active={route==='you'} icon="user" label="You" click={()=>nav('you')}/></nav>
 {sheet==='command'&&<Command nav={nav} setQuery={setQuery} close={()=>setSheet(null)}/>}
 {sheet?.startsWith('exercise:')&&(()=>{const ex=s.exercises.find(e=>e.id===sheet.slice(9));return ex?<ExerciseSheet ex={ex} s={s} close={()=>setSheet(null)} onAlternative={id=>setSheet('exercise:'+id)} onUse={()=>{setSheet(null);nav('train')}}/>:<Modal title="Exercise unavailable" close={()=>setSheet(null)}><p className="modal-copy">This exercise is no longer available in the current local knowledge set.</p></Modal>})()}
 </div>
}

function makeInitialWorkouts(p:UserProfile,plan:any,exercises:Exercise[]){const ids=plan.exerciseSets as Record<string,string[]>;return plan.days.filter((d:any)=>!d.rest).map((d:any,i:number)=>{const label=String(d.label);const list=label.includes('UPPER')?ids.upper:label.includes('LOWER')?ids.lower:ids.full;const w=createWorkout(label,todayPlus(d.dayIndex),list.slice(0,Math.min(7,list.length)),exercises,plan.id,'scheduled',1);w.originalPlanVersion=plan.version;w.currentPlanVersion=plan.version;return w;});}
function todayPlus(offset:number){const d=new Date();d.setDate(d.getDate()+offset);return d.toISOString().slice(0,10)}

function Onboarding({onDone}:{onDone:(p:UserProfile,g:Goal,plan:any)=>void}){

  const [step,setStep]=useState(0);
  const [name,setName]=useState('');
  const [exp,setExp]=useState<'beginner'|'intermediate'|'advanced'|null>(null);
  const [goal,setGoal]=useState<GoalKind|null>(null);
  const [days,setDays]=useState<number|null>(null);
  const [mins,setMins]=useState<number|null>(null);
  const [equipment,setEquipment]=useState<string[]>([]);
  const [building,setBuilding]=useState(false);
  const [error,setError]=useState('');

  const goalText:Record<GoalKind,string>={
    strength:'Get Stronger',
    hypertrophy:'Build Muscle',
    fat_loss:'Get Leaner',
    fitness:'Stay Fit',
    general:'Train Balanced'
  };
  const goalNote:Record<GoalKind,string>={
    strength:'Increase strength',
    hypertrophy:'Gain muscle mass',
    fat_loss:'Reduce body fat',
    fitness:'General fitness',
    general:'Flexible balanced training'
  };
  const goalIcon:Record<GoalKind,string>={strength:'bolt',hypertrophy:'layers',fat_loss:'target',fitness:'activity',general:'shield'};

  const togg=(x:string)=>{
    setError('');
    setEquipment(a=>
      a.includes(x)
        ? a.filter(q=>q!==x)
        : [...a,x]
    );
  };

  const canContinue =
    step===0 ||
    (step===1 && !!exp) ||
    (step===2 && !!goal) ||
    (step===3 && !!days && !!mins);

  const continueOnboarding=()=>{
    setError('');

    if(step===1 && !exp){
      setError('Choose your training experience to continue.');
      return;
    }

    if(step===2 && !goal){
      setError('Choose your training goal to continue.');
      return;
    }

    if(step===3 && (!days || !mins)){
      setError('Choose your training days and typical session length to continue.');
      return;
    }

    setStep(x=>Math.min(4,x+1));
  };

  const buildMyPlan=()=>{
    if(building)return;

    setError('');

    if(!exp||!goal||!days||!mins||equipment.length===0){
      setError('Choose your training experience, goal, schedule and at least one equipment option.');
      return;
    }

    setBuilding(true);

    try{
      const now=new Date().toISOString();

      const p:UserProfile={
        id:uid('user'),
        name:name.trim(),
        experience:exp,
        goals:[goal],
        primaryGoal:goal,
        trainingDays:days,
        sessionMinutes:mins,
        equipment:[...equipment],
        body:{},
        createdAt:now
      };

      const g:Goal={
        id:uid('goal'),
        kind:goal,
        title:goalText[goal],
        priority:1,
        periodId:uid('period'),
        status:'active'
      };

      /*
       * Build the deterministic training plan.
       * The training engine remains the source of truth.
       */
      const built=buildPlan(
        p,
        EXERCISES,
        [g]
      );

      if(
        !built ||
        !Array.isArray(built.days) ||
        !built.exerciseSets
      ){
        throw new Error('APEX could not generate a valid training plan.');
      }

      const plan={
        id:uid('plan'),
        name:built.name,
        mode:'continuous' as const,
        days:built.days,
        version:1,
        createdAt:now,
        updatedAt:now,
        exerciseSets:built.exerciseSets
      };

      /*
       * Build workouts only from exercise IDs that actually exist.
       * This prevents a bad exercise reference from crashing onboarding.
       */
      const ws=makeInitialWorkouts(
        p,
        plan,
        EXERCISES
      );

      if(!ws.length){
        throw new Error(
          'APEX could not create any workouts from the selected equipment.'
        );
      }

      /*
       * Link generated plan days to their actual workout IDs.
       */
      const linked={
        ...plan,
        days:plan.days.map((d:any)=>{
          if(d.rest)return d;

          const matching=ws.find(
            (w:Workout)=>
              w.scheduledDate===todayPlus(d.dayIndex) &&
              w.name===d.label
          );

          return {
            ...d,
            workoutId:matching?.id
          };
        })
      };

      /*
       * Hand the complete validated onboarding result back to App.
       */
      onDone(
        p,
        g,
        linked
      );

      setBuilding(false);

    }catch(err){

      console.error(
        '[APEX] onboarding plan generation failed',
        err
      );

      setBuilding(false);

      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong while building your APEX plan. Please try again.'
      );
    }
  };

  return (
    <div className={`onboarding ${step===0?'is-intro':''}`}>
      <ApexImage kind={step===0?'strength-session':'training-floor'} alt="" className="a3-onb-bg" eager/>
      <ApexRidge className="a3-onb-ridge"/>

      <div className="onboard-progress-meta"><span>SETUP</span><strong>{String(step+1).padStart(2,'0')} / 05</strong></div>

      <div className="onboard-brand">
        <img
          src="/brand/apex-mark-gold.png"
          alt="APEX"
        />
        <span>APEX</span>
      </div>

      <div className="progress-line">
        <i
          style={{
            width:`${((step+1)/5)*100}%`
          }}
        />
      </div>

      {step===0&&(
        <div className="onboard-body a3-intro">
          <img className="a3-intro-mark" src="/brand/apex-mark-gold.png" alt="APEX"/>
          <h1>Stronger you,<br/>with discipline.</h1>
          <p>Small steps.<br/>Real progress.<br/>Lasting results.</p>
        </div>
      )}

      {step===1&&(
        <div className="onboard-body">
          <span className="a3-eyebrow">
            CONTEXT / 02
          </span>

          <h1>
            Just enough context.
          </h1>

          <label>
            Name

            <input
              value={name}
              onChange={e=>setName(e.target.value)}
              placeholder="Optional"
            />
          </label>

          <div className="choice-grid">

            <button
              type="button"
              className={exp==='beginner'?'selected':''}
              onClick={()=>setExp('beginner')}
            >
              <strong>Beginner</strong>
              <small>
                New or returning to structured training
              </small>
            </button>

            <button
              type="button"
              className={exp==='intermediate'?'selected':''}
              onClick={()=>setExp('intermediate')}
            >
              <strong>Intermediate</strong>
              <small>
                Consistent training experience
              </small>
            </button>

            <button
              type="button"
              className={exp==='advanced'?'selected':''}
              onClick={()=>setExp('advanced')}
            >
              <strong>Advanced</strong>
              <small>
                Established training history
              </small>
            </button>

          </div>
        </div>
      )}

      {step===2&&(
        <div className="onboard-body">

          <span className="a3-eyebrow">
            GOAL / 03
          </span>

          <h1>
            What’s your goal?
          </h1>
          <p>Choose your primary focus.</p>

          <div className="choice-grid a3-goals">

            {(Object.keys(goalText) as GoalKind[]).map(g=>(
              <button
                type="button"
                className={`a3-goalcard ${goal===g?'selected':''}`}
                onClick={()=>setGoal(g)}
                key={g}
              >
                <span className="a3-goalicon"><Icon name={goalIcon[g]}/></span>
                <span className="a3-goaltext">
                  <strong>{goalText[g]}</strong>
                  <small>{goalNote[g]}</small>
                </span>
              </button>
            ))}

          </div>
        </div>
      )}

      {step===3&&(
        <div className="onboard-body">

          <span className="a3-eyebrow">
            SCHEDULE / 04
          </span>

          <h1>
            Build around real availability.
          </h1>

          <label>
            Training days
          </label>

          <div className="choice-grid compact">

            {[2,3,4,5,6].map(v=>(
              <button
                type="button"
                className={days===v?'selected':''}
                key={v}
                onClick={()=>setDays(v)}
              >
                <strong>{v}</strong>
                <small>days / week</small>
              </button>
            ))}

          </div>

          <label>
            Typical session
          </label>

          <div className="choice-grid compact">

            {[30,45,60,75,90].map(v=>(
              <button
                type="button"
                className={mins===v?'selected':''}
                key={v}
                onClick={()=>setMins(v)}
              >
                <strong>{v}</strong>
                <small>minutes</small>
              </button>
            ))}

          </div>

        </div>
      )}

      {step===4&&(
        <div className="onboard-body">

          <span className="a3-eyebrow">
            EQUIPMENT / 05
          </span>

          <h1>
            What can you train with?
          </h1>

          <div className="choice-grid equipment">

            {[
              'machine',
              'cable',
              'dumbbell',
              'barbell',
              'bench',
              'kettlebell',
              'bodyweight'
            ].map(x=>(
              <button
                type="button"
                className={
                  equipment.includes(x)
                    ?'selected'
                    :''
                }
                key={x}
                onClick={()=>togg(x)}
              >
                <strong>{x}</strong>

                <small>
                  {
                    equipment.includes(x)
                      ?'Available'
                      :'Not selected'
                  }
                </small>
              </button>
            ))}

          </div>

          {error&&(
            <div
              className="a3-card a3-callout a3-error onboarding-error"
              role="alert"
            >
              <Icon name="bolt"/>

              <div>
                <strong>
                  Couldn't build your plan
                </strong>

                <p>
                  {error}
                </p>
              </div>
            </div>
          )}

        </div>
      )}

      <div className="onboard-footer">

        <button
          type="button"
          className="a3-cta a3-cta-ghost"
          disabled={!step||building}
          onClick={()=>setStep(x=>x-1)}
        >
          Back
        </button>

        {step===0?(
          <div className="a3-intro-nav">
            <span className="a3-dots" aria-hidden="true"><i className="on"/><i/><i/><i/></span>
            <button type="button" className="a3-arrowbtn" aria-label="Continue" disabled={!canContinue} onClick={continueOnboarding}><Icon name="arrow" size={22}/></button>
          </div>
        ):step<4?(
          <button
            type="button"
            className="a3-cta"
            disabled={!canContinue}
            onClick={continueOnboarding}
          >
            Continue
            <Icon name="chev"/>
          </button>
        ):(
          <button
            type="button"
            className="a3-cta"
           disabled={building||!exp||!goal||!days||!mins||!equipment.length}
            onClick={buildMyPlan}
          >
            {building
              ?'Building your plan…'
              :'Build my APEX plan'
            }

            {!building&&<Icon name="bolt"/>}
          </button>
        )}

      </div>

    </div>
  );
}

function Home({s,onNav,onStart}:{s:AppState;onNav:(r:string)=>void;onStart:(w:Workout)=>void}){
 const active=s.workouts.find(w=>w.status==='in_progress');
 const todayW=s.workouts.find(w=>w.scheduledDate===today()&&['planned','rescheduled'].includes(w.status));
 const goal=s.goals.find(g=>g.status==='active');
 const read=readiness(s);
 const ins=homeInsights(s);
 const recent=s.workouts.filter(w=>w.status==='completed').sort((a,b)=>String(b.completedAt||b.updatedAt||'').localeCompare(String(a.completedAt||a.updatedAt||''))).slice(0,4);
 const focus=active||todayW;
 const focusExercise=focus?.exercises?.find(x=>x.sets?.some(set=>!set.completed));
 const focusEx=focusExercise?s.exercises.find(e=>e.id===focusExercise.exerciseId):undefined;
 const focusSet=focusExercise?.sets?.find(set=>!set.completed);
 const gp=goal?goalProgress(s,goal):undefined;
 const evidence=coachEvidenceFromState(s,today());
 const coachResult=coach({context:evidence.context,plateaus:evidence.plateaus,state:s,profile:s.profile,goals:s.goals,primaryGoal:s.profile?.primaryGoal,planId:s.plan?.id,workoutId:focus?.id,workout:focus,exerciseId:focusEx?.id,exercise:focusEx,workoutExercise:focusExercise,setId:focusSet?.id,set:focusSet,recentWorkoutIds:recent.map(w=>w.id),recentExerciseEntryIds:[],now:new Date().toISOString()});
 const decision=coachResult.decision;
  const hour=new Date().getHours();
 const greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
 const firstName=(s.profile?.name||'').trim().split(' ')[0];
 const dateLabel=new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'long'}).replace(/^([A-Za-z]+) /,'$1, ');
 const consistency=consistencySummary(s);
 const weekAgo=Date.now()-7*86400000;
 const weekDone=s.workouts.filter(w=>w.status==='completed'&&new Date(w.completedAt||w.scheduledDate).getTime()>=weekAgo);
 const weekVolume=vol(weekDone.reduce((n,w)=>n+volumeForWorkout(w,s.exercises),0));
 const volumeLabel=weekVolume>=1000?(weekVolume/1000).toFixed(1)+'K':String(weekVolume);
 const focusMuscles=focus?[...new Set(focus.exercises.flatMap(we=>s.exercises.find(e=>e.id===we.exerciseId)?.primaryMuscles||[]))].slice(0,3):[];
 const kicker=active?'In progress':todayW?'Today’s workout':'Next up';
 const weekDays=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7)+i);const iso=d.toISOString().slice(0,10);return {iso,label:'MTWTFSS'[i],on:s.workouts.some(w=>w.status==='completed'&&String(w.completedAt||w.scheduledDate).slice(0,10)===iso),today:iso===today()}});
 return <div className="home-screen a3-home">
   <header className="a3-greet"><span className="a3-eyebrow">{dateLabel}</span><h1>{firstName?<>{greeting},<br/>{firstName}.</>:`${greeting}.`}</h1></header>

   <section className="a3-hero" aria-label="Daily briefing">
    <ApexImage kind={focusEx?imageKindForExercise(focusEx):'training-floor'} alt="" className="a3-hero-image" eager/>
    <ApexRidge/>
    <div className="a3-hero-body">
     <span className="a3-eyebrow a3-gold">{kicker}</span>
     <h2>{focus?niceName(focus.name):'No session scheduled'}</h2>
     {focusMuscles.length>0&&<p className="a3-muted">{focusMuscles.map(x=>x.replace(/_/g,' ')).join(' · ')}</p>}
     <p className="a3-meta"><Icon name="clock" size={14}/>{focus?`${focus.exercises.length} exercises${s.profile?.sessionMinutes?` · ~${s.profile.sessionMinutes} min`:''}`:'Build a session in Train'}</p>
     <button className="a3-cta" onClick={()=>focus?onStart(focus):onNav('train')}>{focus?(active?'Resume Workout':'Start Workout'):'Open Train'}<Icon name="arrow" size={18}/></button>
    </div>
   </section>

   <div className="a3-stats">
    <ApexStat label="Streak" value={String(consistency.streak)} unit="days"/>
    <ApexStat label="This week" value={String(weekDone.length)} unit="sessions"/>
    <ApexStat label="Volume" value={volumeLabel} unit={weightLabel()}/>
   </div>

    <div className="a3-card a3-week"><div className="a3-head"><span className="a3-eyebrow">This week</span><small className="a3-muted">{weekDone.length} session{weekDone.length===1?'':'s'}</small></div><div className="a3-week-days">{weekDays.map(d=><span key={d.iso} className={`${d.on?'on':''} ${d.today?'today':''}`} aria-label={`${d.iso}${d.on?' trained':''}`}><i/>{d.label}</span>)}</div></div>

   <article className="a3-card a3-coach">
    <span className="a3-coach-mark"><Icon name="spark" size={20}/></span>
    <div>
     <span className="a3-eyebrow a3-gold">Coach insight</span>
     <h3>{focusEx?.name||displayText(decision.prescription?.instruction||'APEX is ready.')}</h3>
     <p>{focusEx&&focusSet?`${focusSet.type||'Working set'} · ${focusSet.reps||'—'} reps · ${focusSet.weight!==undefined?`${wt(focusSet.weight)} ${weightLabel()}`:'—'} load`:displayText(coachResult.explanation)}</p>
     <small>{displayText(decision.prescription?.instruction||`Readiness: ${read.label}. Follow the current prescription and record what actually happens.`)}</small>
     <button className="a3-link" onClick={()=>onNav('coach')}>Ask Coach <Icon name="arrow" size={14}/></button>
    </div>
   </article>

   <div className="a3-rings">
    <ApexRing value={consistency.rate} label="Consistency" sub={`${consistency.completed} sessions · 30d`}/>
    {goal&&<ApexRing value={gp?.percent??null} label={goal.title} sub={gp?.status||'Active goal'} onClick={()=>onNav('goals')}/>}
   </div>

   {ins.length>0&&<section className="a3-block"><div className="a3-head"><h2>Signals</h2></div>
    <div className="a3-list">{ins.slice(0,3).map((x,i)=><article className="a3-card a3-row" key={i}><span className={`badge ${x.kind}`}>{x.kind}</span><div><strong>{x.title}</strong><p>{displayText(x.detail)}</p></div></article>)}</div>
   </section>}

   <section className="a3-block"><div className="a3-head"><h2>Recent training</h2><button className="a3-link" onClick={()=>onNav('history')}>History <Icon name="arrow" size={14}/></button></div>
    <div className="a3-list">{recent.map((w,i)=><button className="a3-card a3-row a3-tap" key={w.id} onClick={()=>onNav(`session:${w.id}`)}><span className="a3-index">{String(i+1).padStart(2,'0')}</span><div><strong>{w.name}</strong><p>{w.completedAt?.slice(0,10)||w.scheduledDate} · {w.exercises.length} exercises</p></div><Icon name="arrow" size={16}/></button>)}{!recent.length&&<Empty title="No completed sessions yet" text="Your completed training record will appear here."/>}</div>
   </section>

    <div className="a3-tools"><button className="a3-card a3-tap" onClick={()=>onNav('today')}><Icon name="calendar"/>Today</button><button className="a3-card a3-tap" onClick={()=>onNav('nutrition')}><Icon name="activity"/>Nutrition</button></div>
 </div>
}

function Train({s,onStart,onNav,update}:{s:AppState;onStart:(w:Workout)=>void;onNav:(r:string)=>void;update:(f:(x:AppState)=>AppState)=>void}){
 const upcoming=s.workouts.filter(w=>w.status==='planned'||w.status==='rescheduled').sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate));
 const extra=s.workouts.filter(w=>w.source==='extra');
 const todayWorkout=upcoming.find(w=>w.scheduledDate===today());
 const nextWorkout=upcoming[0];
 const [reschedule,setReschedule]=useState<Workout|null>(null),[date,setDate]=useState(today());
 const createExtra=()=>{const ids=s.exercises.slice(0,5).map(e=>e.id);const w=createCustomWorkout('Extra Session',today(),ids,s.exercises);w.source='extra';w.status='planned';update(x=>({...x,workouts:[...x.workouts,w],eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'extra_workout_created',timestamp:new Date().toISOString(),payload:{workoutId:w.id}}]}));onStart(w)};
 const commitReschedule=()=>{if(!reschedule||!date)return;const pair=rescheduleWorkoutWithEvent(reschedule,date);update(x=>({...x,workouts:x.workouts.map(w=>w.id===pair.original.id?pair.original:w).concat(pair.replacement),eventLog:[...(x.eventLog||[]),pair.event]}));setReschedule(null)};
 const completed=s.workouts.filter(w=>w.status==='completed').length;
 const activeW=s.workouts.find(w=>w.status==='in_progress');
 const focus=activeW||todayWorkout||nextWorkout;
 const isActive=!!activeW;
 const rows=(focus?.exercises||[]).map((we,i)=>{
   const ex=s.exercises.find(e=>e.id===we.exerciseId);
   if(!ex)return null;
   const rec=recommendationFor(ex,s);
   const load=formatLoad(ex,we.recommendedWeight??rec.weight);
   const fit=equipmentFit(ex,s.profile?.equipment);
   const alts=smartAlternatives(ex,s.exercises,s.profile?.equipment).length;
   const done=we.sets.filter(x=>x.completed).length;
   return {we,ex,i,rec,load,fit,alts,done};
 }).filter(Boolean) as Array<{we:Workout['exercises'][number];ex:Exercise;i:number;rec:ReturnType<typeof recommendationFor>;load:string;fit:ReturnType<typeof equipmentFit>;alts:number;done:number}>;
 const activeRow=rows.findIndex(r=>r.done<r.we.sets.length);
 const totalSets=rows.reduce((n,r)=>n+r.we.sets.length,0);
 const doneSets=rows.reduce((n,r)=>n+r.done,0);
 const sessionPct=totalSets?Math.round(doneSets/totalSets*100):0;
 const fitLabel={available:'Equipment ready',unknown:'Check equipment',unavailable:'Equipment unavailable'} as const;
 const kicker=isActive?'In progress':todayWorkout?'Today’s session':nextWorkout?'Next session':'Train';
 const briefRoute=focus?`brief:${focus.id}`:'plan';
 if(!focus&&!upcoming.length&&!completed)return <div className="train-screen a3-home"><StateView kind="empty" title="No Workouts Yet" text="Your journey starts here. Create your first workout and build your momentum." primary={{label:'Start Your First Workout',onClick:()=>onNav('plan')}}/></div>;
 return <div className="train-screen a3-home">
  <header className="a3-greet"><span className="a3-eyebrow">Train · {completed} sessions logged</span><h1>{focus?niceName(focus.name):'Plan your next session.'}</h1></header>

  <section className="a3-card a3-session">
   <div className="a3-session-head">
    <div><span className="a3-eyebrow a3-gold">{kicker}</span><p className="a3-meta"><Icon name="clock" size={14}/>{focus?`${focus.exercises.length} exercises${s.profile?.sessionMinutes?` · ~${s.profile.sessionMinutes} min`:''} · ${focus.scheduledDate===today()?'Today':focus.scheduledDate}`:'No session scheduled'}</p></div>
    <div className="a3-session-pct"><strong>{sessionPct}%</strong><small>{doneSets}/{totalSets} sets</small></div>
   </div>
   <ApexMeter value={sessionPct}/>
   <button className="a3-cta" onClick={()=>focus?onStart(focus):onNav('plan')}>{focus?(isActive?'Resume Workout':'Start Workout'):'Open Plan Studio'}<Icon name={focus?'play':'arrow'} size={18}/></button>
   <div className="a3-session-actions">
    {focus&&!isActive&&<button className="a3-link" onClick={()=>onNav(briefRoute)}>Session brief &amp; swaps <Icon name="arrow" size={14}/></button>}
    <button className="a3-link" onClick={createExtra}>Extra session <Icon name="plus" size={14}/></button>
   </div>
  </section>

  {rows.length>0&&<section className="a3-block"><div className="a3-head"><h2>Exercises</h2><span className="a3-eyebrow">{rows.length} movements</span></div>
   <div className="a3-list">{rows.map(r=><article className={`a3-card a3-exercise ${r.done>=r.we.sets.length?'is-done':r.i===activeRow?'is-active':''}`} key={r.we.exerciseId+r.i}>
    <div className="a3-exthumb"><ApexImage kind={imageKindForExercise(r.ex)} alt=""/><em>{String(r.i+1).padStart(2,'0')}</em></div>
    <div className="a3-exercise-body">
     <strong>{r.ex.name}</strong>
     <p>{r.we.prescribedSets} × {r.we.repRange[0]}–{r.we.repRange[1]} {r.ex.loadSemantics==='time'?'sec':'reps'}</p>
     <dl className="a3-spec"><div><dt>Load</dt><dd>{r.load}</dd></div><div><dt>Reps</dt><dd>{r.we.repRange[0]}–{r.we.repRange[1]}</dd></div><div><dt>RIR</dt><dd>{r.rec.targetRir}</dd></div></dl>
     <div className="a3-exercise-foot">
      <span className={`a3-chip a3-fit-${r.fit}`}>{fitLabel[r.fit]}</span>
      <span className={`a3-chip a3-state ${r.done>=r.we.sets.length?'is-done':r.i===activeRow?'is-active':''}`}>{r.done>=r.we.sets.length?'Done':r.i===activeRow?(isActive?'Active':'Next up'):'Up next'}</span>
      {r.done>0&&<span className="a3-chip">{r.done}/{r.we.sets.length} sets</span>}
      {!isActive&&r.alts>0&&<button className="a3-link" onClick={()=>onNav(briefRoute)}>{r.alts} substitute{r.alts===1?'':'s'}</button>}
     </div>
    </div>
   </article>)}</div>
  </section>}

  <div className="a3-rings">
   <div className="a3-card a3-stat"><span className="a3-eyebrow">Queue</span><strong>{upcoming.length}<small>planned</small></strong></div>
   <div className="a3-card a3-stat"><span className="a3-eyebrow">Logged</span><strong>{completed}<small>sessions</small></strong></div>
  </div>

  <section className="a3-block"><div className="a3-head"><h2>Up next</h2><span className="a3-eyebrow">{upcoming.length} scheduled</span></div>
   <div className="a3-list">{upcoming.slice(0,8).map((w,i)=><article className="a3-card a3-queue" key={w.id}><button className="a3-queue-main" onClick={()=>onStart(w)}><span className="a3-index">{w.scheduledDate===today()?'NOW':i===0?'NEXT':w.scheduledDate.slice(5)}</span><span><strong>{w.name}</strong><small>{w.exercises.length} exercises · {w.source} · v{w.version}{w.status==='rescheduled'?' · rescheduled':''}</small></span><Icon name="arrow" size={16}/></button><div className="a3-queue-actions"><button className="mini-btn" onClick={()=>{setReschedule(w);setDate(w.scheduledDate)}}>Move</button><button className="mini-btn" onClick={()=>update(x=>({...x,workouts:x.workouts.map(q=>q.id===w.id?{...q,status:'skipped',updatedAt:new Date().toISOString()}:q)}))}>Skip</button></div></article>)}{!upcoming.length&&<Empty title="Queue is clear" text="Use Plan Studio to build your next block or create a quick session."/>}</div>
  </section>

  <div className="a3-tools"><button className="a3-card a3-tap" onClick={()=>onNav('plan')}><Icon name="calendar"/>Plan Studio</button><button className="a3-card a3-tap" onClick={()=>onNav('templates')}><Icon name="layers"/>Templates</button><button className="a3-card a3-tap" onClick={()=>onNav('library')}><Icon name="search"/>Library</button><button className="a3-card a3-tap" onClick={()=>onNav('coach')}><Icon name="spark"/>Coach</button></div>

  {extra.length>0&&<section className="a3-block"><div className="a3-head"><h2>Extra work</h2></div><div className="a3-list">{extra.slice(-5).reverse().map(w=><button className="a3-card a3-row a3-tap" key={w.id} onClick={()=>onStart(w)}><span className="a3-index">+</span><div><strong>{w.name}</strong><p>{w.scheduledDate} · {w.status}</p></div><Icon name="arrow" size={16}/></button>)}</div></section>}
  {reschedule&&<Modal title="Reschedule session" close={()=>setReschedule(null)}><p className="modal-copy">The original event remains auditable as rescheduled. The replacement becomes a separate scheduled event.</p><label>New date<input type="date" value={date} min={today()} onChange={e=>setDate(e.target.value)}/></label><button className="button primary wide" onClick={commitReschedule}>Confirm new date</button></Modal>}
 </div>
}

function PreWorkout({s,id,onStart,onBack,update}:{s:AppState;id:string;onStart:(w:Workout)=>void;onBack:()=>void;update:(f:(x:AppState)=>AppState)=>void}){
 const source=s.workouts.find(x=>x.id===id);
 const read=readiness(s);
 const [energy,setEnergy]=useState<number|null>(null);
 const [note,setNote]=useState('');
 const [replace,setReplace]=useState<string|null>(null);
 const [rq,setRq]=useState('');

 if(!source)return <Empty title="Session unavailable" text="This training event is no longer available."/>;

 const w=source;
 const validEntries=w.exercises.map((we,index)=>({
   we,
   index,
   ex:s.exercises.find(e=>e.id===we.exerciseId)
 })).filter(x=>!!x.ex) as Array<{we:Workout['exercises'][number];index:number;ex:Exercise}>;

 const requirements=validEntries.flatMap(({we,ex})=>(ex.equipment||[])
   .filter(item=>item&&item!=='none'&&item!=='bodyweight')
   .map(item=>({exerciseId:we.exerciseId,exerciseName:ex.name,item,key:`${we.exerciseId}::${item}`}))
 );

 const equipmentLabels:Record<string,string>={
   machine:'Machines',
   cable:'Cable Station',
   dumbbell:'Dumbbells',
   barbell:'Barbell',
   bench:'Bench',
   kettlebell:'Kettlebell',
   resistance_band:'Resistance Band',
   band:'Resistance Band',
   pullup_bar:'Pull-up Bar',
   dip_station:'Dip Station',
   smith_machine:'Smith Machine',
   ez_bar:'EZ Bar',
   trap_bar:'Trap Bar',
   plate:'Weight Plates'
 };

 const label=(x:string)=>equipmentLabels[x]||x.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

 const requirementKey=(exerciseId:string,item:string)=>`${exerciseId}::${item}`;
 const statusFor=(exerciseId:string,item:string):'confirmed'|'profile_available'|'unavailable'|undefined=>
   w.guidedSession?.sessionEquipment?.[requirementKey(exerciseId,item)] as 'confirmed'|'profile_available'|'unavailable'|undefined;

 const resolved=requirements.every(({exerciseId,item})=>{
   const status=statusFor(exerciseId,item);
   return status==='confirmed'||status==='unavailable';
 });

 const unavailable=requirements.filter(({exerciseId,item})=>statusFor(exerciseId,item)==='unavailable');
 const readyToStart=resolved&&unavailable.length===0;

 const affectedExercises=(exerciseId:string)=>
   validEntries.filter(({we})=>we.exerciseId===exerciseId);

 const replaceTarget=replace?s.exercises.find(e=>e.id===replace):undefined;
 const sessionUnavailable=useMemo(
   ()=>new Set(
     Object.entries(w.guidedSession?.sessionEquipment||{})
       .filter(([,status])=>status==='unavailable')
       .map(([key])=>key.includes('::')?key.slice(key.indexOf('::')+2):key)
   ),
   [w.guidedSession?.sessionEquipment]
 );

 const alternativeRank=(source:Exercise,candidate:Exercise)=>{
   const samePattern=candidate.pattern===source.pattern;
   const sameLoad=candidate.loadSemantics===source.loadSemantics;
   const sameFamily=candidate.family===source.family;
   const lowerEquipment=candidate.equipment.length<source.equipment.length;
   const unavailableCandidate=candidate.equipment.some(e=>sessionUnavailable.has(e));
   const fit=equipmentFit(candidate,s.profile?.equipment);

   if(unavailableCandidate||fit==='unavailable')return -10000;

   let score=0;
   if(fit==='available')score+=1000;
   else if(fit==='unknown')score+=500;
   if(samePattern)score+=120;
   if(sameLoad)score+=80;
   if(sameFamily)score+=50;
   if(candidate.alternatives.includes(source.id))score+=30;
   if(lowerEquipment)score+=10;
   return score;
 };

 const alternativeReason=(source:Exercise,candidate:Exercise)=>{
   const samePattern=candidate.pattern===source.pattern;
   const sameLoad=candidate.loadSemantics===source.loadSemantics;
   const lowerEquipment=candidate.equipment.length<source.equipment.length;
   if(samePattern&&sameLoad)return 'Closest movement match';
   if(samePattern)return 'Similar movement pattern';
   if(lowerEquipment)return 'Lower equipment requirement';
   return 'Good movement substitute';
 };

 const alternativeConsequence=(source:Exercise,candidate:Exercise)=>{
   const comparable=
     candidate.pattern===source.pattern &&
     candidate.loadSemantics===source.loadSemantics &&
     candidate.repRange[1]-candidate.repRange[0]===source.repRange[1]-source.repRange[0];

   return comparable
     ? 'Comparable movement — progression baseline can carry forward'
     : 'New baseline — APEX will recalibrate load and progression';
 };

 const getAlternatives=(source:Exercise,limit=3)=>{
   const candidates=source.alternatives
     .map(id=>s.exercises.find(e=>e.id===id))
     .filter((e):e is Exercise=>Boolean(e));

   const fallback=s.exercises.filter(e=>
     e.id!==source.id &&
     !candidates.some(x=>x.id===e.id)
   );

   return [...candidates,...fallback]
     .filter(e=>e.id!==source.id)
     .filter(e=>!rq||`${e.name} ${e.aliases.join(' ')} ${e.pattern} ${e.primaryMuscles.join(' ')}`.toLowerCase().includes(rq.toLowerCase()))
     .filter(e=>!e.equipment.some(item=>sessionUnavailable.has(item)))
     .filter(e=>equipmentFit(e,s.profile?.equipment)!=='unavailable')
     .sort((a,b)=>alternativeRank(source,b)-alternativeRank(source,a))
     .slice(0,limit);
 };

 const replacementResults=replaceTarget?getAlternatives(replaceTarget,12):[];

 const chooseAlternative=(oldId:string,nextEx:Exercise)=>{
   if(!s.exercises.some(e=>e.id===oldId))return;
   replaceExercise(oldId,nextEx);
 };

 const confirmEquipment=(exerciseId:string,item:string,status:'confirmed'|'unavailable')=>{
   update(state=>{
     const target=state.workouts.find(x=>x.id===w.id);
     if(!target)return state;
     const now=new Date().toISOString();
     const guided=completeGuidedSession(target.guidedSession);
     const next={
       ...target,
       guidedSession:{
         ...guided,
         sessionEquipment:{
           ...(guided.sessionEquipment||{}),
           [requirementKey(exerciseId,item)]:status
         },
         updatedAt:now
       },
       updatedAt:now
     };
     return {...state,workouts:state.workouts.map(x=>x.id===w.id?next:x)};
   });
 };

 const replaceExercise=(oldId:string,nextEx:Exercise)=>{
   update(state=>{
     const target=state.workouts.find(x=>x.id===w.id);
     if(!target)return state;
     const oldEx=state.exercises.find(e=>e.id===oldId);
     const reason=oldEx
       ? `${oldEx.name} unavailable today`
       : 'Original exercise unavailable today';
     const replaced=replaceWorkoutExercise(target,oldId,nextEx,state.exercises);
     const now=new Date().toISOString();
     const oldGuided=completeGuidedSession(target.guidedSession);
     const nextEquipment:Record<string,any>={...(oldGuided.sessionEquipment||{})};
     const next={
       ...replaced,
       guidedSession:{
         ...oldGuided,
         sessionEquipment:nextEquipment,
         updatedAt:now
       },
       updatedAt:now
     };
     return {
       ...state,
       workouts:state.workouts.map(x=>x.id===w.id?next:x),
       eventLog:[
         ...(state.eventLog||[]),
         {
           id:uid('evt'),
           type:'exercise_replaced',
           timestamp:now,
           payload:{
             workoutId:w.id,
             plannedExerciseId:oldId,
             performedExerciseId:nextEx.id,
             from:oldId,
             to:nextEx.id,
             reason,
             source:'session_preparation',
             permanentPlanChanged:false
           }
         }
       ]
     };
   });
   setReplace(null);
   setRq('');
 };

 const first=w.exercises[0];
 const firstEx=first?s.exercises.find(e=>e.id===first.exerciseId):undefined;
 const contextImage=firstEx?imageKindForExercise(firstEx):'training-floor';
 const adaptations=adaptationsForWorkout(s,w);

 const begin=()=>{
   if(!resolved)return;
   const now=new Date().toISOString();
   const updated={
     ...w,
     status:'in_progress' as const,
     startedAt:w.startedAt||now,
     notes:[w.notes,note.trim()].filter(Boolean).join('\n'),
     guidedSession:{
       ...completeGuidedSession(w.guidedSession),
       phase:'ready' as const,
       updatedAt:now
     },
     updatedAt:now
   };
   if(energy!==null){
     updated.notes=[updated.notes,`Pre-session energy: ${energy}/5`].filter(Boolean).join('\n');
   }
   onStart(updated);
 };

 return <div className="a3-home a3-brief">
   <button className="a3-iconbtn" onClick={onBack} aria-label="Back"><Icon name="back"/></button>

   <span className="a3-eyebrow">TODAY</span>
   <h1>{w.name}</h1>
   <p className="a3-muted">{w.exercises.length} exercises · {w.exercises.reduce((a,e)=>a+e.prescribedSets,0)} planned sets</p>
  <ApexImage kind={contextImage} alt="Training context for today's planned session." className="a3-banner" caption="SESSION / CONTEXT"/>

   <section className="a3-card a3-stack">
     <div className="a3-head">
       <div>
         <span className="a3-eyebrow">TODAY'S SESSION</span>
         <h2>{w.name}</h2>
       </div>
     </div>
     <div className="a3-stats">
       <div><strong>{w.exercises.length}</strong><small>exercises</small></div>
       <div><strong>{w.exercises.reduce((a,e)=>a+e.prescribedSets,0)}</strong><small>planned sets</small></div>
     </div>
     <div className="a3-list">
       {validEntries.map(({we,index,ex})=>
         <div className="a3-card a3-row" key={`${we.exerciseId}-${index}`}>
           <span className="a3-index">{String(index+1).padStart(2,'0')}</span>
           <div><strong>{ex.name}</strong><small>{we.prescribedSets} sets · {we.repRange[0]}–{we.repRange[1]} reps</small></div>
         </div>
       )}
       {validEntries.length<w.exercises.length&&
         <div className="a3-card a3-callout">
           <Icon name="settings"/>
           <div><strong>Some exercise data is unavailable.</strong><p>APEX will preserve the workout entry and prevent missing data from crashing the session.</p></div>
         </div>
       }
     </div>
   </section>

   <section className="a3-card a3-stack">
     <span className="a3-eyebrow">EQUIPMENT FOR TODAY</span>
     <h2>Confirm your training floor.</h2>
     <p>Availability is tracked for each exercise requirement. A decision for one movement never marks unrelated exercises available.</p>

     {requirements.length===0
       ?<div className="a3-card a3-callout"><Icon name="check"/><div><strong>No dedicated equipment required.</strong><p>This session can be started without equipment verification.</p></div></div>
       :<div className="a3-list">
         {requirements.map(({exerciseId,exerciseName,item,key})=>{
           const status=statusFor(exerciseId,item);
           const affected=affectedExercises(exerciseId);
           const confirmed=status==='confirmed';
           const unavailableNow=status==='unavailable';
           return <div className={`equipment-check-block equipment-confirm-motion ${confirmed?'confirmed':''} ${unavailableNow?'unavailable':''}`} key={key} data-equipment-state={status||'unconfirmed'} data-exercise-id={exerciseId} data-equipment-item={item}>
             <div className="a3-equip-main">
               <div className="a3-copy">
                 <span className="a3-eyebrow">{exerciseName}</span>
                 <strong>{label(item)} · {confirmed?'CONFIRMED FOR TODAY':unavailableNow?'NOT AVAILABLE':'AVAILABILITY'}</strong>
                 <small>Required equipment for {exerciseName}.</small>
               </div>
               <div className="a3-actions">
                 {!confirmed&&<button className="a3-cta" onClick={()=>confirmEquipment(exerciseId,item,'confirmed')}>Confirm available</button>}
                 {!unavailableNow&&<button className="a3-cta a3-cta-ghost" onClick={()=>confirmEquipment(exerciseId,item,'unavailable')}>Not available</button>}
                 {confirmed&&<button className="a3-pill" onClick={()=>confirmEquipment(exerciseId,item,'unavailable')}>Change</button>}
                 {unavailableNow&&<button className="a3-pill" onClick={()=>confirmEquipment(exerciseId,item,'confirmed')}>Mark available</button>}
               </div>
             </div>

             {unavailableNow&&
               <div className="a3-warn">
                 <strong>Equipment unavailable — APEX found alternatives.</strong>
                 {affected.map(({we,ex})=>{
                   const options=getAlternatives(ex,3);
                   return <div className="a3-stack" key={we.exerciseId}>
                     <div className="a3-copy">
                       <span className="a3-eyebrow">PLANNED</span>
                       <strong>{ex.name}</strong>
                       <small>Unavailable today · your permanent program stays unchanged</small>
                     </div>

                     <div className="a3-list">
                       {options.map((candidate,index)=>{
                         const consequence=alternativeConsequence(ex,candidate);
                         return <button
                           className="a3-card a3-row a3-tap"
                           key={candidate.id}
                           onClick={()=>chooseAlternative(ex.id,candidate)}
                         >
                           <span className="a3-index">{String(index+1).padStart(2,'0')}</span>
                           <span className="a3-copy">
                             <strong>{candidate.name}</strong>
                             <small>{alternativeReason(ex,candidate)}</small>
                             <em>{consequence}</em>
                           </span>
                           <Icon name="chev"/>
                         </button>;
                       })}
                     </div>

                     {!options.length&&
                       <div className="a3-card a3-callout">
                         <Icon name="settings"/>
                         <div>
                           <strong>No safe alternative is available from today's confirmed setup.</strong>
                           <p>Choose another movement or resolve this exercise's required equipment.</p>
                         </div>
                       </div>
                     }

                     <button className="a3-pill" onClick={()=>setReplace(ex.id)}>
                       View more alternatives
                     </button>
                   </div>;
                 })}
               </div>
             }
           </div>;
         })}
       </div>}
   </section>

   {unavailable.length>0&&
     <section className="a3-card a3-stack">
       <span className="a3-eyebrow">SESSION NOT READY</span>
       <strong>Resolve unavailable equipment first.</strong>
       <p>Replace affected exercises or mark the equipment available before starting today's session.</p>
     </section>}

   {adaptations.length>0&&
     <section className="a3-card a3-stack">
       <span className="a3-eyebrow">TODAY'S CONTEXT</span>
       {adaptations.slice(0,3).map((a,i)=><div className="a3-line" key={i}><strong>{a.title}</strong><small>{displayText(a.detail)}</small></div>)}
     </section>}

   {firstEx&&
     <section className="a3-card a3-stack">
       <span className="a3-eyebrow">FIRST MOVEMENT</span>
       <strong>{firstEx.name}</strong>
       <p>{firstEx.repRange[0]}–{firstEx.repRange[1]} reps · {firstEx.restSec}s rest · {(() => {
         const rec=recommendationFor(firstEx,s);
         return rec.weight!==undefined ? formatLoad(firstEx,rec.weight) : 'Calibration set required';
       })()}</p>
     </section>}

   <section className="a3-card a3-stack">
     <span className="a3-eyebrow">LOAD GUIDANCE</span>
     {firstEx&&(() => {
       const rec=recommendationFor(firstEx,s);
       return <>
         <strong>{rec.weight!==undefined?`Suggested start · ${formatLoad(firstEx,rec.weight)}`:'Start with a controlled calibration set'}</strong>
         <small>{displayText(rec.reason)}</small>
         <small>{displayText(((rec as any).evidence||[]).join(' · '))} · Target RIR {rec.targetRir}</small>
         {(() => {
           const availability=loadAvailability(firstEx,s.profile);
           return availability.options.length
             ?<small>Available load options · {availability.options.map(o=>wt(o)).join(' · ')} {weightLabel()}</small>
             :<small>Load availability · {displayText(availability.reason)}</small>;
         })()}
         <small>{rec.kind==='calibration'?'CONFIDENCE · INITIAL':'CONFIDENCE · '+rec.confidence.toUpperCase()}</small>
       </>;
     })()}
     {!firstEx&&<small>Exercise data is unavailable, so APEX will not invent a load recommendation.</small>}
   </section>

   <section className="a3-card a3-stack">
     <span className="a3-eyebrow">OPTIONAL CHECK-IN</span>
     <h3>How ready do you feel?</h3>
     <div className="a3-energy">
       {[1,2,3,4,5].map(v=><button key={v} className={energy===v?'selected':''} onClick={()=>setEnergy(v)}><b>{v}</b><small>{v===1?'Low':v===2?'Below usual':v===3?'Normal':v===4?'Good':'Very good'}</small></button>)}
     </div>
     <label>Anything APEX should know? <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional context — sleep, schedule, technique, etc."/></label>
   </section>

   <button className="a3-cta" disabled={!readyToStart} onClick={begin}>
     {readyToStart?'Session ready · Start training':unavailable.length?'Replace unavailable equipment to continue':'Confirm equipment to continue'}
     <Icon name="chev"/>
   </button>

   {replace&&
     <Modal title={`Replace ${replaceTarget?.name||'exercise'}`} close={()=>{setReplace(null);setRq('')}}>
       <p className="a3-muted">
         Choose a movement for today. This is a <strong>session-only substitution</strong>:
         the permanent program remains unchanged. APEX records Planned → Performed → Reason
         and only carries the progression baseline forward when the movement is demonstrably comparable.
       </p>
       <div className="a3-search"><Icon name="search"/><input autoFocus value={rq} onChange={e=>setRq(e.target.value)} placeholder="Search movement or alias…"/></div>
       <div className="a3-list">
         {replacementResults.map(e=>{
           const fit=equipmentFit(e,s.profile?.equipment);
           const comparable=!!replaceTarget&&
             replaceTarget.pattern===e.pattern&&
             replaceTarget.loadSemantics===e.loadSemantics&&
             e.repRange[1]-e.repRange[0]===replaceTarget.repRange[1]-replaceTarget.repRange[0];
           return <button className="a3-card a3-pick a3-tap" key={e.id} onClick={()=>replaceExercise(replace!,e)}>
             <span>
               <strong>{e.name}</strong>
               <small>{fit==='available'?'Available from your setup':fit==='unknown'?'Confirm equipment for today':'Not in setup'} · {replaceTarget?alternativeReason(replaceTarget,e):'Alternative'} · {e.equipment.join(', ')}</small>
               <em>{replaceTarget?alternativeConsequence(replaceTarget,e):''}</em>
             </span>
             <Icon name="chev"/>
           </button>;
         })}
         {!replacementResults.length&&<Empty title="No suitable alternative found" text="Try another search or keep the original movement and change the equipment choice."/>}
       </div>
     </Modal>
   }
 </div>;
}

function safeExercise(exercises:Exercise[],id:string){return exercises.find(e=>e.id===id);}
const phase6LoadDisplay=(...a:Parameters<typeof phase6LoadDisplayRaw>)=>{const r=phase6LoadDisplayRaw(...a);return {primary:displayText(r.primary),secondary:r.secondary===undefined?undefined:displayText(r.secondary)}};
function phase6LoadDisplayRaw(ex:Exercise,set?:SetLog,fallback?:number,profile?:UserProfile):{primary:string;secondary?:string}{
 if(ex.loadSemantics==='bodyweight')return {primary:'BODYWEIGHT'};
 if(ex.loadSemantics==='none')return {primary:'NO EXTERNAL LOAD'};
 if(ex.loadSemantics==='time'){const seconds=set?.seconds??ex.repRange[0];return {primary:formatTimedDuration(seconds),secondary:`Target ${ex.repRange[0]}–${ex.repRange[1]} sec`};}
 const value=set?.weight??fallback;
 if(value===undefined)return {primary:'CALIBRATION'};
 const detail=loadDetailForSet(ex,value,set?.loadDetail);
 if(ex.loadSemantics==='per_hand'){const total=dumbbellTotalLoad(ex,value);return {primary:`${value} kg / hand`,secondary:total===undefined?undefined:`${total} kg total · ${ex.unilateral?'unilateral':'both hands'}`};}
 if(ex.loadSemantics==='stack')return {primary:`${value} kg stack`,secondary:ex.equipment.includes('cable')&&!ex.equipment.includes('machine')?'Cable stack':'Machine stack'};
 if(ex.equipment.includes('barbell')){const barWeight=profile?.barbellBarKg??detail.barWeightKg;const breakdown=barbellLoadBreakdown(value,barWeight);return {primary:`${value} kg total`,secondary:breakdown.plateLoadKg!==undefined?`${breakdown.barWeightKg} kg bar + ${breakdown.plateLoadKg} kg plates`:'Total load · bar weight not configured'};}
 return {primary:formatLoadDetail(ex,value,detail),secondary:ex.loadDescription};
}

function WorkoutView({s,w,update,onExit,onExercise,onDone}:{s:AppState;w:Workout;update:(f:(x:AppState)=>AppState)=>void;onExit:()=>void;onExercise:(id:string)=>void;onDone:(w:Workout)=>void}){
 const [now,setNow]=useState(Date.now());
 const [replace,setReplace]=useState<string|null>(null);
 const [rq,setRq]=useState('');
 const [history,setHistory]=useState<Workout[]>([]);
 const [safety,setSafety]=useState(false);
 const [overview,setOverview]=useState(false);
 const [menuOpen,setMenuOpen]=useState(false);
 const [logOpen,setLogOpen]=useState(false);
 const [beforeTab,setBeforeTab]=useState<'details'|'history'|'modes'>('details');
 const [motionKey,setMotionKey]=useState(0);
 const previousExerciseRef=useRef<string|undefined>(undefined);
 const previousSetRef=useRef<string|undefined>(undefined);
 const previousPhaseRef=useRef<string|undefined>(undefined);
 const hapticKey=useRef('');

 useEffect(()=>{
   const i=setInterval(()=>setNow(Date.now()),500);
   return()=>clearInterval(i);
 },[]);

 useEffect(()=>{
   setHistory(s.workouts.filter(x=>x.status==='completed'&&x.id!==w.id));
 },[s.workouts,w.id]);

 const current=s.workouts.find(x=>x.id===w.id)||w;
 const assessment=sessionAssessment(current,s.exercises,history);
 const adapt=adaptationsForWorkout(s,current);

 const elapsed=current.startedAt
   ?Math.max(
      0,
      Math.floor((Date.now()-new Date(current.startedAt).getTime())/1000)
      -(current.pausedTotalSec||0)
      -(current.pausedAt?Math.floor((Date.now()-new Date(current.pausedAt).getTime())/1000):0)
    )
   :0;

 const mutate=(fn:(x:Workout)=>Workout)=>update(x=>({
   ...x,
   workouts:x.workouts.map(q=>q.id===current.id?fn(q):q)
 }));

 const normalizeGuided=(ww:Workout):Workout=>{
   const phase=ww.guidedSession?.phase;
   if(phase==='feedback'||phase==='set_active'||phase==='rest')return structuredClone(ww);
   return normalizeGuidedPosition(ww);
 };

 const guided=normalizeGuided(current);
 const phase=guided.guidedSession?.phase||'prep';
 useEffect(()=>{if(phase!=='set_active')setLogOpen(false)},[phase]);
 useEffect(()=>{window.scrollTo(0,0)},[logOpen]);
 const exerciseIndex=guided.guidedSession?.exerciseIndex||0;
 const setIndex=guided.guidedSession?.setIndex||0;
 const activeExercise=guided.exercises[exerciseIndex];
 const activeEx=activeExercise?safeExercise(s.exercises,activeExercise.exerciseId):undefined;
 const activeSet=activeExercise?.sets[setIndex];

 /*
  * Local visual checkpoint. Animation state never changes the persisted
  * workout state; it only lets CSS replay a transition when focus changes.
  */
 useEffect(()=>{
   const exerciseId=activeExercise?.exerciseId;
   const setId=activeSet?.id;

   if(previousExerciseRef.current!==undefined&&previousExerciseRef.current!==exerciseId){
     setMotionKey(x=>x+1);
   }else if(previousSetRef.current!==undefined&&previousSetRef.current!==setId){
     setMotionKey(x=>x+1);
   }else if(previousPhaseRef.current!==undefined&&previousPhaseRef.current!==phase){
     setMotionKey(x=>x+1);
   }

   previousExerciseRef.current=exerciseId;
   previousSetRef.current=setId;
   previousPhaseRef.current=phase;
 },[activeExercise?.exerciseId,activeSet?.id,phase]);

 const all=current.exercises.every(e=>
   e.status==='skipped'||e.sets.every(x=>x.completed)
 );

 const restSeconds=activeEx
   ?recommendedRest(
      activeEx,
      s.preferences.restPreference,
      s.preferences.restCustomSec,
      activeSet?.rir
    )
   :90;

 /*
  * Rest is timestamp based. We deliberately do not use guidedSession.updatedAt
  * as the timer origin because any state update could otherwise reset the clock.
  * These extra fields are persisted on guidedSession without changing the
  * canonical training types.
  */
 const guidedAny=guided.guidedSession as any;
 const restStartedAt=guidedAny?.restStartedAt as string|undefined;
 const restTargetSec=Number(guidedAny?.restTargetSec)||restSeconds;
 const restRemaining=phase==='rest'&&restStartedAt
   ?Math.max(
      0,
      restTargetSec-
      Math.floor((now-new Date(restStartedAt).getTime())/1000)
    )
   :0;
 const workStartedAt=(guided.guidedSession as any)?.workStartedAt as string|undefined;
 const workTargetSec=Number((guided.guidedSession as any)?.workTargetSec)||(activeEx?.loadSemantics==='time'?(activeSet?.seconds??activeEx.repRange[0]??0):0);
 const workRemaining=phase==='set_active'&&activeEx?.loadSemantics==='time'&&workStartedAt&&workTargetSec>0?Math.max(0,workTargetSec-Math.floor((now-new Date(workStartedAt).getTime())/1000)):0;
 const timedWorkComplete=activeEx?.loadSemantics==='time'?workRemaining<=0&&!!workStartedAt:false;

 const targetRir=activeEx
   ?personalizedLoad(activeEx,s.workouts,s.profile,s.exercises,today()).targetRir
   :2;

 const currentRecommendation=activeEx
   ?personalizedLoad(activeEx,s.workouts,s.profile,s.exercises,today())
   :undefined;

 const setGuided=(patch:Partial<NonNullable<Workout['guidedSession']>>,extra?:Record<string,unknown>)=>{
   mutate(ww=>{
     const c=structuredClone(ww);
     c.guidedSession={
        ...completeGuidedSession(c.guidedSession),
        ...patch,
        updatedAt:new Date().toISOString()
      };
     if(extra){
       Object.assign(c.guidedSession as any,extra);
     }
     return c;
   });
 };

 const vibrate=(pattern:number|number[]=[18])=>{
   if(s.preferences.haptics&&typeof navigator!=='undefined'&&'vibrate' in navigator){
     try{navigator.vibrate(pattern);}catch{}
   }
 };

 /*
  * When the timestamp reaches the target, transition exactly once.
  * A short haptic is emitted only when the rest interval actually completes.
  */
 useEffect(()=>{
   if(phase!=='rest'||restRemaining>0)return;
   const key=`${current.id}:${exerciseIndex}:${setIndex}:${restStartedAt||''}`;
   if(hapticKey.current===key)return;
   hapticKey.current=key;
   vibrate([18,45,18]);

   mutate(ww=>continueGuidedAfterRest(ww).workout);
 },[phase,restRemaining,current.id,exerciseIndex,setIndex,restStartedAt,activeExercise]);

 const togglePause=()=>{
   update(state=>{
     const ww=state.workouts.find(q=>q.id===current.id);
     if(!ww)return state;
     const at=new Date().toISOString();
     const paused=!!ww.pausedAt;
     let nextWorkout:Workout;

     if(paused){
       const guidedAny=ww.guidedSession as any;
       const resumed=resumeWorkoutSession(ww,at);
       const guidedResumed=resumed.guidedSession?{...resumed.guidedSession} as any:undefined;
       if(guidedResumed){
         const pr=Number(guidedAny?.pausedRestRemainingSec),pt=Number(guidedAny?.pausedRestTargetSec);
         const pw=Number(guidedAny?.pausedWorkRemainingSec),pwt=Number(guidedAny?.pausedWorkTargetSec);
         if(Number.isFinite(pr)&&Number.isFinite(pt)&&pt>0){guidedResumed.restStartedAt=new Date(Date.now()-(pt-pr)*1000).toISOString();guidedResumed.restTargetSec=pt;}
         if(Number.isFinite(pw)&&Number.isFinite(pwt)&&pwt>0){guidedResumed.workStartedAt=new Date(Date.now()-(pwt-pw)*1000).toISOString();guidedResumed.workTargetSec=pwt;}
         delete guidedResumed.pausedRestRemainingSec; delete guidedResumed.pausedRestTargetSec;
         delete guidedResumed.pausedWorkRemainingSec; delete guidedResumed.pausedWorkTargetSec;
         guidedResumed.lastCheckpointAt=at; guidedResumed.updatedAt=at;
       }
       nextWorkout=recoverWorkoutSession({...resumed,guidedSession:guidedResumed,updatedAt:at});
     }else{
       nextWorkout=pauseWorkoutSession(ww,'user',at);
       const g=nextWorkout.guidedSession as any;
       if(g){
         const nowMs=Date.now();
         const rs=g.restStartedAt as string|undefined, rt=Number(g.restTargetSec)||0;
         const ws=g.workStartedAt as string|undefined, wt=Number(g.workTargetSec)||0;
         const rr=rs&&rt>0?Math.max(0,rt-Math.floor((nowMs-new Date(rs).getTime())/1000)):undefined;
         const wr=ws&&wt>0?Math.max(0,wt-Math.floor((nowMs-new Date(ws).getTime())/1000)):undefined;
         nextWorkout.guidedSession={...g,
           ...(rr!==undefined?{pausedRestRemainingSec:rr,pausedRestTargetSec:rt,restStartedAt:undefined,restTargetSec:undefined}:{}),
           ...(wr!==undefined?{pausedWorkRemainingSec:wr,pausedWorkTargetSec:wt,workStartedAt:undefined,workTargetSec:undefined}:{}),
           lastCheckpointAt:at,updatedAt:at
         } as any;
       }
     }

     return {...state,activeWorkoutId:current.id,activeRoute:'workout',
       workouts:state.workouts.map(q=>q.id===current.id?nextWorkout:q),
       eventLog:[...(state.eventLog||[]),{id:uid('evt'),type:paused?'workout_resumed':'workout_paused',timestamp:at,payload:{workoutId:current.id,reason:'user'}}]};
   });
 };

 const startSet=()=>{
   if(!activeExercise||!activeSet||current.pausedAt)return;

   const recommendation=
     activeEx
       ?personalizedLoad(activeEx,s.workouts,s.profile,s.exercises,today())
       :undefined;

   mutate(ww=>{
     const c=structuredClone(ww);
     const e=c.exercises.find(x=>x.exerciseId===activeExercise.exerciseId);
     const ss=e?.sets.find(x=>x.id===activeSet.id);
     if(!e||!ss)return ww;

     if(ss.weight===undefined&&recommendation?.weight!==undefined&&!['bodyweight','none','time','assistance'].includes(activeEx?.loadSemantics||'')){
       ss.weight=snapToAvailableLoad(activeEx!,recommendation.weight,s.profile);
     }
     if(ss.rir===undefined)ss.rir=recommendation?.targetRir??targetRir;
     if(activeEx)ss.loadDetail=loadDetailForSet(activeEx,ss.weight,ss.loadDetail);
     const at=new Date().toISOString();
     c.guidedSession={...completeGuidedSession(c.guidedSession),phase:'set_active',exerciseIndex,setIndex,updatedAt:at,version:(c.guidedSession?.version||1)+1};
     if(activeEx?.loadSemantics==='time'){
       const duration=Math.max(1,Number(ss.seconds)||activeEx.repRange[0]);
       ss.seconds=duration;
       Object.assign(c.guidedSession as any,{workStartedAt:at,workTargetSec:duration});
     };
     return c;
   });

   vibrate(10);
 };

 const completeGuidedSet=()=>{
   if(!activeExercise||!activeSet||!activeEx||current.pausedAt)return;

   mutate(ww=>completeSet(ww,exerciseIndex,setIndex));
   vibrate([12,30,12]);
 };

 const applyFeedback=(kind:'heavy'|'right'|'easy')=>{
   if(!activeExercise||!activeSet||!activeEx)return;

   mutate(ww=>{
     const at=new Date().toISOString();
     const next=applySetFeedback(
       ww,
       activeEx,
       exerciseIndex,
       setIndex,
       kind,
       s.profile,
       currentRecommendation?.targetRir,
       at
     );

     if(next===ww)return ww;

     const recommendationWeight=
       next.exercises[exerciseIndex]?.sets[setIndex+1]?.weight ??
       next.exercises[exerciseIndex]?.recommendedWeight;

     next.eventLog=[
       ...(next.eventLog||[]),
       {
         id:uid('evt'),
         type:'load_feedback',
         timestamp:at,
         payload:{
           workoutId:next.id,
           exerciseId:activeExercise.exerciseId,
           setId:activeSet.id,
           feedback:kind,
           actualReps:activeSet.reps,
           actualRir:activeSet.rir,
           nextLoad:recommendationWeight
         }
       }
     ];

     return next;
   });
 };

 const continueAfterRest=()=>{
   if(phase!=='rest')return;
   mutate(ww=>continueGuidedAfterRest(ww).workout);
 };

 const advanceToNextExercise=()=>{
   mutate(ww=>advanceGuidedToNextExercise(ww));
 };

 const skipRest=()=>{
   if(phase!=='rest')return;
   hapticKey.current='';
   continueAfterRest();
 };

 const skipCurrentSet=()=>{
   if(!activeExercise||!activeSet||current.pausedAt)return;

   const nextIndex=activeExercise.sets.findIndex(
     (x,i)=>i>setIndex&&!x.completed&&!guided.guidedSession?.skippedSetIds?.includes(x.id)
   );

   const nextExercise=current.exercises.findIndex((e,i)=>
     i>exerciseIndex&&
     e.status!=='skipped'&&
     e.sets.some(x=>!x.completed)
   );

   mutate(ww=>{
     const skipped=markWorkoutSetSkipped(
       ww,
       activeExercise.exerciseId,
       activeSet.id
     );

     const at=new Date().toISOString();
     return {
       ...skipped,
       guidedSession:skipped.guidedSession
         ?{
            ...skipped.guidedSession,
            phase:nextIndex>=0
              ?'set_ready'
              :nextExercise>=0
                ?'exercise_complete'
                :'complete',
            exerciseIndex,
            setIndex:nextIndex>=0
              ?nextIndex
              :setIndex,
            ...(nextExercise>=0?{nextExerciseIndex:nextExercise}:{}),
            updatedAt:at
          }
         :skipped.guidedSession
     };
   });
 };

 const adjustActiveSet=(direction:'up'|'down')=>{
   if(!activeExercise||!activeSet||!activeEx)return;

   const isLoadable=
     !['bodyweight','none','time','assistance'].includes(
       activeEx.loadSemantics
     );

   mutate(ww=>{
     const c=structuredClone(ww);
     const e=c.exercises.find(x=>x.exerciseId===activeExercise.exerciseId);
     const ss=e?.sets.find(x=>x.id===activeSet.id);
     if(!e||!ss)return ww;

     if(isLoadable){
       const currentLoad=
         ss.weight??
         e.recommendedWeight??
         (c.guidedSession as any)?.workingLoads?.[activeEx.id];

       const next=adjacentAvailableLoad(
         activeEx,
         currentLoad,
         s.profile,
         direction
       );

       if(next!==undefined){
         ss.weight=next;
         e.recommendedWeight=next;
         c.guidedSession={
           ...completeGuidedSession(c.guidedSession),
           workingLoads:{
             ...(c.guidedSession?.workingLoads||{}),
             [activeEx.id]:next
           },
           updatedAt:new Date().toISOString(),
           version:(c.guidedSession?.version||1)+1
         };
       }
     }

     return c;
   });
 };

 const adjustReps=(delta:number)=>{
   if(!activeExercise||!activeSet)return;
   mutate(ww=>{
     const c=structuredClone(ww);
     const e=c.exercises.find(x=>x.exerciseId===activeExercise.exerciseId);
     const ss=e?.sets.find(x=>x.id===activeSet.id);
     if(!e||!ss)return ww;

     const currentReps=Number(ss.reps)||activeExercise.repRange[0];
     ss.reps=Math.max(0,currentReps+delta);
     return c;
   });
 };

 const adjustRir=(delta:number)=>{
   if(!activeExercise||!activeSet)return;
   mutate(ww=>{
     const c=structuredClone(ww);
     const e=c.exercises.find(x=>x.exerciseId===activeExercise.exerciseId);
     const ss=e?.sets.find(x=>x.id===activeSet.id);
     if(!e||!ss)return ww;

     const currentRir=
       ss.rir===undefined
         ?targetRir
         :ss.rir;

     ss.rir=Math.max(0,Math.min(5,currentRir+delta));
     return c;
   });
 };

 const finishPhase=()=>{
   if(all){
     setGuided({phase:'complete'});
     return;
   }

   if(phase==='prep'){
     setGuided({phase:'equipment'});
     return;
   }

   if(phase==='equipment'){
     setGuided({phase:'ready'});
     return;
   }

   if(phase==='ready'){
     setGuided({phase:'set_ready'});
     return;
   }

   if(phase==='set_ready'){
     startSet();
     return;
   }

   if(phase==='rest'&&restRemaining<=0){
     continueAfterRest();
   }
 };

 const filtered=s.exercises
   .filter(e=>
     !rq||
     `${e.name} ${e.aliases.join(' ')} ${e.pattern} ${e.primaryMuscles.join(' ')}`
       .toLowerCase()
       .includes(rq.toLowerCase())
   )
   .sort((a,b)=>{
     const ae=replace?s.exercises.find(x=>x.id===replace):undefined;
     const fit=(x:Exercise)=>equipmentFit(x,s.profile?.equipment);
     const score=(x:Exercise)=>(
       (fit(x)==='available'?0:fit(x)==='unknown'?1:2)
       +(ae&&x.pattern===ae.pattern?-2:0)
       +(ae&&x.loadSemantics===ae.loadSemantics?-1:0)
     );
     return score(a)-score(b);
   })
   .slice(0,20);

 const phaseLabel:Record<string,string>={
   prep:'PREP',
   equipment:'EQUIPMENT',
   ready:'READY',
   set_ready:'SET READY',
   set_active:'SET ACTIVE',
   feedback:'FEEDBACK',
   rest:'RECOVER',
   exercise_complete:'EXERCISE COMPLETE',
   complete:'COMPLETE'
 };

 const completedForExercise=activeExercise
   ?activeExercise.sets.filter(x=>x.completed).length
   :0;

 const nextExerciseIndex=Number(
   (guided.guidedSession as any)?.nextExerciseIndex
 );
 const nextExercise=
   Number.isInteger(nextExerciseIndex)&&nextExerciseIndex>=0
     ?current.exercises[nextExerciseIndex]
     :undefined;
 const nextEx=nextExercise
   ?safeExercise(s.exercises,nextExercise.exerciseId)
   :undefined;

 const justDoneExercise=phase==='exercise_complete'&&nextExercise
   ?[...current.exercises.slice(0,nextExerciseIndex)].reverse().find(e=>e.sets.some(x=>x.completed))||activeExercise
   :activeExercise;
 const justDoneEx=justDoneExercise?safeExercise(s.exercises,justDoneExercise.exerciseId):activeEx;
 const restProgress=restTargetSec>0
   ?Math.max(0,Math.min(1,restRemaining/restTargetSec))
   :0;

 const sessionProgress=assessment.plannedSets>0
   ?Math.max(0,Math.min(1,(assessment.completedSets+assessment.skippedSets)/assessment.plannedSets))
   :0;

const onSetType=(t:SetType)=>mutate(x=>{
   const c=structuredClone(x);
   const e=c.exercises.find(
     z=>z.exerciseId===activeExercise!.exerciseId
   );
   const ss=e?.sets.find(z=>z.id===activeSet!.id);
   if(!e||!ss)return x;
   Object.assign(ss,updateSetType(ss,t,activeEx!));
   return c;
 });

 const onSetAdd=()=>mutate(x=>addWorkoutSet(x,activeExercise!.exerciseId,s.exercises,activeSet!));
 const onSetRemove=()=>mutate(x=>removeWorkoutSet(x,activeExercise!.exerciseId,activeSet!.id));

 const logEditor=activeSet&&activeEx?<>
           <SetEditor
             set={activeSet}
             ex={activeEx}
             index={setIndex}
             targetRir={targetRir}
             focused
             loadProfile={s.profile}
             onChange={p=>mutate(x=>{
               const c=structuredClone(x);
               const e=c.exercises.find(
                 z=>z.exerciseId===activeExercise.exerciseId
               );
               const ss=e?.sets.find(z=>z.id===activeSet.id);
               if(!e||!ss)return x;
               Object.assign(ss,p);
               return c;
             })}
             onType={onSetType}
             onComplete={completeGuidedSet}
             onAdd={onSetAdd}
             onRemove={onSetRemove}
             hideOptions={activeEx.loadSemantics!=='time'}
           />

           {activeEx.loadSemantics==='time'&&<div className="a3-reco">
             <span className="a3-eyebrow">WORK TIMER</span>
             <strong aria-live="polite">{workStartedAt?formatTimedDuration(workRemaining):formatTimedDuration(activeSet.seconds??activeEx.repRange[0])}</strong>
             <small>{timedWorkComplete?'Work interval complete. Complete the set when ready.':'Work interval is separate from your recovery timer.'}</small>
           </div>}

           {activeEx.loadSemantics==='time'&&<button
             className="a3-pill"
             onClick={skipCurrentSet}
             disabled={!!current.pausedAt}
           >
             Skip this set
           </button>}
</>:null;
 const logFullscreen=logOpen&&phase==='set_active'&&!!activeSet&&!!activeEx&&activeEx.loadSemantics!=='time';
 if(logFullscreen)return <div className="a3-home a3-workout a3-logscreen">
   <div className="a3-loghead">
     <button type="button" className="a3-iconbtn" aria-label="Back to set" onClick={()=>setLogOpen(false)}><Icon name="back"/></button>
     <div><h2>Log Set</h2><small>{niceName(activeEx!.name)} · Set {setIndex+1} / {activeExercise.sets.length}</small></div>
   </div>
   {logEditor}
 </div>;
 return <div className="a3-home a3-workout">
   <div className="a3-topline">
     <button className="a3-iconbtn" onClick={onExit} aria-label="Exit workout">
       <Icon name="back"/>
     </button>

     <div className="a3-topcopy">
       <span className="a3-eyebrow">
         {phaseLabel[phase]||'WORKOUT'} · {current.scheduledDate}
       </span>
       <h1>{niceName(current.name)}</h1>
     </div>

     <button
       className="a3-iconbtn"
       aria-label={overview?'Focus':'Overview'}
       aria-pressed={overview}
       onClick={()=>setOverview(x=>!x)}
     >
       <Icon name="layers"/>
     </button>
   </div>

   <div className="a3-toolbar">
     <span>{fmt(elapsed)} elapsed</span>
     <span
       className="a3-toolbar-progress"
       style={{'--apex-session-progress':`${sessionProgress*100}%`} as React.CSSProperties}
     >
       <i aria-hidden="true"/>
       {assessment.completedSets}/{assessment.plannedSets} sets
     </span>
     <button className="a3-pill" aria-expanded={menuOpen} aria-controls="a3-session-menu" onClick={()=>setMenuOpen(x=>!x)}>{menuOpen?'Less':'More'}</button>
   </div>
   {menuOpen&&<div className="a3-toolbar a3-menu" id="a3-session-menu">
     <button
       className="a3-pill"
       onClick={()=>mutate(x=>({...x,notes:x.notes||''}))}
     >
       Journal
     </button>
     <button
       className="a3-pill"
       onClick={()=>setSafety(true)}
     >
       Safety
     </button>
     <button
       className="a3-pill"
       aria-label={current.pausedAt?'Resume workout':'Pause workout'}
       onClick={togglePause}
     >
       {current.pausedAt?'Resume':'Pause'}
     </button>
   </div>}

   {current.pausedAt&&
     <div className="a3-card a3-paused">
       <div>
         <span className="a3-eyebrow">SESSION PAUSED</span>
         <strong>Take your time</strong>
         <small>Elapsed time and workout state are preserved.</small>
       </div>
       <div className="a3-actions">
         <button onClick={togglePause}>Resume</button>
       </div>
     </div>
   }

   {!overview&&activeExercise&&activeEx&&
     <section
       className="a3-card a3-focus exercise-transition"
       key={`${activeExercise.exerciseId}-${exerciseIndex}`}
       data-motion-key={motionKey}
     >

       <div className="a3-focus-head">
         <div>
           <span className="a3-eyebrow">
             EXERCISE {String(exerciseIndex+1).padStart(2,'0')} / {current.exercises.length}
           </span>
           <h2>{activeEx.name}</h2>
           <p>
             {activeEx.pattern} · {activeEx.primaryMuscles.join(' · ')}
           </p>
         </div>

         <button
           className="a3-pill"
           onClick={()=>onExercise(activeEx.id)}
         >
           Details
         </button>
       </div>

       {phase==='prep'&&
         <div className="a3-stage">
           <span className="a3-eyebrow">SESSION PREP</span>
           <h3>Today's training is ready.</h3>
           <p>
             APEX has prepared the session from your local training record.
             Review the equipment once, then training becomes focused on one
             movement and one set at a time.
           </p>
           <button
             className="a3-cta"
             onClick={finishPhase}
           >
             Review equipment <Icon name="chev"/>
           </button>
         </div>
       }

       {phase==='equipment'&&
         <div className="a3-stage">
           <span className="a3-eyebrow">EQUIPMENT CHECK</span>
           <h3>Confirm today's setup.</h3>
           <p>
             This confirmation is session-specific. APEX will not repeatedly
             ask about the same confirmed category during this workout.
           </p>

           <div className="a3-list">
             {(activeEx.equipment||[]).length
               ?(activeEx.equipment||[]).map(item=>{
                 const status=
                   current.guidedSession?.sessionEquipment?.[item]||
                   'profile_available';

                 return <button
                   key={item}
                   className={`equipment-check equipment-confirm-motion ${status==='confirmed'?'selected':''}`}
                   data-equipment-state={status}
                   onClick={()=>{
                     mutate(ww=>{
                       const c=structuredClone(ww);
                       c.guidedSession={
                         ...completeGuidedSession(c.guidedSession),
                         sessionEquipment:{
                           ...(c.guidedSession?.sessionEquipment||{}),
                           [item]:
                             status==='confirmed'
                               ?'profile_available'
                               :'confirmed'
                         },
                         updatedAt:new Date().toISOString()
                       };
                       return c;
                     });
                   }}
                 >
                   <span>
                     <strong>
                       {item.replace(/_/g,' ')}
                     </strong>
                     <small>
                       {status==='confirmed'
                         ?'Confirmed for today'
                         :'Available from your profile · tap to confirm'}
                     </small>
                   </span>
                   <Icon name={status==='confirmed'?'check':'chev'}/>
                 </button>;
               })
               :<p className="a3-muted">
                 No dedicated equipment is required for this movement.
               </p>}
           </div>

           <button
             className="a3-cta"
             onClick={finishPhase}
           >
             Continue <Icon name="chev"/>
           </button>
         </div>
       }

       {phase==='ready'&&
         <div className="a3-stage a3-stage-ready">
           <span className="a3-eyebrow">EXERCISE READY</span>
           <h3>Set your position.</h3>
           <div className="a3-tabs" role="tablist" aria-label="Before set">
             {(['details','history','modes'] as const).map(t=><button key={t} role="tab" aria-selected={beforeTab===t} className={beforeTab===t?'active':''} onClick={()=>setBeforeTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}
           </div>
           <div className="a3-atmos a3-stagevisual"><ApexImage kind={imageKindForExercise(activeEx)} alt="" className="a3-hero-image"/></div>
           {beforeTab==='details'&&<>

           <ul className="a3-bullets">
             {activeEx.setup.slice(0,4).map(x=>
               <li key={x}>{x}</li>
             )}
           </ul>

           <div className="a3-reco">
             <span className="a3-eyebrow">APEX RECOMMENDS</span>
             <strong>
               {currentRecommendation?.weight!==undefined
                 ?formatLoad(activeEx,currentRecommendation.weight)
                 :'CONTROLLED CALIBRATION'}
             </strong>
             <div className="a3-chips">
               <span>
                 {activeExercise.repRange[0]}–{activeExercise.repRange[1]} reps
               </span>
               <span>RIR {targetRir}</span>
               <span>{fmt(restSeconds)} rest</span>
             </div>
             <small>
               {displayText(currentRecommendation?.reason||
                 'Use a controlled first set to establish a personal baseline.')}
             </small>
           </div>

           </>}
           {beforeTab==='history'&&(()=>{
             const past=s.workouts.filter(w=>w.status==='completed'&&w.id!==current.id).flatMap(w=>w.exercises.filter(e=>e.exerciseId===activeEx.id).map(e=>({w,e}))).slice(-5).reverse();
             if(!past.length)return <Empty title="No history for this exercise yet" text="Completed sets for this movement will appear here."/>;
             return <div className="a3-list">{past.map(({w,e})=>{
               const done=e.sets.filter(x=>x.completed&&x.type!=='warmup');
               const best=Math.max(0,...done.map(x=>x.weight||x.assistance||0));
               const reps=Math.max(0,...done.map(x=>x.reps||0));
               const rirs=done.map(x=>x.rir).filter((x):x is number=>x!==undefined);
               return <div className="a3-card a3-row" key={w.id}><span className="a3-index">{w.scheduledDate.slice(5)}</span><div><strong>{best?formatLoad(activeEx,best):'Bodyweight / time'}</strong><p>{done.length} working sets · best {reps||'—'} reps{rirs.length?` · RIR ${(rirs.reduce((a,b)=>a+b,0)/rirs.length).toFixed(1)}`:''}</p></div></div>})}</div>
           })()}
           {beforeTab==='modes'&&<div className="a3-stack">
             {activeSet&&<>
               <span className="a3-eyebrow">SET MODE · NEXT SET</span>
               <div className="a3-chips">{SET_TYPES.map(t=><button key={t} className={`a3-pill ${activeSet.type===t?'selected':''}`} aria-pressed={activeSet.type===t} onClick={()=>mutate(x=>{const c=structuredClone(x);const e=c.exercises.find(z=>z.exerciseId===activeExercise.exerciseId);const ss=e?.sets.find(z=>z.id===activeSet.id);if(!e||!ss)return x;Object.assign(ss,updateSetType(ss,t,activeEx));return c})}>{t.replace('_',' ')}</button>)}</div>
             </>}
             <span className="a3-eyebrow">SUBSTITUTIONS</span>
             {smartAlternatives(activeEx,s.exercises,s.profile?.equipment).slice(0,3).map(({exercise,fit})=><div className="a3-card a3-row" key={exercise.id}><span className="a3-rowicon"><Icon name="layers"/></span><span><strong>{exercise.name}</strong><small>{fit==='available'?'Available from your setup':fit==='unknown'?'Confirm equipment for today':'Not in current setup'}</small></span></div>)}
             <button className="a3-cta a3-cta-ghost" onClick={()=>setReplace(activeExercise.exerciseId)}>Replace exercise…</button>
           </div>}

           <button
             className="a3-cta"
             onClick={()=>{setBeforeTab('details');finishPhase()}}
           >
             START SET <Icon name="play"/>
           </button>
         </div>
       }

       {phase==='set_ready'&&activeSet&&
         <div className="a3-stage">
           <div className="a3-setline">
             <span
               className="a3-eyebrow set-counter-motion"
               key={`set-counter-${activeExercise.exerciseId}-${setIndex}`}
               aria-live="polite"
             >
               SET {setIndex+1} / {activeExercise.sets.length}
             </span>
             <span className="a3-muted">
               {completedForExercise} / {activeExercise.sets.length} complete
             </span>
           </div>

           <div className="a3-settitle">
             <h3>{activeSet.type.replace('_',' ')} set</h3>
             <p>
               {activeExercise.repRange[0]}–{activeExercise.repRange[1]} REPS
               · RIR {targetRir}
               · {fmt(restSeconds)} REST
             </p>
           </div>

           <div className="a3-reco">
             <span className="a3-eyebrow">APEX RECOMMENDS</span>
             <strong>{phase6LoadDisplay(activeEx,activeSet,guided.guidedSession?.workingLoads?.[activeEx.id]??currentRecommendation?.weight,s.profile).primary}</strong>
             <small>{phase6LoadDisplay(activeEx,activeSet,guided.guidedSession?.workingLoads?.[activeEx.id]??currentRecommendation?.weight,s.profile).secondary}</small>
             <small>
               {guided.guidedSession?.calibration?.[activeEx.id]==='established'
                 ?'Personal baseline'
                 :currentRecommendation?.kind==='calibration'
                   ?'Initial calibration · limited history'
                   :'Evidence-based recommendation'}
             </small>
           </div>

           <div className="a3-spec2">
             <div>
               <small>{activeEx.loadSemantics==='time'?'WORK':'REPS'}</small>
               <strong>{activeEx.loadSemantics==='time'?formatTimedDuration(activeSet.seconds??activeEx.repRange[0]):`${activeExercise.repRange[0]}–${activeExercise.repRange[1]}`}</strong>
             </div>
             <div>
               <small>RIR</small>
               <strong>{targetRir}</strong>
             </div>
             <div>
               <small>REST</small>
               <strong>{fmt(restSeconds)}</strong>
             </div>
           </div>

           <button
             className="a3-cta"
             onClick={finishPhase}
             disabled={!!current.pausedAt}
           >
             START SET <Icon name="play"/>
           </button>
         </div>
       }

       {phase==='set_active'&&activeSet&&
         <div className="a3-stage">
           <div className="a3-setline">
             <span
               className="a3-eyebrow set-counter-motion"
               key={`set-counter-${activeExercise.exerciseId}-${setIndex}`}
               aria-live="polite"
             >
               SET {setIndex+1} / {activeExercise.sets.length}
             </span>
             <span className="a3-muted">
               {completedForExercise} / {activeExercise.sets.length} complete
             </span>
           </div>

           <>
           <div className="a3-bighero a3-ringhero">
             <svg className="a3-bigring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54"/><circle cx="60" cy="60" r="54" className="a3-ring-fill" strokeDasharray={339.29} strokeDashoffset={339.29*(1-(activeEx.loadSemantics==='time'?0:Math.min(1,(Number(activeSet.reps)||0)/Math.max(1,activeExercise.repRange[1]))))}/></svg>
             <div className="a3-bigring-copy">
               {activeEx.loadSemantics==='time'?<>
                 <span className="a3-eyebrow">SET ACTIVE</span>
                 <strong>{phase6LoadDisplay(activeEx,activeSet,undefined,s.profile).primary}</strong>
                 <small>{phase6LoadDisplay(activeEx,activeSet,undefined,s.profile).secondary??`Work ${formatTimedDuration(activeSet.seconds??activeEx.repRange[0])}`}</small>
               </>:<>
                 <span className="a3-eyebrow">REPS</span>
                 <strong className="a3-bigrep"><Num value={activeSet.reps??0}/></strong>
                 <small>/ {activeExercise.repRange[1]} · target {activeExercise.repRange[0]}–{activeExercise.repRange[1]}</small>
               </>}
             </div>
           </div>
           {activeEx.loadSemantics!=='time'&&<div className="a3-duo">
             <div className="a3-card a3-stat"><span className="a3-eyebrow">Weight</span><strong>{phase6LoadDisplay(activeEx,activeSet,undefined,s.profile).primary}</strong></div>
             <div className="a3-card a3-stat"><span className="a3-eyebrow">RIR</span><strong>{targetRir}</strong></div>
           </div>}

           {activeEx.loadSemantics!=='time'&&<div className="a3-roundrow">
             <button type="button" className="a3-roundbtn" aria-label={current.pausedAt?'Resume workout':'Pause workout'} onClick={togglePause}><Icon name="pause" size={26}/></button>
             <button type="button" className="a3-roundbtn a3-roundbtn-gold" aria-label="Log set" disabled={!!current.pausedAt} onClick={()=>setLogOpen(true)}><Icon name="check" size={30}/></button>
           </div>}
           </>
           {activeEx.loadSemantics!=='time'&&<details className="a3-more a3-setoptions"><summary>Set options</summary>
             <div className="a3-actions">
               <select value={activeSet.type} onChange={e=>onSetType(e.target.value as SetType)} aria-label="Set type">{SET_TYPES.map(x=><option value={x} key={x}>{x.replace('_',' ')}</option>)}</select>
               <button className="a3-pill" onClick={onSetAdd}>+ Add set</button>
               <button className="a3-pill" onClick={onSetRemove}>− Remove</button>
               <button className="a3-pill" onClick={skipCurrentSet} disabled={!!current.pausedAt}>Skip this set</button>
             </div>
           </details>}
           {activeEx.loadSemantics==='time'&&logEditor}
         </div>
       }

       {phase==='feedback'&&activeSet&&
         <div
           className="a3-stage set-completion-reveal"
           key={`feedback-${activeExercise.exerciseId}-${activeSet.id}`}
         >
           <span className="a3-eyebrow">SET {setIndex+1} COMPLETE <span className="animated-check" aria-hidden="true">✓</span></span>
           <h3>How did that feel?</h3>

           <div className="a3-reco">
             <strong>{phase6LoadDisplay(activeEx,activeSet,undefined,s.profile).primary}</strong>
             <span>
               {activeSet.reps!==undefined
                 ?`${activeSet.reps} reps`
                 :activeSet.seconds!==undefined
                   ?`${activeSet.seconds} sec`
                   :'Performance not recorded'}
               {activeSet.rir!==undefined
                 ?` · RIR ${activeSet.rir}`
                 :''}
             </span>
           </div>

           <p>
             APEX combines this signal with actual performance.
             It will adjust the next set only when the evidence supports it.
           </p>

           <div className="a3-choices">
             <button onClick={()=>applyFeedback('heavy')}>
               <strong>TOO HEAVY</strong>
               <small>Conservative reduction</small>
             </button>

             <button onClick={()=>applyFeedback('right')}>
               <strong>ABOUT RIGHT</strong>
               <small>Strengthen the baseline</small>
             </button>

             <button onClick={()=>applyFeedback('easy')}>
               <strong>TOO EASY</strong>
               <small>Evidence-based increase</small>
             </button>
           </div>
         </div>
       }

       {phase==='rest'&&
         <div className="a3-stage">
           <span className="a3-eyebrow">RECOVER</span>

           <div
             className={`a3-rest ${restRemaining<=0?'is-done':restTargetSec>0&&restRemaining<=restTargetSec*0.25?'is-low':''}`}
             aria-live="polite"
             role="timer"
           >
             <svg className="a3-rest-ring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54"/><circle cx="60" cy="60" r="54" className="a3-ring-fill" strokeDasharray={339.29} strokeDashoffset={339.29*(1-restProgress)}/></svg>
             <strong><Num value={restRemaining>0?fmt(restRemaining):'READY'}/></strong>
             <span className="a3-rest-pct">{Math.round(restProgress*100)}% remaining</span>
           </div>

           {(() => {
             const upcomingSet=
               activeExercise?.sets.find(
                 (x,i)=>i>setIndex&&!x.completed
               );

             const upcomingExercise=
               nextExerciseIndex>=0&&nextEx
                 ?nextEx
                 :undefined;

             return upcomingSet&&activeExercise
               ?<>
                 <strong>NEXT · SET {setIndex+2}</strong>
                 <div className="a3-reco">
                   <b>{phase6LoadDisplay(activeEx,upcomingSet,guided.guidedSession?.workingLoads?.[activeEx.id],s.profile).primary}</b>
                   <span>
                     {activeExercise.repRange[0]}–{activeExercise.repRange[1]} reps
                   </span>
                 </div>
               </>
               :upcomingExercise
                 ?<>
                   <strong>NEXT UP</strong>
                   <div className="a3-reco">
                     <b>{upcomingExercise.name}</b>
                     <span>{upcomingExercise.loadSemantics==='time'?`${formatTimedDuration(upcomingExercise.repRange[0])} work`:`${upcomingExercise.repRange[0]}–${upcomingExercise.repRange[1]} reps`} · {fmt(upcomingExercise.restSec)} rest</span>
                   </div>
                 </>
                 :<strong>SESSION COMPLETE</strong>;
           })()}

           <p>
             {restRemaining>0
               ?'The timer uses the actual elapsed timestamp, so backgrounding the app does not pause the clock.'
               :'Recovery interval complete.'}
           </p>

           <div className="a3-actions">
             {restRemaining>0&&
               <button onClick={skipRest}>
                 SKIP REST
               </button>
             }

             {restRemaining>0&&
               <button
                 onClick={()=>{
                   const started=
                     restStartedAt
                       ?new Date(restStartedAt).getTime()
                       :Date.now();
                   const newTarget=
                     restTargetSec+30;

                   setGuided(
                     {},
                     {
                       restStartedAt:
                         new Date(started).toISOString(),
                       restTargetSec:newTarget
                     }
                   );
                 }}
               >
                 +30 SEC
               </button>
             }

             {restRemaining<=0&&
               <button
                 className="a3-cta"
                 onClick={continueAfterRest}
               >
                 CONTINUE <Icon name="chev"/>
               </button>
             }
           </div>
         </div>
       }

       {phase==='exercise_complete'&&
         <div className="a3-stage a3-stage-done">
           <span className="a3-eyebrow">
             {(justDoneEx||activeEx).name.toUpperCase()}
           </span>
           <StateView kind="success" title="Exercise complete" detail={`${justDoneExercise?justDoneExercise.sets.filter(x=>x.completed).length:completedForExercise} / ${(justDoneExercise||activeExercise).sets.length} sets`}/>

           {nextEx
             ?<>
               <span className="a3-eyebrow">NEXT UP</span>
               <div className="a3-reco">
                 <strong>{nextEx.name}</strong>
                 <small>
                   {nextExercise?.repRange[0]}–
                   {nextExercise?.repRange[1]} reps
                   · {fmt(nextEx.restSec)} rest
                 </small>
               </div>
               <button
                 className="a3-cta"
                 onClick={advanceToNextExercise}
               >
                 CONTINUE <Icon name="chev"/>
               </button>
             </>
             :<button
               className="a3-cta"
               onClick={()=>setGuided({phase:'complete'})}
             >
               REVIEW SESSION <Icon name="chev"/>
             </button>
           }
         </div>
       }

       {phase==='complete'&&
         <div className="a3-stage a3-stage-done">
           <ApexImage kind="training-floor" alt="" className="a3-hero-image"/><ApexRidge/>
           {assessment.completedSets===0
             ?<>
               <span className="a3-eyebrow">NO SETS LOGGED</span>
               <h3>Nothing was recorded in this session.</h3>
               <p>A session with no logged sets is not saved as a completed workout. End it without recording, or go back and log a set.</p>
             </>
             :<>
               <span className="a3-eyebrow">SESSION COMPLETE</span>
               <div className="a3-donemark animated-completion-mark" aria-hidden="true">✓</div>
               <h3>Every planned movement is accounted for.</h3>
               <p>
                 Review your session and let APEX record the evidence for future
                 training.
               </p>
             </>}
           {assessment.achievements.length>0&&<StateView kind="pr" title="New Personal Record!" detail={displayText(assessment.achievements[0].label)} text={assessment.achievements.length>1?`+${assessment.achievements.length-1} more this session`:assessment.achievements[0].unit}/>}
           <div className="a3-stats">
             <ApexStat label="Volume" value={vol(assessment.volume).toLocaleString()} unit={volLabel()}/>
             <ApexStat label="Elapsed" value={fmt(elapsed)} unit="time"/>
             <ApexStat label="Sets" value={`${assessment.completedSets}/${assessment.plannedSets}`} unit="done"/>
             {assessment.achievements.length>0&&<div className="a3-card a3-stat a3-pr"><span className="a3-eyebrow">PRs</span><strong>{assessment.achievements.length}</strong><small>this session</small></div>}
           </div>
           <button
             className="a3-cta"
             onClick={()=>onDone(current)}
           >
             {assessment.completedSets===0?'END WITHOUT RECORDING':'FINISH SESSION'} <Icon name="chev"/>
           </button>
         </div>
       }
     </section>
   }

   {overview&&
     <section className="a3-block">
       <div className="a3-head">
         <div>
           <span className="a3-eyebrow">OVERVIEW</span>
           <h2>Full session.</h2>
           <p>Use this when you need to edit, reorder, replace or inspect the whole workout.</p>
         </div>
       </div>

       <div className="a3-list">
         {current.exercises.map((we,i)=>{
           const ex=safeExercise(s.exercises,we.exerciseId);

           return <article
             className={`a3-card a3-stack ${we.status==='skipped'?'a3-skipped':''}`}
             key={`${we.exerciseId}-${i}`}
           >
             <div className="a3-exhead">
               <button
                 className="a3-rowbtn"
                 onClick={()=>ex&&onExercise(ex.id)}
               >
                 <span>
                   <em>{String(i+1).padStart(2,'0')}</em>
                   <strong>{ex?.name||'Exercise unavailable'}</strong>
                   <small>
                     {we.repRange[0]}–{we.repRange[1]} reps ·
                     {' '}
                     {ex
                       ?formatLoad(ex,we.recommendedWeight)
                       :'—'}
                     {' · '}
                     {we.restSec}s rest
                   </small>
                 </span>
                 <Icon name="chev"/>
               </button>

               <div className="a3-actions">
                 <button
                   className="a3-pill"
                   onClick={()=>setReplace(we.exerciseId)}
                 >
                   Replace
                 </button>

                 <button
                   className="a3-pill"
                   onClick={()=>
                     mutate(x=>
                       reorderWorkoutExercise(
                         x,
                         i,
                         Math.max(0,i-1)
                       )
                     )
                   }
                   disabled={i===0}
                 >
                   ↑
                 </button>

                 <button
                   className="a3-pill"
                   onClick={()=>
                     mutate(x=>
                       reorderWorkoutExercise(
                         x,
                         i,
                         Math.min(
                           x.exercises.length-1,
                           i+1
                         )
                       )
                     )
                   }
                   disabled={i===current.exercises.length-1}
                 >
                   ↓
                 </button>
               </div>
             </div>

             {we.status==='skipped'
               ?<div className="a3-reco">
                 Skipped — no sets are counted as performed.
                 <button
                   className="a3-pill"
                   onClick={()=>
                     mutate(x=>
                       markWorkoutExerciseSkipped(
                         x,
                         we.exerciseId
                       )
                     )
                   }
                 >
                   Restore
                 </button>
               </div>
               :<div>
                 {we.sets.map((set,j)=>
                   ex
                     ?<SetEditor
                       key={set.id}
                       set={set}
                       ex={ex}
                       index={j}
                       targetRir={
                         personalizedLoad(
                           ex,
                           s.workouts,
                           s.profile,
                           s.exercises,
                           today()
                         ).targetRir
                       }
                       onChange={p=>
                         mutate(x=>{
                           const c=structuredClone(x);
                           const e=c.exercises.find(
                             z=>z.exerciseId===we.exerciseId
                           );
                           const ss=e?.sets.find(
                             z=>z.id===set.id
                           );
                           if(!e||!ss)return x;
                           Object.assign(ss,p);
                           return c;
                         })
                       }
                       onType={t=>
                         mutate(x=>{
                           const c=structuredClone(x);
                           const e=c.exercises.find(
                             z=>z.exerciseId===we.exerciseId
                           );
                           const ss=e?.sets.find(
                             z=>z.id===set.id
                           );
                           if(!e||!ss)return x;
                           Object.assign(
                             ss,
                             updateSetType(
                               ss,
                               t,
                               ex
                             )
                           );
                           return c;
                         })
                       }
                       onComplete={()=>{
                         const idx=we.sets.findIndex(
                           x=>x.id===set.id
                         );

                         mutate(x=>{
                           const c=structuredClone(x);
                           const e=c.exercises.find(
                             z=>z.exerciseId===we.exerciseId
                           );
                           const ss=e?.sets.find(
                             z=>z.id===set.id
                           );
                           if(!e||!ss)return x;

                           ss.completed=!ss.completed;
                           ss.timestamp=
                             ss.completed
                               ?new Date().toISOString()
                               :undefined;

                           c.guidedSession={
                             ...completeGuidedSession(c.guidedSession),
                             exerciseIndex:i,
                             setIndex:idx,
                             phase:ss.completed
                               ?'feedback'
                               :'set_active',
                             updatedAt:new Date().toISOString()
                           };

                           return c;
                         });
                       }}
                       onAdd={()=>
                         mutate(x=>
                           addWorkoutSet(
                             x,
                             we.exerciseId,
                             s.exercises,
                             set
                           )
                         )
                       }
                       onRemove={()=>
                         mutate(x=>
                           removeWorkoutSet(
                             x,
                             we.exerciseId,
                             set.id
                           )
                         )
                       }
                     />
                     :<div
                       className="a3-reco"
                       key={set.id}
                     >
                       Exercise data unavailable.
                       This workout entry is preserved.
                     </div>
                 )}

                 <div className="a3-actions">
                   {we.sets.map(set=>
                     !set.completed&&set.disposition!=='skipped'
                       ?<button
                           className="a3-pill"
                           key={`skip-${set.id}`}
                           onClick={()=>
                             mutate(x=>
                               markWorkoutSetSkipped(
                                 x,
                                 we.exerciseId,
                                 set.id
                               )
                             )
                           }
                         >
                           Skip set {we.sets.findIndex(z=>z.id===set.id)+1}
                         </button>
                       :null
                   )}
                 </div>

                 <div className="a3-actions">
                   <button
                     className="a3-pill"
                     onClick={()=>
                       mutate(x=>
                         addWorkoutSet(
                           x,
                           we.exerciseId,
                           s.exercises
                         )
                       )
                     }
                   >
                     + Add set
                   </button>

                   <button
                     className="a3-pill"
                     onClick={()=>
                       mutate(x=>
                         markWorkoutExerciseSkipped(
                           x,
                           we.exerciseId
                         )
                       )
                     }
                   >
                     Skip exercise
                   </button>
                 </div>
               </div>}
           </article>;
         })}
       </div>
     </section>
   }

   {phase!=='complete'&&
     <div className="a3-stack">
       <textarea
         aria-label="Workout notes"
         value={current.notes||''}
         onChange={e=>
           mutate(x=>({
             ...x,
             notes:e.target.value
           }))
         }
         placeholder="Workout note — optional context, technique, how it felt…"
       />
     </div>
   }

   <div className="a3-footer">
     <button
       className="a3-cta a3-cta-ghost"
       onClick={()=>setOverview(x=>!x)}
     >
       {overview?'Return to focused training':'Open workout overview'}
     </button>
   </div>

   {adapt.length>0&&
     <div className="a3-card a3-callout">
       <Icon name="bolt"/>
       <div>
         <strong>Next-session evidence</strong>
         {adapt.slice(0,2).map((a,i)=>
           <p key={i}>{a.title}: {displayText(a.detail)}</p>
         )}
       </div>
     </div>
   }

   {safety&&
     <Modal
       title="Training safety check"
       close={()=>setSafety(false)}
     >
       <p className="a3-muted">
         If something feels unsafe or unexpectedly wrong, APEX does not try
         to diagnose it. Record the context, stop the movement if needed,
         and use your own judgement about whether to continue.
       </p>

       <div className="a3-choices">
         {[
           ['discomfort','Unusual discomfort','Record it and review the movement.'],
           ['sharp','Sharp or worsening pain','Stop this movement and do not push through it.'],
           ['dizzy','Dizziness / unusual breathlessness','Stop the session and recover before deciding what to do next.'],
           ['stable','Technique feels unstable','Reduce complexity or stop the movement until control is restored.']
         ].map(([id,label,detail])=>
           <button
             key={id}
             onClick={()=>{
               const at=new Date().toISOString();

               update(x=>({
                 ...x,
                 journal:[
                   ...x.journal,
                   {
                     id:uid('journal'),
                     date:today(),
                     scope:'workout',
                     refId:current.id,
                     text:`Safety check: ${label}.`,
                     tags:['safety']
                   }
                 ],
                 eventLog:[
                   ...(x.eventLog||[]),
                   {
                     id:uid('evt'),
                     type:'safety_check',
                     timestamp:at,
                     payload:{
                       workoutId:current.id,
                       signal:id
                     }
                   }
                 ]
               }));

               setSafety(false);
             }}
           >
             <strong>{label}</strong>
             <small>{detail}</small>
           </button>
         )}
       </div>

       <div className="a3-card a3-callout">
         <Icon name="settings"/>
         <div>
           <strong>APEX guardrail</strong>
           <p>
             APEX can adapt training evidence, but it does not diagnose
             injuries or override professional medical advice.
           </p>
         </div>
       </div>
     </Modal>
   }

   {replace&&
     <Modal
       title="Replace exercise"
       close={()=>{
         setReplace(null);
         setRq('');
       }}
     >
       <p className="a3-muted">
         History stays attached to the original canonical exercise.
         The replacement starts a fresh baseline unless the engine proves
         comparable semantics.
       </p>

       <div className="a3-search">
         <Icon name="search"/>
         <input
           autoFocus
           value={rq}
           onChange={e=>setRq(e.target.value)}
           placeholder="Search movement or alias…"
         />
       </div>

       <div className="a3-list">
         {filtered.map(e=>{
           const fit=equipmentFit(
             e,
             s.profile?.equipment
           );
           const oldEx=s.exercises.find(
             x=>x.id===replace
           );
           const comparable=
             !!oldEx&&
             oldEx.pattern===e.pattern&&
             oldEx.loadSemantics===e.loadSemantics;

           return <button
             key={e.id}
             className="a3-card a3-pick a3-tap"
             onClick={()=>{
               const reason=oldEx
                 ?`${oldEx.name} replaced during workout`
                 :'Exercise replaced during workout';

               mutate(x=>
                 replaceWorkoutExercise(
                   x,
                   replace,
                   e,
                   s.exercises
                 )
               );

               setReplace(null);
               setRq('');
             }}
           >
             <span>
               <strong>{e.name}</strong>
               <small>
                 {fit==='available'
                   ?'✓ Available from your setup'
                   :fit==='unknown'
                     ?'? Confirm equipment'
                     :'× Not in setup'}
                 {' · '}
                 {comparable
                   ?'Comparable movement — baseline can carry forward'
                   :'New baseline'}
                 {' · '}
                 {e.equipment.join(', ')}
               </small>
             </span>
             <Icon name="chev"/>
           </button>;
         })}
       </div>
     </Modal>
   }
 </div>;
}

function SetEditor({set,ex,index,onChange,onType,onComplete,onAdd,onRemove,targetRir=2,focused=false,hideOptions=false,loadProfile}:{set:SetLog;ex:Exercise;index:number;onChange:(p:Partial<SetLog>)=>void;onType:(t:SetType)=>void;onComplete:()=>void;onAdd:()=>void;onRemove:()=>void;targetRir?:number;focused?:boolean;hideOptions?:boolean;loadProfile?:UserProfile}){
 const timed=set.type==='timed'||ex.loadSemantics==='time';
 const assist=set.type==='assisted'||ex.loadSemantics==='assistance';
 const loadable=
   !timed&&
   !assist&&
   !['bodyweight','none'].includes(ex.loadSemantics);

 const displayLoad=
   set.weight!==undefined
     ?formatLoad(ex,set.weight)
     :'—';

 const stepValue=(key:'weight'|'reps'|'rir',delta:number)=>{
   if(key==='weight'){
     const next=adjacentAvailableLoad(ex,set.weight,loadProfile,delta>0?'up':'down');
     if(next!==undefined)onChange({weight:next,loadDetail:loadDetailForSet(ex,next,set.loadDetail)});
     return;
   }

   if(key==='reps'){
     onChange({
       reps:Math.max(0,(Number(set.reps)||0)+delta)
     });
     return;
   }

   onChange({
     rir:Math.max(
       0,
       Math.min(
         5,
         (set.rir===undefined?targetRir:set.rir)+delta
       )
     )
   });
 };

 if(focused){
   return <div className={`a3-stack a3-seteditor a3-logform ${set.completed?'done':''}`}>
     <div className="a3-stack">
       <div className="a3-fields">

       {loadable&&
         <div className="a3-control">
           <small>Weight ({weightLabel()})</small>
           <div className="a3-stepper">
             <button
               type="button"
               onClick={()=>stepValue('weight',-1)}
               aria-label="Decrease load"
             >
               −
             </button>
             <BumpInput
             className="a3-input a3-stepper-input"
             type="number"
             step={getUnits()==='imperial'?0.5:ex.incrementKg||1}
             inputMode="decimal"
             value={wtInput(set.weight)}
             placeholder={`Actual ${weightLabel()}`}
             onChange={e=>onChange({weight:e.target.value===''?undefined:Math.max(0,Math.round(fromWt(Number(e.target.value))*1000)/1000)})}
             onBlur={e=>{if(e.target.value==='')return;const raw=fromWt(Number(e.target.value));const snapped=snapToAvailableLoad(ex,raw,loadProfile);onChange({weight:snapped??raw,loadDetail:loadDetailForSet(ex,snapped??raw,set.loadDetail)});}}
           />
             <button
               type="button"
               onClick={()=>stepValue('weight',1)}
               aria-label="Increase load"
             >
               +
             </button>
           </div>
         </div>
       }

       {assist&&
         <div className="a3-control">
           <small>ASSISTANCE</small>
           <input
             className="a3-input"
             type="number"
             step={getUnits()==='imperial'?0.5:ex.incrementKg||1}
             inputMode="decimal"
             value={wtInput(set.assistance)}
             placeholder={weightLabel()}
             onChange={e=>
               onChange({
                 assistance:e.target.value===''?undefined:Math.max(0,Math.round(fromWt(Number(e.target.value))*1000)/1000)
               })
             }
           />
         </div>
       }

       {timed
         ?<div className="a3-control">
           <small>SECONDS</small>
           <input
             className="a3-input"
             type="number"
             min="1"
             inputMode="numeric"
             value={set.seconds??''}
             placeholder={`${ex.repRange[0]} sec`}
             onChange={e=>
               onChange({
                 seconds:
                   e.target.value===''
                     ?undefined
                     :Math.max(0,Number(e.target.value))
               })
             }
           />
         </div>
         :<div className="a3-control">
           <small>Reps</small>
           <div className="a3-stepper">
             <button
               type="button"
               onClick={()=>stepValue('reps',-1)}
               aria-label="Decrease reps"
             >
               −
             </button>
             <input
             className="a3-input a3-stepper-input"
             type="number"
             inputMode="numeric"
             value={set.reps??''}
             placeholder="Optional"
             onChange={e=>
               onChange({
                 reps:
                   e.target.value===''
                     ?undefined
                     :Math.max(0,Number(e.target.value))
               })
             }
           />
             <button
               type="button"
               onClick={()=>stepValue('reps',1)}
               aria-label="Increase reps"
             >
               +
             </button>
           </div>
         </div>
       }

       <div className="a3-control">
         <small>RIR</small>
         <div className="a3-stepper">
           <button
             type="button"
             onClick={()=>stepValue('rir',-1)}
             aria-label="Decrease RIR"
           >
             −
           </button>
           <input
           className="a3-input a3-stepper-input"
           type="number"
           min="0"
           max="5"
           value={set.rir??''}
           placeholder={`Target ${targetRir}`}
           onChange={e=>
             onChange({
               rir:
                 e.target.value===''
                   ?undefined
                   :Math.max(
                     0,
                     Math.min(
                       5,
                       Number(e.target.value)
                     )
                   )
             })
           }
         />
           <button
             type="button"
             onClick={()=>stepValue('rir',1)}
             aria-label="Increase RIR"
           >
             +
           </button>
         </div>
       </div>
     </div>
     </div>

     <label className="a3-control a3-notes">
       <small>Notes (optional)</small>
       <textarea
         className="a3-input"
         rows={2}
         aria-label="Set notes"
         value={set.note??''}
         placeholder="Felt good, tempo, grip…"
         onChange={e=>onChange({note:e.target.value||undefined})}
       />
     </label>

     <div className="a3-actions">
       <button
         className={`a3-cta a3-complete ${set.completed?'completed':''}`}
         onClick={onComplete}
         aria-label={set.completed?'Undo set':'Save Set'}
       >
         <Icon name="check"/>
         <span>
           {set.completed?'SET SAVED ✓':'SAVE SET'}
         </span>
       </button>
     </div>

     {!hideOptions&&<details className="a3-more"><summary>More options</summary>
     <div className="a3-actions">
       <span className="a3-eyebrow">SET OPTIONS</span>
       <select
         value={set.type}
         onChange={e=>
           onType(e.target.value as SetType)
         }
         aria-label="Set type"
       >
         {SET_TYPES.map(x=>
           <option value={x} key={x}>
             {x.replace('_',' ')}
           </option>
         )}
       </select>

       <button
         className="a3-pill"
         onClick={onAdd}
       >
         + Add set
       </button>

       <button
         className="a3-pill"
         onClick={onRemove}
       >
         − Remove
       </button>
     </div>
     </details>}
   </div>;
 }

 return <div className={`a3-card a3-stack a3-seteditor ${set.completed?'done':''}`}>
   <div className="a3-actions">
     <span>{String(index+1).padStart(2,'0')}</span>
     <select
       value={set.type}
       onChange={e=>
         onType(e.target.value as SetType)
       }
       aria-label="Set type"
     >
       {SET_TYPES.map(x=>
         <option value={x} key={x}>
           {x.replace('_',' ')}
         </option>
       )}
     </select>
   </div>

   <div className="a3-fields">
     {loadable&&
       <label>
         LOAD
         <input
           type="number"
           step={getUnits()==='imperial'?0.5:ex.incrementKg}
           inputMode="decimal"
           value={wtInput(set.weight)}
           placeholder={weightLabel()}
           onChange={e=>
             onChange({
               weight:e.target.value===''?undefined:Math.round(fromWt(+e.target.value)*1000)/1000
             })
           }
         />
       </label>
     }

     {assist&&
       <label>
         ASSIST
         <input
           type="number"
           step={getUnits()==='imperial'?0.5:ex.incrementKg}
           value={wtInput(set.assistance)}
           placeholder={weightLabel()}
           onChange={e=>
             onChange({
               assistance:e.target.value===''?undefined:Math.round(fromWt(+e.target.value)*1000)/1000
             })
           }
         />
       </label>
     }

     {timed
       ?<label>
         SECONDS
         <input
           type="number"
           value={set.seconds??''}
           onChange={e=>
             onChange({
               seconds:
                 e.target.value===''
                   ?undefined
                   :Math.max(0,+e.target.value)
             })
           }
         />
       </label>
       :<label>
         REPS
         <input
           type="number"
           value={set.reps??''}
           onChange={e=>
             onChange({
               reps:
                 e.target.value===''
                   ?undefined
                   :Math.max(0,+e.target.value)
             })
           }
         />
       </label>
     }

     <label>
       RIR
       <input
         type="number"
         min="0"
         max="5"
         value={set.rir??''}
         placeholder={`Target ${targetRir}`}
         onChange={e=>
           onChange({
             rir:
               e.target.value===''
                 ?undefined
                 :Math.min(10,Math.max(0,+e.target.value))
           })
         }
       />
     </label>
   </div>

   <div className="a3-actions">
     <button
       className="a3-cta"
       onClick={onComplete}
       aria-label={set.completed?'Undo set':'Complete set'}
     >
       <Icon name="check"/>
     </button>

     <button
       className="a3-pill"
       onClick={onAdd}
     >
       +
     </button>

     <button
       className="a3-pill"
       onClick={onRemove}
     >
       −
     </button>
   </div>
 </div>;
}
function SessionReview({s,id,onNav,update}:{s:AppState;id:string;onNav:(r:string)=>void;update:(f:(x:AppState)=>AppState)=>void}){
 const w=s.workouts.find(x=>x.id===id); const [feel,setFeel]=useState<'easy'|'right'|'hard'|'rough'|''>(''); const [showDetails,setShowDetails]=useState(false);
 if(!w)return <Empty title="Session not found" text="The historical record is still local, but this view no longer has the session reference."/>
 const a=sessionAssessment(w,s.exercises,s.workouts.filter(x=>x.status==='completed'&&x.id!==w.id));
 const saveFeel=()=>{if(!feel)return;const text=`Session feel: ${feel}.`;const already=s.journal.some(j=>j.scope==='workout'&&j.refId===w.id&&j.text===text);if(!already) {const next={id:uid('journal'),date:today(),scope:'workout' as const,refId:w.id,text,tags:['session-feedback']};update(x=>({...x,journal:[...x.journal,next],eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'session_feedback',timestamp:new Date().toISOString(),payload:{workoutId:w.id,feel}}]}));}onNav('home')};
 const minutes=w.startedAt&&w.completedAt?Math.max(1,Math.round((new Date(w.completedAt).getTime()-new Date(w.startedAt).getTime())/60000)):undefined;
 return <div className="a3-home a3-complete-screen"><header className="a3-completehead"><span className="a3-state-icon" aria-hidden="true"><Icon name="check" size={36}/></span><span className="a3-eyebrow">SESSION COMPLETE</span><h1>Workout Complete</h1><p>{niceName(w.name)} · {a.completedSets} completed sets · {a.skipped} skipped</p></header>
 <div className="a3-stats session-review-metrics"><Metric label="Volume" value={a.volume?vol(a.volume).toLocaleString():'—'} sub={volLabel()}/><Metric label="Time" value={minutes===undefined?'—':String(minutes)} sub="min"/><Metric label="Sets" value={String(a.completedSets)} sub={`of ${a.plannedSets}`}/></div>
 {a.achievements.length>0&&<div className="a3-card a3-row a3-pr-row"><span className="a3-rowicon"><Icon name="crown"/></span><span><strong>{a.achievements.length} PR{a.achievements.length===1?'':'s'}</strong><small>Great work today!</small></span></div>}
 <section className="a3-block"><div className="a3-head"><div><span className="a3-eyebrow">SESSION FEEDBACK</span><h2>How did the session feel?</h2><p>One lightweight signal helps APEX interpret performance without pretending to measure physiology.</p></div></div><div className="a3-choices">{[['easy','Too easy'],['right','About right'],['hard','Hard but productive'],['rough','Rough / unusually difficult']].map(([id,label])=><button className={feel===id?'selected':''} key={id} onClick={()=>setFeel(id as any)}><strong>{label}</strong><small>{feel===id?'Selected':'Optional'}</small></button>)}</div></section>
 {showDetails&&<section className="a3-block"><div className="a3-list">{a.achievements.map((x,i)=><ListRow key={i} title={displayText(x.label)} sub={displayText(x.unit)} icon="bolt" click={()=>{}}/>)}{!a.achievements.length&&<Empty title="No new achievement" text="A normal session is still useful evidence."/>}</div></section>}
 <section className="a3-block"><div className="a3-card a3-callout"><Icon name="bolt"/><div><strong>Coach</strong><p>Keep the current structure unless new evidence supports a meaningful change. APEX adapts future prescription from actual performance, context and your feedback.</p></div></div></section>
 <button className="a3-cta a3-cta-ghost" aria-expanded={showDetails} onClick={()=>setShowDetails(x=>!x)}>{showDetails?'Hide Details':'View Details'}</button>
 <button className="a3-cta" disabled={!feel} onClick={saveFeel}>{feel?'Save feedback & return home':'Select how it felt'}</button></div>}
function Progress({s,onNav}:{s:AppState;onNav:(r:string)=>void}){
 const done=s.workouts.filter(w=>w.status==='completed').sort((a,b)=>(a.completedAt||a.scheduledDate).localeCompare(b.completedAt||b.scheduledDate));
 const [tab,setTab]=useState<'overview'|'strength'|'body'|'prs'>('overview');
 const [bodyRange,setBodyRange]=useState<'7D'|'30D'|'3M'|'1Y'>('30D');
 const [exerciseId,setExerciseId]=useState<string>('');
 const [exRange,setExRange]=useState<'1M'|'3M'|'6M'|'1Y'|'All'>('3M');
 const exerciseOptions=useMemo(()=>{const ids=new Set(done.flatMap(w=>w.exercises.map(e=>e.exerciseId)));return s.exercises.filter(e=>ids.has(e.id));},[done,s.exercises]);
 const selected=exerciseOptions.find(e=>e.id===exerciseId)||exerciseOptions[0];
 const historyAll=selected?done.flatMap(w=>w.exercises.filter(e=>e.exerciseId===selected.id).map(e=>({w,e}))):[];
 const rangeDays=exRange==='1M'?30:exRange==='3M'?90:exRange==='6M'?180:exRange==='1Y'?365:Infinity;
 const rangeCut=Number.isFinite(rangeDays)?new Date(Date.now()-rangeDays*86400000).toISOString().slice(0,10):'';
 const historyRange=historyAll.filter(({w})=>w.scheduledDate>=rangeCut);
 const history=historyRange.slice(-8);
 const bestOf=(e:{sets:SetLog[]})=>Math.max(0,...e.sets.filter(x=>x.completed&&x.type!=='warmup').map(x=>x.weight||x.assistance||0));
 const evidenceSeries=historyRange.map(({e})=>bestOf(e)).filter(v=>v>0);
 const evidenceChange=evidenceSeries.length>1?Math.round((evidenceSeries[evidenceSeries.length-1]-evidenceSeries[0])/evidenceSeries[0]*1000)/10:undefined;
 const evidenceBest=evidenceSeries.length?Math.max(...evidenceSeries):0;
 const bestReps=historyRange.flatMap(({e})=>e.sets.filter(x=>x.completed&&x.type!=='warmup'&&(x.weight||x.assistance||0)===evidenceBest)).reduce((m,x)=>Math.max(m,x.reps||0),0);
 const total=done.reduce((a,w)=>a+volumeForWorkout(w,s.exercises),0);
 const muscle=useMemo(()=>{const m:Record<string,number>={};done.slice(-8).forEach(w=>w.exercises.forEach(we=>{const e=s.exercises.find(x=>x.id===we.exerciseId);e?.primaryMuscles.forEach(x=>m[x]=(m[x]||0)+we.sets.filter(z=>z.completed&&z.type!=='warmup').length)}));return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,10)},[done,s.exercises]);
 const top=s.achievements.slice(-5).reverse();
 const activeGoals=s.goals.filter(g=>g.status==='active');
 const loadSummary=trainingLoadSummary(s);
 const consistency=consistencySummary(s);
 const trend=volumeTrend(s);
 const momentum=goalMomentum(s);
 const balance=trainingBalance(s);
 const maxTrend=Math.max(...trend.map(x=>x.volume),1);
 const bodyEntries=s.measurements.filter(entry=>entry.weightKg!==undefined).slice().sort((a,b)=>a.date.localeCompare(b.date));
 const latestBodyEntry=bodyEntries[bodyEntries.length-1];
 const previousBodyEntry=bodyEntries.length>1?bodyEntries[bodyEntries.length-2]:undefined;
 const bodyWeightChange=latestBodyEntry&&previousBodyEntry?latestBodyEntry.weightKg!-previousBodyEntry.weightKg!:undefined;
 const bodyDays=bodyRange==='7D'?7:bodyRange==='30D'?30:bodyRange==='3M'?90:365;
 const bodyCut=new Date(Date.now()-bodyDays*86400000).toISOString().slice(0,10);
 const bodyRangeEntries=bodyEntries.filter(x=>x.date>=bodyCut);
 const bodySeries=bodyRangeEntries.map(x=>wt(x.weightKg as number));
 const shortDate=(d:string)=>new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
 return <div className="a3-home a3-progress">
   <header className="a3-greet a3-pagetitle"><span className="a3-eyebrow">Progress · {done.length} sessions</span><h1>Progress</h1></header>
   <SegBar label="Progress sections" value={tab} onChange={setTab} items={[['overview','Overview'],['strength','Strength'],['body','Body'],['prs','PRs']]}/>
   {(tab==='overview'||tab==='body')&&<>
   <div className="a3-card a3-stack a3-bodycard apex-body-shortcut">
    <div className="a3-bodyhead"><div><span className="a3-eyebrow">Body weight</span><strong className="a3-bodyvalue">{latestBodyEntry?<>{wt(latestBodyEntry.weightKg as number)}<small>{weightLabel()}</small></>:'Start a recorded-weight history'}</strong></div>{bodyWeightChange!==undefined&&<span className="a3-delta">{bodyWeightChange>=0?'↑':'↓'} {Math.abs(wt(bodyWeightChange)).toFixed(1)} {weightLabel()}<small>since previous</small></span>}</div>
    {bodySeries.length>1&&<ApexSpark values={bodySeries} label="Body weight trend" xLabels={[shortDate(bodyRangeEntries[0].date),shortDate(bodyRangeEntries[bodyRangeEntries.length-1].date)]}/>}
    <div className="a3-choices a3-ranges" role="group" aria-label="Body weight range">{(['7D','30D','3M','1Y'] as const).map(p=><button key={p} aria-pressed={bodyRange===p} className={bodyRange===p?'selected':''} onClick={()=>setBodyRange(p)}>{p}</button>)}</div>
    <button className="a3-link" onClick={()=>onNav('measurements')}>Open Body / Weight <Icon name="arrow" size={14}/></button>
   </div>
   </>}

   {tab==='overview'&&<>
   <div className="a3-stats">
    <ApexStat label="Sessions" value={String(done.length)} unit="done"/>
    <ApexStat label="Volume" value={total?vol(total).toLocaleString():'—'} unit={volLabel()}/>
    <ApexStat label="Awards" value={String(s.achievements.length)} unit="PRs"/>
   </div>

   <section className="a3-block">
    <div className="a3-head"><h2>Consistency</h2><span className="a3-eyebrow">Last 30 days</span></div>
    <div className="a3-rings">
     <ApexRing value={Math.min(100,Math.max(0,consistency.rate))} label="Adherence" sub={`${consistency.completed}/${consistency.planned||'—'} scheduled`}/>
     <div className="a3-stats a3-stats-2"><ApexStat label="Streak" value={String(consistency.streak)} unit="sessions"/><ApexStat label="Avg volume" value={loadSummary.recentAverageVolume?vol(loadSummary.recentAverageVolume).toLocaleString():'—'} unit="4-session"/></div>
    </div>
   </section>

   <section className="a3-block">
    <div className="a3-head"><h2>Workload</h2><span className="a3-eyebrow">Last {trend.length||0} sessions</span></div>
    <div className="a3-card">
     {trend.length>0
      ?<div className="a3-bars">{trend.map((x,i)=><div className="a3-bar-col" key={`${x.date}-${i}`}><small>{x.volume?vol(x.volume).toLocaleString():'—'}</small><i><b style={{height:`${Math.max(8,Math.round((x.volume/maxTrend)*100))}%`}}/></i><span>{x.date.slice(5)}</span></div>)}</div>
      :<Empty title="Not enough history yet" text="Complete more sessions and APEX will build the workload record."/>}
    </div>
    <div className="a3-stats"><ApexStat label="Working sets" value={String(loadSummary.workingSets30)} unit="30d"/><ApexStat label="Sessions" value={String(loadSummary.consistency30)} unit="30d"/><ApexStat label="Awards" value={String(s.achievements.length)} unit="PRs"/></div>
   </section>

   <section className="a3-block">
    <div className="a3-head"><h2>Interpretation</h2><span className="a3-eyebrow">Context only</span></div>
    <div className="a3-stats">
     <ApexStat label="Momentum" value={momentum.direction==='insufficient'?'—':momentum.direction==='up'?'↑':momentum.direction==='down'?'↓':'→'} unit={momentum.direction==='insufficient'?'more data':`${momentum.changePct>=0?'+':''}${momentum.changePct}%`}/>
     <ApexStat label="Top exposure" value={balance.highest?String(balance.highest[1]):'—'} unit={balance.highest?String(balance.highest[0]):'sets'}/>
     <ApexStat label="Spread" value={String(balance.spread||'—')} unit="sets"/>
    </div>
    <div className="a3-card a3-callout"><Icon name="shield" size={16}/><div><p>{momentum.detail}{balance.highest&&balance.lowest?` Highest recent primary-muscle exposure: ${balance.highest[0]} (${balance.highest[1]} sets); lowest: ${balance.lowest[0]} (${balance.lowest[1]}).`:''}</p></div></div>
   </section>

   {activeGoals.length>0&&<section className="a3-block">
    <div className="a3-head"><h2>Goals</h2><button className="a3-link" onClick={()=>onNav('goals')}>Open goals <Icon name="arrow" size={14}/></button></div>
    <div className="a3-rings">{activeGoals.map(g=>{const gp=goalProgress(s,g);return <ApexRing key={g.id} value={gp.percent} label={g.title} sub={g.target?`${g.target.label}: ${g.target.value} ${g.target.unit}`:'No numeric target yet'} onClick={()=>onNav('goals')}/>})}</div>
   </section>}

   </>}

   {tab==='strength'&&<>
   <section className="a3-block">
    <div className="a3-head"><div><span className="a3-eyebrow">Strength Progress</span><h2 className="a3-bigtitle">{selected?.name||'Exercise evidence'}</h2></div></div>
    {selected ? (
      <div className="a3-stack">
        <label className="a3-select"><span className="a3-eyebrow">Exercise</span>
          <select value={selected.id} onChange={e=>setExerciseId(e.target.value)}>
            {exerciseOptions.map(e=><option value={e.id} key={e.id}>{e.name}</option>)}
          </select>
        </label>
        <div className="a3-choices a3-ranges" role="group" aria-label="Exercise range">{(['1M','3M','6M','1Y','All'] as const).map(p=><button key={p} aria-pressed={exRange===p} className={exRange===p?'selected':''} onClick={()=>setExRange(p)}>{p}</button>)}</div>
        <div className="a3-card a3-analytics"><div className="a3-analytics-metric"><strong>{evidenceChange===undefined?'—':`${evidenceChange>=0?'+':''}${evidenceChange}%`}</strong><small>Strength change · {exRange==='All'?'all time':`last ${exRange}`}</small></div><ApexSpark values={evidenceSeries} label={`${selected.name} best load per session`} xLabels={historyRange.length>1?[shortDate(historyRange[0].w.scheduledDate),shortDate(historyRange[historyRange.length-1].w.scheduledDate)]:undefined}/><div className="a3-stats a3-stats-2"><ApexStat label="Best set" value={evidenceBest?formatLoad(selected,evidenceBest):'—'} unit={bestReps?`${bestReps} reps`:''}/><ApexStat label="Sessions" value={String(historyRange.length)} unit="logged"/></div></div>
        <div className="a3-list">
          {history.map(({w,e},i)=>{
            const doneSets=e.sets.filter(x=>x.completed&&x.type!=='warmup');
            const best=Math.max(0,...doneSets.map(x=>x.weight||x.assistance||0));
            const reps=Math.max(0,...doneSets.map(x=>x.reps||0));
            const rirValues=doneSets.map(x=>x.rir).filter((x):x is number=>x!==undefined);
            const avgRir=rirValues.length?(rirValues.reduce((a,b)=>a+b,0)/rirValues.length).toFixed(1):null;
            return <div className="a3-card a3-row" key={w.id}>
              <span className="a3-index">{String(i+1).padStart(2,'0')}</span>
              <div><strong>{best?formatLoad(selected,best):'Bodyweight / time'}</strong><p>{w.scheduledDate} · {doneSets.length} working sets · best {reps||'—'} reps{avgRir?` · RIR ${avgRir}`:''}</p></div>
            </div>;
          })}
          {!history.length&&<Empty title="Complete this exercise first" text="Comparable performance evidence will appear here."/>}
        </div>
      </div>
    ) : <Empty title="Complete an exercise first" text="Exercise-level trends appear after APEX has comparable performance evidence."/>}
   </section>

   <section className="a3-block">
    <div className="a3-head"><h2>Muscle exposure</h2><span className="a3-eyebrow">Recent working sets</span></div>
    <div className="a3-card a3-stack">{muscle.map(([m,v])=><div className="a3-meter-row" key={m}><span>{m}</span><ApexMeter value={Math.min(100,v*8)}/><strong>{v}</strong></div>)}{!muscle.length&&<Empty title="No performance data yet" text="Complete a workout and APEX will build the evidence layer."/>}</div>
   </section>

   </>}

   {tab==='prs'&&<section className="a3-block">
    <div className="a3-head"><h2>Achievements</h2><button className="a3-link" onClick={()=>onNav('history')}>History <Icon name="arrow" size={14}/></button></div>
    <div className="a3-list">{top.map((a,i)=><div className="a3-card a3-row" key={i}><span className="a3-index">{String(i+1).padStart(2,'0')}</span><div><strong>{displayText(a.label)}</strong><p>{a.timestamp.slice(0,10)} · {a.unit}</p></div></div>)}{!top.length&&<Empty title="Achievements will appear here" text="PRs are contextual to exercise and set type."/>}</div>
   </section>}
 </div>
}

function History({s,onNav}:{s:AppState;onNav:(r:string)=>void}){
 const [q,setQ]=useState(''),[status,setStatus]=useState('all'),[monthOffset,setMonthOffset]=useState(0);
 const rows=s.workouts.filter(w=>w.status!=='planned'&&(status==='all'||w.status===status)&&(`${w.name} ${w.scheduledDate} ${w.source}`).toLowerCase().includes(q.toLowerCase())).slice().reverse();
 const base=new Date();
 const first=new Date(base.getFullYear(),base.getMonth()+monthOffset,1);
 const monthLabel=first.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
 const startPad=(first.getDay()+6)%7;
 const daysInMonth=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
 const isoDay=(d:number)=>`${first.getFullYear()}-${String(first.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 const marks=new Map<string,'done'|'partial'|'missed'|'planned'>();
 s.workouts.forEach(w=>{
  const sets=w.exercises.flatMap(e=>e.sets);
  const doneSets=sets.filter(x=>x.completed).length;
  const expected=sets.filter(x=>x.disposition!=='skipped').length;
  const mark:'done'|'partial'|'missed'|'planned'=w.status==='completed'?(doneSets>=expected?'done':'partial'):(w.status==='skipped'||w.status==='missed')?'missed':'planned';
  const prev=marks.get(w.scheduledDate);
  if(!prev||mark==='done'||(mark==='partial'&&prev!=='done'))marks.set(w.scheduledDate,mark);
 });
 const todayIso=today();
 const monthDone=Array.from({length:daysInMonth},(_,i)=>marks.get(isoDay(i+1))).filter(m=>m==='done'||m==='partial').length;
 return <div className="a3-home"><PageTitle eyebrow="HISTORY" title="Workout History" sub="Performed, skipped, missed, rescheduled and extra work remain distinguishable."/>
  <section className="a3-card a3-calendar" aria-label="Training calendar">
   <div className="a3-head"><button className="a3-iconbtn" aria-label="Previous month" onClick={()=>setMonthOffset(x=>x-1)}><Icon name="back" size={18}/></button><div className="a3-cal-title"><strong>{monthLabel}</strong><small>{monthDone} session{monthDone===1?'':'s'}</small></div><button className="a3-iconbtn" aria-label="Next month" disabled={monthOffset>=0} onClick={()=>setMonthOffset(x=>Math.min(0,x+1))}><Icon name="chev" size={18}/></button></div>
   <div className="a3-cal-grid" role="grid">
    {['M','T','W','T','F','S','S'].map((d,i)=><span className="a3-cal-dow" key={i}>{d}</span>)}
    {Array.from({length:startPad},(_,i)=><span key={'p'+i}/>)}
    {Array.from({length:daysInMonth},(_,i)=>{const iso=isoDay(i+1);const mark=marks.get(iso);return <button key={iso} className={`a3-cal-day ${mark?'is-'+mark:''} ${iso===todayIso?'is-today':''} ${q===iso?'selected':''}`} aria-label={`${iso}${mark?` ${mark}`:''}`} aria-pressed={q===iso} onClick={()=>setQ(q===iso?'':iso)}>{i+1}</button>})}
   </div>
   <div className="a3-cal-legend"><span className="is-done">Workout</span><span className="is-partial">Partial</span><span className="is-missed">Missed</span><span className="is-planned">Planned</span></div>
  </section>
  <div className="a3-search"><Icon name="search"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search workout, date…"/></div>
  <div className="a3-chips">{['all','completed','skipped','missed','rescheduled','extra'].map(x=><button className={`a3-pill ${status===x?'selected':''}`} key={x} onClick={()=>setStatus(x)}>{x}</button>)}</div>
  <div className="a3-list">{rows.map(w=><button className="a3-card a3-pick a3-tap history-item" key={w.id} onClick={()=>w.status==='completed'&&onNav('session:'+w.id)}><div><span className="a3-eyebrow">{w.scheduledDate} · {w.status} · {w.source}</span><strong>{w.name}</strong><small>{w.exercises.length} exercises · {w.exercises.reduce((a,e)=>a+e.sets.filter(x=>x.completed).length,0)} completed sets · {vol(volumeForWorkout(w,s.exercises)).toLocaleString()} {volLabel()}</small></div><Icon name="chev"/></button>)}{!rows.length&&<Empty title="Nothing to show" text="Your timeline will populate as training happens."/>}</div>
 </div>}
function Goals({s,update}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void}){
 const [open,setOpen]=useState(false),[title,setTitle]=useState(''),[kind,setKind]=useState<GoalKind>('strength'),[label,setLabel]=useState('Target'),[value,setValue]=useState(''),[unit,setUnit]=useState('kg'),[targetDate,setTargetDate]=useState('');
 const add=()=>{if(!title.trim())return;const target=value.trim()?{label:label.trim()||'Target',value:Number(value),unit}:undefined;update(x=>({...x,goals:[...x.goals,{id:uid('goal'),kind,title:title.trim(),priority:x.goals.length+1,periodId:uid('period'),status:'active',target,targetDate:targetDate||undefined}]}));setTitle('');setValue('');setTargetDate('');setOpen(false)};
 return <div className="a3-home"><PageTitle eyebrow="GOALS" title="Give training a direction." sub="Multiple objectives can coexist. Targets are explicit and historical training is never rewritten."/>
 <div className="a3-list">{s.goals.map(g=>{const gp=goalProgress(s,g),ms=goalMilestones(s,g);return <div className="a3-card goal-card" key={g.id}><div className="goal-ring">{gp.percent===null?g.priority:`${gp.percent}%`}</div><div><span className="a3-eyebrow">{g.kind.replace('_',' ')}</span><h3>{g.title}</h3><p>{g.target?`${g.target.label}: ${g.target.value} ${g.target.unit}`:'No numeric target yet.'}{g.targetDate?` · by ${g.targetDate}`:''}</p>{gp.percent!==null&&<div className="a3-bar"><i style={{width:`${gp.percent}%`}}/></div>}{ms.length>0&&<div className="a3-chips milestones">{ms.map(m=><span className={m.reached?'reached':''} key={m.threshold}>{m.reached?'✓':'○'} {m.threshold}%</span>)}</div>}{gp.status==='achieved'&&<small className="a3-muted">Target evidence reached. Review the next phase rather than silently changing the goal.</small>}</div></div>})}</div>
 {open&&<section className="a3-card a3-stack plan-editor"><div className="a3-fields"><label>Goal title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Improve pull-up strength"/></label><label>Type<select value={kind} onChange={e=>setKind(e.target.value as GoalKind)}>{['strength','hypertrophy','fat_loss','fitness','general'].map(x=><option key={x}>{x}</option>)}</select></label><label>Target label<input value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. Bench press"/></label><label>Target value<input inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} placeholder="Optional"/></label><label>Unit<select value={unit} onChange={e=>setUnit(e.target.value)}>{['kg','reps','sessions','minutes','cm','%'].map(x=><option key={x}>{x}</option>)}</select></label><label>Target date<input type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)}/></label></div><button className="a3-cta" onClick={add}>Create goal</button></section>}
 <button className="a3-cta a3-cta-ghost" onClick={()=>setOpen(!open)}><Icon name="plus"/> {open?'Close':'Add goal'}</button></div>}
function PlanStudio({s,update,onStart}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void;onStart:(w:Workout)=>void}){const [selected,setSelected]=useState<string|null>(null),[q,setQ]=useState('');const plan=s.plan,day=plan?.days.find(d=>d.id===selected),workout=day?.workoutId?s.workouts.find(w=>w.id===day.workoutId):day?s.workouts.find(w=>w.planId===plan?.id&&w.name===day.label&&w.status!=='completed'&&w.status!=='missed'&&w.status!=='skipped'):undefined;const results=s.exercises.filter(e=>!q||`${e.name} ${e.aliases.join(' ')} ${e.pattern} ${e.primaryMuscles.join(' ')}`.toLowerCase().includes(q.toLowerCase())).slice(0,18);const edit=(fn:(w:Workout)=>Workout,reason:string)=>{if(!workout||!plan)return;update(x=>{const p=x.plan!;const currentWorkout=x.workouts.find(w=>w.id===workout.id);if(!currentWorkout)return x;const nextW=fn(currentWorkout);const nextPlan=planWithDays(p,p.days);nextW.currentPlanVersion=nextPlan.version;return{...x,workouts:x.workouts.map(w=>w.id===nextW.id?nextW:w),plan:nextPlan,eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'plan_edit',timestamp:new Date().toISOString(),payload:{reason}}]}})};const add=(id:string)=>edit(w=>{const ex=s.exercises.find(e=>e.id===id);if(!ex)return w;return{...w,version:w.version+1,updatedAt:new Date().toISOString(),exercises:[...w.exercises,{exerciseId:id,sets:Array.from({length:2},()=>makeSet('working',ex)),prescribedSets:2,repRange:ex.repRange,restSec:ex.restSec,order:w.exercises.length}]};},'add exercise');const remove=(id:string)=>edit(w=>({...w,version:w.version+1,updatedAt:new Date().toISOString(),exercises:w.exercises.filter(e=>e.exerciseId!==id).map((e,i)=>({...e,order:i}))}),'remove exercise');return <div className="a3-home"><PageTitle eyebrow="PLAN STUDIO" title="Shape the structure." sub="Future structure is editable. Historical sessions remain immutable."/><div className="a3-card a3-stack plan-panel"><div className="a3-head plan-header"><div><span className="a3-eyebrow">ACTIVE PLAN</span><h2>{plan?.name||'No plan'}</h2><small className="a3-muted">{plan?.mode==='continuous'?'Continuous training':`${plan?.weeks||'—'} week horizon`}</small></div><span className="a3-chip version">v{plan?.version||1}</span></div>{plan?.days.map((d,i)=>{const w=d.workoutId?s.workouts.find(x=>x.id===d.workoutId):!d.rest?s.workouts.find(x=>x.planId===plan?.id&&x.name===d.label&&x.status!=='completed'&&x.status!=='missed'&&x.status!=='skipped'):undefined;return <button className={`a3-card a3-row a3-tap day-card ${selected===d.id?'selected':''}`} key={d.id} onClick={()=>setSelected(selected===d.id?null:d.id)}><span className="a3-index">{String(i+1).padStart(2,'0')}</span><span><strong>{d.label}</strong><small>{d.rest?'Recovery / rest':`${w?.exercises.length||0} exercises · ${w?.scheduledDate||''}`}</small></span>{w&&<span className="a3-pill" onClick={e=>{e.stopPropagation();onStart(w)}}><Icon name="play" size={15}/></span>}</button>})}</div>{day&&workout&&<section className="a3-card a3-stack plan-editor"><div className="a3-head"><div><span className="a3-eyebrow">EDITING {day.label}</span><h2>{workout.name}</h2></div><button className="a3-cta a3-cta-ghost" onClick={()=>setSelected(null)}>Done</button></div><div className="a3-list">{workout.exercises.map((we,i)=>{const e=s.exercises.find(x=>x.id===we.exerciseId);return <div className="a3-card a3-row editor-exercise" key={`${we.exerciseId}-${i}`}><span className="a3-index">{String(i+1).padStart(2,'0')}</span><div><strong>{e?.name||'Exercise unavailable'}</strong><small>{we.prescribedSets} sets · {we.repRange[0]}–{we.repRange[1]}</small></div>{e?<button className="a3-pill" onClick={()=>remove(e.id)}>Remove</button>:<span className="a3-muted">Missing data</span>}</div>})}</div><div className="a3-search"><Icon name="search"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Add exercise…"/></div><div className="a3-list">{results.map(e=><button className="a3-card a3-pick a3-tap" key={e.id} onClick={()=>add(e.id)}><span><strong>{e.name}</strong><small>{e.pattern} · {e.primaryMuscles.join(' · ')}</small></span><Icon name="plus"/></button>)}</div></section>}<div className="a3-card a3-callout"><Icon name="bolt"/><div><strong>Version-aware plan</strong><p>Every structural edit creates a new plan version. A completed workout never gets rewritten.</p></div></div></div>}
function Library({s,query,setQuery,onExercise}:{s:AppState;query:string;setQuery:(x:string)=>void;onExercise:(id:string)=>void}){
 const [equipmentOnly,setEquipmentOnly]=useState(false);
 const available=s.profile?.equipment||[];
 const filtered=findExercises(query).filter(e=>s.exercises.some(x=>x.id===e.id)).filter(e=>!equipmentOnly||equipmentFit(e,available)!=='unavailable');
 const equipmentLabel=available.length?`${available.length} equipment types available`:'Equipment not set'; const report=knowledgeReport(s);
 return <div className="a3-home"><PageTitle eyebrow="EXERCISE LIBRARY" title="Find a movement." sub="Canonical identity, aliases, equipment, load semantics and alternatives."/>
 <div className="a3-search"><Icon name="search"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Chest press, row, squat…"/></div>
 <div className="a3-chips">{['','horizontal_push','horizontal_pull','vertical_pull','squat','hinge','core','arm_flexion'].map(x=><button className="a3-pill" key={x||'all'} onClick={()=>setQuery(x)}>{x?x.replace('_',' '):'all'}</button>)}</div>
 <div className="a3-toolbar"><span className="a3-muted">{filtered.length} movements · {equipmentLabel}</span><span className="a3-muted">Knowledge {report.healthy?'validated':`${report.errors} issues`}</span><label className="a3-toggle"><span>Available equipment first</span><input type="checkbox" checked={equipmentOnly} onChange={e=>setEquipmentOnly(e.target.checked)}/></label></div>
 <div className="a3-list library-grid">{filtered.map(e=>{const fit=equipmentFit(e,available);return <button className="a3-card a3-tile a3-tap exercise-tile" key={e.id} onClick={()=>onExercise(e.id)}><span className="a3-chip">{e.loadSemantics.replace('_',' ')}</span><strong>{e.name}</strong><small>{e.primaryMuscles.join(' · ')}</small><span>{e.repRange[0]}–{e.repRange[1]} · {e.equipment.join(', ')}</span>{available.length>0&&<em className={`a3-chip a3-fit-${fit}`}>{fit==='available'?'Available from your setup':fit==='unknown'?'Confirm for today':'Not in setup'}</em>}</button>})}</div></div>
}
function ExerciseSheet({ex,s,close,onUse,onAlternative}:{ex:Exercise;s:AppState;close:()=>void;onUse:()=>void;onAlternative:(id:string)=>void}){
 const alts=smartAlternatives(ex,s.exercises,s.profile?.equipment);
 return <Modal title={ex.name} close={close}><ApexImage kind={imageKindForExercise(ex)} alt={`Training context for ${ex.name}.`} className="a3-banner" caption={`${ex.pattern.replace(/_/g,' ')} / MOVEMENT CONTEXT`}/><div className="a3-chips"><span>{ex.family}</span><span>{ex.primaryMuscles.join(' · ')}</span><span>{formatLoad(ex,undefined)}</span></div>
 <Detail title="EQUIPMENT"><p>{ex.equipment.length?ex.equipment.join(' · '):'No dedicated equipment required.'}</p></Detail>
 <Detail title="SETUP"><ul>{ex.setup.map(x=><li key={x}>{x}</li>)}</ul></Detail><Detail title="EXECUTION"><ol>{ex.steps.map(x=><li key={x}>{x}</li>)}</ol></Detail><Detail title="BREATHING & TEMPO"><p>{ex.breathing}{ex.tempo?` Tempo: ${ex.tempo}.`:''}</p></Detail><Detail title="CUES"><div className="a3-chips">{ex.cues.map(x=><span key={x}>{x}</span>)}</div></Detail><Detail title="COMMON MISTAKES"><ul>{ex.mistakes.map(x=><li key={x}>{x}</li>)}</ul></Detail><Detail title="SAFETY"><ul>{ex.safety.map(x=><li key={x}>{x}</li>)}</ul></Detail>
 <Detail title="ALTERNATIVES"><div className="a3-list a3-picklist">{alts.map(({exercise,fit,samePattern,sameLoad})=><button key={exercise.id} onClick={()=>onAlternative(exercise.id)}><span><strong>{exercise.name}</strong><small>{fit==='available'?'Available from your setup':fit==='unknown'?'Confirm equipment for today':'Not in current setup'}{samePattern?' · same pattern':''}{sameLoad?' · same load semantics':''}</small></span><Icon name="chev"/></button>)}</div></Detail>
 <button className="a3-cta" onClick={onUse}>Use in training</button></Modal>
}
function Templates({s,update,onStart}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void;onStart:(w:Workout)=>void}){const [name,setName]=useState('');const [selected,setSelected]=useState<string[]>([]);const toggle=(id:string)=>setSelected(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id]);const save=()=>{if(!name.trim()||!selected.length)return;const t:WorkoutTemplate={id:uid('tpl'),name:name.trim(),exerciseIds:selected,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};update(x=>({...x,workoutTemplates:[...(x.workoutTemplates||[]),t]}));setName('');setSelected([])};const useT=(t:WorkoutTemplate)=>{const w=cloneTemplateWorkout(t,today(),s.exercises);update(x=>({...x,workouts:[...x.workouts,w],eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'template_used',timestamp:new Date().toISOString(),payload:{templateId:t.id,workoutId:w.id}}]}));onStart(w)};const remove=(id:string)=>update(x=>({...x,workoutTemplates:(x.workoutTemplates||[]).filter(t=>t.id!==id)}));return <div className="a3-home"><PageTitle eyebrow="TEMPLATES" title="Save the work you repeat." sub="Templates are reusable structures. Completed workouts remain separate historical events."/><section className="a3-card a3-stack plan-editor"><label>Template name<input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Quick upper"/></label><div className="a3-list picker-list">{s.exercises.slice(0,35).map(e=><button className="a3-card a3-pick a3-tap picker-row" key={e.id} onClick={()=>toggle(e.id)}><span><strong>{e.name}</strong><small>{selected.includes(e.id)?'Included':'Tap to include'} · {e.pattern}</small></span>{selected.includes(e.id)?<Icon name="check"/>:<Icon name="plus"/>}</button>)}</div><button className="a3-cta" disabled={!name.trim()||!selected.length} onClick={save}>Save template</button></section><section className="a3-block"><div className="a3-list">{(s.workoutTemplates||[]).map(t=><div className="a3-card a3-stack template-row" key={t.id}><ListRow title={t.name} sub={`${t.exerciseIds.length} exercises`} icon="train" click={()=>useT(t)}/><button className="a3-pill a3-danger" onClick={()=>remove(t.id)}>Delete</button></div>)}</div></section></div>}
function Coach({s,update,onNav}:{s:AppState;update?:(f:(x:AppState)=>AppState)=>void;onNav?:(r:string)=>void}){
  const [q,setQ]=useState('');
  const [messages,setMessages]=useState([{from:'apex',text:'APEX Coach is connected to your training record. Ask what to do next, why a prescription changed, or how to handle today’s session.'}]);
  const buildContext=(userInput?:string)=>{
    const activeWorkout=s.activeWorkoutId?s.workouts.find(w=>w.id===s.activeWorkoutId):undefined;
    const currentWorkout=activeWorkout||s.workouts.find(w=>w.status==='in_progress')||s.workouts.find(w=>w.status==='planned');
    const currentExercise=currentWorkout?.exercises?.[0];
    const exercise=currentExercise?s.exercises.find(e=>e.id===currentExercise.exerciseId):undefined;
    const currentSet=currentExercise?.sets?.find(set=>!set.completed);
    const evidence=coachEvidenceFromState(s,today());
    return {context:evidence.context,plateaus:evidence.plateaus,state:s,profile:s.profile,goals:s.goals,primaryGoal:s.profile?.primaryGoal,planId:s.plan?.id,workoutId:currentWorkout?.id,workout:currentWorkout,exerciseId:exercise?.id,exercise,workoutExercise:currentExercise,setId:currentSet?.id,set:currentSet,recentWorkoutIds:[...s.workouts].sort((a,b)=>b.scheduledDate.localeCompare(a.scheduledDate)).slice(0,10).map(w=>w.id),recentExerciseEntryIds:[],userInput,now:new Date().toISOString()};
  };
  const live=coach(buildContext());
  const ask=()=>{
    const t=q.trim();
    if(!t)return;
    const result=coach(buildContext(t));
    const d=result.decision;
    const text=[result.explanation,d.prescription?.instruction?`Next: ${d.prescription.instruction}`:'',d.confidence?`Confidence: ${d.confidence}`:'',d.confidenceReason?`Why: ${d.confidenceReason}`:''].filter(Boolean).join('\n');
    setMessages(m=>[...m,{from:'user',text:t},{from:'apex',text}]);setQ('');
  };
  const activeWorkout=s.activeWorkoutId?s.workouts.find(w=>w.id===s.activeWorkoutId):s.workouts.find(w=>w.status==='in_progress');
  const currentSet=activeWorkout?.exercises.flatMap(x=>x.sets).find(x=>!x.completed);
  return <div className="a3-home a3-coachscreen">
    {onNav&&<SegTabs route="coach" onNav={onNav}/>}
    <header className="a3-greet a3-pagetitle"><span className="a3-eyebrow">Coach · live context</span><h1>APEX Coach</h1><p className="a3-muted">Your coach reads today’s session, recent evidence and the current prescription, then explains the call instead of hiding it.</p></header>

    <section className="a3-card a3-decision a3-imaged">
      <ApexImage kind="strength-session" alt="" className="a3-hero-image"/>
      <ApexRidge/>
      <div className="a3-decision-top"><span className="badge">{live.decision.action}</span><span className="a3-eyebrow a3-gold">{live.decision.confidence?`${live.decision.confidence} confidence`:'Context grounded'}</span></div>
      <h2>{displayText(live.decision.prescription?.instruction||'Continue with the current training structure when the supplied evidence supports doing so.')}</h2>
      <p>{displayText(live.explanation)}</p>
      {live.decision.confidenceReason&&<div className="a3-decision-reason"><Icon name="shield" size={15}/><span>{displayText(live.decision.confidenceReason)}</span></div>}
    </section>

    {live.decision.candidates.some(c=>c.id==='review_plateau'||c.id==='lighter_session_option')&&<section className="a3-block" aria-label="Coach options">
      <div className="a3-head"><h2>Your options</h2><span className="a3-eyebrow">You decide</span></div>
      <div className="a3-list">{live.decision.candidates.filter(c=>c.id==='review_plateau'||c.id==='lighter_session_option').map(c=><div className="a3-card a3-stack" key={c.id}><strong>{displayText(c.title)}</strong><p className="a3-muted">{displayText(c.description)}</p></div>)}</div>
    </section>}
    {update&&<RecoveryCheckInCard s={s} update={update}/>}

    <div className="a3-stats a3-stats-1">
      <div className="a3-card a3-stat"><span className="a3-eyebrow">Session</span><strong>{activeWorkout?.name||'None active'}</strong><small>{currentSet?`${currentSet.type||'working'} set · ${currentSet.reps||'—'} reps · RIR ${currentSet.rir??'—'}`:'Using your latest record'}</small></div>
      <div className="a3-card a3-stat"><span className="a3-eyebrow">Decision</span><strong>{live.decision.action}</strong><small>{live.decision.confidence?`${live.decision.confidence} confidence`:'Context grounded'}</small></div>
      <div className="a3-card a3-stat"><span className="a3-eyebrow">Coach rule</span><strong>Evidence first</strong><small>Evidence → confidence → prescription → your choice.</small></div>
    </div>

    <section className="a3-block">
      <div className="a3-head"><h2>Ask the coach</h2><span className="a3-eyebrow">{messages.length} messages</span></div>
      <div className="a3-messages">{messages.map((m,i)=><article className={`apex-message ${m.from}`} key={i}><span className="a3-eyebrow">{m.from==='apex'?'APEX':'YOU'}</span><p>{displayText(m.text)}</p></article>)}</div>
      <div className="a3-coach-input"><div className="a3-search"><input aria-label="Ask APEX Coach" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask()} placeholder="Ask about today, progression, recovery or a prescription…"/></div><button aria-label="Ask APEX Coach" disabled={!q.trim()} onClick={ask}><Icon name="arrow"/></button></div>
      <div className="a3-chips"><button className="a3-pill" onClick={()=>setQ('What should I do in my next session?')}>Next session</button><button className="a3-pill" onClick={()=>setQ('Why did APEX choose this prescription?')}>Why this prescription?</button><button className="a3-pill" onClick={()=>setQ('Should I change anything today?')}>Change anything?</button></div>
    </section>
  </div>
}
function RecoveryGate({notice,onRecovered,onFresh}:{notice:RecoveryNotice;onRecovered:(s:AppState)=>void;onFresh:(s:AppState)=>void}){
  const [confirmFresh,setConfirmFresh]=useState(false);
  const [failed,setFailed]=useState(false);
  const [summary,setSummary]=useState<{workouts:number;dropped:number}|null>(null);
  const [recovered,setRecovered]=useState<AppState|null>(null);
  const recover=()=>{const r=repository.recoverRejected();if(!r){setFailed(true);return}setFailed(false);setSummary({workouts:r.workouts,dropped:r.dropped});setRecovered(r.state)};
  if(recovered&&summary)return <div className="a3-home" role="region" aria-label="Data recovery">
    <PageTitle eyebrow="DATA RECOVERY" title="Your data was recovered." sub=""/>
    <section className="a3-card a3-stack"><p className="a3-muted">{summary.workouts} workout{summary.workouts===1?'':'s'} restored{summary.dropped?`, ${summary.dropped} could not be read and were left out`:''}. The original damaged copy is still kept on this device.</p><button className="a3-cta" onClick={()=>onRecovered(recovered)}>Continue to APEX</button></section>
  </div>;
  return <div className="a3-home" role="region" aria-label="Data recovery">
    <PageTitle eyebrow="DATA RECOVERY" title="We couldn’t read your saved data." sub=""/>
    <section className="a3-card a3-stack">
      <p className="a3-muted">Nothing was deleted. The unreadable data is preserved on this device, and APEX will not start an empty app until you choose.</p>
      <p className="a3-muted">Detected {new Date(notice.detectedAt).toLocaleString()} · {notice.bytes.toLocaleString()} characters preserved · {notice.reason==='invalid_json'?'the stored text is not valid data':'the stored data failed integrity checks'}.</p>
      {notice.recoverable
        ?<button className="a3-cta" onClick={recover}>Recover what can be read</button>
        :<p className="a3-muted">This copy cannot be repaired automatically, so it is kept untouched for manual recovery.</p>}
      {failed&&<p role="alert" className="a3-muted">Nothing could be recovered from the preserved copy.</p>}
      {!confirmFresh
        ?<button className="a3-pill" onClick={()=>setConfirmFresh(true)}>Start fresh instead</button>
        :<div className="a3-stack"><p className="a3-muted">Start with an empty app? The damaged copy stays on this device but APEX will no longer show it.</p><button className="a3-pill a3-danger" onClick={()=>onFresh(repository.startFresh())}>Yes, start fresh</button><button className="a3-pill" onClick={()=>setConfirmFresh(false)}>Cancel</button></div>}
    </section>
  </div>
}
function RecoveryCheckInCard({s,update}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void}){
  const date=today();
  const existing=(s.recoveryLog||[]).find(x=>x.date===date);
  const [sleep,setSleep]=useState(existing?.sleepHours!==undefined?String(existing.sleepHours):'');
  const [scale,setScale]=useState<Record<string,number|undefined>>({sleepQuality:existing?.sleepQuality,soreness:existing?.soreness,fatigue:existing?.fatigue});
  const [saved,setSaved]=useState(Boolean(existing));
  const labels:Record<string,string>={sleepQuality:'Sleep quality',soreness:'Soreness',fatigue:'Fatigue'};
  const save=()=>{
    const hours=sleep.trim()===''?undefined:Math.min(24,Math.max(0,Number(sleep)));
    update(x=>({...x,recoveryLog:upsertRecoveryCheckIn(x.recoveryLog,{date,sleepHours:hours,...scale})}));
    setSaved(true);
  };
  const any=sleep.trim()!==''||Object.values(scale).some(v=>v!==undefined);
  return <section className="a3-card a3-stack" aria-label="Recovery check-in">
    <div className="a3-head"><div><span className="a3-eyebrow">RECOVERY CHECK-IN</span><h2>How do you feel today?</h2></div></div>
    <p className="a3-muted">Optional context for your coach. It is evidence, not an instruction: it never changes your prescription on its own.</p>
    <label>Sleep last night (hours)<input className="a3-input" type="number" inputMode="decimal" min={0} max={24} step={0.5} aria-label="Sleep hours" value={sleep} onChange={e=>{setSaved(false);setSleep(e.target.value===''?'':String(Math.min(24,Math.max(0,+e.target.value))))}}/></label>
    {RECOVERY_SCALE_FIELDS.filter(k=>k in labels).map(k=><div key={k} role="group" aria-label={labels[k]}><span className="a3-eyebrow">{labels[k]} · 1 low – 5 high</span>
      <div className="a3-choices weight-range-control">{[1,2,3,4,5].map(v=><button key={v} type="button" aria-pressed={scale[k]===v} className={scale[k]===v?'selected':''} aria-label={`${labels[k]} ${v}`} onClick={()=>{setSaved(false);setScale(x=>({...x,[k]:x[k]===v?undefined:v}))}}>{v}</button>)}</div></div>)}
    <button className="a3-cta" disabled={!any||saved} onClick={save}>{saved?'Check-in saved':'Save check-in'}</button>
  </section>
}
function Learn(){const terms=[['RIR','Reps in reserve: an estimate of how many clean reps you could still perform.'],['RPE','Rate of perceived exertion: a subjective effort description.'],['PR','Personal record: a meaningful achievement appropriate to the movement and set type.'],['ROM','Range of motion: the distance through which a movement travels.'],['AMRAP','As many appropriate reps as the set context allows.'],['Tempo','The cadence of a repetition, such as 2–1–2.'],['Volume','The amount of training work; the exact measure depends on the exercise.'],['Progressive overload','Gradually increasing a useful training stimulus over time.'],['Deload','A reduction in training stress when context supports recovery.']];return <div className="a3-home"><PageTitle eyebrow="LEARN" title="Know what the numbers mean." sub="Tap concepts when you need them. APEX introduces complexity progressively."/><div className="a3-list">{terms.map(([a,b])=><div className="a3-card a3-stack" key={a}><strong>{a}</strong><p>{b}</p></div>)}</div></div>}
function Measurements({s,update}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void}){
 const fields=['neck','shoulders','chest','waist','abdomen','hips','arms','forearms','thighs','calves'];
 const [date,setDate]=useState(today());
 const [range,setRange]=useState<'7D'|'30D'|'3M'|'1Y'|'All'>('30D');
 const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(fields.map(k=>[k,''])));
 const [weight,setWeight]=useState('');
 useEffect(()=>{
   const existing=s.measurements.slice().reverse().find(m=>m.date===date);
   setWeight(existing?.weightKg!==undefined?String(wt(existing.weightKg)):'');
   setValues(Object.fromEntries(fields.map(k=>[k,existing?.values?.[k]!==undefined?String(len(existing.values[k])):''])));
 },[date,s.measurements,s.preferences.units]);

 const save=()=>{
   const vals=Object.fromEntries(fields.filter(k=>values[k].trim()!==''&&Number.isFinite(Number(values[k]))).map(k=>[k,Math.round(fromLen(Number(values[k]))*100)/100]));
   const numericWeight=weight.trim()?Math.round(fromWt(Number(weight))*100)/100:undefined;
   const hasWeight=numericWeight!==undefined&&Number.isFinite(numericWeight)&&numericWeight>0;
   if(!hasWeight&&!Object.keys(vals).length)return;
   const entry:Measurement={id:uid('measurement'),date,weightKg:hasWeight?numericWeight:undefined,values:vals};
   const latestWeightDate=s.measurements.reduce((latest,item)=>item.weightKg!==undefined&&item.date>latest?item.date:latest,'');
   const updateProfileWeight=hasWeight&&date>=latestWeightDate;
   update(x=>({...x,measurements:[...x.measurements,entry],profile:x.profile&&updateProfileWeight?{...x.profile,body:{...x.profile.body,weightKg:numericWeight}}:x.profile,eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'measurement_logged',timestamp:new Date().toISOString(),payload:{date,fields:[...(hasWeight?['weightKg']:[]),...Object.keys(vals)]}}]}));
 };
 const weightByDay=new Map<string,number>();
 s.measurements.forEach(entry=>{
   if(entry.weightKg!==undefined&&Number.isFinite(entry.weightKg))weightByDay.set(entry.date,entry.weightKg);
 });
 const dateOrdinal=(value:string)=>{const[y,m,d]=value.split('-').map(Number);return Date.UTC(y,m-1,d)/86400000};
 const recordedDates=Array.from(weightByDay.keys()).sort();
 const firstRecordedDate=recordedDates[0]||today();
 const rangeLength=range==='7D'?7:range==='30D'?30:range==='3M'?90:range==='1Y'?365:Math.max(1,dateOrdinal(today())-dateOrdinal(firstRecordedDate)+1);
 const chartDays=Array.from({length:rangeLength},(_,index)=>todayPlus(index-(rangeLength-1)));
 const chartEntries=chartDays.map(day=>({date:day,weight:weightByDay.get(day)}));
 const chartRecorded=chartEntries.filter((entry):entry is {date:string;weight:number}=>entry.weight!==undefined);
 const chartMin=chartRecorded.length?Math.min(...chartRecorded.map(entry=>entry.weight)):0;
 const chartMax=chartRecorded.length?Math.max(...chartRecorded.map(entry=>entry.weight)):0;
 const chartRange=Math.max(chartMax-chartMin,0.1);
 const hasInput=(weight.trim()!==''&&Number.isFinite(Number(weight))&&Number(weight)>0)||fields.some(k=>values[k].trim()!==''&&Number.isFinite(Number(values[k])));
 return <div className="a3-home"><PageTitle eyebrow="BODY DATA" title="Measure what matters." sub="Optional measurements add context to progress. APEX stores the numbers; it does not make medical or body-composition claims."/>
 <section className="a3-card a3-stack plan-editor"><div className="a3-fields"><label>Measurement date<input aria-label="Measurement date" type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)}/></label><label>Weight ({weightLabel()})<input min="1" step="0.1" inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="Optional"/></label>{fields.map(k=><label key={k}>{k[0].toUpperCase()+k.slice(1)} ({lengthLabel()})<input min="0" step="0.1" inputMode="decimal" value={values[k]} onChange={e=>setValues(v=>({...v,[k]:e.target.value}))} placeholder="Optional"/></label>)}</div><button className="a3-cta" disabled={!hasInput} onClick={save}>Save measurements for selected date</button></section>
 <section className="section body-weight-trend"><div className="a3-head"><div><span className="a3-eyebrow">BODY / DAILY WEIGHT</span><h2>Day-by-day record.</h2><p>Only logged weigh-ins are shown. Blank days are not estimated.</p></div><span className="a3-eyebrow">{range==='All'?'ALL RECORDED DAYS':`LAST ${range}`}</span></div>
   <div className="a3-choices weight-range-control" role="group" aria-label="Weight history range">
    {(['7D','30D','3M','1Y','All'] as const).map(period=><button key={period} aria-label={`Show ${period} weight trend`} aria-pressed={range===period} className={range===period?'selected':''} onClick={()=>setRange(period)}>{period}</button>)}
   </div>
   {chartRecorded.length? <>
     <div className="a3-stats weight-trend-summary"><div><small>EARLIEST LOGGED</small><strong>{wt(chartRecorded[0].weight).toFixed(1)} {weightLabel()}</strong></div><div><small>LATEST LOGGED</small><strong>{wt(chartRecorded[chartRecorded.length-1].weight).toFixed(1)} {weightLabel()}</strong></div><div><small>CHANGE BETWEEN LOGS</small><strong>{chartRecorded[0]&&chartRecorded[chartRecorded.length-1]?`${chartRecorded[chartRecorded.length-1].weight-chartRecorded[0].weight>=0?'+':''}${wt(chartRecorded[chartRecorded.length-1].weight-chartRecorded[0].weight).toFixed(1)} ${weightLabel()}`:'—'}</strong></div></div>
     <div className="a3-card weight-trend-chart" style={{gridTemplateColumns:`repeat(${chartEntries.length},minmax(0,1fr))`}} role="img" aria-label={`Daily weight over ${range}. ${chartRecorded.map(entry=>`${entry.date}: ${wt(entry.weight)} ${weightWord()}`).join('; ')}`}>
       {chartEntries.map(({date:day,weight:value},index)=>{
         const height=value===undefined?0:22+((value-chartMin)/chartRange)*70;
         const labelEvery=rangeLength<=30?7:rangeLength<=90?14:rangeLength<=365?30:Math.max(1,Math.ceil(rangeLength/12));
         const label=index%labelEvery===0||index===chartEntries.length-1?day.slice(5):'';
         return <div className={`weight-trend-day ${value===undefined?'is-empty':'has-weight'}`} key={day} title={value===undefined?`${day}: no weigh-in`:`${day}: ${wt(value)} ${weightLabel()}`}><i style={{height:`${height}%`}}/><small aria-hidden="true">{label}</small></div>;
       })}
     </div>
     <div className="a3-toolbar weight-trend-range"><span>{wt(chartMin).toFixed(1)} {weightLabel()}</span><span>{wt(chartMax).toFixed(1)} {weightLabel()}</span></div>
   </>:<Empty title="No weight entries yet" text="Choose a date and log a weight to start the daily record."/>}
 </section>
 <section className="a3-block"><div className="a3-head"><div><span className="a3-eyebrow">MEASUREMENT HISTORY</span><h2>Longitudinal context.</h2></div></div><div className="a3-list">{s.measurements.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map(m=><div className="a3-card a3-stack history-item" key={m.id}><div><span className="a3-eyebrow">{m.date}</span><strong>{m.weightKg!==undefined?`${wt(m.weightKg)} ${weightLabel()}`:'No weight logged'}</strong><small>{Object.entries(m.values).map(([k,v])=>`${k} ${len(v)} ${lengthLabel()}`).join(' · ')||'No circumference measurements'}</small></div></div>)}{!s.measurements.length&&<Empty title="No measurements yet" text="Body data is optional. Add a dated snapshot whenever it is useful to you."/>}</div></section>
 <div className="a3-card a3-callout"><Icon name="bolt"/><div><strong>Context, not judgment</strong><p>APEX can compare these measurements with your own historical training record, but it will not infer health conditions or promise a body-composition outcome.</p></div></div></div>}
function You({s,nav,update}:{s:AppState;nav:(r:string)=>void;update:(f:(x:AppState)=>AppState)=>void}){
 const notificationPreview=notificationIntents(s);
 const goSection=(id:string)=>document.getElementById(id)?.scrollIntoView({behavior:s.preferences.reducedMotion?'auto':'smooth',block:'start'});
 const themeName=({apex:'Apex',classic:'Classic Gold',steel:'Steel',aurora:'Aurora',crimson:'Crimson'} as Record<string,string>)[s.preferences.theme||'apex'];
 const [editing,setEditing]=useState(false),[name,setName]=useState(s.profile?.name||''),[pass,setPass]=useState(''),[recovery,setRecovery]=useState(''),[backupBusy,setBackupBusy]=useState(false),[backupMsg,setBackupMsg]=useState(''),[appMsg,setAppMsg]=useState('');
 const summaryText=()=>`APEX ${pkg.version} summary
Completed sessions: ${s.workouts.filter(w=>w.status==='completed').length}
Planned sessions: ${s.workouts.filter(w=>w.status==='planned'||w.status==='rescheduled').length}
Body entries: ${s.measurements.length}
Achievements: ${s.achievements.length}
Units: ${s.preferences.units||'metric'}`;
 const copySummary=async()=>{try{await navigator.clipboard.writeText(summaryText());setAppMsg('Summary copied to clipboard.')}catch{setAppMsg('Copy is unavailable here. Use Data & Export for a full backup.')}};
 const loadEquipment:string[]=Array.from(new Set((s.profile?.equipment||[]).filter(x=>!['bodyweight','bench'].includes(x))));
 const [loadInputs,setLoadInputs]=useState<Record<string,string>>(()=>Object.fromEntries(loadEquipment.map(item=>[item,(s.profile?.loadIncrementsKg?.[item]||[]).map(v=>wt(v)).join(', ')])));
 const saveLoadAvailability=(item:string)=>{
   const values=loadInputs[item]?.split(',').map(v=>Number(v.trim())).filter(v=>Number.isFinite(v)&&v>0).map(v=>Math.round(fromWt(v)*100)/100).sort((a,b)=>a-b)||[];
   update(x=>({...x,profile:x.profile?{...x.profile,loadIncrementsKg:{...(x.profile.loadIncrementsKg||{}),[item]:[...new Set(values)]}}:x.profile}));
 };
 const download=(text:string,filename:string,type='application/json')=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
 const makeBackup=async()=>{setBackupMsg('');if(!pass||pass.length<8){setBackupMsg('Enter a passphrase of at least 8 characters.');return}setBackupBusy(true);try{const key=recovery||recoveryKey();const encrypted=await encryptBackup(repository.exportJson(s),pass,key);download(encrypted,`apex-backup-${today()}.apex`);if(!recovery)setRecovery(key);setBackupMsg(recovery?'Encrypted backup created.':'Backup created. Save the recovery key shown below somewhere safe.');}catch(e){setBackupMsg(e instanceof Error?e.message:'Backup failed.')}finally{setBackupBusy(false)}};
 const importBackup=()=>{const input=document.createElement('input');input.type='file';input.accept='.apex,.json';input.onchange=()=>{const file=input.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{setBackupMsg('');setBackupBusy(true);try{const secret=pass||recovery;if(!secret)throw new Error('Enter the backup passphrase or recovery key first.');const plain=await decryptBackup(String(reader.result),secret);const restored=repository.importJson(plain);update(()=>restored);setBackupMsg('Backup restored. APEX will now use the restored local state.');}catch(e){setBackupMsg(e instanceof Error?e.message:'Restore failed.')}finally{setBackupBusy(false)}};reader.readAsText(file)};input.click()};
 return <div className="a3-home"><PageTitle eyebrow="YOU" title={s.profile?.name||'You'} sub="Control the context APEX uses. Your data remains yours and can travel with you."/>
 <div className="a3-card a3-profile a3-imaged"><ApexImage kind="training-floor" alt="" className="a3-hero-image"/><img src="/brand/apex-mark-gold.png" alt=""/><div><strong>{s.profile?.name||'Private local profile'}</strong><small>{s.profile?.experience||'not set'} · {s.profile?.trainingDays||'—'} days/week · {s.profile?.sessionMinutes||'—'} min</small></div></div>
 <section className="a3-block"><div className="a3-head"><h2>Settings</h2></div><div className="a3-list"><ListRow title="Appearance" sub={themeName} icon="spark" click={()=>goSection('settings-appearance')}/><ListRow title="Notifications" sub={s.preferences.notifications.enabled?'Enabled':'Off'} icon="bolt" click={()=>goSection('settings-notifications')}/><ListRow title="Units" sub={(s.preferences.units||'metric')==='imperial'?'Imperial · lb, in':'Metric · kg, cm'} icon="target" click={()=>goSection('settings-units')}/><ListRow title="Accessibility" sub={`Text size · ${s.preferences.fontScale}`} icon="shield" click={()=>goSection('settings-accessibility')}/><ListRow title="Coach Settings" sub="RIR, progression, experience, equipment" icon="target" click={()=>goSection('settings-coach')}/><ListRow title="App & Export" sub="Version, storage, plain summary" icon="settings" click={()=>goSection('settings-app')}/><ListRow title="Data & Export" sub="Encrypted backup and restore" icon="layers" click={()=>goSection('settings-data')}/><ListRow title="Privacy" sub="Stored on this device, no account" icon="shield" click={()=>goSection('settings-data')}/><ListRow title="About" sub={`Version ${pkg.version}`} icon="bolt" click={()=>goSection('settings-app')}/></div></section>
 {editing&&<section className="a3-card a3-stack"><label>Name<input value={name} onChange={e=>setName(e.target.value)}/></label><button className="a3-cta" onClick={()=>{update(x=>({...x,profile:x.profile?{...x.profile,name:name.trim()}:x.profile}));setEditing(false)}}>Save profile</button></section>}
 <section id="settings-coach" className="a3-card a3-stack a3-settings-anchor"><div className="a3-head"><div><span className="a3-eyebrow">COACH SETTINGS</span><h2>How APEX coaches you.</h2></div></div><div className="a3-list"><ListRow title="RIR system" sub="Target RIR is set per exercise; see how it works" icon="target" click={()=>nav('learn')}/><ListRow title="Progression preferences" sub="Evidence-based, decided by the training engine" icon="chart" click={()=>nav('learn')}/><ListRow title="Training experience" sub={s.profile?.experience||'Not set'} icon="user" click={()=>setEditing(true)}/><ListRow title="Equipment" sub={(s.profile?.equipment||[]).map(x=>x.replace(/_/g,' ')).join(', ')||'Not set'} icon="dumbbell" click={()=>nav('plan')}/></div></section>
 <section id="settings-app" className="a3-card a3-stack a3-settings-anchor"><div className="a3-head"><div><span className="a3-eyebrow">APP & EXPORT</span><h2>About this install.</h2></div></div><p className="a3-muted">Version {pkg.version}. Data stays on this device. Copy a short plain-text summary of your record; use Data & Export below for a full encrypted backup.</p><div className="a3-actions"><button className="a3-cta a3-cta-ghost" onClick={copySummary}>Copy plain summary</button></div>{appMsg&&<p className="a3-muted" role="status">{appMsg}</p>}</section>
 <section id="settings-data" className="a3-card a3-stack a3-settings-anchor"><div className="a3-head"><div><span className="a3-eyebrow">DATA & EXPORT</span><h2>Private by default.</h2></div></div><p className="a3-muted">Core APEX data is stored locally. On Android, SQLite is the native persistence source with a browser fallback. Encrypted backups can be moved manually without an account.</p><label>Backup passphrase<input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="8+ characters" autoComplete="new-password"/></label><div className="a3-actions"><button className="a3-cta" onClick={makeBackup} disabled={backupBusy}>{backupBusy?'Working…':'Create encrypted backup'}</button><button className="a3-cta a3-cta-ghost" onClick={importBackup} disabled={backupBusy}>Restore backup</button></div>{recovery&&<div className="a3-card a3-stack"><span className="a3-eyebrow">RECOVERY KEY — SAVE THIS</span><strong>{recovery}</strong><small>Use this key instead of the passphrase if you need to unlock this backup. APEX cannot reconstruct a lost recovery key.</small><button className="a3-pill" onClick={()=>navigator.clipboard?.writeText(recovery)}>Copy key</button></div>}{backupMsg&&<div className="a3-card a3-callout"><Icon name="bolt"/><div><strong>Backup status</strong><p>{backupMsg}</p></div></div>}</section>
 <section className="a3-card a3-stack"><div className="a3-head"><div><span className="a3-eyebrow">LOAD AVAILABILITY</span><h2>Tell APEX what loads exist.</h2></div></div><p className="a3-muted">Equipment availability answers whether you have the machine. Load availability answers which actual loads you can select. APEX will never recommend a value outside a configured list.</p>{loadEquipment.length?loadEquipment.map(item=><div key={item} className="a3-stack"><label>{item.replace(/_/g,' ')}<input value={loadInputs[item]||''} onChange={e=>setLoadInputs(x=>({...x,[item]:e.target.value}))} placeholder="5, 7.5, 10, 12.5, 15…" inputMode="decimal"/></label><button className="a3-pill" onClick={()=>saveLoadAvailability(item)}>Save loads</button></div>):<div className="a3-card a3-callout"><Icon name="settings"/><div><strong>No external-load equipment configured.</strong><p>Add equipment in your training profile before configuring load options.</p></div></div>}</section>
 <section id="settings-notifications" className="a3-card a3-stack a3-settings-anchor"><div className="a3-head"><div><span className="a3-eyebrow">NOTIFICATIONS</span><h2>Useful, never noisy.</h2></div></div><p className="a3-muted">APEX only prepares action-oriented reminders. You can disable any category without affecting training data.</p>
  <label className="a3-toggle"><span>Notifications enabled</span><input type="checkbox" aria-label="Notifications enabled" checked={s.preferences.notifications.enabled} onChange={e=>update(x=>({...x,preferences:{...x.preferences,notifications:{...x.preferences.notifications,enabled:e.target.checked}}}))}/></label>
  <label className="a3-toggle"><span>Workout reminders</span><input type="checkbox" aria-label="Workout reminders" checked={s.preferences.notifications.workoutReminders} onChange={e=>update(x=>({...x,preferences:{...x.preferences,notifications:{...x.preferences.notifications,workoutReminders:e.target.checked}}}))}/></label>
  <label className="a3-toggle"><span>Missed workout follow-up</span><input type="checkbox" aria-label="Missed workout follow-up" checked={s.preferences.notifications.missedWorkout} onChange={e=>update(x=>({...x,preferences:{...x.preferences,notifications:{...x.preferences.notifications,missedWorkout:e.target.checked}}}))}/></label>
  <label className="a3-toggle"><span>Weekly review</span><input type="checkbox" aria-label="Weekly review" checked={s.preferences.notifications.weeklyReview} onChange={e=>update(x=>({...x,preferences:{...x.preferences,notifications:{...x.preferences.notifications,weeklyReview:e.target.checked}}}))}/></label></section>
 <section className="a3-card a3-stack"><div className="a3-head"><div><span className="a3-eyebrow">NOTIFICATION PLAN</span><h2>Prepared from your context.</h2></div></div><p className="a3-muted">These are deterministic notification intents. Native scheduling and delivery stays behind the platform adapter, so training logic never depends on a notification service.</p><div className="a3-list">{notificationPreview.map(n=><div className="a3-card a3-row" key={n.id}><div><span className="a3-eyebrow">{n.kind}</span><strong>{n.title}</strong><small>{n.body}</small></div></div>)}{!notificationPreview.length&&<Empty title="No reminder needed" text="APEX will not create a notification unless your enabled rules and current training context call for one."/>}</div></section>
 <section id="settings-units" className="a3-card a3-stack a3-settings-anchor"><div className="a3-head"><div><span className="a3-eyebrow">UNITS</span><h2>Weights and lengths.</h2></div></div><p className="a3-muted">Your records are stored consistently. Units only change how loads, volume, body weight and measurements are shown and entered.</p><div className="a3-choices" role="group" aria-label="Unit system">{([['metric','Metric','kg · cm'],['imperial','Imperial','lb · in']] as const).map(([id,name,note])=><button key={id} aria-pressed={(s.preferences.units||'metric')===id} className={(s.preferences.units||'metric')===id?'selected':''} onClick={()=>update(x=>({...x,preferences:{...x.preferences,units:id}}))}><strong>{name}</strong><small>{note}</small></button>)}</div></section>
 <section id="settings-appearance" className="a3-card a3-stack a3-settings-anchor"><div className="a3-head"><div><span className="a3-eyebrow">APPEARANCE</span><h2>Choose your look.</h2></div></div><div className="a3-themes" role="radiogroup" aria-label="Theme">{([['apex','Apex','Cinematic. Balanced.'],['classic','Classic Gold','Warm. Timeless.'],['steel','Steel','Clean. Technical.'],['aurora','Aurora','Futuristic. Calm.'],['crimson','Crimson','Bold. Intense.']] as const).map(([id,name,note])=><button key={id} role="radio" aria-checked={(s.preferences.theme||'apex')===id} data-theme-swatch={id} className={`a3-theme ${(s.preferences.theme||'apex')===id?'selected':''}`} onClick={()=>update(x=>({...x,preferences:{...x.preferences,theme:id}}))}><i className="a3-theme-preview" aria-hidden="true"><ApexImage kind="strength-session" alt=""/><b>Aa</b><u/><s/></i><span><strong>{name}</strong><small>{note}</small></span>{(s.preferences.theme||'apex')===id&&<Icon name="check" size={16}/>}</button>)}</div></section>
 <section id="settings-accessibility" className="a3-card a3-stack a3-settings-anchor"><div className="a3-head"><div><span className="a3-eyebrow">ACCESSIBILITY & FEEDBACK</span><h2>Make APEX comfortable to use.</h2></div></div>
  <label className="a3-toggle"><span>Reduce motion</span><input type="checkbox" aria-label="Reduce motion" checked={s.preferences.reducedMotion} onChange={e=>update(x=>({...x,preferences:{...x.preferences,reducedMotion:e.target.checked}}))}/></label>
  <label className="a3-toggle"><span>High contrast</span><input type="checkbox" aria-label="High contrast" checked={s.preferences.highContrast} onChange={e=>update(x=>({...x,preferences:{...x.preferences,highContrast:e.target.checked}}))}/></label>
  <label className="a3-toggle"><span>Text size</span><select value={s.preferences.fontScale} onChange={e=>update(x=>({...x,preferences:{...x.preferences,fontScale:e.target.value as AppState["preferences"]["fontScale"]}}))}><option value="system">System</option><option value="large">Large</option><option value="larger">Larger</option></select></label>
  <label className="a3-toggle"><span>Haptics</span><input type="checkbox" aria-label="Haptics" checked={s.preferences.haptics} onChange={e=>update(x=>({...x,preferences:{...x.preferences,haptics:e.target.checked}}))}/></label>
  <label className="a3-toggle"><span>Workout sounds</span><input type="checkbox" aria-label="Workout sounds" checked={s.preferences.sounds} onChange={e=>update(x=>({...x,preferences:{...x.preferences,sounds:e.target.checked}}))}/></label><p className="a3-muted">Android system font scaling and screen-reader semantics are respected where the platform provides them.</p></section>
 {(()=>{const k=knowledgeReport(s), issues=inspectState(s), errors=issues.filter(x=>x.severity==='error').length, warnings=issues.filter(x=>x.severity==='warning').length;return <section className="a3-block"><div className="a3-head"><div><span className="a3-eyebrow">SYSTEM HEALTH</span><h2>Trust the record.</h2></div></div><div className="a3-stats"><Metric label="Canonical exercises" value={String(k.exerciseCount)} sub={k.errors===0?'knowledge valid':`${k.errors} errors`}/><Metric label="State errors" value={String(errors)} sub={warnings?`${warnings} warnings`:'no warnings'}/><Metric label="Stored events" value={String(s.eventLog?.length||0)} sub="local audit trail"/></div>{(k.warnings>0||warnings>0)&&<div className="a3-card a3-callout"><Icon name="settings"/><div><strong>Review recommended</strong><p>{k.warnings+warnings} non-blocking integrity or knowledge warnings are present. APEX keeps them visible instead of silently rewriting your history.</p></div></div>}{errors===0&&k.errors===0&&<p className="a3-muted">No blocking data-integrity or canonical-knowledge errors detected in the current local state.</p>}</section>})()}
 <div className="a3-list"><ListRow title="Today" sub="Daily overview" icon="calendar" click={()=>nav('today')}/><ListRow title="Nutrition" sub="Protein, water and meals" icon="activity" click={()=>nav('nutrition')}/><ListRow title="Goals"  sub={`${s.goals.length} active/history goals`} icon="target" click={()=>nav('goals')}/><ListRow title="Body measurements" sub={`${s.measurements.length} logged entries`} icon="chart" click={()=>nav('measurements')}/><ListRow title="Plan Studio" sub="Structure and future sessions" icon="target" click={()=>nav('plan')}/><ListRow title="Exercise Library" sub={`${s.exercises.length} canonical movements`} icon="search" click={()=>nav('library')}/><ListRow title="Templates" sub={`${s.workoutTemplates?.length||0} saved templates`} icon="train" click={()=>nav('templates')}/><ListRow title="Coach" sub="Explain local evidence" icon="bolt" click={()=>nav('coach')}/><ListRow title="Learn" sub="Glossary and training concepts" icon="chart" click={()=>nav('learn')}/><ListRow title="Edit profile" sub="Change your name or training context" icon="user" click={()=>setEditing(!editing)}/><ListRow title="Reset personal intelligence" sub={`${s.observations.length} observations · raw history preserved`} icon="settings" click={()=>update(x=>({...x,observations:[]}))}/><ListRow title="Reset app data" sub="Delete local APEX state" icon="settings" click={()=>{if(confirm('Delete all local APEX data? This cannot be undone without a backup.')){repository.reset();location.reload()}}}/></div></div>}
function Command({nav,setQuery,close}:{nav:(r:string)=>void;setQuery:(x:string)=>void;close:()=>void}){const [q,setQ]=useState('');const run=(raw=q)=>{const x=raw.toLowerCase();if(x.includes('progress'))nav('progress');else if(x.includes('history')||x.includes('last workout'))nav('history');else if(x.includes('goal'))nav('goals');else if(x.includes('measurement')||x.includes('body data'))nav('measurements');else if(x.includes('plan'))nav('plan');else if(x.includes('coach')||x.includes('why'))nav('coach');else if(x.includes('template'))nav('templates');else if(x.includes('learn')||x.includes('rir'))nav('learn');else if(x.includes('exercise')||x.includes('squat')||x.includes('press')||x.includes('row')){setQuery(raw);nav('library')}else nav('home');close()};return <Modal title="Command Center" close={close}><div className="a3-search"><Icon name="search"/><input autoFocus value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&run()} placeholder="Find, explain, navigate…"/><button onClick={()=>run()}>Go</button></div><div className="a3-list a3-picklist">{['Show my progress','Find chest press exercises','Open my plan','Explain RIR','Open templates'].map(x=><button key={x} onClick={()=>run(x)}>{x}<Icon name="chev"/></button>)}</div></Modal>}
function Detail({title,children}:{title:string;children:React.ReactNode}){return <div className="a3-card a3-stack"><span className="a3-eyebrow">{title}</span>{children}</div>}
function Metric({label,value,sub}:{label:string;value:string;sub:string}){return <div className="a3-card a3-stat"><span className="a3-eyebrow">{label}</span><strong>{value}</strong><small>{sub}</small></div>}
function ListRow({title,sub,icon,click}:{title:string;sub:string;icon:string;click:()=>void}){return <button className="a3-card a3-row a3-tap" onClick={click}><span className="a3-rowicon"><Icon name={icon}/></span><span><strong>{title}</strong><small>{sub}</small></span><Icon name="chev"/></button>}
function NavItem({active,icon,label,click}:{active:boolean;icon:string;label:string;click:()=>void}){return <button aria-current={active?'page':undefined} className={`nav-item ${active?'active':''}`} onClick={click}><Icon name={icon}/><span>{label}</span></button>}
function PageTitle({eyebrow,title,sub}:{eyebrow:string;title:string;sub:string}){return <header className="a3-greet a3-pagetitle"><span className="a3-eyebrow">{eyebrow}</span><h1>{title}</h1><p className="a3-muted">{sub}</p></header>}
/* Plan names may be generated in capitals; the reference shows editorial title case. */
const niceName=(n:string)=>n&&n===n.toUpperCase()?n.toLowerCase().split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' '):n;
function Empty({title,text,action}:{title:string;text:string;action?:{label:string;onClick:()=>void}}){return <div className="a3-card a3-empty"><Icon name="bolt"/><strong>{title}</strong><p>{text}</p>{action&&<button className="a3-cta" onClick={action.onClick}>{action.label} <Icon name="arrow" size={16}/></button>}</div>}
/* Changing numbers re-key on value so a short fade/slide plays; CSS disables it for reduced motion. */
function Num({value}:{value:React.ReactNode}){return <span className="a3-num" key={String(value)}>{value}</span>}
function BumpInput(props:React.InputHTMLAttributes<HTMLInputElement>){
 const ref=useRef<HTMLInputElement>(null);const first=useRef(true);
 useEffect(()=>{if(first.current){first.current=false;return}const el=ref.current;if(!el)return;el.classList.remove('a3-bump');void el.offsetWidth;el.classList.add('a3-bump')},[props.value]);
 return <input ref={ref} {...props}/>
}
type StateKind='loading'|'empty'|'error'|'success'|'pr';
/* One reusable full-panel state: loading, empty, error, success and PR celebration share layout and motion. */
function StateView({kind,title,text,detail,progress,primary,secondary}:{kind:StateKind;title:string;text?:string;detail?:string;progress?:number;primary?:{label:string;onClick:()=>void};secondary?:{label:string;onClick:()=>void}}){
 const icon=kind==='error'?'alert':kind==='pr'?'crown':kind==='success'?'check':kind==='empty'?'dumbbell':'bolt';
 return <section className={`a3-stateview is-${kind}`} role={kind==='error'?'alert':'status'} aria-live={kind==='error'?'assertive':'polite'}>
  {kind==='pr'&&<span className="a3-pr-rays" aria-hidden="true"/>}
  <span className="a3-state-icon" aria-hidden="true">{kind==='loading'?<img src="/brand/apex-mark-gold.png" alt=""/>:<Icon name={icon} size={kind==='pr'?40:kind==='error'||kind==='empty'?56:34}/>}</span>
  <h2>{title}</h2>
  {detail&&<strong className="a3-state-detail">{detail}</strong>}
  {text&&<p>{text}</p>}
  {kind==='loading'&&<div className={`a3-state-bar ${progress===undefined?'is-indeterminate':''}`} role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress===undefined?undefined:Math.round(progress)}><i style={progress===undefined?undefined:{width:`${Math.max(0,Math.min(100,progress))}%`}}/>{progress!==undefined&&<small>{Math.round(progress)}%</small>}</div>}
  {primary&&<button className={kind==='error'?'a3-cta a3-danger':'a3-cta'} onClick={primary.onClick}>{primary.label}</button>}
  {secondary&&<button className="a3-ghost" onClick={secondary.onClick}>{secondary.label}</button>}
 </section>
}
const LoadingPanel=({progress}:{progress?:number})=><main className="a3-errorpage"><StateView kind="loading" title="Loading your workout…" text="Preparing your personalised training experience." progress={progress}/></main>;
const ErrorPanel=({onRetry,onBack}:{onRetry:()=>void;onBack:()=>void})=><main className="a3-errorpage"><StateView kind="error" title="Something went wrong" text="We couldn't load your data. Please check your connection and try again. Your training data is stored on this device and has not been changed." primary={{label:'Try Again',onClick:onRetry}} secondary={{label:'Go Back',onClick:onBack}}/></main>;
class ApexErrorBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed
  ?<div className="app" data-theme="apex"><ErrorPanel onRetry={()=>this.setState({failed:false})} onBack={()=>{try{history.back()}catch{}this.setState({failed:false})}}/></div>
  :this.props.children}
}
function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){
 /* Portal to .app: screen wrappers animate with transforms, which would otherwise become the containing block for this fixed sheet. */
 return createPortal(<div className="a3-modal-backdrop modal-transition" onMouseDown={e=>e.currentTarget===e.target&&close()}><div className="a3-modal" role="dialog" aria-modal="true" aria-labelledby="apex-modal-title"><div className="a3-modal-head"><h2 id="apex-modal-title">{title}</h2><button className="a3-iconbtn" title="Close" aria-label="Close dialog" onClick={close}>×</button></div>{children}</div></div>,document.querySelector('.app')||document.body)}
/* Dev-only: ?apexState=loading|error renders those panels for visual review. Stripped from production builds. */
const previewState=import.meta.env.DEV?new URLSearchParams(location.search).get('apexState'):null;
createRoot(document.getElementById('root')!).render(<ApexErrorBoundary>{previewState==='error'?<div className="app" data-theme="apex"><ErrorPanel onRetry={()=>{}} onBack={()=>{}}/></div>:previewState==='loading'?<div className="app" data-theme="apex"><LoadingPanel progress={72}/></div>:<App/>}</ApexErrorBoundary>);
