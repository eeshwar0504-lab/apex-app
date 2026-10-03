import {useEffect,useMemo,useState} from 'react';
import type {AppState,Exercise,Workout} from '../core/types';
import {requiredEquipment,createCustomWorkout,uid,replaceWorkoutExercise,rescheduleWorkoutWithEvent,rankSubstitutes,isEquivalentSubstitution,equipmentFit,smartAlternatives,loadAvailability} from '../engine/training';
import {adaptationsForWorkout} from '../engine/intelligence';
import {recoveryStatus} from '../engine/deload';

import {wt,weightLabel,displayText} from '../data/units';
import {today,formatLoad,niceName,equipmentLabel,sourceLabel} from '../ui/shared';
import {Icon,SegBar,Empty,StateView,Disclosure} from '../ui/primitives';
import {useExperience} from '../ui/experience';
import {trainingWeek} from '../ui/week';
import {WeekLine,BlockView,weekSentence,sessionsOn} from './TrainingMap';
import {Modal,useConfirm} from '../ui/dialogs';
import {recommendationFor,completeGuidedSession} from '../ui/stateHelpers';

import {workingOf} from '../ui/setHelpers';



export function Train({s,onStart,onNav,update}:{s:AppState;onStart:(w:Workout)=>void;onNav:(r:string)=>void;update:(f:(x:AppState)=>AppState)=>void}){
 const {standard,advanced}=useExperience();
 const upcoming=s.workouts.filter(w=>w.status==='planned'||w.status==='rescheduled').sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate));
 const extra=s.workouts.filter(w=>w.source==='extra');
 const todayWorkout=upcoming.find(w=>w.scheduledDate===today());
 const nextWorkout=upcoming[0];
 const [reschedule,setReschedule]=useState<Workout|null>(null),[date,setDate]=useState(today());
 const [zoom,setZoom]=useState<'session'|'week'|'block'|'history'>('week');
 const [weekOffset,setWeekOffset]=useState(0);
 const [selected,setSelected]=useState(today());
 const [editing,setEditing]=useState(false);
 /* a session that was just finished travels into the week: its node carries the same object name as the completion artifact */
 const [fresh]=useState(()=>{try{return sessionStorage.getItem('apex-fresh-session')||undefined}catch{return undefined}});
 useEffect(()=>{if(!fresh)return;const t=window.setTimeout(()=>{try{sessionStorage.removeItem('apex-fresh-session')}catch{}},1500);return()=>window.clearTimeout(t)},[fresh]);
 const {ask,dialog}=useConfirm();
 const createExtra=()=>ask({title:'Start an extra session?',message:'This adds a short extra workout for today and starts it. Your plan is not changed.',confirmLabel:'Start extra session'},()=>{const ids=s.exercises.slice(0,5).map(e=>e.id);const w=createCustomWorkout('Extra Session',today(),ids,s.exercises);w.source='extra';w.status='planned';update(x=>({...x,workouts:[...x.workouts,w],eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'extra_workout_created',timestamp:new Date().toISOString(),payload:{workoutId:w.id}}]}));onStart(w)});
 const skipWorkout=(w:Workout)=>ask({title:'Skip this workout?',message:`${w.name} on ${w.scheduledDate} will be marked as skipped. Your plan carries on with the next session.`,confirmLabel:'Skip workout'},()=>update(x=>({...x,workouts:x.workouts.map(q=>q.id===w.id?{...q,status:'skipped',updatedAt:new Date().toISOString()}:q)})));
 const commitReschedule=()=>{if(!reschedule||!date)return;const pair=rescheduleWorkoutWithEvent(reschedule,date);update(x=>({...x,workouts:x.workouts.map(w=>w.id===pair.original.id?pair.original:w).concat(pair.replacement),eventLog:[...(x.eventLog||[]),pair.event]}));setReschedule(null)};
 const completed=s.workouts.filter(w=>w.status==='completed').length;
 const activeW=s.workouts.find(w=>w.status==='in_progress');
 const focus=activeW||todayWorkout||nextWorkout;
 const isActive=!!activeW;
 const week=trainingWeek(s,weekOffset);
 const dayWorkouts=sessionsOn(week,selected);
 const rows=(focus?.exercises||[]).map((we,i)=>{
   const ex=s.exercises.find(e=>e.id===we.exerciseId);
   if(!ex)return null;
   const rec=recommendationFor(ex,s);
   const load=formatLoad(ex,we.recommendedWeight??rec.weight);
   const fit=equipmentFit(ex,s.profile?.equipment);
   const alts=smartAlternatives(ex,s.exercises,s.profile?.equipment).length;
   const done=workingOf(we.sets).filter(x=>x.completed).length;
   return {we,ex,i,rec,load,fit,alts,done};
 }).filter(Boolean) as Array<{we:Workout['exercises'][number];ex:Exercise;i:number;rec:ReturnType<typeof recommendationFor>;load:string;fit:ReturnType<typeof equipmentFit>;alts:number;done:number}>;
 const activeRow=rows.findIndex(r=>r.done<workingOf(r.we.sets).length);
 const fitLabel={available:'Equipment ready',unknown:'Check equipment',unavailable:'Equipment unavailable'} as const;
 const kicker=isActive?'In progress':todayWorkout?'Today':nextWorkout?'Next session':'Train';
 const briefRoute=focus?`brief:${focus.id}`:'plan';
 if(!focus&&!upcoming.length&&!completed)return <div className="train-screen a3-home"><StateView kind="empty" title="Your first session draws the first line." text="Create your first session in Plan Studio and it will appear here." primary={{label:'Open Plan Studio',onClick:()=>onNav('plan')}}/></div>;
 const sessionRow=(w:Workout)=><article className="a3-card a3-queue" key={w.id}>
   <button className="a3-queue-main" onClick={()=>w.status==='completed'?onNav('session:'+w.id):onStart(w)}><span className="a3-index">{w.scheduledDate===today()?'TODAY':w.scheduledDate.slice(5)}</span><span><strong>{w.name}</strong><small>{[`${w.exercises.length} exercises`,w.status==='completed'?'completed':sourceLabel(w.source),w.status==='rescheduled'?'moved':''].filter(Boolean).join(' · ')}</small></span><Icon name="arrow" size={16}/></button>
   {editing&&w.status!=='completed'&&<div className="a3-queue-actions"><button className="mini-btn" onClick={()=>{setReschedule(w);setDate(w.scheduledDate)}}>Move</button><button className="mini-btn" onClick={()=>skipWorkout(w)}>Skip</button></div>}
 </article>;
 return <div className="train-screen a3-home">
  <header className="a3-greet"><span className="a3-eyebrow">{completed>0?`Train · ${completed} session${completed===1?'':'s'} logged`:'Train'}</span><h1>{focus?niceName(focus.name):'Plan your next session.'}</h1></header>

  <SegBar label="Training map scale" value={zoom} onChange={setZoom} items={[['session','Session'],['week','Week'],['block','Block'],['history','History']]}/>

  {zoom==='week'&&<section className="a3-block apex-map" aria-label="Training week">
   <div className="a3-head">
    <button className="a3-iconbtn" aria-label="Previous week" onClick={()=>setWeekOffset(x=>x-1)}><Icon name="back" size={18}/></button>
    <div className="a3-cal-title"><strong>{weekOffset===0?'This week':week.start}</strong><small>{weekSentence(week)}</small></div>
    <button className="a3-iconbtn" aria-label="Next week" onClick={()=>setWeekOffset(x=>x+1)}><Icon name="chev" size={18}/></button>
   </div>
   <WeekLine week={week} selected={selected} onSelect={n=>setSelected(n.iso)} fresh={fresh}/>
   {completed===1&&weekOffset===0&&<p className="a3-muted apex-first-line">Your first session is on the line.</p>}
   <div className="a3-list">{dayWorkouts.length?dayWorkouts.map(sessionRow):<p className="a3-muted apex-rest-day">{selected===today()?'Today is a rest day.':'Rest day. Recovery is part of the plan.'}</p>}</div>
  </section>}

  {zoom==='block'&&<section className="a3-block apex-map" aria-label="Training block"><BlockView s={s} onSelectWeek={o=>{setWeekOffset(o);setZoom('week')}}/></section>}

  {zoom==='history'&&<section className="a3-block apex-map" aria-label="Training history">
   <div className="a3-list">{s.workouts.filter(w=>w.status==='completed').sort((a,b)=>String(b.completedAt||b.scheduledDate).localeCompare(String(a.completedAt||a.scheduledDate))).slice(0,6).map(sessionRow)}
    {!completed&&<Empty title="Your training history begins here." text="Finish a session and it appears on this line."/>}</div>
   <button className="a3-cta a3-cta-ghost" onClick={()=>onNav('history')}>Open full history</button>
  </section>}

  <section className="a3-card a3-session apex-thread-card">
   <div className="a3-session-head">
    <div><span className="a3-eyebrow a3-gold">{kicker}</span><p className="a3-meta"><Icon name="clock" size={14}/>{focus?`${focus.exercises.length} exercises${s.profile?.sessionMinutes?` · ~${s.profile.sessionMinutes} min`:''} · ${focus.scheduledDate===today()?'Today':focus.scheduledDate}`:'No session scheduled'}</p></div>
   </div>
   <button className="a3-cta" onClick={()=>focus?onStart(focus):onNav('plan')}>{focus?(isActive?'Resume session':'Begin session'):'Open Plan Studio'}<Icon name={focus?'play':'arrow'} size={18}/></button>
   <div className="a3-session-actions">
    {focus&&!isActive&&<button className="a3-link" onClick={()=>onNav(briefRoute)}>Session brief &amp; swaps <Icon name="arrow" size={14}/></button>}
    <button className="a3-link" onClick={createExtra}>Extra session <Icon name="plus" size={14}/></button>
   </div>
  </section>

  {zoom==='session'&&rows.length>0&&<section className="a3-block"><div className="a3-head"><h2>Exercises</h2><span className="a3-eyebrow">{rows.length} movements</span></div>
   <div className="a3-list">{rows.map(r=><article className={`a3-card a3-exercise ${r.done>=workingOf(r.we.sets).length?'is-done':r.i===activeRow?'is-active':''}`} key={r.we.exerciseId+r.i}>
    <div className="a3-exthumb"><em>{String(r.i+1).padStart(2,'0')}</em></div>
    <div className="a3-exercise-body">
     <strong>{r.ex.name}</strong>
     <p>{r.we.prescribedSets} × {r.we.repRange[0]}–{r.we.repRange[1]} {r.ex.loadSemantics==='time'?'sec':'reps'}</p>
     <dl className="a3-spec"><div><dt>Weight</dt><dd>{r.rec.weight===undefined&&r.ex.loadSemantics!=='bodyweight'&&r.ex.loadSemantics!=='time'&&r.ex.loadSemantics!=='none'?'Start light':r.load}</dd></div>{advanced&&<div><dt>RIR</dt><dd>{r.rec.targetRir}</dd></div>}</dl>
     <div className="a3-exercise-foot">
      {r.fit!=='available'&&<span className={`a3-chip a3-fit-${r.fit}`}>{fitLabel[r.fit]}</span>}
      {standard&&<span className={`a3-chip a3-state ${r.done>=workingOf(r.we.sets).length?'is-done':r.i===activeRow?'is-active':''}`}>{r.done>=workingOf(r.we.sets).length?'Done':r.i===activeRow?(isActive?'Active':'Next up'):'Up next'}</span>}
      {r.done>0&&<span className="a3-chip">{r.done}/{workingOf(r.we.sets).length} sets</span>}
      {!isActive&&r.alts>0&&<button className="a3-link" onClick={()=>onNav(briefRoute)}>{r.alts} swap option{r.alts===1?'':'s'}</button>}
     </div>
    </div>
   </article>)}</div>
  </section>}

  <section className="a3-block"><div className="a3-head"><h2>Up next</h2><button className="a3-pill" aria-pressed={editing} onClick={()=>setEditing(x=>!x)}>{editing?'Done editing':'Edit'}</button></div>
   <div className="a3-list">{upcoming.slice(0,standard?8:3).map(w=><article className="a3-card a3-queue" key={w.id}><button className="a3-queue-main" onClick={()=>onStart(w)}><span className="a3-index">{w.scheduledDate===today()?'TODAY':w.scheduledDate.slice(5)}</span><span><strong>{w.name}</strong><small>{[`${w.exercises.length} exercises`,sourceLabel(w.source),w.status==='rescheduled'?'moved':''].filter(Boolean).join(' · ')}</small></span><Icon name="arrow" size={16}/></button>{editing&&<div className="a3-queue-actions"><button className="mini-btn" onClick={()=>{setReschedule(w);setDate(w.scheduledDate)}}>Move</button><button className="mini-btn" onClick={()=>skipWorkout(w)}>Skip</button></div>}</article>)}{!upcoming.length&&<Empty title="Nothing planned" text="Use Plan Studio to build your next session."/>}</div>
  </section>

  <div className="a3-tools"><button className="a3-card a3-tap" onClick={()=>onNav('plan')}><Icon name="calendar"/>Plan Studio</button><button className="a3-card a3-tap" onClick={()=>onNav('templates')}><Icon name="layers"/>Templates</button><button className="a3-card a3-tap" onClick={()=>onNav('library')}><Icon name="search"/>Library</button><button className="a3-card a3-tap" onClick={()=>onNav('coach')}><Icon name="spark"/>Coach</button></div>

  {extra.length>0&&<section className="a3-block"><div className="a3-head"><h2>Extra work</h2></div><div className="a3-list">{extra.slice(-5).reverse().map(w=><button className="a3-card a3-row a3-tap" key={w.id} onClick={()=>onStart(w)}><span className="a3-index">+</span><div><strong>{w.name}</strong><p>{w.scheduledDate} · {w.status}</p></div><Icon name="arrow" size={16}/></button>)}</div></section>}
  {dialog}
  {reschedule&&<Modal title="Reschedule session" close={()=>setReschedule(null)}><p className="modal-copy">Pick the day you want to train instead.</p><label>New date<input type="date" value={date} min={today()} onChange={e=>setDate(e.target.value)}/></label><button className="button primary wide" onClick={commitReschedule}>Confirm new date</button></Modal>}
 </div>
}

