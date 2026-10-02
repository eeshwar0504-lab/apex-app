'use strict';
/*
 * Phase 4 / Objective 25: the PWA decision (docs/PWA_DECISION.md) is "not a PWA". The code must say the same thing:
 * no manifest link to a file that does not exist, no service worker, no install prompt.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|html)$/.test(entry.name)) out.push(rel);
  }
  return out;
};

test('PWA1 every <link rel="manifest"> in index.html points at a file that exists (today: there is none)', () => {
  const html = read('index.html');
  const links = [...html.matchAll(/<link[^>]+rel=["']manifest["'][^>]*href=["']([^"']+)["']/g)].map((m) => m[1]);
  for (const href of links) assert.ok(fs.existsSync(path.join(root, 'public', href.replace(/^\//, ''))), `index.html links ${href}, which does not exist`);
  assert.deepEqual(links, [], 'the decision is not to ship a manifest');
  assert.ok(!fs.existsSync(path.join(root, 'public', 'manifest.webmanifest')));
  assert.ok(!fs.existsSync(path.join(root, 'manifest.webmanifest')), 'no stray manifest at the repository root either');
});

test('PWA2 no service worker is registered and no install prompt is handled in the app source', () => {
  const offenders = [];
  for (const file of [...walk('src'), 'index.html']) {
    const text = read(file);
    if (/serviceWorker\s*\.\s*register|navigator\.serviceWorker|beforeinstallprompt|InstallPromptEvent|workbox/i.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
  assert.ok(!fs.existsSync(path.join(root, 'public', 'sw.js')) && !fs.existsSync(path.join(root, 'public', 'service-worker.js')));
});

test('PWA3 the decision is written down and says what it decided', () => {
  const doc = read('docs/PWA_DECISION.md');
  assert.match(doc, /does not ship as a PWA/);
  assert.match(doc, /Capacitor Android/);
  assert.match(doc, /Revisit when/);
});
