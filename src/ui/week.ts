import type {AppState,Workout} from '../core/types';
import {todayLocal,addDaysLocal,workoutDay} from '../data/dates';

/*
 * The training week as data: seven days, each a node with the sessions that fall on it. A planned rest day is just a day with no
 * session (intentional negative space, never a failure); a session only counts as missed if it was planned and not done.
 * Used by Home (this week), the Training Map, the rhythm map and the cause path, so they can never disagree.
 */
export type NodeState='done'|'partial'|'active'|'planned'|'missed'|'skipped'|'rest';
export type WeekNode={iso:string;label:string;today:boolean;future:boolean;state:NodeState;workouts:Workout[]};
export type TrainingWeek={start:string;end:string;nodes:WeekNode[];deload:boolean;sessions:{done:number;planned:number}};
const LETTERS='MTWTFSS';
const dayOf=(w:Workout)=>w.status==='completed'?workoutDay(w):w.scheduledDate;

export function trainingWeek(s:AppState,offset=0,today=todayLocal()):TrainingWeek{
 const dow=(new Date(today+'T00:00:00').getDay()+6)%7;
 const start=addDaysLocal(today,-dow+offset*7);
 const end=addDaysLocal(start,6);
 const nodes:WeekNode[]=Array.from({length:7},(_,i)=>{
  const iso=addDaysLocal(start,i);
  const workouts=s.workouts.filter(w=>w.status!=='rescheduled'&&dayOf(w)===iso);
  const has=(...st:string[])=>workouts.some(w=>st.includes(w.status));
  let state:NodeState='rest';
  if(has('in_progress'))state='active';
  else if(has('completed'))state=has('planned','skipped','missed')?'partial':'done';
  else if(has('missed'))state='missed';
  else if(has('skipped'))state='skipped';
  else if(has('planned'))state='planned';
  return {iso,label:LETTERS[i],today:iso===today,future:iso>today,state,workouts};
 });
 const deload=(s.deloads||[]).some(d=>d<=end&&addDaysLocal(d,6)>=start);
 const sessions=nodes.reduce((a,n)=>({done:a.done+n.workouts.filter(w=>w.status==='completed').length,planned:a.planned+n.workouts.filter(w=>w.status!=='skipped'&&w.status!=='missed').length}),{done:0,planned:0});
 return {start,end,nodes,deload,sessions};
}
