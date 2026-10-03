import React,{useEffect,useRef,useState} from 'react';
import {APEX_TRAINING_IMAGES,type TrainingImageKind} from '../imagery';
import {motionMs} from './motion';





export function Icon({name,size=20}:{name:string;size?:number}){const c={width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};const p:Record<string,React.ReactNode>={home:<><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,train:<><path d="M6 4v16M18 4v16M3 8v8M21 8v8M6 8h12M6 16h12"/></>,chart:<><path d="M4 19V5"/><path d="M4 19h17"/><path d="m7 15 4-4 3 2 5-7"/></>,user:<><circle cx="12" cy="8" r="4"/><path d="M4 21c1.4-4 4-6 8-6s6.6 2 8 6"/></>,search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,play:<path d="m8 5 11 7-11 7V5Z"/>,plus:<><path d="M12 5v14M5 12h14"/></>,minus:<path d="M5 12h14"/>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,check:<path d="m5 12 4 4L19 7"/>,chev:<path d="m9 18 6-6-6-6"/>,back:<path d="m15 18-6-6 6-6"/>,bolt:<path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>,target:<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>,history:<><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></>,settings:<><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></>,pause:<><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>,calendar:<><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></>,spark:<><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></>,activity:<><path d="M3 12h4l2-7 4 14 2-7h6"/></>,layers:<><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,shield:<><path d="M12 3 20 6v6c0 5-3.3 8-8 9-4.7-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-5"/></>,arrow:<path d="M5 12h14M13 6l6 6-6 6"/>,alert:<><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17h.01"/></>,crown:<><path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z"/></>,dumbbell:<><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/></>};return <svg {...c}>{p[name]||p.bolt}</svg>}


