import type {Exercise} from './core/types';

export type TrainingImageKind='training-floor'|'strength-session'|'group-training';

export const APEX_TRAINING_IMAGES:Record<TrainingImageKind,{src:string;alt:string;source:string}>={
  'training-floor':{
    src:'/imagery/training-floor.jpg',
    alt:'Gym interior with strength-training equipment.',
    source:'Pexels photo 1552242'
  },
  'strength-session':{
    src:'/imagery/strength-session.jpg',
    alt:'Athletes training with free weights.',
    source:'Pexels photo 841130'
  },
  'group-training':{
    src:'/imagery/group-training.jpg',
    alt:'Group fitness training in a gym.',
    source:'Pexels photo 3837781'
  }
};

export function imageKindForExercise(exercise:Pick<Exercise,'pattern'|'equipment'|'loadSemantics'>):TrainingImageKind{
  if(exercise.equipment.includes('barbell')||exercise.pattern==='squat'||exercise.pattern==='hinge'){
    return 'strength-session';
  }

  if(exercise.loadSemantics==='bodyweight'||exercise.equipment.includes('bodyweight')){
    return 'group-training';
  }

  return 'training-floor';
}