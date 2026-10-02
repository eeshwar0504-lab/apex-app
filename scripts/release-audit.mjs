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
  'src/coach/coach.ts',
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
if (!fs.existsSync(path.join(root, 'android'))) {
  errors.push('Android project missing: android/');
}
for (const token of ['npm ci', 'npm run verify', 'npm run build', 'npx cap sync android', './gradlew assembleDebug assembleRelease bundleRelease', 'app-debug.apk', 'app-release.aab', 'upload-artifact']) {
  if (!workflow.includes(token)) errors.push(`Android CI missing: ${token}`);
}
if (workflow.includes('npx cap add android')) {
  errors.push('Android CI must use the committed android project instead of adding the platform.');
}

/* release engineering: one version everywhere, signing material never in the repository, no cloud copy of the local database */
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const gradle = read('android/app/build.gradle');
const versionName = /versionName\s+"([^"]+)"/.exec(gradle)?.[1];
if (versionName !== pkg.version) errors.push(`Android versionName (${versionName}) differs from package.json (${pkg.version}).`);
const lock = JSON.parse(read('package-lock.json'));
if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) errors.push('package-lock.json root version differs from package.json.');
if (!read('android/app/src/main/res/values/strings.xml').includes(`<string name="app_name">APEX ${pkg.version}</string>`)) errors.push('The Android app label does not carry the package version.');
if (!/applicationId "app\.apex\.training"/.test(gradle) || !/appId:\s*'app\.apex\.training'/.test(read('capacitor.config.ts'))) errors.push('The application id differs between Gradle and the Capacitor config.');
if (/(storePassword|keyPassword)\s*[= ]\s*["'][^"']+["']/.test(gradle)) errors.push('A signing password is written in build.gradle.');
if (!gradle.includes('APEX_KEYSTORE_PATH') || !gradle.includes('hasReleaseSigning')) errors.push('The release signing structure (environment or keystore.properties) is missing from build.gradle.');
if (/android:allowBackup="true"/.test(read('android/app/src/main/AndroidManifest.xml'))) errors.push('The manifest allows cloud backup of the local database.');
const ignored = read('.gitignore');
for (const token of ['*.jks', '*.keystore', 'android/keystore.properties']) if (!ignored.includes(token)) errors.push(`.gitignore does not exclude ${token}.`);
if (fs.existsSync(path.join(root, '.github/workflows/android-apk'))) errors.push('A stray extension-less workflow file exists.');

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
