import type {AppState} from '../core/types';
import {EXERCISES} from '../knowledge/exercises';
import {programExercises} from '../engine/goalProgram';
import {ApexSQLiteStore} from './sqliteAdapter';
import {isUsableState,inspectState} from './integrity';
import {normalizeRecoveryLog} from '../engine/recovery';
import {MAX_PLAUSIBLE_LOAD_KG,MAX_PLAUSIBLE_REPS,MAX_PLAUSIBLE_SECONDS} from '../engine/limits';
import {normalizeUnits} from './units';
import {dayNumber} from './dates';

const KEY='apex-state-v4';
const SCHEMA_VERSION=4;

const fresh=():AppState=>({
 schemaVersion:SCHEMA_VERSION,goals:[],workouts:[],exercises:EXERCISES,achievements:[],measurements:[],journal:[],observations:[],
 preferences:{haptics:true,sounds:false,restPreference:'adaptive',restCustomSec:120,reducedMotion:false,diagnostics:false,fontScale:'system',highContrast:false,notifications:{enabled:true,workoutReminders:true,missedWorkout:true,weeklyReview:true}},
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
 /** Native (SQLite) write health: the last failure is kept so a silent native problem can be shown rather than only logged. */
 nativeStatus():{lastError:string|null;lastWriteAt:string|null};
 /** One generation of the state a restore replaced, so a restore of the wrong backup can be undone. */
 snapshotBeforeRestore(s:AppState):void;
 preRestoreSnapshot():AppState|null;
}

/**
 * Return the newest trustworthy mutation time represented by the state.
 *
 * savedAt covers every edit, including those that have no timestamp of their own (profile, goals, journal,
 * recovery, preferences). The event log, workout and plan timestamps are kept so data saved before savedAt existed
 * still compares sensibly.
 *
 * Active workouts are deliberately included through startedAt/updatedAt so
 * an interrupted session is not mistaken for an old completed record.
 * A workout's scheduledDate is a calendar day, not a mutation time, and is never used: a planned future workout
 * would otherwise make a stale copy look newer than today.
 * Malformed entries are ignored rather than allowing recovery itself to fail.
 */
function stateRevision(s:AppState){
 const stamps:string[]=[];

 if(s?.savedAt)stamps.push(String(s.savedAt));

 for(const event of Array.isArray(s?.eventLog)?s.eventLog:[]){
  const value=event?.timestamp;
  if(value)stamps.push(String(value));
 }

 for(const workout of Array.isArray(s?.workouts)?s.workouts:[]){
  if(!workout||typeof workout!=='object')continue;
  const value=workout.updatedAt||workout.completedAt||workout.startedAt;
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

/** Accepted deload start days: valid YYYY-MM-DD strings only, no repeats, in date order. */
export function normalizeDeloads(raw:unknown):string[]{
 if(!Array.isArray(raw))return [];
 return [...new Set(raw.filter((x):x is string=>typeof x==='string'&&dayNumber(x)!==undefined))].sort();
}

/**
 * Records kept as plain lists (goals, measurements, journal, templates) get the same guarantee the workout list has: an entry that is
 * not an object is dropped, an exact duplicate is dropped, and a different record that reuses an id is given a new one. Nothing else
 * about a record is touched, and a clean list is returned as is, so the function is idempotent and a hydrate/save cycle never adds or
 * removes a record.
 */
export function normalizeRecords<T>(raw:unknown):T[]{
 if(!Array.isArray(raw))return [];
 const seen=new Map<string,string>();
 let changed=false;
 const out:any[]=[];
 for(const item of raw){
  if(!item||typeof item!=='object'||Array.isArray(item)){changed=true;continue;}
  const rec=item as any;
  if(typeof rec.id!=='string'||!rec.id){out.push(rec);continue;}
  const sig=JSON.stringify(rec);
  const prev=seen.get(rec.id);
  if(prev===undefined){seen.set(rec.id,sig);out.push(rec);continue;}
  changed=true;
  if(prev===sig)continue;
  let n=1;while(seen.has(rec.id+'_r'+n))n++;
  const next={...rec,id:rec.id+'_r'+n};
  seen.set(next.id,JSON.stringify(next));out.push(next);
 }
 return changed?out:raw as T[];
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
  if(incoming.deloads!==undefined)migrated.deloads=incoming.deloads;
 }

 return merge(migrated);
}

/* the five earlier themes map onto the four APEX themes, so saved data and backups keep a sensible look */
const THEME_MIGRATION:Record<string,'obsidian'|'graphite'|'bone'|'contrast'>={apex:'obsidian',crimson:'obsidian',steel:'graphite',aurora:'graphite',classic:'bone',obsidian:'obsidian',graphite:'graphite',bone:'bone',contrast:'contrast'};
function normalizeTheme(value:unknown):'obsidian'|'graphite'|'bone'|'contrast'{return THEME_MIGRATION[String(value)]||'obsidian'}

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
  theme:normalizeTheme(incomingPreferences.theme),
  uiExperience:['guided','standard','advanced'].includes(String(incomingPreferences.uiExperience))?incomingPreferences.uiExperience:'guided',
  hapticsGentle:Boolean(incomingPreferences.hapticsGentle),
  aiMode:['off','rule-based','local-model'].includes(String(incomingPreferences.aiMode))?incomingPreferences.aiMode:'off',
  units:normalizeUnits(incomingPreferences.units),
  notifications
 };

 // smartRir was a preference that nothing ever read; it is dropped from saved data
 delete (preferences as any).smartRir;

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
 for(const key of ['goals','measurements','journal','workoutTemplates'] as const)(merged as any)[key]=normalizeRecords((merged as any)[key]);
 if(incoming.recoveryLog!==undefined)merged.recoveryLog=normalizeRecoveryLog(incoming.recoveryLog);
 if(incoming.deloads!==undefined)merged.deloads=normalizeDeloads(incoming.deloads);

 return merged;
}

