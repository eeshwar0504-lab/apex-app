import type {Exercise} from '../core/types';


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
  progressions:['dumbbell_bench_press'],
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
  progressions:['barbell_row'],
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
  safetyConsiderations:[{kind:'equipment_check',note:'Check the assistance setting before each set; lower assistance is harder.',modification:'Increase the assistance if you cannot keep the movement controlled.'}],
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
  progressions:['overhead_barbell_press'],
  safetyConsiderations:[{kind:'range_of_motion',note:'Press through a range you can control and keep the dumbbells stable at the bottom.',modification:'Use the machine shoulder press or a lighter pair of dumbbells.'}],
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
  progressions:['dumbbell_shoulder_press'],
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
  progressions:['barbell_back_squat'],
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
  progressions:['goblet_squat'],
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
  safetyConsiderations:[{kind:'balance',note:'A single-leg position that asks for balance as well as strength.',modification:'Hold a stable support with one hand while you learn the movement.'}],
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
  safetyConsiderations:[{kind:'balance',note:'A single-leg movement; the step and bench must be stable.',modification:'Lower the step or hold a stable support.'}],
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
  progressions:['nordic_curl'],
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
  safetyConsiderations:[{kind:'load_control',note:'A demanding lengthening movement for the back of the thigh; build the range and repetitions gradually.',modification:'Use the machine leg curl, or limit the range you lower through.'}],
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
  safetyConsiderations:[{kind:'setup',note:'Set the safety arms or have a spotter when working close to your limit.',modification:'Use the dumbbell or machine press when no spotter or safety arms are available.'}],
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
  progressions:['barbell_bench_press'],
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
  safetyConsiderations:[{kind:'technique_sensitive',note:'The hip hinge is technique sensitive; use a load at which the position stays controlled through the whole set.',modification:'Reduce the load or the range until every repetition looks the same.',guidance:'If the hip hinge is new to you, a qualified coach can check your technique.'}],
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
  safetyConsiderations:[{kind:'setup',note:'Pad the bar and set the bench so neither can slide during the set.',modification:'Start with bodyweight or a lighter bar to practise the position.'}],
  progressions:['romanian_deadlift'],
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
  progressions:['standing_calf_raise'],
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

/* ------------------------------------------------------------------------------------------------------------------
 * Catalogue 2.0 additions. Each fills a pattern gap that the earlier catalogue left, using only the existing equipment
 * vocabulary. A progression is declared only where it is the same movement made harder in a way the catalogue can state
 * (difficulty rises, pattern is kept); everything else is an alternative.
 * ---------------------------------------------------------------------------------------------------------------- */

common({
  id:'one_arm_dumbbell_row',
  safetyConsiderations:[{kind:'setup',note:'Support your free hand on a stable bench or rack so the torso stays still while the dumbbell moves.',modification:'Use a lighter dumbbell, or the chest-supported row, if the torso starts to twist.'}],
  name:'One-Arm Dumbbell Row',
  aliases:['single arm dumbbell row','db row','one arm row'],
  family:'horizontal pull',
  pattern:'horizontal_pull',
  primaryMuscles:['mid back'],
  secondaryMuscles:['lats','biceps','rear delts'],
  equipment:['dumbbell'],
  loadSemantics:'per_hand',
  incrementKg:1,
  unilateral:true,
  cues:['Keep the hips and shoulders square','Pull the elbow toward the hip','Lower under control'],
  setup:['Place one hand and the same-side knee on a bench, or one hand on a stable rack','Hold the dumbbell with a neutral grip and a flat back'],
  steps:['Brace and keep the torso still','Pull the dumbbell toward the hip','Pause briefly, then lower to full arm extension'],
  mistakes:['Twisting the torso to lift the weight','Shrugging the shoulder toward the ear'],
  loadDescription:'Dumbbell load is shown for the one dumbbell in the working hand.',
  alternatives:['chest_supported_row','seated_cable_row']
}),

common({
  id:'barbell_row',
  safetyConsiderations:[{kind:'technique_sensitive',note:'Holding a flat, braced torso under a barbell is technique sensitive; use a load at which the position stays the same all set.',modification:'Reduce the load, or use the chest-supported row, until every repetition looks the same.'}],
  name:'Barbell Row',
  aliases:['bent over row','bent-over barbell row'],
  family:'horizontal pull',
  pattern:'horizontal_pull',
  primaryMuscles:['mid back','lats'],
  secondaryMuscles:['biceps','rear delts','back'],
  equipment:['barbell'],
  loadSemantics:'total',
  incrementKg:2.5,
  restSec:150,
  difficulty:'intermediate',
  cues:['Hinge until the torso is near flat','Row the bar to the lower ribs','Keep the neck in line with the spine'],
  setup:['Stand with the bar over mid-foot and hinge to take an overhand grip','Brace the torso before each repetition'],
  steps:['Lift the bar just clear of the floor or rack','Row it to the lower ribs without changing the torso angle','Lower to straight arms under control'],
  mistakes:['Standing up as the bar rises','Rounding the back to lift more weight'],
  loadDescription:'Total external load. For a barbell, this includes the bar plus plates.',
  alternatives:['chest_supported_row','seated_cable_row','one_arm_dumbbell_row']
}),

