import React,{useState} from 'react';

import type {Workout} from '../core/types';
import {Icon,ApexLine} from './primitives';
import {Modal} from './dialogs';
import {niceName} from './shared';

export function Command({nav,setQuery,close}:{nav:(r:string)=>void;setQuery:(x:string)=>void;close:()=>void}){const [q,setQ]=useState('');const run=(raw=q)=>{const x=raw.toLowerCase();if(x.includes('progress'))nav('progress');else if(x.includes('history')||x.includes('last workout'))nav('history');else if(x.includes('goal'))nav('goals');else if(x.includes('measurement')||x.includes('body data'))nav('measurements');else if(x.includes('plan'))nav('plan');else if(x.includes('coach')||x.includes('why'))nav('coach');else if(x.includes('template'))nav('templates');else if(x.includes('learn')||x.includes('rir'))nav('learn');else if(x.includes('exercise')||x.includes('squat')||x.includes('press')||x.includes('row')){setQuery(raw);nav('library')}else nav('home');close()};return <Modal title="Command Center" close={close}><div className="a3-search"><Icon name="search"/><input aria-label="Command search" autoFocus value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&run()} placeholder="Find, explain, navigate…"/><button onClick={()=>run()}>Go</button></div><div className="a3-list a3-picklist">{['Show my progress','Find chest press exercises','Open my plan','Explain RIR','Open templates'].map(x=><button key={x} onClick={()=>run(x)}>{x}<Icon name="chev"/></button>)}</div></Modal>}
export function NavItem({active,icon,label,click}:{active:boolean;icon:string;label:string;click:()=>void}){return <button aria-current={active?'page':undefined} className={`nav-item ${active?'active':''}`} onClick={click}><Icon name={icon}/><span>{label}</span></button>}

/*
 * The Session Dock: the workout, contracted. While a session is running and the athlete is somewhere else (Coach, Library, Progress),
 * the same object stays within reach with its progress on the APEX Line, and one visible action returns to it.
 */
export function SessionDock({workout,onResume}:{workout:Workout;onResume:()=>void}){
 const sets=workout.exercises.flatMap(e=>e.sets).filter(x=>x.type!=='warmup');
 const done=sets.filter(x=>x.completed).length;
 return <button type="button" className="apex-dock mo-emerge" onClick={onResume} aria-label={`Resume ${niceName(workout.name)}, ${done} of ${sets.length} sets done`} style={{viewTransitionName:'session-thread'} as React.CSSProperties}>
  <span className="apex-dock-copy"><small className="a3-eyebrow mo-breathe">SESSION IN PROGRESS</small><strong>{niceName(workout.name)}</strong><small>{done} of {sets.length} sets</small></span>
  <span className="apex-dock-action">Resume<Icon name="chev" size={16}/></span>
  <ApexLine value={sets.length?done/sets.length:0} variant="progress"/>
 </button>;
}
