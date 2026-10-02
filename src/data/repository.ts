import type {AppState} from '../core/types';
import {EXERCISES} from '../knowledge/exercises';
import {programExercises} from '../engine/goalProgram';
import {ApexSQLiteStore} from './sqliteAdapter';
import {isUsableState,inspectState} from './integrity';
import {normalizeRecoveryLog} from '../engine/recovery';
import {MAX_PLAUSIBLE_LOAD_KG,MAX_PLAUSIBLE_REPS,MAX_PLAUSIBLE_SECONDS} from '../engine/limits';
import {normalizeUnits} from './units';

const KEY='apex-state-v4';
const SCHEMA_VERSION=4;

const fresh=():AppState=>({
 schemaVersion:SCHEMA_VERSION,goals:[],workouts:[],exercises:EXERCISES,achievements:[],measurements:[],journal:[],observations:[],
 preferences:{haptics:true,sounds:false,smartRir:true,restPreference:'adaptive',restCustomSec:120,reducedMotion:false,diagnostics:false,fontScale:'system',highContrast:false,notifications:{enabled:true,workoutReminders:true,missedWorkout:true,weeklyReview:true}},
 activeRoute:'home',onboardingComplete:false,coachMemory:[],workoutTemplates:[],learnedPreferences:{},eventLog:[]
});

/** Describes an unreadable persisted payload that was preserved and is waiting for the user's decision. */
export interface RecoveryNotice{
 detectedAt:string;
 reason:'invalid_json'|'unusable_state';
 bytes:number;
 /** True when at least part of the preserved payload can be recovered. */
 recoverable:boolean;
}

export interface RecoveryResult{
 state:AppState;
 workouts:number;
 dropped:number;
}

export interface Repository{
 recoveryNotice():RecoveryNotice|null;
 recoverRejected():RecoveryResult|null;
 startFresh():AppState;
 load():AppState;
 save(s:AppState):void;
 reset():void;
 exportJson(s:AppState):string;
 importJson(raw:string):AppState;
 loadAsync():Promise<AppState>;
 saveAsync(s:AppState):Promise<void>;
}

/**
 * Return the newest trustworthy timestamp represented by the state.
 *
 * Active workouts are deliberately included through startedAt/updatedAt so
 * an interrupted session is not mistaken for an old completed record.
 * Malformed entries are ignored rather than allowing recovery itself to fail.
 */
function stateRevision(s:AppState){
 const stamps:string[]=[];

 for(const event of Array.isArray(s?.eventLog)?s.eventLog:[]){
  const value=event?.timestamp;
  if(value)stamps.push(String(value));
 }

 for(const workout of Array.isArray(s?.workouts)?s.workouts:[]){
  if(!workout||typeof workout!=='object')continue;
  const value=workout.updatedAt||workout.completedAt||workout.startedAt||workout.scheduledDate;
  if(value)stamps.push(String(value));
 }

 const planUpdated=s?.plan?.updatedAt;
 if(planUpdated)stamps.push(String(planUpdated));

 let latest=0;
 for(const value of stamps){
  const time=new Date(value).getTime();
  if(Number.isFinite(time)&&time>latest)latest=time;
 }
 return latest;
}

/**
 * Merge persisted data with the current application defaults.
 *
 * This is intentionally additive: unknown/new fields are preserved so an
 * interrupted workout or a future feature is not stripped during migration.
 */
/**
 * A single impossible set value (for example a negative rep count typed into a
 * number field) must never make the integrity check reject the whole state,
 * because an unusable state falls back to an empty one and silently loses the
 * athlete's entire history. Repair the value instead: the affected field is
 * dropped so the set stays but no longer carries an invalid number.
 */
function repairWorkoutValues(workouts:any){
 if(!Array.isArray(workouts))return workouts;
 const bad=(v:any,max=Infinity)=>v!==undefined&&v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max);
 return workouts.map((w:any)=>{
  if(!w||!Array.isArray(w.exercises))return w;
  return {...w,exercises:w.exercises.map((we:any)=>{
   if(!we||!Array.isArray(we.sets))return we;
   return {...we,sets:we.sets.map((s:any)=>{
    if(!s||typeof s!=='object')return s;
    const next={...s};
    for(const key of ['weight','assistance'])if(bad(next[key],MAX_PLAUSIBLE_LOAD_KG))delete next[key];
    if(bad(next.reps,MAX_PLAUSIBLE_REPS))delete next.reps;
    if(bad(next.seconds,MAX_PLAUSIBLE_SECONDS))delete next.seconds;
    if(bad(next.rir,10))delete next.rir;
    return next;
   })};
  })};
 });
}

