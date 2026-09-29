import type {AppState} from '../core/types';
import {EXERCISES} from '../knowledge/exercises';
import {ApexSQLiteStore} from './sqliteAdapter';
import {isUsableState} from './integrity';
import {normalizeUnits} from './units';

const KEY='apex-state-v4';
const SCHEMA_VERSION=4;

const fresh=():AppState=>({
 schemaVersion:SCHEMA_VERSION,goals:[],workouts:[],exercises:EXERCISES,achievements:[],measurements:[],journal:[],observations:[],
 preferences:{haptics:true,sounds:false,smartRir:true,restPreference:'adaptive',restCustomSec:120,reducedMotion:false,diagnostics:false,fontScale:'system',highContrast:false,notifications:{enabled:true,workoutReminders:true,missedWorkout:true,weeklyReview:true}},
 activeRoute:'home',onboardingComplete:false,coachMemory:[],workoutTemplates:[],learnedPreferences:{},eventLog:[]
});

export interface Repository{
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
  exercises:EXERCISES,
  workoutTemplates:Array.isArray(incoming.workoutTemplates)?incoming.workoutTemplates:[],
  eventLog:Array.isArray(incoming.eventLog)?incoming.eventLog:[]
 } as AppState;

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

function readLocal():AppState{
 try{
  const raw=localStorage.getItem(KEY);
  if(!raw)return fresh();

  const state=merge(JSON.parse(raw));
  return isUsableState(state)?state:fresh();
 }catch{
  return fresh();
 }
}

export const repository:Repository={
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
    const native=merge(JSON.parse(raw));

    /*
     * Prefer the state with the newest trustworthy mutation timestamp.
     * When timestamps tie, localStorage wins because save() writes it first
     * and it represents the most recent UI-side state in this process.
     */
    const nativeRevision=stateRevision(native);
    const fallbackRevision=stateRevision(fallback);
    const chosen=nativeRevision>fallbackRevision?native:fallback;

    if(!isUsableState(chosen))return fallback;

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
  try{localStorage.removeItem(KEY);}catch{}

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

  const state=merge(obj.data);
  if(!isUsableState(state))throw new Error('This APEX backup is not usable.');

  return state;
 }
};

export {fresh};
