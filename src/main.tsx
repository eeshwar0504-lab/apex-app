import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';
import type {AppState,Exercise,Goal,GoalKind,SetLog,SetType,UserProfile,Workout,WorkoutTemplate,PlanDay,Measurement} from './core/types';
import {EXERCISES,findExercises} from './knowledge/exercises';
import {repository} from './data/repository';
import {encryptBackup,decryptBackup,recoveryKey} from './data/backupCrypto';
import {buildPlan,createWorkout,createCustomWorkout,cloneTemplateWorkout,detectAchievements,formatLoad,makeSet,progression,recommendedRest,markMissedWorkouts,createRescheduled,volumeForWorkout,updateSetType,safetyCheck,uid,addWorkoutSet,removeWorkoutSet,reorderWorkoutExercise,replaceWorkoutExercise,markWorkoutExerciseSkipped,sessionAssessment,applyWorkoutAdaptation,planWithDays,summarizeSets,rescheduleWorkout,equipmentFit,smartAlternatives} from './engine/training';
import {homeInsights,readiness,buildObservations,adaptationsForWorkout,goalProgress,goalMilestones,trainingLoadSummary} from './engine/intelligence';
import {notificationIntents} from './engine/notifications';
import {syncLocalNotifications,listenForNotificationActions} from './native/localNotifications';
import {knowledgeReport} from './knowledge/knowledgeGraph';
import {inspectState} from './data/integrity';
import {groundedCoachAnswer} from './engine/coachGateway';
import {consistencySummary,volumeTrend,plateauCandidates,goalMomentum,trainingBalance} from './engine/analytics';
import {accessibilityClass,fontScaleValue} from './data/accessibility';

const today=()=>new Date().toISOString().slice(0,10);
const fmt=(n:number)=>`${String(Math.floor(Math.max(0,n)/60)).padStart(2,'0')}:${String(Math.max(0,n)%60).padStart(2,'0')}`;
const SET_TYPES:SetType[]=['warmup','working','drop','failure','amrap','rest_pause','myo_reps','tempo','cluster','timed','bodyweight','assisted','unilateral'];

