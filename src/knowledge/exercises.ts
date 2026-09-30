import type {Exercise} from '../core/types';

const E=(x:Exercise)=>x;

const common=(
  x:Partial<Exercise> &
    Pick<
      Exercise,
      'id'|'name'|'family'|'pattern'|'primaryMuscles'|'equipment'
    >
):Exercise=>({
  aliases:[],
  secondaryMuscles:[],
  difficulty:'beginner',
  unilateral:false,
  loadSemantics:'total',
  incrementKg:2.5,
  repRange:[8,12],
  restSec:90,
  cues:['Use a controlled, repeatable range'],
  setup:['Adjust the equipment for a stable position'],
  steps:[
    'Brace',
    'Perform the movement smoothly',
    'Control the return'
  ],
  breathing:'Exhale during the effort; inhale during the return',
  tempo:'2–1–2',
  mistakes:[
    'Rushing the movement',
    'Using momentum'
  ],
  safety:[
    'Stop if you experience sharp or unusual pain'
  ],
  alternatives:[],
  loadDescription:
    x.loadDescription ??
    (
      x.loadSemantics === 'per_hand'
        ? 'Dumbbell load is shown per hand.'
        : x.loadSemantics === 'stack'
          ? 'Load is shown from the machine/cable stack. Machine calibration and pulley ratios can vary by equipment.'
          : x.loadSemantics === 'time'
            ? 'Timed exercise. Work duration is recorded in seconds; no kg load is used.'
            : x.loadSemantics === 'bodyweight'
              ? 'Bodyweight movement. No external kg load is used.'
              : x.loadSemantics === 'none'
                ? 'No external load.'
                : x.loadSemantics === 'assistance'
                  ? 'Load is shown as assistance. Lower assistance means a harder exercise.'
                  : 'Load is shown as total external load.'
    ),
  ...x
});

