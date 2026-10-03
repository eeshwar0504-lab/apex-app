import {useState} from 'react';
import type {AppState,Exercise} from '../core/types';
import {findExercises} from '../knowledge/exercises';
import {explainSafety} from '../engine/exerciseSafety';
import {variationOptions} from '../engine/exerciseGraph';
import {addExerciseToWorkout,nextEditableWorkout} from '../engine/workoutEdit';
import {uid,planWithDays,equipmentFit,smartAlternatives} from '../engine/training';
import {knowledgeReport} from '../knowledge/knowledgeGraph';
import {today,patternLabel,loadTypeLabel,equipmentLabel as labelFor,formatLoad} from '../ui/shared';
import {Icon,Detail,PageTitle,Disclosure} from '../ui/primitives';
import {Modal} from '../ui/dialogs';
import {useExperience} from '../ui/experience';
import {lastSession,describeSet} from '../ui/previous';
import {recommendationFor} from '../ui/stateHelpers';
import {CoachAnswer} from './Coach';

export function Library({s,query,setQuery,onExercise}:{s:AppState;query:string;setQuery:(x:string)=>void;onExercise:(id:string)=>void}){
 const {advanced}=useExperience();
 const [equipmentOnly,setEquipmentOnly]=useState(false);
 const available=s.profile?.equipment||[];
 const filtered=findExercises(query).filter(e=>s.exercises.some(x=>x.id===e.id)).filter(e=>!equipmentOnly||equipmentFit(e,available)!=='unavailable');
 const equipmentSummary=available.length?`${available.length} equipment types available`:'Equipment not set';
 const report=knowledgeReport(s);
 return <div className="a3-home"><PageTitle eyebrow="EXERCISE LIBRARY" title="Find a movement." sub="How to do it, what it works, and your own history with it."/>
 <div className="a3-search"><Icon name="search"/><input aria-label="Search the exercise library" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Chest press, row, squat…"/></div>
 <div className="a3-chips">{['','horizontal_push','horizontal_pull','vertical_pull','squat','hinge','core','arm_flexion'].map(x=><button className="a3-pill" key={x||'all'} onClick={()=>setQuery(x)}>{x?patternLabel(x):'All'}</button>)}</div>
 <div className="a3-toolbar"><span className="a3-muted">{filtered.length} movements · {equipmentSummary}</span>{advanced&&<span className="a3-muted">Knowledge {report.healthy?'validated':`${report.errors} issues`}</span>}<label className="a3-toggle"><span>Available equipment first</span><input type="checkbox" checked={equipmentOnly} onChange={e=>setEquipmentOnly(e.target.checked)}/></label></div>
 <div className="a3-list library-grid">{filtered.map(e=>{const fit=equipmentFit(e,available);return <button aria-label={`View details for ${e.name}`} className="a3-card a3-tile a3-tap exercise-tile" key={e.id} onClick={()=>onExercise(e.id)}><span className="a3-chip">{loadTypeLabel(e.loadSemantics)}</span><strong>{e.name}</strong><small>{e.primaryMuscles.join(' · ')}</small><span>{e.repRange[0]}–{e.repRange[1]} · {e.equipment.map(labelFor).join(', ')}</span>{available.length>0&&<em className={`a3-chip a3-fit-${fit}`}>{fit==='available'?'Available from your setup':fit==='unknown'?'Confirm for today':'Not in setup'}</em>}</button>})}</div></div>
}

/*
 * The Exercise Dossier: one exercise as an object. It opens over whatever asked for it (the workout stays exactly where it was, so
 * closing returns to the same exercise, set and scroll position) and grows from the point that was tapped.
 * Text instructions are always here; nothing depends on video.
 */
