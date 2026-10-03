import {useEffect,useRef,useState} from 'react';
import type {Goal,GoalKind,UserProfile,Workout} from '../core/types';
import {EXERCISES} from '../knowledge/exercises';
import {buildPlan,uid} from '../engine/training';
import {Icon,ApexImage,ApexLine} from '../ui/primitives';
import {initialWorkouts,todayPlus} from '../ui/stateHelpers';
import {EXPERIENCE_OPTIONS,ExperiencePreview} from '../ui/experience';
import type {UiExperience} from '../ui/experience';
import {equipmentLabel} from '../ui/shared';
import {motionMs} from '../ui/motion';

/*
 * Onboarding is calibration: goal, experience, schedule, equipment, preferences and how much to show. Then the profile is read back,
 * and the plan visibly assembles from exactly those answers. Nothing is asked that the plan does not use.
 */
type OnboardingPreferences={units:'metric'|'imperial';haptics:boolean;reducedMotion:boolean;uiExperience:UiExperience};
const STEPS=8;
const EQUIPMENT_NOTE:Record<string,string>={machine:'Weight stacks you sit or lie at',cable:'A pulley with a handle and weight stack',dumbbell:'Hand weights',barbell:'A long bar loaded with plates',bench:'A flat or adjustable bench',kettlebell:'A weight with a handle',bodyweight:'Exercises using only your body'};

