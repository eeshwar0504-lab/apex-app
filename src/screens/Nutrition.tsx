import {useState} from 'react';
import type {AppState} from '../core/types';
import {todayLocal,addDaysLocal} from '../data/dates';
import {today} from '../ui/shared';
import {SegBar,ApexStat,ApexRing,ApexMeter,PageTitle} from '../ui/primitives';
import {useExperience} from '../ui/experience';


type NutritionDay={proteinG:number;calories:number;carbsG:number;fatsG:number;waterL:number;meals:number};
const EMPTY_NUTRITION_DAY:NutritionDay={proteinG:0,calories:0,carbsG:0,fatsG:0,waterL:0,meals:0};
export function nutritionDay(s:AppState,date=today()):NutritionDay{return {...EMPTY_NUTRITION_DAY,...(s.nutrition?.log?.[date]||{})}}
export function Nutrition({s,update}:{s:AppState;update:(f:(x:AppState)=>AppState)=>void}){
 const {standard,advanced}=useExperience();
 const targets=s.nutrition?.targets||{};
 const day=nutritionDay(s);
 const [nutTab,setNutTab]=useState<'today'|'week'>('today');
 const [meal,setMeal]=useState({protein:'',carbs:'',fats:'',calories:''});
 const [tv,setTv]=useState({protein:String(targets.proteinG??''),calories:String(targets.calories??''),carbs:String(targets.carbsG??''),fats:String(targets.fatsG??''),water:String(targets.waterL??'')});
 const num=(v:string)=>{const n=Number(v);return v.trim()!==''&&Number.isFinite(n)&&n>=0?n:undefined};
 const pct=(v:number,t?:number)=>t&&t>0?Math.min(100,Math.round(v/t*100)):0;
 const mutateDay=(fn:(d:NutritionDay)=>NutritionDay)=>update(x=>({...x,nutrition:{targets:x.nutrition?.targets||{},log:{...(x.nutrition?.log||{}),[today()]:fn(nutritionDay(x))}}}));
 const logMeal=()=>{
  const p=num(meal.protein)||0,c=num(meal.carbs)||0,f=num(meal.fats)||0;
  const kcal=num(meal.calories)??Math.round(p*4+c*4+f*9);
  if(p+c+f+kcal===0)return;
  mutateDay(d=>({...d,proteinG:d.proteinG+p,carbsG:d.carbsG+c,fatsG:d.fatsG+f,calories:d.calories+kcal,meals:d.meals+1}));
  setMeal({protein:'',carbs:'',fats:'',calories:''});
 };
 const addWater=(l:number)=>mutateDay(d=>({...d,waterL:Math.round((d.waterL+l)*100)/100}));
 const saveTargets=()=>update(x=>({...x,nutrition:{log:x.nutrition?.log||{},targets:{proteinG:num(tv.protein),calories:num(tv.calories),carbsG:num(tv.carbs),fatsG:num(tv.fats),waterL:num(tv.water)}}}));
 const week=Array.from({length:7},(_,i)=>{const iso=addDaysLocal(todayLocal(),-(6-i));return {iso,protein:nutritionDay(s,iso).proteinG}});
 const weekMax=Math.max(1,...week.map(x=>x.protein));
 const remaining=targets.proteinG?Math.max(0,targets.proteinG-day.proteinG):undefined;
 const tab=standard?nutTab:'today';
 const rows=([['Calories',day.calories,targets.calories,'kcal'],['Carbs',day.carbsG,targets.carbsG,'g'],['Fats',day.fatsG,targets.fatsG,'g'],['Water',day.waterL,targets.waterL,'L']] as [string,number,number|undefined,string][]).filter(r=>standard||r[0]==='Calories'||r[0]==='Water');
 return <div className="a3-home a3-nutrition">
  <PageTitle eyebrow="NUTRITION · TODAY" title="Nutrition" sub="A supporting record. Log what you eat and drink against your own targets; APEX does not prescribe a diet."/>
  {standard&&<SegBar label="Nutrition range" value={nutTab} onChange={setNutTab} items={[['today','Today'],['week','Week']]}/>}
  {tab==='today'&&<>
  <div className="a3-card a3-nut-hero">
   <ApexRing value={targets.proteinG?pct(day.proteinG,targets.proteinG):null} label="Protein" sub={targets.proteinG?`${Math.round(day.proteinG)} / ${targets.proteinG} g`:`${Math.round(day.proteinG)} g logged`}/>
   <div className="a3-stats a3-stats-2"><ApexStat label="Consumed" value={String(Math.round(day.proteinG))} unit="g"/><ApexStat label="Remaining" value={remaining===undefined?'—':String(Math.round(remaining))} unit="g"/></div>
  </div>
  <div className="a3-card a3-stack">
   <div className="a3-head"><h2>Daily totals</h2><span className="a3-chip">{day.meals} meal{day.meals===1?'':'s'}</span></div>
   {rows.map(([label,v,t,unit])=><div className="a3-meter-row" key={label}><span>{label}</span><ApexMeter value={pct(v,t)}/><strong>{Math.round(v*100)/100}{t?` / ${t}`:''} {unit}</strong></div>)}
   <div className="a3-actions"><button className="a3-pill" onClick={()=>addWater(0.25)}>+ 250 ml</button><button className="a3-pill" onClick={()=>addWater(0.5)}>+ 500 ml</button></div>
  </div>
  </>}
  {tab==='week'&&<section className="a3-block">
   <div className="a3-head"><h2>Protein this week</h2><span className="a3-eyebrow">Last 7 days</span></div>
   <div className="a3-card"><div className="a3-bars">{week.map(x=><div className="a3-bar-col" key={x.iso}><small>{x.protein?Math.round(x.protein):'—'}</small><i><b style={{height:`${x.protein?Math.max(8,Math.round(x.protein/weekMax*100)):0}%`}}/></i><span>{x.iso.slice(5)}</span></div>)}</div></div>
  </section>}
  {tab==='today'&&<>
  <section className="a3-card a3-stack">
   <div className="a3-head"><h2>Log a meal</h2></div>
   <div className="a3-fields">
    <label>Protein (g)<input inputMode="decimal" value={meal.protein} onChange={e=>setMeal(m=>({...m,protein:e.target.value}))}/></label>
    {standard&&<label>Carbs (g)<input inputMode="decimal" value={meal.carbs} onChange={e=>setMeal(m=>({...m,carbs:e.target.value}))}/></label>}
    {standard&&<label>Fats (g)<input inputMode="decimal" value={meal.fats} onChange={e=>setMeal(m=>({...m,fats:e.target.value}))}/></label>}
    <label>Calories (optional)<input inputMode="decimal" value={meal.calories} onChange={e=>setMeal(m=>({...m,calories:e.target.value}))} placeholder="Calculated if blank"/></label>
   </div>
   <button className="a3-cta" onClick={logMeal}>Add meal</button>
  </section>
  {standard&&<section className="a3-card a3-stack">
   <div className="a3-head"><h2>Your targets</h2></div>
   <p className="a3-muted">Set the numbers you want to track against. Leave a field blank to track without a target.</p>
   <div className="a3-fields">
    <label>Protein (g)<input inputMode="decimal" value={tv.protein} onChange={e=>setTv(v=>({...v,protein:e.target.value}))}/></label>
    <label>Calories<input inputMode="decimal" value={tv.calories} onChange={e=>setTv(v=>({...v,calories:e.target.value}))}/></label>
    <label>Carbs (g)<input inputMode="decimal" value={tv.carbs} onChange={e=>setTv(v=>({...v,carbs:e.target.value}))}/></label>
    <label>Fats (g)<input inputMode="decimal" value={tv.fats} onChange={e=>setTv(v=>({...v,fats:e.target.value}))}/></label>
    <label>Water (L)<input inputMode="decimal" value={tv.water} onChange={e=>setTv(v=>({...v,water:e.target.value}))}/></label>
   </div>
   <button className="a3-cta a3-cta-ghost" onClick={saveTargets}>Save targets</button>
  </section>}
  {advanced&&day.meals>0&&<p className="a3-muted">Today: {Math.round(day.proteinG)} g protein · {Math.round(day.carbsG)} g carbs · {Math.round(day.fatsG)} g fat across {day.meals} meal{day.meals===1?'':'s'}.</p>}
  </>}
 </div>
}
