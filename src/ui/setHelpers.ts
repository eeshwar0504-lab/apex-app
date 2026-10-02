import type {Exercise,SetLog,UserProfile} from '../core/types';
import {loadDetailForSet,dumbbellTotalLoad,barbellLoadBreakdown,formatTimedDuration} from '../engine/training';
import {displayText} from '../data/units';
import {formatLoadDetail} from './shared';

export function safeExercise(exercises:Exercise[],id:string){return exercises.find(e=>e.id===id);}
/* Warm-up sets (src/engine/warmup.ts) are ordinary sets of type 'warmup'. They are shown, completed, skipped and edited like any set, but they never count as working sets. */
export const isWarm=(x?:SetLog)=>x?.type==='warmup';
export const workingOf=(sets:SetLog[])=>sets.filter(x=>x.type!=='warmup');
export const pendingSet=(x:SetLog)=>!x.completed&&!(x.type==='warmup'&&x.disposition==='skipped');
export const setCounter=(sets:SetLog[],index:number)=>{const x=sets[index];if(!x)return '';if(isWarm(x)){const w=sets.filter(isWarm);return `WARM-UP ${w.indexOf(x)+1} / ${w.length}`}const work=workingOf(sets);return `SET ${work.indexOf(x)+1} / ${work.length}`};
export const phase6LoadDisplay=(...a:Parameters<typeof phase6LoadDisplayRaw>)=>{const r=phase6LoadDisplayRaw(...a);return {primary:displayText(r.primary),secondary:r.secondary===undefined?undefined:displayText(r.secondary)}};
function phase6LoadDisplayRaw(ex:Exercise,set?:SetLog,fallback?:number,profile?:UserProfile):{primary:string;secondary?:string}{
 if(ex.loadSemantics==='bodyweight')return {primary:'BODYWEIGHT'};
 if(ex.loadSemantics==='none')return {primary:'NO EXTERNAL LOAD'};
 if(ex.loadSemantics==='time'){const seconds=set?.seconds??ex.repRange[0];return {primary:formatTimedDuration(seconds),secondary:`Target ${ex.repRange[0]}–${ex.repRange[1]} sec`};}
 const value=set?.weight??fallback;
 if(value===undefined)return {primary:'START LIGHT',secondary:'Pick a weight you can control for every rep'};
 const detail=loadDetailForSet(ex,value,set?.loadDetail);
 if(ex.loadSemantics==='per_hand'){const total=dumbbellTotalLoad(ex,value);return {primary:`${value} kg / hand`,secondary:total===undefined?undefined:`${total} kg total · ${ex.unilateral?'unilateral':'both hands'}`};}
 if(ex.loadSemantics==='stack')return {primary:`${value} kg stack`,secondary:ex.equipment.includes('cable')&&!ex.equipment.includes('machine')?'Cable stack':'Machine stack'};
 if(ex.equipment.includes('barbell')){const barWeight=profile?.barbellBarKg??detail.barWeightKg;const breakdown=barbellLoadBreakdown(value,barWeight);return {primary:`${value} kg total`,secondary:breakdown.plateLoadKg!==undefined?`${breakdown.barWeightKg} kg bar + ${breakdown.plateLoadKg} kg plates`:'Total load · bar weight not configured'};}
 return {primary:formatLoadDetail(ex,value,detail),secondary:ex.loadDescription};
}
