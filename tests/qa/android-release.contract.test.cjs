const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('Release contract: Android workflow validates before APK build', () => {
  const s = read('.github/workflows/android-apk.yml');
  const validation = Math.min(...['npm test','npm run verify','npm run build'].map(x => s.indexOf(x)).filter(x => x >= 0));
  const gradle = s.search(/gradle|gradlew/i);
  assert.ok(validation >= 0 && gradle >= 0 && validation < gradle, 'CI must validate before Gradle APK compilation');
});

test('Release contract: APK artifact is uploaded', () => {
  const s = read('.github/workflows/android-apk.yml');
  assert.match(s, /upload-artifact/i);
  assert.match(s, /apk/i);
});

test('Release contract: Capacitor Android target exists', () => {
  const pkg = JSON.parse(read('package.json'));
  const deps = {...(pkg.dependencies||{}), ...(pkg.devDependencies||{})};
  assert.ok(Object.keys(deps).some(k => k === '@capacitor/android'));
  assert.ok(fs.existsSync(path.join(root,'android')));
});
