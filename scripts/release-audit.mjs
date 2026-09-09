import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'package.json',
  'capacitor.config.ts',
  'src/main.tsx',
  'src/core/types.ts',
  'src/engine/training.ts',
  'src/engine/intelligence.ts',
  'src/engine/coachGateway.ts',
  'src/engine/notifications.ts',
  'src/native/localNotifications.ts',
  'src/data/repository.ts',
  'src/data/sqliteAdapter.ts',
  'src/data/backupCrypto.ts',
  'src/data/integrity.ts',
  'src/data/accessibility.ts',
  'src/aiGateway.ts',
  'src/aiProviders/localOllama.ts',
  'src/aiProviders/openAICompatible.ts',
  '.github/workflows/android-apk.yml',
];

const errors = [];
const warnings = [];

for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) errors.push(`Missing required file: ${rel}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const dep of [
  '@capacitor/android',
  '@capacitor/core',
  '@capacitor/cli',
  '@capacitor-community/sqlite',
  '@capacitor/local-notifications',
  'react',
  'react-dom',
  'typescript',
  'vite'
]) {
  if (!pkg.dependencies?.[dep]) errors.push(`Missing dependency: ${dep}`);
}

if (pkg.scripts?.build !== 'tsc -b && vite build') {
  warnings.push('Build script differs from the expected release contract.');
}
if (pkg.scripts?.test !== 'node --test tests/*.test.cjs') {
  warnings.push('Test script differs from the expected release contract.');
}

const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
if (/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(css)) {
  errors.push('Remote Google font dependency found; offline-first release must not depend on it.');
}

const repo = fs.readFileSync(path.join(root, 'src/data/repository.ts'), 'utf8');
if (!repo.includes("const KEY='apex-state-v4'")) errors.push('Repository schema key is not v4.');
if (!repo.includes('isUsableState')) errors.push('Repository does not apply state-integrity validation.');

const crypto = fs.readFileSync(path.join(root, 'src/data/backupCrypto.ts'), 'utf8');
if (!crypto.includes('AES-GCM') || !crypto.includes('PBKDF2')) {
  errors.push('Encrypted backup contract is incomplete.');
}

const nativeNotif = fs.readFileSync(path.join(root, 'src/native/localNotifications.ts'), 'utf8');
if (!nativeNotif.includes('APEX_NOTIFICATION_MIN') || !nativeNotif.includes('APEX_NOTIFICATION_MAX')) {
  errors.push('Notification ownership boundary is missing.');
}

const workflow = fs.readFileSync(path.join(root, '.github/workflows/android-apk.yml'), 'utf8');
for (const token of ['npm install', 'npm run build', 'npx cap add android', 'npx cap sync android', 'assembleDebug', 'upload-artifact']) {
  if (!workflow.includes(token)) errors.push(`Android CI missing: ${token}`);
}

const aiLocal = fs.readFileSync(path.join(root, 'src/aiProviders/localOllama.ts'), 'utf8');
if (!aiLocal.includes('127.0.0.1:11434')) warnings.push('Local provider adapter is present but requires a user-run local model server.');
const testFiles = fs.readdirSync(path.join(root, 'tests')).filter(x => x.endsWith('.test.cjs'));
if (!testFiles.length) errors.push('No regression test files found.');

console.log(`APEX release audit: ${errors.length ? 'FAIL' : 'PASS'}`);
console.log(`Required files checked: ${required.length}`);
console.log(`Warnings: ${warnings.length}`);
for (const w of warnings) console.log(`WARN: ${w}`);
for (const e of errors) console.error(`ERROR: ${e}`);

if (errors.length) process.exit(1);
