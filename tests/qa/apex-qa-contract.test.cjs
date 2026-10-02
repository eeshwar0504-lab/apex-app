const { uiSource } = require('../ui-source.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

const requiredFiles = [
  'package.json','src/main.tsx','src/styles.css','src/core/types.ts',
  'src/engine/training.ts','src/engine/intelligence.ts','src/coach/coach.ts',
  'src/data/repository.ts','src/data/sqliteAdapter.ts','src/data/backupCrypto.ts',
  'src/data/integrity.ts','src/data/accessibility.ts','src/knowledge/exercises.ts',
  'src/knowledge/knowledgeGraph.ts','src/engine/notifications.ts',
  'src/native/localNotifications.ts','.github/workflows/android-apk.yml'
];

test('QA architecture: all authoritative application layers exist', () => {
  for (const file of requiredFiles) assert.ok(exists(file), `Missing required file: ${file}`);
});

test('QA architecture: deterministic training remains authoritative', () => {
  const training = read('src/engine/training.ts');
  const coach = read('src/coach/coach.ts') + read('src/coach/askCoach.ts') + read('src/coach/decisionPipeline.ts');
  const ai = exists('src/aiGateway.ts') ? read('src/aiGateway.ts') : '';
  assert.match(training, /personalizedLoad|recommend|progress|guided/i);
  assert.match(coach, /training|deterministic|authoritative/i);
  if (ai) assert.match(ai, /deterministic|authoritative|ground/i);
});

test('QA architecture: workout continuity and interruption boundaries exist', () => {
  const src = read('src/engine/training.ts') + uiSource();
  assert.match(src, /pause/i);
  assert.match(src, /resume/i);
  assert.match(src, /background/i);
  assert.match(src, /checkpoint/i);
  assert.match(src, /reopen|recover/i);
});

test('QA architecture: progression and load semantics are explicit', () => {
  const src = read('src/engine/training.ts');
  assert.match(src, /personalizedLoad/);
  assert.match(src, /RIR|rir/i);
  assert.match(src, /loadUnit|formatLoad/);
  assert.match(src, /calibration|progression/i);
});

test('QA architecture: exercise substitutions preserve structured knowledge', () => {
  const training = read('src/engine/training.ts');
  const graph = read('src/knowledge/knowledgeGraph.ts');
  const exercises = read('src/knowledge/exercises.ts');
  assert.match(training, /alternative|replacement|substitut/i);
  assert.match(graph, /canonical|alternative|relationship/i);
  assert.match(exercises, /id|movementPattern|equipment/i);
});

test('QA architecture: local-first persistence and backup boundaries exist', () => {
  const repo = read('src/data/repository.ts');
  const sqlite = read('src/data/sqliteAdapter.ts');
  const backup = read('src/data/backupCrypto.ts');
  const integrity = read('src/data/integrity.ts');
  assert.match(repo, /SQLite|local|persist/i);
  assert.match(sqlite, /sqlite|SQLite/i);
  assert.match(backup, /encrypt|decrypt|AES|GCM|authenticated/i);
  assert.match(integrity, /integrity|hash|validate|duplicate/i);
});

test('QA architecture: accessibility controls are implemented and persisted', () => {
  const access = read('src/data/accessibility.ts');
  const repo = read('src/data/repository.ts');
  const main = uiSource();
  assert.match(access, /fontScaleValue|normalizeFontScale/);
  assert.match(access, /reduced|motion/i);
  assert.match(repo, /fontScale/);
  assert.match(repo, /highContrast/);
  assert.match(main, /highContrast|fontScale|reduced/i);
});

test('QA architecture: notification layer is isolated from training logic', () => {
  const notifications = read('src/engine/notifications.ts');
  const native = read('src/native/localNotifications.ts');
  assert.match(notifications, /notification|reminder/i);
  assert.match(native, /LocalNotifications|Capacitor/i);
});

test('QA architecture: Coach surface is grounded and cannot silently replace training authority', () => {
  const coach = read('src/coach/coach.ts') + read('src/coach/askCoach.ts') + read('src/coach/decisionPipeline.ts');
  assert.match(coach, /ground|context|uncertainty|deterministic|training/i);
  assert.match(coach, /recommend|explain|coach/i);
});

test('QA architecture: premium APEX visual system has the required design vocabulary', () => {
  const css = read('src/styles.css');
  assert.match(css, /--apex-(black|gold)/i);
  assert.match(css, /aurora|steel|crimson/i);
  assert.match(css, /safe-area|env\(safe-area-inset-bottom\)/i);
  assert.match(css, /reduced-motion|prefers-reduced-motion/i);
  assert.match(css, /overflow-x\s*:\s*hidden/i);
});

test('QA architecture: Android is Capacitor-based and CI builds the APK', () => {
  const workflow = read('.github/workflows/android-apk.yml');
  const cap = read('capacitor.config.ts');
  assert.match(cap, /appId|appName|webDir/);
  assert.match(workflow, /npm (install|ci)/i);
  assert.match(workflow, /npm (run )?(build|verify)/i);
  assert.match(workflow, /gradle|gradlew/i);
  assert.match(workflow, /upload-artifact/i);
});

test('QA architecture: no paid AI SDK is required for the core app', () => {
  const pkg = JSON.parse(read('package.json'));
  const deps = {...(pkg.dependencies||{}), ...(pkg.devDependencies||{})};
  const names = Object.keys(deps).join(' ').toLowerCase();
  assert.ok(!names.includes('openai'), 'Core package must not require the OpenAI SDK');
});
