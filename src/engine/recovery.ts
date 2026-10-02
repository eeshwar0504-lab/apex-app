import type {RecoveryCheckIn} from '../core/types';

/**
 * Recovery context (sleep, fatigue, soreness, ...) is EVIDENCE for the Coach.
 * It is never an input to load prescription: nothing in the training engine
 * reads it. This module only defines the accepted value ranges and the single
 * normalizer used by both the UI input boundary and the persistence boundary.
 *
 * Ranges:  sleepHours 0-24 (0.5 steps are typical, any finite value is kept);
 *          quality / soreness / fatigue / stress / readiness 1-5 whole numbers
 *          (1 = lowest value on the scale, 5 = highest).
 */
export const RECOVERY_SCALE_FIELDS = ['sleepQuality','soreness','fatigue','stress','readiness'] as const;
export type RecoveryScaleField = typeof RECOVERY_SCALE_FIELDS[number];

const isoDate=/^\d{4}-\d{2}-\d{2}$/;

function clampNumber(value:unknown,min:number,max:number,whole:boolean):number|undefined{
 if(typeof value!=='number'||!Number.isFinite(value))return undefined;
 const clamped=Math.min(max,Math.max(min,value));
 return whole?Math.round(clamped):Math.round(clamped*10)/10;
}

/**
 * Returns a clean check-in, or undefined when the date is invalid or no field
 * holds a usable number. Non-numeric, NaN and Infinity values are dropped;
 * finite out-of-range values are clamped into range.
 */
export function normalizeRecoveryCheckIn(raw:unknown):RecoveryCheckIn|undefined{
 if(!raw||typeof raw!=='object')return undefined;
 const input=raw as Record<string,unknown>;
 if(typeof input.date!=='string'||!isoDate.test(input.date))return undefined;
 const out:RecoveryCheckIn={date:input.date};
 const hours=clampNumber(input.sleepHours,0,24,false);
 if(hours!==undefined)out.sleepHours=hours;
 for(const key of RECOVERY_SCALE_FIELDS){
  const value=clampNumber(input[key],1,5,true);
  if(value!==undefined)out[key]=value;
 }
 for(const key of ['recentIllness','pain','discomfort'] as const){
  if(input[key]===true)out[key]=true;
 }
 return Object.keys(out).length>1?out:undefined;
}

/** Clean a persisted log: drop unusable entries, keep one entry per date (the last one wins), sort by date. */
export function normalizeRecoveryLog(raw:unknown):RecoveryCheckIn[]{
 if(!Array.isArray(raw))return [];
 const byDate=new Map<string,RecoveryCheckIn>();
 for(const item of raw){
  const clean=normalizeRecoveryCheckIn(item);
  if(clean)byDate.set(clean.date,clean);
 }
 return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}

/** Insert or replace today's check-in. */
export function upsertRecoveryCheckIn(log:RecoveryCheckIn[]|undefined,checkIn:unknown):RecoveryCheckIn[]{
 const clean=normalizeRecoveryCheckIn(checkIn);
 if(!clean)return normalizeRecoveryLog(log);
 return normalizeRecoveryLog([...(log||[]).filter(x=>x.date!==clean.date),clean]);
}

/** The newest check-in that is at most `maxAgeDays` old relative to `today` (YYYY-MM-DD). */
export function latestRecoveryCheckIn(log:RecoveryCheckIn[]|undefined,today:string,maxAgeDays=1):RecoveryCheckIn|undefined{
 const now=Date.parse(`${today}T00:00:00Z`);
 if(!Number.isFinite(now))return undefined;
 return normalizeRecoveryLog(log).filter(x=>{
  const age=(now-Date.parse(`${x.date}T00:00:00Z`))/86400000;
  return age>=0&&age<=maxAgeDays;
 }).at(-1);
}
