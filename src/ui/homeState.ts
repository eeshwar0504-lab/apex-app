import type {AppState} from '../core/types';
import {addDaysLocal} from '../data/dates';
import {recoveryStatus} from '../engine/deload';
import {today} from './shared';

/*
 * The state Home reflects: normal, progressing, returning, fatigued, deload or recovery. Every word comes from an engine result that
 * already exists (the fatigue/deload assessment, the return-to-training rule, recorded achievements); nothing is guessed. The state
 * only changes emphasis and a short note, never a prescription.
 */
type HomeStateId='normal'|'progressing'|'returning'|'fatigued'|'deload'|'recovery';
type HomeState={id:HomeStateId;label:string;note:string};

export function homeState(s:AppState,returning:boolean):HomeState{
 const rs=recoveryStatus(s,today());
 if(rs?.status==='deload_active'){const d=rs.daysLeft??0;return {id:'deload',label:'DELOAD',note:`Deload week${d?`, ${d} day${d===1?'':'s'} left`:''}. Lighter by design.`}}
 if(rs?.status==='recovery_complete')return {id:'recovery',label:'RECOVERY',note:'Settling back in after your deload.'};
 if(rs?.status==='deload_recommended'||rs?.status==='sustained_fatigue')return {id:'fatigued',label:'LOAD HIGH',note:'Training load has been high lately.'};
 if(returning)return {id:'returning',label:'RETURNING',note:'Easing back in: loads start lighter after the break.'};
 const weekAgo=addDaysLocal(today(),-7);
 if(s.achievements.some(a=>String(a.timestamp||'').slice(0,10)>=weekAgo))return {id:'progressing',label:'PROGRESSING',note:'A personal record in the last week.'};
 return {id:'normal',label:'',note:''};
}