export function migratePersistedState(raw:unknown):AppState{
 const incoming=raw&&typeof raw==='object'?raw as Record<string,unknown>:{ };
 const version=typeof incoming.schemaVersion==='number'?incoming.schemaVersion:0;
 const migrated:any={...incoming};

 if(version < SCHEMA_VERSION){
  const base=fresh();
  const prefs=(incoming.preferences&&typeof incoming.preferences==='object'?incoming.preferences as Record<string,unknown>:{}) as Record<string,unknown>;
  const notificationPrefs=(prefs.notifications&&typeof prefs.notifications==='object'?prefs.notifications as Record<string,unknown>:{}) as Record<string,unknown>;
  migrated.schemaVersion=SCHEMA_VERSION;
  migrated.preferences={
   ...base.preferences,
   ...(prefs as any),
   notifications:{
    ...base.preferences.notifications,
    ...(notificationPrefs as any),
   }
  };
  migrated.eventLog=Array.isArray(incoming.eventLog)?incoming.eventLog:[];
  migrated.workoutTemplates=Array.isArray(incoming.workoutTemplates)?incoming.workoutTemplates:[];
  if(incoming.recoveryLog!==undefined)migrated.recoveryLog=incoming.recoveryLog;
 }

 return merge(migrated);
}

function merge(raw:any):AppState{
 const base=fresh();
 const incoming=raw&&typeof raw==='object'?raw:{};

 const notifications={
  ...base.preferences.notifications,
  ...(incoming.preferences&&typeof incoming.preferences==='object'&&incoming.preferences.notifications&&typeof incoming.preferences.notifications==='object'
    ?incoming.preferences.notifications
    :{})
 };

 const incomingPreferences=incoming.preferences&&typeof incoming.preferences==='object'
  ?incoming.preferences
  :{};

 const preferences={
  ...base.preferences,
  ...incomingPreferences,
  fontScale:incomingPreferences.fontScale==='large'||incomingPreferences.fontScale==='larger'
    ?incomingPreferences.fontScale
    :'system',
  highContrast:Boolean(incomingPreferences.highContrast),
  theme:['apex','classic','steel','aurora','crimson'].includes(String(incomingPreferences.theme))?incomingPreferences.theme:'apex',
  units:normalizeUnits(incomingPreferences.units),
  notifications
 };

 const merged={
  ...base,
  ...incoming,
  schemaVersion:typeof incoming.schemaVersion==='number'
    ?Math.max(SCHEMA_VERSION,incoming.schemaVersion)
    :SCHEMA_VERSION,
  preferences,
  // the catalogue is never persisted: it is rebuilt on load and programmed for the profile's current goal
  exercises:programExercises(EXERCISES,incoming.profile?.primaryGoal),
  workoutTemplates:Array.isArray(incoming.workoutTemplates)?incoming.workoutTemplates:[],
  eventLog:Array.isArray(incoming.eventLog)?incoming.eventLog:[]
 } as AppState;
 merged.workouts=repairWorkoutValues(merged.workouts);
 if(incoming.recoveryLog!==undefined)merged.recoveryLog=normalizeRecoveryLog(incoming.recoveryLog);

 return merged;
}

const sqlite=new ApexSQLiteStore();

/**
 * SQLite writes are serialized.
 *
 * Multiple rapid workout mutations can otherwise race because every UI action
 * is allowed to trigger persistence. Keeping one ordered queue means the last
 * state saved by the UI is also the last state written natively.
 */
let sqliteWriteQueue:Promise<void>=Promise.resolve();

function queueSqliteWrite(payload:string){
 const operation=sqliteWriteQueue
  .catch(()=>{})
  .then(()=>sqlite.write(payload));

 sqliteWriteQueue=operation.catch(()=>{});
 return operation;
}

