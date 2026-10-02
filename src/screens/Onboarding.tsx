import {useState} from 'react';
import type {Goal,GoalKind,UserProfile,Workout} from '../core/types';
import {EXERCISES} from '../knowledge/exercises';
import {buildPlan,uid} from '../engine/training';
import {Icon,ApexImage,ApexRidge} from '../ui/primitives';
import {initialWorkouts,todayPlus} from '../ui/stateHelpers';



export function Onboarding({onDone}:{onDone:(p:UserProfile,g:Goal,plan:any)=>void}){

  const [step,setStep]=useState(0);
  const [name,setName]=useState('');
  const [exp,setExp]=useState<'beginner'|'intermediate'|'advanced'|null>(null);
  const [goal,setGoal]=useState<GoalKind|null>(null);
  const [days,setDays]=useState<number|null>(null);
  const [mins,setMins]=useState<number|null>(null);
  const [equipment,setEquipment]=useState<string[]>([]);
  const [building,setBuilding]=useState(false);
  const [error,setError]=useState('');

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

  const togg=(x:string)=>{
    setError('');
    setEquipment(a=>
      a.includes(x)
        ? a.filter(q=>q!==x)
        : [...a,x]
    );
  };

  const canContinue =
    step===0 ||
    (step===1 && !!exp) ||
    (step===2 && !!goal) ||
    (step===3 && !!days && !!mins);

  const continueOnboarding=()=>{
    setError('');

    if(step===1 && !exp){
      setError('Choose your training experience to continue.');
      return;
    }

    if(step===2 && !goal){
      setError('Choose your training goal to continue.');
      return;
    }

    if(step===3 && (!days || !mins)){
      setError('Choose your training days and typical session length to continue.');
      return;
    }

    setStep(x=>Math.min(4,x+1));
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

      /*
       * Build the deterministic training plan.
       * The training engine remains the source of truth.
       */
      const built=buildPlan(
        p,
        EXERCISES,
        [g]
      );

      if(
        !built ||
        !Array.isArray(built.days) ||
        !built.exerciseSets
      ){
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

      /*
       * Build workouts only from exercise IDs that actually exist.
       * This prevents a bad exercise reference from crashing onboarding.
       */
      const ws=initialWorkouts(p,plan,EXERCISES);

      if(!ws.length){
        throw new Error(
          'APEX could not create any workouts from the selected equipment.'
        );
      }

      /*
       * Link generated plan days to their actual workout IDs.
       */
      const linked={
        ...plan,
        days:plan.days.map((d:any)=>{
          if(d.rest)return d;

          const matching=ws.find(
            (w:Workout)=>
              w.scheduledDate===todayPlus(d.dayIndex) &&
              w.name===d.label
          );

          return {
            ...d,
            workoutId:matching?.id
          };
        })
      };

      /*
       * Hand the complete validated onboarding result back to App.
       */
      onDone(
        p,
        g,
        linked
      );

      setBuilding(false);

    }catch(err){

      console.error(
        '[APEX] onboarding plan generation failed',
        err
      );

      setBuilding(false);

      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong while building your APEX plan. Please try again.'
      );
    }
  };

  return (
    <div className={`onboarding ${step===0?'is-intro':''}`}>
      <ApexImage kind={step===0?'strength-session':'training-floor'} alt="" className="a3-onb-bg" eager/>
      <ApexRidge className="a3-onb-ridge"/>

      <div className="onboard-progress-meta"><span>SETUP</span><strong>{String(step+1).padStart(2,'0')} / 05</strong></div>

      <div className="onboard-brand">
        <img
          src="/brand/apex-mark-gold.png"
          alt="APEX"
        />
        <span>APEX</span>
      </div>

      <div className="progress-line">
        <i
          style={{
            width:`${((step+1)/5)*100}%`
          }}
        />
      </div>

      {step===0&&(
        <div className="onboard-body a3-intro">
          <img className="a3-intro-mark" src="/brand/apex-mark-gold.png" alt="APEX"/>
          <h1>Stronger you,<br/>with discipline.</h1>
          <p>Small steps.<br/>Real progress.<br/>Lasting results.</p>
        </div>
      )}

      {step===1&&(
        <div className="onboard-body">
          <span className="a3-eyebrow">
            CONTEXT / 02
          </span>

          <h1>
            Just enough context.
          </h1>

          <label>
            Name

            <input
              value={name}
              onChange={e=>setName(e.target.value)}
              placeholder="Optional"
            />
          </label>

          <div className="choice-grid">

            <button
              type="button"
              className={exp==='beginner'?'selected':''}
              onClick={()=>setExp('beginner')}
            >
              <strong>Beginner</strong>
              <small>
                New or returning to structured training
              </small>
            </button>

            <button
              type="button"
              className={exp==='intermediate'?'selected':''}
              onClick={()=>setExp('intermediate')}
            >
              <strong>Intermediate</strong>
              <small>
                Consistent training experience
              </small>
            </button>

            <button
              type="button"
              className={exp==='advanced'?'selected':''}
              onClick={()=>setExp('advanced')}
            >
              <strong>Advanced</strong>
              <small>
                Established training history
              </small>
            </button>

          </div>
        </div>
      )}

      {step===2&&(
        <div className="onboard-body">

          <span className="a3-eyebrow">
            GOAL / 03
          </span>

          <h1>
            What’s your goal?
          </h1>
          <p>Choose your primary focus.</p>

          <div className="choice-grid a3-goals">

            {(Object.keys(goalText) as GoalKind[]).map(g=>(
              <button
                type="button"
                className={`a3-goalcard ${goal===g?'selected':''}`}
                onClick={()=>setGoal(g)}
                key={g}
              >
                <span className="a3-goalicon"><Icon name={goalIcon[g]}/></span>
                <span className="a3-goaltext">
                  <strong>{goalText[g]}</strong>
                  <small>{goalNote[g]}</small>
                </span>
              </button>
            ))}

          </div>
        </div>
      )}

      {step===3&&(
        <div className="onboard-body">

          <span className="a3-eyebrow">
            SCHEDULE / 04
          </span>

          <h1>
            Build around real availability.
          </h1>

          <label>
            Training days
          </label>

          <div className="choice-grid compact">

            {[2,3,4,5,6].map(v=>(
              <button
                type="button"
                className={days===v?'selected':''}
                key={v}
                onClick={()=>setDays(v)}
              >
                <strong>{v}</strong>
                <small>days / week</small>
              </button>
            ))}

          </div>

          <label>
            Typical session
          </label>

          <div className="choice-grid compact">

            {[30,45,60,75,90].map(v=>(
              <button
                type="button"
                className={mins===v?'selected':''}
                key={v}
                onClick={()=>setMins(v)}
              >
                <strong>{v}</strong>
                <small>minutes</small>
              </button>
            ))}

          </div>

        </div>
      )}

      {step===4&&(
        <div className="onboard-body">

          <span className="a3-eyebrow">
            EQUIPMENT / 05
          </span>

          <h1>
            What can you train with?
          </h1>

          <div className="choice-grid equipment">

            {[
              'machine',
              'cable',
              'dumbbell',
              'barbell',
              'bench',
              'kettlebell',
              'bodyweight'
            ].map(x=>(
              <button
                type="button"
                className={
                  equipment.includes(x)
                    ?'selected'
                    :''
                }
                key={x}
                onClick={()=>togg(x)}
              >
                <strong>{x}</strong>

                <small>
                  {
                    equipment.includes(x)
                      ?'Available'
                      :'Not selected'
                  }
                </small>
              </button>
            ))}

          </div>

          {error&&(
            <div
              className="a3-card a3-callout a3-error onboarding-error"
              role="alert"
            >
              <Icon name="bolt"/>

              <div>
                <strong>
                  Couldn't build your plan
                </strong>

                <p>
                  {error}
                </p>
              </div>
            </div>
          )}

        </div>
      )}

      <div className="onboard-footer">

        <button
          type="button"
          className="a3-cta a3-cta-ghost"
          disabled={!step||building}
          onClick={()=>setStep(x=>x-1)}
        >
          Back
        </button>

        {step===0?(
          <div className="a3-intro-nav">
            <span className="a3-dots" aria-hidden="true"><i className="on"/><i/><i/><i/></span>
            <button type="button" className="a3-arrowbtn" aria-label="Continue" disabled={!canContinue} onClick={continueOnboarding}><Icon name="arrow" size={22}/></button>
          </div>
        ):step<4?(
          <button
            type="button"
            className="a3-cta"
            disabled={!canContinue}
            onClick={continueOnboarding}
          >
            Continue
            <Icon name="chev"/>
          </button>
        ):(
          <button
            type="button"
            className="a3-cta"
           disabled={building||!exp||!goal||!days||!mins||!equipment.length}
            onClick={buildMyPlan}
          >
            {building
              ?'Building your plan…'
              :'Build my APEX plan'
            }

            {!building&&<Icon name="bolt"/>}
          </button>
        )}

      </div>

    </div>
  );
}
