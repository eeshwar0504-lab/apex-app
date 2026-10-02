import {useState} from 'react';
import {imageKindForExercise} from '../imagery';
import type {AppState,Exercise} from '../core/types';
import {findExercises} from '../knowledge/exercises';
import {explainSafety} from '../engine/exerciseSafety';
import {variationOptions} from '../engine/exerciseGraph';
import {addExerciseToWorkout,nextEditableWorkout} from '../engine/workoutEdit';
import {uid,planWithDays,equipmentFit,smartAlternatives} from '../engine/training';
import {knowledgeReport} from '../knowledge/knowledgeGraph';
import {today,formatLoad} from '../ui/shared';
import {Icon,ApexImage,Detail,PageTitle} from '../ui/primitives';
import {Modal} from '../ui/dialogs';

export function Library({s,query,setQuery,onExercise}:{s:AppState;query:string;setQuery:(x:string)=>void;onExercise:(id:string)=>void}){
 const [equipmentOnly,setEquipmentOnly]=useState(false);
 const available=s.profile?.equipment||[];
 const filtered=findExercises(query).filter(e=>s.exercises.some(x=>x.id===e.id)).filter(e=>!equipmentOnly||equipmentFit(e,available)!=='unavailable');
 const equipmentLabel=available.length?`${available.length} equipment types available`:'Equipment not set'; const report=knowledgeReport(s);
 return <div className="a3-home"><PageTitle eyebrow="EXERCISE LIBRARY" title="Find a movement." sub="Canonical identity, aliases, equipment, load semantics and alternatives."/>
 <div className="a3-search"><Icon name="search"/><input aria-label="Search the exercise library" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Chest press, row, squat…"/></div>
 <div className="a3-chips">{['','horizontal_push','horizontal_pull','vertical_pull','squat','hinge','core','arm_flexion'].map(x=><button className="a3-pill" key={x||'all'} onClick={()=>setQuery(x)}>{x?x.replace('_',' '):'all'}</button>)}</div>
 <div className="a3-toolbar"><span className="a3-muted">{filtered.length} movements · {equipmentLabel}</span><span className="a3-muted">Knowledge {report.healthy?'validated':`${report.errors} issues`}</span><label className="a3-toggle"><span>Available equipment first</span><input type="checkbox" checked={equipmentOnly} onChange={e=>setEquipmentOnly(e.target.checked)}/></label></div>
 <div className="a3-list library-grid">{filtered.map(e=>{const fit=equipmentFit(e,available);return <button aria-label={`View details for ${e.name}`} className="a3-card a3-tile a3-tap exercise-tile" key={e.id} onClick={()=>onExercise(e.id)}><span className="a3-chip">{e.loadSemantics.replace('_',' ')}</span><strong>{e.name}</strong><small>{e.primaryMuscles.join(' · ')}</small><span>{e.repRange[0]}–{e.repRange[1]} · {e.equipment.join(', ')}</span>{available.length>0&&<em className={`a3-chip a3-fit-${fit}`}>{fit==='available'?'Available from your setup':fit==='unknown'?'Confirm for today':'Not in setup'}</em>}</button>})}</div></div>
}
export function ExerciseSheet({ex,s,update,close,onPlan,onAlternative}:{ex:Exercise;s:AppState;update:(f:(x:AppState)=>AppState)=>void;close:()=>void;onPlan:()=>void;onAlternative:(id:string)=>void}){
 const alts=smartAlternatives(ex,s.exercises,s.profile?.equipment);
 const variations=variationOptions(ex,s.exercises,s.profile?.equipment);
 const [actionMsg,setActionMsg]=useState('');
 const target=nextEditableWorkout(s.workouts,today());
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
 return <Modal title={ex.name} close={close}><ApexImage kind={imageKindForExercise(ex)} alt={`Training context for ${ex.name}.`} className="a3-banner" caption={`${ex.pattern.replace(/_/g,' ')} / MOVEMENT CONTEXT`}/><div className="a3-chips"><span>{ex.family}</span><span>{ex.primaryMuscles.join(' · ')}</span><span>{formatLoad(ex,undefined)}</span></div>
 <Detail title="EQUIPMENT"><p>{ex.equipment.length?ex.equipment.join(' · '):'No dedicated equipment required.'}</p></Detail>
 <Detail title="SETUP"><ul>{ex.setup.map(x=><li key={x}>{x}</li>)}</ul></Detail><Detail title="EXECUTION"><ol>{ex.steps.map(x=><li key={x}>{x}</li>)}</ol></Detail><Detail title="BREATHING & TEMPO"><p>{ex.breathing}{ex.tempo?` Tempo: ${ex.tempo}.`:''}</p></Detail><Detail title="CUES"><div className="a3-chips">{ex.cues.map(x=><span key={x}>{x}</span>)}</div></Detail><Detail title="COMMON MISTAKES"><ul>{ex.mistakes.map(x=><li key={x}>{x}</li>)}</ul></Detail><Detail title="SAFETY">{(()=>{const note=explainSafety(ex);return <><ul>{note.lines.map(x=><li key={x}>{x}</li>)}</ul>{note.modifications.length>0&&<><small className="a3-muted">Modifications</small><ul>{note.modifications.map(x=><li key={x}>{x}</li>)}</ul></>}{note.guidance.length>0&&<ul>{note.guidance.map(x=><li key={x}>{x}</li>)}</ul>}<small className="a3-muted">General</small><ul>{ex.safety.map(x=><li key={x}>{x}</li>)}</ul><small className="a3-muted">{note.boundary}</small></>})()}</Detail>
 {(variations.progressions.length>0||variations.regressions.length>0)&&<Detail title="VARIATIONS"><div className="a3-list a3-picklist">{variations.progressions.map(v=><button key={'p'+v.id} onClick={()=>onAlternative(v.id)}><span><strong>{v.name}</strong><small>Harder variation · same movement</small></span><Icon name="chev"/></button>)}{variations.regressions.map(v=><button key={'r'+v.id} onClick={()=>onAlternative(v.id)}><span><strong>{v.name}</strong><small>Easier variation · same movement</small></span><Icon name="chev"/></button>)}</div><small className="a3-muted">Options only. APEX never swaps a programmed exercise for you.</small></Detail>}
 <Detail title="ALTERNATIVES"><div className="a3-list a3-picklist">{alts.map(({exercise,fit,samePattern,sameLoad})=><button key={exercise.id} onClick={()=>onAlternative(exercise.id)}><span><strong>{exercise.name}</strong><small>{fit==='available'?'Available from your setup':fit==='unknown'?'Confirm equipment for today':'Not in current setup'}{samePattern?' · same pattern':''}{sameLoad?' · same load semantics':''}</small></span><Icon name="chev"/></button>)}</div></Detail>
 <p className="a3-muted" id="library-add-hint">{target?`Adds ${ex.name} to your next workout: ${target.name} on ${target.scheduledDate}.`:'No upcoming workout to add to yet.'}</p>
 <div className="a3-actions"><button className="a3-cta" aria-describedby="library-add-hint" onClick={addToNext}>Use in training</button><button className="a3-cta a3-cta-ghost" onClick={onPlan}>Open Plan Studio</button></div>{actionMsg&&<p className="a3-muted" role="status">{actionMsg}</p>}</Modal>
}
export function Learn(){const terms=[['RIR','Reps in reserve: an estimate of how many clean reps you could still perform.'],['RPE','Rate of perceived exertion: a subjective effort description.'],['PR','Personal record: a meaningful achievement appropriate to the movement and set type.'],['ROM','Range of motion: the distance through which a movement travels.'],['AMRAP','As many appropriate reps as the set context allows.'],['Tempo','The cadence of a repetition, such as 2–1–2.'],['Volume','The amount of training work; the exact measure depends on the exercise.'],['Progressive overload','Gradually increasing a useful training stimulus over time.'],['Deload','A reduction in training stress when context supports recovery.']];return <div className="a3-home"><PageTitle eyebrow="LEARN" title="Know what the numbers mean." sub="Tap concepts when you need them. APEX introduces complexity progressively."/><div className="a3-list">{terms.map(([a,b])=><div className="a3-card a3-stack" key={a}><strong>{a}</strong><p>{b}</p></div>)}</div></div>}