function writeLocal(s:AppState){
 try{
  localStorage.setItem(KEY,JSON.stringify(s));
  return true;
 }catch{
  return false;
 }
}

/**
 * When a persisted payload is structurally unusable the app must still start,
 * but it must not silently destroy the only copy of the athlete's data.
 * The rejected payload is kept under a separate key so it can be recovered.
 */
const REJECTED_KEY=KEY+'-rejected';
const REJECTED_PREV_KEY=KEY+'-rejected-previous';
const NOTICE_KEY=KEY+'-recovery';

function preserveRejected(raw:string,reason:RecoveryNotice['reason']){
 try{
  const existing=localStorage.getItem(REJECTED_KEY);
  // never overwrite an earlier unresolved copy: keep it as the previous generation
  if(existing&&existing!==raw)localStorage.setItem(REJECTED_PREV_KEY,existing);
  localStorage.setItem(REJECTED_KEY,raw);
  if(!localStorage.getItem(NOTICE_KEY)||existing!==raw){
   const notice:RecoveryNotice={detectedAt:new Date().toISOString(),reason,bytes:raw.length,recoverable:reason!=='invalid_json'&&repairRejected(raw)!==null};
   localStorage.setItem(NOTICE_KEY,JSON.stringify(notice));
  }
 }catch{/* storage full or unavailable */}
}

function clearNotice(){
 try{localStorage.removeItem(NOTICE_KEY);}catch{/* ignore */}
}

function readLocal():AppState{
 let raw:string|null=null;
 try{
  raw=localStorage.getItem(KEY);
  if(!raw)return fresh();

  const state=migratePersistedState(JSON.parse(raw));
  if(isUsableState(state))return state;
  preserveRejected(raw,'unusable_state');
  return fresh();
 }catch{
  if(raw)preserveRejected(raw,'invalid_json');
  return fresh();
 }
}

/**
 * Repairs a rejected payload conservatively. Every structurally valid workout
 * is kept; a workout or set that cannot be made valid is dropped and counted,
 * never guessed. Duplicate ids that belong to different records are re-id'd,
 * exact duplicates are dropped. Integrity validation itself is unchanged: the
 * repaired state must still pass isUsableState.
 */
function repairRejected(raw:string):RecoveryResult|null{
 let incoming:any;
 try{incoming=JSON.parse(raw);}catch{return null;}
 if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))return null;

 const base=merge({...incoming,workouts:[]});
 const seenWorkouts=new Map<string,string>();
 const workouts:any[]=[];
 let dropped=0;
 const list=Array.isArray(incoming.workouts)?incoming.workouts:[];
 const repaired=repairWorkoutValues(list) as any[];

 for(const workout of repaired){
  if(!workout||typeof workout!=='object'||typeof workout.id!=='string'||!workout.id||!Array.isArray(workout.exercises)){dropped++;continue;}
  const seenSets=new Set<string>();
  const exercises:any[]=[];
  let broken=false;
  for(const entry of workout.exercises){
   if(!entry||typeof entry.exerciseId!=='string'||!entry.exerciseId||!Array.isArray(entry.sets)){broken=true;break;}
   const sets:any[]=[];
   for(const set of entry.sets){
    if(!set||typeof set!=='object'){continue;}
    let next=set;
    if(typeof next.id==='string'&&seenSets.has(next.id))next={...next,id:next.id+'_r'+seenSets.size};
    if(typeof next.id==='string')seenSets.add(next.id);
    const probe={...base,workouts:[{...workout,exercises:[{...entry,order:entry.order??0,sets:[next]}]}]} as AppState;
    if(inspectState(probe).some(issue=>issue.severity==='error'&&/sets./.test(issue.path)))continue;
    sets.push(next);
   }
   exercises.push({...entry,sets});
  }
  if(broken){dropped++;continue;}
  const candidate={...workout,exercises};
  if(inspectState({...base,workouts:[candidate]} as AppState).some(issue=>issue.severity==='error')){dropped++;continue;}
  const signature=JSON.stringify(candidate);
  const previous=seenWorkouts.get(candidate.id);
  if(previous!==undefined){
   if(previous===signature){dropped++;continue;}
   candidate.id=candidate.id+'_r'+seenWorkouts.size;
  }
  seenWorkouts.set(candidate.id,signature);
  workouts.push(candidate);
 }

 const state={...base,workouts};
 if(!isUsableState(state))return null;
 return {state,workouts:workouts.length,dropped};
}

