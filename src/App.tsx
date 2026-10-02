import {useEffect,useRef,useState} from 'react';
import type {AppState,Workout} from './core/types';
import {repository} from './data/repository';
import type {RecoveryNotice} from './data/repository';
import {maintainTrainingHorizon} from './engine/rolling';
import {detectAchievements,uid,pauseWorkoutSession,resumeWorkoutSession,recoverWorkoutSession,hasLoggedSets,abandonWorkout,applyWorkoutAdaptation} from './engine/training';
import {buildObservations} from './engine/intelligence';
import {syncLocalNotifications,listenForNotificationActions} from './native/localNotifications';
import {motionMs} from './ui/motion';

import {accessibilityClass,fontScaleValue} from './data/accessibility';
import {App as CapacitorApp} from '@capacitor/app';
import {setUnits} from './data/units';
import {today} from './ui/shared';
import {Icon,Splash,LoadingPanel} from './ui/primitives';
import {Modal} from './ui/dialogs';
import {NavItem,Command} from './ui/navigation';
import {withGoalProgram,hydrateWorkoutRecommendations,ensureGuidedSession,initialWorkouts,todayPlus} from './ui/stateHelpers';
import {Today,Home} from './screens/Home';
import {Train,PreWorkout,PlanStudio,Templates} from './screens/Train';
import {WorkoutView,SessionReview} from './screens/Workout';
import {Progress,History} from './screens/Progress';
import {Coach,RecoveryGate} from './screens/Coach';
import {You,Goals,Journal,Measurements} from './screens/You';
import {Nutrition} from './screens/Nutrition';
import {Library,ExerciseSheet,Learn} from './screens/Library';
import {Onboarding} from './screens/Onboarding';

