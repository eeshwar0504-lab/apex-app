import type {AppState} from '../core/types';
import {EXERCISES} from '../knowledge/exercises';
import {ApexSQLiteStore} from './sqliteAdapter';
import {isUsableState} from './integrity';

const KEY='apex-state-v4';
const fresh=():AppState=>({
 schemaVersion:4,goals:[],workouts:[],exercises:EXERCISES,achievements:[],measurements:[],journal:[],observations:[],
 preferences:{haptics:true,sounds:false,smartRir:true,restPreference:'adaptive',restCustomSec:120,reducedMotion:false,diagnostics:false,fontScale:'system',highContrast:false,notifications:{enabled:true,workoutReminders:true,missedWorkout:true,weeklyReview:true}},
 activeRoute:'home',onboardingComplete:false,coachMemory:[],workoutTemplates:[],learnedPreferences:{},eventLog:[]
});
export interface Repository{load():AppState;save(s:AppState):void;reset():void;exportJson(s:AppState):string;importJson(raw:string):AppState;loadAsync():Promise<AppState>;saveAsync(s:AppState):Promise<void>;}
function stateRevision(s:AppState){
 const stamps=[
   ...(s.eventLog||[]).map(e=>e.timestamp),
   ...(s.workouts||[]).map(w=>w.updatedAt||w.completedAt||w.startedAt||w.scheduledDate),
   s.plan?.updatedAt
 ].filter(Boolean).map(x=>new Date(String(x)).getTime()).filter(Number.isFinite);
 return stamps.length?Math.max(...stamps):0;
}
function merge(raw:any):AppState{
 const base=fresh();
 const incoming=raw&&typeof raw==='object'?raw:{};
 const notifications={...base.preferences.notifications,...incoming.preferences?.notifications};
 const preferences={...base.preferences,...incoming.preferences,fontScale:incoming.preferences?.fontScale==='large'||incoming.preferences?.fontScale==='larger'?incoming.preferences.fontScale:'system',highContrast:Boolean(incoming.preferences?.highContrast),notifications};
 const merged={...base,...incoming,preferences,exercises:EXERCISES,workoutTemplates:incoming.workoutTemplates||[],eventLog:incoming.eventLog||[]};
 if(merged.schemaVersion<4) merged.schemaVersion=4;
 return merged;
}
const sqlite=new ApexSQLiteStore();
export const repository:Repository={
 load(){
  try{
    const raw=localStorage.getItem(KEY);
    if(!raw)return fresh();
    const state=merge(JSON.parse(raw));
    return isUsableState(state)?state:fresh();
  }catch{return fresh();}
},
 save(s){try{localStorage.setItem(KEY,JSON.stringify(s));}catch{} void sqlite.write(JSON.stringify(s)).catch(()=>{});},
 async loadAsync(){
   const fallback=this.load();
   try{
     const raw=await sqlite.read();
     if(raw){
       const native=merge(JSON.parse(raw));
       const chosen=stateRevision(native)>=stateRevision(fallback)?native:fallback;
       if(!isUsableState(chosen)) return fallback;
       try{localStorage.setItem(KEY,JSON.stringify(chosen));}catch{}
       return chosen;
     }
   }catch{}
   return fallback;
  },
 async saveAsync(s){this.save(s);try{await sqlite.write(JSON.stringify(s));}catch{}},
 reset(){try{localStorage.removeItem(KEY);}catch{} void sqlite.reset().catch(()=>{});},
 exportJson(s){return JSON.stringify({format:'APEX_BACKUP',version:4,exportedAt:new Date().toISOString(),data:s},null,2)},
 importJson(raw){const obj=JSON.parse(raw);if(obj?.format!=='APEX_BACKUP')throw new Error('This is not an APEX backup.');return merge(obj.data)}
};
export {fresh};