export const repository:Repository={
 recoveryNotice(){
  try{
   const raw=localStorage.getItem(NOTICE_KEY);
   if(!raw)return null;
   const notice=JSON.parse(raw);
   return notice&&typeof notice==='object'&&localStorage.getItem(REJECTED_KEY)?notice as RecoveryNotice:null;
  }catch{return null;}
 },

 /** Restores whatever is readable from the preserved payload and saves it. The damaged copy is kept. */
 recoverRejected(){
  let raw:string|null=null;
  try{raw=localStorage.getItem(REJECTED_KEY);}catch{/* ignore */}
  if(!raw)return null;
  const result=repairRejected(raw);
  if(!result)return null;
  writeLocal(result.state);
  void queueSqliteWrite(JSON.stringify(result.state));
  clearNotice();
  return result;
 },

 /** Explicit user choice: start with an empty app. The damaged copy is kept on the device. */
 startFresh(){
  const state=fresh();
  writeLocal(state);
  void queueSqliteWrite(JSON.stringify(state));
  clearNotice();
  return state;
 },

 load(){
  return readLocal();
 },

 /**
  * Local persistence is synchronous and happens first.
  * Native SQLite persistence is queued immediately afterwards.
  *
  * This ordering is important for workout safety: navigation or an Android
  * lifecycle event occurring immediately after a mutation still has the
  * latest state in localStorage even if SQLite is temporarily unavailable.
  */
 save(s){
  const state=merge(s);
  writeLocal(state);
  void queueSqliteWrite(JSON.stringify(state));
 },

 async loadAsync(){
  const fallback=readLocal();

  try{
   const raw=await sqlite.read();

   if(raw){
    const native=migratePersistedState(JSON.parse(raw));

    /*
     * Prefer the state with the newest trustworthy mutation timestamp.
     * When timestamps tie, localStorage wins because save() writes it first
     * and it represents the most recent UI-side state in this process.
     */
    const nativeRevision=stateRevision(native);
    const fallbackRevision=stateRevision(fallback);
    const chosen=nativeRevision>fallbackRevision?native:fallback;

    if(!isUsableState(chosen))return fallback;

    if(chosen===native&&stateRevision(native)>0)clearNotice(); // a valid native copy restored the data automatically
    writeLocal(chosen);
    return chosen;
   }
  }catch{
   // Native storage can be unavailable during web preview or early startup.
   // The local state remains the recovery source.
  }

  return fallback;
 },

 async saveAsync(s){
  const state=merge(s);

  /*
   * Persist locally before awaiting native storage. Callers that await this
   * method therefore get deterministic local persistence even when the
   * Capacitor SQLite plugin is unavailable.
   */
  writeLocal(state);
  await queueSqliteWrite(JSON.stringify(state));
 },

 reset(){
  try{localStorage.removeItem(KEY);localStorage.removeItem(REJECTED_KEY);localStorage.removeItem(REJECTED_PREV_KEY);localStorage.removeItem(NOTICE_KEY);}catch{}

  /*
   * Reset is ordered behind pending writes. Otherwise an old queued write
   * could arrive after reset and resurrect deleted state.
   */
  const operation=sqliteWriteQueue
   .catch(()=>{})
   .then(()=>sqlite.reset());

  sqliteWriteQueue=operation.catch(()=>{});
  void operation;
 },

 exportJson(s){
  return JSON.stringify({
   format:'APEX_BACKUP',
   version:SCHEMA_VERSION,
   exportedAt:new Date().toISOString(),
   data:s
  },null,2);
 },

 importJson(raw){
  const obj=JSON.parse(raw);
  if(obj?.format!=='APEX_BACKUP')throw new Error('This is not an APEX backup.');

  const state=migratePersistedState(obj.data);
  if(!isUsableState(state))throw new Error('This APEX backup is not usable.');

  return state;
 }
};

export {fresh};
