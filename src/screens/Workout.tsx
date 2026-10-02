import React,{useEffect,useRef,useState} from 'react';
import type {AppState,Exercise,SetType,Workout} from '../core/types';
import {WARMUP_RULES} from '../engine/warmup';
import {requiredEquipment,recommendedRest,updateSetType,uid,addWorkoutSet,removeWorkoutSet,reorderWorkoutExercise,replaceWorkoutExercise,markWorkoutExerciseSkipped,markWorkoutSetSkipped,pauseWorkoutSession,resumeWorkoutSession,recoverWorkoutSession,sessionAssessment,bestLoad,equipmentFit,smartAlternatives,personalizedLoad,snapToAvailableLoad,loadDetailForSet,formatTimedDuration} from '../engine/training';
import {normalizeGuidedPosition,completeSet,applySetFeedback,skipSetFeedback,continueAfterRest as continueGuidedAfterRest,advanceToNextExercise as advanceGuidedToNextExercise} from '../engine/guidedSession';
import {adaptationsForWorkout} from '../engine/intelligence';
import {vol,volLabel,displayText} from '../data/units';
import {today,formatLoad,fmt,SET_TYPES,niceName,patternLabel,equipmentLabel} from '../ui/shared';
import {useAdvancedControls} from '../ui/advanced';
import {Icon,ApexImage,ApexRidge,ApexStat,Metric,ListRow,Empty,Num,StateView,Disclosure} from '../ui/primitives';
import {Modal,useConfirm} from '../ui/dialogs';
import {completeGuidedSession} from '../ui/stateHelpers';

import {safeExercise,isWarm,workingOf,pendingSet,setCounter,phase6LoadDisplay} from '../ui/setHelpers';
import {SetEditor} from './SetEditor';
import {ExerciseGuide} from './ExerciseGuide';