common({
  id:'push_up',
  name:'Push-Up',
  aliases:['pushup','press-up','press up'],
  family:'horizontal press',
  pattern:'horizontal_push',
  primaryMuscles:['chest'],
  secondaryMuscles:['triceps','front delts','core'],
  equipment:['bodyweight'],
  loadSemantics:'bodyweight',
  incrementKg:0,
  repRange:[6,20],
  restSec:75,
  cues:['Keep a straight line from head to heels','Lower the chest between the hands','Press the floor away'],
  setup:['Place the hands under the shoulders on the floor or a raised surface','Brace the core and glutes'],
  steps:['Lower the chest toward the floor with the elbows about 45 degrees from the body','Pause briefly just above the floor','Press back to straight arms'],
  mistakes:['Letting the hips sag','Flaring the elbows straight out'],
  loadDescription:'Bodyweight movement. No external kg load is displayed.',
  alternatives:['machine_chest_press','dumbbell_bench_press','push_up_machine']
}),

common({
  id:'overhead_barbell_press',
  safetyConsiderations:[{kind:'load_control',note:'Keep the bar path over the mid-foot and the ribs down; add load only when every repetition ends in the same stable position.',modification:'Use the dumbbell or machine shoulder press at a lighter load.'}],
  name:'Overhead Barbell Press',
  aliases:['barbell shoulder press','standing press','military press'],
  family:'vertical press',
  pattern:'vertical_push',
  primaryMuscles:['front delts'],
  secondaryMuscles:['side delts','triceps','core'],
  equipment:['barbell'],
  loadSemantics:'total',
  incrementKg:2.5,
  repRange:[6,10],
  restSec:150,
  difficulty:'intermediate',
  cues:['Squeeze the glutes and brace','Press in a straight line','Finish with the bar over the mid-foot'],
  setup:['Set the bar at upper-chest height in a rack, hands just outside the shoulders','Step back with the bar resting on the shoulders'],
  steps:['Brace and press the bar up, moving the head back then through','Lock out with the bar over the mid-foot','Lower to the shoulders under control'],
  mistakes:['Leaning back to push the bar up','Pressing the bar out in front of the body'],
  loadDescription:'Total external load. For a barbell, this includes the bar plus plates.',
  alternatives:['dumbbell_shoulder_press','machine_shoulder_press']
}),

common({
  id:'barbell_back_squat',
  safetyConsiderations:[
    {kind:'setup',note:'Set the rack safety arms or pins just below the lowest point of your squat before loading the bar.',modification:'Use the goblet squat or leg press if no rack with safeties is available.'},
    {kind:'technique_sensitive',note:'Bar position, bracing and depth are technique sensitive; learn them with an empty bar or a goblet squat first.',modification:'Reduce the load or the depth until every repetition looks the same.'}
  ],
  name:'Barbell Back Squat',
  aliases:['back squat','barbell squat','squat'],
  family:'squat',
  pattern:'squat',
  primaryMuscles:['quads','glutes'],
  secondaryMuscles:['hamstrings','core','back'],
  equipment:['barbell'],
  loadSemantics:'total',
  incrementKg:2.5,
  repRange:[5,10],
  restSec:150,
  difficulty:'intermediate',
  cues:['Brace before you descend','Knees track over the toes','Drive up through the whole foot'],
  setup:['Set the bar on the upper back in a rack','Stand with the feet about shoulder width and the toes slightly out'],
  steps:['Unrack and step back','Descend under control to a depth you can hold with a neutral spine','Stand up while keeping the torso angle'],
  mistakes:['Letting the knees cave in','Rising with the hips first and the chest dropping'],
  loadDescription:'Total external load. For a barbell, this includes the bar plus plates.',
  alternatives:['goblet_squat','leg_press','bodyweight_squat']
}),

common({
  id:'reverse_lunge',
  safetyConsiderations:[{kind:'balance',note:'Step back into a space you can control and keep a wall or rack within reach while the movement is new.',modification:'Hold a support, or use the split squat, until the balance is steady.'}],
  name:'Reverse Lunge',
  aliases:['dumbbell reverse lunge','backward lunge'],
  family:'unilateral squat',
  pattern:'unilateral_squat',
  primaryMuscles:['quads','glutes'],
  secondaryMuscles:['hamstrings','core'],
  equipment:['bodyweight','dumbbell'],
  loadSemantics:'per_hand',
  incrementKg:1,
  unilateral:true,
  restSec:90,
  cues:['Step back far enough that the front shin stays upright','Keep the torso tall','Push through the front foot to return'],
  setup:['Stand tall holding a dumbbell in each hand, or none','Clear the space behind you'],
  steps:['Step one foot back and lower the back knee toward the floor','Keep most of the weight on the front foot','Push back up and step the feet together'],
  mistakes:['Taking a step that is too short','Letting the front knee drift inward'],
  loadDescription:'Dumbbell load is shown per hand. With no dumbbells it is a bodyweight movement.',
  alternatives:['split_squat','step_up','goblet_squat']
}),