export function ExerciseSheet({ex,s,update,close,onPlan,onAlternative}:{ex:Exercise;s:AppState;update:(f:(x:AppState)=>AppState)=>void;close:()=>void;onPlan:()=>void;onAlternative:(id:string)=>void}){
 const {standard,advanced}=useExperience();
 const alts=smartAlternatives(ex,s.exercises,s.profile?.equipment);
 const variations=variationOptions(ex,s.exercises,s.profile?.equipment);
 const [actionMsg,setActionMsg]=useState('');
 const target=nextEditableWorkout(s.workouts,today());
 const last=lastSession(s.workouts,ex.id);
 const rec=recommendationFor(ex,s);
 /* The one rule for changing a future workout (src/engine/workoutEdit.ts): not started, equipment available, not already in it. */
 const addToNext=()=>{
  if(!target){setActionMsg('There is no upcoming workout to add to. Create or reschedule one in Plan Studio first.');return;}
  const now=new Date().toISOString();
  const check=addExerciseToWorkout(target,ex,{equipment:s.profile?.equipment,now});
  if(!check.ok){setActionMsg(check.message);return;}
  update(x=>{
   const current=x.workouts.find(w=>w.id===target.id);
   if(!current)return x;
   const result=addExerciseToWorkout(current,ex,{equipment:x.profile?.equipment,now});
   if(!result.ok)return x;
   const nextPlan=x.plan?planWithDays(x.plan,x.plan.days):x.plan;
   const nextW={...result.workout,currentPlanVersion:nextPlan?nextPlan.version:result.workout.currentPlanVersion};
   return {...x,workouts:x.workouts.map(w=>w.id===nextW.id?nextW:w),plan:nextPlan,eventLog:[...(x.eventLog||[]),{id:uid('evt'),type:'plan_edit',timestamp:now,payload:{reason:'add exercise from library',exerciseId:ex.id,workoutId:nextW.id}}]};
  });
  setActionMsg(`Added to ${target.name} on ${target.scheduledDate}.`);
 };
 const history=<Detail title="YOUR HISTORY">{last
  ?<><p className="a3-muted">{last.date}</p><ul>{last.sets.map(x=><li key={x.id}>{describeSet(ex,x)}</li>)}</ul></>
  :<p>Your first sets on this exercise start the record.</p>}</Detail>;
 const progression=<Detail title="PROGRESSION">
  <p>Aim for {ex.repRange[0]}–{ex.repRange[1]} {ex.loadSemantics==='time'?'seconds':'reps'} per set.{rec.weight!==undefined?` Current starting weight: ${formatLoad(ex,rec.weight)}.`:''}</p>
  {(variations.progressions.length>0||variations.regressions.length>0)&&<div className="a3-list a3-picklist">{variations.progressions.map(v=><button key={'p'+v.id} onClick={()=>onAlternative(v.id)}><span><strong>{v.name}</strong><small>Harder variation · same movement</small></span><Icon name="chev"/></button>)}{variations.regressions.map(v=><button key={'r'+v.id} onClick={()=>onAlternative(v.id)}><span><strong>{v.name}</strong><small>Easier variation · same movement</small></span><Icon name="chev"/></button>)}</div>}
  <small className="a3-muted">Options only. APEX never swaps a programmed exercise for you.</small>
 </Detail>;
 const alternatives=<Detail title="ALTERNATIVES"><div className="a3-list a3-picklist">{alts.map(({exercise,fit,samePattern,sameLoad})=><button key={exercise.id} onClick={()=>onAlternative(exercise.id)}><span><strong>{exercise.name}</strong><small>{fit==='available'?'Available from your setup':fit==='unknown'?'Confirm equipment for today':'Not in current setup'}{advanced&&samePattern?' · same movement':''}{advanced&&sameLoad?' · same load type':''}</small></span><Icon name="chev"/></button>)}</div></Detail>;
 return <Modal title={ex.name} close={close}>
 <div className="a3-chips"><span>{patternLabel(ex.pattern)}</span><span>{ex.primaryMuscles.join(' · ')}</span><span>{loadTypeLabel(ex.loadSemantics)}</span></div>
 <Detail title="HOW TO"><ol>{ex.steps.map(x=><li key={x}>{x}</li>)}</ol></Detail>
 <Detail title="SETUP"><ul>{ex.setup.map(x=><li key={x}>{x}</li>)}</ul></Detail>
 <Detail title="TECHNIQUE"><p>{ex.breathing}{ex.tempo?` Tempo: ${ex.tempo}.`:''}</p>
  {ex.cues.length>0&&<><small className="a3-muted">Keep in mind</small><ul>{ex.cues.map(x=><li key={x}>{x}</li>)}</ul></>}
  <small className="a3-muted">Common mistakes</small><ul>{ex.mistakes.map(x=><li key={x}>{x}</li>)}</ul>
  {(()=>{const note=explainSafety(ex);return <><small className="a3-muted">Stay safe</small><ul>{note.lines.map(x=><li key={x}>{x}</li>)}{ex.safety.map(x=><li key={x}>{x}</li>)}</ul>{note.modifications.length>0&&<><small className="a3-muted">Modifications</small><ul>{note.modifications.map(x=><li key={x}>{x}</li>)}</ul></>}{note.guidance.length>0&&<ul>{note.guidance.map(x=><li key={x}>{x}</li>)}</ul>}<small className="a3-muted">{note.boundary}</small></>})()}
 </Detail>
 <Detail title="MUSCLES"><p>{ex.primaryMuscles.join(' · ')}{ex.secondaryMuscles?.length?` · also ${ex.secondaryMuscles.join(' · ')}`:''}</p></Detail>
 <Detail title="EQUIPMENT"><p>{ex.equipment.length?ex.equipment.map(labelFor).join(' · '):'No dedicated equipment required.'}</p></Detail>
 {standard?<>{history}{progression}{alternatives}</>:<>
  <Disclosure label="YOUR HISTORY">{history}</Disclosure>
  <Disclosure label="PROGRESSION">{progression}</Disclosure>
  <Disclosure label="ALTERNATIVES">{alternatives}</Disclosure>
 </>}
 <Disclosure label="Why am I using this movement?"><CoachAnswer s={s} question={`Why am I using ${ex.name}?`}/></Disclosure>
 <p className="a3-muted" id="library-add-hint">{target?`Adds ${ex.name} to your next workout: ${target.name} on ${target.scheduledDate}.`:'No upcoming workout to add to yet.'}</p>
 <div className="a3-actions"><button className="a3-cta" aria-describedby="library-add-hint" onClick={addToNext}>Use in training</button><button className="a3-cta a3-cta-ghost" onClick={onPlan}>Open Plan Studio</button></div>{actionMsg&&<p className="a3-muted" role="status">{actionMsg}</p>}</Modal>
}
export function Learn(){const terms=[['RIR','Reps in reserve: an estimate of how many clean reps you could still perform.'],['RPE','Rate of perceived exertion: a subjective effort description.'],['PR','Personal record: a meaningful achievement appropriate to the movement and set type.'],['ROM','Range of motion: the distance through which a movement travels.'],['AMRAP','As many appropriate reps as the set context allows.'],['Tempo','The cadence of a repetition, such as 2–1–2.'],['Volume','The amount of training work; the exact measure depends on the exercise.'],['Progressive overload','Gradually increasing a useful training stimulus over time.'],['Deload','A reduction in training stress when context supports recovery.']];return <div className="a3-home"><PageTitle eyebrow="LEARN" title="Know what the numbers mean." sub="Tap concepts when you need them. APEX introduces complexity progressively."/><div className="a3-list">{terms.map(([a,b])=><div className="a3-card a3-stack" key={a}><strong>{a}</strong><p>{b}</p></div>)}</div></div>}
