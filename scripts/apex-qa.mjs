import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const reportDir = resolve(root, 'qa-results');

mkdirSync(reportDir, { recursive: true });

const isWin = process.platform === 'win32';
const results = [];

function run(label, command, args = [], cwd = root) {
  console.log(`\n=== ${label} ===`);
  console.log(`> ${command} ${args.join(' ')}`);

  let result;

  if (isWin) {
    const commandLine = [
      command,
      ...args.map((arg) => {
        if (/[\s"]/u.test(arg)) {
          return `"${arg.replaceAll('"', '\\"')}"`;
        }
        return arg;
      }),
    ].join(' ');

    result = spawnSync(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', commandLine],
      {
        cwd,
        env: process.env,
        stdio: 'inherit',
        shell: false,
        windowsHide: false,
      }
    );
  } else {
    result = spawnSync(command, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
  }

  if (result.error) {
    console.error(
      `[APEX QA] Process launch error: ${result.error.message}`
    );
  }

  const ok =
    result.error == null &&
    result.status === 0;

  results.push({
    label,
    ok,
    status: result.status,
    error: result.error
      ? result.error.message
      : null,
  });

  if (ok) {
    console.log(`[APEX QA] ${label} PASSED`);
  } else {
    console.error(
      `[APEX QA] ${label} FAILED`
    );
  }

  return ok;
}

// ============================================================
// LAYER 0 — SOURCE / NODE / RELEASE / BUILD
// ============================================================

const sourceOk = run(
  'SOURCE + NODE REGRESSION',
  'npm',
  ['test']
);

if (!sourceOk) {
  process.exitCode = 1;
} else {
  const auditOk = run(
    'RELEASE CONTRACT AUDIT',
    'npm',
    ['run', 'audit']
  );

  if (!auditOk) {
    process.exitCode = 1;
  } else {
    const buildOk = run(
      'PRODUCTION WEB BUILD',
      'npm',
      ['run', 'build']
    );

    if (!buildOk) {
      process.exitCode = 1;
    }
  }
}

// Check whether the first three gates passed.
const layer0Passed =
  results.length === 3 &&
  results.every((result) => result.ok);

// ============================================================
// LAYER 1 — PLAYWRIGHT
// ============================================================

let playwrightOk = false;

if (layer0Passed) {
  if (
    existsSync(resolve(root, 'playwright.config.ts')) ||
    existsSync(resolve(root, 'playwright.config.js'))
  ) {
    playwrightOk = run(
      'PLAYWRIGHT — FUNCTIONAL + UI/UX + ACCESSIBILITY + VISUAL',
      'npx',
      [
        'playwright',
        'test',
        'tests/e2e',
        '--reporter=line',
      ]
    );
  } else {
    console.error(
      '[APEX QA] Playwright config not found.'
    );

    results.push({
      label:
        'PLAYWRIGHT — FUNCTIONAL + UI/UX + ACCESSIBILITY + VISUAL',
      ok: false,
      status: null,
      error: 'Playwright config not found',
    });

    process.exitCode = 1;
  }
} else {
  console.log(
    '\nPlaywright skipped because an earlier QA gate failed.'
  );
}

// ============================================================
// LAYER 2 — DOMAIN / COACH / PERSISTENCE / RECOVERY
// ============================================================

let domainOk = false;

const browserGatePassed =
  layer0Passed && playwrightOk;

if (browserGatePassed) {
  const qaDir = resolve(root, 'tests', 'qa');

  if (existsSync(qaDir)) {
    const contractFiles = readdirSync(qaDir)
      .filter((file) => file.endsWith('.test.cjs'))
      .sort();

    if (contractFiles.length > 0) {
      const contractPaths = contractFiles.map(
        (file) => `tests/qa/${file}`
      );

      domainOk = run(
        'APEX DOMAIN + RECOVERY CONTRACTS',
        'node',
        [
          '--test',
          ...contractPaths,
        ]
      );
    } else {
      console.error(
        '[APEX QA] No .test.cjs files found in tests/qa.'
      );

      results.push({
        label: 'APEX DOMAIN + RECOVERY CONTRACTS',
        ok: false,
        status: null,
        error: 'No contract test files found',
      });

      process.exitCode = 1;
    }
  } else {
    console.error(
      '[APEX QA] tests/qa directory not found.'
    );

    results.push({
      label: 'APEX DOMAIN + RECOVERY CONTRACTS',
      ok: false,
      status: null,
      error: 'tests/qa directory not found',
    });

    process.exitCode = 1;
  }
} else {
  console.log(
    '\nDomain/recovery contracts skipped because an earlier QA gate failed.'
  );
}

// ============================================================
// LAYER 3 — ANDROID RELEASE
// ============================================================

const allPreviousPassed =
  layer0Passed &&
  playwrightOk &&
  domainOk;

let androidOk = false;

if (allPreviousPassed) {
  const androidDir = resolve(root, 'android');
  const gradleFile = isWin
    ? 'gradlew.bat'
    : 'gradlew';

  const gradlePath = resolve(
    androidDir,
    gradleFile
  );

  if (existsSync(gradlePath)) {
    const syncOk = run(
      'CAPACITOR SYNC',
      'npx',
      ['cap', 'sync', 'android']
    );

    if (syncOk) {
      androidOk = run(
        'ANDROID DEBUG APK',
        isWin ? 'gradlew.bat' : './gradlew',
        ['assembleDebug'],
        androidDir
      );
    }
  } else {
    console.error(
      '[APEX QA] Android Gradle wrapper not found.'
    );

    results.push({
      label: 'ANDROID DEBUG APK',
      ok: false,
      status: null,
      error: 'Gradle wrapper not found',
    });

    process.exitCode = 1;
  }
} else {
  console.log(
    '\nAndroid build skipped because an earlier QA gate failed.'
  );
}

// ============================================================
// FINAL REPORT
// ============================================================

const finalPassed =
  results.length > 0 &&
  results.every((result) => result.ok);

const report = {
  generatedAt: new Date().toISOString(),
  passed: finalPassed,
  results,
};

writeFileSync(
  resolve(reportDir, 'apex-qa-report.json'),
  JSON.stringify(report, null, 2),
  'utf8'
);

console.log('\n=== APEX QA GATE ===');

for (const result of results) {
  console.log(
    `${result.ok ? 'PASS' : 'FAIL'}  ${result.label}`
  );
}

console.log(
  `\nReport written to: ${resolve(
    reportDir,
    'apex-qa-report.json'
  )}`
);

if (finalPassed) {
  console.log(
    '\nPASS — ALL APEX AUTOMATED QA GATES PASSED.'
  );
  process.exitCode = 0;
} else {
  console.log(
    '\nFAIL — APEX AUTOMATED QA DID NOT PASS.'
  );
  process.exitCode = 1;
}