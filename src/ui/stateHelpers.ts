import type {AppState,Exercise,UserProfile,Workout} from '../core/types';
import {todayLocal,addDaysLocal} from '../data/dates';
import {programExercises} from '../engine/goalProgram';
import {generateRollingWorkouts} from '../engine/rolling';
import {createWarmupPlanner} from '../engine/warmup';
import {trimSetsForDeload} from '../engine/training';
import {loadRecommendationIntoSets,personalizedLoad,loadAvailability,snapToAvailableLoad} from '../engine/training';
import {today} from './shared';
import {isWarm} from './setHelpers';

export function recommendationFor(ex:Exercise,s:AppState){
  return personalizedLoad(ex,s.workouts,s.profile,s.exercises,today(),s.deloads);
}

export function withGoalProgram(x:AppState):AppState{const programmed=programExercises(x.exercises,x.profile?.primaryGoal);return programmed===x.exercises?x:{...x,exercises:programmed};}

export function hydrateWorkoutRecommendations(w:Workout,s:AppState):Workout{
  const next=structuredClone(w);
  const now=new Date().toISOString();
  const existing=next.guidedSession;

  next.guidedSession={
    ...(existing||{}),
    phase:existing?.phase||'prep',
    exerciseIndex:existing?.exerciseIndex||0,
    setIndex:existing?.setIndex||0,
    completedSetIds:existing?.completedSetIds||[],
    skippedSetIds:existing?.skippedSetIds||[],
    skippedExerciseIds:existing?.skippedExerciseIds||[],
    substitutions:existing?.substitutions||{},
    workingLoads:existing?.workingLoads||{},
    recommendations:existing?.recommendations||{},
    sessionEquipment:existing?.sessionEquipment||{},
    setFeedback:existing?.setFeedback||{},
    calibration:existing?.calibration||{},
    pausedTotalSec:existing?.pausedTotalSec||0,
    updatedAt:now,
    version:existing?.version||1
  };

  const warmupPlanner=createWarmupPlanner(s.profile);
  next.exercises=next.exercises.map(we=>{
    const ex=s.exercises.find(e=>e.id===we.exerciseId);
    if(!ex)return we;

    const rec=recommendationFor(ex,s);
    const isExternal=!["bodyweight","none","time","assistance"].includes(ex.loadSemantics);
    const isAssisted=ex.loadSemantics==='assistance';
    const hasLoad=isExternal||isAssisted;
    const availability=loadAvailability(ex,s.profile);
    const safeRec=hasLoad
      ?snapToAvailableLoad(ex,rec.weight,s.profile)
      :rec.weight;

    const invalidLoaded=isExternal&&(
      we.recommendedWeight===0 ||
      (we.recommendedWeight!==undefined&&!Number.isFinite(we.recommendedWeight))
    );

    const recommendationWeight=safeRec!==undefined?safeRec:rec.weight;
    const nextWeight=hasLoad
      ?(recommendationWeight!==undefined
          ?recommendationWeight
          :we.recommendedWeight)
      :we.recommendedWeight;

    /*
     * On the FIRST hydration of a workout (nothing recommended for this exercise yet) every uncompleted working set
     * takes the authoritative recommendation. Loads pre-filled when the workout was created are stale by then: the
     * plan is built before any history exists, and only the recommendation reflects progression, return to training
     * and the athlete's real load list. Later hydrations (resume, feedback) never overwrite what the athlete chose.
     */
    const firstHydration=!existing?.recommendations?.[ex.id];
    const loadedSets=loadRecommendationIntoSets(ex,we.sets,nextWeight,firstHydration);
    // an active deload (src/engine/fatigue.ts) prescribes one fewer working set; applied once, when the workout is first hydrated
    const trimmedSets=firstHydration&&rec.deload?.setsRemoved?trimSetsForDeload(loadedSets):loadedSets;
    /*
     * Generated warm-ups: derived once from the working load and what earlier exercises in this session already prepared, then kept
     * on the workout like any set so they can be done, skipped or edited. They are never working sets and change no prescription.
     */
    const generated=warmupPlanner.next(ex,hasLoad?nextWeight:undefined,`${next.id}-${we.order}`,we.status==='skipped');
    const warmups=firstHydration&&!trimmedSets.some(isWarm)?generated:[];
    const nextSets=warmups.length?[...warmups,...trimmedSets]:trimmedSets;

    const calibrationState=rec.kind==='calibration'
      ?'calibrating'
      :'established';

    next.guidedSession={
      ...completeGuidedSession(next.guidedSession),
      recommendations:{
        ...(next.guidedSession?.recommendations||{}),
        [ex.id]:({
          weight:recommendationWeight,
          confidence:rec.confidence,
          kind:rec.kind,
          reason:rec.reason,
          evidence:(rec as any).evidence,
          targetRir:rec.targetRir,
          loadSemantics:ex.loadSemantics,
          incrementKg:availability.incrementKg,
          generatedAt:now
        } as any)
      },
      calibration:{
        ...(next.guidedSession?.calibration||{}),
        [ex.id]:next.guidedSession?.calibration?.[ex.id]||calibrationState
      }
    };

    return {
      ...we,
      sets:nextSets,
      repRange:we.sets.some(set=>set.completed)?we.repRange:ex.repRange,
      recommendedWeight:
        hasLoad
          ?(nextWeight!==undefined?nextWeight:(invalidLoaded?undefined:we.recommendedWeight))
          :we.recommendedWeight,
      note:
        hasLoad
          ?`${rec.kind==='calibration'?'Initial calibration':'Evidence-based recommendation'} · ${rec.reason}`
          :we.note
    };
  });

  return next;
}

export function ensureGuidedSession(w:Workout):Workout{
  if(w.guidedSession)return w;
  return {
    ...w,
    guidedSession:{
      phase:'prep',
      exerciseIndex:0,
      setIndex:0,
      completedSetIds:[],
      skippedSetIds:[],
      skippedExerciseIds:[],
      substitutions:{},
      workingLoads:{},
      recommendations:{},
      sessionEquipment:{},
      setFeedback:{},
      calibration:{},
      pausedTotalSec:0,
      updatedAt:new Date().toISOString(),
      version:1
    }
  };
}


function defaultGuidedSession(): NonNullable<Workout['guidedSession']>{
  return {
    phase:'prep',
    exerciseIndex:0,
    setIndex:0,
    completedSetIds:[],
    skippedSetIds:[],
    skippedExerciseIds:[],
    substitutions:{},
    workingLoads:{},
    sessionEquipment:{},
    recommendations:{},
    setFeedback:{},
    calibration:{},
    pausedTotalSec:0,
    updatedAt:new Date().toISOString(),
    version:1
  };
}

export function completeGuidedSession(value?:Workout['guidedSession']):NonNullable<Workout['guidedSession']>{
  return {
    ...defaultGuidedSession(),
    ...(value||{})
  } as NonNullable<Workout['guidedSession']>;
}

/* the initial week, and every later week, is generated by src/engine/rolling.ts */
export const initialWorkouts=(p:UserProfile,plan:any,exercises:Exercise[])=>generateRollingWorkouts({workouts:[],exercises,profile:p,plan},{today:todayLocal(),now:new Date().toISOString()});
export function todayPlus(offset:number){return addDaysLocal(todayLocal(),offset)}
