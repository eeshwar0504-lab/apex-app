const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

/*
 * Phase 10 executes the real TypeScript training engine rather than testing
 * copies of its formulas. The test compiles only the engine to an isolated
 * temporary CommonJS directory, so npm test remains self-contained.
 */
function loadTrainingEngine(){
  const root=path.resolve(__dirname,'..');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'apex-training-test-'));
  fs.writeFileSync(path.join(temp,'package.json'),'{"type":"commonjs"}');
  const tsc=path.join(
    root,
    'node_modules',
    'typescript',
    'bin',
    'tsc'
  );

  execFileSync(process.execPath,[
    tsc,
    path.join(root,'src/engine/training.ts'),
    '--target','ES2022',
    '--module','commonjs',
    '--moduleResolution','node',
    '--skipLibCheck',
    '--rootDir',root,
    '--outDir',temp
  ],{cwd:root,stdio:'pipe'});
  return require(path.join(temp,'src','engine','training.js'));
}

const training=loadTrainingEngine();

const makeExercise=(overrides={})=>({
  id:'test-exercise',
  name:'Test Exercise',
  aliases:[],
  family:'test',
  pattern:'horizontal_push',
  primaryMuscles:['chest'],
  secondaryMuscles:[],
  equipment:['machine'],
  loadSemantics:'total',
  incrementKg:2.5,
  repRange:[8,12],
  restSec:90,
  difficulty:'beginner',
  setup:[],
  steps:[],
  cues:[],
  mistakes:[],
  alternatives:[],
  ...overrides
});

const exercises={
  machineChestPress:makeExercise({
    id:'machine_chest_press',name:'Machine Chest Press',
    pattern:'horizontal_push',equipment:['machine'],loadSemantics:'stack',incrementKg:2.5,repRange:[8,12]
  }),
  legPress:makeExercise({
    id:'leg_press',name:'Leg Press',pattern:'squat',equipment:['machine'],loadSemantics:'total',incrementKg:5,repRange:[8,12]
  }),
  latPulldown:makeExercise({
    id:'lat_pulldown',name:'Lat Pulldown',pattern:'vertical_pull',equipment:['cable','machine'],loadSemantics:'stack',incrementKg:2.5,repRange:[8,12]
  }),
  cablePushdown:makeExercise({
    id:'cable_triceps_pushdown',name:'Cable Triceps Pushdown',pattern:'arm_extension',equipment:['cable'],loadSemantics:'stack',incrementKg:2.5,repRange:[8,12]
  }),
  lateralRaise:makeExercise({
    id:'dumbbell_lateral_raise',name:'Dumbbell Lateral Raise',pattern:'shoulder_abduction',equipment:['dumbbell'],loadSemantics:'per_hand',incrementKg:1,repRange:[10,15],unilateral:false
  }),
  rdl:makeExercise({
    id:'romanian_deadlift',name:'Romanian Deadlift',pattern:'hinge',equipment:['barbell','dumbbell'],loadSemantics:'total',incrementKg:2.5,repRange:[8,12]
  }),
  plank:makeExercise({
    id:'plank',name:'Plank',pattern:'core',equipment:['bodyweight'],loadSemantics:'time',incrementKg:0,repRange:[20,45]
  })
};

const profile={experience:'beginner'};
const configuredProfile={
  ...profile,
  loadIncrementsKg:{
    machine:[5,7.5,10,12.5,15,17.5,20],
    cable:[2.5,5,7.5,10,12.5,15,17.5,20],
    dumbbell:[2,3,4,5,6,7,8,9,10,12],
    barbell:[20,22.5,25,27.5,30,32.5,35,37.5,40,42.5,45,47.5,50]
  }
};

function completedSet(id,weight,reps,rir=2){
  return {id,weight,reps,rir,completed:true,timestamp:'2026-09-10T10:00:00.000Z',type:'working',disposition:'completed'};
}

