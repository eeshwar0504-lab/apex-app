const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const notifications=fs.readFileSync(path.join(root,'src/native/localNotifications.ts'),'utf8');
const main=fs.readFileSync(path.join(root,'src/main.tsx'),'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));

test('notification adapter depends on Capacitor Local Notifications',()=>{
  assert.match(notifications,/LocalNotifications/);
  assert.equal(pkg.dependencies['@capacitor/local-notifications'],'^7.0.0');
});

test('notification adapter never cancels arbitrary app notifications',()=>{
  assert.match(notifications,/APEX_NOTIFICATION_MIN/);
  assert.match(notifications,/n\.id >= APEX_NOTIFICATION_MIN/);
  assert.doesNotMatch(notifications,/cancel\(\{ notifications: pending\.notifications\.map/);
});

test('notification ids stay inside APEX reserved range',()=>{
  assert.match(notifications,/APEX_NOTIFICATION_MIN \+/);
  assert.match(notifications,/APEX_NOTIFICATION_MAX - APEX_NOTIFICATION_MIN/);
});

test('notification actions can deep-navigate into APEX',()=>{
  assert.match(notifications,/localNotificationActionPerformed/);
  assert.match(notifications,/actionRoute/);
  assert.match(main,/listenForNotificationActions/);
});

test('release readiness explicitly requires physical Android validation',()=>{
  const doc=fs.readFileSync(path.join(root,'RELEASE_READINESS.md'),'utf8');
  assert.match(doc,/physical Android device/i);
  assert.match(doc,/process death/i);
  assert.match(doc,/TalkBack/i);
});

test('core build remains Android-capable through Capacitor',()=>{
  assert.equal(pkg.dependencies['@capacitor/android'],'^7.4.3');
  assert.match(fs.readFileSync(path.join(root,'.github/workflows/android-apk.yml'),'utf8'),/assembleDebug/);
});