function Icon({name,size=20}:{name:string;size?:number}){const c={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};const p:Record<string,React.ReactNode>={home:<><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,train:<><path d="M6 4v16M18 4v16M3 8v8M21 8v8M6 8h12M6 16h12"/></>,chart:<><path d="M4 19V5"/><path d="M4 19h17"/><path d="m7 15 4-4 3 2 5-7"/></>,user:<><circle cx="12" cy="8" r="4"/><path d="M4 21c1.4-4 4-6 8-6s6.6 2 8 6"/></>,search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,play:<path d="m8 5 11 7-11 7V5Z"/>,plus:<><path d="M12 5v14M5 12h14"/></>,minus:<path d="M5 12h14"/>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,check:<path d="m5 12 4 4L19 7"/>,chev:<path d="m9 18 6-6-6-6"/>,back:<path d="m15 18-6-6 6-6"/>,bolt:<path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>,target:<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>,history:<><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></>,settings:<><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.6l2-1.5-1.8.9"/></>};return <svg {...c}>{p[name]||p.bolt}</svg>}

function App(){
 const [s,setS]=useState<AppState>(()=>repository.load()),[route,setRoute]=useState('home'),[sheet,setSheet]=useState<string|null>(null),[query,setQuery]=useState(''),[splash,setSplash]=useState(true),[hydrated,setHydrated]=useState(false);
 const update=(fn:(x:AppState)=>AppState)=>setS(x=>fn(structuredClone(x)));
 const nav=(r:string)=>{setRoute(r);setSheet(null);window.scrollTo({top:0,behavior:'smooth'})};
 useEffect(()=>{let live=true;repository.loadAsync().then(next=>{if(live){setS(next);setRoute(next.activeRoute||'home');setHydrated(true)}}).catch(()=>setHydrated(true));return()=>{live=false}},[]);
 useEffect(()=>{const t=setTimeout(()=>setSplash(false),900);return()=>clearTimeout(t)},[]);
 useEffect(()=>{if(s.onboardingComplete){const m=markMissedWorkouts(s.workouts,today());if(JSON.stringify(m)!==JSON.stringify(s.workouts))setS(x=>({...x,workouts:m}));}},[]);
 useEffect(()=>{if(hydrated)void repository.saveAsync({...s,activeRoute:route})},[s,route,hydrated]);
 useEffect(()=>{if(hydrated)void syncLocalNotifications({...s,activeRoute:route})},[s.preferences.notifications,s.workouts,hydrated,route]);
 useEffect(()=>{let dispose:(()=>Promise<void>)|undefined; if(hydrated)void listenForNotificationActions(r=>nav(r)).then(fn=>{dispose=fn}); return()=>{if(dispose)void dispose()};},[hydrated]);
 const start=(w:Workout)=>{update(x=>({...x,activeWorkoutId:w.id,workouts:x.workouts.map(q=>q.id===w.id?{...q,...w,status:'in_progress',startedAt:q.startedAt||new Date().toISOString(),updatedAt:new Date().toISOString()}:q)}));nav('brief:'+w.id)};
 const active=s.workouts.find(w=>w.id===s.activeWorkoutId&&w.status==='in_progress');
 if(!hydrated)return <div className="splash"><img src="/brand/apex-symbol-light.png"/><b>APEX</b><small>Restoring local training data…</small></div>;
 if(!s.onboardingComplete)return <Onboarding onDone={(p,g,plan)=>{const ws=makeInitialWorkouts(p,plan,s.exercises);const linked={...plan,days:plan.days.map((d:any)=>d.rest?d:{...d,workoutId:ws.find((w:Workout)=>w.scheduledDate===todayPlus(d.dayIndex)&&w.name===d.label)?.id})};setS(x=>({...x,profile:p,goals:[g],plan:linked,workouts:ws,onboardingComplete:true,activeRoute:'home'}));nav('home')}}/>;
 return <div className={`app ${accessibilityClass(s.preferences.fontScale,s.preferences.highContrast,s.preferences.reducedMotion)}`} style={{fontSize:`${fontScaleValue(s.preferences.fontScale)}em`}}>{splash&&<div className="splash"><img src="/brand/apex-symbol-light.png"/><b>APEX</b></div>}
 <header className="topbar"><button className="brand" onClick={()=>nav('home')}><img src="/brand/apex-symbol-light.png"/><span>APEX</span></button><div className="top-actions"><button className="icon-btn" aria-label="Command Center" onClick={()=>setSheet('command')}><Icon name="search"/></button><button className="icon-btn" aria-label="You" onClick={()=>nav('you')}><Icon name="user"/></button></div></header>
 <main className="main">
 {route==='home'&&<Home s={s} onNav={nav} onStart={start}/>}
 {route==='train'&&<Train s={s} onStart={start} onNav={nav} update={update}/>}
 {route.startsWith('brief:')&&<PreWorkout s={s} id={route.slice(6)} onStart={(w)=>{update(x=>({...x,activeWorkoutId:w.id,workouts:x.workouts.map(q=>q.id===w.id?{...q,...w,status:'in_progress',startedAt:q.startedAt||new Date().toISOString(),updatedAt:new Date().toISOString()}:q)}));nav('workout')}} onBack={()=>nav('train')}/>} 
 {route==='workout'&&active&&<WorkoutView s={s} w={active} update={update} onExit={()=>nav('home')} onExercise={id=>setSheet('exercise:'+id)} onDone={w=>{const previous=s.workouts.filter(q=>q.status==='completed'&&q.id!==w.id);const achievements=detectAchievements(w,s.exercises,previous);update(x=>{const completed={...w,status:'completed' as const,completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};const next=x.workouts.filter(q=>q.status==='planned'&&q.planId===w.planId&&q.scheduledDate>=today()).sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate))[0];const adapted=next?applyWorkoutAdaptation(next,s.exercises,[...previous,w]):undefined;return{...x,workouts:x.workouts.map(q=>q.id===w.id?completed:q.id===adapted?.id?adapted:q),activeWorkoutId:undefined,achievements:[...x.achievements,...achievements.map(a=>({id:uid('ach'),workoutId:w.id,...a,timestamp:new Date().toISOString()}))],observations:buildObservations(x),eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'workout_completed',timestamp:new Date().toISOString(),payload:{workoutId:w.id,nextWorkoutId:adapted?.id}}]}});nav('session:'+w.id)}}/>}
 {route.startsWith('session:')&&<SessionReview s={s} id={route.slice(8)} onNav={nav} update={update}/>}
 {route==='progress'&&<Progress s={s} onNav={nav}/>}
 {route==='history'&&<History s={s} onNav={nav}/>}
 {route==='goals'&&<Goals s={s} update={update}/>} 
 {route==='measurements'&&<Measurements s={s} update={update}/>}
 {route==='plan'&&<PlanStudio s={s} update={update} onStart={start}/>}
 {route==='library'&&<Library s={s} query={query} setQuery={setQuery} onExercise={id=>setSheet('exercise:'+id)}/>}
 {route==='you'&&<You s={s} nav={nav} update={update}/>}
 {route==='coach'&&<Coach s={s}/>}
 {route==='learn'&&<Learn/>}
 {route==='templates'&&<Templates s={s} update={update} onStart={start}/>}
 </main>
 <nav className="bottom"><NavItem active={route==='home'} icon="home" label="Home" click={()=>nav('home')}/><NavItem active={route==='train'||route==='workout'} icon="train" label="Train" click={()=>nav(active?'workout':'train')}/><NavItem active={['progress','history','goals'].includes(route)||route.startsWith('session:')} icon="chart" label="Progress" click={()=>nav('progress')}/><NavItem active={route==='you'} icon="user" label="You" click={()=>nav('you')}/></nav>
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
    strength:'Build strength',
    hypertrophy:'Build muscle',
    fat_loss:'Improve body composition',
    fitness:'Improve fitness',
    general:'Balanced training'
  };

  const togg=(x:string)=>{
    setError('');
    setEquipment(a=>
      a.includes(x)
        ? a.filter(q=>q!==x)
        : [...a,x]
    );
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
    <div className="onboarding">

      <div className="onboard-brand">
        <img
          src="/brand/apex-symbol-light.png"
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
        <div className="onboard-body">
          <span className="eyebrow">
            APEX / 01
          </span>

          <h1>
            Training that adapts to what you actually do.
          </h1>

          <p>
            No fake body stats. No fixed routine.
            APEX starts with your choices and becomes
            more informed through performance.
          </p>

          <div className="feature-list">
            <b>
              01
              <span>Track every useful set.</span>
            </b>

            <b>
              02
              <span>Progress from evidence.</span>
            </b>

            <b>
              03
              <span>Keep control of every change.</span>
            </b>
          </div>
        </div>
      )}

      {step===1&&(
        <div className="onboard-body">
          <span className="eyebrow">
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

          <span className="eyebrow">
            GOAL / 03
          </span>

          <h1>
            What are you training for?
          </h1>

          <div className="choice-grid">

            {(Object.keys(goalText) as GoalKind[]).map(g=>(
              <button
                type="button"
                className={goal===g?'selected':''}
                onClick={()=>setGoal(g)}
                key={g}
              >
                <strong>
                  {goalText[g]}
                </strong>

                <small>
                  {
                    g==='strength'
                      ?'Performance first'
                      :g==='hypertrophy'
                        ?'Muscle-building focus'
                        :g==='fat_loss'
                          ?'Training alongside body-composition goals'
                          :g==='fitness'
                            ?'Capacity and consistency'
                            :'Flexible balanced training'
                  }
                </small>
              </button>
            ))}

          </div>
        </div>
      )}

      {step===3&&(
        <div className="onboard-body">

          <span className="eyebrow">
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

          <span className="eyebrow">
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
              className="callout onboarding-error"
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
          className="button ghost"
          disabled={!step||building}
          onClick={()=>setStep(x=>x-1)}
        >
          Back
        </button>

        {step<4?(
          <button
            type="button"
            className="button primary"
            onClick={()=>{
              setError('');
              setStep(x=>x+1);
            }}
          >
            Continue
            <Icon name="chev"/>
          </button>
        ):(
          <button
            type="button"
            className="button primary"
            disabled={
              building||
              !exp||
              !goal||
              !days||
              !mins||
              equipment.length===0
            }
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
 const active=s.workouts.find(w=>w.status==='in_progress'),todayW=s.workouts.find(w=>w.scheduledDate===today()&&['planned','rescheduled'].includes(w.status)),goal=s.goals.find(g=>g.status==='active'),read=readiness(s),ins=homeInsights(s);
 return <><section className="hero editorial"><span className="eyebrow">{new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</span><h1>{active?'Your workout is waiting.':todayW?todayW.name:'Build the habit, then build the load.'}</h1><p>{active?'Resume exactly where you stopped.':todayW?`${todayW.exercises.length} movements · adaptive prescription · your pace.`:'APEX starts with evidence, not assumptions.'}</p>{active?<button className="button primary" onClick={()=>onStart(active)}><Icon name="play"/> Resume workout</button>:todayW?<button className="button primary" onClick={()=>onStart(todayW)}><Icon name="play"/> Start {todayW.name}</button>:<button className="button secondary" onClick={()=>onNav('train')}>View training <Icon name="chev"/></button>}</section>
 <section className="section"><div className="metric-strip"><Metric label="Sessions" value={String(s.workouts.filter(w=>w.status==='completed').length)} sub="completed"/><Metric label="Readiness" value={read.label} sub={read.level}/><Metric label="Goal" value={goal?.title?.split(' ').slice(-1)[0]||'—'} sub="active"/></div></section>
 <section className="section"><div className="section-head"><div><span className="eyebrow">NOW</span><h2>Useful context.</h2></div></div><div className="insight-stack">{ins.map((x,i)=><article className="insight" key={i}><div><span className={`badge ${x.kind}`}>{x.kind}</span><h3>{x.title}</h3><p>{x.detail}</p><small>{x.evidence.join(' · ')}</small></div></article>)}</div></section>
 <section className="section quick-grid"><button className="quick" onClick={()=>onNav('progress')}><Icon name="chart"/><span><strong>Progress</strong><small>Strength, volume and evidence</small></span><Icon name="chev"/></button><button className="quick" onClick={()=>onNav('plan')}><Icon name="target"/><span><strong>Plan Studio</strong><small>Edit future training</small></span><Icon name="chev"/></button><button className="quick" onClick={()=>onNav('library')}><Icon name="search"/><span><strong>Exercise Library</strong><small>Find a movement</small></span><Icon name="chev"/></button><button className="quick" onClick={()=>onNav('coach')}><Icon name="bolt"/><span><strong>Coach</strong><small>Explain the evidence</small></span><Icon name="chev"/></button></section></>
}
function Train({s,onStart,onNav,update}:{s:AppState;onStart:(w:Workout)=>void;onNav:(r:string)=>void;update:(f:(x:AppState)=>AppState)=>void}){
 const upcoming=s.workouts.filter(w=>w.status==='planned'||w.status==='rescheduled').sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate));
 const extra=s.workouts.filter(w=>w.source==='extra');
 const [reschedule,setReschedule]=useState<Workout|null>(null),[date,setDate]=useState(today());
 const createExtra=()=>{const ids=s.exercises.slice(0,5).map(e=>e.id);const w=createCustomWorkout('Extra Session',today(),ids,s.exercises);w.source='extra';w.status='planned';update(x=>({...x,workouts:[...x.workouts,w],eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'extra_workout_created',timestamp:new Date().toISOString(),payload:{workoutId:w.id}}]}));onStart(w)};
 const commitReschedule=()=>{if(!reschedule||!date)return;const pair=rescheduleWorkout(reschedule,date);update(x=>({...x,workouts:x.workouts.map(w=>w.id===pair.original.id?pair.original:w).concat(pair.replacement),eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'workout_rescheduled',timestamp:new Date().toISOString(),payload:{from:pair.original.id,to:pair.replacement.id,date}}]}));setReschedule(null);};
 return <><PageTitle eyebrow="TRAIN" title="Your training floor." sub="Scheduled work, flexible sessions and quick access to the movement library."/>
 <div className="command-row"><button className="button primary" onClick={createExtra}><Icon name="plus"/> Quick extra workout</button><button className="button secondary" onClick={()=>onNav('templates')}>Templates</button><button className="button secondary" onClick={()=>onNav('plan')}>Plan Studio</button></div>
 <section className="section"><div className="section-head"><div><span className="eyebrow">UP NEXT</span><h2>Scheduled sessions.</h2></div></div><div className="timeline">{upcoming.slice(0,6).map(w=><div className="timeline-row" key={w.id}><span className="timeline-dot">{w.scheduledDate===today()?'NOW':w.scheduledDate.slice(5)}</span><button className="timeline-main" onClick={()=>onStart(w)}><strong>{w.name}</strong><small>{w.exercises.length} exercises · {w.source} · v{w.version}</small></button><button className="mini-btn" onClick={()=>{setReschedule(w);setDate(w.scheduledDate)}}>Move</button><button className="mini-btn" onClick={()=>update(x=>({...x,workouts:x.workouts.map(q=>q.id===w.id?{...q,status:'skipped',updatedAt:new Date().toISOString()}:q)}))}>Skip</button></div>)}{!upcoming.length&&<Empty title="No scheduled session" text="Use Plan Studio or create a custom workout."/>}</div></section>
 <section className="section"><div className="callout"><Icon name="bolt"/><div><strong>Flexible training</strong><p>Missed sessions become explicit history. Rescheduling creates a new event and keeps the original record visible.</p></div></div></section>
 {extra.length>0&&<section className="section"><div className="section-head"><div><span className="eyebrow">EXTRA</span><h2>Unscheduled work.</h2></div></div><div className="timeline">{extra.slice(-4).reverse().map(w=><button className="timeline-row" key={w.id} onClick={()=>onStart(w)}><span className="timeline-dot">+</span><span><strong>{w.name}</strong><small>{w.scheduledDate} · {w.status}</small></span><Icon name="chev"/></button>)}</div></section>}
 {reschedule&&<Modal title="Reschedule session" close={()=>setReschedule(null)}><p className="modal-copy">The original session stays in history as rescheduled. The new date becomes a separate scheduled event.</p><label>New date<input type="date" value={date} min={today()} onChange={e=>setDate(e.target.value)}/></label><button className="button primary wide" onClick={commitReschedule}>Confirm new date</button></Modal>}
 </>}