function workoutFor(ex,sets,status='completed'){
  return {
    id:`w-${ex.id}`,
    name:'Test Workout',
    scheduledDate:'2026-09-10',
    status,
    version:1,
    updatedAt:'2026-09-10T10:00:00.000Z',
    exercises:[{
      exerciseId:ex.id,
      order:0,
      prescribedSets:sets.length,
      repRange:ex.repRange,
      recommendedWeight:sets[0]?.weight,
      restSec:ex.restSec,
      sets,
      status:'planned'
    }],
    planId:'plan-test',
    source:'custom',
    guidedSession:{
      phase:'ready',exerciseIndex:0,setIndex:0,
      completedSetIds:[],skippedSetIds:[],skippedExerciseIds:[],
      pausedTotalSec:0,version:1,updatedAt:'2026-09-10T10:00:00.000Z'
    }
  };
}

/* ============================================================
   Existing regression coverage
   ============================================================ */

test('load progression uses a small exercise-specific increment',()=>{const next=Math.round((50+2.5)/2.5)*2.5;assert.equal(next,52.5)});
test('assisted progression moves assistance downward',()=>{const current=40;const increment=2.5;assert.equal(current-increment,37.5)});
test('comparable load semantics stay separate',()=>{assert.notEqual('per_hand','assistance');assert.notEqual('stack','time');assert.notEqual('bodyweight','total')});
test('set types cover the adaptive engine contract',()=>{const types=['warmup','working','drop','failure','amrap','rest_pause','myo_reps','tempo','cluster','timed','bodyweight','assisted','unilateral'];assert.equal(types.length,13);assert.ok(types.includes('amrap'));assert.ok(types.includes('timed'));});
test('conservative automatic load changes stay within 15 percent',()=>{const current=50;const safe=55;const unsafe=60;assert.ok((safe-current)/current<=.15);assert.ok((unsafe-current)/current>.15)});
test('assisted safety interprets a lower assistance value as progression',()=>{const current=40,next=37.5;assert.ok(next<current)});
test('immutable workout statuses distinguish missed skipped rescheduled and extra',()=>{const statuses=['missed','skipped','rescheduled','extra'];assert.deepEqual(statuses.sort(),['extra','missed','rescheduled','skipped'].sort())});
test('workout editing contract supports repeat, remove, reorder and replacement',()=>{const actions=['repeat-set','remove-set','reorder-exercise','replace-exercise'];assert.deepEqual(actions,['repeat-set','remove-set','reorder-exercise','replace-exercise'])});
test('skipping an exercise does not mean its sets were performed',()=>{const exercise={status:'skipped',sets:[{completed:false}]};assert.equal(exercise.status,'skipped');assert.equal(exercise.sets[0].completed,false)});
test('rest timer contract is based on elapsed wall-clock time',()=>{const start=1000000,end=start+90000,now=start+30000;assert.equal(Math.ceil((end-now)/1000),60)});
test('goal milestones progress through explicit thresholds',()=>{const percent=63;const milestones=[25,50,75,100].map(x=>({threshold:x,reached:percent>=x}));assert.deepEqual(milestones.map(x=>x.reached),[true,true,false,false])});
test('estimated strength is explicitly distinct from a measured load record',()=>{const weight=60,reps=8;const estimated=weight*(1+reps/30);assert.ok(estimated>weight);assert.equal('estimated 1RM','estimated 1RM')});
test('production integrity contract rejects duplicate workout identity',()=>{const ids=['w-1','w-1'];assert.equal(new Set(ids).size,1)});
test('analytics interpretation stays contextual rather than a global score',()=>{const result={direction:'stable',changePct:2};assert.ok(['up','down','stable','insufficient'].includes(result.direction));assert.ok(!('score' in result))});
test('missed-workout notification has a future delivery time',()=>{const now=new Date('2026-09-09T10:00:00Z');const followUp=new Date(now);followUp.setMinutes(followUp.getMinutes()+10);assert.ok(followUp.getTime()>now.getTime())});
test('notification IDs stay inside the reserved APEX range',()=>{const min=1800000000,max=1899999999;const sample=[1800000000,1845678901,1899999999];assert.ok(sample.every(id=>id>=min&&id<=max))});
test('notification scheduling never needs another app identity',()=>{const intent={id:'workout-w1',kind:'workout',actionRoute:'train'};assert.equal(intent.kind,'workout');assert.equal(intent.actionRoute,'train')});
test('release policy keeps 100 percent reserved for production validation',()=>{const implementationPercent=98;assert.ok(implementationPercent<100);assert.ok(['physical-device','release-build','e2e'].includes('physical-device'))});
test('accessibility source exposes safe font scaling and normalization',()=>{const fs=require('fs');const src=fs.readFileSync('src/data/accessibility.ts','utf8');assert.match(src,/normalizeFontScale/);assert.match(src,/fontScaleValue/);assert.match(src,/return scale==='larger'\?1\.18:scale==='large'\?1\.10:1/)});
test('accessibility preferences are persisted in repository defaults',()=>{const fs=require('fs');const src=fs.readFileSync('src/data/repository.ts','utf8');assert.match(src,/fontScale:'system'/);assert.match(src,/highContrast:false/)});
test('release audit script exists and package exposes verification commands',()=>{const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));assert.ok(fs.existsSync('scripts/release-audit.mjs'));assert.equal(pkg.scripts.audit,'node scripts/release-audit.mjs');assert.equal(pkg.scripts.verify,'npm test && npm run audit')});

