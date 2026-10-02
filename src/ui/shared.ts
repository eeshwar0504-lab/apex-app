import type {SetType} from '../core/types';
import {todayLocal} from '../data/dates';
import {formatLoad as engineFormatLoad,formatLoadDetail as engineFormatLoadDetail} from '../engine/training';
import {displayText} from '../data/units';

export const today=()=>todayLocal();
/* Engine strings are authored in kg; convert at the presentation boundary only. */
export const formatLoad=(...a:Parameters<typeof engineFormatLoad>)=>displayText(engineFormatLoad(...a));
export const formatLoadDetail=(...a:Parameters<typeof engineFormatLoadDetail>)=>displayText(engineFormatLoadDetail(...a));
export const fmt=(n:number)=>`${String(Math.floor(Math.max(0,n)/60)).padStart(2,'0')}:${String(Math.max(0,n)%60).padStart(2,'0')}`;
export const SET_TYPES:SetType[]=['warmup','working','drop','failure','amrap','rest_pause','myo_reps','tempo','cluster','timed','bodyweight','assisted','unilateral'];
/* Plan names may be generated in capitals; the reference shows editorial title case. */
export const niceName=(n:string)=>n&&n===n.toUpperCase()?n.toLowerCase().split(' ').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' '):n;
/* User-facing wording for internal identifiers. The identifiers themselves (pattern, equipment key, source) are never changed; only how they read. */
const PATTERN_LABELS:Record<string,string>={horizontal_push:'Pushing',vertical_pull:'Pulling down',horizontal_pull:'Pulling in',vertical_push:'Pressing overhead',shoulder_abduction:'Shoulders',arm_flexion:'Arms (biceps)',arm_extension:'Arms (triceps)',squat:'Legs',unilateral_squat:'Legs, one side at a time',knee_flexion:'Back of the legs',knee_extension:'Front of the legs',calf:'Calves',core:'Core',hinge:'Hips and back of the legs'};
const humanise=(x:string)=>{const t=x.replace(/_/g,' ').trim();return t.charAt(0).toUpperCase()+t.slice(1)};
export const patternLabel=(pattern:string)=>PATTERN_LABELS[pattern]||humanise(pattern);
const EQUIPMENT_LABELS:Record<string,string>={machine:'Machines',cable:'Cable station',dumbbell:'Dumbbells',barbell:'Barbell',bench:'Bench',kettlebell:'Kettlebell',resistance_band:'Resistance band',band:'Resistance band',pullup_bar:'Pull-up bar',dip_station:'Dip station',smith_machine:'Smith machine',ez_bar:'EZ bar',trap_bar:'Trap bar',plate:'Weight plates',bodyweight:'Bodyweight'};
export const equipmentLabel=(item:string)=>EQUIPMENT_LABELS[item]||humanise(item).replace(/\b\w/g,c=>c.toUpperCase());
/* a session's `source` is bookkeeping; only the ones a person chose to create are worth naming */
export const sourceLabel=(source?:string)=>source==='extra'?'Extra session':source==='custom'?'Custom session':source==='template'?'From a template':'';
const LOAD_TYPE_LABELS:Record<string,string>={per_hand:'Dumbbells',total:'Total weight',stack:'Weight stack',assistance:'Assisted',bodyweight:'Bodyweight',time:'Timed',none:'No weight'};
export const loadTypeLabel=(semantics:string)=>LOAD_TYPE_LABELS[semantics]||humanise(semantics);
