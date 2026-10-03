import {useMemo,useState} from 'react';
import type {AppState,Exercise,SetLog} from '../core/types';
import {todayLocal,addDaysLocal,dayOfTimestamp} from '../data/dates';
import {weeklyAnalytics} from '../engine/weeklyAnalytics';
import type {Comparison} from '../engine/weeklyAnalytics';
import {volumeForWorkout,bestLoad} from '../engine/training';
import {trainingLoadSummary} from '../engine/intelligence';
import {recoveryStatus} from '../engine/deload';
import {consistencySummary,goalMomentum,trainingBalance} from '../engine/analytics';
import {wt,vol,volLabel,weightLabel,displayText} from '../data/units';
import {today,formatLoad,sourceLabel} from '../ui/shared';
import {Icon,ApexSpark,SegBar,ApexStat,ApexMeter,PageTitle,Empty} from '../ui/primitives';
import {useExperience} from '../ui/experience';
import {trainingWeek} from '../ui/week';
import {workingOf} from '../ui/setHelpers';
import {weekSentence} from './TrainingMap';
import {ApexTrajectory,EvidenceSets,LayeredVolume,RhythmMap,RecoveryTrajectory,volumeByWeek} from './ProgressParts';
import type {TrajectoryPoint} from './ProgressParts';

/* Weekly analytics (src/engine/weeklyAnalytics.ts): counts and comparisons only, no judgement of volume. */
function WeeklyCard({s}:{s:AppState}){
 const w=weeklyAnalytics(s,today());
 if(!w)return null;
 const c=w.consistency,v=w.volume,p=w.progression;
 const delta=(x:Comparison)=>x.state==='ok'?`${(x.delta as number)>=0?'+':''}${x.delta}`:'Not enough data';
 const cap=(m:string)=>m.charAt(0).toUpperCase()+m.slice(1);
 return <section className="a3-card a3-stack" aria-label="Weekly analytics">
  <div className="a3-head"><span className="a3-eyebrow">This week</span><small className="a3-muted">{w.week.start} · day {w.week.elapsedDays} of 7</small></div>
  {w.empty?<p className="a3-muted">No completed sessions yet this week.</p>:<>
   <div className="a3-stats">
    <ApexStat label="Sessions" value={String(c.sessionsCompleted)} unit={c.plannedSessions?`of ${c.plannedSessions}`:'done'}/>
    <ApexStat label="Working sets" value={String(v.workingSets)} unit="sets"/>
    <ApexStat label="Adherence" value={c.adherencePct===null?'—':`${c.adherencePct}%`} unit="of plan"/>
   </div>
   {v.byMuscle.length>0&&<div className="a3-stack" aria-label="Muscle coverage">{v.byMuscle.filter(m=>m.directSets>0).slice(0,6).map(m=><div key={m.muscle}><div className="a3-head"><small>{cap(m.muscle)}</small><small className="a3-muted">{m.directSets} direct{m.indirectSets?` · ${m.indirectSets} indirect`:''} · {m.sharePct}%</small></div><ApexMeter value={m.sharePct}/></div>)}</div>}
   {p.exercises.length>0&&<p className="a3-muted">{p.progressed} progressed · {p.flat} flat{p.regressed?` · ${p.regressed} regressed`:''}{p.stalled?` · ${p.stalled} stalled`:''}</p>}
  </>}
  {w.recovery&&w.recovery.status!=='normal'&&<p className="a3-muted">Training load: {w.recovery.status.replace(/_/g,' ')} · fatigue {w.recovery.level.toLowerCase().replace(/_/g,' ')} ({w.recovery.trend})</p>}
  <p className="a3-muted" data-week-comparison>Versus the same days last week: sessions {delta(w.comparison.sessions)} · sets {delta(w.comparison.workingSets)} · adherence {delta(w.comparison.adherencePct)}</p>
 </section>
}