/**
 * Stamps a state about to be persisted. The stamp moves only when the content changes (a re-save of an unchanged,
 * just-loaded state keeps its stamp) and never moves backwards, even if the device clock does.
 */
let lastSignature='';
let lastStamp='';
const signature=(s:AppState)=>JSON.stringify({...s,savedAt:undefined,exercises:undefined}); // the catalogue is rebuilt from the profile on every load, so it adds nothing to the comparison
function remember(s:AppState){
 lastSignature=signature(s);
 lastStamp=s.savedAt||'';
}
function stamp(s:AppState):AppState{
 const sig=signature(s);
 if(sig===lastSignature&&lastStamp)return {...s,savedAt:lastStamp};
 const previous=Math.max(Date.parse(lastStamp)||0,Date.parse(s.savedAt||'')||0);
 const now=Math.max(Date.now(),previous+1);
 lastSignature=sig;
 lastStamp=new Date(now).toISOString();
 return {...s,savedAt:lastStamp};
}

/** 53-bit string hash (cyrb53): not security, only a check that a backup file was not truncated or edited by accident. */
export function backupChecksum(text:string):string{
 let h1=0xdeadbeef,h2=0x41c6ce57;
 for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}
 h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
 h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
 return (4294967296*(2097151&h2)+(h1>>>0)).toString(16);
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

const native={lastError:null as string|null,lastWriteAt:null as string|null};

