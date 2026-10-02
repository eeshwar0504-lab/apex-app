import {useMemo,useState} from 'react';
import type {AppState,SetLog} from '../core/types';
import {todayLocal,addDaysLocal,dayOfTimestamp} from '../data/dates';
import {weeklyAnalytics} from '../engine/weeklyAnalytics';
import type {Comparison} from '../engine/weeklyAnalytics';
import {volumeForWorkout,bestLoad,setLoad,isWorkingSet} from '../engine/training';
import {goalProgress,trainingLoadSummary} from '../engine/intelligence';
import {consistencySummary,volumeTrend,goalMomentum,trainingBalance} from '../engine/analytics';
import {wt,vol,volLabel,weightLabel,displayText} from '../data/units';
import {today,formatLoad} from '../ui/shared';
import {Icon,ApexSpark,SegBar,ApexStat,ApexRing,ApexMeter,PageTitle,Empty} from '../ui/primitives';
import {workingOf} from '../ui/setHelpers';


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
    <ApexStat label="Adherence" value={c.adherencePct===null?'—':`${c.adherencePct}%`} unit={c.streakWeeks>1?`${c.streakWeeks} wk streak`:'of plan'}/>
   </div>
   {v.byMuscle.length>0&&<div className="a3-stack" aria-label="Muscle coverage">{v.byMuscle.filter(m=>m.directSets>0).slice(0,6).map(m=><div key={m.muscle}><div className="a3-head"><small>{cap(m.muscle)}</small><small className="a3-muted">{m.directSets} direct{m.indirectSets?` · ${m.indirectSets} indirect`:''} · {m.sharePct}%</small></div><ApexMeter value={m.sharePct}/></div>)}</div>}
   {p.exercises.length>0&&<p className="a3-muted">{p.progressed} progressed · {p.flat} flat{p.regressed?` · ${p.regressed} regressed`:''}{p.stalled?` · ${p.stalled} stalled`:''}</p>}
  </>}
  {w.recovery&&w.recovery.status!=='normal'&&<p className="a3-muted">Training load: {w.recovery.status.replace(/_/g,' ')} · fatigue {w.recovery.level.toLowerCase().replace(/_/g,' ')} ({w.recovery.trend})</p>}
  <p className="a3-muted" data-week-comparison>Versus the same days last week: sessions {delta(w.comparison.sessions)} · sets {delta(w.comparison.workingSets)} · adherence {delta(w.comparison.adherencePct)}</p>
 </section>
}

export function Progress({s,onNav}:{s:AppState;onNav:(r:string)=>void}){
 const done=s.workouts.filter(w=>w.status==='completed').sort((a,b)=>(a.completedAt||a.scheduledDate).localeCompare(b.completedAt||b.scheduledDate));
 const [tab,setTab]=useState<'overview'|'strength'|'body'|'prs'>('overview');
 const [bodyRange,setBodyRange]=useState<'7D'|'30D'|'3M'|'1Y'>('30D');
 const [exerciseId,setExerciseId]=useState<string>('');
 const [exRange,setExRange]=useState<'1M'|'3M'|'6M'|'1Y'|'All'>('3M');
 const exerciseOptions=useMemo(()=>{const ids=new Set(done.flatMap(w=>w.exercises.map(e=>e.exerciseId)));return s.exercises.filter(e=>ids.has(e.id));},[done,s.exercises]);
 const selected=exerciseOptions.find(e=>e.id===exerciseId)||exerciseOptions[0];
 const historyAll=selected?done.flatMap(w=>w.exercises.filter(e=>e.exerciseId===selected.id).map(e=>({w,e}))):[];
 const rangeDays=exRange==='1M'?30:exRange==='3M'?90:exRange==='6M'?180:exRange==='1Y'?365:Infinity;
 const rangeCut=Number.isFinite(rangeDays)?addDaysLocal(todayLocal(),-rangeDays):'';
 const historyRange=historyAll.filter(({w})=>w.scheduledDate>=rangeCut);
 const history=historyRange.slice(-8);
 const bestOf=(e:{sets:SetLog[]})=>selected?(bestLoad(selected,e.sets)??0):0;
 const evidenceSeries=historyRange.map(({e})=>bestOf(e)).filter(v=>v>0);
 const evidenceChange=evidenceSeries.length>1?Math.round((evidenceSeries[evidenceSeries.length-1]-evidenceSeries[0])/evidenceSeries[0]*1000)/10:undefined;
 const evidenceBest=evidenceSeries.length?Math.max(...evidenceSeries):0;
 const bestReps=historyRange.flatMap(({e})=>e.sets.filter(x=>isWorkingSet(x)&&selected&&(setLoad(selected,x)??0)===evidenceBest)).reduce((m,x)=>Math.max(m,x.reps||0),0);
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
 const bodyCut=addDaysLocal(todayLocal(),-bodyDays);
 const bodyRangeEntries=bodyEntries.filter(x=>x.date>=bodyCut);
 const bodySeries=bodyRangeEntries.map(x=>wt(x.weightKg as number));
 const shortDate=(d:string)=>new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
 return <div className="a3-home a3-progress">
   <header className="a3-greet a3-pagetitle"><span className="a3-eyebrow">Progress · {done.length} sessions</span><h1>Progress</h1></header>
   <SegBar label="Progress sections" value={tab} onChange={setTab} items={[['overview','Overview'],['strength','Strength'],['body','Body'],['prs','PRs']]}/>
   {tab==='overview'&&<WeeklyCard s={s}/>}
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
            const best=selected?(bestLoad(selected,doneSets)??0):0;
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
    <div className="a3-list">{top.map((a,i)=><div className="a3-card a3-row" key={i}><span className="a3-index">{String(i+1).padStart(2,'0')}</span><div><strong>{displayText(a.label)}</strong><p>{dayOfTimestamp(a.timestamp)||a.timestamp} · {a.unit}</p></div></div>)}{!top.length&&<Empty title="Achievements will appear here" text="PRs are contextual to exercise and set type."/>}</div>
   </section>}
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
  <div className="a3-search"><Icon name="search"/><input aria-label="Search workouts" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search workout, date…"/></div>
  <div className="a3-chips">{['all','completed','skipped','missed','rescheduled','extra'].map(x=><button className={`a3-pill ${status===x?'selected':''}`} key={x} onClick={()=>setStatus(x)}>{x}</button>)}</div>
  <div className="a3-list">{rows.map(w=><button className="a3-card a3-pick a3-tap history-item" key={w.id} onClick={()=>w.status==='completed'&&onNav('session:'+w.id)}><div><span className="a3-eyebrow">{w.scheduledDate} · {w.status} · {w.source}</span><strong>{w.name}</strong><small>{w.exercises.length} exercises · {w.exercises.reduce((a,e)=>a+e.sets.filter(x=>x.completed).length,0)} completed sets · {vol(volumeForWorkout(w,s.exercises)).toLocaleString()} {volLabel()}</small></div><Icon name="chev"/></button>)}{!rows.length&&<Empty title="Nothing to show" text="Your timeline will populate as training happens."/>}</div>
 </div>}
