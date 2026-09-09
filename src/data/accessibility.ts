export type FontScale='system'|'large'|'larger';

export function fontScaleValue(scale:FontScale):number{
  return scale==='larger'?1.18:scale==='large'?1.10:1;
}

export function normalizeFontScale(value:unknown):FontScale{
  return value==='large'||value==='larger'?value:'system';
}

export function accessibilityClass(scale:FontScale,highContrast:boolean,reducedMotion:boolean):string{
  return [
    scale!=='system'?`font-${scale}`:'',
    highContrast?'high-contrast':'',
    reducedMotion?'reduce-motion':''
  ].filter(Boolean).join(' ');
}