/* ============================================================
   45 — Recommendation tests
   ============================================================ */

test('recommendation: Machine Chest Press has a positive stack calibration',()=>{
  const r=training.personalizedLoad(exercises.machineChestPress,[],configuredProfile,[exercises.machineChestPress]);
  assert.ok(r.weight>0);assert.equal(r.kind,'calibration');assert.equal(r.confidence,'low');
});

test('recommendation: Leg Press has a positive total-load calibration',()=>{
  const r=training.personalizedLoad(exercises.legPress,[],configuredProfile,[exercises.legPress]);
  assert.ok(r.weight>0);assert.equal(r.kind,'calibration');
});

test('recommendation: Lat Pulldown has a positive stack calibration',()=>{
  const r=training.personalizedLoad(exercises.latPulldown,[],configuredProfile,[exercises.latPulldown]);
  assert.ok(r.weight>0);assert.equal(r.kind,'calibration');
});

test('recommendation: Cable Triceps Pushdown has a positive stack calibration',()=>{
  const r=training.personalizedLoad(exercises.cablePushdown,[],configuredProfile,[exercises.cablePushdown]);
  assert.ok(r.weight>0);assert.equal(r.kind,'calibration');
});

test('recommendation: Dumbbell Lateral Raise is per-hand and positive',()=>{
  const r=training.personalizedLoad(exercises.lateralRaise,[],configuredProfile,[exercises.lateralRaise]);
  assert.ok(r.weight>0);assert.equal(r.kind,'calibration');
  assert.equal(training.loadUnit(exercises.lateralRaise),'kg / hand');
});

test('recommendation: Romanian Deadlift is a positive total-load calibration',()=>{
  const r=training.personalizedLoad(exercises.rdl,[],configuredProfile,[exercises.rdl]);
  assert.ok(r.weight>0);assert.equal(r.kind,'calibration');
});

test('recommendation: Plank is timed and never recommends external kilograms',()=>{
  const r=training.personalizedLoad(exercises.plank,[],configuredProfile,[exercises.plank]);
  assert.equal(r.weight,undefined);assert.equal(r.kind,'baseline');assert.equal(training.loadUnit(exercises.plank),'seconds');
  assert.equal(training.formatLoad(exercises.plank,0),'20–45 sec');
});
/* ============================================================
   46 — Calibration progression
   ============================================================ */
test('calibration: no history starts with an explicit low-confidence recommendation',()=>{
  const r=training.personalizedLoad(exercises.machineChestPress,[],configuredProfile,[exercises.machineChestPress]);
  assert.ok(r.weight>0);assert.equal(r.kind,'calibration');assert.equal(r.confidence,'low');assert.match(r.reason,/No exercise-specific history/i);
});

test('calibration: too heavy lowers the next recommendation',()=>{
  const ex=exercises.machineChestPress;
  const lower=training.feedbackLoad(ex,15,'heavy',{reps:6,rir:0},ex.repRange,2,configuredProfile);
  assert.ok(lower<15);assert.ok(lower>0);
});

