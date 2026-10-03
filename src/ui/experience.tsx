import {createContext,useContext} from 'react';

/*
 * UI Experience: Guided, Standard or Advanced. It decides how much the interface shows and nothing else: it is never an input to
 * the training engine, so changing it can not change a prescription. One component system, three disclosure levels.
 */
export type UiExperience='guided'|'standard'|'advanced';
const Experience=createContext<UiExperience>('guided');
export const ExperienceProvider=Experience.Provider;
export function useExperience(){
 const level=useContext(Experience);
 return {level,standard:level!=='guided',advanced:level==='advanced'};
}
export const EXPERIENCE_OPTIONS:Array<{id:UiExperience;name:string;note:string}>=[
 {id:'guided',name:'Guided',note:'Essentials, explained as needed.'},
 {id:'standard',name:'Standard',note:'More context and control.'},
 {id:'advanced',name:'Advanced',note:'Full detail and control.'}
];
export const normalizeExperience=(value:unknown):UiExperience=>value==='standard'||value==='advanced'?value:'guided';

/* A live preview of the same set card at each level, so the choice is understood before it is made. */
export function ExperiencePreview({level}:{level:UiExperience}){
 return <div className="apex-preview" aria-label="Preview of the set screen" data-level={level}>
  <small className="a3-eyebrow">PREVIEW · SET 2 / 3</small>
  <strong>Machine Chest Press</strong>
  <div className="apex-preview-row"><span>Weight 30 kg</span><span>Reps 10</span></div>
  {level!=='guided'&&<div className="apex-preview-row apex-ghost-prev"><span>Last time 27.5 kg × 10</span><span>RIR optional</span></div>}
  {level==='advanced'&&<div className="apex-preview-row"><span>Set type · Tempo · Notes</span></div>}
  <span className="a3-cta apex-preview-action" aria-hidden="true">LOG SET</span>
 </div>;
}