export function WorkoutView({s,w,update,onExit,onExercise,onDone,onJournal}:{s:AppState;w:Workout;update:(f:(x:AppState)=>AppState)=>void;onExit:()=>void;onExercise:(id:string)=>void;onDone:(w:Workout)=>void;onJournal:()=>void}){
 const [now,setNow]=useState(Date.now());
 const [replace,setReplace]=useState<string|null>(null);
 const [rq,setRq]=useState('');
 const [history,setHistory]=useState<Workout[]>([]);
 const [safety,setSafety]=useState(false);
 const [overview,setOverview]=useState(false);
 const [menuOpen,setMenuOpen]=useState(false);
 const {advanced,toggleAdvanced}=useAdvancedControls();
 const {ask,dialog}=useConfirm();
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
 useEffect(()=>{if(!advanced)setOverview(false)},[advanced]);
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
   e.status==='skipped'||e.sets.every(x=>!pendingSet(x))
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
   ?personalizedLoad(activeEx,s.workouts,s.profile,s.exercises,today(),s.deloads).targetRir
   :2;

 const currentRecommendation=activeEx
   ?personalizedLoad(activeEx,s.workouts,s.profile,s.exercises,today(),s.deloads)
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
       ?personalizedLoad(activeEx,s.workouts,s.profile,s.exercises,today(),s.deloads)
       :undefined;

   mutate(ww=>{
     const c=structuredClone(ww);
     const e=c.exercises.find(x=>x.exerciseId===activeExercise.exerciseId);
     const ss=e?.sets.find(x=>x.id===activeSet.id);
     if(!e||!ss)return ww;

     if(ss.weight===undefined&&recommendation?.weight!==undefined&&!['bodyweight','none','time','assistance'].includes(activeEx?.loadSemantics||'')){
       ss.weight=snapToAvailableLoad(activeEx!,recommendation.weight,s.profile);
     }
     if(ss.assistance===undefined&&recommendation?.weight!==undefined&&activeEx?.loadSemantics==='assistance'){
       ss.assistance=snapToAvailableLoad(activeEx,recommendation.weight,s.profile);
     }
     /* RIR is only ever what the athlete reported. The target is a prescription, never a performed value, so it is not written here. */
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
       at,
       s.preferences
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

 /* "Not sure": no rating is recorded and nothing about the next weight changes; the athlete simply moves on to rest. */
 const skipFeedback=()=>{
   if(!activeExercise||!activeSet||!activeEx)return;
   mutate(ww=>skipSetFeedback(ww,activeEx,exerciseIndex,setIndex,new Date().toISOString(),s.preferences));
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
     e.sets.some(pendingSet)
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




 const askSkipSet=(run:()=>void)=>ask({title:'Skip this set?',message:'It will not be counted as done. You can carry on with the next set.',confirmLabel:'Skip set'},run);

 const finishPhase=()=>{
   if(all){
     setGuided({phase:'complete'});
     return;
   }

   if(phase==='prep'){
     setGuided({phase:'ready'});
     return;
   }

   if(phase==='equipment'){
     setGuided({phase:'ready'});
     return;
   }

   if(phase==='ready'){
     startSet();
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
   prep:'GET READY',
   equipment:'EQUIPMENT',
   ready:'GET READY',
   set_ready:'NEXT SET',
   set_active:'YOUR SET',
   feedback:'HOW WAS IT',
   rest:'REST',
   exercise_complete:'EXERCISE DONE',
   complete:'ALL DONE'
 };

 const completedForExercise=activeExercise
   ?activeExercise.sets.filter(x=>x.completed&&!isWarm(x)).length
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
 const onSetRemove=()=>ask({title:'Remove this set?',message:'The set is taken out of this workout.',confirmLabel:'Remove set'},()=>mutate(x=>removeWorkoutSet(x,activeExercise!.exerciseId,activeSet!.id)));

 /* The default log form is weight and reps with one visible LOG SET action. RIR and set notes appear only with the advanced controls. */
 const logEditor=activeSet&&activeEx?<>
           <SetEditor
             set={activeSet}
             ex={activeEx}
             index={setIndex}
             targetRir={targetRir}
             focused
             loadProfile={s.profile}
             showRir={advanced}
             showNotes={advanced}
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
             hideOptions
           />

           {activeEx.loadSemantics==='time'&&<div className="a3-reco">
             <span className="a3-eyebrow">TIMER</span>
             <strong aria-live="polite">{workStartedAt?formatTimedDuration(workRemaining):formatTimedDuration(activeSet.seconds??activeEx.repRange[0])}</strong>
             <small>{timedWorkComplete?'Time is up. Tap LOG SET when you are ready.':'Hold the position until the timer reaches zero.'}</small>
           </div>}
</>:null;
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

     {advanced?<button
       className="a3-iconbtn"
       aria-label={overview?'Focus':'Overview'}
       aria-pressed={overview}
       onClick={()=>setOverview(x=>!x)}
     >
       <Icon name="layers"/>
     </button>:<span className="a3-iconbtn-spacer" aria-hidden="true"/>}
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
       onClick={onJournal}
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
     <button
       className={`a3-pill ${advanced?'selected':''}`}
       aria-pressed={advanced}
       onClick={toggleAdvanced}
     >
       Advanced controls
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

   {!(advanced&&overview)&&activeExercise&&activeEx&&
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
             {patternLabel(activeEx.pattern)} · {activeEx.primaryMuscles.join(' · ')}
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
           <span className="a3-eyebrow">GET READY</span>
           <h3>Your workout is ready.</h3>
           <p>
             You will do one exercise at a time. For each one APEX shows how to
             do it, what weight to start with and how many reps to aim for.
           </p>
           <button
             className="a3-cta"
             onClick={finishPhase}
           >
             Start <Icon name="chev"/>
           </button>
         </div>
       }

       {phase==='equipment'&&
         <div className="a3-stage">
           <span className="a3-eyebrow">EQUIPMENT</span>
           <h3>Check today's equipment.</h3>
           <p>
             APEX is using the equipment you chose in setup. Tap an item only
             if you want to confirm it for today.
           </p>

           <div className="a3-list">
             {requiredEquipment(activeEx).length
               ?requiredEquipment(activeEx).map(item=>{
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
                       {equipmentLabel(item)}
                     </strong>
                     <small>
                       {status==='confirmed'
                         ?'Confirmed for today'
                         :'From your setup'}
                     </small>
                   </span>
                   <Icon name={status==='confirmed'?'check':'chev'}/>
                 </button>;
               })
               :<p className="a3-muted">
                 This exercise needs no equipment.
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

       {phase==='ready'&&(()=>{
         const tab=advanced?beforeTab:'details';
         const unit=activeEx.loadSemantics==='time'?'sec':'reps';
         const warmN=activeExercise.sets.filter(x=>isWarm(x)&&!x.completed).length;
         const mainN=workingOf(activeExercise.sets).length;
         const target=phase6LoadDisplay(activeEx,undefined,currentRecommendation?.weight,s.profile);
         return <div className="a3-stage a3-stage-ready">
           <span className="a3-eyebrow">GET READY</span>
           {advanced&&<div className="a3-tabs" role="tablist" aria-label="Before set">
             {(['details','history','modes'] as const).map(t=><button key={t} role="tab" aria-selected={beforeTab===t} className={beforeTab===t?'active':''} onClick={()=>setBeforeTab(t)}>{t==='details'?'How to':t==='history'?'History':'Options'}</button>)}
           </div>}
           {tab==='details'&&<>
             <ExerciseGuide ex={activeEx}/>

             <div className="a3-reco a3-target">
               <span className="a3-eyebrow">TODAY'S TARGET</span>
               <strong>{target.primary}</strong>
               {target.secondary&&<small>{target.secondary}</small>}
               <div className="a3-chips">
                 <span>{activeExercise.repRange[0]}–{activeExercise.repRange[1]} {unit}</span>
                 <span>{mainN} {mainN===1?'set':'sets'}</span>
                 <span>{fmt(restSeconds)} rest</span>
                 {advanced&&<span>RIR {targetRir}</span>}
               </div>
               {warmN>0&&<small>First {warmN} easy warm-up {warmN===1?'set':'sets'} with a lighter weight, then your {mainN} main {mainN===1?'set':'sets'}.</small>}
               <Disclosure label="Why this weight?" className="a3-why">
                 <p>
                   {currentRecommendation?.kind==='calibration'
                     ?'This is a light starting weight because you have not done this exercise in APEX yet. Choose a weight you can control for every rep. If it feels too heavy or too easy, say so after your set and APEX will adjust.'
                     :displayText(currentRecommendation?.reason||'This weight comes from how your recent sets on this exercise went.')}
                 </p>
                 {advanced&&<>
                   {currentRecommendation?.kind==='calibration'&&<small>{displayText(currentRecommendation.reason)}</small>}
                   <small>Target RIR {targetRir}</small>
                 </>}
               </Disclosure>
             </div>
           </>}
           {tab==='history'&&(()=>{
             const past=s.workouts.filter(w=>w.status==='completed'&&w.id!==current.id).flatMap(w=>w.exercises.filter(e=>e.exerciseId===activeEx.id).map(e=>({w,e}))).slice(-5).reverse();
             if(!past.length)return <Empty title="No history for this exercise yet" text="Completed sets for this movement will appear here."/>;
             return <div className="a3-list">{past.map(({w,e})=>{
               const done=e.sets.filter(x=>x.completed&&x.type!=='warmup');
               const best=activeEx?(bestLoad(activeEx,done)??0):0;
               const reps=Math.max(0,...done.map(x=>x.reps||0));
               const rirs=done.map(x=>x.rir).filter((x):x is number=>x!==undefined);
               return <div className="a3-card a3-row" key={w.id}><span className="a3-index">{w.scheduledDate.slice(5)}</span><div><strong>{best?formatLoad(activeEx,best):'Bodyweight / time'}</strong><p>{done.length} working sets · best {reps||'—'} reps{rirs.length?` · RIR ${(rirs.reduce((a,b)=>a+b,0)/rirs.length).toFixed(1)}`:''}</p></div></div>})}</div>
           })()}
           {tab==='modes'&&<div className="a3-stack">
             {activeSet&&<>
               <span className="a3-eyebrow">SET TYPE · NEXT SET</span>
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
         </div>;
       })()}

       {phase==='set_ready'&&activeSet&&(()=>{
         const unit=activeEx.loadSemantics==='time'?'sec':'reps';
         const load=phase6LoadDisplay(activeEx,activeSet,isWarm(activeSet)?undefined:guided.guidedSession?.workingLoads?.[activeEx.id]??currentRecommendation?.weight,s.profile);
         return <div className="a3-stage">
           <div className="a3-setline">
             <span
               className="a3-eyebrow set-counter-motion"
               key={`set-counter-${activeExercise.exerciseId}-${setIndex}`}
               aria-live="polite"
             >
               {setCounter(activeExercise.sets,setIndex)}
             </span>
             <span className="a3-muted">
               {completedForExercise} / {workingOf(activeExercise.sets).length} done
             </span>
           </div>

           <div className="a3-settitle">
             <h3>{isWarm(activeSet)?'Warm-up set':activeSet.type==='working'?'Next set':`${activeSet.type.replace('_',' ')} set`}</h3>
             <p>
               {isWarm(activeSet)
                 ?`${activeSet.reps??'—'} reps · easy, stop well before it gets hard · ${fmt(WARMUP_RULES.restSec)} rest`
                 :`${activeExercise.repRange[0]}–${activeExercise.repRange[1]} ${unit} · ${fmt(restSeconds)} rest${advanced?` · RIR ${targetRir}`:''}`}
             </p>
           </div>

           <div className="a3-reco">
             <span className="a3-eyebrow">{isWarm(activeSet)?'WARM-UP WEIGHT':'WEIGHT'}</span>
             <strong>{load.primary}</strong>
             {load.secondary&&<small>{load.secondary}</small>}
             {advanced&&<small>
               {guided.guidedSession?.calibration?.[activeEx.id]==='established'
                 ?'Personal baseline'
                 :currentRecommendation?.kind==='calibration'
                   ?'Initial calibration · limited history'
                   :'Evidence-based recommendation'}
             </small>}
           </div>

           <button
             className="a3-cta"
             onClick={finishPhase}
             disabled={!!current.pausedAt}
           >
             START SET <Icon name="play"/>
           </button>
         </div>;
       })()}

       {phase==='set_active'&&activeSet&&
         <div className="a3-stage">
           <div className="a3-setline">
             <span
               className="a3-eyebrow set-counter-motion"
               key={`set-counter-${activeExercise.exerciseId}-${setIndex}`}
               aria-live="polite"
             >
               {setCounter(activeExercise.sets,setIndex)}
             </span>
             <span className="a3-muted">
               {completedForExercise} / {workingOf(activeExercise.sets).length} done
             </span>
           </div>

           <p className="a3-muted a3-targetline">
             {isWarm(activeSet)
               ?'Warm-up: keep it easy and controlled.'
               :activeEx.loadSemantics==='time'
                 ?`Aim to hold for ${activeExercise.repRange[0]}–${activeExercise.repRange[1]} seconds.`
                 :`Aim for ${activeExercise.repRange[0]}–${activeExercise.repRange[1]} reps. Change the numbers below if you did something different.`}
           </p>

           {logEditor}

           <details className="a3-more a3-setoptions"><summary>More options</summary>
             <div className="a3-actions">
               {advanced&&<select value={activeSet.type} onChange={e=>onSetType(e.target.value as SetType)} aria-label="Set type">{SET_TYPES.map(x=><option value={x} key={x}>{x.replace('_',' ')}</option>)}</select>}
               {advanced&&<button className="a3-pill" onClick={onSetAdd}>+ Add set</button>}
               {advanced&&<button className="a3-pill" onClick={onSetRemove}>− Remove</button>}
               <button className="a3-pill" onClick={()=>askSkipSet(skipCurrentSet)} disabled={!!current.pausedAt}>Skip this set</button>
             </div>
           </details>
         </div>
       }

       {phase==='feedback'&&activeSet&&
         <div
           className="a3-stage set-completion-reveal"
           key={`feedback-${activeExercise.exerciseId}-${activeSet.id}`}
         >
           <span className="a3-eyebrow">SET {setCounter(activeExercise.sets,setIndex).replace(/^SET /,'')} DONE <span className="animated-check" aria-hidden="true">✓</span></span>
           <h3>How did that feel? <small className="a3-muted">(optional)</small></h3>

           <div className="a3-reco">
             <strong>{phase6LoadDisplay(activeEx,activeSet,undefined,s.profile).primary}</strong>
             <span>
               {activeSet.reps!==undefined
                 ?`${activeSet.reps} reps`
                 :activeSet.seconds!==undefined
                   ?`${activeSet.seconds} sec`
                   :'Not recorded'}
               {advanced&&activeSet.rir!==undefined
                 ?` · RIR ${activeSet.rir}`
                 :''}
             </span>
           </div>

           <p>
             This helps APEX choose your next weight. You can skip it.
           </p>

           <div className="a3-choices">
             <button onClick={()=>applyFeedback('heavy')}>
               <strong>TOO HEAVY</strong>
               <small>Use a lighter weight</small>
             </button>

             <button onClick={()=>applyFeedback('right')}>
               <strong>ABOUT RIGHT</strong>
               <small>Keep this weight</small>
             </button>

             <button onClick={()=>applyFeedback('easy')}>
               <strong>TOO EASY</strong>
               <small>Use a heavier weight</small>
             </button>
           </div>

           <button className="a3-cta a3-cta-ghost" onClick={skipFeedback}>
             Not sure · skip
           </button>
         </div>
       }

       {phase==='rest'&&
         <div className="a3-stage">
           <span className="a3-eyebrow">REST</span>

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
                 (x,i)=>i>setIndex&&pendingSet(x)
               );

             const upcomingExercise=
               nextExerciseIndex>=0&&nextEx
                 ?nextEx
                 :undefined;

             return upcomingSet&&activeExercise
               ?<>
                 <strong>NEXT · {setCounter(activeExercise.sets,activeExercise.sets.indexOf(upcomingSet))}</strong>
                 <div className="a3-reco">
                   <b>{phase6LoadDisplay(activeEx,upcomingSet,guided.guidedSession?.workingLoads?.[activeEx.id],s.profile).primary}</b>
                   <span>
                     {isWarm(upcomingSet)?`${upcomingSet.reps??'—'} reps · warm-up`:`${activeExercise.repRange[0]}–${activeExercise.repRange[1]} reps`}
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

           {restRemaining<=0&&<p>Rest is over. Keep going when you are ready.</p>}
           {advanced&&restRemaining>0&&<Disclosure label="About the rest timer"><p>The timer follows the real clock, so it keeps counting if you switch apps.</p></Disclosure>}

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
           <StateView kind="success" title="Exercise complete" detail={`${justDoneExercise?workingOf(justDoneExercise.sets).filter(x=>x.completed).length:completedForExercise} / ${workingOf((justDoneExercise||activeExercise).sets).length} sets`}/>

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

   {advanced&&overview&&
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
                           today(),
                           s.deloads
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
                         ask({title:'Remove this set?',message:'The set is taken out of this workout.',confirmLabel:'Remove set'},()=>
                           mutate(x=>
                             removeWorkoutSet(
                               x,
                               we.exerciseId,
                               set.id
                             )
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
                             askSkipSet(()=>
                               mutate(x=>
                                 markWorkoutSetSkipped(
                                   x,
                                   we.exerciseId,
                                   set.id
                                 )
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

   {advanced&&phase!=='complete'&&
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

   {advanced&&<div className="a3-footer">
     <button
       className="a3-cta a3-cta-ghost"
       onClick={()=>setOverview(x=>!x)}
     >
       {overview?'Return to focused training':'Open workout overview'}
     </button>
   </div>}

   {advanced&&adapt.length>0&&
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

   {dialog}

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

export function SessionReview({s,id,onNav,update}:{s:AppState;id:string;onNav:(r:string)=>void;update:(f:(x:AppState)=>AppState)=>void}){
 const w=s.workouts.find(x=>x.id===id); const [feel,setFeel]=useState<'easy'|'right'|'hard'|'rough'|''>(''); const [showDetails,setShowDetails]=useState(false); const {advanced}=useAdvancedControls();
 if(!w)return <Empty title="Session not found" text="The historical record is still local, but this view no longer has the session reference."/>
 const a=sessionAssessment(w,s.exercises,s.workouts.filter(x=>x.status==='completed'&&x.id!==w.id));
 const done=()=>onNav('home');const saveFeel=()=>{if(!feel)return;const text=`Session feel: ${feel}.`;const already=s.journal.some(j=>j.scope==='workout'&&j.refId===w.id&&j.text===text);if(!already) {const next={id:uid('journal'),date:today(),scope:'workout' as const,refId:w.id,text,tags:['session-feedback']};update(x=>({...x,journal:[...x.journal,next],eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'session_feedback',timestamp:new Date().toISOString(),payload:{workoutId:w.id,feel}}]}));}onNav('home')};
 const minutes=w.startedAt&&w.completedAt?Math.max(1,Math.round((new Date(w.completedAt).getTime()-new Date(w.startedAt).getTime())/60000)):undefined;
 return <div className="a3-home a3-complete-screen"><header className="a3-completehead"><span className="a3-state-icon" aria-hidden="true"><Icon name="check" size={36}/></span><span className="a3-eyebrow">SESSION COMPLETE</span><h1>Workout Complete</h1><p>{niceName(w.name)} · {a.completedSets} completed sets · {a.skipped} skipped</p></header>
 <div className="a3-stats session-review-metrics"><Metric label="Volume" value={a.volume?vol(a.volume).toLocaleString():'—'} sub={volLabel()}/><Metric label="Time" value={minutes===undefined?'—':String(minutes)} sub="min"/><Metric label="Sets" value={String(a.completedSets)} sub={`of ${a.plannedSets}`}/></div>
 {a.achievements.length>0&&<div className="a3-card a3-row a3-pr-row"><span className="a3-rowicon"><Icon name="crown"/></span><span><strong>{a.achievements.length} PR{a.achievements.length===1?'':'s'}</strong><small>Great work today!</small></span></div>}
 <section className="a3-block"><div className="a3-head"><div><span className="a3-eyebrow">SESSION FEEDBACK</span><h2>How did the session feel?</h2><p>Optional. A quick rating helps APEX plan your next session.</p></div></div><div className="a3-choices">{[['easy','Too easy'],['right','About right'],['hard','Hard but productive'],['rough','Rough / unusually difficult']].map(([id,label])=><button className={feel===id?'selected':''} key={id} onClick={()=>setFeel(id as any)}><strong>{label}</strong><small>{feel===id?'Selected':'Optional'}</small></button>)}</div></section>
 {showDetails&&<section className="a3-block"><div className="a3-list">{a.achievements.map((x,i)=><ListRow key={i} title={displayText(x.label)} sub={displayText(x.unit)} icon="bolt" click={()=>{}}/>)}{!a.achievements.length&&<Empty title="No new achievement" text="A normal session is still useful evidence."/>}</div></section>}
 {advanced&&<section className="a3-block"><div className="a3-card a3-callout"><Icon name="bolt"/><div><strong>Coach</strong><p>Keep the current structure unless new evidence supports a meaningful change. APEX adapts future prescription from actual performance, context and your feedback.</p></div></div></section>}
 <button className="a3-cta a3-cta-ghost" aria-expanded={showDetails} onClick={()=>setShowDetails(x=>!x)}>{showDetails?'Hide Details':'View Details'}</button>
 <button className="a3-cta" onClick={feel?saveFeel:done}>{feel?'Save feedback & finish':'Done'}</button></div>}