common({
  id:'glute_bridge',
  name:'Glute Bridge',
  aliases:['bodyweight glute bridge','hip bridge'],
  family:'hip extension',
  pattern:'hinge',
  primaryMuscles:['glutes'],
  secondaryMuscles:['hamstrings','core'],
  equipment:['bodyweight'],
  loadSemantics:'bodyweight',
  incrementKg:0,
  repRange:[10,20],
  restSec:60,
  progressions:['hip_thrust'],
  cues:['Feet flat, shins near vertical at the top','Squeeze the glutes at the top','Keep the ribs down'],
  setup:['Lie on your back with the knees bent and the feet flat, about hip width apart'],
  steps:['Brace and press through the heels to lift the hips','Pause with the hips in line with the shoulders and knees','Lower under control'],
  mistakes:['Arching the lower back at the top','Pushing through the toes'],
  loadDescription:'Bodyweight movement. No external kg load is displayed.',
  alternatives:['hip_thrust','romanian_deadlift']
}),

common({
  id:'kettlebell_deadlift',
  safetyConsiderations:[{kind:'technique_sensitive',note:'The hip hinge is technique sensitive; use a kettlebell that lets the back stay flat for every repetition.',modification:'Raise the kettlebell on a low platform, or use the glute bridge, until the hinge is consistent.'}],
  name:'Kettlebell Deadlift',
  aliases:['kb deadlift','kettlebell hinge'],
  family:'hip hinge',
  pattern:'hinge',
  primaryMuscles:['hamstrings','glutes'],
  secondaryMuscles:['back','core'],
  equipment:['kettlebell'],
  loadSemantics:'total',
  incrementKg:4,
  progressions:['barbell_deadlift'],
  cues:['Push the hips back, not the knees forward','Keep the kettlebell close','Stand tall at the top without leaning back'],
  setup:['Place the kettlebell between the feet, about shoulder width apart','Hinge to take it with both hands'],
  steps:['Brace and push the floor away to stand','Squeeze the glutes at the top','Hinge back down and set the kettlebell down under control'],
  mistakes:['Squatting the weight up with a rounded back','Leaning back at the top'],
  loadDescription:'Single kettlebell held with both hands. Displayed value is total external load.',
  alternatives:['romanian_deadlift','hip_thrust','glute_bridge']
}),

common({
  id:'barbell_deadlift',
  safetyConsiderations:[
    {kind:'technique_sensitive',note:'Setting the back and hips before the bar leaves the floor is technique sensitive; learn it light first.',modification:'Use the kettlebell deadlift or a lighter load until each repetition starts from the same position.'},
    {kind:'load_control',note:'Add load only when the last repetition of every set looks like the first.',modification:'Hold the load for another session when the position changes late in a set.'}
  ],
  name:'Barbell Deadlift',
  aliases:['deadlift','conventional deadlift'],
  family:'hip hinge',
  pattern:'hinge',
  primaryMuscles:['hamstrings','glutes'],
  secondaryMuscles:['back','quads','core'],
  equipment:['barbell'],
  loadSemantics:'total',
  incrementKg:2.5,
  repRange:[5,8],
  restSec:180,
  difficulty:'intermediate',
  cues:['Set the back and brace before pulling','Keep the bar against the legs','Stand tall to finish'],
  setup:['Stand with the bar over mid-foot, feet about hip width','Hinge down and take an overhand grip just outside the legs'],
  steps:['Brace and push the floor away','Keep the bar close as it passes the knees','Lock out with the hips and knees, then lower under control'],
  mistakes:['Jerking the bar off the floor','Rounding the back as the bar leaves the floor'],
  loadDescription:'Total external load. For a barbell, this includes the bar plus plates.',
  alternatives:['romanian_deadlift','kettlebell_deadlift','hip_thrust']
}),

common({
  id:'pallof_press',
  safetyConsiderations:[{kind:'setup',note:'Set the cable at chest height and stand far enough from the stack that the resistance pulls you sideways.',modification:'Take a smaller step away from the stack, or use less load.'}],
  name:'Pallof Press',
  aliases:['cable pallof press','anti-rotation press'],
  family:'anti-rotation core',
  pattern:'core',
  primaryMuscles:['core'],
  secondaryMuscles:['obliques','shoulders'],
  equipment:['cable'],
  loadSemantics:'stack',
  incrementKg:2.5,
  unilateral:true,
  repRange:[10,15],
  restSec:60,
  cues:['Resist the pull of the cable','Keep the hips and shoulders square','Press and return slowly'],
  setup:['Stand side-on to a cable at chest height','Hold the handle with both hands at the chest and step away until the cable is tight'],
  steps:['Brace so the cable cannot turn you','Press the handle straight out','Pause with the arms extended, then bring it back to the chest'],
  mistakes:['Letting the torso rotate toward the stack','Leaning away to counter the load'],
  loadDescription:'Load is shown from the cable stack. Pulley ratios can vary by equipment.',
  alternatives:['bird_dog','plank','dead_bug']
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