import {useState} from 'react';
import type {AppState} from '../core/types';
import {repository} from '../data/repository';
import type {RecoveryNotice} from '../data/repository';
import {ApexAIGateway} from '../aiGateway';
import {buildGroundedContext} from '../aiGrounding';
import {coachBriefing} from '../coach/briefing';

import {coach,coachEvidenceFromState,answerCoachQuestion} from '../coach';
import {upsertRecoveryCheckIn,RECOVERY_SCALE_FIELDS} from '../engine/recovery';
import {displayText} from '../data/units';
import {today} from '../ui/shared';
import {Icon,ApexImage,ApexRidge,SegTabs,PageTitle,Skeleton} from '../ui/primitives';



/* Coach 2.0 briefing (src/coach/briefing.ts): the engines' own decisions, prioritised. It only reads; nothing here changes training. */
function CoachBriefCard({s}:{s:AppState}){
 const b=coachBriefing(s,today());
 if(!b)return null;
 return <section className="a3-card a3-stack" aria-label="Coach briefing" data-coach-status={b.status}>
  <div className="a3-head"><span className="a3-eyebrow a3-gold">Today's briefing</span><small className="a3-muted">{b.headline}</small></div>
  <strong data-coach-next-step>{displayText(b.nextStep.text)}</strong>
  <p className="a3-muted">{displayText(b.nextStep.reason)}</p>
  {b.items.slice(1).map(i=><div key={i.id}><small className="a3-eyebrow">{i.severity==='important'?'Important':i.severity==='attention'?'Worth a look':'Also'}</small><p>{displayText(i.text)}</p></div>)}
  {b.observations.length>0&&<ul className="a3-muted">{b.observations.map((o,i)=><li key={i}>{displayText(o)}</li>)}</ul>}
  {b.limitations.length>0&&<small className="a3-muted">{b.limitations.join(' ')}</small>}
 </section>
}

