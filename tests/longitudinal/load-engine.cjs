'use strict';
/*
 * Compiles the real APEX TypeScript engine (no copies of its formulas) into a
 * cached temporary CommonJS tree and returns the modules the simulator drives.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
let cached;
process.env.NODE_PATH = [path.join(root, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
require('node:module').Module._initPaths();

function newestSourceTime() {
  let t = fs.statSync(__filename).mtimeMs; // the compile recipe itself is part of the cache key
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.ts')) t = Math.max(t, fs.statSync(p).mtimeMs);
    }
  };
  // the AI layer is compiled too (src/aiGateway.ts, aiContract.ts, aiGrounding.ts and src/aiProviders): a change there must rebuild the cache
  fs.readdirSync(path.join(root, 'src')).filter((f) => /^ai[A-Za-z]*\.ts$/.test(f)).forEach((f) => { t = Math.max(t, fs.statSync(path.join(root, 'src', f)).mtimeMs); });
  ['engine', 'core', 'data', 'knowledge', 'coach', 'native', 'aiProviders'].forEach((d) => {
    const p = path.join(root, 'src', d);
    if (fs.existsSync(p)) walk(p);
  });
  return t;
}

function loadEngine() {
  if (cached) return cached;
  const out = path.join(os.tmpdir(), 'apex-longitudinal-engine');
  const stamp = path.join(out, '.stamp');
  const src = newestSourceTime();
  const isFresh = () => fs.existsSync(stamp) && Number(fs.readFileSync(stamp, 'utf8')) >= src;
  /*
   * node --test runs every test file in its own process at the same time. All of them would see a stale cache
   * after a source change and rebuild it concurrently, corrupting each other's output. A directory lock makes
   * exactly one process compile while the others wait for the finished result.
   */
  const lock = out + '.lock';
  const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  let locked = false;
  while (!isFresh() && !locked) {
    try { fs.mkdirSync(lock); locked = true; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 180000) fs.rmSync(lock, { recursive: true, force: true }); } catch { /* released meanwhile */ }
      sleep(150);
    }
  }
  const fresh = isFresh();
  try {
  if (!fresh) {
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'package.json'), '{"type":"commonjs"}');
    execFileSync(process.execPath, [
      path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
      'src/engine/training.ts', 'src/engine/intelligence.ts', 'src/engine/guidedSession.ts', 'src/engine/analytics.ts',
      'src/knowledge/exercises.ts', 'src/data/repository.ts', 'src/data/units.ts', 'src/data/integrity.ts',
      'src/coach/index.ts', 'src/engine/recovery.ts', 'src/engine/notifications.ts', 'src/knowledge/knowledgeGraph.ts', 'src/engine/profileEdit.ts', 'src/engine/goalEdit.ts', 'src/engine/journalEdit.ts', 'src/engine/workoutEdit.ts', 'src/engine/exerciseSafety.ts', 'src/engine/exerciseGraph.ts', 'src/aiGateway.ts', 'src/aiGrounding.ts', 'src/aiContract.ts',
      '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck',
      '--esModuleInterop', '--rootDir', root, '--outDir', out,
    ], { cwd: root, stdio: 'pipe' });
  /* the stub is written before the stamp so a process that sees a fresh stamp always sees the stub too */
    fs.writeFileSync(
      path.join(out, 'src/data/sqliteAdapter.js'),
      [
        "'use strict';",
        'class ApexSQLiteStore { async open() { return undefined; } async read() { return undefined; } async write() {} async reset() {} }',
        'exports.ApexSQLiteStore = ApexSQLiteStore;',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(stamp, String(Date.now()));
  }
  } finally { if (locked) fs.rmSync(lock, { recursive: true, force: true }); }
  /*
   * The native SQLite plugin only exists on a Capacitor platform. Node cannot run it, so the harness
   * substitutes a no-op store; the authoritative localStorage path and repository merge/repair/integrity
   * logic are still the real code. (Also avoids retaining queued payloads in a fully synchronous simulation.)
   */
  const req = (p) => require(path.join(out, p));
  cached = {
    training: req('src/engine/training.js'),
    intelligence: req('src/engine/intelligence.js'),
    analytics: req('src/engine/analytics.js'),
    recovery: req('src/engine/recovery.js'),
    dates: req('src/data/dates.js'),
    guided: req('src/engine/guidedSession.js'),
    knowledgeGraph: req('src/knowledge/knowledgeGraph.js'),
    notifications: req('src/engine/notifications.js'),
    goalProgram: req('src/engine/goalProgram.js'),
    profileEdit: req('src/engine/profileEdit.js'),
    goalEdit: req('src/engine/goalEdit.js'),
    journalEdit: req('src/engine/journalEdit.js'),
    workoutEdit: req('src/engine/workoutEdit.js'),
    exerciseSafety: req('src/engine/exerciseSafety.js'),
    exerciseGraph: req('src/engine/exerciseGraph.js'),
    aiGateway: req('src/aiGateway.js'),
    aiGrounding: req('src/aiGrounding.js'),
    aiContract: req('src/aiContract.js'),
    coachMod: req('src/coach/index.js'),
    exercisesMod: req('src/knowledge/exercises.js'),
    integrity: req('src/data/integrity.js'),
    units: req('src/data/units.js'),
    repositoryPath: path.join(out, 'src/data/repository.js'),
    loadRepository() { return req('src/data/repository.js'); },
    out,
  };
  return cached;
}

module.exports = { loadEngine, root };
