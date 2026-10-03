import type {AppState,Exercise,SetLog} from '../core/types';
import {setLoad,isWorkingSet} from '../engine/training';
import {recoveryStatus} from '../engine/deload';
import {addDaysLocal,workoutDay} from '../data/dates';
import {formatLoad,today} from '../ui/shared';
import {trainingWeek} from '../ui/week';
import type {NodeState} from '../ui/week';
import {useExperience} from '../ui/experience';

/* ------------------------------------------------------------------ strength: a continuous trajectory whose points open their evidence */
export type TrajectoryPoint={id:string;date:string;value:number;pr?:boolean};
export function ApexTrajectory({points,label,selected,onSelect,xLabels,fresh}:{points:TrajectoryPoint[];label:string;selected?:string;onSelect:(id:string)=>void;xLabels?:[string,string];fresh?:string}){
 if(points.length<2){
  return <p className="a3-muted a3-note">{points.length?'One session is on the line. The next one draws the trajectory.':'Your first session draws the first line.'}</p>;
 }
 const w=320,h=xLabels?156:136,padL=14,padR=14,padT=18,padB=xLabels?30:16;
 const values=points.map(p=>p.value),min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,0.1);
 const x=(i:number)=>padL+i*(w-padL-padR)/(points.length-1);
 const y=(v:number)=>h-padB-((v-min)/span)*(h-padT-padB);
 const line=points.map((p,i)=>`${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
 return <svg className="apex-traj" viewBox={`0 0 ${w} ${h}`} role="group" aria-label={label}>
  <line className="apex-traj-base" x1={padL} x2={w-padR} y1={h-padB} y2={h-padB}/>
  <polyline className="apex-traj-line" points={line}/>
  {points.map((p,i)=>{
   const on=selected===p.id;
   return <g key={p.id} role="button" tabIndex={0} aria-pressed={on} aria-label={`${p.date}${p.pr?', personal record':''}: open the sets`} className={`apex-traj-point${on?' is-selected':''}${fresh===p.id?' is-fresh':''}`}
    onClick={()=>onSelect(p.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(p.id)}}}>
    <circle className="apex-traj-hit" cx={x(i)} cy={y(p.value)} r={18}/>
    {p.pr
     ?<path className="apex-traj-pr" d={`M${x(i)} ${y(p.value)-7} l5 5 l-5 5 l-5 -5 z`}/>
     :<circle className="apex-traj-dot" cx={x(i)} cy={y(p.value)} r={on?5:3.5}/>}
   </g>;
  })}
  {xLabels&&<><text x={padL} y={h-8} className="a3-spark-axis">{xLabels[0]}</text><text x={w-padR} y={h-8} textAnchor="end" className="a3-spark-axis">{xLabels[1]}</text></>}
 </svg>;
}

/* the sets behind one point: exercise, session, set */
export function EvidenceSets({ex,sets,date,standard}:{ex:Exercise;sets:SetLog[];date:string;standard:boolean}){
 const rows=sets.filter(x=>x.completed&&x.type!=='warmup');
 return <table className="apex-evidence-table" aria-label={`Sets from ${date}`}>
  <thead><tr><th scope="col">Set</th><th scope="col">Load</th><th scope="col">Reps</th>{standard&&<th scope="col">RIR</th>}</tr></thead>
  <tbody>{rows.map((x,i)=>{const l=setLoad(ex,x);return <tr key={x.id}><th scope="row">{i+1}</th><td>{ex.loadSemantics==='bodyweight'?'Bodyweight':ex.loadSemantics==='time'?`${x.seconds??'—'} sec`:l!==undefined?formatLoad(ex,l):'—'}</td><td>{ex.loadSemantics==='time'?'—':x.reps??'—'}</td>{standard&&<td>{x.rir??'—'}</td>}</tr>})}</tbody>
 </table>;
}

/* ------------------------------------------------------------------ volume: layered accumulation */
export function volumeByWeek(s:AppState,weeks=8){
 const rows:Array<{start:string;total:number;layers:Array<{muscle:string;value:number}>}>=[];
 for(let k=weeks-1;k>=0;k--){
  const wk=trainingWeek(s,-k);
  const per:Record<string,number>={};
  for(const w of s.workouts.filter(x=>x.status==='completed'&&workoutDay(x)>=wk.start&&workoutDay(x)<=wk.end)){
   for(const we of w.exercises){
    const ex=s.exercises.find(e=>e.id===we.exerciseId);
    if(!ex)continue;
    const muscle=ex.primaryMuscles[0]||'other';
    for(const set of we.sets.filter(isWorkingSet)){
     if(!set.completed)continue;
     const v=(setLoad(ex,set)??0)*(set.reps||0)||0;
     per[muscle]=(per[muscle]||0)+v;
    }
   }
  }
  const layers=Object.entries(per).sort((a,b)=>b[1]-a[1]).map(([muscle,value])=>({muscle,value}));
  rows.push({start:wk.start,total:layers.reduce((n,l)=>n+l.value,0),layers});
 }
 return rows;
}
export function LayeredVolume({rows,format}:{rows:ReturnType<typeof volumeByWeek>;format:(n:number)=>string}){
 const max=Math.max(1,...rows.map(r=>r.total));
 return <div className="apex-layers" role="list" aria-label="Weekly volume by muscle">
  {rows.map(r=><div role="listitem" className="apex-layer-col" key={r.start} aria-label={`Week of ${r.start}: ${format(r.total)}`}>
   <div className="apex-layer-stack" style={{height:`${Math.max(r.total?6:0,Math.round(r.total/max*100))}%`}}>
    {r.layers.map((l,i)=><i key={l.muscle} className={`layer-${Math.min(i,3)}`} style={{flexGrow:l.value}} title={`${l.muscle}: ${format(l.value)}`}/>)}
   </div>
   <small>{r.start.slice(5)}</small>
  </div>)}
 </div>;
}

/* ------------------------------------------------------------------ consistency: a rhythm map, planned rest is not failure */
const RHYTHM_TEXT:Record<NodeState,string>={done:'done',partial:'partly done',active:'in progress',planned:'planned',missed:'missed',skipped:'skipped',rest:'rest'};
export function RhythmMap({s,weeks=10}:{s:AppState;weeks?:number}){
 const rows=Array.from({length:weeks},(_,i)=>trainingWeek(s,-(weeks-1-i)));
 return <div className="apex-rhythm" role="table" aria-label="Training rhythm, one row per week">
  {rows.map(w=><div role="row" className={`apex-rhythm-row${w.deload?' is-deload':''}`} key={w.start}>
   <span role="rowheader" className="apex-rhythm-label">{w.start.slice(5)}{w.deload?' · deload':''}</span>
   <span className="apex-rhythm-dots">{w.nodes.map(n=><i role="cell" key={n.iso} className={`is-${n.state}${n.today?' is-today':''}`} aria-label={`${n.iso}: ${RHYTHM_TEXT[n.state]}`}/>)}</span>
   <span className="apex-rhythm-count">{w.sessions.done}/{w.sessions.planned}</span>
  </div>)}
 </div>;
}

/* ------------------------------------------------------------------ recovery: a state trajectory, in words */
const LEVEL_ORDER=['NORMAL','ELEVATED','HIGH','RECOVERY_REQUIRED'];
const LEVEL_TEXT:Record<string,string>={NORMAL:'Normal',ELEVATED:'Elevated',HIGH:'High',RECOVERY_REQUIRED:'Recovery needed'};
function recoveryTrajectory(s:AppState,weeks=8){
 const out:Array<{iso:string;level:string;status:string}>=[];
 for(let k=weeks-1;k>=0;k--){
  const iso=k===0?today():addDaysLocal(trainingWeek(s,-k).end,0);
  const a=recoveryStatus(s,iso);
  if(a)out.push({iso,level:a.level,status:a.status});
 }
 return out;
}
export function RecoveryTrajectory({s}:{s:AppState}){
 const pts=recoveryTrajectory(s);
 const {advanced}=useExperience();
 if(pts.length<2)return <p className="a3-muted a3-note">Complete a few sessions and APEX will begin finding patterns.</p>;
 const w=320,h=120,pad=18;
 const x=(i:number)=>pad+i*(w-2*pad)/(pts.length-1);
 const y=(lvl:string)=>h-pad-(LEVEL_ORDER.indexOf(lvl)/(LEVEL_ORDER.length-1))*(h-2*pad);
 return <div className="apex-recovery">
  <svg className="apex-traj" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Fatigue state over ${pts.length} weeks: ${pts.map(p=>`${p.iso} ${LEVEL_TEXT[p.level]}`).join(', ')}`}>
   <line className="apex-traj-base" x1={pad} x2={w-pad} y1={h-pad} y2={h-pad}/>
   <polyline className="apex-traj-line" points={pts.map((p,i)=>`${x(i)},${y(p.level)}`).join(' ')}/>
   {pts.map((p,i)=><circle key={p.iso} className={`apex-traj-dot${p.status==='deload_active'?' is-deload':''}`} cx={x(i)} cy={y(p.level)} r={3.5}/>)}
  </svg>
  <ul className="apex-recovery-list">{pts.map(p=><li key={p.iso}><span>{p.iso.slice(5)}</span><strong>{LEVEL_TEXT[p.level]}</strong>{advanced&&p.status!=='normal'&&<small>{p.status.replace(/_/g,' ')}</small>}</li>)}</ul>
 </div>;
}

