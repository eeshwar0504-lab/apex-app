import {imageKindForExercise} from '../imagery';
import type {AppState,Workout} from '../core/types';
import {dayOfTimestamp} from '../data/dates';
import {recoveryStatus,startDeload} from '../engine/deload';
import {coachBriefing} from '../coach/briefing';
import {homeInsights,readiness} from '../engine/intelligence';
import {displayText} from '../data/units';
import {today,niceName} from '../ui/shared';
import {Icon,ApexImage,SegTabs,ApexRing} from '../ui/primitives';
import {useExperience} from '../ui/experience';
import {recommendationFor} from '../ui/stateHelpers';
import {homeState} from '../ui/homeState';
import {trainingWeek} from '../ui/week';
import {WeekLine,weekSentence} from './TrainingMap';

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
   <div className="a3-hero-body">
    <span className="a3-eyebrow a3-gold">{dateLabel}</span>
    <h2>{focus?niceName(focus.name):'Recovery and review'}</h2>
    <p className="a3-meta"><Icon name="activity" size={14}/>Readiness · {read.label}</p>
    <p className="a3-muted">{read.detail}</p>
    <button className="a3-cta" onClick={()=>focus?onStart(focus):onNav('train')}>{focus?(focus.status==='in_progress'?'Resume session':'Begin session'):'Open Train'}<Icon name="arrow" size={18}/></button>
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
function DeloadCard({s,update,onAsk}:{s:AppState;update:(fn:(x:AppState)=>AppState)=>void;onAsk:(q:string)=>void}){
 const rs=recoveryStatus(s,today());
 if(!rs||!['deload_recommended','deload_active','recovery_complete'].includes(rs.status))return null;
 const text=rs.status==='deload_recommended'
  ?'Your recent training shows sustained high load. A deload week is recommended: lighter loads, one fewer set per exercise and easier effort targets. This is a training-load rule, not a medical assessment.'
  :rs.status==='deload_active'
   ?`Deload week in progress, ${rs.daysLeft} day${rs.daysLeft===1?'':'s'} left. Loads are lighter, with one fewer set and easier effort targets.`
   :`Deload complete. Loads stay at your last worked weight for ${rs.daysLeft} more day${rs.daysLeft===1?'':'s'} before progression resumes.`;
 return <article className="a3-card a3-stack apex-deload-card" aria-label="Deload status">
  <span className="a3-eyebrow a3-gold">{rs.status==='deload_recommended'?'Deload recommended':rs.status==='deload_active'?'Deload week':'Recovery'}</span>
  <p>{text}</p>
  <div className="a3-actions">
   {rs.status==='deload_recommended'&&<button className="a3-cta" onClick={()=>update(x=>startDeload(x,today()).state)}>Start deload week</button>}
   <button className="a3-link" onClick={()=>onAsk(rs.status==='recovery_complete'?'Why are my loads held after the deload?':'Why is this week lighter?')}>Why is this week lighter? <Icon name="arrow" size={14}/></button>
  </div>
 </article>
}

