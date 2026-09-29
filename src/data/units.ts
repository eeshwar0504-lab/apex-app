/*
 * Display-unit boundary.
 *
 * All stored data and every engine calculation stay in kilograms and
 * centimetres. Only presentation strings and user-typed inputs cross this
 * boundary, so progression, load availability and persistence are unaffected.
 */
export type UnitSystem='metric'|'imperial';

const KG_TO_LB=2.2046226218;
const CM_TO_IN=1/2.54;

let current:UnitSystem='metric';

export function setUnits(units:UnitSystem|undefined){current=units==='imperial'?'imperial':'metric'}
export function getUnits():UnitSystem{return current}
export function normalizeUnits(value:unknown):UnitSystem{return value==='imperial'?'imperial':'metric'}

const trim=(n:number,digits=1)=>{const f=Math.pow(10,digits);return Math.round(n*f)/f};

export const weightLabel=()=>current==='imperial'?'lb':'kg';
export const weightWord=()=>current==='imperial'?'pounds':'kilograms';
export const lengthLabel=()=>current==='imperial'?'in':'cm';

/** kg -> display number (rounded to 0.1 in imperial, unchanged in metric). */
export function wt(kg:number):number{return current==='imperial'?trim(kg*KG_TO_LB):kg}
/** display number -> kg (full precision so round trips do not drift). */
export function fromWt(value:number):number{return current==='imperial'?value/KG_TO_LB:value}
export function len(cm:number):number{return current==='imperial'?trim(cm*CM_TO_IN):cm}
export function fromLen(value:number):number{return current==='imperial'?value/CM_TO_IN:value}
/** volume (kg x reps) -> display number. */
export function vol(kgReps:number):number{return current==='imperial'?Math.round(kgReps*KG_TO_LB):kgReps}
export const volLabel=()=>`${weightLabel()}·reps`;

/** Editable text for an input: '' when unset, otherwise the converted number. */
export function wtInput(kg:number|undefined):string|number{return kg===undefined?'':wt(kg)}

/**
 * Converts engine-authored prose ("10 kg total", "2.5 kg progression step")
 * to the active unit system. Metric text is returned unchanged.
 */
export function displayText(text:string):string{
  if(!text)return text;
  /* engine strings can carry float noise (12.666666666666666); show one decimal */
  text=text.replace(/[0-9]+\.[0-9]{3,}/g,n=>String(Math.round(Number(n)*10)/10));
  if(current!=='imperial')return text;
  return text
    .replace(/(\d+(?:\.\d+)?)(\s*)kg\b/g,(_m,n:string,sp:string)=>`${trim(Number(n)*KG_TO_LB)}${sp}lb`)
    .replace(/\bkg\b/g,'lb');
}
