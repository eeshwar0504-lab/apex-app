'use strict';
/*
 * Release contract: the one release version is the same everywhere the app or the APK reports it.
 * package.json is the source; the lock file root, Android versionName, the app label, the README and BUILD_STATUS follow it,
 * and the in-app version text is read from package.json rather than typed in.
 */
const { uiSource } = require('./ui-source.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const RELEASE = '5.0.0';
const PREVIOUS_VERSION_CODE = 8; // 4.1.0

test('Release version: package.json is the release version', () => {
  assert.equal(JSON.parse(read('package.json')).version, RELEASE);
});

test('Release version: the lock file root entries match package.json', () => {
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, RELEASE);
  assert.equal(lock.packages[''].version, RELEASE);
  assert.equal(lock.name, JSON.parse(read('package.json')).name);
});

test('Release version: Android versionName matches and versionCode moved forward, never reset', () => {
  const gradle = read('android/app/build.gradle');
  assert.equal(/versionName\s+"([^"]+)"/.exec(gradle)[1], RELEASE);
  const code = Number(/versionCode\s+(\d+)/.exec(gradle)[1]);
  assert.ok(Number.isInteger(code) && code > PREVIOUS_VERSION_CODE, `versionCode ${code} must be above ${PREVIOUS_VERSION_CODE}`);
  assert.match(read('android/app/src/main/res/values/strings.xml'), new RegExp(`<string name="app_name">APEX ${RELEASE.replace(/\./g, '\\.')}</string>`));
  assert.match(gradle, /applicationId "app\.apex\.training"/, 'the application id (and so the update path) is unchanged');
});

test('Release version: the app reports the packaged version and the docs name the release', () => {
  assert.match(uiSource(), /import pkg from '(?:\.\.\/)+package\.json'/);
  assert.match(uiSource(), /APEX \$\{pkg\.version\} summary/);
  assert.match(read('README.md'), new RegExp(`^# APEX ${RELEASE.replace(/\./g, '\\.')}`));
  assert.match(read('BUILD_STATUS.md'), new RegExp(`^# APEX ${RELEASE.replace(/\./g, '\\.')} build status`));
});

test('Release version: no stale 3.1.2 remains in the version files that identify the build', () => {
  for (const file of ['package.json', 'android/app/build.gradle', 'android/app/src/main/res/values/strings.xml']) assert.doesNotMatch(read(file), /3\.1\.2/, file);
  assert.doesNotMatch(read('package-lock.json').split('"node_modules/')[0], /3\.1\.2/, 'package-lock root');
});
