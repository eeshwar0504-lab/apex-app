'use strict';
/*
 * Phase 18: src/main.tsx is the entry point only. Screens, shared UI and app state helpers live in cohesive modules, and the
 * module graph is layered and acyclic: ui (shared) <- screens <- App <- main. The UI source tests read the whole tree through
 * tests/ui-source.cjs.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { uiFiles } = require('./ui-source.cjs');

const SRC = path.join(__dirname, '..', 'src');
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');
const text = (f) => fs.readFileSync(f, 'utf8');
const resolve = (from, spec) => {
  const base = path.join(path.dirname(from), spec);
  return ['.ts', '.tsx', '/index.ts', ''].map((x) => base + x).find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
};
const edges = (f) => [...text(f).matchAll(/from '(\.[^']*)'/g)].map((m) => resolve(f, m[1])).filter(Boolean);

test('P18.1 main.tsx is the composition root only', () => {
  const main = text(path.join(SRC, 'main.tsx'));
  assert.ok(main.split('\n').length <= 40, 'main.tsx stays thin');
  assert.match(main, /createRoot\(document\.getElementById\('root'\)!\)\.render\(/);
  assert.doesNotMatch(main, /^function |^export function |useState|repository|engine\//m, 'no screen, state or engine code in the entry');
});

test('P18.2 the expected modules exist and each is cohesive', () => {
  for (const f of ['App.tsx', 'ui/primitives.tsx', 'ui/dialogs.tsx', 'ui/navigation.tsx', 'ui/motion.ts', 'ui/shared.ts', 'ui/stateHelpers.ts', 'ui/setHelpers.ts',
    'screens/Home.tsx', 'screens/Train.tsx', 'screens/Workout.tsx', 'screens/SetEditor.tsx', 'screens/Progress.tsx', 'screens/Coach.tsx', 'screens/You.tsx',
    'screens/Nutrition.tsx', 'screens/Library.tsx', 'screens/Onboarding.tsx']) assert.ok(fs.existsSync(path.join(SRC, f)), f);
  const pick = (f, re) => assert.match(text(path.join(SRC, f)), re, f);
  pick('ui/dialogs.tsx', /export function Modal/);
  pick('ui/dialogs.tsx', /export function useConfirm/);
  pick('ui/navigation.tsx', /export function NavItem/);
  pick('ui/navigation.tsx', /export function Command/);
  pick('screens/Coach.tsx', /export function Coach\b/);
  pick('screens/Progress.tsx', /export function Progress\b/);
  pick('screens/Workout.tsx', /export function WorkoutView/);
  pick('App.tsx', /export function App\b/);
});

test('P18.3 no module is large enough to hide a second screen, other than the workout session itself', () => {
  for (const f of uiFiles()) {
    const lines = text(f).split('\n').length;
    if (rel(f) === 'screens/Workout.tsx') continue; // the guided session is one component; splitting it would change its state flow
    assert.ok(lines <= 600, `${rel(f)} has ${lines} lines`);
  }
});

test('P18.4 the UI module graph is acyclic and layered (ui <- screens <- App <- main)', () => {
  const layer = (f) => (rel(f) === 'main.tsx' ? 3 : rel(f) === 'App.tsx' ? 2 : rel(f).startsWith('screens/') ? 1 : rel(f).startsWith('ui/') ? 0 : -1);
  const seen = new Set();
  const stack = [];
  const visit = (f) => {
    if (stack.includes(f)) assert.fail(`cycle: ${[...stack.slice(stack.indexOf(f)), f].map(rel).join(' > ')}`);
    if (seen.has(f)) return;
    seen.add(f);
    stack.push(f);
    for (const t of edges(f)) {
      if (layer(f) >= 0 && layer(t) >= 0) assert.ok(layer(t) <= layer(f), `${rel(f)} must not import upward from ${rel(t)}`);
      if (layer(t) >= 0) visit(t); // engine-side cycles (type-only provider imports) are outside this phase
    }
    stack.pop();
  };
  for (const f of uiFiles()) visit(f);
});

test('P18.5 shared UI does not know about screens, and engines never import UI', () => {
  for (const f of uiFiles().filter((x) => rel(x).startsWith('ui/'))) assert.doesNotMatch(text(f), /from '\.\.\/screens|from '\.\.\/App/, rel(f));
  const engineDirs = ['engine', 'coach', 'core', 'data'];
  for (const d of engineDirs) {
    for (const f of fs.readdirSync(path.join(SRC, d)).filter((x) => /\.tsx?$/.test(x))) {
      assert.doesNotMatch(text(path.join(SRC, d, f)), /from '\.\.\/(ui|screens|App|main)/, `${d}/${f}`);
    }
  }
});

test('P18.6 no dead exports from the extraction: every exported UI name is imported somewhere', () => {
  const all = uiFiles().map((f) => [f, text(f)]);
  for (const [f, t] of all) {
    for (const m of t.matchAll(/^export (?:function|const|class|type) ([A-Za-z0-9_]+)/gm)) {
      const name = m[1];
      const used = all.some(([g, u]) => g !== f && new RegExp(`\\b${name}\\b`).test(u));
      assert.ok(used, `${rel(f)} exports ${name} but nothing imports it`);
    }
  }
});
