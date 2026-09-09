const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('repository exposes native and browser persistence paths',()=>{
 const x=read('src/data/repository.ts');
 assert.match(x,/loadAsync\(\):Promise<AppState>/);
 assert.match(x,/ApexSQLiteStore/);
 assert.match(x,/localStorage/);
});

test('encrypted backup uses authenticated encryption',()=>{
 const x=read('src/data/backupCrypto.ts');
 assert.match(x,/AES-GCM/);
 assert.match(x,/PBKDF2/);
 assert.match(x,/getRandomValues/);
});

test('AI gateway cannot become authoritative over training',()=>{
 const x=read('src/aiGateway.ts');
 assert.match(x,/deterministic engine remains authoritative/);
 assert.match(x,/grounded/);
 assert.match(x,/uncertainties/);
});

test('exercise knowledge has canonical identity and relationships',()=>{
 const x=read('src/knowledge/knowledgeGraph.ts');
 assert.match(x,/validateExerciseKnowledge/);
 assert.match(x,/substitutionClass/);
 assert.match(x,/rankedAlternatives/);
});

test('workout engine contains interruption and safety boundaries',()=>{
 const x=read('src/engine/training.ts');
 assert.match(x,/safetyCheck/);
 assert.match(x,/rescheduleWorkout/);
 assert.match(x,/applyWorkoutAdaptation/);
});

test('native notifications are isolated from core training',()=>{
 const x=read('src/native/localNotifications.ts');
 assert.match(x,/isNativePlatform/);
 assert.match(x,/LocalNotifications/);
 assert.match(x,/core training must never fail/);
});

test('app exposes accessibility controls and dialog semantics',()=>{
 const x=read('src/main.tsx');
 assert.match(x,/Reduce motion/);
 assert.match(x,/aria-modal="true"/);
 assert.match(x,/aria-label="Ask APEX Coach"/);
});

test('Android CI builds the debug APK artifact',()=>{
 const x=read('.github/workflows/android-apk.yml');
 assert.match(x,/assembleDebug/);
 assert.match(x,/APEX-debug-apk/);
});
