import {useEffect,useRef,useState} from 'react';

/* Motion helpers. Durations and easings are CSS tokens in apex-motion.css; script reads them from there so timing has one source.
 * Reduced motion (the OS setting or the APEX preference) collapses every token to ~0, so anything waiting on an animation waits no time. */
export function motionMs(token:string,fallback:number):number{
 const host=document.querySelector('.app')||document.documentElement;
 const raw=getComputedStyle(host).getPropertyValue(token).trim();
 const n=parseFloat(raw);
 if(!Number.isFinite(n))return fallback;
 const ms=raw.endsWith('ms')?n:raw.endsWith('s')?n*1000:fallback;
 return ms<1?0:ms;
}

/* Close with a short exit animation: `closing` drives the `is-closing` class, `request` is idempotent so a double tap or Escape plus a tap closes once. */
export function useExitTransition(close:()=>void){
 const [closing,setClosing]=useState(false);
 const closingRef=useRef(false);
 const timer=useRef<number|undefined>(undefined);
 const closeRef=useRef(close);
 closeRef.current=close;
 useEffect(()=>()=>window.clearTimeout(timer.current),[]);
 const request=()=>{
  if(closingRef.current)return;
  closingRef.current=true;
  const ms=motionMs('--motion-exit',160);
  if(!ms){closeRef.current();return}
  setClosing(true);
  timer.current=window.setTimeout(()=>closeRef.current(),ms);
 };
 return {closing,request};
}
