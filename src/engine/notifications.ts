import type {AppState} from '../core/types';

export type NotificationKind='workout'|'missed'|'weekly';
export interface NotificationIntent {id:string;kind:NotificationKind;title:string;body:string;scheduledFor:string;actionRoute:string;}

const atLocal=(date:string,hour:number)=>{const d=new Date(`${date}T${String(hour).padStart(2,'0')}:00:00`);return d.toISOString();};

export function notificationIntents(s:AppState,now=new Date()):NotificationIntent[]{
 const p=s.preferences.notifications;
 if(!p.enabled)return [];
 const today=now.toISOString().slice(0,10), out:NotificationIntent[]=[];
 const planned=s.workouts.filter(w=>w.status==='planned').sort((a,b)=>a.scheduledDate.localeCompare(b.scheduledDate));
 if(p.workoutReminders){
   const next=planned.find(w=>w.scheduledDate>=today);
   if(next)out.push({id:`workout-${next.id}`,kind:'workout',title:'APEX training reminder',body:`${next.name} is scheduled for ${next.scheduledDate}. Open APEX when you're ready.`,scheduledFor:atLocal(next.scheduledDate,7),actionRoute:'train'});
 }
 if(p.missedWorkout){
   const missed=s.workouts.find(w=>w.status==='missed'&&w.updatedAt.slice(0,10)===today);
   if(missed){
     // A notification scheduled exactly at `now` can be rejected by native
     // schedulers and is also immediately filtered by the adapter. Give the
     // user a small, deterministic follow-up window instead.
     const followUp=new Date(now);
     followUp.setMinutes(followUp.getMinutes()+10);
     out.push({id:`missed-${missed.id}`,kind:'missed',title:'Training session missed',body:`${missed.name} is still recorded. Reschedule it if you want to continue the plan.`,scheduledFor:followUp.toISOString(),actionRoute:'train'});
   }
 }
 if(p.weeklyReview && now.getDay()===0){
   const weekAgo=new Date(now);weekAgo.setDate(now.getDate()-7);
   const count=s.workouts.filter(w=>w.status==='completed'&&w.completedAt&&new Date(w.completedAt)>=weekAgo).length;
   out.push({id:`weekly-${today}`,kind:'weekly',title:'Your APEX weekly review',body:`${count} session${count===1?'':'s'} completed in the last 7 days. Review progress and decide what deserves attention next.`,scheduledFor:atLocal(today,19),actionRoute:'progress'});
 }
 return out;
}
