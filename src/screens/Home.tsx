import {imageKindForExercise} from '../imagery';
import type {AppState,Workout} from '../core/types';
import {todayLocal,addDaysLocal,workoutDay,dayOfTimestamp} from '../data/dates';
import {recoveryStatus,startDeload} from '../engine/deload';
import {coachBriefing} from '../coach/briefing';
import {volumeForWorkout} from '../engine/training';
import {homeInsights,readiness,goalProgress} from '../engine/intelligence';
import {coach,coachEvidenceFromState} from '../coach';
import {consistencySummary} from '../engine/analytics';
import {wt,vol,weightLabel,displayText} from '../data/units';
import {today,niceName} from '../ui/shared';
import {Icon,ApexImage,ApexRidge,SegTabs,ApexStat,ApexRing,Empty} from '../ui/primitives';



import {nutritionDay} from './Nutrition';

export function Today({s,onNav,onStart}:{s:AppState;onNav:(r:string)=>void;onStart:(w:Workout)=>void}){
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
/* Fatigue / deload status (src/engine/fatigue.ts). Starting a deload is the athlete's explicit action and goes through startDeload(); the Coach only reads the status. */
function DeloadCard({s,update}:{s:AppState;update:(fn:(x:AppState)=>AppState)=>void}){
 const rs=recoveryStatus(s,today());
 if(!rs||!['deload_recommended','deload_active','recovery_complete'].includes(rs.status))return null;
 const text=rs.status==='deload_recommended'
  ?'Your recent training shows sustained high load. A deload week is recommended: lighter loads, one fewer set per exercise and a higher target RIR. This is a training-load rule, not a medical assessment.'
  :rs.status==='deload_active'
   ?`Deload week in progress, ${rs.daysLeft} day${rs.daysLeft===1?'':'s'} left. Loads are lighter, with one fewer set and a higher target RIR.`
   :`Deload complete. Loads stay at your last worked weight for ${rs.daysLeft} more day${rs.daysLeft===1?'':'s'} before progression resumes.`;
 return <article className="a3-card a3-stack" aria-label="Deload status">
  <span className="a3-eyebrow a3-gold">{rs.status==='deload_recommended'?'Deload recommended':rs.status==='deload_active'?'Deload week':'Recovery'}</span>
  <p>{text}</p>
  {rs.status==='deload_recommended'&&<button className="a3-cta" onClick={()=>update(x=>startDeload(x,today()).state)}>Start deload week</button>}
 </article>
}

export function Home({s,onNav,onStart,update}:{s:AppState;onNav:(r:string)=>void;onStart:(w:Workout)=>void;update:(fn:(x:AppState)=>AppState)=>void}){
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
 const evidence=coachEvidenceFromState(s,today(),focusEx);
 const brief=coachBriefing(s,today());
 const coachResult=coach({context:evidence.context,plateaus:evidence.plateaus,signals:evidence.signals,state:s,profile:s.profile,goals:s.goals,primaryGoal:s.profile?.primaryGoal,planId:s.plan?.id,workoutId:focus?.id,workout:focus,exerciseId:focusEx?.id,exercise:focusEx,workoutExercise:focusExercise,setId:focusSet?.id,set:focusSet,recentWorkoutIds:recent.map(w=>w.id),recentExerciseEntryIds:[],now:new Date().toISOString()});
 const decision=coachResult.decision;
  const hour=new Date().getHours();
 const greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
 const firstName=(s.profile?.name||'').trim().split(' ')[0];
 const dateLabel=new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'long'}).replace(/^([A-Za-z]+) /,'$1, ');
 const consistency=consistencySummary(s);
 const weekAgo=addDaysLocal(todayLocal(),-6);
 const weekDone=s.workouts.filter(w=>w.status==='completed'&&workoutDay(w)>=weekAgo);
 const weekVolume=vol(weekDone.reduce((n,w)=>n+volumeForWorkout(w,s.exercises),0));
 const volumeLabel=weekVolume>=1000?(weekVolume/1000).toFixed(1)+'K':String(weekVolume);
 const focusMuscles=focus?[...new Set(focus.exercises.flatMap(we=>s.exercises.find(e=>e.id===we.exerciseId)?.primaryMuscles||[]))].slice(0,3):[];
 /* Before the first completed workout there is nothing to compare or total up, so Home is the one next step and a plain sentence about it. */
 const firstRun=!s.workouts.some(w=>w.status==='completed');
 const kicker=active?'In progress':todayW?'Today’s workout':'Next up';
 const weekDays=Array.from({length:7},(_,i)=>{const iso=addDaysLocal(todayLocal(),-((new Date().getDay()+6)%7)+i);return {iso,label:'MTWTFSS'[i],on:s.workouts.some(w=>w.status==='completed'&&workoutDay(w)===iso),today:iso===today()}});
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

   {firstRun&&<article className="a3-card a3-stack a3-firstrun" aria-label="Your first workout">
    <span className="a3-eyebrow a3-gold">Your first workout</span>
    <p>Tap <strong>Start Workout</strong>. APEX shows you each exercise one at a time: how to do it, what weight to start with and how many reps to aim for. Take your time, and rest between sets.</p>
    <button className="a3-link" onClick={()=>onNav('coach')}>Have a question? Ask Coach <Icon name="arrow" size={14}/></button>
   </article>}

   {!firstRun&&<>
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
     {brief&&<small data-coach-next>{'Next: '+displayText(brief.nextStep.text)}</small>}
     <small>{displayText(decision.prescription?.instruction||`Readiness: ${read.label}. Follow the current prescription and record what actually happens.`)}</small>
     <button className="a3-link" onClick={()=>onNav('coach')}>Ask Coach <Icon name="arrow" size={14}/></button>
    </div>
   </article>

   <DeloadCard s={s} update={update}/>

   <div className="a3-rings">
    <ApexRing value={consistency.rate} label="Consistency" sub={`${consistency.completed} sessions · 30d`}/>
    {goal&&<ApexRing value={gp?.percent??null} label={goal.title} sub={gp?.status||'Active goal'} onClick={()=>onNav('goals')}/>}
   </div>

   {ins.length>0&&<section className="a3-block"><div className="a3-head"><h2>Signals</h2></div>
    <div className="a3-list">{ins.slice(0,3).map((x,i)=><article className="a3-card a3-row" key={i}><span className={`badge ${x.kind}`}>{x.kind}</span><div><strong>{x.title}</strong><p>{displayText(x.detail)}</p></div></article>)}</div>
   </section>}

   <section className="a3-block"><div className="a3-head"><h2>Recent training</h2><button className="a3-link" onClick={()=>onNav('history')}>History <Icon name="arrow" size={14}/></button></div>
    <div className="a3-list">{recent.map((w,i)=><button className="a3-card a3-row a3-tap" key={w.id} onClick={()=>onNav(`session:${w.id}`)}><span className="a3-index">{String(i+1).padStart(2,'0')}</span><div><strong>{w.name}</strong><p>{dayOfTimestamp(w.completedAt)||w.scheduledDate} · {w.exercises.length} exercises</p></div><Icon name="arrow" size={16}/></button>)}{!recent.length&&<Empty title="No completed sessions yet" text="Your completed training record will appear here."/>}</div>
   </section>

    <div className="a3-tools"><button className="a3-card a3-tap" onClick={()=>onNav('today')}><Icon name="calendar"/>Today</button><button className="a3-card a3-tap" onClick={()=>onNav('nutrition')}><Icon name="activity"/>Nutrition</button></div>
   </>}
 </div>
}