export function PreWorkout({s,id,onStart,onBack,update}:{s:AppState;id:string;onStart:(w:Workout)=>void;onBack:()=>void;update:(f:(x:AppState)=>AppState)=>void}){
 const source=s.workouts.find(x=>x.id===id);
 const [energy,setEnergy]=useState<number|null>(null);
 const [note,setNote]=useState('');
 const [replace,setReplace]=useState<string|null>(null);
 const [rq,setRq]=useState('');
 const {standard,advanced}=useExperience();

 if(!source)return <Empty title="Session unavailable" text="This training event is no longer available."/>;

 const w=source;
 const validEntries=w.exercises.map((we,index)=>({
   we,
   index,
   ex:s.exercises.find(e=>e.id===we.exerciseId)
 })).filter(x=>!!x.ex) as Array<{we:Workout['exercises'][number];index:number;ex:Exercise}>;

 const requirements=validEntries.flatMap(({we,ex})=>requiredEquipment(ex)
   .map(item=>({exerciseId:we.exerciseId,exerciseName:ex.name,item,key:`${we.exerciseId}::${item}`}))
 );

 const label=equipmentLabel;

 const requirementKey=(exerciseId:string,item:string)=>`${exerciseId}::${item}`;
 const statusFor=(exerciseId:string,item:string):'confirmed'|'profile_available'|'unavailable'|undefined=>
   w.guidedSession?.sessionEquipment?.[requirementKey(exerciseId,item)] as 'confirmed'|'profile_available'|'unavailable'|undefined;

 /* The equipment chosen in setup is the default answer: an exercise the profile can already do needs no further question. A per-row choice (Change) overrides it. */
 const fitOf=(exerciseId:string)=>{const ex=validEntries.find(v=>v.we.exerciseId===exerciseId)?.ex;return ex?equipmentFit(ex,s.profile?.equipment):'unknown'};
 const effectiveStatus=(exerciseId:string,item:string):'confirmed'|'profile_available'|'unavailable'|undefined=>statusFor(exerciseId,item)||(fitOf(exerciseId)==='available'?'profile_available':undefined);
 const resolved=requirements.every(({exerciseId,item})=>!!effectiveStatus(exerciseId,item));

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

 const alternativeReason=(source:Exercise,candidate:Exercise)=>{
   const samePattern=candidate.pattern===source.pattern;
   const sameLoad=candidate.loadSemantics===source.loadSemantics;
   const lowerEquipment=candidate.equipment.length<source.equipment.length;
   if(samePattern&&sameLoad)return 'Closest match';
   if(samePattern)return 'Works the same muscles';
   if(lowerEquipment)return 'Needs less equipment';
   return 'Good substitute';
 };

 const alternativeConsequence=(source:Exercise,candidate:Exercise)=>{
   const comparable=isEquivalentSubstitution(source,candidate);

   return comparable
     ? 'Similar exercise: your weight can carry over'
     : 'Different exercise: APEX picks a new starting weight';
 };

 const getAlternatives=(source:Exercise,limit=3)=>
   rankSubstitutes(source,s.exercises,s.profile?.equipment,[...sessionUnavailable])
     .map(item=>item.exercise)
     .filter(e=>!rq||`${e.name} ${e.aliases.join(' ')} ${e.pattern} ${e.primaryMuscles.join(' ')}`.toLowerCase().includes(rq.toLowerCase()))
     .slice(0,limit);

 const replacementResults=replaceTarget?getAlternatives(replaceTarget,12):[];

 const chooseAlternative=(oldId:string,nextEx:Exercise)=>{
   if(!s.exercises.some(e=>e.id===oldId))return;
   replaceExercise(oldId,nextEx);
 };

 const confirmEquipment=(exerciseId:string,items:string[],status:'confirmed'|'unavailable')=>{
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
           ...Object.fromEntries(items.map(item=>[requirementKey(exerciseId,item),status]))
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

 const startLabel=readyToStart?'Start training':unavailable.length?'Replace unavailable equipment to continue':'Check your equipment to continue';
 /* one row per equipment-requiring exercise, named for the exercise itself; bodyweight exercises have no requirements and no row */
 const equipmentRows=Array.from(new Set(requirements.map(r=>r.exerciseId))).map(exerciseId=>{
   const mine=requirements.filter(r=>r.exerciseId===exerciseId);
   const states=mine.map(r=>effectiveStatus(r.exerciseId,r.item));
   const status=states.includes('unavailable')?'unavailable'
     :states.some(x=>!x)?undefined
     :states.includes('confirmed')?'confirmed':'profile_available';
   return {exerciseId,exerciseName:mine[0].exerciseName,items:mine.map(r=>r.item),status};
 });
 const firstRec=firstEx?recommendationFor(firstEx,s):undefined;
 /* the intent comes from the plan itself: which muscles the session works, and what state the engines say you are in */
 const focusMuscles=[...new Set(validEntries.flatMap(({ex})=>ex.primaryMuscles))].slice(0,3);
 const recState=recoveryStatus(s,today())?.status;
 const intent=[focusMuscles.length?`Focus: ${focusMuscles.join(', ')}.`:'',recState==='deload_active'?'A lighter week by design.':(firstRec as any)?.returnToTraining?'Easing back in after a break.':''].filter(Boolean).join(' ')||'Follow the plan and record what happens.';
 const firstLoad=firstEx&&firstRec?(firstRec.weight!==undefined?formatLoad(firstEx,firstRec.weight):'Start light'):'';

 return <div className="a3-home a3-brief">
   <button className="a3-iconbtn" onClick={onBack} aria-label="Back"><Icon name="back"/></button>

   <div className="apex-thread apex-briefing" style={{viewTransitionName:'session-thread'} as React.CSSProperties}>
    <span className="a3-eyebrow a3-gold">SESSION BRIEFING</span>
    <h1>{niceName(w.name)}</h1>
    <p className="a3-meta">{s.profile?.sessionMinutes?`~${s.profile.sessionMinutes} min · `:''}{w.exercises.length} exercises · {w.exercises.reduce((a,e)=>a+e.prescribedSets,0)} sets</p>
    <p className="apex-intent"><span className="a3-eyebrow">TODAY'S INTENT</span>{intent}</p>
   </div>

   <section className="a3-card a3-stack">
     <span className="a3-eyebrow">TODAY'S EXERCISES</span>
     <div className="a3-list">
       {validEntries.map(({we,index,ex})=>
         <div className="a3-card a3-row" key={`${we.exerciseId}-${index}`}>
           <span className="a3-index">{String(index+1).padStart(2,'0')}</span>
           <div><strong>{ex.name}</strong><small>{we.prescribedSets} sets · {we.repRange[0]}–{we.repRange[1]} {ex.loadSemantics==='time'?'sec':'reps'}</small></div>
         </div>
       )}
       {validEntries.length<w.exercises.length&&
         <div className="a3-card a3-callout">
           <Icon name="settings"/>
           <div><strong>Some exercise details are missing.</strong><p>The rest of the workout still works.</p></div>
         </div>
       }
     </div>
   </section>

   {unavailable.length>0&&
     <section className="a3-card a3-stack">
       <span className="a3-eyebrow">NOT READY</span>
       <strong>Choose a replacement first.</strong>
       <p>Pick a different exercise, or mark the equipment as available, before you start.</p>
     </section>}


   {firstEx&&
     <section className="a3-card a3-stack">
       <span className="a3-eyebrow">PREPARATION</span>
       <p className="a3-muted">Warm-up sets are added automatically where they help.</p>
       <strong>{firstEx.name}</strong>
       <p>{firstEx.repRange[0]}–{firstEx.repRange[1]} {firstEx.loadSemantics==='time'?'sec':'reps'} · {firstEx.restSec}s rest · {firstLoad}</p>
       <Disclosure label="Why this weight?" className="a3-why">
         <p>{firstRec?.kind==='calibration'
           ?'This is a light starting weight because you have not done this exercise in APEX yet. Choose a weight you can control for every rep. APEX adjusts it as you go.'
           :displayText(firstRec?.reason||'This weight comes from how your recent sets on this exercise went.')}</p>
         {advanced&&firstRec&&<>
           {firstRec.kind==='calibration'&&<small>{displayText(firstRec.reason)}</small>}
           <small>{displayText(((firstRec as any).evidence||[]).join(' · '))} · Target RIR {firstRec.targetRir}</small>
           {(() => {
             const availability=loadAvailability(firstEx,s.profile);
             return availability.options.length
               ?<small>Available load options · {availability.options.map(o=>wt(o)).join(' · ')} {weightLabel()}</small>
               :<small>Load availability · {displayText(availability.reason)}</small>;
           })()}
           <small>{firstRec.kind==='calibration'?'CONFIDENCE · INITIAL':'CONFIDENCE · '+firstRec.confidence.toUpperCase()}</small>
         </>}
       </Disclosure>
     </section>}

   <section className="a3-card a3-stack">
     <div className="a3-head">
       <div>
         <span className="a3-eyebrow">EQUIPMENT</span>
         <h2>Equipment available?</h2>
       </div>
     </div>
     {requirements.length===0
       ?<p className="a3-muted">This workout needs no equipment.</p>
       :<p className="a3-muted">Your saved equipment is preselected. Change an answer if something is missing today.</p>}

     {equipmentRows.length>0&&<div className="a3-list">
         {equipmentRows.map(({exerciseId,exerciseName,items,status})=>{
           const affected=affectedExercises(exerciseId);
           const available=status==='confirmed'||status==='profile_available';
           const unavailableNow=status==='unavailable';
           return <div className={`equipment-check-block equipment-confirm-motion ${status==='confirmed'?'confirmed':''} ${unavailableNow?'unavailable':''}`} key={exerciseId} data-equipment-state={status||'unconfirmed'} data-exercise-id={exerciseId} data-equipment-item={items.join(',')}>
             <div className="a3-equip-main">
               <div className="a3-copy">
                 <span className="a3-eyebrow">{exerciseName}</span>
                 <strong>Equipment available?</strong>
               </div>
               <div className="a3-actions">
                 <button className={`a3-cta${available?'':' a3-cta-ghost'}`} aria-pressed={available} onClick={()=>confirmEquipment(exerciseId,items,'confirmed')}>Available</button>
                 <button className={`a3-cta${unavailableNow?'':' a3-cta-ghost'}`} aria-pressed={unavailableNow} onClick={()=>confirmEquipment(exerciseId,items,'unavailable')}>Not available</button>
               </div>
             </div>

             {unavailableNow&&
               <div className="a3-warn">
                 <strong>Not available today. APEX suggests an alternative.</strong>
                 {affected.map(({we,ex})=>{
                   const best=getAlternatives(ex,1)[0];
                   return <div className="a3-stack" key={we.exerciseId}>
                     {best&&<div className="a3-card a3-stack" data-top-alternative={best.id}>
                       <span className="a3-eyebrow">TODAY'S CHANGE</span>
                       <strong>{ex.name} → {best.name}</strong>
                       <small>{alternativeReason(ex,best)}. {alternativeConsequence(ex,best)}.</small>
                       <small>Only for today. Your program stays the same.</small>
                       <button className="a3-cta" onClick={()=>chooseAlternative(ex.id,best)}>Use alternative</button>
                     </div>}

                     {!best&&
                       <div className="a3-card a3-callout">
                         <Icon name="settings"/>
                         <div>
                           <strong>No other exercise fits the equipment you have today.</strong>
                           <p>Choose another exercise, or mark this equipment as available.</p>
                         </div>
                       </div>
                     }

                     <button className="a3-pill" onClick={()=>setReplace(ex.id)}>
                       See more options
                     </button>
                   </div>;
                 })}
               </div>
             }
           </div>;
         })}
       </div>}
   </section>

   {standard&&adaptations.length>0&&
     <section className="a3-card a3-stack">
       <span className="a3-eyebrow">TODAY'S CONTEXT</span>
       {adaptations.slice(0,3).map((a,i)=><div className="a3-line" key={i}><strong>{a.title}</strong><small>{displayText(a.detail)}</small></div>)}
     </section>}

   <section className="a3-card a3-stack a3-checkin"><Disclosure label="Optional: how ready do you feel?">
     <div className="a3-energy">
       {[1,2,3,4,5].map(v=><button key={v} className={energy===v?'selected':''} onClick={()=>setEnergy(v)}><b>{v}</b><small>{v===1?'Low':v===2?'Below usual':v===3?'Normal':v===4?'Good':'Very good'}</small></button>)}
     </div>
     <label>Anything APEX should know? <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional: sleep, schedule, how you feel…"/></label>
   </Disclosure></section>

   <div className="apex-sticky-action">
     <button className="a3-cta apex-primary" disabled={!readyToStart} onClick={begin}>
     {startLabel}
     <Icon name="chev"/>
   </button>
   </div>

   {replace&&
     <Modal title={`Replace ${replaceTarget?.name||'exercise'}`} close={()=>{setReplace(null);setRq('')}}>
       <p className="a3-muted">
         Choose an exercise for today only. Your program stays the same.
       </p>
       <div className="a3-search"><Icon name="search"/><input aria-label="Search replacement movements" autoFocus value={rq} onChange={e=>setRq(e.target.value)} placeholder="Search for an exercise…"/></div>
       <div className="a3-list">
         {replacementResults.map(e=>{
           const fit=equipmentFit(e,s.profile?.equipment);
           return <button className="a3-card a3-pick a3-tap" key={e.id} onClick={()=>replaceExercise(replace!,e)}>
             <span>
               <strong>{e.name}</strong>
               <small>{fit==='available'?'Available from your setup':fit==='unknown'?'Check it is available today':'Not in your setup'} · {replaceTarget?alternativeReason(replaceTarget,e):'Alternative'} · {e.equipment.map(label).join(', ')}</small>
               <em>{replaceTarget?alternativeConsequence(replaceTarget,e):''}</em>
             </span>
             <Icon name="chev"/>
           </button>;
         })}
         {!replacementResults.length&&<Empty title="Nothing suitable found" text="Try another search, or keep the original exercise."/>}
       </div>
     </Modal>
   }
 </div>;
}