function PreWorkout({s,id,onStart,onBack}:{s:AppState;id:string;onStart:(w:Workout)=>void;onBack:()=>void}){
 const w=s.workouts.find(x=>x.id===id);
 const read=readiness(s);
 const [energy,setEnergy]=useState<number|null>(null);
 const [note,setNote]=useState('');
 if(!w)return <Empty title="Session unavailable" text="This training event is no longer available."/> as any;
 const first=w.exercises[0], firstEx=first?s.exercises.find(e=>e.id===first.exerciseId):undefined;
 const adaptations=adaptationsForWorkout(s,w);
 const begin=()=>{const now=new Date().toISOString(); const updated={...w,notes:[w.notes,note.trim()].filter(Boolean).join('\n'),updatedAt:now}; if(energy!==null){updated.notes=[updated.notes,`Pre-session energy: ${energy}/5`].filter(Boolean).join('\n')} onStart(updated)};
 return <div className="preworkout"><button className="icon-btn" onClick={onBack}><Icon name="back"/></button>
  <span className="eyebrow">PRE-WORKOUT BRIEFING</span><h1>{w.name}</h1><p className="muted">{w.scheduledDate} · {w.exercises.length} exercises · {w.exercises.reduce((a,e)=>a+e.prescribedSets,0)} planned sets</p>
  <section className="brief-card"><div><span className="eyebrow">RECENT EVIDENCE</span><strong>{read.label}</strong><p>{read.detail}</p></div><span className={`status-dot ${read.level}`}/></section>
  {adaptations.length>0&&<section className="brief-card"><span className="eyebrow">TODAY'S CONTEXT</span>{adaptations.slice(0,3).map((a,i)=><div className="brief-line" key={i}><strong>{a.title}</strong><small>{a.detail}</small></div>)}</section>}
  {firstEx&&<section className="brief-card"><span className="eyebrow">FIRST MOVEMENT</span><strong>{firstEx.name}</strong><p>{firstEx.repRange[0]}–{firstEx.repRange[1]} reps · {firstEx.restSec}s rest · {first.recommendedWeight!==undefined?formatLoad(firstEx,first.recommendedWeight):'calibrate from your first useful set'}</p></section>}
  <section className="brief-card"><span className="eyebrow">OPTIONAL CHECK-IN</span><h3>How ready do you feel?</h3><div className="energy-grid">{[1,2,3,4,5].map(v=><button key={v} className={energy===v?'selected':''} onClick={()=>setEnergy(v)}><b>{v}</b><small>{v===1?'Low':v===2?'Below usual':v===3?'Normal':v===4?'Good':'Very good'}</small></button>)}</div><label>Anything APEX should know? <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional context — sleep, schedule, technique, etc."/></label></section>
  <button className="button primary wide" onClick={begin}>Begin session <Icon name="chev"/></button>
 </div>
}
function safeExercise(exercises:Exercise[],id:string){return exercises.find(e=>e.id===id);}
function WorkoutView({s,w,update,onExit,onExercise,onDone}:{s:AppState;w:Workout;update:(f:(x:AppState)=>AppState)=>void;onExit:()=>void;onExercise:(id:string)=>void;onDone:(w:Workout)=>void}){
 const [focus,setFocus]=useState(true),[restEnd,setRestEnd]=useState<number|null>(null),[now,setNow]=useState(Date.now()),[replace,setReplace]=useState<string|null>(null),[rq,setRq]=useState(''),[history,setHistory]=useState<Workout[]>([]),[safety,setSafety]=useState(false);
 useEffect(()=>{const i=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(i)},[]);
 useEffect(()=>{const p=s.workouts.filter(x=>x.status==='completed'&&x.id!==w.id);setHistory(p)},[s.workouts,w.id]);
 const current=s.workouts.find(x=>x.id===w.id)||w, elapsed=current.startedAt?Math.max(0,Math.floor((Date.now()-new Date(current.startedAt).getTime())/1000)-(current.pausedTotalSec||0)-(current.pausedAt?Math.floor((Date.now()-new Date(current.pausedAt).getTime())/1000):0)):0;
 const assessment=sessionAssessment(current,s.exercises,history),adapt=adaptationsForWorkout(s,current),all=current.exercises.every(e=>e.status==='skipped'||e.sets.every(x=>x.completed));
 const mutate=(fn:(x:Workout)=>Workout)=>update(x=>({...x,workouts:x.workouts.map(q=>q.id===current.id?fn(q):q)}));
 const togglePause=()=>update(x=>{const at=new Date().toISOString(),ww=x.workouts.find(q=>q.id===current.id);if(!ww)return x;const paused=!!ww.pausedAt;const nextPaused=paused?{...ww,pausedAt:undefined,pausedTotalSec:(ww.pausedTotalSec||0)+Math.floor((Date.now()-new Date(ww.pausedAt!).getTime())/1000),updatedAt:at}:{...ww,pausedAt:at,updatedAt:at};return {...x,workouts:x.workouts.map(q=>q.id===current.id?nextPaused:q),eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:paused?'workout_resumed':'workout_paused',timestamp:at,payload:{workoutId:current.id}}]}});
 const completeSet=(eid:string,sid:string)=>{mutate(ww=>{const c=structuredClone(ww),we=c.exercises.find(x=>x.exerciseId===eid),set=we?.sets.find(x=>x.id===sid);if(!we||!set)return ww;if(set.completed){set.completed=false;set.timestamp=undefined}else{if(set.type!=='warmup'&&set.reps===undefined&&set.seconds===undefined)return ww;set.completed=true;set.timestamp=new Date().toISOString();const ex=safeExercise(s.exercises,eid);if(!ex)return c;setRestEnd(Date.now()+recommendedRest(ex,s.preferences.restPreference,s.preferences.restCustomSec,set.rir)*1000)}return c})};
 const filtered=s.exercises.filter(e=>!rq||`${e.name} ${e.aliases.join(' ')} ${e.pattern} ${e.primaryMuscles.join(' ')}`.toLowerCase().includes(rq.toLowerCase())).sort((a,b)=>{const ae=replace?s.exercises.find(x=>x.id===replace):undefined;const fit=(x:Exercise)=>equipmentFit(x,s.profile?.equipment);const score=(x:Exercise)=>((fit(x)==='available'?0:fit(x)==='unknown'?1:2)+(ae&&x.pattern===ae.pattern?-2:0)+(ae&&x.loadSemantics===ae.loadSemantics?-1:0));return score(a)-score(b)}).slice(0,20);
 return <div className="workout-shell"><div className="workout-top"><button className="icon-btn" onClick={onExit}><Icon name="back"/></button><div><span className="eyebrow">{current.source.toUpperCase()} · {current.scheduledDate}</span><h1>{current.name}</h1></div><button className="mode-button" onClick={()=>setFocus(!focus)}>{focus?'Focus':'Overview'}</button></div>
 <div className="workout-toolbar"><span>{fmt(elapsed)} elapsed</span><span>{assessment.completedSets}/{assessment.plannedSets} sets</span><button className="mini-btn" onClick={()=>mutate(x=>({...x,notes:x.notes||''}))}>Journal</button><button className="mini-btn" onClick={()=>setSafety(true)}>Safety</button><button className="mini-btn" aria-label={current.pausedAt?'Resume workout':'Pause workout'} onClick={togglePause}>{current.pausedAt?'Resume':'Pause'}</button></div>
 {current.pausedAt&&<div className="rest-panel paused-session"><div><span className="eyebrow">SESSION PAUSED</span><strong>Take your time</strong><small>Elapsed time is preserved. Resume when you are ready.</small></div><div className="rest-actions"><button onClick={togglePause}>Resume</button></div></div>}
 {restEnd&&restEnd>now&&<div className="rest-panel"><div><span className="eyebrow">REST</span><strong aria-live="polite">{fmt(Math.ceil((restEnd-now)/1000))}</strong><small>Adaptive recommendation · actual elapsed time</small></div><div className="rest-actions"><button onClick={()=>setRestEnd(restEnd+15000)}>+15</button><button onClick={()=>setRestEnd(null)}>Skip</button></div></div>}
 <div className="workout-note"><textarea aria-label="Workout notes" value={current.notes||''} onChange={e=>mutate(x=>({...x,notes:e.target.value}))} placeholder="Workout note — optional context, technique, how it felt…"/></div>
 <div className="exercise-stack">{current.exercises.map((we,i)=><article className={`exercise-card ${focus&&i!==current.exercises.findIndex(x=>x.status!=='skipped'&&!x.sets.every(y=>y.completed))?'compact':''} ${we.status==='skipped'?'exercise-skipped':''}`} key={`${we.exerciseId}-${i}`}>
 <div className="exercise-title-row"><button className="exercise-title" onClick={()=>onExercise(we.exerciseId)}><span><em>{String(i+1).padStart(2,'0')}</em><strong>{s.exercises.find(e=>e.id===we.exerciseId)?.name}</strong><small>{we.repRange[0]}–{we.repRange[1]} reps · {formatLoad(safeExercise(s.exercises,we.exerciseId) || {loadSemantics:'total'} as Exercise,we.recommendedWeight)} · {we.restSec}s rest</small></span><Icon name="chev"/></button><div className="exercise-actions"><button className="mini-btn" onClick={()=>setReplace(we.exerciseId)}>Replace</button><button className="mini-btn" onClick={()=>mutate(x=>reorderWorkoutExercise(x,i,Math.max(0,i-1)))} disabled={i===0}>↑</button><button className="mini-btn" onClick={()=>mutate(x=>reorderWorkoutExercise(x,i,Math.min(x.exercises.length-1,i+1)))} disabled={i===current.exercises.length-1}>↓</button></div></div>
 {we.status==='skipped'?<div className="skipped-message">Skipped — no sets are counted as performed. <button className="mini-btn" onClick={()=>mutate(x=>markWorkoutExerciseSkipped(x,we.exerciseId))}>Restore</button></div>:<>{!focus||i===current.exercises.findIndex(x=>x.status!=='skipped'&&!x.sets.every(y=>y.completed))?<div className="prescription"><span>{we.prescribedSets} sets · {we.repRange[0]}–{we.repRange[1]}</span><b>{we.recommendedWeight!==undefined?`Start ${formatLoad(safeExercise(s.exercises,we.exerciseId) || {loadSemantics:'total'} as Exercise,we.recommendedWeight)}`:'Calibrate first'}</b></div>:null}<div>{(()=>{const ex=safeExercise(s.exercises,we.exerciseId);if(!ex)return <div className="skipped-message">Exercise data unavailable. This workout entry is preserved, but its controls are disabled until the exercise is restored.</div>;return we.sets.map((set,j)=><SetEditor key={set.id} set={set} ex={ex} index={j} onChange={p=>mutate(x=>{const c=structuredClone(x),e=c.exercises.find(z=>z.exerciseId===we.exerciseId),ss=e?.sets.find(z=>z.id===set.id);if(!e||!ss)return x;Object.assign(ss,p);return c})} onType={t=>mutate(x=>{const c=structuredClone(x),e=c.exercises.find(z=>z.exerciseId===we.exerciseId),ss=e?.sets.find(z=>z.id===set.id);if(!e||!ss)return x;Object.assign(ss,updateSetType(ss,t,ex));return c})} onComplete={()=>{if(!current.pausedAt)completeSet(we.exerciseId,set.id)}} onAdd={()=>mutate(x=>addWorkoutSet(x,we.exerciseId,s.exercises,set))} onRemove={()=>mutate(x=>removeWorkoutSet(x,we.exerciseId,set.id))}/>)})()}</div><div className="set-add"><button className="mini-btn" onClick={()=>mutate(x=>addWorkoutSet(x,we.exerciseId,s.exercises))}>+ Add set</button><button className="mini-btn" onClick={()=>mutate(x=>markWorkoutExerciseSkipped(x,we.exerciseId))}>Skip exercise</button></div></>}
 </article>)}</div>
 <div className="workout-footer"><button className="button primary wide" disabled={!all} onClick={()=>onDone(current)}>{all?'Finish session':`Complete remaining sets · ${assessment.plannedSets-assessment.completedSets} left`}</button></div>
 {adapt.length>0&&<div className="callout"><Icon name="bolt"/><div><strong>Next-session evidence</strong>{adapt.slice(0,2).map((a,i)=><p key={i}>{a.title}: {a.detail}</p>)}</div></div>}
 {safety&&<Modal title="Training safety check" close={()=>setSafety(false)}>
 <p className="modal-copy">If something feels unsafe or unexpectedly wrong, APEX does not try to diagnose it. Record the context, stop the movement if needed, and use your own judgement about whether to continue.</p>
 <div className="choice-grid feedback safety-grid">
 {[
  ['discomfort','Unusual discomfort','Record it and review the movement.'],
  ['sharp','Sharp or worsening pain','Stop this movement and do not push through it.'],
  ['dizzy','Dizziness / unusual breathlessness','Stop the session and recover before deciding what to do next.'],
  ['stable','Technique feels unstable','Reduce complexity or stop the movement until control is restored.']
 ].map(([id,label,detail])=><button key={id} onClick={()=>{const at=new Date().toISOString();update(x=>({...x,journal:[...x.journal,{id:uid('journal'),date:today(),scope:'workout',refId:current.id,text:`Safety check: ${label}.`,tags:['safety'] }],eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'safety_check',timestamp:at,payload:{workoutId:current.id,signal:id}}]}));setSafety(false)}}><strong>{label}</strong><small>{detail}</small></button>)}
 </div>
 <div className="callout"><Icon name="settings"/><div><strong>APEX guardrail</strong><p>APEX can adapt training evidence, but it does not diagnose injuries or override professional medical advice.</p></div></div>
 </Modal>}
 {replace&&<Modal title="Replace exercise" close={()=>setReplace(null)}><p className="modal-copy">History stays attached to the original canonical exercise. The replacement starts a fresh baseline unless the engine proves comparable semantics.</p><div className="search"><Icon name="search"/><input autoFocus value={rq} onChange={e=>setRq(e.target.value)} placeholder="Search movement or alias…"/></div><div className="picker-list">{filtered.map(e=>{const fit=equipmentFit(e,s.profile?.equipment);const oldEx=s.exercises.find(x=>x.id===replace);const comparable=!!oldEx&&oldEx.pattern===e.pattern&&oldEx.loadSemantics===e.loadSemantics;return <button key={e.id} className="picker-row" onClick={()=>{mutate(x=>replaceWorkoutExercise(x,replace,e,s.exercises));setReplace(null);setRq('')}}><span><strong>{e.name}</strong><small>{fit==='available'?'✓ Available':fit==='unknown'?'? Equipment not confirmed':'× Not in setup'} · {comparable?'Comparable movement — baseline can carry forward':'New baseline'} · {e.equipment.join(', ')}</small></span><Icon name="chev"/></button>})}</div></Modal>}
 </div>
}
function SetEditor({set,ex,index,onChange,onType,onComplete,onAdd,onRemove}:{set:SetLog;ex:Exercise;index:number;onChange:(p:Partial<SetLog>)=>void;onType:(t:SetType)=>void;onComplete:()=>void;onAdd:()=>void;onRemove:()=>void}){
 const timed=set.type==='timed'||ex.loadSemantics==='time',assist=set.type==='assisted'||ex.loadSemantics==='assistance';
 return <div className={`set-editor ${set.completed?'done':''}`}><div className="set-meta"><span>{String(index+1).padStart(2,'0')}</span><select value={set.type} onChange={e=>onType(e.target.value as SetType)} aria-label="Set type">{SET_TYPES.map(x=><option value={x} key={x}>{x.replace('_',' ')}</option>)}</select></div><div className="set-inputs">{!timed&&!assist&&!['bodyweight','none'].includes(ex.loadSemantics)&&<label>LOAD<input type="number" step={ex.incrementKg} inputMode="decimal" value={set.weight??''} placeholder="kg" onChange={e=>onChange({weight:e.target.value===''?undefined:+e.target.value})}/></label>}{assist&&<label>ASSIST<input type="number" step={ex.incrementKg} value={set.assistance??''} placeholder="kg" onChange={e=>onChange({assistance:e.target.value===''?undefined:+e.target.value})}/></label>}{timed?<label>SECONDS<input type="number" value={set.seconds??''} onChange={e=>onChange({seconds:e.target.value===''?undefined:+e.target.value})}/></label>:<label>REPS<input type="number" value={set.reps??''} onChange={e=>onChange({reps:e.target.value===''?undefined:+e.target.value})}/></label>}<label>RIR<input type="number" min="0" max="5" value={set.rir??''} placeholder="—" onChange={e=>onChange({rir:e.target.value===''?undefined:+e.target.value})}/></label></div><div className="set-actions"><button className="complete-set" onClick={onComplete} aria-label={set.completed?'Undo set':'Complete set'}><Icon name="check"/></button><button className="mini-btn" onClick={onAdd}>+</button><button className="mini-btn" onClick={onRemove}>−</button></div></div>
}
function SessionReview({s,id,onNav,update}:{s:AppState;id:string;onNav:(r:string)=>void;update:(f:(x:AppState)=>AppState)=>void}){
 const w=s.workouts.find(x=>x.id===id); const [feel,setFeel]=useState<'easy'|'right'|'hard'|'rough'|''>('');
 if(!w)return <Empty title="Session not found" text="The historical record is still local, but this view no longer has the session reference."/>
 const a=sessionAssessment(w,s.exercises,s.workouts.filter(x=>x.status==='completed'&&x.id!==w.id));
 const saveFeel=()=>{if(!feel)return;const text=`Session feel: ${feel}.`;const already=s.journal.some(j=>j.scope==='workout'&&j.refId===w.id&&j.text===text);if(!already) {const next={id:uid('journal'),date:today(),scope:'workout' as const,refId:w.id,text,tags:['session-feedback']};update(x=>({...x,journal:[...x.journal,next],eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'session_feedback',timestamp:new Date().toISOString(),payload:{workoutId:w.id,feel}}]}));}onNav('home')};
 return <><PageTitle eyebrow="SESSION COMPLETE" title={w.name} sub={`${a.completedSets} completed sets · ${Math.round(a.volume).toLocaleString()} kg·reps · ${a.skipped} skipped`}/>
 <div className="metric-strip"><Metric label="Completion" value={`${Math.round(a.completion*100)}%`} sub={`${a.completedSets}/${a.plannedSets} sets`}/><Metric label="Volume" value={a.volume?Math.round(a.volume).toLocaleString():'—'} sub="kg·reps"/><Metric label="Achievements" value={String(a.achievements.length)} sub="this session"/></div>
 <section className="section"><div className="section-head"><div><span className="eyebrow">SESSION FEEDBACK</span><h2>How did the session feel?</h2><p>One lightweight signal helps APEX interpret performance without pretending to measure physiology.</p></div></div><div className="choice-grid feedback">{[['easy','Too easy'],['right','About right'],['hard','Hard but productive'],['rough','Rough / unusually difficult']].map(([id,label])=><button className={feel===id?'selected':''} key={id} onClick={()=>setFeel(id as any)}><strong>{label}</strong><small>{feel===id?'Selected':'Optional'}</small></button>)}</div></section>
 <section className="section"><div className="list-card">{a.achievements.map((x,i)=><ListRow key={i} title={x.label} sub={x.unit} icon="bolt" click={()=>{}}/>)}{!a.achievements.length&&<Empty title="No new achievement" text="A normal session is still useful evidence."/>}</div></section>
 <section className="section"><div className="callout"><Icon name="bolt"/><div><strong>Next step</strong><p>Keep the current structure unless new evidence supports a meaningful change. APEX adapts future prescription from actual performance, context and your feedback.</p></div></div></section>
 <button className="button primary wide" disabled={!feel} onClick={saveFeel}>{feel?'Save feedback & return home':'Select how it felt'}</button></>}