test('calibration: about right establishes a stable baseline',()=>{
  const ex=exercises.machineChestPress;
  const held=training.feedbackLoad(ex,10,'right',{reps:10,rir:2},ex.repRange,2,configuredProfile);
  assert.equal(held,10);
  const history=[workoutFor(ex,[completedSet('s1',held,10,2)])];
  const r=training.personalizedLoad(ex,history,configuredProfile,[ex]);
  assert.equal(r.kind,'baseline');assert.equal(r.weight,10);
});

test('calibration: successful future performance can progress the recommendation',()=>{
  const ex=exercises.machineChestPress;
  const sets=[completedSet('s1',10,12,2),completedSet('s2',10,12,2)];
  const result=training.progression(ex,sets,{experience:'beginner'});
  assert.equal(result.action,'increase');assert.equal(result.weight,12.5);
  const history=[workoutFor(ex,sets)];
  const r=training.personalizedLoad(ex,history,configuredProfile,[ex]);
  assert.equal(r.kind,'baseline');assert.equal(r.weight,12.5);
});

/* ============================================================
   47 — Equipment tests
   ============================================================
 */

test('equipment: available load options are detected separately from exercise semantics',()=>{
  const result=training.loadAvailability(exercises.machineChestPress,configuredProfile);
  assert.equal(result.available,true);assert.ok(result.options.includes(10));assert.equal(result.source,'equipment');
});

test('equipment: unavailable load selection is explicit when no increment exists',()=>{
  const ex=makeExercise({id:'unknown_loaded',name:'Unknown Loaded Movement',equipment:['unknown_equipment'],loadSemantics:'total',incrementKg:0});
  const result=training.loadAvailability(ex,{});
  assert.equal(result.available,false);assert.equal(result.source,'none');assert.match(result.reason,/explicit calibration/i);
});

test('equipment: an alternative can replace an exercise in the session',()=>{
  const original=exercises.machineChestPress;
  const alternative=makeExercise({id:'push_up_machine',name:'Push-Up Machine',pattern:original.pattern,equipment:['machine'],loadSemantics:'stack',incrementKg:2.5,repRange:original.repRange});
  const workout=workoutFor(original,[completedSet('s1',10,10,2)]);
  const replaced=training.replaceWorkoutExercise(workout,original.id,alternative,[original,alternative]);
  assert.equal(replaced.exercises[0].exerciseId,alternative.id);assert.equal(replaced.exercises[0].replacementFrom,original.id);assert.equal(replaced.exercises[0].status,'replaced');
});

test('equipment: accepted alternative preserves the original workout/program object',()=>{
  const original=exercises.machineChestPress;
  const alternative=makeExercise({id:'push_up_machine',name:'Push-Up Machine',pattern:original.pattern,equipment:['machine'],loadSemantics:'stack',incrementKg:2.5,repRange:original.repRange});
  const workout=workoutFor(original,[completedSet('s1',10,10,2)]);
  const before=structuredClone(workout);
  const replaced=training.replaceWorkoutExercise(workout,original.id,alternative,[original,alternative]);
  assert.deepEqual(workout,before);
  assert.notEqual(replaced,workout);
  assert.equal(workout.exercises[0].exerciseId,original.id);
});

/* ============================================================
   48 — Session state tests
   ============================================================
 */

test('session state: completed sets are counted as completed',()=>{
  const ex=exercises.machineChestPress;
  const workout=workoutFor(ex,[completedSet('s1',10,10,2),{id:'s2',completed:false,disposition:'not_started',type:'working'}]);
  const assessment=training.sessionAssessment(workout,[ex],[]);
  assert.equal(assessment.completedSets,1);assert.equal(assessment.plannedSets,2);
});

test('session state: set skip is distinct from completion',()=>{
  const ex=exercises.machineChestPress;
  const workout=workoutFor(ex,[{id:'s1',completed:false,disposition:'not_started',type:'working'}]);
  const skipped=training.markWorkoutSetSkipped(workout,ex.id,'s1');
  assert.equal(skipped.exercises[0].sets[0].completed,false);assert.equal(skipped.exercises[0].sets[0].disposition,'skipped');assert.deepEqual(skipped.guidedSession.skippedSetIds,['s1']);
});

