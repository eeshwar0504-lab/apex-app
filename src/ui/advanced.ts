import {useCallback,useState} from 'react';

/*
 * Progressive disclosure for the workout. The default view is for someone who has never trained: exercise, how to do it, weight, reps,
 * log, rest, next. Everything an experienced lifter uses (RIR, set types, add/remove set, notes, overview, replacement, history,
 * the reasoning behind a weight) sits behind one "Advanced controls" switch. It is a display preference only, kept on this device;
 * it is not training data and changes nothing the engines compute.
 */
const ADVANCED_KEY='apex-advanced-workout';
const read=()=>{try{return localStorage.getItem(ADVANCED_KEY)==='1'}catch{return false}};
export function useAdvancedControls(){
 const [advanced,setAdvanced]=useState(read);
 const toggleAdvanced=useCallback(()=>setAdvanced(on=>{const next=!on;try{localStorage.setItem(ADVANCED_KEY,next?'1':'0')}catch{}return next}),[]);
 return {advanced,toggleAdvanced};
}