function Progress({s,onNav}:{s:AppState;onNav:(r:string)=>void}){
 const done=s.workouts.filter(w=>w.status==='completed').sort((a,b)=>(a.completedAt||a.scheduledDate).localeCompare(b.completedAt||b.scheduledDate));
 const [exerciseId,setExerciseId]=useState<string>('');
 const exerciseOptions=useMemo(()=>{const ids=new Set(done.flatMap(w=>w.exercises.map(e=>e.exerciseId)));return s.exercises.filter(e=>ids.has(e.id));},[done,s.exercises]);
 const selected=exerciseOptions.find(e=>e.id===exerciseId)||exerciseOptions[0];
 const history=selected?done.flatMap(w=>w.exercises.filter(e=>e.exerciseId===selected.id).map(e=>({w,e}))).slice(-8):[];
 const total=done.reduce((a,w)=>a+volumeForWorkout(w,s.exercises),0);
 const muscle=useMemo(()=>{const m:Record<string,number>={};done.slice(-8).forEach(w=>w.exercises.forEach(we=>{const e=s.exercises.find(x=>x.id===we.exerciseId);e?.primaryMuscles.forEach(x=>m[x]=(m[x]||0)+we.sets.filter(z=>z.completed&&z.type!=='warmup').length)}));return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,10)},[done,s.exercises]);
 const top=s.achievements.slice(-5).reverse();
 const activeGoals=s.goals.filter(g=>g.status==='active');
 const loadSummary=trainingLoadSummary(s); return <><PageTitle eyebrow="PROGRESS" title="What is changing?" sub="Drill from the whole training record into muscle exposure and individual exercise evidence. APEX separates measured facts from interpretation."/>
 <div className="metric-strip"><Metric label="Sessions" value={String(done.length)} sub="completed"/><Metric label="Volume" value={total?Math.round(total).toLocaleString():'—'} sub="kg·reps"/><Metric label="PRs" value={String(s.achievements.length)} sub="achievements"/></div><section className="section"><div className="section-head"><div><span className="eyebrow">LONGITUDINAL SIGNALS</span><h2>Consistency and trend.</h2></div></div>{(()=>{const c=consistencySummary(s),trend=volumeTrend(s),plateaus=plateauCandidates(s);return <><div className="metric-strip"><Metric label="30-day adherence" value={`${c.rate}%`} sub={`${c.completed}/${c.planned||'—'} scheduled`}/><Metric label="Training streak" value={String(c.streak)} sub="recent sessions"/><Metric label="Trend points" value={String(trend.length)} sub="last 8 sessions"/></div>{trend.length>1&&<div className="trend-list" aria-label="Recent training volume trend">{trend.map((x,i)=><div className="trend-row" key={`${x.date}-${i}`}><span>{x.date}</span><i><b style={{width:`${Math.max(4,Math.min(100,(x.volume/Math.max(...trend.map(t=>t.volume),1))*100))}%`}}/></i><strong>{x.volume.toLocaleString()}</strong></div>)}</div>}{plateaus.length>0&&<div className="callout"><Icon name="clock"/><div><strong>Potential plateau signals</strong><p>{plateaus.map(p=>p.exerciseName).join(', ')}. APEX flags these for review; it does not automatically change the plan.</p></div></div>}</>})()}</section><section className="section"><div className="section-head"><div><span className="eyebrow">TRAINING INTERPRETATION</span><h2>Evidence before conclusions.</h2></div></div>{(()=>{const m=goalMomentum(s),b=trainingBalance(s);return <><div className="metric-strip"><Metric label="Momentum" value={m.direction==='insufficient'?'—':m.direction==='up'?'↑':m.direction==='down'?'↓':'→'} sub={m.direction==='insufficient'?'more data needed':`${m.changePct>=0?'+':''}${m.changePct}% volume`}/><Metric label="Highest exposure" value={b.highest?String(b.highest[1]):'—'} sub={b.highest?b.highest[0]:'working sets'}/><Metric label="Exposure spread" value={b.spread?String(b.spread):'—'} sub="sets between highest / lowest"/></div><p className="muted load-note">{m.detail}{b.highest&&b.lowest?` Highest recent primary-muscle exposure: ${b.highest[0]} (${b.highest[1]} sets); lowest: ${b.lowest[0]} (${b.lowest[1]}). This is exposure context, not a diagnosis.`:''}</p></>})()}</section><section className="section"><div className="section-head"><div><span className="eyebrow">TRAINING LOAD</span><h2>Recent workload context.</h2></div></div><div className="metric-strip"><Metric label="30-day sessions" value={String(loadSummary.consistency30)} sub="completed"/><Metric label="Working sets" value={String(loadSummary.workingSets30)} sub="last 30 days"/><Metric label="4-session avg" value={loadSummary.recentAverageVolume?Math.round(loadSummary.recentAverageVolume).toLocaleString():'—'} sub="kg·reps"/></div>{loadSummary.priorAverageVolume>0&&<p className="muted load-note">Recent 4-session average volume is {Math.round(loadSummary.recentAverageVolume).toLocaleString()} kg·reps versus {Math.round(loadSummary.priorAverageVolume).toLocaleString()} previously. This is context, not a readiness score.</p>}</section>
 {activeGoals.length>0&&<section className="section"><div className="section-head"><div><span className="eyebrow">GOAL TRACKING</span><h2>Progress toward what you chose.</h2></div></div><div className="goal-stack">{activeGoals.map(g=>{const gp=goalProgress(s,g),ms=goalMilestones(s,g);return <article className="goal-card" key={g.id}><div className="goal-ring">{gp.percent===null?'—':`${gp.percent}%`}</div><div><span className="eyebrow">{g.kind.replace('_',' ')}</span><h3>{g.title}</h3><p>{g.target?`${g.target.label}: ${g.target.value} ${g.target.unit}`:'No numeric target yet.'}{g.targetDate?` · by ${g.targetDate}`:''}</p>{gp.percent!==null&&<div className="progress-track"><i style={{width:`${gp.percent}%`}}/></div>} {ms.length>0&&<div className="milestones">{ms.map(m=><span className={m.reached?'reached':''} key={m.threshold}>{m.reached?'✓':'○'} {m.threshold}%</span>)}</div>}</div></article>})}</div></section>}
 <section className="section"><div className="section-head"><div><span className="eyebrow">EXERCISE TREND</span><h2>Performance, not vanity metrics.</h2></div></div>{selected?<><label>Exercise<select value={selected.id} onChange={e=>setExerciseId(e.target.value)}>{exerciseOptions.map(e=><option value={e.id} key={e.id}>{e.name}</option>)}</select></label><div className="history-list">{history.map(({w,e})=>{const doneSets=e.sets.filter(x=>x.completed&&x.type!=='warmup');const best=Math.max(0,...doneSets.map(x=>x.weight||x.assistance||0));const reps=Math.max(0,...doneSets.map(x=>x.reps||0));return <div className="history-item static" key={w.id}><div><span className="eyebrow">{w.scheduledDate}</span><strong>{best?formatLoad(selected,best):'Bodyweight / time'}</strong><small>{doneSets.length} working sets · best {reps||'—'} reps{doneSets.some(x=>x.rir!==undefined)?` · RIR ${((doneSets.map(x=>x.rir).filter((x):x is number=>x!==undefined).reduce((a,b)=>a+b,0))/(doneSets.filter(x=>x.rir!==undefined).length||1)).toFixed(1)}`:''}</small></div></div>})}</div></>:<Empty title="Complete an exercise first" text="Exercise-level trends appear after APEX has comparable performance evidence."/>}</section>
 <section className="section"><div className="section-head"><div><span className="eyebrow">MUSCLE EXPOSURE</span><h2>Recent working sets.</h2></div></div><div className="bars">{muscle.map(([m,v])=><div className="bar-row" key={m}><span>{m}</span><i><b style={{width:`${Math.min(100,v*8)}%`}}/></i><strong>{v}</strong></div>)}{!muscle.length&&<Empty title="No performance data yet" text="Complete a workout and APEX will build the evidence layer."/>}</div></section>
 <section className="section"><div className="list-card">{top.map((a,i)=><ListRow key={i} title={a.label} sub={`${a.timestamp.slice(0,10)} · ${a.unit}`} icon="bolt" click={()=>{}}/>)}{!top.length&&<Empty title="Achievements will appear here" text="PRs are contextual to exercise and set type."/>}<ListRow title="History" sub="Timeline and filters" icon="history" click={()=>onNav('history')}/><ListRow title="Goals" sub="Targets and milestones" icon="target" click={()=>onNav('goals')}/></div></section></>}
