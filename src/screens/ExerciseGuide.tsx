import type {Exercise} from '../core/types';

/*
 * "How do I physically do this?" answered where the beginner is already looking: on the exercise itself, before the first set.
 * Everything here is the existing exercise knowledge (setup, steps, cues, mistakes, safety); nothing is written for this screen.
 */
export function ExerciseGuide({ex}:{ex:Exercise}){
 return <section className="a3-guide" aria-label={`How to do ${ex.name}`}>
  <h4 className="a3-guide-title">How to do it</h4>
  {ex.setup.length>0&&<div className="a3-guide-block"><span className="a3-eyebrow">Set up</span><ul className="a3-bullets">{ex.setup.map(x=><li key={x}>{x}</li>)}</ul></div>}
  {ex.steps.length>0&&<div className="a3-guide-block"><span className="a3-eyebrow">Do the movement</span><ol className="a3-bullets">{ex.steps.map(x=><li key={x}>{x}</li>)}</ol></div>}
  {ex.cues.length>0&&<div className="a3-guide-block"><span className="a3-eyebrow">Keep in mind</span><ul className="a3-bullets">{ex.cues.map(x=><li key={x}>{x}</li>)}</ul></div>}
  {ex.mistakes.length>0&&<div className="a3-guide-block"><span className="a3-eyebrow">Common mistakes</span><ul className="a3-bullets">{ex.mistakes.map(x=><li key={x}>{x}</li>)}</ul></div>}
  {ex.safety.length>0&&<div className="a3-guide-block"><span className="a3-eyebrow">Stay safe</span><ul className="a3-bullets">{ex.safety.map(x=><li key={x}>{x}</li>)}</ul></div>}
 </section>
}
