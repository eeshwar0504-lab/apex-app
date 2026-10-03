import type {AppState,Workout} from '../core/types';
import {ApexLine} from '../ui/primitives';
import {trainingWeek} from '../ui/week';
import type {TrainingWeek,WeekNode} from '../ui/week';
import {niceName} from '../ui/shared';

const STATE_TEXT:Record<WeekNode['state'],string>={done:'completed',partial:'partly done',active:'in progress',planned:'planned',missed:'missed',skipped:'skipped',rest:'rest day'};
const DAY_NAMES=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

/*
 * One training week as a line of nodes. A session is a node on the APEX Line; a rest day is deliberate space, never a gap to fill.
 * A deload week keeps the same days but the rhythm tightens (see data-deload in the stylesheet). Every node is a real button with a
 * text name, so the map is also a list for TalkBack and keyboard users.
 */
export function WeekLine({week,selected,onSelect,compact=false,fresh}:{week:TrainingWeek;selected?:string;onSelect?:(n:WeekNode)=>void;compact?:boolean;fresh?:string}){
 const last=week.nodes.reduce((a,n,i)=>(n.state==='done'||n.state==='partial'||n.state==='active'?i:a),-1);
 const todayIndex=week.nodes.findIndex(n=>n.today);
 const reach=last<0?0:(last+0.5)/week.nodes.length;
 return <div className={`apex-week${week.deload?' is-deload':''}${compact?' is-compact':''}`} data-deload={week.deload?'1':undefined} role="group" aria-label={`Training week from ${week.start}${week.deload?', deload week':''}`}>
  <ApexLine value={reach} variant="baseline" className="apex-week-line"/>
  <ol>
   {week.nodes.map((n,i)=>{
    const isFresh=!!fresh&&n.workouts.some(w=>w.id===fresh);
    const name=`${DAY_NAMES[i]} ${n.iso}: ${STATE_TEXT[n.state]}${n.workouts[0]?`, ${niceName(n.workouts[0].name)}`:''}${n.today?', today':''}`;
    const inner=<><i aria-hidden="true"/><span>{n.label}</span></>;
    return <li key={n.iso} className={`apex-node-cell${i===todayIndex?' is-today-cell':''}`}>
     {onSelect
      ?<button type="button" className={`apex-node is-${n.state}${n.today?' is-today':''}${isFresh?' is-fresh':''}`} aria-label={name} aria-pressed={selected===n.iso} aria-current={n.today?'date':undefined} onClick={()=>onSelect(n)} style={isFresh?{viewTransitionName:'session-thread'} as React.CSSProperties:undefined}>{inner}</button>
      :<span className={`apex-node is-${n.state}${n.today?' is-today':''}${isFresh?' is-fresh':''}`} role="img" aria-label={name}>{inner}</span>}
    </li>;
   })}
  </ol>
 </div>;
}

/* The same data as plain text, for anyone who prefers a sentence to a diagram. */
export function weekSentence(week:TrainingWeek):string{
 const {done,planned}=week.sessions;
 if(!planned&&!done)return week.deload?'Deload week: no sessions planned.':'No sessions planned this week.';
 return `${done} of ${planned} session${planned===1?'':'s'} done${week.deload?' · deload week, lighter by design':''}`;
}

/* Block: the recent weeks as stacked lines, so rhythm (and a deload's different shape) is visible at a glance. */
export function BlockView({s,onSelectWeek}:{s:AppState;onSelectWeek:(offset:number)=>void}){
 const offsets=[-3,-2,-1,0,1];
 return <div className="apex-block-view" role="list" aria-label="Training block, five weeks">
  {offsets.map(o=>{
   const w=trainingWeek(s,o);
   return <div role="listitem" className="apex-block-row" key={o}>
    <button type="button" className="apex-block-label" onClick={()=>onSelectWeek(o)} aria-label={`Open week of ${w.start}: ${weekSentence(w)}`}>
     <small className="a3-eyebrow">{o===0?'This week':o<0?`${-o} week${o===-1?'':'s'} ago`:'Next week'}</small>
     <span>{weekSentence(w)}</span>
    </button>
    <WeekLine week={w} compact/>
   </div>;
  })}
 </div>;
}

export function sessionsOn(week:TrainingWeek,iso:string):Workout[]{return week.nodes.find(n=>n.iso===iso)?.workouts||[]}