function History({s,onNav}:{s:AppState;onNav:(r:string)=>void}){const [q,setQ]=useState(''),[status,setStatus]=useState('all');const rows=s.workouts.filter(w=>w.status!=='planned'&&(status==='all'||w.status===status)&&(`${w.name} ${w.scheduledDate} ${w.source}`).toLowerCase().includes(q.toLowerCase())).slice().reverse();return <><PageTitle eyebrow="HISTORY" title="Your training timeline." sub="Performed, skipped, missed, rescheduled and extra work remain distinguishable."/><div className="search"><Icon name="search"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search workout, date…"/></div><div className="chip-row">{['all','completed','skipped','missed','rescheduled','extra'].map(x=><button className={`chip ${status===x?'selected-chip':''}`} key={x} onClick={()=>setStatus(x)}>{x}</button>)}</div><div className="history-list">{rows.map(w=><button className="history-item" key={w.id} onClick={()=>w.status==='completed'&&onNav('session:'+w.id)}><div><span className="eyebrow">{w.scheduledDate} · {w.status} · {w.source}</span><strong>{w.name}</strong><small>{w.exercises.length} exercises · {w.exercises.reduce((a,e)=>a+e.sets.filter(x=>x.completed).length,0)} completed sets · {Math.round(volumeForWorkout(w,s.exercises)).toLocaleString()} kg·reps</small></div><Icon name="chev"/></button>)}{!rows.length&&<Empty title="Nothing to show" text="Your timeline will populate as training happens."/>}</div></>}
function Goals({s,update}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void}){
 const [open,setOpen]=useState(false),[title,setTitle]=useState(''),[kind,setKind]=useState<GoalKind>('strength'),[label,setLabel]=useState('Target'),[value,setValue]=useState(''),[unit,setUnit]=useState('kg'),[targetDate,setTargetDate]=useState('');
 const add=()=>{if(!title.trim())return;const target=value.trim()?{label:label.trim()||'Target',value:Number(value),unit}:undefined;update(x=>({...x,goals:[...x.goals,{id:uid('goal'),kind,title:title.trim(),priority:x.goals.length+1,periodId:uid('period'),status:'active',target,targetDate:targetDate||undefined}]}));setTitle('');setValue('');setTargetDate('');setOpen(false)};
 return <><PageTitle eyebrow="GOALS" title="Give training a direction." sub="Multiple objectives can coexist. Targets are explicit and historical training is never rewritten."/>
 <div className="goal-stack">{s.goals.map(g=>{const gp=goalProgress(s,g),ms=goalMilestones(s,g);return <div className="goal-card" key={g.id}><div className="goal-ring">{gp.percent===null?g.priority:`${gp.percent}%`}</div><div><span className="eyebrow">{g.kind.replace('_',' ')}</span><h3>{g.title}</h3><p>{g.target?`${g.target.label}: ${g.target.value} ${g.target.unit}`:'No numeric target yet.'}{g.targetDate?` · by ${g.targetDate}`:''}</p>{gp.percent!==null&&<div className="progress-track"><i style={{width:`${gp.percent}%`}}/></div>}{ms.length>0&&<div className="milestones">{ms.map(m=><span className={m.reached?'reached':''} key={m.threshold}>{m.reached?'✓':'○'} {m.threshold}%</span>)}</div>}{gp.status==='achieved'&&<small className="achievement-note">Target evidence reached. Review the next phase rather than silently changing the goal.</small>}</div></div>})}</div>
 {open&&<section className="plan-editor"><div className="form-grid"><label>Goal title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Improve pull-up strength"/></label><label>Type<select value={kind} onChange={e=>setKind(e.target.value as GoalKind)}>{['strength','hypertrophy','fat_loss','fitness','general'].map(x=><option key={x}>{x}</option>)}</select></label><label>Target label<input value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. Bench press"/></label><label>Target value<input inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} placeholder="Optional"/></label><label>Unit<select value={unit} onChange={e=>setUnit(e.target.value)}>{['kg','reps','sessions','minutes','cm','%'].map(x=><option key={x}>{x}</option>)}</select></label><label>Target date<input type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)}/></label></div><button className="button primary" onClick={add}>Create goal</button></section>}
 <button className="button secondary" onClick={()=>setOpen(!open)}><Icon name="plus"/> {open?'Close':'Add goal'}</button></>}