export function ApexImage({kind,alt,className='',caption,eager=false}:{kind:TrainingImageKind;alt?:string;className?:string;caption?:string;eager?:boolean}){
 const asset=APEX_TRAINING_IMAGES[kind];
 const [failedKind,setFailedKind]=useState<TrainingImageKind|null>(null);
 const failed=failedKind===kind;
 return <figure className={`apex-image ${className} ${failed?'is-fallback':''}`}>
   {failed
     ?<div className="apex-image-fallback" aria-hidden="true"><Icon name="activity" size={24}/></div>
     :<img src={asset.src} alt={alt??asset.alt} loading={eager?'eager':'lazy'} decoding="async" onError={()=>setFailedKind(kind)}/>}
   {caption&&<figcaption>{caption}</figcaption>}
 </figure>;
}
export function Splash({message}:{message?:string}){
 return <div className="apex3-splash"><ApexImage kind="strength-session" alt="" className="a3-splash-photo" eager/><img src="/brand/apex-mark-gold.png" alt=""/><b>APEX</b><span className="a3-splash-tag" aria-label="Train, track, progress, evolve"><i>TRAIN</i><i>TRACK</i><i>PROGRESS</i><i>EVOLVE</i></span><em className="a3-splash-claim">Your training is measured.<br/>Your progress is earned.</em>{message&&<small>{message}</small>}</div>
}
export function ApexSpark({values,label,xLabels}:{values:number[];label:string;xLabels?:[string,string]}){
 if(values.length<2)return <p className="a3-muted a3-note">Not enough logged points yet.</p>;
 const w=320,h=xLabels?150:130,padL=38,padR=10,padT=10,padB=xLabels?24:10;
 const min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,0.1);
 const yOf=(v:number)=>h-padB-((v-min)/span)*(h-padT-padB);
 const pts=values.map((v,i)=>[padL+i*(w-padL-padR)/(values.length-1),yOf(v)] as [number,number]);
 const line=pts.map(p=>`${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
 const last=pts[pts.length-1];
 const grid=[max,(max+min)/2,min];
 const fmt=(v:number)=>String(Math.round(v*10)/10);
 return <svg className="a3-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
  <defs><linearGradient id="a3-spark-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{stopColor:'var(--apex3-gold)',stopOpacity:0.32}}/><stop offset="1" style={{stopColor:'var(--apex3-gold)',stopOpacity:0}}/></linearGradient></defs>
  {grid.map((g,i)=><g key={i}><line x1={padL} x2={w-padR} y1={yOf(g)} y2={yOf(g)} className="a3-spark-grid"/><text x={padL-6} y={yOf(g)+3.5} textAnchor="end" className="a3-spark-axis">{fmt(g)}</text></g>)}
  {xLabels&&<><text x={padL} y={h-6} className="a3-spark-axis">{xLabels[0]}</text><text x={w-padR} y={h-6} textAnchor="end" className="a3-spark-axis">{xLabels[1]}</text></>}
  <polygon points={`${padL},${h-padB} ${line} ${w-padR},${h-padB}`} fill="url(#a3-spark-fill)"/>
  <polyline points={line} className="a3-spark-line"/>
  <circle cx={last[0]} cy={last[1]} r="4.5" className="a3-spark-dot"/>
 </svg>
}
export function SegBar<T extends string>({value,items,onChange,label}:{value:T;items:Array<[T,string]>;onChange:(v:T)=>void;label:string}){
 return <div className="a3-seg" style={{gridTemplateColumns:`repeat(${items.length}, minmax(0, 1fr))`}} role="tablist" aria-label={label}>{items.map(([k,l])=><button key={k} role="tab" aria-selected={value===k} className={value===k?'active':''} onClick={()=>onChange(k)}>{l}</button>)}</div>
}
export function SegTabs({route,onNav}:{route:'coach'|'today';onNav:(r:string)=>void}){
 return <div className="a3-seg" role="tablist" aria-label="Coach and Today">
  <button role="tab" aria-selected={route==='coach'} className={route==='coach'?'active':''} onClick={()=>onNav('coach')}>Coach</button>
  <button role="tab" aria-selected={route==='today'} className={route==='today'?'active':''} onClick={()=>onNav('today')}>Today</button>
 </div>
}
export function ApexStat({label,value,unit}:{label:string;value:string;unit?:string}){return <div className="a3-card a3-stat"><span className="a3-eyebrow">{label}</span><strong>{value}{unit&&<small>{unit}</small>}</strong></div>}
export function ApexRing({value,label,sub,onClick}:{value:number|null;label:string;sub?:string;onClick?:()=>void}){
 const pct=value===null?0:Math.max(0,Math.min(100,value));const r=34,c=2*Math.PI*r;
 const body=<><svg className="a3-ring" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r={r}/><circle cx="40" cy="40" r={r} className="a3-ring-fill" strokeDasharray={c} strokeDashoffset={c*(1-pct/100)}/></svg><span className="a3-ring-value">{value===null?'—':`${pct}%`}</span><span className="a3-ring-copy"><strong>{label}</strong>{sub&&<small>{sub}</small>}</span></>;
 return onClick?<button className="a3-card a3-ring-card a3-tap" onClick={onClick}>{body}</button>:<div className="a3-card a3-ring-card">{body}</div>
}
export function ApexMeter({value}:{value:number}){return <div className="a3-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><i style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div>}


export function Detail({title,children}:{title:string;children:React.ReactNode}){return <div className="a3-card a3-stack"><span className="a3-eyebrow">{title}</span>{children}</div>}
export function Metric({label,value,sub}:{label:string;value:string;sub:string}){return <div className="a3-card a3-stat"><span className="a3-eyebrow">{label}</span><strong>{value}</strong><small>{sub}</small></div>}
export function ListRow({title,sub,icon,click}:{title:string;sub:string;icon:string;click:()=>void}){return <button className="a3-card a3-row a3-tap" onClick={click}><span className="a3-rowicon"><Icon name={icon}/></span><span><strong>{title}</strong><small>{sub}</small></span><Icon name="chev"/></button>}
export function PageTitle({eyebrow,title,sub}:{eyebrow:string;title:string;sub:string}){return <header className="a3-greet a3-pagetitle"><span className="a3-eyebrow">{eyebrow}</span><h1>{title}</h1><p className="a3-muted">{sub}</p></header>}
export function Empty({title,text,action}:{title:string;text:string;action?:{label:string;onClick:()=>void}}){return <div className="a3-card a3-empty"><Icon name="bolt"/><strong>{title}</strong><p>{text}</p>{action&&<button className="a3-cta" onClick={action.onClick}>{action.label} <Icon name="arrow" size={16}/></button>}</div>}
export function BumpInput(props:React.InputHTMLAttributes<HTMLInputElement>){
 const ref=useRef<HTMLInputElement>(null);const first=useRef(true);
 useEffect(()=>{if(first.current){first.current=false;return}const el=ref.current;if(!el)return;el.classList.remove('a3-bump');void el.offsetWidth;el.classList.add('a3-bump')},[props.value]);
 return <input ref={ref} {...props}/>
}
type StateKind='loading'|'empty'|'error'|'success'|'pr';
/* One reusable full-panel state: loading, empty, error, success and PR celebration share layout and motion. */
export function StateView({kind,title,text,detail,progress,primary,secondary}:{kind:StateKind;title:string;text?:string;detail?:string;progress?:number;primary?:{label:string;onClick:()=>void};secondary?:{label:string;onClick:()=>void}}){
 const icon=kind==='error'?'alert':kind==='pr'?'crown':kind==='success'?'check':kind==='empty'?'dumbbell':'bolt';
 return <section className={`a3-stateview is-${kind}`} role={kind==='error'?'alert':'status'} aria-live={kind==='error'?'assertive':'polite'}>
  <span className="a3-state-icon" aria-hidden="true">{kind==='loading'?<img src="/brand/apex-mark-gold.png" alt=""/>:<Icon name={icon} size={kind==='pr'?40:kind==='error'||kind==='empty'?56:34}/>}</span>
  <h2>{title}</h2>
  {detail&&<strong className="a3-state-detail">{detail}</strong>}
  {text&&<p>{text}</p>}
  {kind==='loading'&&<div className={`a3-state-bar ${progress===undefined?'is-indeterminate':''}`} role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress===undefined?undefined:Math.round(progress)}><i style={progress===undefined?undefined:{width:`${Math.max(0,Math.min(100,progress))}%`}}/>{progress!==undefined&&<small>{Math.round(progress)}%</small>}</div>}
  {primary&&<button className={kind==='error'?'a3-cta a3-danger':'a3-cta'} onClick={primary.onClick}>{primary.label}</button>}
  {secondary&&<button className="a3-ghost" onClick={secondary.onClick}>{secondary.label}</button>}
 </section>
}
export const LoadingPanel=({progress}:{progress?:number})=><main className="a3-errorpage"><StateView kind="loading" title="Loading your training" text="Reading what is saved on this device." progress={progress}/></main>;
export const ErrorPanel=({onRetry,onBack}:{onRetry:()=>void;onBack:()=>void})=><main className="a3-errorpage"><ErrorState title="SOMETHING WENT WRONG" happened="This screen could not be shown." safe="Your training data is stored on this device and has not been changed." todo="Try again, or go back." primary={{label:'Try Again',onClick:onRetry}} secondary={{label:'Go Back',onClick:onBack}}/></main>;
export class ApexErrorBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed
  ?<div className="app" data-theme="obsidian"><ErrorPanel onRetry={()=>this.setState({failed:false})} onBack={()=>{try{history.back()}catch{}this.setState({failed:false})}}/></div>
  :this.props.children}
}

/* Calm placeholder while something is being prepared. The shimmer is a transform on a pseudo-element (see apex-motion.css) and stops under reduced motion. */
export function Skeleton({label,lines=2}:{label:string;lines?:number}){return <div className="a3-skeleton" role="status" aria-label={label}>{Array.from({length:lines},(_,i)=><span key={i}/>)}</div>}

/* A real show/hide control for secondary detail: the detail is not in the page until it is asked for, and it folds back to its summary. */
export function Disclosure({label,children,className=''}:{label:string;children:React.ReactNode;className?:string}){
 const [open,setOpen]=useState(false);
 const [folding,setFolding]=useState(false);
 const timer=useRef<number|undefined>(undefined);
 useEffect(()=>()=>window.clearTimeout(timer.current),[]);
 const toggle=()=>{
  if(!open){setOpen(true);return}
  const ms=motionMs('--motion-exit',160);
  if(!ms){setOpen(false);return}
  setFolding(true);
  timer.current=window.setTimeout(()=>{setOpen(false);setFolding(false)},ms);
 };
 return <div className={`a3-disclosure ${className}`}><button type="button" className="a3-disclosure-toggle" aria-expanded={open&&!folding} onClick={toggle}>{label}<Icon name="chev" size={16}/></button>{open&&<div className={`a3-disclosure-body${folding?' mo-fold':''}`}>{children}</div>}</div>;
}

/*
 * THE APEX LINE: one thin amber signal that is a different thing in each context (navigation, workout and set progress, the rest
 * timer, a timeline or chart baseline, a goal trajectory, a completion signal). It is deliberately rare; gold is earned.
 */
export function ApexLine({value=1,variant='progress',label,className=''}:{value?:number;variant?:'progress'|'timer'|'baseline'|'signal';label?:string;className?:string}){
 const v=Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
 return <div className={`apex-line apex-line-${variant} ${className}`} {...(label?{role:'progressbar','aria-label':label,'aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':Math.round(v*100)}:{'aria-hidden':true})}><i style={{transform:`scaleX(${v})`}}/></div>;
}

/* An instrument reporting a problem: what happened, what is safe, what to do. Never colour alone: the heading says it. */
export function ErrorState({title,happened,safe,todo,primary,secondary}:{title:string;happened:string;safe:string;todo:string;primary?:{label:string;onClick:()=>void};secondary?:{label:string;onClick:()=>void}}){
 return <section className="apex-error" role="alert" aria-live="assertive">
  <span className="a3-eyebrow apex-ember">{title}</span>
  <dl>
   <div><dt>What happened</dt><dd>{happened}</dd></div>
   <div><dt>What is safe</dt><dd>{safe}</dd></div>
   <div><dt>What to do</dt><dd>{todo}</dd></div>
  </dl>
  {primary&&<button className="a3-cta" onClick={primary.onClick}>{primary.label}</button>}
  {secondary&&<button className="a3-ghost" onClick={secondary.onClick}>{secondary.label}</button>}
 </section>;
}
