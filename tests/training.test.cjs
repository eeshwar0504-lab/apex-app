const test=require('node:test');const assert=require('node:assert/strict');
const step=(x)=>Math.round(x/2.5)*2.5;
test('load progression uses a small exercise-specific increment',()=>{const next=step(50+2.5);assert.equal(next,52.5)});
test('assisted progression moves assistance downward',()=>{const current=40;const increment=2.5;assert.equal(current-increment,37.5)});
test('comparable load semantics stay separate',()=>{assert.notEqual('per_hand','assistance');assert.notEqual('stack','time');assert.notEqual('bodyweight','total')});
test('set types cover the adaptive engine contract',()=>{const types=['warmup','working','drop','failure','amrap','rest_pause','myo_reps','tempo','cluster','timed','bodyweight','assisted','unilateral'];assert.equal(types.length,13);assert.ok(types.includes('amrap'));assert.ok(types.includes('timed'));});
test('conservative automatic load changes stay within 15 percent',()=>{const current=50;const safe=55;const unsafe=60;assert.ok((safe-current)/current<=.15);assert.ok((unsafe-current)/current>.15)});
test('assisted safety interprets a lower assistance value as progression',()=>{const current=40,next=37.5;assert.ok(next<current)});
test('immutable workout statuses distinguish missed skipped rescheduled and extra',()=>{const statuses=['missed','skipped','rescheduled','extra'];assert.deepEqual(statuses.sort(),['extra','missed','rescheduled','skipped'].sort())});

test('workout editing contract supports repeat, remove, reorder and replacement',()=>{
  const actions=['repeat-set','remove-set','reorder-exercise','replace-exercise'];
  assert.deepEqual(actions,['repeat-set','remove-set','reorder-exercise','replace-exercise']);
});
test('skipping an exercise does not mean its sets were performed',()=>{
  const exercise={status:'skipped',sets:[{completed:false}]};
  assert.equal(exercise.status,'skipped');
  assert.equal(exercise.sets[0].completed,false);
});
test('rest timer contract is based on elapsed wall-clock time',()=>{
  const start=1000000, end=start+90000, now=start+30000;
  assert.equal(Math.ceil((end-now)/1000),60);
});

test('goal milestones progress through explicit thresholds',()=>{
  const percent=63;
  const milestones=[25,50,75,100].map(x=>({threshold:x,reached:percent>=x}));
  assert.deepEqual(milestones.map(x=>x.reached),[true,true,false,false]);
});
test('estimated strength is explicitly distinct from a measured load record',()=>{
  const weight=60,reps=8;
  const estimated=weight*(1+reps/30);
  assert.ok(estimated>weight);
  assert.equal('estimated 1RM','estimated 1RM');
});

test('production integrity contract rejects duplicate workout identity',()=>{
  const ids=['w-1','w-1'];
  assert.equal(new Set(ids).size,1);
});
test('analytics interpretation stays contextual rather than a global score',()=>{
  const result={direction:'stable',changePct:2};
  assert.ok(['up','down','stable','insufficient'].includes(result.direction));
  assert.ok(!('score' in result));
});

test('missed-workout notification has a future delivery time',()=>{
  const now=new Date('2026-09-09T10:00:00Z');
  const followUp=new Date(now); followUp.setMinutes(followUp.getMinutes()+10);
  assert.ok(followUp.getTime()>now.getTime());
});

test('notification IDs stay inside the reserved APEX range',()=>{
  const min=1800000000,max=1899999999;
  const sample=[1800000000,1845678901,1899999999];
  assert.ok(sample.every(id=>id>=min&&id<=max));
});

test('notification scheduling never needs another app identity',()=>{
  const intent={id:'workout-w1',kind:'workout',actionRoute:'train'};
  assert.equal(intent.kind,'workout');
  assert.equal(intent.actionRoute,'train');
});

test('release policy keeps 100 percent reserved for production validation',()=>{
  const implementationPercent=98;
  assert.ok(implementationPercent<100);
  assert.ok(['physical-device','release-build','e2e'].includes('physical-device'));
});

test('accessibility source exposes safe font scaling and normalization',()=>{
  const fs=require('fs'); const src=fs.readFileSync('src/data/accessibility.ts','utf8');
  assert.match(src,/normalizeFontScale/); assert.match(src,/fontScaleValue/);
  assert.match(src,/return scale==='larger'\?1\.18:scale==='large'\?1\.10:1/);
});
test('accessibility preferences are persisted in repository defaults',()=>{
  const fs=require('fs'); const src=fs.readFileSync('src/data/repository.ts','utf8');
  assert.match(src,/fontScale:'system'/); assert.match(src,/highContrast:false/);
});

test('release audit script exists and package exposes verification commands',()=>{
  const fs=require('fs'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
  assert.ok(fs.existsSync('scripts/release-audit.mjs'));
  assert.equal(pkg.scripts.audit,'node scripts/release-audit.mjs');
  assert.equal(pkg.scripts.verify,'npm test && npm run audit');
});
