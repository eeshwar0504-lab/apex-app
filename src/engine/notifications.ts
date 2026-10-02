import type {AppState} from '../core/types';
import {localDate,dayOfTimestamp,addDaysLocal} from '../data/dates';
import {recoveryStatus} from './deload';

export type NotificationKind='workout'|'missed'|'weekly'|'recovery';
export interface NotificationIntent {id:string;kind:NotificationKind;title:string;body:string;scheduledFor:string;actionRoute:string;}

/** The only surfaces a notification may open. A stored or tampered route outside this list is ignored. */
export const NOTIFICATION_ROUTES=['home','train','progress','coach'] as const;
export const isNotificationRoute=(r:unknown):r is typeof NOTIFICATION_ROUTES[number]=>typeof r==='string'&&(NOTIFICATION_ROUTES as readonly string[]).includes(r);

const atLocal=(date:string,hour:number)=>{const d=new Date(`${date}T${String(hour).padStart(2,'0')}:00:00`);return d.toISOString();};
const REMINDER_HOUR=7, EVENING_HOUR=19, LATEST_FOLLOW_UP_HOUR=21;

/**
 * Notifications the app should have scheduled right now, derived only from the saved state, the preferences and the local clock.
 * Same state and same moment give the same list; nothing here is stored. Content states facts that were true when it was planned
 * and stays true until the state changes (every change re-plans), so it never carries a count that could go stale before delivery.
 */
export function notificationIntents(s:AppState,now=new Date()):NotificationIntent[]{
 const p=s.preferences.notifications;
 if(!p.enabled)return [];
 const today=localDate(now), out:NotificationIntent[]=[];
 const workouts=Array.isArray(s.workouts)?s.workouts:[];
 const planned=workouts.filter(w=>w.status==='planned').sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate));
 if(p.workoutReminders){
   // the next session whose reminder is still ahead: today's 07:00 may have passed, and tomorrow's session should still get its reminder
   const next=planned.find(w=>w.scheduledDate>=today&&new Date(atLocal(w.scheduledDate,REMINDER_HOUR)).getTime()>now.getTime());
   if(next)out.push({id:`workout-${next.id}`,kind:'workout',title:'APEX training reminder',body:`${next.name} is scheduled for ${next.scheduledDate}. Open APEX when you're ready.`,scheduledFor:atLocal(next.scheduledDate,REMINDER_HOUR),actionRoute:'train'});
 }
 if(p.missedWorkout){
   const missed=workouts.find(w=>w.status==='missed'&&dayOfTimestamp(w.updatedAt)===today);
   if(missed){
     // The evening of the day it was missed. After that, a short follow-up window, and nothing at all late at night.
     const evening=new Date(atLocal(today,EVENING_HOUR));
     let at:Date|undefined;
     if(evening.getTime()>now.getTime())at=evening;
     else if(now.getHours()<LATEST_FOLLOW_UP_HOUR){at=new Date(now);at.setMinutes(at.getMinutes()+10);}
     if(at)out.push({id:`missed-${missed.id}`,kind:'missed',title:'Training session missed',body:`${missed.name} is still recorded. Reschedule it if you want to continue the plan.`,scheduledFor:at.toISOString(),actionRoute:'train'});
   }
 }
 if(p.weeklyReview){
   // The coming Sunday evening (today if it is still ahead), planned in advance so it fires even if the app is not opened that day.
   let sunday=today;
   for(let i=0;i<8;i++){
     const d=addDaysLocal(today,i);
     if(new Date(`${d}T12:00:00`).getDay()===0&&new Date(atLocal(d,EVENING_HOUR)).getTime()>now.getTime()){sunday=d;break;}
   }
   out.push({id:`weekly-${sunday}`,kind:'weekly',title:'Your APEX weekly review',body:'Your week is ready to review. Open Progress to see sessions, volume and what changed from last week.',scheduledFor:atLocal(sunday,EVENING_HOUR),actionRoute:'progress'});
 }
 if(p.workoutReminders&&Array.isArray(s.exercises)){
   // Only the engine's own deload recommendation; the reminder invites a look at the Coach, it never starts a deload.
   const status=recoveryStatus(s as never,today);
   if(status?.status==='deload_recommended'){
     const evening=new Date(atLocal(today,EVENING_HOUR));
     const at=evening.getTime()>now.getTime()?evening.toISOString():atLocal(addDaysLocal(today,1),REMINDER_HOUR+1);
     out.push({id:`recovery-${today}`,kind:'recovery',title:'Recovery check',body:'Your recent training suggests a lighter week may help. Open Coach to review it. The decision is yours.',scheduledFor:at,actionRoute:'coach'});
   }
 }
 return out;
}

/**
 * What was planned for each intent id, kept between launches. Once an intent has fired it is not planned again, and one still pending
 * keeps its first time, so re-planning after every edit, resume or restart can neither repeat a notification nor keep pushing one back.
 */
export type NotificationLedger=Record<string,string>;
export const LEDGER_RETENTION_DAYS=14;

export interface NotificationPlan{
 /** Intents to schedule now, with their stabilised times, soonest first. */
 schedule:NotificationIntent[];
 ledger:NotificationLedger;
}

export function reconcileIntents(intents:NotificationIntent[],ledger:NotificationLedger,now:Date):NotificationPlan{
 const nowMs=now.getTime();
 const next:NotificationLedger={};
 const schedule:NotificationIntent[]=[];
 const keepSince=nowMs-LEDGER_RETENTION_DAYS*86400000;
 for(const [id,at] of Object.entries(ledger)){
  const t=Date.parse(at);
  if(Number.isFinite(t)&&t>=keepSince)next[id]=at; // a delivered intent stays remembered for a while so it is not repeated
 }
 for(const intent of intents){
  const stored=next[intent.id]!==undefined?Date.parse(next[intent.id]):NaN;
  /* Only the follow-up's time depends on the clock, so only it keeps its first time; every other time is a function of the state, so a moved session simply plans at its new time. */
  const time=intent.kind==='missed'&&Number.isFinite(stored)?next[intent.id]:intent.scheduledFor;
  const t=Date.parse(time);
  if(Number.isFinite(stored)&&next[intent.id]===time&&t<=nowMs)continue; // already fired
  if(t<=nowMs)continue; // not worth scheduling in the past
  next[intent.id]=time;
  schedule.push({...intent,scheduledFor:time});
 }
 schedule.sort((a,b)=>a.scheduledFor.localeCompare(b.scheduledFor)||a.id.localeCompare(b.id));
 return {schedule,ledger:next};
}

/** A stable numeric id in the APEX range for an intent id; a collision moves to the next free number. */
export const APEX_NOTIFICATION_MIN=1800000000;
export const APEX_NOTIFICATION_MAX=1899999999;
export function notificationIds(ids:string[]):Map<string,number>{
 const taken=new Set<number>();
 const out=new Map<string,number>();
 const span=APEX_NOTIFICATION_MAX - APEX_NOTIFICATION_MIN + 1;
 for(const id of ids){
  let hash=2166136261;
  for(const ch of id)hash=Math.imul(hash^ch.charCodeAt(0),16777619);
  let n=APEX_NOTIFICATION_MIN + (Math.abs(hash)%span);
  while(taken.has(n))n=n===APEX_NOTIFICATION_MAX?APEX_NOTIFICATION_MIN:n+1;
  taken.add(n);
  out.set(id,n);
 }
 return out;
}