export const EXERCISES:Exercise[]=[

common({
  id:'machine_chest_press',
  name:'Machine Chest Press',
  aliases:['chest press','machine press','pec press'],
  family:'horizontal press',
  pattern:'horizontal_push',
  primaryMuscles:['chest'],
  secondaryMuscles:['triceps','front delts'],
  equipment:['machine'],
  loadSemantics:'stack',
  incrementKg:2.5,
  restSec:90,
  loadDescription:
    'Machine stack load. The displayed kg is the selected stack resistance; machine calibration can vary by model.',
  setup:[
    'Adjust seat so handles align with mid chest',
    'Set a load you can control'
  ],
  steps:[
    'Brace lightly',
    'Press smoothly',
    'Return under control'
  ],
  cues:[
    'Keep shoulder blades gently set',
    'Drive handles forward'
  ],
  mistakes:[
    'Shrugging',
    'Bouncing the weight',
    'Overarching'
  ],
  alternatives:[
    'incline_machine_press',
    'push_up_machine'
  ]
}),

common({
  id:'incline_machine_press',
  name:'Incline Machine Press',
  aliases:['incline chest press','incline press'],
  family:'incline press',
  pattern:'horizontal_push',
  primaryMuscles:['upper chest'],
  secondaryMuscles:['front delts','triceps'],
  equipment:['machine'],
  loadSemantics:'stack',
  alternatives:[
    'machine_chest_press',
    'push_up_machine'
  ]
}),

common({
  id:'lat_pulldown',
  name:'Lat Pulldown',
  aliases:['pulldown','lat pull down'],
  family:'vertical pull',
  pattern:'vertical_pull',
  primaryMuscles:['lats'],
  secondaryMuscles:['biceps','upper back'],
  equipment:['cable','machine'],
  loadSemantics:'stack',
  loadDescription:
    'Cable or machine stack load. Displayed kg represents the selected stack setting; pulley ratios may vary.',
  alternatives:[
    'assisted_pullup',
    'seated_cable_row'
  ]
}),

common({
  id:'seated_cable_row',
  name:'Seated Cable Row',
  aliases:['cable row','seated row'],
  family:'horizontal pull',
  pattern:'horizontal_pull',
  primaryMuscles:['mid back'],
  secondaryMuscles:['lats','biceps','rear delts'],
  equipment:['cable'],
  loadSemantics:'stack',
  loadDescription:
    'Cable stack load. Displayed kg represents the selected stack setting; pulley ratio can vary by cable station.',
  alternatives:[
    'chest_supported_row',
    'lat_pulldown'
  ]
}),

common({
  id:'chest_supported_row',
  name:'Chest-Supported Row',
  aliases:['chest supported row'],
  family:'horizontal pull',
  pattern:'horizontal_pull',
  primaryMuscles:['upper back'],
  secondaryMuscles:['lats','biceps'],
  equipment:['dumbbell','machine'],
  loadSemantics:'per_hand',
  incrementKg:1,
  loadDescription:
    'Dumbbell load is shown per hand. If performed on a machine, the machine-specific stack/load semantics should be used by the selected exercise variant.',
  alternatives:[
    'seated_cable_row',
    'lat_pulldown'
  ]
}),

common({
  id:'assisted_pullup',
  name:'Assisted Pull-Up',
  aliases:['assisted pull up','pull-up machine'],
  family:'vertical pull',
  pattern:'vertical_pull',
  primaryMuscles:['lats'],
  secondaryMuscles:['biceps','upper back'],
  equipment:['machine'],
  loadSemantics:'assistance',
  incrementKg:2.5,
  repRange:[6,12],
  restSec:120,
  loadDescription:
    'Assistance load from the assisted-pull-up machine. Lower assistance means greater user resistance.',
  alternatives:[
    'lat_pulldown'
  ]
}),

common({
  id:'dumbbell_shoulder_press',
  name:'Dumbbell Shoulder Press',
  aliases:['db shoulder press','seated db press'],
  family:'vertical press',
  pattern:'vertical_push',
  primaryMuscles:['front delts'],
  secondaryMuscles:['side delts','triceps'],
  equipment:['dumbbell','bench'],
  loadSemantics:'per_hand',
  incrementKg:1,
  loadDescription:
    'Dumbbell load is shown per hand. For bilateral work, total external load is normally two times the per-hand value.',
  alternatives:[
    'machine_shoulder_press'
  ]
}),

common({
  id:'machine_shoulder_press',
  name:'Machine Shoulder Press',
  aliases:['shoulder press machine'],
  family:'vertical press',
  pattern:'vertical_push',
  primaryMuscles:['front delts'],
  secondaryMuscles:['side delts','triceps'],
  equipment:['machine'],
  loadSemantics:'stack',
  alternatives:[
    'dumbbell_shoulder_press'
  ]
}),

common({
  id:'dumbbell_lateral_raise',
  name:'Dumbbell Lateral Raise',
  aliases:['lateral raise','side raise'],
  family:'shoulder abduction',
  pattern:'shoulder_abduction',
  primaryMuscles:['side delts'],
  secondaryMuscles:['upper traps'],
  equipment:['dumbbell'],
  loadSemantics:'per_hand',
  incrementKg:1,
  repRange:[10,15],
  restSec:60,
  loadDescription:
    'Dumbbell load is shown per hand. Example: 5 kg means 5 kg in each hand.',
  alternatives:[
    'cable_lateral_raise'
  ]
}),

common({
  id:'cable_lateral_raise',
  name:'Cable Lateral Raise',
  aliases:['single arm cable lateral raise'],
  family:'shoulder abduction',
  pattern:'shoulder_abduction',
  primaryMuscles:['side delts'],
  secondaryMuscles:['upper traps'],
  equipment:['cable'],
  loadSemantics:'stack',
  incrementKg:1,
  repRange:[10,15],
  restSec:60,
  unilateral:true,
  loadDescription:
    'Single-arm cable stack load. Displayed kg refers to the selected cable stack setting, not a bilateral dumbbell load.',
  alternatives:[
    'dumbbell_lateral_raise'
  ]
}),

common({
  id:'dumbbell_bicep_curl',
  name:'Dumbbell Bicep Curl',
  aliases:['bicep curl','db curl'],
  family:'elbow flexion',
  pattern:'arm_flexion',
  primaryMuscles:['biceps'],
  secondaryMuscles:['brachialis'],
  equipment:['dumbbell'],
  loadSemantics:'per_hand',
  incrementKg:1,
  restSec:75,
  loadDescription:
    'Dumbbell load is shown per hand. Example: 10 kg means 10 kg in each hand.',
  alternatives:[
    'hammer_curl',
    'cable_curl'
  ]
}),

common({
  id:'hammer_curl',
  name:'Hammer Curl',
  aliases:['neutral curl'],
  family:'elbow flexion',
  pattern:'arm_flexion',
  primaryMuscles:['biceps','brachialis'],
  secondaryMuscles:['forearms'],
  equipment:['dumbbell'],
  loadSemantics:'per_hand',
  incrementKg:1,
  restSec:75,
  loadDescription:
    'Dumbbell load is shown per hand.',
  alternatives:[
    'dumbbell_bicep_curl'
  ]
}),

common({
  id:'cable_curl',
  name:'Cable Curl',
  aliases:['standing cable curl'],
  family:'elbow flexion',
  pattern:'arm_flexion',
  primaryMuscles:['biceps'],
  secondaryMuscles:['brachialis'],
  equipment:['cable'],
  loadSemantics:'stack',
  restSec:75,
  loadDescription:
    'Cable stack load. Displayed kg represents the selected stack setting.',
  alternatives:[
    'dumbbell_bicep_curl'
  ]
}),

common({
  id:'cable_triceps_pushdown',
  name:'Cable Triceps Pushdown',
  aliases:['triceps pushdown','pushdown'],
  family:'elbow extension',
  pattern:'arm_extension',
  primaryMuscles:['triceps'],
  secondaryMuscles:[],
  equipment:['cable'],
  loadSemantics:'stack',
  restSec:75,
  loadDescription:
    'Cable stack load. The displayed kg is the selected stack setting; pulley ratios can vary by machine.',
  alternatives:[
    'overhead_triceps_extension'
  ]
}),

common({
  id:'overhead_triceps_extension',
  name:'Overhead Triceps Extension',
  aliases:['overhead extension'],
  family:'elbow extension',
  pattern:'arm_extension',
  primaryMuscles:['triceps'],
  secondaryMuscles:[],
  equipment:['cable','dumbbell'],
  loadSemantics:'total',
  restSec:75,
  loadDescription:
    'External load is recorded as total load. If performed with a dumbbell, the displayed value represents the dumbbell load rather than a per-hand pair.',
  alternatives:[
    'cable_triceps_pushdown'
  ]
}),

common({
  id:'leg_press',
  name:'Leg Press',
  aliases:['leg press machine'],
  family:'knee dominant',
  pattern:'squat',
  primaryMuscles:['quads','glutes'],
  secondaryMuscles:['hamstrings'],
  equipment:['machine'],
  loadSemantics:'total',
  incrementKg:5,
  restSec:120,
  loadDescription:
    'Leg-press load is recorded as the total machine/load value selected for the exercise. This is not automatically treated as a cable-style stack.',
  alternatives:[
    'goblet_squat',
    'bodyweight_squat'
  ]
}),

common({
  id:'goblet_squat',
  name:'Goblet Squat',
  aliases:['goblet squat'],
  family:'squat',
  pattern:'squat',
  primaryMuscles:['quads','glutes'],
  secondaryMuscles:['core'],
  equipment:['dumbbell','kettlebell'],
  loadSemantics:'total',
  incrementKg:2,
  restSec:120,
  loadDescription:
    'Single implement held in front of the body. Displayed value is total external load, not per-hand.',
  alternatives:[
    'leg_press',
    'bodyweight_squat'
  ]
}),

common({
  id:'bodyweight_squat',
  name:'Bodyweight Squat',
  aliases:['air squat','squat'],
  family:'squat',
  pattern:'squat',
  primaryMuscles:['quads','glutes'],
  secondaryMuscles:['core'],
  equipment:['bodyweight'],
  loadSemantics:'bodyweight',
  incrementKg:0,
  repRange:[10,15],
  restSec:75,
  loadDescription:
    'Bodyweight movement. No external kg load is displayed.',
  alternatives:[
    'goblet_squat',
    'leg_press'
  ]
}),

common({
  id:'split_squat',
  name:'Split Squat',
  aliases:['bodyweight split squat','rear foot split squat'],
  family:'unilateral squat',
  pattern:'unilateral_squat',
  primaryMuscles:['quads','glutes'],
  secondaryMuscles:['hamstrings','core'],
  equipment:['bodyweight','dumbbell'],
  loadSemantics:'per_hand',
  unilateral:true,
  incrementKg:1,
  repRange:[8,12],
  restSec:90,
  loadDescription:
    'When loaded with dumbbells, load is shown per hand. For unilateral work, the active-side external load equals the per-hand dumbbell value.',
  alternatives:[
    'goblet_squat',
    'step_up'
  ]
}),

common({
  id:'step_up',
  name:'Step-Up',
  aliases:['step ups'],
  family:'unilateral squat',
  pattern:'unilateral_squat',
  primaryMuscles:['quads','glutes'],
  secondaryMuscles:['hamstrings'],
  equipment:['bench','dumbbell'],
  loadSemantics:'per_hand',
  unilateral:true,
  incrementKg:1,
  repRange:[8,12],
  restSec:90,
  loadDescription:
    'When loaded with dumbbells, load is shown per hand. Example: 10 kg means 10 kg in each hand.',
  alternatives:[
    'split_squat'
  ]
}),

common({
  id:'leg_curl_machine',
  name:'Leg Curl Machine',
  aliases:['leg curl','hamstring curl'],
  family:'knee flexion',
  pattern:'knee_flexion',
  primaryMuscles:['hamstrings'],
  secondaryMuscles:['calves'],
  equipment:['machine'],
  loadSemantics:'stack',
  restSec:90,
  loadDescription:
    'Machine stack load. Displayed kg represents the selected stack setting.',
  alternatives:[
    'nordic_curl'
  ]
}),

common({
  id:'nordic_curl',
  name:'Nordic Curl',
  aliases:['nordic hamstring curl'],
  family:'knee flexion',
  pattern:'knee_flexion',
  primaryMuscles:['hamstrings'],
  secondaryMuscles:['glutes'],
  equipment:['bodyweight'],
  loadSemantics:'bodyweight',
  repRange:[4,8],
  restSec:120,
  difficulty:'advanced',
  loadDescription:
    'Bodyweight movement. No external kg load is displayed.',
  alternatives:[
    'leg_curl_machine'
  ]
}),

common({
  id:'leg_extension',
  name:'Leg Extension',
  aliases:['leg extension machine'],
  family:'knee extension',
  pattern:'knee_extension',
  primaryMuscles:['quads'],
  secondaryMuscles:[],
  equipment:['machine'],
  loadSemantics:'stack',
  repRange:[10,15],
  restSec:75,
  loadDescription:
    'Machine stack load. Displayed kg represents the selected stack setting.',
  alternatives:[
    'split_squat'
  ]
}),

common({
  id:'calf_raise_machine',
  name:'Calf Raise Machine',
  aliases:['calf raise'],
  family:'plantar flexion',
  pattern:'calf',
  primaryMuscles:['calves'],
  secondaryMuscles:[],
  equipment:['machine'],
  loadSemantics:'stack',
  repRange:[10,15],
  restSec:60,
  loadDescription:
    'Machine stack load. Displayed kg represents the selected stack setting.',
  alternatives:[
    'standing_calf_raise'
  ]
}),

common({
  id:'standing_calf_raise',
  name:'Standing Calf Raise',
  aliases:['calf raise standing'],
  family:'plantar flexion',
  pattern:'calf',
  primaryMuscles:['calves'],
  secondaryMuscles:[],
  equipment:['machine','dumbbell'],
  loadSemantics:'total',
  repRange:[10,15],
  restSec:60,
  loadDescription:
    'External load is recorded as total load. The exact equipment configuration determines whether the load comes from a machine or a held implement.',
  alternatives:[
    'calf_raise_machine'
  ]
}),

common({
  id:'plank',
  name:'Plank',
  aliases:['front plank'],
  family:'anti-extension core',
  pattern:'core',
  primaryMuscles:['abs'],
  secondaryMuscles:['obliques'],
  equipment:['bodyweight'],
  loadSemantics:'time',
  incrementKg:0,
  repRange:[20,45],
  restSec:60,
  loadDescription:
    'Timed bodyweight exercise. Target work duration is 20–45 seconds. No kg load is displayed or required.',
  alternatives:[
    'dead_bug',
    'bird_dog'
  ]
}),

common({
  id:'dead_bug',
  name:'Dead Bug',
  aliases:['deadbug'],
  family:'anti-extension core',
  pattern:'core',
  primaryMuscles:['abs'],
  secondaryMuscles:['hip flexors'],
  equipment:['bodyweight'],
  loadSemantics:'none',
  incrementKg:0,
  repRange:[8,12],
  restSec:60,
  unilateral:true,
  loadDescription:
    'Bodyweight movement with no external load.',
  alternatives:[
    'bird_dog',
    'plank'
  ]
}),

common({
  id:'bird_dog',
  name:'Bird Dog',
  aliases:['bird-dog'],
  family:'anti-rotation core',
  pattern:'core',
  primaryMuscles:['core'],
  secondaryMuscles:['glutes','back'],
  equipment:['bodyweight'],
  loadSemantics:'none',
  incrementKg:0,
  repRange:[8,12],
  restSec:60,
  unilateral:true,
  loadDescription:
    'Bodyweight movement with no external load.',
  alternatives:[
    'dead_bug',
    'plank'
  ]
}),

common({
  id:'cable_face_pull',
  name:'Cable Face Pull',
  aliases:['face pull'],
  family:'scapular pull',
  pattern:'horizontal_pull',
  primaryMuscles:['rear delts'],
  secondaryMuscles:['upper back'],
  equipment:['cable'],
  loadSemantics:'stack',
  repRange:[10,15],
  restSec:60,
  loadDescription:
    'Cable stack load. Displayed kg represents the selected stack setting.',
  alternatives:[
    'chest_supported_row'
  ]
}),

common({
  id:'push_up_machine',
  name:'Chest Press Machine / Assisted Push',
  aliases:['assisted push up','push up machine'],
  family:'horizontal press',
  pattern:'horizontal_push',
  primaryMuscles:['chest'],
  secondaryMuscles:['triceps','front delts'],
  equipment:['machine'],
  loadSemantics:'stack',
  repRange:[8,15],
  restSec:90,
  loadDescription:
    'Machine stack load. Displayed kg represents the selected machine setting.',
  alternatives:[
    'machine_chest_press'
  ]
}),

common({
  id:'barbell_bench_press',
  name:'Barbell Bench Press',
  aliases:['bench press','flat bench'],
  family:'horizontal press',
  pattern:'horizontal_push',
  primaryMuscles:['chest'],
  secondaryMuscles:['triceps','front delts'],
  equipment:['barbell','bench'],
  loadSemantics:'total',
  incrementKg:2.5,
  restSec:150,
  difficulty:'intermediate',
  loadDescription:
    'Barbell total load = bar weight + plates. APEX records total loaded weight. Bar weight is optional and is never assumed.',
  alternatives:[
    'machine_chest_press',
    'dumbbell_bench_press'
  ]
}),

common({
  id:'dumbbell_bench_press',
  name:'Dumbbell Bench Press',
  aliases:['db bench press'],
  family:'horizontal press',
  pattern:'horizontal_push',
  primaryMuscles:['chest'],
  secondaryMuscles:['triceps','front delts'],
  equipment:['dumbbell','bench'],
  loadSemantics:'per_hand',
  incrementKg:1,
  restSec:120,
  loadDescription:
    'Dumbbell load is shown per hand. For bilateral work, total external load is normally two times the per-hand value.',
  alternatives:[
    'barbell_bench_press',
    'machine_chest_press'
  ]
}),

common({
  id:'romanian_deadlift',
  name:'Romanian Deadlift',
  aliases:['RDL'],
  family:'hip hinge',
  pattern:'hinge',
  primaryMuscles:['hamstrings','glutes'],
  secondaryMuscles:['back'],
  equipment:['barbell','dumbbell'],
  loadSemantics:'total',
  incrementKg:2.5,
  restSec:150,
  difficulty:'intermediate',
  loadDescription:
    'Total external load. For a barbell, this includes the bar plus plates. For dumbbells, the total can be calculated from the per-hand values.',
  alternatives:[
    'hip_thrust'
  ]
}),

common({
  id:'hip_thrust',
  name:'Hip Thrust',
  aliases:['barbell hip thrust'],
  family:'hip extension',
  pattern:'hinge',
  primaryMuscles:['glutes'],
  secondaryMuscles:['hamstrings'],
  equipment:['barbell','bench','machine'],
  loadSemantics:'total',
  incrementKg:2.5,
  restSec:120,
  loadDescription:
    'Total external load. When using a barbell, this includes bar plus plates; machine variants may use their own machine-specific load system.',
  alternatives:[
    'romanian_deadlift'
  ]
}),

common({
  id:'leg_calf_bodyweight',
  name:'Single-Leg Calf Raise',
  aliases:['single leg calf raise'],
  family:'plantar flexion',
  pattern:'calf',
  primaryMuscles:['calves'],
  secondaryMuscles:[],
  equipment:['bodyweight','bench'],
  loadSemantics:'bodyweight',
  incrementKg:0,
  repRange:[10,20],
  restSec:60,
  unilateral:true,
  loadDescription:
    'Bodyweight unilateral movement. No external kg load is displayed.',
  alternatives:[
    'standing_calf_raise'
  ]
}),

];

export const EXERCISE_BY_ID=new Map(
  EXERCISES.map(x=>[x.id,x])
);

export const normalizeTerm=(s:string)=>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g,' ');

export function findExercises(query:string){
  const q=normalizeTerm(query);

  if(!q)return EXERCISES;

  return EXERCISES.filter(e=>
    normalizeTerm([
      e.name,
      ...e.aliases,
      e.family,
      e.pattern,
      ...e.primaryMuscles,
      ...e.secondaryMuscles
    ].join(' ')).includes(q)
  );
}