export function Coach({s,update,onNav}:{s:AppState;update?:(f:(x:AppState)=>AppState)=>void;onNav?:(r:string)=>void}){
  const [q,setQ]=useState('');
  type CoachMessage={from:string;text:string;source?:'ai'|'rule-based'|'deterministic';note?:string};
  const [messages,setMessages]=useState<CoachMessage[]>([{from:'apex',text:'APEX Coach is connected to your training record. Ask what to do next, why a prescription changed, or how to handle today’s session.'}]);
  const [explaining,setExplaining]=useState(false);
  const aiMode=s.preferences.aiMode||'off';
  const FALLBACK_COPY:Record<string,string>={ai_off:'',not_configured:'The AI provider is not configured.',consent_required:'The AI provider needs your consent first.',insecure_endpoint:'The AI provider endpoint is not secure.',provider_unavailable:'The AI provider is not available.',network:'The AI provider could not be reached.',timeout:'The AI provider took too long.',unsupported:'The AI provider does not support this.',malformed_output:'The AI provider returned something APEX could not use.',rejected_output:'The AI explanation did not match your training record, so it was discarded.',provider_error:'The AI provider returned an error.'};
  /* Optional explanation of the answer above. The deterministic answer is already on screen and is never replaced or changed by this. */
  const explainWithAI=async(question:string)=>{
    if(aiMode==='off')return;
    setExplaining(true);
    const gateway=new ApexAIGateway({mode:aiMode,timeoutMs:20000});
    const outcome=await gateway.explainGrounded(buildGroundedContext(s,question,new Date().toISOString(),today()),{exercises:s.exercises,equipment:s.profile?.equipment}).finally(()=>setExplaining(false));
    setMessages(m=>[...m,outcome.source==='deterministic'
      ?{from:'note',text:`${FALLBACK_COPY[outcome.fallbackReason||'']||'No AI explanation was available.'} The Coach answer above is unchanged.`,source:'deterministic' as const}
      :{from:'ai',text:outcome.text,source:outcome.source,note:outcome.disclaimer}]);
  };
  const buildContext=(userInput?:string)=>{
    const activeWorkout=s.activeWorkoutId?s.workouts.find(w=>w.id===s.activeWorkoutId):undefined;
    const currentWorkout=activeWorkout||s.workouts.find(w=>w.status==='in_progress')||s.workouts.find(w=>w.status==='planned');
    const currentExercise=currentWorkout?.exercises?.[0];
    const exercise=currentExercise?s.exercises.find(e=>e.id===currentExercise.exerciseId):undefined;
    const currentSet=currentExercise?.sets?.find(set=>!set.completed);
    const evidence=coachEvidenceFromState(s,today(),exercise);
    return {context:evidence.context,plateaus:evidence.plateaus,signals:evidence.signals,state:s,profile:s.profile,goals:s.goals,primaryGoal:s.profile?.primaryGoal,planId:s.plan?.id,workoutId:currentWorkout?.id,workout:currentWorkout,exerciseId:exercise?.id,exercise,workoutExercise:currentExercise,setId:currentSet?.id,set:currentSet,recentWorkoutIds:[...s.workouts].sort((a,b)=>b.scheduledDate.localeCompare(a.scheduledDate)).slice(0,10).map(w=>w.id),recentExerciseEntryIds:[],userInput,now:new Date().toISOString()};
  };
  const live=coach(buildContext());
  const ask=()=>{
    const t=q.trim();
    if(!t)return;
    const result=answerCoachQuestion(s,t,buildContext(t));
    const responseText=/^\s*(next|decision)\s*:/i.test(result.text)
      ?result.text
      :`Next: ${result.text}`;
    const text=[responseText,result.safety?`Safety: ${result.safety}`:'',result.nextAction?`Suggested next step: ${result.nextAction.text}`:'',result.missing?.length?`Missing: ${result.missing.join(' ')}`:'',`Confidence: ${result.confidence}`].filter(Boolean).join('\n');
    setMessages(m=>[...m,{from:'user',text:t},{from:'apex',text}]);setQ('');
    void explainWithAI(t);
  };
  const activeWorkout=s.activeWorkoutId?s.workouts.find(w=>w.id===s.activeWorkoutId):s.workouts.find(w=>w.status==='in_progress');
  const currentSet=activeWorkout?.exercises.flatMap(x=>x.sets).find(x=>!x.completed);
  return <div className="a3-home a3-coachscreen">
    {onNav&&<SegTabs route="coach" onNav={onNav}/>}
    <header className="a3-greet a3-pagetitle"><span className="a3-eyebrow">Coach · live context</span><h1>APEX Coach</h1><p className="a3-muted">Your coach reads today’s session, recent evidence and the current prescription, then explains the call instead of hiding it.</p></header>

    <section className="a3-card a3-decision a3-imaged">
      <ApexImage kind="strength-session" alt="" className="a3-hero-image"/>
      <ApexRidge/>
      <div className="a3-decision-top"><span className="badge">{live.decision.action}</span><span className="a3-eyebrow a3-gold">{live.decision.confidence?`${live.decision.confidence} confidence`:'Context grounded'}</span></div>
      <h2>{displayText(live.decision.prescription?.instruction||'Continue with the current training structure when the supplied evidence supports doing so.')}</h2>
      <p>{displayText(live.explanation)}</p>
      {live.decision.confidenceReason&&<div className="a3-decision-reason"><Icon name="shield" size={15}/><span>{displayText(live.decision.confidenceReason)}</span></div>}
      {live.decision.safety.status!=='clear'&&<div className="a3-decision-reason"><Icon name="shield" size={15}/><span>{displayText(live.decision.safety.reason)}</span></div>}
    </section>

    {live.decision.candidates.some(c=>c.id==='review_plateau'||c.id==='lighter_session_option')&&<section className="a3-block" aria-label="Coach options">
      <div className="a3-head"><h2>Your options</h2><span className="a3-eyebrow">You decide</span></div>
      <div className="a3-list">{live.decision.candidates.filter(c=>c.id==='review_plateau'||c.id==='lighter_session_option').map(c=><div className="a3-card a3-stack" key={c.id}><strong>{displayText(c.title)}</strong><p className="a3-muted">{displayText(c.description)}</p></div>)}</div>
    </section>}
    <CoachBriefCard s={s}/>
    {update&&<RecoveryCheckInCard s={s} update={update}/>}

    <section className="a3-block" aria-label="Coach evidence"><div className="a3-head"><h2>Evidence used</h2><span className="a3-eyebrow">TRACEABLE</span></div><div className="a3-list">{live.evidence.slice(0,5).map(item=><div className="a3-card a3-stack" key={item.id}><strong>{displayText(item.statement)}</strong><small className="a3-muted">{item.source} · {item.quality} quality{item.recency?` · ${item.recency}`:''}</small></div>)}</div></section>

    <div className="a3-stats a3-stats-1">
      <div className="a3-card a3-stat"><span className="a3-eyebrow">Session</span><strong>{activeWorkout?.name||'None active'}</strong><small>{currentSet?`${currentSet.type||'working'} set · ${currentSet.reps||'—'} reps · RIR ${currentSet.rir??'—'}`:'Using your latest record'}</small></div>
      <div className="a3-card a3-stat"><span className="a3-eyebrow">Decision</span><strong>{live.decision.action}</strong><small>{live.decision.confidence?`${live.decision.confidence} confidence`:'Context grounded'}</small></div>
      <div className="a3-card a3-stat"><span className="a3-eyebrow">Coach rule</span><strong>Evidence first</strong><small>Evidence → confidence → prescription → your choice.</small></div>
    </div>

    <section className="a3-block">
      <div className="a3-head"><h2>Ask the coach</h2><span className="a3-eyebrow">{messages.length} messages</span></div>
      <div className="a3-messages">{messages.map((m,i)=><article className={`apex-message ${m.from==='ai'||m.from==='note'?'apex':m.from}`} key={i} data-source={m.source||(m.from==='apex'?'deterministic':undefined)}><span className="a3-eyebrow">{m.from==='user'?'YOU':m.from==='ai'?(m.source==='rule-based'?'RULE-BASED SUMMARY · NO AI MODEL':'AI-GENERATED EXPLANATION'):m.from==='note'?'AI STATUS':'APEX COACH · DETERMINISTIC'}</span><p>{displayText(m.text)}</p>{m.note&&<small className="a3-muted">{m.note}</small>}</article>)}{explaining&&<Skeleton label="Preparing an explanation"/>}</div>
      <div className="a3-coach-input"><div className="a3-search"><input aria-label="Ask APEX Coach" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&ask()} placeholder="Ask about today, progression, recovery or a prescription…"/></div><button aria-label="Ask APEX Coach" disabled={!q.trim()} onClick={ask}><Icon name="arrow"/></button></div>
      <div className="a3-chips"><button className="a3-pill" onClick={()=>setQ('What should I do in my next session?')}>Next session</button><button className="a3-pill" onClick={()=>setQ('Why did APEX choose this prescription?')}>Why this prescription?</button><button className="a3-pill" onClick={()=>setQ('Should I change anything today?')}>Change anything?</button></div>
    </section>
  </div>
}
export function RecoveryGate({notice,onRecovered,onFresh}:{notice:RecoveryNotice;onRecovered:(s:AppState)=>void;onFresh:(s:AppState)=>void}){
  const [confirmFresh,setConfirmFresh]=useState(false);
  const [failed,setFailed]=useState(false);
  const [summary,setSummary]=useState<{workouts:number;dropped:number}|null>(null);
  const [recovered,setRecovered]=useState<AppState|null>(null);
  const recover=()=>{const r=repository.recoverRejected();if(!r){setFailed(true);return}setFailed(false);setSummary({workouts:r.workouts,dropped:r.dropped});setRecovered(r.state)};
  if(recovered&&summary)return <div className="a3-home" role="region" aria-label="Data recovery">
    <PageTitle eyebrow="DATA RECOVERY" title="Your data was recovered." sub=""/>
    <section className="a3-card a3-stack"><p className="a3-muted">{summary.workouts} workout{summary.workouts===1?'':'s'} restored{summary.dropped?`, ${summary.dropped} could not be read and were left out`:''}. The original damaged copy is still kept on this device.</p><button className="a3-cta" onClick={()=>onRecovered(recovered)}>Continue to APEX</button></section>
  </div>;
  return <div className="a3-home" role="region" aria-label="Data recovery">
    <PageTitle eyebrow="DATA RECOVERY" title="We couldn’t read your saved data." sub=""/>
    <section className="a3-card a3-stack">
      <p className="a3-muted">Nothing was deleted. The unreadable data is preserved on this device, and APEX will not start an empty app until you choose.</p>
      <p className="a3-muted">Detected {new Date(notice.detectedAt).toLocaleString()} · {notice.bytes.toLocaleString()} characters preserved · {notice.reason==='invalid_json'?'the stored text is not valid data':'the stored data failed integrity checks'}.</p>
      {notice.recoverable
        ?<button className="a3-cta" onClick={recover}>Recover what can be read</button>
        :<p className="a3-muted">This copy cannot be repaired automatically, so it is kept untouched for manual recovery.</p>}
      {failed&&<p role="alert" className="a3-muted">Nothing could be recovered from the preserved copy.</p>}
      {!confirmFresh
        ?<button className="a3-pill" onClick={()=>setConfirmFresh(true)}>Start fresh instead</button>
        :<div className="a3-stack"><p className="a3-muted">Start with an empty app? The damaged copy stays on this device but APEX will no longer show it.</p><button className="a3-pill a3-danger" onClick={()=>onFresh(repository.startFresh())}>Yes, start fresh</button><button className="a3-pill" onClick={()=>setConfirmFresh(false)}>Cancel</button></div>}
    </section>
  </div>
}
function RecoveryCheckInCard({s,update}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void}){
  const date=today();
  const existing=(s.recoveryLog||[]).find(x=>x.date===date);
  const [sleep,setSleep]=useState(existing?.sleepHours!==undefined?String(existing.sleepHours):'');
  const [scale,setScale]=useState<Record<string,number|undefined>>({sleepQuality:existing?.sleepQuality,soreness:existing?.soreness,fatigue:existing?.fatigue,stress:existing?.stress,readiness:existing?.readiness});
  const [recentIllness,setRecentIllness]=useState(Boolean(existing?.recentIllness));
  const [saved,setSaved]=useState(Boolean(existing));
  const labels:Record<string,string>={sleepQuality:'Sleep quality',soreness:'Soreness',fatigue:'Fatigue',stress:'Stress',readiness:'Readiness'};
  const save=()=>{
    const hours=sleep.trim()===''?undefined:Math.min(24,Math.max(0,Number(sleep)));
    update(x=>({...x,recoveryLog:upsertRecoveryCheckIn(x.recoveryLog,{date,sleepHours:hours,recentIllness,...scale})}));
    setSaved(true);
  };
  const any=sleep.trim()!==''||recentIllness||Object.values(scale).some(v=>v!==undefined);
  return <section className="a3-card a3-stack" aria-label="Recovery check-in">
    <div className="a3-head"><div><span className="a3-eyebrow">RECOVERY CHECK-IN</span><h2>How do you feel today?</h2></div></div>
    <p className="a3-muted">Optional context for your coach. It is evidence, not an instruction: it never changes your prescription on its own.</p>
    <label>Sleep last night (hours)<input className="a3-input" type="number" inputMode="decimal" min={0} max={24} step={0.5} aria-label="Sleep hours" value={sleep} onChange={e=>{setSaved(false);setSleep(e.target.value===''?'':String(Math.min(24,Math.max(0,+e.target.value))))}}/></label>
    {RECOVERY_SCALE_FIELDS.filter(k=>k in labels).map(k=><div key={k} role="group" aria-label={labels[k]}><span className="a3-eyebrow">{labels[k]} · 1 low – 5 high</span>
      <div className="a3-choices weight-range-control">{[1,2,3,4,5].map(v=><button key={v} type="button" aria-pressed={scale[k]===v} className={scale[k]===v?'selected':''} aria-label={`${labels[k]} ${v}`} onClick={()=>{setSaved(false);setScale(x=>({...x,[k]:x[k]===v?undefined:v}))}}>{v}</button>)}</div></div>)}
    <label><input type="checkbox" checked={recentIllness} onChange={e=>{setSaved(false);setRecentIllness(e.target.checked)}}/> Recent illness is affecting today’s training context</label>
    <button className="a3-cta" disabled={!any||saved} onClick={save}>{saved?'Check-in saved':'Save check-in'}</button>
  </section>
}
