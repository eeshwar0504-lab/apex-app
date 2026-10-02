import type {Exercise,SetLog,SetType,UserProfile} from '../core/types';
import {snapToAvailableLoad,adjacentAvailableLoad,loadDetailForSet} from '../engine/training';
import {getUnits,wtInput,fromWt,weightLabel} from '../data/units';
import {SET_TYPES} from '../ui/shared';
import {Icon,BumpInput} from '../ui/primitives';

export function SetEditor({set,ex,index,onChange,onType,onComplete,onAdd,onRemove,targetRir=2,focused=false,hideOptions=false,loadProfile,showRir=true,showNotes=true}:{set:SetLog;ex:Exercise;index:number;onChange:(p:Partial<SetLog>)=>void;onType:(t:SetType)=>void;onComplete:()=>void;onAdd:()=>void;onRemove:()=>void;targetRir?:number;focused?:boolean;hideOptions?:boolean;loadProfile?:UserProfile;showRir?:boolean;showNotes?:boolean}){
 const timed=set.type==='timed'||ex.loadSemantics==='time';
 const assist=set.type==='assisted'||ex.loadSemantics==='assistance';
 const loadable=
   !timed&&
   !assist&&
   !['bodyweight','none'].includes(ex.loadSemantics);


 const stepValue=(key:'weight'|'reps'|'rir',delta:number)=>{
   if(key==='weight'){
     const next=adjacentAvailableLoad(ex,set.weight,loadProfile,delta>0?'up':'down');
     if(next!==undefined)onChange({weight:next,loadDetail:loadDetailForSet(ex,next,set.loadDetail)});
     return;
   }

   if(key==='reps'){
     onChange({
       reps:Math.max(0,(Number(set.reps)||0)+delta)
     });
     return;
   }

   onChange({
     rir:Math.max(
       0,
       Math.min(
         5,
         (set.rir===undefined?targetRir:set.rir)+delta
       )
     )
   });
 };

 if(focused){
   return <div className={`a3-stack a3-seteditor a3-logform ${set.completed?'done':''}`}>
     <div className="a3-stack">
       <div className="a3-fields">

       {loadable&&
         <div className="a3-control">
           <small>Weight ({weightLabel()})</small>
           <div className="a3-stepper">
             <button
               type="button"
               onClick={()=>stepValue('weight',-1)}
               aria-label="Decrease load"
             >
               −
             </button>
             <BumpInput
             className="a3-input a3-stepper-input"
             type="number"
             step={getUnits()==='imperial'?0.5:ex.incrementKg||1}
             inputMode="decimal"
             value={wtInput(set.weight)}
             placeholder={`Actual ${weightLabel()}`}
             onChange={e=>onChange({weight:e.target.value===''?undefined:Math.max(0,Math.round(fromWt(Number(e.target.value))*1000)/1000)})}
             onBlur={e=>{if(e.target.value==='')return;const raw=fromWt(Number(e.target.value));const snapped=snapToAvailableLoad(ex,raw,loadProfile);onChange({weight:snapped??raw,loadDetail:loadDetailForSet(ex,snapped??raw,set.loadDetail)});}}
           />
             <button
               type="button"
               onClick={()=>stepValue('weight',1)}
               aria-label="Increase load"
             >
               +
             </button>
           </div>
         </div>
       }

       {assist&&
         <div className="a3-control">
           <small>ASSISTANCE</small>
           <input
             className="a3-input"
             type="number"
             step={getUnits()==='imperial'?0.5:ex.incrementKg||1}
             inputMode="decimal"
             value={wtInput(set.assistance)}
             placeholder={weightLabel()}
             onChange={e=>
               onChange({
                 assistance:e.target.value===''?undefined:Math.max(0,Math.round(fromWt(Number(e.target.value))*1000)/1000)
               })
             }
           />
         </div>
       }

       {timed
         ?<div className="a3-control">
           <small>SECONDS</small>
           <input
             className="a3-input"
             type="number"
             min="1"
             inputMode="numeric"
             value={set.seconds??''}
             placeholder={`${ex.repRange[0]} sec`}
             onChange={e=>
               onChange({
                 seconds:
                   e.target.value===''
                     ?undefined
                     :Math.max(0,Number(e.target.value))
               })
             }
           />
         </div>
         :<div className="a3-control">
           <small>Reps</small>
           <div className="a3-stepper">
             <button
               type="button"
               onClick={()=>stepValue('reps',-1)}
               aria-label="Decrease reps"
             >
               −
             </button>
             <input
             className="a3-input a3-stepper-input"
             type="number"
             inputMode="numeric"
             value={set.reps??''}
             placeholder="Optional"
             onChange={e=>
               onChange({
                 reps:
                   e.target.value===''
                     ?undefined
                     :Math.max(0,Number(e.target.value))
               })
             }
           />
             <button
               type="button"
               onClick={()=>stepValue('reps',1)}
               aria-label="Increase reps"
             >
               +
             </button>
           </div>
         </div>
       }

       {showRir&&<div className="a3-control">
         <small>RIR (reps left in the tank) · optional</small>
         <div className="a3-stepper">
           <button
             type="button"
             onClick={()=>stepValue('rir',-1)}
             aria-label="Decrease RIR"
           >
             −
           </button>
           <input
           className="a3-input a3-stepper-input"
           type="number"
           min="0"
           max="5"
           value={set.rir??''}
           placeholder={`Target ${targetRir}`}
           onChange={e=>
             onChange({
               rir:
                 e.target.value===''
                   ?undefined
                   :Math.max(
                     0,
                     Math.min(
                       5,
                       Number(e.target.value)
                     )
                   )
             })
           }
         />
           <button
             type="button"
             onClick={()=>stepValue('rir',1)}
             aria-label="Increase RIR"
           >
             +
           </button>
         </div>
       </div>}
     </div>
     </div>

     {showNotes&&<label className="a3-control a3-notes">
       <small>Notes (optional)</small>
       <textarea
         className="a3-input"
         rows={2}
         aria-label="Set notes"
         value={set.note??''}
         placeholder="Felt good, tempo, grip…"
         onChange={e=>onChange({note:e.target.value||undefined})}
       />
     </label>}

     <div className="a3-actions">
       <button
         className={`a3-cta a3-complete ${set.completed?'completed':''}`}
         onClick={onComplete}
         aria-label={set.completed?'Undo set':'Log set'}
       >
         <Icon name="check"/>
         <span>
           {set.completed?'SET LOGGED ✓':'LOG SET'}
         </span>
       </button>
     </div>

     {!hideOptions&&<details className="a3-more"><summary>More options</summary>
     <div className="a3-actions">
       <span className="a3-eyebrow">SET OPTIONS</span>
       <select
         value={set.type}
         onChange={e=>
           onType(e.target.value as SetType)
         }
         aria-label="Set type"
       >
         {SET_TYPES.map(x=>
           <option value={x} key={x}>
             {x.replace('_',' ')}
           </option>
         )}
       </select>

       <button
         className="a3-pill"
         onClick={onAdd}
       >
         + Add set
       </button>

       <button
         className="a3-pill"
         onClick={onRemove}
       >
         − Remove
       </button>
     </div>
     </details>}
   </div>;
 }

 return <div className={`a3-card a3-stack a3-seteditor ${set.completed?'done':''}`}>
   <div className="a3-actions">
     <span>{String(index+1).padStart(2,'0')}</span>
     <select
       value={set.type}
       onChange={e=>
         onType(e.target.value as SetType)
       }
       aria-label="Set type"
     >
       {SET_TYPES.map(x=>
         <option value={x} key={x}>
           {x.replace('_',' ')}
         </option>
       )}
     </select>
   </div>

   <div className="a3-fields">
     {loadable&&
       <label>
         LOAD
         <input
           type="number"
           step={getUnits()==='imperial'?0.5:ex.incrementKg}
           inputMode="decimal"
           value={wtInput(set.weight)}
           placeholder={weightLabel()}
           onChange={e=>
             onChange({
               weight:e.target.value===''?undefined:Math.round(fromWt(+e.target.value)*1000)/1000
             })
           }
         />
       </label>
     }

     {assist&&
       <label>
         ASSIST
         <input
           type="number"
           step={getUnits()==='imperial'?0.5:ex.incrementKg}
           value={wtInput(set.assistance)}
           placeholder={weightLabel()}
           onChange={e=>
             onChange({
               assistance:e.target.value===''?undefined:Math.round(fromWt(+e.target.value)*1000)/1000
             })
           }
         />
       </label>
     }

     {timed
       ?<label>
         SECONDS
         <input
           type="number"
           value={set.seconds??''}
           onChange={e=>
             onChange({
               seconds:
                 e.target.value===''
                   ?undefined
                   :Math.max(0,+e.target.value)
             })
           }
         />
       </label>
       :<label>
         REPS
         <input
           type="number"
           value={set.reps??''}
           onChange={e=>
             onChange({
               reps:
                 e.target.value===''
                   ?undefined
                   :Math.max(0,+e.target.value)
             })
           }
         />
       </label>
     }

     <label>
       RIR
       <input
         type="number"
         min="0"
         max="5"
         value={set.rir??''}
         placeholder={`Target ${targetRir}`}
         onChange={e=>
           onChange({
             rir:
               e.target.value===''
                 ?undefined
                 :Math.min(10,Math.max(0,+e.target.value))
           })
         }
       />
     </label>
   </div>

   <div className="a3-actions">
     <button
       className="a3-cta"
       onClick={onComplete}
       aria-label={set.completed?'Undo set':'Complete set'}
     >
       <Icon name="check"/>
     </button>

     <button
       className="a3-pill"
       onClick={onAdd}
     >
       +
     </button>

     <button
       className="a3-pill"
       onClick={onRemove}
     >
       −
     </button>
   </div>
 </div>;
}
