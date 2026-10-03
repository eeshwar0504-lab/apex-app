/*
 * A small haptic vocabulary, never decoration:
 *   tick   selection            click  confirmation
 *   thud   major completion     double a personal record or other significant event
 * Off when haptics are off; shorter when the gentle option is on.
 */
type HapticKind='tick'|'click'|'thud'|'double';
const NORMAL:Record<HapticKind,number[]>={tick:[8],click:[14],thud:[32],double:[16,60,16]};
const GENTLE:Record<HapticKind,number[]>={tick:[5],click:[8],thud:[18],double:[10,60,10]};
export function haptic(kind:HapticKind,prefs:{haptics?:boolean;hapticsGentle?:boolean}){
 if(!prefs.haptics||typeof navigator==='undefined'||!('vibrate' in navigator))return;
 try{navigator.vibrate((prefs.hapticsGentle?GENTLE:NORMAL)[kind]);}catch{}
}
