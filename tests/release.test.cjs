const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');

const read=(file)=>
  fs.readFileSync(
    path.join(root,file),
    'utf8'
  );

const notifications=read(
  'src/native/localNotifications.ts'
);

const main=read(
  'src/main.tsx'
);

const pkg=JSON.parse(
  read('package.json')
);

const workflow=read(
  '.github/workflows/android-apk.yml'
);

test(
  'notification adapter depends on Capacitor Local Notifications',
  ()=>{
    assert.match(
      notifications,
      /LocalNotifications/
    );

    assert.equal(
      pkg.dependencies['@capacitor/local-notifications'],
      '^7.0.0'
    );
  }
);

test(
  'notification adapter never cancels arbitrary app notifications',
  ()=>{
    assert.match(
      notifications,
      /APEX_NOTIFICATION_MIN/
    );

    assert.match(
      notifications,
      /n\.id >= APEX_NOTIFICATION_MIN/
    );

    assert.doesNotMatch(
      notifications,
      /cancel\(\{ notifications: pending\.notifications\.map/
    );
  }
);

test(
  'notification ids stay inside APEX reserved range',
  ()=>{
    assert.match(
      notifications,
      /APEX_NOTIFICATION_MIN \+/
    );

    assert.match(
      notifications,
      /APEX_NOTIFICATION_MAX - APEX_NOTIFICATION_MIN/
    );
  }
);

test(
  'notification actions can deep-navigate into APEX',
  ()=>{
    assert.match(
      notifications,
      /localNotificationActionPerformed/
    );

    assert.match(
      notifications,
      /actionRoute/
    );

    assert.match(
      main,
      /listenForNotificationActions/
    );
  }
);

test(
  'release readiness explicitly requires physical Android validation',
  ()=>{
    const doc=read(
      'RELEASE_READINESS.md'
    );

    assert.match(
      doc,
      /physical Android device/i
    );

    assert.match(
      doc,
      /process death/i
    );

    assert.match(
      doc,
      /TalkBack/i
    );
  }
);

test(
  'core build remains Android-capable through Capacitor',
  ()=>{
    assert.equal(
      pkg.dependencies['@capacitor/android'],
      '^7.4.3'
    );

    assert.match(
      workflow,
      /assembleDebug/
    );
  }
);

test(
  'release package exposes the required verification commands',
  ()=>{
    assert.equal(
      pkg.scripts.test,
      'node --test tests/*.test.cjs'
    );

    assert.equal(
      pkg.scripts.audit,
      'node scripts/release-audit.mjs'
    );

    assert.equal(
      pkg.scripts.build,
      'tsc -b && vite build'
    );

    assert.equal(
      pkg.scripts.verify,
      'npm test && npm run audit'
    );
  }
);

test(
  'Android CI validates the application before producing the APK',
  ()=>{
    assert.match(
      workflow,
      /npm test/
    );

    assert.match(
      workflow,
      /npm run verify/
    );

    assert.match(
      workflow,
      /npm run build/
    );

    assert.match(
      workflow,
      /assembleDebug/
    );
  }
);

test(
  'Android CI publishes the APEX debug APK artifact',
  ()=>{
    assert.match(
      workflow,
      /APEX-debug-apk/
    );

    assert.match(
      workflow,
      /app-debug\.apk/
    );
  }
);

test(
  'release readiness covers accessibility validation',
  ()=>{
    const doc=read(
      'RELEASE_READINESS.md'
    );

    assert.match(
      doc,
      /TalkBack/i
    );

    assert.match(
      doc,
      /accessib/i
    );
  }
);

test(
  'release readiness covers interruption and recovery validation',
  ()=>{
    const doc=read(
      'RELEASE_READINESS.md'
    );

    assert.match(
      doc,
      /process death/i
    );

    assert.match(
      doc,
      /background/i
    );

    assert.match(
      doc,
      /reopen/i
    );
  }
);