export function App(){
 const [s,setRaw]=useState<AppState>(()=>withGoalProgram(repository.load())),[route,setRoute]=useState('home'),[sheet,setSheet]=useState<string|null>(null),[query,setQuery]=useState(''),[splash,setSplash]=useState(true),[hydrated,setHydrated]=useState(false),[recovery,setRecovery]=useState<RecoveryNotice|null>(null);
 /* every state change passes through the goal program, so the exercises the app reads always carry the current goal's targets */
 const setS=(v:AppState|((x:AppState)=>AppState))=>setRaw(prev=>withGoalProgram(typeof v==='function'?(v as (x:AppState)=>AppState)(prev):v));
 const routeHistory=useRef<string[]>([]);
 const navDir=useRef<'forward'|'back'>('forward');
 const lastBack=useRef(0);
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

   navDir.current='forward';
   setRoute(r);
   setSheet(null);
   window.scrollTo({top:0,behavior:'instant'});
 };

 const goBack=()=>{
   /* a double press during the screen transition would pop two screens, or leave the app, by accident */
   const now=Date.now();
   if(now-lastBack.current<motionMs('--motion-fast',140))return;
   lastBack.current=now;
   if(sheetRef.current){
     setSheet(null);
     return;
   }

   const previous=routeHistory.current.pop();

   if(previous){
     navDir.current='back';
     setRoute(previous);
     window.scrollTo({top:0,behavior:'instant'});
     return;
   }

   if(routeRef.current!=='home'){
     navDir.current='back';
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
 /* the local day, re-read when the app returns to the foreground and every minute while it is open, so a day that passes is noticed */
 const [dayKey,setDayKey]=useState(today);
 useEffect(()=>{const tick=()=>setDayKey(today());document.addEventListener('visibilitychange',tick);const timer=setInterval(tick,60000);return()=>{document.removeEventListener('visibilitychange',tick);clearInterval(timer)}},[]);
 /* keeps the future horizon filled and marks earlier planned sessions missed (src/engine/rolling.ts); a no-op when nothing is missing */
 useEffect(()=>{if(!hydrated||!s.onboardingComplete)return;setS(x=>maintainTrainingHorizon(x,{today:today(),now:new Date().toISOString()}))},[hydrated,s.onboardingComplete,s.workouts,s.plan,s.profile,s.preferences.horizonDays,dayKey]);
 useEffect(()=>{if(hydrated)void repository.saveAsync({...s,activeRoute:route})},[s,route,hydrated]);
 /* Notifications are re-planned when what they depend on changes, when the app returns to the foreground and when the local day rolls over (also covers a time-zone change while it was closed). */
 const [clockTick,setClockTick]=useState(0);
 const lastDay=useRef(today());
 useEffect(()=>{
   const bump=()=>{lastDay.current=today();setClockTick(t=>t+1)};
   const onVisible=()=>{if(document.visibilityState==='visible')bump()};
   document.addEventListener('visibilitychange',onVisible);
   let handle:{remove:()=>Promise<void>}|undefined;
   void CapacitorApp.addListener('appStateChange',({isActive})=>{if(isActive)bump()}).then(h=>{handle=h});
   const timer=window.setInterval(()=>{if(today()!==lastDay.current)bump()},60000);
   return()=>{document.removeEventListener('visibilitychange',onVisible);window.clearInterval(timer);if(handle)void handle.remove()};
 },[]);
 useEffect(()=>{if(hydrated)void syncLocalNotifications(s)},[s.preferences.notifications,s.workouts,s.deloads,hydrated,clockTick]);
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
 if(!s.onboardingComplete)return <div className={appClass} style={appStyle} data-theme={s.preferences.theme||'apex'}>{splash&&<Splash message={hydrated?'Set up your training context…':'Restoring local training data…'}/>}<Onboarding onDone={(p,g,plan)=>{const ws=initialWorkouts(p,plan,s.exercises);const linked={...plan,days:plan.days.map((d:any)=>d.rest?d:{...d,workoutId:ws.find((w:Workout)=>w.scheduledDate===todayPlus(d.dayIndex)&&w.name===d.label)?.id})};setS(x=>({...x,profile:p,goals:[g],plan:linked,workouts:ws,onboardingComplete:true,activeRoute:'home'}));nav('home')}}/></div>;
 return <div className={`app ${accessibilityClass(s.preferences.fontScale,s.preferences.highContrast,s.preferences.reducedMotion)}`} style={{fontSize:`${fontScaleValue(s.preferences.fontScale)}em`}} data-theme={s.preferences.theme||'apex'}>{splash&&<Splash/>}
 <header className="topbar" data-apex-header><button className="brand apex-brand" aria-label="APEX Home" onClick={()=>nav('home')}><img src="/brand/apex-mark-gold.png" alt=""/><span>APEX</span></button><div className="brand-caption">TRAIN · TRACK · PROGRESS · EVOLVE</div><div className="apex-top-status"><i/> SYSTEM READY</div><div className="top-actions"><button className="a3-iconbtn" title="Profile" aria-label="Profile" onClick={()=>nav('you')}><Icon name="user"/></button><button className="a3-iconbtn command-trigger" title="Command Center" aria-label="Command Center" onClick={()=>setSheet('command')}><Icon name="search"/></button></div></header>
 <main className="main">
 <div className="page-transition screen-page" data-apex-route={route} data-nav-dir={navDir.current} key={route}>
 {route==='home'&&<Home s={s} onNav={nav} onStart={start} update={update}/>}
 {route==='train'&&<Train s={s} onStart={start} onNav={nav} update={update}/>}
 {route.startsWith('brief:')&&<PreWorkout s={s} id={route.slice(6)} update={update} onStart={(w)=>{update(x=>{const now=new Date().toISOString();const prepared=hydrateWorkoutRecommendations(ensureGuidedSession({...w,status:'in_progress',startedAt:w.startedAt||now,updatedAt:now}),x);return {...x,activeWorkoutId:w.id,activeRoute:'workout',workouts:x.workouts.map(q=>q.id===w.id?{...q,...prepared}:q)}});nav('workout')}} onBack={()=>nav('train')}/>}
 {route==='workout'&&active&&<WorkoutView s={s} w={active} update={update} onExit={()=>nav('home')} onExercise={id=>setSheet('exercise:'+id)} onJournal={()=>nav('journal')} onDone={w=>{if(!hasLoggedSets(w)){const at=new Date().toISOString();update(x=>({...x,activeRoute:'home',workouts:x.workouts.map(q=>q.id===w.id?abandonWorkout(w,at):q),activeWorkoutId:undefined,eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'workout_abandoned',timestamp:at,payload:{workoutId:w.id,reason:'no sets logged'}}]}));nav('home');return}const previous=s.workouts.filter(q=>q.status==='completed'&&q.id!==w.id);const achievements=detectAchievements(w,s.exercises,previous);update(x=>{const completed={...w,status:'completed' as const,completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};const next=x.workouts.filter(q=>q.status==='planned'&&q.planId===w.planId&&q.scheduledDate>=today()).sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate))[0];const adapted=next?applyWorkoutAdaptation(next,s.exercises,[...previous,{...w,status:'completed' as const,completedAt:completed.completedAt}],s.profile):undefined;return{...x,activeRoute:'home',workouts:x.workouts.map(q=>q.id===w.id?completed:q.id===adapted?.id?adapted:q),activeWorkoutId:undefined,achievements:[...x.achievements,...achievements.map(a=>({id:uid('ach'),workoutId:w.id,...a,timestamp:new Date().toISOString()}))],observations:buildObservations(x),eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'workout_completed',timestamp:new Date().toISOString(),payload:{workoutId:w.id,nextWorkoutId:adapted?.id}}]}});nav('session:'+w.id)}}/>}
 {route.startsWith('session:')&&<SessionReview s={s} id={route.slice(8)} onNav={nav} update={update}/>}
 {route==='progress'&&<Progress s={s} onNav={nav}/>}
 {route==='history'&&<History s={s} onNav={nav}/>}
 {route==='goals'&&<Goals s={s} update={update}/>}
 {route==='measurements'&&<Measurements s={s} update={update}/>}
 {route==='plan'&&<PlanStudio s={s} update={update} onStart={start}/>}
 {route==='library'&&<Library s={s} query={query} setQuery={setQuery} onExercise={id=>setSheet('exercise:'+id)}/>}
 {route==='you'&&<You s={s} nav={nav} update={update}/>}
 {route==='journal'&&<Journal s={s} update={update}/>}
 {route==='coach'&&<Coach s={s} update={update} onNav={nav}/>}
 {route==='today'&&<Today s={s} onNav={nav} onStart={start}/>}
 {route==='nutrition'&&<Nutrition s={s} update={update}/>}
 {route==='learn'&&<Learn/>}
 {route==='templates'&&<Templates s={s} update={update} onStart={start}/>}
 </div>
 </main>
 <nav className="bottom premium-bottom-nav"><NavItem active={route==='home'} icon="home" label="Home" click={()=>nav('home')}/><NavItem active={route==='train'||route==='workout'} icon="train" label="Train" click={()=>nav(active?'workout':'train')}/><NavItem active={['progress','history','goals'].includes(route)||route.startsWith('session:')} icon="chart" label="Progress" click={()=>nav('progress')}/><NavItem active={route==='you'} icon="user" label="You" click={()=>nav('you')}/></nav>
 {sheet==='command'&&<Command nav={nav} setQuery={setQuery} close={()=>setSheet(null)}/>}
 {sheet?.startsWith('exercise:')&&(()=>{const ex=s.exercises.find(e=>e.id===sheet.slice(9));return ex?<ExerciseSheet ex={ex} s={s} update={update} close={()=>setSheet(null)} onAlternative={id=>setSheet('exercise:'+id)} onPlan={()=>{setSheet(null);nav('plan')}}/>:<Modal title="Exercise unavailable" close={()=>setSheet(null)}><p className="modal-copy">This exercise is no longer available in the current local knowledge set.</p></Modal>})()}
 </div>
}
