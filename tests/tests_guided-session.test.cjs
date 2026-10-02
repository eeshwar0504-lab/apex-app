const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const {execFileSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'apex-guided-session-'));

execFileSync(process.execPath,[
  path.join(root,'node_modules','typescript','bin','tsc'),
  path.join(root,'src','engine','training.ts'),
  path.join(root,'src','engine','guidedSession.ts'),
  '--target','ES2022',
  '--module','commonjs',
  '--moduleResolution','node',
  '--skipLibCheck',
  '--rootDir',root,
  '--outDir',temp
],{cwd:root,stdio:'pipe'});

const engine=require(path.join(temp,'src','engine','guidedSession.js'));

function set(id,weight=10){
  return {
    id,
    weight,
    reps:10,
    rir:2,
    completed:false,
    type:'working'
  };
}

function workout(sets){
  return {
    id:'w1',
    name:'QA Workout',
    scheduledDate:'2026-09-26',
    status:'in_progress',
    version:1,
    updatedAt:'2026-09-26T10:00:00.000Z',
    exercises:[{
      exerciseId:'ex1',
      order:0,
      prescribedSets:sets.length,
      repRange:[8,12],
      recommendedWeight:10,
      restSec:90,
      sets,
      status:'planned'
    }],
    planId:'p1',
    source:'custom',
    guidedSession:{
      phase:'set_active',
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
      updatedAt:'2026-09-26T10:00:00.000Z',
      version:1
    }
  };
}

test('three-set exercise remains on set 3 after sets 1 and 2',()=>{
  let w=workout([set('s1'),set('s2'),set('s3')]);

  w=engine.completeSet(w,0,0,'2026-09-26T10:01:00.000Z');
  assert.equal(w.guidedSession.phase,'feedback');
  assert.equal(w.exercises[0].sets.filter(x=>x.completed).length,1);

  w.guidedSession.phase='rest';
  w=engine.continueAfterRest(w,'2026-09-26T10:02:00.000Z').workout;
  assert.equal(w.guidedSession.setIndex,1);
  assert.equal(w.guidedSession.phase,'set_ready');

  w=engine.completeSet(w,0,1,'2026-09-26T10:03:00.000Z');
  w.guidedSession.phase='rest';
  w=engine.continueAfterRest(w,'2026-09-26T10:04:00.000Z').workout;

  assert.equal(w.guidedSession.exerciseIndex,0);
  assert.equal(w.guidedSession.setIndex,2);
  assert.equal(w.guidedSession.phase,'set_ready');
  assert.equal(w.exercises[0].sets.filter(x=>x.completed).length,2);
});

test('only the third completed set can finish a three-set exercise',()=>{
  let w=workout([set('s1'),set('s2'),set('s3')]);

  for(let i=0;i<3;i++){
    w=engine.completeSet(w,0,i,`2026-09-26T10:0${i}:00.000Z`);
    if(i<2){
      w.guidedSession.phase='rest';
      w=engine.continueAfterRest(w,`2026-09-26T10:1${i}:00.000Z`).workout;
    }
  }

  assert.equal(w.exercises[0].sets.every(x=>x.completed),true);
  w.guidedSession.phase='rest';
  const result=engine.continueAfterRest(w,'2026-09-26T10:20:00.000Z');
  assert.equal(result.workout.guidedSession.phase,'complete');
});

test('set completion preserves the actual completed load',()=>{
  let w=workout([set('s1',10),set('s2',12.5),set('s3',12.5)]);
  w=engine.completeSet(w,0,0,'2026-09-26T10:01:00.000Z');

  assert.equal(w.exercises[0].sets[0].weight,10);
  assert.equal(w.exercises[0].sets[0].completed,true);
});

test('future sets are the only sets eligible for feedback load changes',()=>{
  let w=workout([set('s1',10),set('s2',10),set('s3',10)]);
  w=engine.completeSet(w,0,0,'2026-09-26T10:01:00.000Z');

  const fakeExercise={
    id:'ex1',
    name:'Test Machine',
    equipment:['machine'],
    loadSemantics:'machine',
    repRange:[8,12],
    restSec:90,
  };

  w=engine.applySetFeedback(
    w,
    fakeExercise,
    0,
    0,
    'easy',
    {loadIncrementsKg:{machine:[5,7.5,10,12.5,15]}},
    2,
    '2026-09-26T10:02:00.000Z'
  );

  assert.equal(w.exercises[0].sets[0].weight,10);
  assert.equal(w.exercises[0].sets[1].weight,12.5);
  assert.equal(w.exercises[0].sets[2].weight,12.5);
});

test('after feedback, the next set is selected before the next exercise',()=>{
  let w=workout([set('s1'),set('s2'),set('s3')]);
  w=engine.completeSet(w,0,0,'2026-09-26T10:01:00.000Z');
  w.guidedSession.phase='rest';

  const result=engine.continueAfterRest(w,'2026-09-26T10:02:00.000Z');

  assert.equal(result.workout.guidedSession.exerciseIndex,0);
  assert.equal(result.workout.guidedSession.setIndex,1);
  assert.equal(result.workout.guidedSession.phase,'set_ready');
});

console.log('guided-session tests: PASS');

test('rest after set feedback honours state.preferences (restPreference / restCustomSec), not the profile',()=>{
  const ex={id:'ex1',name:'Test Machine',equipment:['machine'],loadSemantics:'machine',repRange:[8,12],restSec:90};
  const rest=(preferences,profile={})=>{
    let w=workout([set('s1'),set('s2'),set('s3')]);
    w=engine.completeSet(w,0,0,'2026-09-26T10:01:00.000Z');
    return engine.applySetFeedback(w,ex,0,0,'right',profile,2,'2026-09-26T10:02:00.000Z',preferences).guidedSession.restTargetSec;
  };
  assert.equal(rest({restPreference:'short'}),60);
  assert.equal(rest({restPreference:'standard'}),90);
  assert.equal(rest({restPreference:'long'}),120);
  assert.equal(rest({restPreference:'custom',restCustomSec:100}),100);
  assert.equal(rest(undefined),90,'no preferences: the adaptive default');
  assert.equal(rest({restPreference:'adaptive'}),90);
  // a stray restPreference on the profile object is never the authority
  assert.equal(rest({restPreference:'long'},{restPreference:'short',restCustomSec:45}),120);
  assert.equal(rest(undefined,{restPreference:'long'}),90);
});