function PlanStudio({s,update,onStart}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void;onStart:(w:Workout)=>void}){const [selected,setSelected]=useState<string|null>(null),[q,setQ]=useState('');const plan=s.plan,day=plan?.days.find(d=>d.id===selected),workout=day?.workoutId?s.workouts.find(w=>w.id===day.workoutId):day?s.workouts.find(w=>w.planId===plan?.id&&w.name===day.label&&w.status!=='completed'&&w.status!=='missed'&&w.status!=='skipped'):undefined;const results=s.exercises.filter(e=>!q||`${e.name} ${e.aliases.join(' ')} ${e.pattern} ${e.primaryMuscles.join(' ')}`.toLowerCase().includes(q.toLowerCase())).slice(0,18);const edit=(fn:(w:Workout)=>Workout,reason:string)=>{if(!workout||!plan)return;update(x=>{const p=x.plan!;const nextW=fn(x.workouts.find(w=>w.id===workout.id)!);const nextPlan=planWithDays(p,p.days);nextW.currentPlanVersion=nextPlan.version;return{...x,workouts:x.workouts.map(w=>w.id===nextW.id?nextW:w),plan:nextPlan,eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'plan_edit',timestamp:new Date().toISOString(),payload:{reason}}]}})};const add=(id:string)=>edit(w=>({...w,version:w.version+1,updatedAt:new Date().toISOString(),exercises:[...w.exercises,{exerciseId:id,sets:Array.from({length:2},()=>makeSet('working',s.exercises.find(e=>e.id===id)!)),prescribedSets:2,repRange:s.exercises.find(e=>e.id===id)!.repRange,restSec:s.exercises.find(e=>e.id===id)!.restSec,order:w.exercises.length}]}),'add exercise');const remove=(id:string)=>edit(w=>({...w,version:w.version+1,updatedAt:new Date().toISOString(),exercises:w.exercises.filter(e=>e.exerciseId!==id).map((e,i)=>({...e,order:i}))}),'remove exercise');return <><PageTitle eyebrow="PLAN STUDIO" title="Shape the structure." sub="Future structure is editable. Historical sessions remain immutable."/><div className="plan-panel"><div className="plan-header"><div><span className="eyebrow">ACTIVE PLAN</span><h2>{plan?.name||'No plan'}</h2><small className="muted">{plan?.mode==='continuous'?'Continuous training':`${plan?.weeks||'—'} week horizon`}</small></div><span className="version">v{plan?.version||1}</span></div>{plan?.days.map((d,i)=>{const w=d.workoutId?s.workouts.find(x=>x.id===d.workoutId):!d.rest?s.workouts.find(x=>x.planId===plan?.id&&x.name===d.label&&x.status!=='completed'&&x.status!=='missed'&&x.status!=='skipped'):undefined;return <button className={`day-card ${selected===d.id?'selected-day':''}`} key={d.id} onClick={()=>setSelected(selected===d.id?null:d.id)}><span className="day-no">{String(i+1).padStart(2,'0')}</span><span><strong>{d.label}</strong><small>{d.rest?'Recovery / rest':`${w?.exercises.length||0} exercises · ${w?.scheduledDate||''}`}</small></span>{w&&<span className="mini-btn" onClick={e=>{e.stopPropagation();onStart(w)}}><Icon name="play" size={15}/></span>}</button>})}</div>{day&&workout&&<section className="plan-editor"><div className="section-head"><div><span className="eyebrow">EDITING {day.label}</span><h2>{workout.name}</h2></div><button className="button ghost" onClick={()=>setSelected(null)}>Done</button></div><div className="editor-exercises">{workout.exercises.map((we,i)=>{const e=s.exercises.find(x=>x.id===we.exerciseId)!;return <div className="editor-exercise" key={`${we.exerciseId}-${i}`}><span className="day-no">{String(i+1).padStart(2,'0')}</span><div><strong>{e.name}</strong><small>{we.prescribedSets} sets · {we.repRange[0]}–{we.repRange[1]}</small></div><button className="mini-btn" onClick={()=>remove(e.id)}>Remove</button></div>})}</div><div className="search"><Icon name="search"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Add exercise…"/></div><div className="picker-list">{results.map(e=><button className="picker-row" key={e.id} onClick={()=>add(e.id)}><span><strong>{e.name}</strong><small>{e.pattern} · {e.primaryMuscles.join(' · ')}</small></span><Icon name="plus"/></button>)}</div></section>}<div className="callout"><Icon name="bolt"/><div><strong>Version-aware plan</strong><p>Every structural edit creates a new plan version. A completed workout never gets rewritten.</p></div></div></>}
function Library({s,query,setQuery,onExercise}:{s:AppState;query:string;setQuery:(x:string)=>void;onExercise:(id:string)=>void}){
 const [equipmentOnly,setEquipmentOnly]=useState(false);
 const available=s.profile?.equipment||[];
 const filtered=findExercises(query).filter(e=>s.exercises.some(x=>x.id===e.id)).filter(e=>!equipmentOnly||equipmentFit(e,available)!=='unavailable');
 const equipmentLabel=available.length?`${available.length} equipment types available`:'Equipment not set'; const report=knowledgeReport(s);
 return <><PageTitle eyebrow="EXERCISE LIBRARY" title="Find a movement." sub="Canonical identity, aliases, equipment, load semantics and alternatives."/>
 <div className="search"><Icon name="search"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Chest press, row, squat…"/></div>
 <div className="chip-row">{['','horizontal_push','horizontal_pull','vertical_pull','squat','hinge','core','arm_flexion'].map(x=><button className="chip" key={x||'all'} onClick={()=>setQuery(x)}>{x?x.replace('_',' '):'all'}</button>)}</div>
 <div className="library-toolbar"><span className="muted">{filtered.length} movements · {equipmentLabel}</span><span className="muted">Knowledge {report.healthy?'validated':`${report.errors} issues`}</span><label className="toggle-row compact-toggle"><span>Available equipment first</span><input type="checkbox" checked={equipmentOnly} onChange={e=>setEquipmentOnly(e.target.checked)}/></label></div>
 <div className="library-grid">{filtered.map(e=>{const fit=equipmentFit(e,available);return <button className="exercise-tile" key={e.id} onClick={()=>onExercise(e.id)}><span className="tile-tag">{e.loadSemantics.replace('_',' ')}</span><strong>{e.name}</strong><small>{e.primaryMuscles.join(' · ')}</small><span>{e.repRange[0]}–{e.repRange[1]} · {e.equipment.join(', ')}</span>{available.length>0&&<em className={`fit-${fit}`}>{fit==='available'?'Available':fit==='unknown'?'Check equipment':'Not in setup'}</em>}</button>})}</div></>
}
function ExerciseSheet({ex,s,close,onUse,onAlternative}:{ex:Exercise;s:AppState;close:()=>void;onUse:()=>void;onAlternative:(id:string)=>void}){
 const alts=smartAlternatives(ex,s.exercises,s.profile?.equipment);
 return <Modal title={ex.name} close={close}><div className="detail-meta"><span>{ex.family}</span><span>{ex.primaryMuscles.join(' · ')}</span><span>{formatLoad(ex,undefined)}</span></div>
 <Detail title="EQUIPMENT"><p>{ex.equipment.length?ex.equipment.join(' · '):'No dedicated equipment required.'}</p></Detail>
 <Detail title="SETUP"><ul>{ex.setup.map(x=><li key={x}>{x}</li>)}</ul></Detail><Detail title="EXECUTION"><ol>{ex.steps.map(x=><li key={x}>{x}</li>)}</ol></Detail><Detail title="BREATHING & TEMPO"><p>{ex.breathing}{ex.tempo?` Tempo: ${ex.tempo}.`:''}</p></Detail><Detail title="CUES"><div className="tag-list">{ex.cues.map(x=><span key={x}>{x}</span>)}</div></Detail><Detail title="COMMON MISTAKES"><ul>{ex.mistakes.map(x=><li key={x}>{x}</li>)}</ul></Detail><Detail title="SAFETY"><ul>{ex.safety.map(x=><li key={x}>{x}</li>)}</ul></Detail>
 <Detail title="ALTERNATIVES"><div className="alt-list">{alts.map(({exercise,fit,samePattern,sameLoad})=><button key={exercise.id} onClick={()=>onAlternative(exercise.id)}><span><strong>{exercise.name}</strong><small>{fit==='available'?'Available equipment':fit==='unknown'?'Equipment not confirmed':'Not in current setup'}{samePattern?' · same pattern':''}{sameLoad?' · same load semantics':''}</small></span><Icon name="chev"/></button>)}</div></Detail>
 <button className="button primary wide" onClick={onUse}>Use in training</button></Modal>
}
function Templates({s,update,onStart}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void;onStart:(w:Workout)=>void}){const [name,setName]=useState('');const [selected,setSelected]=useState<string[]>([]);const toggle=(id:string)=>setSelected(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id]);const save=()=>{if(!name.trim()||!selected.length)return;const t:WorkoutTemplate={id:uid('tpl'),name:name.trim(),exerciseIds:selected,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};update(x=>({...x,workoutTemplates:[...(x.workoutTemplates||[]),t]}));setName('');setSelected([])};const useT=(t:WorkoutTemplate)=>{const w=cloneTemplateWorkout(t,today(),s.exercises);update(x=>({...x,workouts:[...x.workouts,w],eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'template_used',timestamp:new Date().toISOString(),payload:{templateId:t.id,workoutId:w.id}}]}));onStart(w)};const remove=(id:string)=>update(x=>({...x,workoutTemplates:(x.workoutTemplates||[]).filter(t=>t.id!==id)}));return <><PageTitle eyebrow="TEMPLATES" title="Save the work you repeat." sub="Templates are reusable structures. Completed workouts remain separate historical events."/><section className="plan-editor"><label>Template name<input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Quick upper"/></label><div className="picker-list">{s.exercises.slice(0,35).map(e=><button className="picker-row" key={e.id} onClick={()=>toggle(e.id)}><span><strong>{e.name}</strong><small>{selected.includes(e.id)?'Included':'Tap to include'} · {e.pattern}</small></span>{selected.includes(e.id)?<Icon name="check"/>:<Icon name="plus"/>}</button>)}</div><button className="button primary wide" disabled={!name.trim()||!selected.length} onClick={save}>Save template</button></section><section className="section"><div className="list-card">{(s.workoutTemplates||[]).map(t=><div className="template-row" key={t.id}><ListRow title={t.name} sub={`${t.exerciseIds.length} exercises`} icon="train" click={()=>useT(t)}/><button className="mini-btn danger" onClick={()=>remove(t.id)}>Delete</button></div>)}</div></section></>}
function Coach({s}:{s:AppState}){const [q,setQ]=useState(''),[messages,setMessages]=useState([{from:'apex',text:'Ask about your local training evidence. I explain what APEX knows, what it infers, and where uncertainty remains.'}]);const ask=()=>{const t=q.trim();if(!t)return;const a=groundedCoachAnswer(s,t);const text=[a.text,a.facts.length?`Facts: ${a.facts.join(' • ')}`:'',a.inference?`Inference: ${a.inference}`:'',a.recommendation?`Recommendation: ${a.recommendation}`:'',a.uncertainty?`Uncertainty: ${a.uncertainty}`:''].filter(Boolean).join('\n');setMessages(m=>[...m,{from:'user',text:t},{from:'apex',text}]);setQ('')};return <><PageTitle eyebrow="APEX COACH" title="Understand the work." sub="The deterministic training engine stays in control. Coach explains grounded local evidence without pretending to know more than the record supports."/><div className="coach-box"><div className="messages">{messages.map((m,i)=><div className={`message ${m.from}`} key={i} style={{whiteSpace:'pre-wrap'}}>{m.text}</div>)}</div><div className="coach-input"><input aria-label="Ask APEX Coach" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask()} placeholder="Ask about your training…"/><button aria-label="Ask APEX Coach" onClick={ask}><Icon name="bolt"/></button></div></div></>}
function Learn(){const terms=[['RIR','Reps in reserve: an estimate of how many clean reps you could still perform.'],['RPE','Rate of perceived exertion: a subjective effort description.'],['PR','Personal record: a meaningful achievement appropriate to the movement and set type.'],['ROM','Range of motion: the distance through which a movement travels.'],['AMRAP','As many appropriate reps as the set context allows.'],['Tempo','The cadence of a repetition, such as 2–1–2.'],['Volume','The amount of training work; the exact measure depends on the exercise.'],['Progressive overload','Gradually increasing a useful training stimulus over time.'],['Deload','A reduction in training stress when context supports recovery.']];return <><PageTitle eyebrow="LEARN" title="Know what the numbers mean." sub="Tap concepts when you need them. APEX introduces complexity progressively."/><div className="term-list">{terms.map(([a,b])=><div className="term" key={a}><strong>{a}</strong><p>{b}</p></div>)}</div></>}
function Measurements({s,update}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void}){
 const fields=['neck','shoulders','chest','waist','abdomen','hips','arms','forearms','thighs','calves'];
 const latest=s.measurements.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
 const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(fields.map(k=>[k,latest?.values?.[k]?.toString()||''])));
 const [weight,setWeight]=useState(latest?.weightKg?.toString()||s.profile?.body.weightKg?.toString()||'');
 const save=()=>{const vals=Object.fromEntries(fields.filter(k=>values[k].trim()!==''&&Number.isFinite(Number(values[k]))).map(k=>[k,Number(values[k])]));const entry:Measurement={id:uid('measurement'),date:today(),weightKg:weight&&Number.isFinite(Number(weight))?Number(weight):undefined,values:vals};update(x=>({...x,measurements:[...x.measurements,entry],profile:x.profile?{...x.profile,body:{...x.profile.body,weightKg:weight?Number(weight):x.profile.body.weightKg}}:x.profile,eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'measurement_logged',timestamp:new Date().toISOString(),payload:{fields:Object.keys(vals)}}]}))};
 return <><PageTitle eyebrow="BODY DATA" title="Measure what matters." sub="Optional measurements add context to progress. APEX stores the numbers; it does not make medical or body-composition claims."/>
 <section className="plan-editor"><div className="form-grid"><label>Weight (kg)<input inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="Optional"/></label>{fields.map(k=><label key={k}>{k[0].toUpperCase()+k.slice(1)} (cm)<input inputMode="decimal" value={values[k]} onChange={e=>setValues(v=>({...v,[k]:e.target.value}))} placeholder="Optional"/></label>)}</div><button className="button primary wide" onClick={save}>Save today's measurements</button></section>
 <section className="section"><div className="section-head"><div><span className="eyebrow">MEASUREMENT HISTORY</span><h2>Longitudinal context.</h2></div></div><div className="history-list">{s.measurements.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map(m=><div className="history-item static" key={m.id}><div><span className="eyebrow">{m.date}</span><strong>{m.weightKg!==undefined?`${m.weightKg} kg`:'No weight logged'}</strong><small>{Object.entries(m.values).map(([k,v])=>`${k} ${v} cm`).join(' · ')||'No circumference measurements'}</small></div></div>)}{!s.measurements.length&&<Empty title="No measurements yet" text="Body data is optional. Add a dated snapshot whenever it is useful to you."/>}</div></section>
 <div className="callout"><Icon name="bolt"/><div><strong>Context, not judgment</strong><p>APEX can compare these measurements with your own historical training record, but it will not infer health conditions or promise a body-composition outcome.</p></div></div></>}