export function Onboarding({onDone}:{onDone:(p:UserProfile,g:Goal,plan:any,prefs:OnboardingPreferences)=>void}){
  const [step,setStep]=useState(0);
  const [name,setName]=useState('');
  const [exp,setExp]=useState<'beginner'|'intermediate'|'advanced'|null>(null);
  const [goal,setGoal]=useState<GoalKind|null>(null);
  const [days,setDays]=useState<number|null>(null);
  const [mins,setMins]=useState<number|null>(null);
  const [equipment,setEquipment]=useState<string[]>([]);
  const [units,setUnits]=useState<'metric'|'imperial'>('metric');
  const [haptics,setHaptics]=useState(true);
  const [reducedMotion,setReducedMotion]=useState(false);
  const [ui,setUi]=useState<UiExperience>('guided');
  const [building,setBuilding]=useState(false);
  const [assembling,setAssembling]=useState<{labels:string[]}|null>(null);
  const [error,setError]=useState('');
  const timer=useRef<number|undefined>(undefined);
  useEffect(()=>()=>window.clearTimeout(timer.current),[]);

  const goalText:Record<GoalKind,string>={
    strength:'Get Stronger',
    hypertrophy:'Build Muscle',
    fat_loss:'Get Leaner',
    fitness:'Stay Fit',
    general:'Train Balanced'
  };
  const goalNote:Record<GoalKind,string>={
    strength:'Increase strength',
    hypertrophy:'Gain muscle mass',
    fat_loss:'Reduce body fat',
    fitness:'General fitness',
    general:'Flexible balanced training'
  };
  const goalIcon:Record<GoalKind,string>={strength:'bolt',hypertrophy:'layers',fat_loss:'target',fitness:'activity',general:'shield'};
  const expText={beginner:'Beginner',intermediate:'Intermediate',advanced:'Advanced'} as const;

  const togg=(x:string)=>{
    setError('');
    setEquipment(a=>a.includes(x)?a.filter(q=>q!==x):[...a,x]);
  };

  const canContinue=
    step===0||
    (step===1&&!!goal)||
    (step===2&&!!exp)||
    (step===3&&!!days&&!!mins)||
    (step===4&&equipment.length>0)||
    step===5||step===6;

  const continueOnboarding=()=>{
    setError('');
    if(step===1&&!goal){setError('Choose your training goal to continue.');return}
    if(step===2&&!exp){setError('Choose your training experience to continue.');return}
    if(step===3&&(!days||!mins)){setError('Choose your training days and typical session length to continue.');return}
    if(step===4&&equipment.length===0){setError('Choose at least one equipment option to continue.');return}
    setStep(x=>Math.min(STEPS-1,x+1));
  };

  const buildMyPlan=()=>{
    if(building)return;
    setError('');

    if(!exp||!goal||!days||!mins||equipment.length===0){
      setError('Choose your training experience, goal, schedule and at least one equipment option.');
      return;
    }

    setBuilding(true);

    try{
      const now=new Date().toISOString();
      const p:UserProfile={
        id:uid('user'),
        name:name.trim(),
        experience:exp,
        goals:[goal],
        primaryGoal:goal,
        trainingDays:days,
        sessionMinutes:mins,
        equipment:[...equipment],
        body:{},
        createdAt:now
      };
      const g:Goal={
        id:uid('goal'),
        kind:goal,
        title:goalText[goal],
        priority:1,
        periodId:uid('period'),
        status:'active'
      };

      /* The deterministic engine builds the plan; nothing about it depends on the interface choices below. */
      const built=buildPlan(p,EXERCISES,[g]);
      if(!built||!Array.isArray(built.days)||!built.exerciseSets){
        throw new Error('APEX could not generate a valid training plan.');
      }
      const plan={
        id:uid('plan'),
        name:built.name,
        mode:'continuous' as const,
        days:built.days,
        version:1,
        createdAt:now,
        updatedAt:now,
        exerciseSets:built.exerciseSets
      };
      const ws=initialWorkouts(p,plan,EXERCISES);
      if(!ws.length){
        throw new Error('APEX could not create any workouts from the selected equipment.');
      }
      const linked={
        ...plan,
        days:plan.days.map((d:any)=>{
          if(d.rest)return d;
          const matching=ws.find((w:Workout)=>w.scheduledDate===todayPlus(d.dayIndex)&&w.name===d.label);
          return {...d,workoutId:matching?.id};
        })
      };
      const prefs:OnboardingPreferences={units,haptics,reducedMotion,uiExperience:ui};
      const finish=()=>{onDone(p,g,linked,prefs);setBuilding(false);setAssembling(null)};

      /* the plan assembles from the answers just given, then Home appears; with reduced motion there is no wait */
      const wait=reducedMotion?0:motionMs('--motion-slow',520)*3;
      if(!wait){finish();return}
      setAssembling({labels:built.days.filter((d:any)=>!d.rest).map((d:any)=>String(d.label))});
      timer.current=window.setTimeout(finish,wait);
    }catch(err){
      console.error('[APEX] onboarding plan generation failed',err);
      setBuilding(false);
      setError(err instanceof Error?err.message:'Something went wrong while building your APEX plan. Please try again.');
    }
  };

  const answers:Array<[string,string]>=[
    ['Goal',goal?goalText[goal]:''],
    ['Experience',exp?expText[exp]:''],
    ['Schedule',days&&mins?`${days} days a week · ${mins} min`:''],
    ['Equipment',equipment.map(equipmentLabel).join(', ')],
    ['Units',units==='metric'?'Metric (kg, cm)':'Imperial (lb, in)'],
    ['View',EXPERIENCE_OPTIONS.find(o=>o.id===ui)?.name||'Guided']
  ];

  return (
    <div className={`onboarding ${step===0?'is-intro':''}`}>
      <ApexImage kind={step===0?'strength-session':'training-floor'} alt="" className="a3-onb-bg" eager/>

      <div className="onboard-progress-meta"><span>SETUP</span><strong>{String(step+1).padStart(2,'0')} / {String(STEPS).padStart(2,'0')}</strong></div>

      <div className="onboard-brand">
        <img src="/brand/apex-mark-gold.png" alt="APEX"/>
        <span>APEX</span>
      </div>

      <ApexLine value={(step+1)/STEPS} variant="progress" label="Setup progress"/>

      {step===0&&(
        <div className="onboard-body a3-intro">
          <img className="a3-intro-mark" src="/brand/apex-mark-gold.png" alt="APEX"/>
          <h1>Stronger you,<br/>with discipline.</h1>
          <p>Small steps.<br/>Real progress.<br/>Lasting results.</p>
        </div>
      )}

      {step===1&&(
        <div className="onboard-body">
          <span className="a3-eyebrow">GOAL / 02</span>
          <h1>What’s your goal?</h1>
          <p>Choose your primary focus.</p>
          <div className="choice-grid a3-goals">
            {(Object.keys(goalText) as GoalKind[]).map(g=>(
              <button type="button" className={`a3-goalcard ${goal===g?'selected':''}`} onClick={()=>setGoal(g)} key={g} aria-pressed={goal===g}>
                <span className="a3-goalicon"><Icon name={goalIcon[g]}/></span>
                <span className="a3-goaltext"><strong>{goalText[g]}</strong><small>{goalNote[g]}</small></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step===2&&(
        <div className="onboard-body">
          <span className="a3-eyebrow">EXPERIENCE / 03</span>
          <h1>How experienced are you?</h1>
          <label>
            Name
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Optional"/>
          </label>
          <div className="choice-grid">
            <button type="button" className={exp==='beginner'?'selected':''} onClick={()=>setExp('beginner')}>
              <strong>Beginner</strong>
              <small>New or returning to structured training</small>
            </button>
            <button type="button" className={exp==='intermediate'?'selected':''} onClick={()=>setExp('intermediate')}>
              <strong>Intermediate</strong>
              <small>Consistent training experience</small>
            </button>
            <button type="button" className={exp==='advanced'?'selected':''} onClick={()=>setExp('advanced')}>
              <strong>Advanced</strong>
              <small>Established training history</small>
            </button>
          </div>
        </div>
      )}

      {step===3&&(
        <div className="onboard-body">
          <span className="a3-eyebrow">SCHEDULE / 04</span>
          <h1>Build around real availability.</h1>
          <label>Training days</label>
          <div className="choice-grid compact">
            {[2,3,4,5,6].map(v=>(
              <button type="button" className={days===v?'selected':''} key={v} onClick={()=>setDays(v)}>
                <strong>{v}</strong>
                <small>days / week</small>
              </button>
            ))}
          </div>
          <label>Typical session</label>
          <div className="choice-grid compact">
            {[30,45,60,75,90].map(v=>(
              <button type="button" className={mins===v?'selected':''} key={v} onClick={()=>setMins(v)}>
                <strong>{v}</strong>
                <small>minutes</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {step===4&&(
        <div className="onboard-body">
          <span className="a3-eyebrow">EQUIPMENT / 05</span>
          <h1>What can you train with?</h1>
          <p>Pick everything you can use. You can change this later.</p>
          <div className="choice-grid equipment">
            {['machine','cable','dumbbell','barbell','bench','kettlebell','bodyweight'].map(x=>(
              <button type="button" className={equipment.includes(x)?'selected':''} key={x} onClick={()=>togg(x)} aria-pressed={equipment.includes(x)}>
                <strong>{equipmentLabel(x)}</strong>
                <small>{EQUIPMENT_NOTE[x]}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {step===5&&(
        <div className="onboard-body">
          <span className="a3-eyebrow">PREFERENCES / 06</span>
          <h1>A few preferences.</h1>
          <label>Units</label>
          <div className="choice-grid compact">
            <button type="button" className={units==='metric'?'selected':''} onClick={()=>setUnits('metric')}><strong>Metric</strong><small>kg · cm</small></button>
            <button type="button" className={units==='imperial'?'selected':''} onClick={()=>setUnits('imperial')}><strong>Imperial</strong><small>lb · in</small></button>
          </div>
          <label className="a3-toggle"><span>Haptics</span><input type="checkbox" aria-label="Haptics" checked={haptics} onChange={e=>setHaptics(e.target.checked)}/></label>
          <label className="a3-toggle"><span>Reduce motion</span><input type="checkbox" aria-label="Reduce motion" checked={reducedMotion} onChange={e=>setReducedMotion(e.target.checked)}/></label>
        </div>
      )}

      {step===6&&(
        <div className="onboard-body">
          <span className="a3-eyebrow">VIEW / 07</span>
          <h1>How much do you want to see?</h1>
          <p className="a3-muted">This changes what you see, not what you train.</p>
          <div className="choice-grid" role="radiogroup" aria-label="UI Experience">
            {EXPERIENCE_OPTIONS.map(o=>(
              <button type="button" role="radio" aria-checked={ui===o.id} className={ui===o.id?'selected':''} key={o.id} onClick={()=>setUi(o.id)}>
                <strong>{o.name}</strong>
                <small>{o.note}</small>
              </button>
            ))}
          </div>
          <ExperiencePreview level={ui}/>
        </div>
      )}

      {step===7&&!assembling&&(
        <div className="onboard-body">
          <span className="a3-eyebrow">YOUR APEX PROFILE / 08</span>
          <h1>Your APEX profile.</h1>
          <dl className="apex-profile-read">
            {answers.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'—'}</dd></div>)}
          </dl>
          {error&&(
            <div className="a3-card a3-callout a3-error onboarding-error" role="alert">
              <Icon name="bolt"/>
              <div><strong>Couldn't build your plan</strong><p>{error}</p></div>
            </div>
          )}
        </div>
      )}

      {assembling&&(
        <div className="onboard-body apex-assemble" role="status" aria-live="polite">
          <span className="a3-eyebrow a3-gold">BUILDING YOUR PLAN</span>
          <h1>Assembling from what you told us.</h1>
          <ol className="apex-assemble-inputs">
            {answers.slice(0,4).map(([k,v],i)=><li className="mo-travel" key={k} style={{['--i' as string]:i} as React.CSSProperties}><small>{k}</small><strong>{v}</strong></li>)}
          </ol>
          <ApexLine value={1} variant="progress" className="apex-assemble-line"/>
          <ol className="apex-assemble-plan">
            {assembling.labels.map((l,i)=><li className="mo-travel" key={l+i} style={{['--i' as string]:i+4} as React.CSSProperties}>{l}</li>)}
          </ol>
        </div>
      )}

      {step>=1&&step<=4&&error&&<p className="a3-muted" role="alert">{error}</p>}

      {!assembling&&<div className="onboard-footer">
        <button type="button" className="a3-cta a3-cta-ghost" disabled={!step||building} onClick={()=>setStep(x=>x-1)}>Back</button>

        {step===0?(
          <div className="a3-intro-nav">
            <span className="a3-dots" aria-hidden="true"><i className="on"/><i/><i/><i/></span>
            <button type="button" className="a3-arrowbtn" aria-label="Continue" disabled={!canContinue} onClick={continueOnboarding}><Icon name="arrow" size={22}/></button>
          </div>
        ):step<STEPS-1?(
          <button type="button" className="a3-cta" disabled={!canContinue} onClick={continueOnboarding}>Continue<Icon name="chev"/></button>
        ):(
          <button type="button" className="a3-cta apex-primary" disabled={building||!exp||!goal||!days||!mins||!equipment.length} onClick={buildMyPlan}>
            {building?'Building your plan…':'Build my APEX plan'}
            {!building&&<Icon name="bolt"/>}
          </button>
        )}
      </div>}
    </div>
  );
}
