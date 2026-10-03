import {useEffect,useState} from 'react';
import type {AppState,Goal,JournalEntry,Measurement} from '../core/types';
import {applyJournalDraft,draftFromEntry,removeJournalEntry,sortedJournal,JOURNAL_LIMITS,JOURNAL_SCOPES,type JournalDraft,type JournalErrors} from '../engine/journalEdit';
import {applyGoalDraft,draftFromGoal,removeGoal,setGoalStatus,GOAL_LIMITS,GOAL_UNITS,type GoalDraft,type GoalErrors} from '../engine/goalEdit';
import {uid} from '../engine/training';
import {goalProgress,goalMilestones} from '../engine/intelligence';
import {addDaysLocal,todayLocal,workoutDay} from '../data/dates';
import {wt,fromWt,len,fromLen,weightLabel,weightWord,lengthLabel} from '../data/units';
import {today} from '../ui/shared';
import {Icon,PageTitle,Empty,ApexLine} from '../ui/primitives';
import {useConfirm} from '../ui/dialogs';
import {todayPlus} from '../ui/stateHelpers';

/* Where the goal's measure is heading, from real records only; with fewer than two data points it says so instead of drawing a trend. */
function goalTrend(s:AppState,g:Goal):string{
 const unit=g.target?.unit;
 if(unit==='sessions'){const since=addDaysLocal(todayLocal(),-28);const n=s.workouts.filter(w=>w.status==='completed'&&workoutDay(w)>=since).length;return `${n} session${n===1?'':'s'} in the last 4 weeks`}
 const kind=unit==='kg'?'load':unit==='reps'?'rep':undefined;
 if(kind){const v=s.achievements.filter(a=>a.kind===kind&&a.value>0).map(a=>a.value);if(v.length>=2)return `Latest record ${v[v.length-1]} ${unit}, previously ${v[v.length-2]}`}
 return 'Not enough data yet.';
}
export function Goals({s,update}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void}){
 const blank:GoalDraft={title:'',kind:'strength',targetValue:'',targetLabel:'Target',targetUnit:'kg',targetDate:''};
 const [open,setOpen]=useState(false),[draft,setDraft]=useState<GoalDraft>(blank),[editingId,setEditingId]=useState<string|null>(null),[errors,setErrors]=useState<GoalErrors>({}),[msg,setMsg]=useState('');
 const {ask,dialog}=useConfirm();
 const set=(patch:Partial<GoalDraft>)=>setDraft(x=>({...x,...patch}));
 const close=()=>{setDraft(blank);setEditingId(null);setErrors({});setOpen(false)};
 const beginEdit=(g:Goal)=>{setEditingId(g.id);setDraft(draftFromGoal(g));setErrors({});setMsg('');setOpen(true)};
 const save=()=>{
  const existing=editingId?s.goals.find(g=>g.id===editingId):undefined;
  const result=applyGoalDraft(existing,draft,{today:today(),nextPriority:s.goals.length+1,newId:()=>uid('goal'),newPeriodId:()=>uid('period')});
  if(!result.ok){setErrors(result.errors);return;}
  const goal=result.goal;
  update(x=>({...x,goals:existing?x.goals.map(g=>g.id===goal.id?goal:g):[...x.goals,goal]}));
  setMsg(existing?'Goal saved.':'Goal created.');
  close();
 };
 const remove=(g:Goal)=>ask({title:'Delete this goal?',message:`“${g.title}” will be removed. Workouts, history and records are not affected.`,confirmLabel:'Delete goal'},()=>{update(x=>({...x,goals:removeGoal(x.goals,g.id)}));setMsg('Goal deleted.');if(editingId===g.id)close();});
 const toggleStatus=(g:Goal)=>{update(x=>({...x,goals:setGoalStatus(x.goals,g.id,g.status==='paused'?'active':'paused')}));setMsg(g.status==='paused'?'Goal resumed.':'Goal paused. It stays on this list and the Coach ignores it until you resume it.');};
 const err=(k:keyof GoalErrors)=>errors[k]?<small className="a3-muted" id={`goal-${k}-error`} role="alert">{errors[k]}</small>:null;
 const invalid=(k:keyof GoalErrors)=>({'aria-invalid':!!errors[k],'aria-describedby':errors[k]?`goal-${k}-error`:undefined});
 return <div className="a3-home"><PageTitle eyebrow="GOALS" title="Give training a direction." sub="A goal is a trajectory: where you are, where you are heading, and the next signal worth noticing."/>
 {msg&&<p className="a3-muted" role="status">{msg}</p>}
 <div className="a3-list">{s.goals.map(g=>{const gp=goalProgress(s,g),ms=goalMilestones(s,g),nextMs=ms.find(m=>!m.reached);const r=(v:number)=>Math.round(v*10)/10;return <article className="a3-card goal-card apex-goal" key={g.id}><span className="a3-eyebrow">{g.kind.replace('_',' ')}{g.status==='paused'?' · paused':''}</span><h3>{g.title}</h3>{gp.percent!==null&&g.target?<><div className="apex-goal-line"><ApexLine value={gp.percent/100} variant="progress" label={`${g.title} trajectory`}/><span>now</span><span>target</span></div><dl className="apex-goal-read"><div><dt>CURRENT STATE</dt><dd>{gp.current===null?'No measurement yet':`${r(gp.current)} ${gp.unit}`}</dd></div><div><dt>TARGET</dt><dd>{g.target.label}: {g.target.value} {g.target.unit}{g.targetDate?` · by ${g.targetDate}`:''}</dd></div><div><dt>TREND</dt><dd>{goalTrend(s,g)}</dd></div><div><dt>NEXT MEANINGFUL SIGNAL</dt><dd>{nextMs?nextMs.label:'Target reached. Review the next phase.'}</dd></div></dl></>:<p className="a3-muted">No numeric target yet. Add one to draw a trajectory.</p>}{gp.status==='achieved'&&<small className="a3-muted">Target evidence reached. Review the next phase rather than silently changing the goal.</small>}<div className="a3-actions"><button className="a3-pill" aria-label={`Edit goal ${g.title}`} onClick={()=>beginEdit(g)}>Edit</button><button className="a3-pill" aria-label={`${g.status==='paused'?'Resume':'Pause'} goal ${g.title}`} onClick={()=>toggleStatus(g)}>{g.status==='paused'?'Resume':'Pause'}</button><button className="a3-pill a3-danger" aria-label={`Delete goal ${g.title}`} onClick={()=>remove(g)}>Delete</button></div></article>})}
 {!s.goals.length&&<Empty title="No goals yet" text="Add a goal to give your training a direction. A goal never changes your prescriptions; your profile's primary goal does."/>}</div>
 {open&&<section className="a3-card a3-stack plan-editor" aria-label={editingId?'Edit goal':'Create goal'}><div className="a3-fields"><label>Goal title<input value={draft.title} maxLength={GOAL_LIMITS.titleMax} onChange={e=>set({title:e.target.value})} placeholder="e.g. Improve pull-up strength" {...invalid('title')}/>{err('title')}</label><label>Type<select aria-label="Goal type" value={draft.kind} onChange={e=>set({kind:e.target.value})}>{['strength','hypertrophy','fat_loss','fitness','general'].map(x=><option key={x} value={x}>{x.replace('_',' ')}</option>)}</select>{err('kind')}</label><label>Target label<input value={draft.targetLabel} maxLength={GOAL_LIMITS.labelMax} onChange={e=>set({targetLabel:e.target.value})} placeholder="e.g. Bench press" {...invalid('targetLabel')}/>{err('targetLabel')}</label><label>Target value<input inputMode="decimal" value={draft.targetValue} onChange={e=>set({targetValue:e.target.value})} placeholder="Optional" {...invalid('targetValue')}/>{err('targetValue')}</label><label>Unit<select aria-label="Goal unit" value={draft.targetUnit} onChange={e=>set({targetUnit:e.target.value})}>{GOAL_UNITS.map(x=><option key={x}>{x}</option>)}</select>{err('targetUnit')}</label><label>Target date<input aria-label="Target date" type="date" min={editingId?undefined:today()} value={draft.targetDate} onChange={e=>set({targetDate:e.target.value})} {...invalid('targetDate')}/>{err('targetDate')}</label></div><div className="a3-actions"><button className="a3-cta" onClick={save}>{editingId?'Save goal':'Create goal'}</button><button className="a3-cta a3-cta-ghost" onClick={close}>Cancel</button></div></section>}
 {!open&&<button className="a3-cta a3-cta-ghost" onClick={()=>{setDraft(blank);setEditingId(null);setErrors({});setMsg('');setOpen(true)}}><Icon name="plus"/> Add goal</button>}
 {dialog}</div>}