function You({s,nav,update}:{s:AppState;nav:(r:string)=>void;update:(f:(x:AppState)=>AppState)=>void}){
 const notificationPreview=notificationIntents(s);
 const [editing,setEditing]=useState(false),[name,setName]=useState(s.profile?.name||''),[pass,setPass]=useState(''),[recovery,setRecovery]=useState(''),[backupBusy,setBackupBusy]=useState(false),[backupMsg,setBackupMsg]=useState('');
 const download=(text:string,filename:string,type='application/json')=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
 const makeBackup=async()=>{setBackupMsg('');if(!pass||pass.length<8){setBackupMsg('Enter a passphrase of at least 8 characters.');return}setBackupBusy(true);try{const key=recovery||recoveryKey();const encrypted=await encryptBackup(repository.exportJson(s),pass,key);download(encrypted,`apex-backup-${today()}.apex`);if(!recovery)setRecovery(key);setBackupMsg(recovery?'Encrypted backup created.':'Backup created. Save the recovery key shown below somewhere safe.');}catch(e){setBackupMsg(e instanceof Error?e.message:'Backup failed.')}finally{setBackupBusy(false)}};
 const importBackup=()=>{const input=document.createElement('input');input.type='file';input.accept='.apex,.json';input.onchange=()=>{const file=input.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{setBackupMsg('');setBackupBusy(true);try{const secret=pass||recovery;if(!secret)throw new Error('Enter the backup passphrase or recovery key first.');const plain=await decryptBackup(String(reader.result),secret);const restored=repository.importJson(plain);update(()=>restored);setBackupMsg('Backup restored. APEX will now use the restored local state.');}catch(e){setBackupMsg(e instanceof Error?e.message:'Restore failed.')}finally{setBackupBusy(false)}};reader.readAsText(file)};input.click()};
 return <><PageTitle eyebrow="YOU" title={s.profile?.name||'Your training identity'} sub="Control the context APEX uses. Your data remains yours and can travel with you."/>
 <div className="profile-card"><img src="/brand/apex-symbol-light.png"/><div><strong>{s.profile?.name||'Private local profile'}</strong><small>{s.profile?.experience||'not set'} · {s.profile?.trainingDays||'—'} days/week · {s.profile?.sessionMinutes||'—'} min</small></div></div>
 {editing&&<section className="plan-editor"><label>Name<input value={name} onChange={e=>setName(e.target.value)}/></label><button className="button primary" onClick={()=>{update(x=>({...x,profile:x.profile?{...x.profile,name:name.trim()}:x.profile}));setEditing(false)}}>Save profile</button></section>}
 <section className="plan-editor"><div className="section-head"><div><span className="eyebrow">DATA CONTROL</span><h2>Private by default.</h2></div></div><p className="muted">Core APEX data is stored locally. On Android, SQLite is the native persistence source with a browser fallback. Encrypted backups can be moved manually without an account.</p><label>Backup passphrase<input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="8+ characters" autoComplete="new-password"/></label><div className="button-row"><button className="button primary" onClick={makeBackup} disabled={backupBusy}>{backupBusy?'Working…':'Create encrypted backup'}</button><button className="button ghost" onClick={importBackup} disabled={backupBusy}>Restore backup</button></div>{recovery&&<div className="recovery-box"><span className="eyebrow">RECOVERY KEY — SAVE THIS</span><strong>{recovery}</strong><small>Use this key instead of the passphrase if you need to unlock this backup. APEX cannot reconstruct a lost recovery key.</small><button className="mini-btn" onClick={()=>navigator.clipboard?.writeText(recovery)}>Copy key</button></div>}{backupMsg&&<div className="callout"><Icon name="bolt"/><div><strong>Backup status</strong><p>{backupMsg}</p></div></div>}</section>
 <section className="plan-editor"><div className="section-head"><div><span className="eyebrow">NOTIFICATIONS</span><h2>Useful, never noisy.</h2></div></div><p className="muted">APEX only prepares action-oriented reminders. You can disable any category without affecting training data.</p><label className="toggle-row"><span>Notifications enabled</span><input type="checkbox" checked={s.preferences.notifications.enabled} onChange={e=>update(x=>({...x,preferences:{...x.preferences,notifications:{...x.preferences.notifications,enabled:e.target.checked}}}))}/></label><label className="toggle-row"><span>Workout reminders</span><input type="checkbox" checked={s.preferences.notifications.workoutReminders} onChange={e=>update(x=>({...x,preferences:{...x.preferences,notifications:{...x.preferences.notifications,workoutReminders:e.target.checked}}}))}/></label><label className="toggle-row"><span>Missed workout follow-up</span><input type="checkbox" checked={s.preferences.notifications.missedWorkout} onChange={e=>update(x=>({...x,preferences:{...x.preferences,notifications:{...x.preferences.notifications,missedWorkout:e.target.checked}}}))}/></label><label className="toggle-row"><span>Weekly review</span><input type="checkbox" checked={s.preferences.notifications.weeklyReview} onChange={e=>update(x=>({...x,preferences:{...x.preferences,notifications:{...x.preferences.notifications,weeklyReview:e.target.checked}}}))}/></label></section>
 <section className="plan-editor"><div className="section-head"><div><span className="eyebrow">NOTIFICATION PLAN</span><h2>Prepared from your context.</h2></div></div><p className="muted">These are deterministic notification intents. Native scheduling and delivery stays behind the platform adapter, so training logic never depends on a notification service.</p><div className="notification-preview">{notificationPreview.map(n=><div className="history-item static" key={n.id}><div><span className="eyebrow">{n.kind}</span><strong>{n.title}</strong><small>{n.body}</small></div></div>)}{!notificationPreview.length&&<Empty title="No reminder needed" text="APEX will not create a notification unless your enabled rules and current training context call for one."/>}</div></section>
 <section className="plan-editor"><div className="section-head"><div><span className="eyebrow">ACCESSIBILITY & FEEDBACK</span><h2>Make APEX comfortable to use.</h2></div></div><label className="toggle-row"><span>Reduce motion</span><input type="checkbox" checked={s.preferences.reducedMotion} onChange={e=>update(x=>({...x,preferences:{...x.preferences,reducedMotion:e.target.checked}}))}/></label><label className="toggle-row"><span>High contrast</span><input type="checkbox" checked={s.preferences.highContrast} onChange={e=>update(x=>({...x,preferences:{...x.preferences,highContrast:e.target.checked}}))}/></label><label className="toggle-row"><span>Text size</span><select value={s.preferences.fontScale} onChange={e=>update(x=>({...x,preferences:{...x.preferences,fontScale:e.target.value as AppState["preferences"]["fontScale"]}}))}><option value="system">System</option><option value="large">Large</option><option value="larger">Larger</option></select></label><label className="toggle-row"><span>Haptics</span><input type="checkbox" checked={s.preferences.haptics} onChange={e=>update(x=>({...x,preferences:{...x.preferences,haptics:e.target.checked}}))}/></label><label className="toggle-row"><span>Workout sounds</span><input type="checkbox" checked={s.preferences.sounds} onChange={e=>update(x=>({...x,preferences:{...x.preferences,sounds:e.target.checked}}))}/></label><p className="muted">Android system font scaling and screen-reader semantics are respected where the platform provides them.</p></section>
 {(()=>{const k=knowledgeReport(s), issues=inspectState(s), errors=issues.filter(x=>x.severity==='error').length, warnings=issues.filter(x=>x.severity==='warning').length;return <section className="section"><div className="section-head"><div><span className="eyebrow">SYSTEM HEALTH</span><h2>Trust the record.</h2></div></div><div className="metric-strip"><Metric label="Canonical exercises" value={String(k.exerciseCount)} sub={k.errors===0?'knowledge valid':`${k.errors} errors`}/><Metric label="State errors" value={String(errors)} sub={warnings?`${warnings} warnings`:'no warnings'}/><Metric label="Stored events" value={String(s.eventLog?.length||0)} sub="local audit trail"/></div>{(k.warnings>0||warnings>0)&&<div className="callout"><Icon name="settings"/><div><strong>Review recommended</strong><p>{k.warnings+warnings} non-blocking integrity or knowledge warnings are present. APEX keeps them visible instead of silently rewriting your history.</p></div></div>}{errors===0&&k.errors===0&&<p className="muted load-note">No blocking data-integrity or canonical-knowledge errors detected in the current local state.</p>}</section>})()}
 <div className="list-card"><ListRow title="Goals"  sub={`${s.goals.length} active/history goals`} icon="target" click={()=>nav('goals')}/><ListRow title="Body measurements" sub={`${s.measurements.length} logged entries`} icon="chart" click={()=>nav('measurements')}/><ListRow title="Plan Studio" sub="Structure and future sessions" icon="target" click={()=>nav('plan')}/><ListRow title="Exercise Library" sub={`${s.exercises.length} canonical movements`} icon="search" click={()=>nav('library')}/><ListRow title="Templates" sub={`${s.workoutTemplates?.length||0} saved templates`} icon="train" click={()=>nav('templates')}/><ListRow title="Coach" sub="Explain local evidence" icon="bolt" click={()=>nav('coach')}/><ListRow title="Learn" sub="Glossary and training concepts" icon="chart" click={()=>nav('learn')}/><ListRow title="Edit profile" sub="Change your name or training context" icon="user" click={()=>setEditing(!editing)}/><ListRow title="Reset personal intelligence" sub={`${s.observations.length} observations · raw history preserved`} icon="settings" click={()=>update(x=>({...x,observations:[]}))}/><ListRow title="Reset app data" sub="Delete local APEX state" icon="settings" click={()=>{if(confirm('Delete all local APEX data? This cannot be undone without a backup.')){repository.reset();location.reload()}}}/></div></>}