export function Home({s,onNav,onStart,update,onAsk}:{s:AppState;onNav:(r:string)=>void;onStart:(w:Workout)=>void;update:(fn:(x:AppState)=>AppState)=>void;onAsk:(q:string)=>void}){
 const {standard}=useExperience();
 const active=s.workouts.find(w=>w.status==='in_progress');
 const todayW=s.workouts.find(w=>w.scheduledDate===today()&&['planned','rescheduled'].includes(w.status));
 const nextW=s.workouts.filter(w=>w.status==='planned'&&w.scheduledDate>today()).sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate))[0];
 const focus=active||todayW||nextW;
 const completed=s.workouts.filter(w=>w.status==='completed');
 /* Before the first completed session there is nothing to compare, so Home is the one next step. It grows with the athlete's record. */
 const firstRun=completed.length===0;
 const focusEx=focus?s.exercises.find(e=>e.id===focus.exercises[0]?.exerciseId):undefined;
 const returning=!!(focusEx&&(recommendationFor(focusEx,s) as any).returnToTraining);
 const state=homeState(s,returning);
 const week=trainingWeek(s,0);
 const brief=firstRun?undefined:coachBriefing(s,today());
 const observation=brief?(brief.observations[0]||brief.headline):'';
 const last=completed.slice().sort((a,b)=>String(b.completedAt||b.updatedAt||'').localeCompare(String(a.completedAt||a.updatedAt||'')))[0];
 const ins=firstRun?[]:homeInsights(s);
 const hour=new Date().getHours();
 const greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
 const firstName=(s.profile?.name||'').trim().split(' ')[0];
 const dateLabel=new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'long'}).replace(/^([A-Za-z]+) /,'$1, ');
 const focusMuscles=focus?[...new Set(focus.exercises.flatMap(we=>s.exercises.find(e=>e.id===we.exerciseId)?.primaryMuscles||[]))].slice(0,3):[];
 const kicker=active?'IN PROGRESS':todayW?'TODAY':'NEXT SESSION';
 return <div className="home-screen a3-home" data-home-state={state.id}>
   <header className="a3-greet"><span className="a3-eyebrow">{dateLabel}</span><h1>{firstName?<>{greeting},<br/>{firstName}.</>:`${greeting}.`}</h1></header>

   <section className="a3-hero apex-thread" aria-label="Daily briefing" style={{viewTransitionName:'session-thread'} as React.CSSProperties}>
    <ApexImage kind={focusEx?imageKindForExercise(focusEx):'training-floor'} alt="" className="a3-hero-image" eager/>
    <div className="a3-hero-body">
     <span className="a3-eyebrow a3-gold">{kicker}{state.label&&<span className="apex-state-tag"> · {state.label}</span>}</span>
     <h2>{focus?niceName(focus.name):'No session scheduled'}</h2>
     {focusMuscles.length>0&&<p className="a3-muted">{focusMuscles.map(x=>x.replace(/_/g,' ')).join(' · ')}</p>}
     <p className="a3-meta"><Icon name="clock" size={14}/>{focus?`${focus.exercises.length} exercises${s.profile?.sessionMinutes?` · ~${s.profile.sessionMinutes} min`:''}${!todayW&&!active&&focus?` · ${focus.scheduledDate}`:''}`:'Build a session in Train'}</p>
     <button className="a3-cta apex-primary" onClick={()=>focus?onStart(focus):onNav('train')}>{focus?(active?'Resume session':'Begin session'):'Open Train'}<Icon name="arrow" size={18}/></button>
    </div>
   </section>

   {firstRun&&<article className="a3-card a3-stack a3-firstrun" aria-label="Your first session">
    <span className="a3-eyebrow a3-gold">Your first session draws the first line</span>
    <p>Tap <strong>Begin session</strong>. APEX shows you each exercise one at a time: how to do it, what weight to start with and how many reps to aim for. Take your time, and rest between sets.</p>
    <button className="a3-link" onClick={()=>onNav('coach')}>Have a question? Ask Coach <Icon name="arrow" size={14}/></button>
   </article>}

   {!firstRun&&<>
    <section className="a3-card a3-stack apex-weekcard" aria-label="This week">
     <div className="a3-head"><span className="a3-eyebrow">This week</span><small className="a3-muted">{weekSentence(week)}</small></div>
     <WeekLine week={week} compact onSelect={()=>onNav('train')}/>
    </section>

    {state.note&&<p className="apex-statenote" data-home-state-note>{state.note}</p>}

    {observation&&<article className="a3-card apex-observation-card" aria-label="Coach observation">
     <span className="a3-eyebrow a3-gold">APEX OBSERVATION</span>
     <p className="apex-observation">{displayText(observation)}</p>
     <div className="a3-actions"><button className="a3-link" onClick={()=>onAsk('Why did my training change?')}>Why? <Icon name="arrow" size={14}/></button><button className="a3-link" onClick={()=>onNav('coach')}>Open Coach <Icon name="arrow" size={14}/></button></div>
    </article>}

    <DeloadCard s={s} update={update} onAsk={onAsk}/>

    {standard&&ins.length>0&&<section className="a3-block"><div className="a3-head"><h2>Signals</h2></div>
     <div className="a3-list">{ins.slice(0,2).map((x,i)=><article className="a3-card a3-row" key={i}><span className={`badge ${x.kind}`}>{x.kind}</span><div><strong>{x.title}</strong><p>{displayText(x.detail)}</p></div></article>)}</div>
    </section>}

    {last&&<section className="a3-block"><div className="a3-head"><h2>Last session</h2><button className="a3-link" onClick={()=>onNav('history')}>History <Icon name="arrow" size={14}/></button></div>
     <div className="a3-list"><button className="a3-card a3-row a3-tap" onClick={()=>onNav(`session:${last.id}`)}><span className="a3-index">{(dayOfTimestamp(last.completedAt)||last.scheduledDate).slice(5)}</span><div><strong>{last.name}</strong><p>{last.exercises.length} exercises</p></div><Icon name="arrow" size={16}/></button></div>
    </section>}
   </>}
 </div>
}