function queueSqliteWrite(payload:string){
 const operation=sqliteWriteQueue
  .catch(()=>{})
  .then(()=>sqlite.write(payload))
  .then(()=>{native.lastError=null;native.lastWriteAt=new Date().toISOString();},(error)=>{native.lastError=error instanceof Error?error.message:String(error);throw error;});

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

const NATIVE_REJECTED_KEY=KEY+'-native-rejected';
const PRE_RESTORE_KEY=KEY+'-pre-restore';

/**
 * An unreadable native (SQLite) payload is about to be overwritten by the next save, so it is kept first. When the local copy holds
 * real data the native copy is only kept; when the local copy is empty the native copy may be the only one, so the user is told.
 */
function preserveNativeRejected(raw:string,reason:RecoveryNotice['reason'],local:AppState){
 const localEmpty=!local.onboardingComplete&&!local.workouts.length;
 if(localEmpty){preserveRejected(raw,reason);return;}
 try{
  const existing=localStorage.getItem(NATIVE_REJECTED_KEY);
  if(existing&&existing!==raw)localStorage.setItem(NATIVE_REJECTED_KEY+'-previous',existing);
  localStorage.setItem(NATIVE_REJECTED_KEY,raw);
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
  if(isUsableState(state)){remember(state);return state;}
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
  const state=stamp(merge(s));
  writeLocal(state);
  void queueSqliteWrite(JSON.stringify(state));
 },

 async loadAsync(){
  const fallback=readLocal();

  try{
   const raw=await sqlite.read();

   if(raw){
    let native:AppState;
    try{native=migratePersistedState(JSON.parse(raw));}
    catch{preserveNativeRejected(raw,'invalid_json',fallback);return fallback;}
    if(!isUsableState(native)){preserveNativeRejected(raw,'unusable_state',fallback);return fallback;}

    /*
     * Prefer the state with the newest trustworthy mutation timestamp.
     * When timestamps tie, localStorage wins because save() writes it first
     * and it represents the most recent UI-side state in this process.
     */
    const nativeRevision=stateRevision(native);
    const fallbackRevision=stateRevision(fallback);
    const chosen=nativeRevision>fallbackRevision?native:fallback;

    remember(chosen);
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
  const state=stamp(merge(s));

  /*
   * Persist locally before awaiting native storage. Callers that await this
   * method therefore get deterministic local persistence even when the
   * Capacitor SQLite plugin is unavailable.
   */
  writeLocal(state);
  await queueSqliteWrite(JSON.stringify(state));
 },

 reset(){
  try{localStorage.removeItem(KEY);localStorage.removeItem(REJECTED_KEY);localStorage.removeItem(REJECTED_PREV_KEY);localStorage.removeItem(NOTICE_KEY);localStorage.removeItem(NATIVE_REJECTED_KEY);localStorage.removeItem(NATIVE_REJECTED_KEY+'-previous');localStorage.removeItem(PRE_RESTORE_KEY);}catch{}

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

 nativeStatus(){return {lastError:native.lastError,lastWriteAt:native.lastWriteAt};},

 snapshotBeforeRestore(s){
  try{localStorage.setItem(PRE_RESTORE_KEY,JSON.stringify(s));}catch{/* storage full: the restore still proceeds, the undo is simply unavailable */}
 },

 preRestoreSnapshot(){
  try{
   const raw=localStorage.getItem(PRE_RESTORE_KEY);
   if(!raw)return null;
   const state=migratePersistedState(JSON.parse(raw));
   return isUsableState(state)?state:null;
  }catch{return null;}
 },

 exportJson(s){
  return JSON.stringify({
   format:'APEX_BACKUP',
   version:SCHEMA_VERSION,
   exportedAt:new Date().toISOString(),
   checksum:backupChecksum(JSON.stringify(s)),
   data:s
  },null,2);
 },

  /**
   * Validates a backup completely before returning it, and never touches the current state: a backup that is malformed, damaged,
   * from a newer APEX or unusable throws, so a restore is all or nothing.
   */
 importJson(raw){
  let obj:any;
  try{obj=JSON.parse(raw);}catch{throw new Error('This file is not a readable APEX backup.');}
  if(obj?.format!=='APEX_BACKUP')throw new Error('This is not an APEX backup.');
  if(typeof obj.version==='number'&&obj.version>SCHEMA_VERSION)throw new Error('This backup was made by a newer version of APEX. Update APEX to restore it.');
  const data=obj.data;
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('This APEX backup has no data.');
  if(typeof data.schemaVersion==='number'&&data.schemaVersion>SCHEMA_VERSION)throw new Error('This backup was made by a newer version of APEX. Update APEX to restore it.');
  if(typeof obj.checksum==='string'&&obj.checksum!==backupChecksum(JSON.stringify(data)))throw new Error('This APEX backup is damaged (its checksum does not match).');

  const state=migratePersistedState(data);
  if(!isUsableState(state))throw new Error('This APEX backup is not usable.');

  return state;
 }
};

export {fresh};
