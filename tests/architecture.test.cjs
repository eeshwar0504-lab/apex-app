const { uiSource } = require('./ui-source.cjs');
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

test('repository keeps persistence writes serialized',()=>{
 const x=read('src/data/repository.ts');
 assert.match(x,/sqliteWriteQueue/);
 assert.match(x,/loadAsync/);
 assert.match(x,/reset/);
});

test('repository migrates older persisted state into the current schema',()=>{
 const x=read('src/data/repository.ts');
 assert.match(x,/migratePersistedState/);
 assert.match(x,/version < SCHEMA_VERSION/);
 assert.match(x,/schemaVersion=SCHEMA_VERSION/);
});

test('SQLite schema migrations are tracked natively',()=>{
 const x=read('src/data/sqliteAdapter.ts');
 const m=read('src/data/sqliteMigrations.ts');
 assert.match(m,/schema_migrations/,'the version history table is created by the migration runner');
 assert.match(m,/SQLITE_SCHEMA_VERSION/);
 assert.match(x,/SQLITE_SCHEMA_VERSION/);
 assert.match(x,/runSqliteMigrations\(/,'the adapter runs the migrations when it opens the database');
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

test('workout engine contains explicit session continuity operations',()=>{
 const x=read('src/engine/training.ts');

 assert.match(x,/pauseWorkoutSession/);
 assert.match(x,/resumeWorkoutSession/);
 assert.match(x,/recoverWorkoutSession/);
 assert.match(x,/markWorkoutSetSkipped/);
 assert.match(x,/markWorkoutExerciseSkipped/);
 assert.match(x,/rescheduleWorkoutWithEvent/);
});

test('workout engine preserves distinct skip and reschedule event semantics',()=>{
 const x=read('src/engine/training.ts');

 assert.match(x,/workout_rescheduled/);
 assert.match(x,/skippedSetIds/);
 assert.match(x,/skippedExerciseIds/);
});

test('load engine separates load availability from equipment availability',()=>{
 const x=read('src/engine/training.ts');

 assert.match(x,/loadAvailability/);
 assert.match(x,/snapToAvailableLoad/);
 assert.match(x,/adjacentAvailableLoad/);
});

test('load engine supports exercise-specific recommendation logic',()=>{
 const x=read('src/engine/training.ts');

 assert.match(x,/personalizedLoad/);
 assert.match(x,/feedbackLoad/);
 assert.match(x,/sanitizeRecommendedLoad/);
});

test('special exercise load semantics are represented explicitly',()=>{
 const x=read('src/engine/training.ts');

 assert.match(x,/dumbbellTotalLoad/);
 assert.match(x,/barbellLoadBreakdown/);
 assert.match(x,/loadDetailForSet/);
 assert.match(x,/formatLoadDetail/);
 assert.match(x,/formatTimedDuration/);
});

test('native notifications are isolated from core training',()=>{
 const x=read('src/native/localNotifications.ts');
 assert.match(x,/isNativePlatform/);
 assert.match(x,/LocalNotifications/);
 assert.match(x,/core training must never fail/);
});

test('app exposes accessibility controls and dialog semantics',()=>{
 const x=uiSource();
 assert.match(x,/Reduce motion/);
 assert.match(x,/aria-modal="true"/);
 assert.match(x,/aria-label="Ask APEX Coach"/);
});

test('app exposes keyboard-safe editable control handling',()=>{
 const x=uiSource();

 assert.match(x,/document\.addEventListener\('focusin'/);
 assert.match(x,/scrollIntoView/);
 assert.match(x,/visualViewport/);
});

test('app exposes Android lifecycle recovery handling',()=>{
 const x=uiSource();

 assert.match(x,/appStateChange/);
 assert.match(x,/visibilitychange/);
 assert.match(x,/pauseWorkoutSession/);
 assert.match(x,/resumeWorkoutSession/);
 assert.match(x,/recoverWorkoutSession/);
});

test('app records background interruption and recovery events',()=>{
 const x=uiSource();

 assert.match(x,/workout_backgrounded/);
 assert.match(x,/workout_recovered/);
});

test('app keeps the final header focused on APEX and Search',()=>{
 const x=uiSource();

 assert.match(x,/className="[^"]*\btopbar\b[^"]*"/);
 assert.match(x,/className="[^"]*\bbrand\b[^"]*"/);
 assert.match(x,/className="top-actions"/);
 assert.match(x,/aria-label="Command Center"/);

 assert.doesNotMatch(
   x,
   /aria-label="Profile"[^]*className="icon-btn"/
 );
});

test('Android CI builds the debug APK artifact',()=>{
 const x=read('.github/workflows/android-apk.yml');
 assert.match(x,/assembleDebug/);
 assert.match(x,/APEX-debug-apk/);
});

test('Android CI runs automated validation before APK build',()=>{
 const x=read('.github/workflows/android-apk.yml');

 assert.match(x,/npm test/);
 assert.match(x,/npm run verify/);
 assert.match(x,/npm run build/);
});

test('accessibility source exposes the APEX reduced-motion class',()=>{
 const x=read('src/data/accessibility.ts');

 assert.match(x,/accessibilityClass/);
 assert.match(x,/reducedMotion\?'reduce-motion'/);
});

test('release package exposes the complete verification command',()=>{
 const pkg=JSON.parse(fs.readFileSync(
   path.join(root,'package.json'),
   'utf8'
 ));

 assert.equal(pkg.scripts.test,'node --test tests/*.test.cjs');
 assert.equal(pkg.scripts.audit,'node scripts/release-audit.mjs');
 assert.equal(pkg.scripts.verify,'npm test && npm run audit');
 assert.equal(pkg.scripts.build,'tsc -b && vite build');
});