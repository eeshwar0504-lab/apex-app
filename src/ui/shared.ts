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