function Command({nav,setQuery,close}:{nav:(r:string)=>void;setQuery:(x:string)=>void;close:()=>void}){const [q,setQ]=useState('');const run=(raw=q)=>{const x=raw.toLowerCase();if(x.includes('progress'))nav('progress');else if(x.includes('history')||x.includes('last workout'))nav('history');else if(x.includes('goal'))nav('goals');else if(x.includes('measurement')||x.includes('body data'))nav('measurements');else if(x.includes('plan'))nav('plan');else if(x.includes('coach')||x.includes('why'))nav('coach');else if(x.includes('template'))nav('templates');else if(x.includes('learn')||x.includes('rir'))nav('learn');else if(x.includes('exercise')||x.includes('squat')||x.includes('press')||x.includes('row')){setQuery(raw);nav('library')}else nav('home');close()};return <Modal title="Command Center" close={close}><div className="command-box"><Icon name="search"/><input autoFocus value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&run()} placeholder="Find, explain, navigate…"/><button onClick={()=>run()}>Go</button></div><div className="suggestions">{['Show my progress','Find chest press exercises','Open my plan','Explain RIR','Open templates'].map(x=><button key={x} onClick={()=>run(x)}>{x}<Icon name="chev"/></button>)}</div></Modal>}
function Detail({title,children}:{title:string;children:React.ReactNode}){return <div className="detail"><span className="eyebrow">{title}</span>{children}</div>}
function Metric({label,value,sub}:{label:string;value:string;sub:string}){return <div className="metric"><small>{label}</small><strong>{value}</strong><small>{sub}</small></div>}
function ListRow({title,sub,icon,click}:{title:string;sub:string;icon:string;click:()=>void}){return <button className="list-row" onClick={click}><span className="row-icon"><Icon name={icon}/></span><span><strong>{title}</strong><small>{sub}</small></span><Icon name="chev"/></button>}
function NavItem({active,icon,label,click}:{active:boolean;icon:string;label:string;click:()=>void}){return <button className={`nav-item ${active?'active':''}`} onClick={click}><Icon name={icon}/><span>{label}</span></button>}
function PageTitle({eyebrow,title,sub}:{eyebrow:string;title:string;sub:string}){return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{sub}</p></div>}
function Empty({title,text}:{title:string;text:string}){return <div className="empty"><Icon name="bolt"/><strong>{title}</strong><p>{text}</p></div>}
function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){return <div className="modal-backdrop" onMouseDown={e=>e.currentTarget===e.target&&close()}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="apex-modal-title"><div className="modal-head"><h2 id="apex-modal-title">{title}</h2><button className="icon-btn" aria-label="Close dialog" onClick={close}>×</button></div>{children}</div></div>}
createRoot(document.getElementById('root')!).render(<App/>);