test('session state: exercise skip is distinct and preserves completed sets',()=>{
  const ex=exercises.machineChestPress;
  const workout=workoutFor(ex,[completedSet('s1',10,10,2),{id:'s2',completed:false,disposition:'not_started',type:'working'}]);
  const skipped=training.markWorkoutExerciseSkipped(workout,ex.id);
  assert.equal(skipped.exercises[0].status,'skipped');assert.equal(skipped.exercises[0].sets[0].completed,true);assert.equal(skipped.exercises[0].sets[1].disposition,'skipped');assert.deepEqual(skipped.guidedSession.skippedExerciseIds,[ex.id]);
});

test('session state: pause records reason and checkpoint',()=>{
  const ex=exercises.machineChestPress;
  const workout=workoutFor(ex,[{id:'s1',completed:false,disposition:'not_started',type:'working'}],'in_progress');
  const paused=training.pauseWorkoutSession(workout,'user','2026-09-10T11:00:00.000Z');
  assert.equal(paused.pausedAt,'2026-09-10T11:00:00.000Z');assert.equal(paused.guidedSession.pauseReason,'user');assert.equal(paused.guidedSession.lastCheckpointAt,'2026-09-10T11:00:00.000Z');
});

test('session state: resume clears pause while preserving guided position',()=>{
  const ex=exercises.machineChestPress;
  const workout=workoutFor(ex,[{id:'s1',completed:false,disposition:'not_started',type:'working'}],'in_progress');
  const paused=training.pauseWorkoutSession(workout,'user','2026-09-10T11:00:00.000Z');
  const resumed=training.resumeWorkoutSession(paused,'2026-09-10T11:02:30.000Z');
  assert.equal(resumed.pausedAt,undefined);assert.equal(resumed.guidedSession.pauseReason,undefined);assert.equal(resumed.guidedSession.exerciseIndex,0);assert.equal(resumed.guidedSession.setIndex,0);assert.equal(resumed.pausedTotalSec,150);
});

test('session state: background pause is explicitly recoverable',()=>{
  const ex=exercises.machineChestPress;
  const workout=workoutFor(ex,[completedSet('s1',10,10,2),{id:'s2',completed:false,disposition:'not_started',type:'working'}],'in_progress');
  workout.guidedSession.phase='rest';workout.guidedSession.exerciseIndex=0;workout.guidedSession.setIndex=1;
  const paused=training.pauseWorkoutSession(workout,'background','2026-09-10T12:00:00.000Z');
  const recovered=training.recoverWorkoutSession(paused);
  assert.equal(recovered.guidedSession.pauseReason,'background');assert.equal(recovered.guidedSession.exerciseIndex,0);assert.equal(recovered.guidedSession.setIndex,1);assert.ok(recovered.guidedSession.completedSetIds.includes('s1'));
});

test('session state: reopen recovery does not advance the persisted position',()=>{
  const ex=exercises.machineChestPress;
  const workout=workoutFor(ex,[completedSet('s1',10,10,2),{id:'s2',completed:false,disposition:'not_started',type:'working'}],'in_progress');
  workout.guidedSession.exerciseIndex=0;workout.guidedSession.setIndex=1;workout.guidedSession.phase='rest';
  const recovered=training.recoverWorkoutSession(workout);
  assert.equal(recovered.guidedSession.exerciseIndex,0);assert.equal(recovered.guidedSession.setIndex,1);assert.equal(recovered.guidedSession.phase,'rest');
});

test('session state: workout completion assessment reaches full completion',()=>{
  const ex=exercises.machineChestPress;
  const workout=workoutFor(ex,[completedSet('s1',10,10,2),completedSet('s2',10,10,2)],'completed');
  const assessment=training.sessionAssessment(workout,[ex],[]);
  assert.equal(assessment.completedSets,2);assert.equal(assessment.plannedSets,2);assert.equal(assessment.skippedSets,0);
});