/* Progress is an observatory, not a wall of charts: OVERVIEW says what changed, each DIMENSION shows it as a line, and every point opens EVIDENCE (the session, the sets). */
type Dimension='overview'|'strength'|'volume'|'consistency'|'recovery'|'body';
export function Progress({s,onNav,onAsk}:{s:AppState;onNav:(r:string)=>void;onAsk:(q:string)=>void}){
 const {standard,advanced}=useExperience();
 const done=s.workouts.filter(w=>w.status==='completed').sort((a,b)=>(a.completedAt||a.scheduledDate).localeCompare(b.completedAt||b.scheduledDate));
 const [tab,setTab]=useState<Dimension>('overview');
 const [bodyRange,setBodyRange]=useState<'7D'|'30D'|'3M'|'1Y'>('30D');
 const [exerciseId,setExerciseId]=useState<string>('');
 const [exRange,setExRange]=useState<'1M'|'3M'|'6M'|'1Y'|'All'>('3M');
 const [pointId,setPointId]=useState('');
 /* the session just finished is the newest point on the line, and settles into place when it is first seen */
 const [fresh]=useState(()=>{try{return sessionStorage.getItem('apex-fresh-session')||undefined}catch{return undefined}});
 const exerciseOptions=useMemo(()=>{const ids=new Set(done.flatMap(w=>w.exercises.map(e=>e.exerciseId)));return s.exercises.filter(e=>ids.has(e.id));},[done,s.exercises]);
 const selected=exerciseOptions.find(e=>e.id===exerciseId)||exerciseOptions[0];
 const bestOf=(ex:Exercise|undefined,e:{sets:SetLog[]})=>ex?(bestLoad(ex,e.sets)??0):0;
 const seriesFor=(ex:Exercise|undefined,cut:string)=>ex?done.flatMap(w=>w.exercises.filter(e=>e.exerciseId===ex.id&&w.scheduledDate>=cut).map(e=>({w,e}))).map(({w,e})=>({w,e,value:bestOf(ex,e)})).filter(p=>p.value>0):[];
 const rangeDays=exRange==='1M'?30:exRange==='3M'?90:exRange==='6M'?180:exRange==='1Y'?365:Infinity;
 const rangeCut=Number.isFinite(rangeDays)?addDaysLocal(todayLocal(),-rangeDays):'';
 const rows=seriesFor(selected,rangeCut);
 const prWorkouts=new Set(s.achievements.filter(a=>a.exerciseId===selected?.id).map(a=>a.workoutId));
 const points:TrajectoryPoint[]=rows.map(({w,value})=>({id:w.id,date:w.scheduledDate,value,pr:prWorkouts.has(w.id)}));
 const sel=points.find(p=>p.id===pointId)||points[points.length-1];
 const selRow=rows.find(r=>r.w.id===sel?.id);
 const change=points.length>1?Math.round((points[points.length-1].value-points[0].value)/points[0].value*1000)/10:undefined;
 const best=points.length?Math.max(...points.map(p=>p.value)):0;
 const notes=s.journal.filter(j=>(j.scope==='exercise'&&j.refId===selected?.id)||(j.scope==='workout'&&points.some(p=>p.id===j.refId))).slice(0,3);
 const shortDate=(d:string)=>new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
 const volume=useMemo(()=>volumeByWeek(s),[s]);
 const fmtVol=(n:number)=>`${vol(n).toLocaleString()} ${volLabel()}`;
 const week=trainingWeek(s,0);
 const rs=recoveryStatus(s,today());
 const loadSummary=trainingLoadSummary(s);
 const consistency=consistencySummary(s);
 const momentum=goalMomentum(s);
 const balance=trainingBalance(s);
 const bodyEntries=s.measurements.filter(entry=>entry.weightKg!==undefined).slice().sort((a,b)=>a.date.localeCompare(b.date));
 const latestBodyEntry=bodyEntries[bodyEntries.length-1];
 const previousBodyEntry=bodyEntries.length>1?bodyEntries[bodyEntries.length-2]:undefined;
 const bodyWeightChange=latestBodyEntry&&previousBodyEntry?latestBodyEntry.weightKg!-previousBodyEntry.weightKg!:undefined;
 const bodyDays=bodyRange==='7D'?7:bodyRange==='30D'?30:bodyRange==='3M'?90:365;
 const bodyCut=addDaysLocal(todayLocal(),-bodyDays);
 const bodyRangeEntries=bodyEntries.filter(x=>x.date>=bodyCut);
 const bodySeries=bodyRangeEntries.map(x=>wt(x.weightKg as number));
 /* the overview: what changed, each with the dimension that shows the evidence */
 const topMover=exerciseOptions.map(ex=>{const r=seriesFor(ex,addDaysLocal(todayLocal(),-90));const c=r.length>1?(r[r.length-1].value-r[0].value)/r[0].value*100:0;return {ex,c:Math.round(c*10)/10,n:r.length}}).filter(m=>m.n>1&&m.c>=2.5).sort((a,b)=>b.c-a.c)[0];
 const lastTwo=volume.slice(-2);
 const volumeLine=lastTwo.length===2&&lastTwo[0].total>0?(lastTwo[1].total>lastTwo[0].total*1.05?'Volume is up on last week.':lastTwo[1].total<lastTwo[0].total*0.95?'Volume is down on last week.':'Volume is steady against last week.'):'';
 const changes:Array<{id:string;text:string;to:Dimension;exerciseId?:string}>=[
  {id:'week',text:weekSentence(week),to:'consistency'},
  ...(topMover?[{id:'mover',text:`${topMover.ex.name} is up ${topMover.c}% over ${topMover.n} sessions.`,to:'strength' as Dimension,exerciseId:topMover.ex.id}]:[]),
  ...(volumeLine?[{id:'volume',text:volumeLine,to:'volume' as Dimension}]:[]),
  ...(rs?[{id:'recovery',text:`Training load is ${rs.level.toLowerCase().replace(/_/g,' ')}${rs.status==='deload_active'?', deload week':''}.`,to:'recovery' as Dimension}]:[])
 ];
 const zero=done.length===0;
 const bodyCard=<div className="a3-card a3-stack a3-bodycard apex-body-shortcut">
    <div className="a3-bodyhead"><div><span className="a3-eyebrow">Body weight</span><strong className="a3-bodyvalue">{latestBodyEntry?<>{wt(latestBodyEntry.weightKg as number)}<small>{weightLabel()}</small></>:'Start a recorded-weight history'}</strong></div>{bodyWeightChange!==undefined&&<span className="a3-delta">{bodyWeightChange>=0?'↑':'↓'} {Math.abs(wt(bodyWeightChange)).toFixed(1)} {weightLabel()}<small>since previous</small></span>}</div>
    {bodySeries.length>1&&<ApexSpark values={bodySeries} label="Body weight trend" xLabels={[shortDate(bodyRangeEntries[0].date),shortDate(bodyRangeEntries[bodyRangeEntries.length-1].date)]}/>}
    <div className="a3-choices a3-ranges" role="group" aria-label="Body weight range">{(['7D','30D','3M','1Y'] as const).map(p=><button key={p} aria-pressed={bodyRange===p} className={bodyRange===p?'selected':''} onClick={()=>setBodyRange(p)}>{p}</button>)}</div>
    <button className="a3-link" onClick={()=>onNav('measurements')}>Open Body / Weight <Icon name="arrow" size={14}/></button>
   </div>;
 return <div className="a3-home a3-progress">
   <header className="a3-greet a3-pagetitle"><span className="a3-eyebrow">{zero?'Progress':`Progress · ${done.length} session${done.length===1?'':'s'}`}</span><h1>Progress</h1></header>
   {zero&&<Empty title="Your first session draws the first line." text="Complete a few sessions and APEX will begin finding patterns."/>}
   {!zero&&<SegBar label="Progress sections" value={tab} onChange={setTab} items={[['overview','Overview'],['strength','Strength'],['volume','Volume'],['consistency','Consistency'],['recovery','Recovery'],['body','Body']]}/>}
   {zero&&bodyCard}

   {!zero&&tab==='overview'&&<>
    <section className="a3-card a3-stack apex-changes" aria-label="What changed">
     <span className="a3-eyebrow a3-gold">WHAT CHANGED</span>
     <ul>{changes.map(c=><li key={c.id}><span>{c.text}</span><button className="a3-link" aria-label={`Evidence: ${c.text}`} onClick={()=>{if(c.exerciseId)setExerciseId(c.exerciseId);setPointId('');setTab(c.to)}}>Evidence <Icon name="arrow" size={14}/></button></li>)}</ul>
     <button className="a3-link" onClick={()=>onAsk('Why did my training change?')}>Why did this change? <Icon name="arrow" size={14}/></button>
    </section>
    {standard&&<WeeklyCard s={s}/>}
    {bodyCard}
    {advanced&&<>
     <div className="a3-stats">
      <ApexStat label="Sessions" value={String(done.length)} unit="done"/>
      <ApexStat label="Working sets" value={String(loadSummary.workingSets30)} unit="30d"/>
      <ApexStat label="Awards" value={String(s.achievements.length)} unit="PRs"/>
     </div>
     <section className="a3-block">
      <div className="a3-head"><h2>Interpretation</h2><span className="a3-eyebrow">Context only</span></div>
      <div className="a3-card a3-callout"><Icon name="shield" size={16}/><div><p>{momentum.detail}{balance.highest&&balance.lowest?` Highest recent primary-muscle exposure: ${balance.highest[0]} (${balance.highest[1]} sets); lowest: ${balance.lowest[0]} (${balance.lowest[1]}).`:''}</p></div></div>
     </section>
    </>}
    <button className="a3-link" onClick={()=>onNav('goals')}>Goals <Icon name="arrow" size={14}/></button>
   </>}

   {!zero&&tab==='strength'&&<section className="a3-block">
    <div className="a3-head"><div><span className="a3-eyebrow">Strength</span><h2 className="a3-bigtitle">{selected?.name||'Exercise evidence'}</h2></div></div>
    {selected?<div className="a3-stack">
      <label className="a3-select"><span className="a3-eyebrow">Exercise</span>
       <select value={selected.id} onChange={e=>{setExerciseId(e.target.value);setPointId('')}}>{exerciseOptions.map(e=><option value={e.id} key={e.id}>{e.name}</option>)}</select>
      </label>
      <div className="a3-choices a3-ranges" role="group" aria-label="Exercise range">{(['1M','3M','6M','1Y','All'] as const).map(p=><button key={p} aria-pressed={exRange===p} className={exRange===p?'selected':''} onClick={()=>{setExRange(p);setPointId('')}}>{p}</button>)}</div>
      <div className="a3-card a3-analytics">
       <div className="a3-analytics-metric"><strong>{change===undefined?'—':`${change>=0?'+':''}${change}%`}</strong><small>Strength change · {exRange==='All'?'all time':`last ${exRange}`}</small></div>
       <ApexTrajectory points={points} label={`${selected.name} best load per session`} selected={sel?.id} onSelect={setPointId} fresh={fresh} xLabels={points.length>1?[shortDate(points[0].date),shortDate(points[points.length-1].date)]:undefined}/>
       {points.some(p=>p.pr)&&<p className="a3-muted apex-pr-note"><span className="apex-event-mark" aria-hidden="true"/> Diamonds mark personal records.</p>}
       <div className="a3-stats a3-stats-2"><ApexStat label="Best set" value={best?formatLoad(selected,best):'—'} unit=""/><ApexStat label="Sessions" value={String(points.length)} unit="logged"/></div>
      </div>
      {sel&&selRow&&<section className="a3-card a3-stack apex-evidence" aria-label="Evidence">
       <span className="a3-eyebrow a3-gold">EVIDENCE · {shortDate(sel.date)}{sel.pr?' · PR':''}</span>
       <strong>{selected.name}</strong>
       <EvidenceSets ex={selected} sets={selRow.e.sets} date={sel.date} standard={standard}/>
       <div className="a3-actions">
        <button className="a3-pill" onClick={()=>onNav('session:'+sel.id)}>Open session</button>
        <button className="a3-pill" onClick={()=>onAsk(`Why did my ${selected.name} change?`)}>Why did this change?</button>
       </div>
      </section>}
      {notes.length>0&&<section className="a3-block" aria-label="Your notes"><span className="a3-eyebrow">YOUR NOTES</span>{notes.map(n=><p key={n.id} className="apex-note"><small className="a3-muted">{n.date}</small> {n.text}</p>)}</section>}
      <div className="a3-list">{rows.slice(-8).map(({w,e,value},i)=><button className={`a3-card a3-row a3-tap${sel?.id===w.id?' selected':''}`} key={w.id} onClick={()=>setPointId(w.id)}><span className="a3-index">{String(i+1).padStart(2,'0')}</span><div><strong>{formatLoad(selected,value)}</strong><p>{w.scheduledDate} · {e.sets.filter(x=>x.completed&&x.type!=='warmup').length} working sets</p></div></button>)}</div>
    </div>:<Empty title="Complete an exercise first" text="Exercise-level trends appear after APEX has comparable performance evidence."/>}
    {s.achievements.length>0&&<section className="a3-block"><div className="a3-head"><h2>Personal records</h2><button className="a3-link" onClick={()=>onNav('history')}>History <Icon name="arrow" size={14}/></button></div>
     <div className="a3-list">{s.achievements.slice(-5).reverse().map((a,i)=><button className="a3-card a3-row a3-tap" key={i} onClick={()=>onNav('session:'+a.workoutId)}><span className="apex-event-mark" aria-hidden="true"/><div><strong>{displayText(a.label)}</strong><p>{dayOfTimestamp(a.timestamp)||a.timestamp} · {a.unit}</p></div></button>)}</div></section>}
   </section>}

   {!zero&&tab==='volume'&&<section className="a3-block">
    <div className="a3-head"><h2>Volume</h2><span className="a3-eyebrow">Last 8 weeks</span></div>
    <p>{volumeLine||'Complete a few sessions and APEX will begin finding patterns.'}</p>
    {standard&&<div className="a3-card"><LayeredVolume rows={volume} format={fmtVol}/></div>}
    {advanced&&<table className="apex-evidence-table" aria-label="Weekly volume"><thead><tr><th scope="col">Week of</th><th scope="col">Volume</th><th scope="col">Largest layer</th></tr></thead><tbody>{volume.map(r=><tr key={r.start}><th scope="row">{r.start}</th><td>{fmtVol(r.total)}</td><td>{r.layers[0]?`${r.layers[0].muscle}`:'—'}</td></tr>)}</tbody></table>}
    <button className="a3-link" onClick={()=>onAsk('Why did my volume change?')}>Why did this change? <Icon name="arrow" size={14}/></button>
   </section>}

   {!zero&&tab==='consistency'&&<section className="a3-block">
    <div className="a3-head"><h2>Consistency</h2><span className="a3-eyebrow">Training rhythm</span></div>
    <p>{weekSentence(week)}. Rest days are part of the plan.</p>
    <div className="a3-card"><RhythmMap s={s}/></div>
    {standard&&<p className="a3-muted">{consistency.completed} of {consistency.planned||'—'} scheduled sessions done in the last 30 days.</p>}
    <div className="a3-list">{done.slice(-4).reverse().map(w=><button className="a3-card a3-row a3-tap" key={w.id} onClick={()=>onNav('session:'+w.id)}><span className="a3-index">{w.scheduledDate.slice(5)}</span><div><strong>{w.name}</strong><p>{w.exercises.length} exercises</p></div></button>)}</div>
   </section>}

   {!zero&&tab==='recovery'&&<section className="a3-block">
    <div className="a3-head"><h2>Recovery</h2><span className="a3-eyebrow">Fatigue state</span></div>
    <p>{rs?`Training load is ${rs.level.toLowerCase().replace(/_/g,' ')}${rs.status==='deload_active'?'. This is a deload week.':rs.status==='deload_recommended'?'. A deload week is recommended.':'.'}`:'Not enough sessions yet to describe recovery.'}</p>
    {standard&&<div className="a3-card"><RecoveryTrajectory s={s}/></div>}
    <button className="a3-link" onClick={()=>onAsk('Why is this week lighter?')}>Why is this week lighter? <Icon name="arrow" size={14}/></button>
   </section>}

   {!zero&&tab==='body'&&bodyCard}
 </div>
}

