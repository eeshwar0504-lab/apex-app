import {useMemo,useState} from 'react';
import {imageKindForExercise} from '../imagery';
import type {AppState,Exercise,Workout,WorkoutTemplate} from '../core/types';
import {addExerciseToWorkout} from '../engine/workoutEdit';
import {requiredEquipment,createCustomWorkout,cloneTemplateWorkout,uid,replaceWorkoutExercise,rescheduleWorkoutWithEvent,rankSubstitutes,isEquivalentSubstitution,planWithDays,equipmentFit,smartAlternatives,loadAvailability} from '../engine/training';
import {adaptationsForWorkout} from '../engine/intelligence';

import {wt,weightLabel,displayText} from '../data/units';
import {today,formatLoad,niceName,equipmentLabel,patternLabel,sourceLabel} from '../ui/shared';
import {Icon,ApexImage,ApexMeter,ListRow,PageTitle,Empty,StateView,Disclosure} from '../ui/primitives';
import {useAdvancedControls} from '../ui/advanced';
import {Modal,useConfirm} from '../ui/dialogs';
import {recommendationFor,completeGuidedSession} from '../ui/stateHelpers';

import {workingOf} from '../ui/setHelpers';



export function Train({s,onStart,onNav,update}:{s:AppState;onStart:(w:Workout)=>void;onNav:(r:string)=>void;update:(f:(x:AppState)=>AppState)=>void}){
 const upcoming=s.workouts.filter(w=>w.status==='planned'||w.status==='rescheduled').sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate));
 const extra=s.workouts.filter(w=>w.source==='extra');
 const todayWorkout=upcoming.find(w=>w.scheduledDate===today());
 const nextWorkout=upcoming[0];
 const [reschedule,setReschedule]=useState<Workout|null>(null),[date,setDate]=useState(today());
 const {advanced}=useAdvancedControls();
 const {ask,dialog}=useConfirm();
 const createExtra=()=>ask({title:'Start an extra session?',message:'This adds a short extra workout for today and starts it. Your plan is not changed.',confirmLabel:'Start extra session'},()=>{const ids=s.exercises.slice(0,5).map(e=>e.id);const w=createCustomWorkout('Extra Session',today(),ids,s.exercises);w.source='extra';w.status='planned';update(x=>({...x,workouts:[...x.workouts,w],eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'extra_workout_created',timestamp:new Date().toISOString(),payload:{workoutId:w.id}}]}));onStart(w)});
 const skipWorkout=(w:Workout)=>ask({title:'Skip this workout?',message:`${w.name} on ${w.scheduledDate} will be marked as skipped. Your plan carries on with the next session.`,confirmLabel:'Skip workout'},()=>update(x=>({...x,workouts:x.workouts.map(q=>q.id===w.id?{...q,status:'skipped',updatedAt:new Date().toISOString()}:q)})));
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
   const done=workingOf(we.sets).filter(x=>x.completed).length;
   return {we,ex,i,rec,load,fit,alts,done};
 }).filter(Boolean) as Array<{we:Workout['exercises'][number];ex:Exercise;i:number;rec:ReturnType<typeof recommendationFor>;load:string;fit:ReturnType<typeof equipmentFit>;alts:number;done:number}>;
 const activeRow=rows.findIndex(r=>r.done<workingOf(r.we.sets).length);
 const totalSets=rows.reduce((n,r)=>n+workingOf(r.we.sets).length,0);
 const doneSets=rows.reduce((n,r)=>n+r.done,0);
 const sessionPct=totalSets?Math.round(doneSets/totalSets*100):0;
 const fitLabel={available:'Equipment ready',unknown:'Check equipment',unavailable:'Equipment unavailable'} as const;
 const kicker=isActive?'In progress':todayWorkout?'Today’s session':nextWorkout?'Next session':'Train';
 const briefRoute=focus?`brief:${focus.id}`:'plan';
 if(!focus&&!upcoming.length&&!completed)return <div className="train-screen a3-home"><StateView kind="empty" title="No Workouts Yet" text="Your journey starts here. Create your first workout and build your momentum." primary={{label:'Start Your First Workout',onClick:()=>onNav('plan')}}/></div>;
 return <div className="train-screen a3-home">
  <header className="a3-greet"><span className="a3-eyebrow">{completed>0?`Train · ${completed} session${completed===1?'':'s'} logged`:'Train'}</span><h1>{focus?niceName(focus.name):'Plan your next session.'}</h1></header>

  <section className="a3-card a3-session">
   <div className="a3-session-head">
    <div><span className="a3-eyebrow a3-gold">{kicker}</span><p className="a3-meta"><Icon name="clock" size={14}/>{focus?`${focus.exercises.length} exercises${s.profile?.sessionMinutes?` · ~${s.profile.sessionMinutes} min`:''} · ${focus.scheduledDate===today()?'Today':focus.scheduledDate}`:'No session scheduled'}</p></div>
    {(isActive||doneSets>0)&&<div className="a3-session-pct"><strong>{sessionPct}%</strong><small>{doneSets}/{totalSets} sets</small></div>}
   </div>
   {(isActive||doneSets>0)&&<ApexMeter value={sessionPct}/>}
   <button className="a3-cta" onClick={()=>focus?onStart(focus):onNav('plan')}>{focus?(isActive?'Resume Workout':'Start Workout'):'Open Plan Studio'}<Icon name={focus?'play':'arrow'} size={18}/></button>
   <div className="a3-session-actions">
    {focus&&!isActive&&<button className="a3-link" onClick={()=>onNav(briefRoute)}>Session brief &amp; swaps <Icon name="arrow" size={14}/></button>}
    <button className="a3-link" onClick={createExtra}>Extra session <Icon name="plus" size={14}/></button>
   </div>
  </section>

  {rows.length>0&&<section className="a3-block"><div className="a3-head"><h2>Exercises</h2><span className="a3-eyebrow">{rows.length} movements</span></div>
   <div className="a3-list">{rows.map(r=><article className={`a3-card a3-exercise ${r.done>=workingOf(r.we.sets).length?'is-done':r.i===activeRow?'is-active':''}`} key={r.we.exerciseId+r.i}>
    <div className="a3-exthumb"><ApexImage kind={imageKindForExercise(r.ex)} alt=""/><em>{String(r.i+1).padStart(2,'0')}</em></div>
    <div className="a3-exercise-body">
     <strong>{r.ex.name}</strong>
     <p>{r.we.prescribedSets} × {r.we.repRange[0]}–{r.we.repRange[1]} {r.ex.loadSemantics==='time'?'sec':'reps'}</p>
     <dl className="a3-spec"><div><dt>Weight</dt><dd>{r.rec.weight===undefined&&r.ex.loadSemantics!=='bodyweight'&&r.ex.loadSemantics!=='time'&&r.ex.loadSemantics!=='none'?'Start light':r.load}</dd></div>{advanced&&<div><dt>Reps</dt><dd>{r.we.repRange[0]}–{r.we.repRange[1]}</dd></div>}{advanced&&<div><dt>RIR</dt><dd>{r.rec.targetRir}</dd></div>}</dl>
     <div className="a3-exercise-foot">
      {r.fit!=='available'&&<span className={`a3-chip a3-fit-${r.fit}`}>{fitLabel[r.fit]}</span>}
      <span className={`a3-chip a3-state ${r.done>=workingOf(r.we.sets).length?'is-done':r.i===activeRow?'is-active':''}`}>{r.done>=workingOf(r.we.sets).length?'Done':r.i===activeRow?(isActive?'Active':'Next up'):'Up next'}</span>
      {r.done>0&&<span className="a3-chip">{r.done}/{workingOf(r.we.sets).length} sets</span>}
      {!isActive&&r.alts>0&&<button className="a3-link" onClick={()=>onNav(briefRoute)}>{r.alts} swap option{r.alts===1?'':'s'}</button>}
     </div>
    </div>
   </article>)}</div>
  </section>}

  <div className="a3-rings">
   {completed>0&&<div className="a3-card a3-stat"><span className="a3-eyebrow">Planned</span><strong>{upcoming.length}<small>sessions</small></strong></div>}
   {completed>0&&<div className="a3-card a3-stat"><span className="a3-eyebrow">Logged</span><strong>{completed}<small>sessions</small></strong></div>}
  </div>

  <section className="a3-block"><div className="a3-head"><h2>Up next</h2><span className="a3-eyebrow">{upcoming.length} scheduled</span></div>
   <div className="a3-list">{upcoming.slice(0,8).map((w,i)=><article className="a3-card a3-queue" key={w.id}><button className="a3-queue-main" onClick={()=>onStart(w)}><span className="a3-index">{w.scheduledDate===today()?'NOW':i===0?'NEXT':w.scheduledDate.slice(5)}</span><span><strong>{w.name}</strong><small>{[`${w.exercises.length} exercises`,sourceLabel(w.source),w.status==='rescheduled'?'moved':''].filter(Boolean).join(' · ')}</small></span><Icon name="arrow" size={16}/></button><div className="a3-queue-actions"><button className="mini-btn" onClick={()=>{setReschedule(w);setDate(w.scheduledDate)}}>Move</button><button className="mini-btn" onClick={()=>skipWorkout(w)}>Skip</button></div></article>)}{!upcoming.length&&<Empty title="Queue is clear" text="Use Plan Studio to build your next block or create a quick session."/>}</div>
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
 const [showEquip,setShowEquip]=useState(false);
 const {advanced}=useAdvancedControls();

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
 const needsAnswer=requirements.filter(({exerciseId,item})=>!effectiveStatus(exerciseId,item));
 const visibleRequirements=showEquip?requirements:needsAnswer;
 const firstRec=firstEx?recommendationFor(firstEx,s):undefined;
 const firstLoad=firstEx&&firstRec?(firstRec.weight!==undefined?formatLoad(firstEx,firstRec.weight):'Start light'):'';

 return <div className="a3-home a3-brief">
   <button className="a3-iconbtn" onClick={onBack} aria-label="Back"><Icon name="back"/></button>

   <span className="a3-eyebrow">TODAY</span>
   <h1>{w.name}</h1>
   <p className="a3-muted">{w.exercises.length} exercises · {w.exercises.reduce((a,e)=>a+e.prescribedSets,0)} sets</p>

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

   <button className="a3-cta" disabled={!readyToStart} onClick={begin}>
     {startLabel}
     <Icon name="chev"/>
   </button>

   {firstEx&&
     <section className="a3-card a3-stack">
       <span className="a3-eyebrow">YOU START WITH</span>
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
         <h2>{needsAnswer.length?'Is this equipment available?':'Using the equipment from your setup.'}</h2>
       </div>
       {requirements.length>0&&<button className="a3-pill" aria-expanded={showEquip} onClick={()=>setShowEquip(x=>!x)}>{showEquip?'Hide':'Change'}</button>}
     </div>
     {requirements.length===0
       ?<p className="a3-muted">This workout needs no equipment.</p>
       :needsAnswer.length===0&&!showEquip
         ?<p className="a3-muted">If something is missing today, tap Change.</p>
         :null}

     {visibleRequirements.length>0&&<div className="a3-list">
         {visibleRequirements.map(({exerciseId,exerciseName,item,key})=>{
           const status=effectiveStatus(exerciseId,item);
           const affected=affectedExercises(exerciseId);
           const confirmed=status==='confirmed';
           const unavailableNow=status==='unavailable';
           return <div className={`equipment-check-block equipment-confirm-motion ${confirmed?'confirmed':''} ${unavailableNow?'unavailable':''}`} key={key} data-equipment-state={status||'unconfirmed'} data-exercise-id={exerciseId} data-equipment-item={item}>
             <div className="a3-equip-main">
               <div className="a3-copy">
                 <span className="a3-eyebrow">{exerciseName}</span>
                 <strong>{label(item)} · {confirmed?'AVAILABLE TODAY':unavailableNow?'NOT AVAILABLE':status==='profile_available'?'FROM YOUR SETUP':'IS IT AVAILABLE?'}</strong>
               </div>
               <div className="a3-actions">
                 {!confirmed&&<button className="a3-cta" onClick={()=>confirmEquipment(exerciseId,item,'confirmed')}>Confirm available</button>}
                 {!unavailableNow&&<button className="a3-cta a3-cta-ghost" onClick={()=>confirmEquipment(exerciseId,item,'unavailable')}>Not available</button>}
               </div>
             </div>

             {unavailableNow&&
               <div className="a3-warn">
                 <strong>Not available today. Here are other options.</strong>
                 {affected.map(({we,ex})=>{
                   const options=getAlternatives(ex,3);
                   return <div className="a3-stack" key={we.exerciseId}>
                     <div className="a3-copy">
                       <span className="a3-eyebrow">PLANNED</span>
                       <strong>{ex.name}</strong>
                       <small>Only for today. Your program stays the same.</small>
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

   {advanced&&adaptations.length>0&&
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

export function PlanStudio({s,update,onStart}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void;onStart:(w:Workout)=>void}){const [selected,setSelected]=useState<string|null>(null),[q,setQ]=useState('');const plan=s.plan,day=plan?.days.find(d=>d.id===selected),isOpen=(w:Workout)=>w.status!=='completed'&&w.status!=='missed'&&w.status!=='skipped',linked=day?.workoutId?s.workouts.find(w=>w.id===day.workoutId):undefined,workout=linked&&isOpen(linked)?linked:day?s.workouts.filter(w=>w.planId===plan?.id&&w.name===day.label&&isOpen(w)).sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate))[0]:undefined;const results=s.exercises.filter(e=>!q||`${e.name} ${e.aliases.join(' ')} ${e.pattern} ${e.primaryMuscles.join(' ')}`.toLowerCase().includes(q.toLowerCase())).slice(0,18);const edit=(fn:(w:Workout)=>Workout,reason:string)=>{if(!workout||!plan)return;update(x=>{const p=x.plan!;const currentWorkout=x.workouts.find(w=>w.id===workout.id);if(!currentWorkout)return x;const nextW=fn(currentWorkout);const nextPlan=planWithDays(p,p.days);nextW.currentPlanVersion=nextPlan.version;return{...x,workouts:x.workouts.map(w=>w.id===nextW.id?nextW:w),plan:nextPlan,eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'plan_edit',timestamp:new Date().toISOString(),payload:{reason}}]}})};const add=(id:string)=>edit(w=>{const ex=s.exercises.find(e=>e.id===id);if(!ex)return w;const r=addExerciseToWorkout(w,ex,{now:new Date().toISOString(),allowDuplicate:true});return r.ok?r.workout:w;},'add exercise');const {ask,dialog}=useConfirm();const remove=(e:Exercise)=>ask({title:'Remove this exercise?',message:`${e.name} will be removed from ${workout?.name||'this workout'}. Completed workouts are never changed.`,confirmLabel:'Remove'},()=>edit(w=>({...w,version:w.version+1,updatedAt:new Date().toISOString(),exercises:w.exercises.filter(q=>q.exerciseId!==e.id).map((q,i)=>({...q,order:i}))}),'remove exercise'));return <div className="a3-home"><PageTitle eyebrow="PLAN STUDIO" title="Shape the structure." sub="Future structure is editable. Historical sessions remain immutable."/><div className="a3-card a3-stack plan-panel"><div className="a3-head plan-header"><div><span className="a3-eyebrow">ACTIVE PLAN</span><h2>{plan?.name||'No plan'}</h2><small className="a3-muted">{plan?.mode==='continuous'?'Continuous training':`${plan?.weeks||'—'} week horizon`}</small></div><span className="a3-chip version">v{plan?.version||1}</span></div>{plan?.days.map((d,i)=>{const w=d.workoutId?s.workouts.find(x=>x.id===d.workoutId):!d.rest?s.workouts.find(x=>x.planId===plan?.id&&x.name===d.label&&x.status!=='completed'&&x.status!=='missed'&&x.status!=='skipped'):undefined;return <button className={`a3-card a3-row a3-tap day-card ${selected===d.id?'selected':''}`} key={d.id} onClick={()=>setSelected(selected===d.id?null:d.id)}><span className="a3-index">{String(i+1).padStart(2,'0')}</span><span><strong>{d.label}</strong><small>{d.rest?'Recovery / rest':`${w?.exercises.length||0} exercises · ${w?.scheduledDate||''}`}</small></span>{w&&<span className="a3-pill" onClick={e=>{e.stopPropagation();onStart(w)}}><Icon name="play" size={15}/></span>}</button>})}</div>{day&&workout&&<section className="a3-card a3-stack plan-editor"><div className="a3-head"><div><span className="a3-eyebrow">EDITING {day.label}</span><h2>{workout.name}</h2></div><button className="a3-cta a3-cta-ghost" onClick={()=>setSelected(null)}>Done</button></div><div className="a3-list">{workout.exercises.map((we,i)=>{const e=s.exercises.find(x=>x.id===we.exerciseId);return <div className="a3-card a3-row editor-exercise" key={`${we.exerciseId}-${i}`}><span className="a3-index">{String(i+1).padStart(2,'0')}</span><div><strong>{e?.name||'Exercise unavailable'}</strong><small>{we.prescribedSets} sets · {we.repRange[0]}–{we.repRange[1]}</small></div>{e?<button className="a3-pill" aria-label={`Remove ${e.name}`} onClick={()=>remove(e)}>Remove</button>:<span className="a3-muted">Missing data</span>}</div>})}</div><div className="a3-search"><Icon name="search"/><input aria-label="Search exercises to add to this workout" value={q} onChange={e=>setQ(e.target.value)} placeholder="Add exercise…"/></div><div className="a3-list">{results.map(e=><button className="a3-card a3-pick a3-tap" key={e.id} onClick={()=>add(e.id)}><span><strong>{e.name}</strong><small>{patternLabel(e.pattern)} · {e.primaryMuscles.join(' · ')}</small></span><Icon name="plus"/></button>)}</div></section>}<div className="a3-card a3-callout"><Icon name="bolt"/><div><strong>Version-aware plan</strong><p>Every structural edit creates a new plan version. A completed workout never gets rewritten.</p></div></div>{dialog}</div>}
export function Templates({s,update,onStart}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void;onStart:(w:Workout)=>void}){const [name,setName]=useState('');const [selected,setSelected]=useState<string[]>([]);const toggle=(id:string)=>setSelected(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id]);const save=()=>{if(!name.trim()||!selected.length)return;const t:WorkoutTemplate={id:uid('tpl'),name:name.trim(),exerciseIds:selected,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};update(x=>({...x,workoutTemplates:[...(x.workoutTemplates||[]),t]}));setName('');setSelected([])};const useT=(t:WorkoutTemplate)=>{const w=cloneTemplateWorkout(t,today(),s.exercises);update(x=>({...x,workouts:[...x.workouts,w],eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'template_used',timestamp:new Date().toISOString(),payload:{templateId:t.id,workoutId:w.id}}]}));onStart(w)};const {ask,dialog}=useConfirm();const remove=(t:WorkoutTemplate)=>ask({title:'Delete this template?',message:`“${t.name}” will be removed. Workouts you already did or planned from it are not affected.`,confirmLabel:'Delete template'},()=>update(x=>({...x,workoutTemplates:(x.workoutTemplates||[]).filter(q=>q.id!==t.id)})));return <div className="a3-home"><PageTitle eyebrow="TEMPLATES" title="Save the work you repeat." sub="Templates are reusable structures. Completed workouts remain separate historical events."/><section className="a3-card a3-stack plan-editor"><label>Template name<input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Quick upper"/></label><div className="a3-list picker-list">{s.exercises.slice(0,35).map(e=><button className="a3-card a3-pick a3-tap picker-row" key={e.id} onClick={()=>toggle(e.id)}><span><strong>{e.name}</strong><small>{selected.includes(e.id)?'Included':'Tap to include'} · {patternLabel(e.pattern)}</small></span>{selected.includes(e.id)?<Icon name="check"/>:<Icon name="plus"/>}</button>)}</div><button className="a3-cta" disabled={!name.trim()||!selected.length} onClick={save}>Save template</button></section><section className="a3-block"><div className="a3-list">{(s.workoutTemplates||[]).map(t=><div className="a3-card a3-stack template-row" key={t.id}><ListRow title={t.name} sub={`${t.exerciseIds.length} exercises`} icon="train" click={()=>useT(t)}/><button className="a3-pill a3-danger" aria-label={`Delete template ${t.name}`} onClick={()=>remove(t)}>Delete</button></div>)}</div></section>{dialog}</div>}