export function Journal({s,update}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void}){
 const blank=():JournalDraft=>({date:today(),scope:'general',refId:'',text:'',tags:''});
 const [draft,setDraft]=useState<JournalDraft>(blank),[editingId,setEditingId]=useState<string|null>(null),[errors,setErrors]=useState<JournalErrors>({}),[msg,setMsg]=useState('');
 const {ask,dialog}=useConfirm();
 const set=(patch:Partial<JournalDraft>)=>setDraft(x=>({...x,...patch}));
 const reset=()=>{setDraft(blank());setEditingId(null);setErrors({})};
 const recentWorkouts=s.workouts.filter(w=>w.status==='completed'||w.status==='planned'||w.status==='rescheduled'||w.status==='in_progress').slice().sort((a,b)=>b.scheduledDate.localeCompare(a.scheduledDate)).slice(0,25);
 const refLabel=(entry:JournalEntry)=>{if(!entry.refId)return '';if(entry.scope==='workout'){const w=s.workouts.find(x=>x.id===entry.refId);return w?`${w.name} · ${w.scheduledDate}`:'workout no longer available';}if(entry.scope==='exercise')return s.exercises.find(e=>e.id===entry.refId)?.name||'exercise no longer available';return '';};
 const save=()=>{
  const existing=editingId?s.journal.find(j=>j.id===editingId):undefined;
  const result=applyJournalDraft(existing,draft,{today:today(),newId:()=>uid('journal')});
  if(!result.ok){setErrors(result.errors);return;}
  const entry=result.entry;
  update(x=>({...x,journal:existing?x.journal.map(j=>j.id===entry.id?entry:j):[entry,...x.journal]}));
  setMsg(existing?'Note updated.':'Note saved.');
  reset();
 };
 const beginEdit=(entry:JournalEntry)=>{setEditingId(entry.id);setDraft(draftFromEntry(entry));setErrors({});setMsg('');};
 const remove=(entry:JournalEntry)=>ask({title:'Delete this note?',message:'The note will be removed from this device. Training history and records are not affected.',confirmLabel:'Delete note'},()=>{update(x=>({...x,journal:removeJournalEntry(x.journal,entry.id)}));setMsg('Note deleted.');if(editingId===entry.id)reset();});
 const err=(k:keyof JournalErrors)=>errors[k]?<small className="a3-muted" id={`journal-${k}-error`} role="alert">{errors[k]}</small>:null;
 const invalid=(k:keyof JournalErrors)=>({'aria-invalid':!!errors[k],'aria-describedby':errors[k]?`journal-${k}-error`:undefined});
 const existingEntry=editingId?s.journal.find(j=>j.id===editingId):undefined;
 const scopes=existingEntry?.scope==='set'?[...JOURNAL_SCOPES,'set']:[...JOURNAL_SCOPES];
 return <div className="a3-home"><PageTitle eyebrow="JOURNAL" title="Keep the context visible." sub="Training memory. One sentence is enough; notes stay on this device."/>
  <section className="a3-card a3-stack plan-editor" aria-label={editingId?'Journal entry editor':'Journal entry form'}><div className="a3-fields"><label>Note<textarea aria-label="Journal note" value={draft.text} maxLength={JOURNAL_LIMITS.textMax+200} onChange={e=>set({text:e.target.value})} rows={3} placeholder="One sentence is enough." {...invalid('text')}/><small className="a3-muted">{draft.text.trim().length}/{JOURNAL_LIMITS.textMax}</small>{err('text')}</label><label>Date<input aria-label="Journal date" type="date" max={today()} value={draft.date} onChange={e=>set({date:e.target.value})} {...invalid('date')}/>{err('date')}</label><label>Attach to<select aria-label="Journal scope" value={draft.scope} onChange={e=>set({scope:e.target.value,refId:''})}>{scopes.map(v=><option key={v} value={v}>{({general:'Day',workout:'Session',exercise:'Exercise',set:'Set'} as Record<string,string>)[v]||v}</option>)}</select>{err('scope')}</label>
   {draft.scope==='workout'&&<label>Workout<select aria-label="Journal workout" value={draft.refId} onChange={e=>set({refId:e.target.value})} {...invalid('refId')}><option value="">Choose a workout</option>{recentWorkouts.map(w=><option key={w.id} value={w.id}>{w.name} · {w.scheduledDate}</option>)}</select>{err('refId')}</label>}
   {draft.scope==='exercise'&&<label>Exercise<select aria-label="Journal exercise" value={draft.refId} onChange={e=>set({refId:e.target.value})} {...invalid('refId')}><option value="">Choose an exercise</option>{s.exercises.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>{err('refId')}</label>}
   <label>Tags<input aria-label="Journal tags" value={draft.tags} onChange={e=>set({tags:e.target.value})} placeholder="e.g. soreness recovery" {...invalid('tags')}/>{err('tags')}</label></div><div className="a3-actions"><button className="a3-cta" onClick={save}>{editingId?'Save changes':'Save note'}</button>{editingId&&<button className="a3-cta a3-cta-ghost" onClick={reset}>Cancel</button>}</div>{msg&&<p className="a3-muted" role="status">{msg}</p>}</section>
  <section className="a3-block"><div className="a3-head"><div><span className="a3-eyebrow">LOCAL NOTES</span><h2>Recent context.</h2></div></div><div className="a3-list">{sortedJournal(s.journal).map(entry=><div className="a3-card a3-stack history-item" key={entry.id}><div><span className="a3-eyebrow">{entry.date} · {entry.scope}{refLabel(entry)?` · ${refLabel(entry)}`:''}</span><strong>{entry.text}</strong>{entry.tags.length>0&&<small>{entry.tags.map(t=>`#${t}`).join(' ')}</small>}<div className="a3-actions"><button className="a3-pill" aria-label={`Edit note from ${entry.date}`} onClick={()=>beginEdit(entry)}>Edit</button><button className="a3-pill a3-danger" aria-label={`Delete note from ${entry.date}`} onClick={()=>remove(entry)}>Delete</button></div></div></div>)}{!s.journal.length&&<Empty title="No journal entries yet" text="Use this space for soreness, motivation, travel, sleep, or anything relevant to the current training context."/>}</div></section>
  {dialog}
 </div>
}
export function Measurements({s,update}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void}){
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
 return <div className="a3-home"><PageTitle eyebrow="BODY DATA" title="Measure what matters." sub="A date, a number, a unit. The line shows where it is heading; APEX stores the numbers and makes no medical or body-composition claims."/>
 <section className="a3-card a3-stack plan-editor"><div className="a3-fields"><label>Measurement date<input aria-label="Measurement date" type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)}/></label><label>Weight ({weightLabel()})<input min="1" step="0.1" inputMode="decimal" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="Optional"/></label></div><details className="a3-more"><summary>More measurements</summary><div className="a3-fields">{fields.map(k=><label key={k}>{k[0].toUpperCase()+k.slice(1)} ({lengthLabel()})<input min="0" step="0.1" inputMode="decimal" value={values[k]} onChange={e=>setValues(v=>({...v,[k]:e.target.value}))} placeholder="Optional"/></label>)}</div></details><button className="a3-cta" disabled={!hasInput} onClick={save}>Save measurements for selected date</button></section>
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