export function History({s,onNav}:{s:AppState;onNav:(r:string)=>void}){
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
  const doneSets=workingOf(sets).filter(x=>x.completed).length;
  const expected=workingOf(sets).filter(x=>x.disposition!=='skipped').length;
  const mark:'done'|'partial'|'missed'|'planned'=w.status==='completed'?(doneSets>=expected?'done':'partial'):(w.status==='skipped'||w.status==='missed')?'missed':'planned';
  const prev=marks.get(w.scheduledDate);
  if(!prev||mark==='done'||(mark==='partial'&&prev!=='done'))marks.set(w.scheduledDate,mark);
 });
 const todayIso=today();
 const monthDone=Array.from({length:daysInMonth},(_,i)=>marks.get(isoDay(i+1))).filter(m=>m==='done'||m==='partial').length;
 return <div className="a3-home"><PageTitle eyebrow="HISTORY" title="Workout History" sub="Every session, in order. Records show as events on the line."/>
  <section className="a3-card a3-calendar" aria-label="Training calendar">
   <div className="a3-head"><button className="a3-iconbtn" aria-label="Previous month" onClick={()=>setMonthOffset(x=>x-1)}><Icon name="back" size={18}/></button><div className="a3-cal-title"><strong>{monthLabel}</strong><small>{monthDone} session{monthDone===1?'':'s'}</small></div><button className="a3-iconbtn" aria-label="Next month" disabled={monthOffset>=0} onClick={()=>setMonthOffset(x=>Math.min(0,x+1))}><Icon name="chev" size={18}/></button></div>
   <div className="a3-cal-grid" role="grid">
    {['M','T','W','T','F','S','S'].map((d,i)=><span className="a3-cal-dow" key={i}>{d}</span>)}
    {Array.from({length:startPad},(_,i)=><span key={'p'+i}/>)}
    {Array.from({length:daysInMonth},(_,i)=>{const iso=isoDay(i+1);const mark=marks.get(iso);return <button key={iso} className={`a3-cal-day ${mark?'is-'+mark:''} ${iso===todayIso?'is-today':''} ${q===iso?'selected':''}`} aria-label={`${iso}${mark?` ${mark}`:''}`} aria-pressed={q===iso} onClick={()=>setQ(q===iso?'':iso)}>{i+1}</button>})}
   </div>
   <div className="a3-cal-legend"><span className="is-done">Workout</span><span className="is-partial">Partial</span><span className="is-missed">Missed</span><span className="is-planned">Planned</span></div>
  </section>
  <div className="a3-search"><Icon name="search"/><input aria-label="Search workouts" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search workout, date…"/></div>
  <div className="a3-chips">{['all','completed','skipped','missed','rescheduled','extra'].map(x=><button className={`a3-pill ${status===x?'selected':''}`} key={x} onClick={()=>setStatus(x)}>{x}</button>)}</div>
  <div className="a3-list">{rows.map(w=><button className="a3-card a3-pick a3-tap history-item" key={w.id} onClick={()=>w.status==='completed'&&onNav('session:'+w.id)}><div><span className="a3-eyebrow">{[w.scheduledDate,w.status,sourceLabel(w.source)].filter(Boolean).join(' · ')}</span><strong>{w.name}{s.achievements.some(a=>a.workoutId===w.id)&&<span className="apex-pr-chip"> · PR</span>}</strong><small>{w.exercises.length} exercises · {w.exercises.reduce((a,e)=>a+e.sets.filter(x=>x.completed).length,0)} completed sets · {vol(volumeForWorkout(w,s.exercises)).toLocaleString()} {volLabel()}</small></div><Icon name="chev"/></button>)}{!rows.length&&<Empty title="Your training history begins here." text="Finish a session and it appears on this line."/>}</div>
 </div>}
