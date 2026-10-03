'use strict';
/*
 * Phase 7: dead code is gone, nothing still points at it, and the docs make no stale claims.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const exists = (p) => fs.existsSync(path.join(root, p));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
};

test('P7.6 every file in .github/workflows is a real workflow (GitHub only runs .yml/.yaml); the stray no-extension copy is gone', () => {
  const files = fs.readdirSync(path.join(root, '.github', 'workflows'));
  assert.ok(files.length >= 1);
  for (const f of files) assert.match(f, /\.ya?ml$/, `${f} would be ignored by GitHub Actions`);
  assert.ok(files.includes('android-apk.yml'), 'the real APK workflow stays');
});

test('P7.6 the APK workflow does not run "cap add android" against the committed android/ project', () => {
  for (const f of fs.readdirSync(path.join(root, '.github', 'workflows'))) {
    assert.doesNotMatch(read(`.github/workflows/${f}`), /cap add android/, f);
  }
});

test('P7.6 coachGateway.ts is removed and nothing in the repository still refers to it', () => {
  assert.equal(exists('src/engine/coachGateway.ts'), false);
  const offenders = [];
  for (const dir of ['src', 'tests', 'scripts', 'docs']) {
    for (const file of walk(dir)) {
      if (file.endsWith('phase7-cleanup.test.cjs')) continue;
      if (/\.(ts|tsx|cjs|mjs|js|md)$/.test(file) && /coachGateway/.test(read(file))) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});

test('P7.6 the Coach surface the contracts check is the real one, and the AI layer is still the only consumer of its output', () => {
  for (const f of ['src/coach/coach.ts', 'src/coach/askCoach.ts', 'src/coach/decisionPipeline.ts']) assert.ok(exists(f), f);
  const src = walk('src').filter((f) => /\.(ts|tsx)$/.test(f)).map(read).join('\n');
  assert.doesNotMatch(src, /engine\/coachGateway/);
});

test('P7.6 no stray root manifest: the PWA decision and the repository agree', () => {
  assert.equal(exists('manifest.webmanifest'), false);
  assert.equal(exists('public/manifest.webmanifest'), false);
  assert.doesNotMatch(read('index.html'), /rel=["']manifest["']/);
  const doc = read('docs/PWA_DECISION.md');
  assert.doesNotMatch(doc, /a file that never\s+existed/, 'the doc must not claim the file never existed');
  assert.match(doc, /Phase 7/);
});

test('P7.7 the docs carry no invented completion percentage and no stale release label', () => {
  const readme = read('README.md');
  assert.doesNotMatch(readme, /\d+\s*%\s*complete|complete[^.\n]{0,40}\d+\s*%/i, 'no completion percentage');
  assert.match(readme, /5\.0\.0/);
  const readiness = read('RELEASE_READINESS.md');
  assert.match(readiness.split('\n')[0], /5\.0\.0/, 'the title is the current release, not "v2"');
  assert.doesNotMatch(readiness.split('## Historical log')[0], /\d+\/\d+ Node|feature-complete/, 'no stale counts or completion claims above the historical log');
  assert.match(readiness, /safetyCheck/, 'the deferred safetyCheck decision is documented');
  assert.match(readiness, /NOT VERIFIED/);
});

test('P7.8 safetyCheck is untouched: still defined and exported, and still not called from any runtime path', () => {
  const training = read('src/engine/training.ts');
  assert.match(training, /export function safetyCheck\(/);
  const callers = [];
  for (const file of walk('src').filter((f) => /\.(ts|tsx)$/.test(f))) {
    const text = read(file);
    const uses = text.match(/\bsafetyCheck\s*\(/g) || [];
    const definitions = file.endsWith('training.ts') ? 1 : 0; // the definition itself
    if (uses.length > definitions) callers.push(file);
  }
  assert.deepEqual(callers, [], 'Phase 7 deliberately did not wire safetyCheck into runtime');
});
