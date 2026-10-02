import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useExitTransition} from './motion';

export function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){
 /* Dialog behaviour: focus moves in, Tab stays inside, Escape closes, focus returns to what opened it. */
 const panel=useRef<HTMLDivElement>(null);
 const {closing,request}=useExitTransition(close);
 const requestRef=useRef(request);
 requestRef.current=request;
 /* captured during the first render, before autoFocus inside the dialog can take focus */
 const openerRef=useRef<HTMLElement|null|undefined>(undefined);
 if(openerRef.current===undefined)openerRef.current=(document.activeElement as HTMLElement|null)||null;
 useEffect(()=>{
  const opener=openerRef.current;
  const node=panel.current;
  const focusable=()=>Array.from(node?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')||[]).filter(el=>el.getClientRects().length>0);
  if(node&&!node.contains(document.activeElement)){const items=focusable();(items.find(el=>!el.classList.contains('a3-iconbtn'))||items[0]||node).focus();}
  const onKey=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.stopPropagation();requestRef.current();return;}
   if(e.key!=='Tab'||!node)return;
   const items=focusable();
   if(!items.length){e.preventDefault();node.focus();return;}
   const first=items[0],last=items[items.length-1],active=document.activeElement;
   if(e.shiftKey&&(active===first||!node.contains(active))){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&(active===last||!node.contains(active))){e.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',onKey,true);
  /* focus is restored after the current key event: restoring it synchronously lets the same Enter key press the opener again and reopen the dialog */
  return()=>{document.removeEventListener('keydown',onKey,true);window.setTimeout(()=>{if(opener&&document.contains(opener))opener.focus();},0);};
 },[]);
 /* Portal to .app: screen wrappers animate with transforms, which would otherwise become the containing block for this fixed sheet. */
 return createPortal(<div className={`a3-modal-backdrop modal-transition${closing?' is-closing':''}`} onMouseDown={e=>e.currentTarget===e.target&&request()}><div className="a3-modal" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="apex-modal-title"><div className="a3-modal-head"><h2 id="apex-modal-title">{title}</h2><button className="a3-iconbtn" title="Close" aria-label="Close dialog" onClick={request}>×</button></div>{children}</div></div>,document.querySelector('.app')||document.body)}

/* In-app confirmation for destructive actions (the native confirm() is unreliable in the Android WebView). Cancel is the default focus. */
type ConfirmRequest={title:string;message:string;confirmLabel:string;run:()=>void};
export function useConfirm(){
 const [req,setReq]=useState<ConfirmRequest|null>(null);
 const ask=(o:{title:string;message:string;confirmLabel?:string},run:()=>void)=>setReq({title:o.title,message:o.message,confirmLabel:o.confirmLabel||'Delete',run});
 const dialog=req?<Modal title={req.title} close={()=>setReq(null)}><p className="modal-copy">{req.message}</p><div className="a3-actions"><button className="a3-cta a3-cta-ghost" autoFocus onClick={()=>setReq(null)}>Cancel</button><button className="a3-cta a3-danger" onClick={()=>{const run=req.run;setReq(null);run();}}>{req.confirmLabel}</button></div></Modal>:null;
 return {ask,dialog};
}
