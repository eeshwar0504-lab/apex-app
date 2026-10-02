'use strict';
/*
 * Phase 17: the motion system is centralised (apex-motion.css), collapses under reduced motion, animates cheap properties only,
 * and the pieces that wait on it (sheet exit, back navigation) read the same tokens.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const css = read('src/apex-motion.css');

const rootBlock = css.match(/:root \{([^}]*)\}/)[1];
const mediaBlock = css.match(/@media \(prefers-reduced-motion: reduce\) \{\s*:root \{([^}]*)\}/)[1];
const appBlock = css.match(/\.app\.reduce-motion \{([^}]*)\}/)[1];
const tokenNames = (b) => [...b.matchAll(/(--[a-z-]+):/g)].map((m) => m[1]);

test('P17.1 every motion token is defined once, in apex-motion.css, and nowhere else', () => {
  const names = tokenNames(rootBlock);
  for (const n of ['--motion-instant', '--motion-fast', '--motion-base', '--motion-smooth', '--motion-slow', '--motion-exit', '--ease-apex', '--ease-spring', '--ease-exit', '--press-scale', '--stagger-step']) {
    assert.ok(names.includes(n), `${n} is a token`);
  }
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'src')).filter((x) => x.endsWith('.css') && x !== 'apex-motion.css')) {
    assert.doesNotMatch(read(`src/${f}`), /^\s*--(motion|ease)-[a-z]+\s*:/m, `${f} must not redefine a motion token`);
  }
});

test('P17.2 reduced motion (OS setting and APEX preference) collapses every duration, distance and press scale', () => {
  const collapsing = tokenNames(rootBlock).filter((n) => /^--(motion|press-scale|stagger|rise|slide)/.test(n));
  for (const set of [mediaBlock, appBlock]) {
    const names = tokenNames(set);
    for (const n of collapsing) assert.ok(names.includes(n), `${n} is collapsed under reduced motion`);
    for (const n of names.filter((x) => x.startsWith('--motion-'))) assert.match(set, new RegExp(`${n}: \\.01ms;`));
    assert.match(set, /--press-scale: 1;/);
    assert.match(set, /--rise-distance: 0px;/);
  }
  assert.match(css, /\.app\.reduce-motion \.a3-skeleton::after \{ animation: none; \}/);
});

test('P17.3 durations come from tokens: no stray millisecond values outside the token blocks and two named exceptions', () => {
  const body = css.replace(/:root \{[^}]*\}/g, '').replace(/@media \(prefers-reduced-motion: reduce\) \{\s*:root \{[^}]*\}\s*\}/g, '').replace(/\.app\.reduce-motion \{[^}]*\}/g, '');
  const stray = [...body.matchAll(/(\d+)ms/g)].map((m) => m[0]);
  // the rest ring ticks once a second (linear) and the skeleton shimmer is a slow ambient loop; both are deliberate
  assert.deepEqual([...new Set(stray)].sort(), ['1400ms', '400ms']);
});

test('P17.4 only transform and opacity are keyframed; transitions never touch layout', () => {
  const frames = css.split('\n').filter((l) => l.startsWith('@keyframes'));
  assert.ok(frames.length >= 5);
  for (const l of frames) {
    const props = [...l.matchAll(/([a-z-]+):\s*[^;]+;/g)].map((m) => m[1]);
    for (const p of props) assert.ok(['opacity', 'transform'].includes(p), `${p} in ${l.slice(0, 40)}`);
  }
  assert.doesNotMatch(css, /transition:\s*all/);
  const transitions = [...css.matchAll(/transition:([^;]*);/g)].map((m) => m[1]);
  for (const t of transitions) assert.match(t, /transform|stroke|width/, `transition ${t}`);
  assert.doesNotMatch(css, /transition[^;]*\b(height|top|left|right|bottom|margin|padding)\b/);
});

test('P17.5 press feedback is a shared, zero-specificity rule that skips disabled and busy controls', () => {
  assert.match(css, /:where\(button, \[role="button"\], \.a3-tap\):where\(:active:not\(:disabled, \[aria-disabled="true"\], \[aria-busy="true"\]\)\) \{\s*transform: scale\(var\(--press-scale\)\);/);
  assert.match(css, /\[aria-busy="true"\]\) \{ cursor: progress; pointer-events: none; \}/);
  assert.match(css, /touch-action: manipulation;/);
});

test('P17.6 an animation never holds its end state over :active (fill-mode backwards for enter animations)', () => {
  assert.match(css, /\.a3-home > \*, \.a3-workout > \*, \.a3-progress > \*, \.a3-complete\.completed \{ animation-fill-mode: backwards; \}/);
  for (const m of css.matchAll(/animation: apex-m-(rise|pop|slide-back)[^;]*;/g)) assert.match(m[0], /backwards/, m[0]);
});

test('P17.7 sheets exit through a token-timed state and ignore a second request', () => {
  const dialogs = read('src/ui/dialogs.tsx');
  const motion = read('src/ui/motion.ts');
  assert.match(dialogs, /useExitTransition\(close\)/);
  assert.match(dialogs, /is-closing/);
  assert.match(dialogs, /requestRef\.current\(\)/, 'Escape goes through the exit transition');
  assert.match(motion, /if\(closingRef\.current\)return;/);
  assert.match(motion, /'--motion-exit'/);
  assert.match(css, /\.a3-modal-backdrop\.is-closing \{[^}]*pointer-events: none;/);
  assert.match(css, /--motion-exit: 160ms;/);
});

test('P17.8 Android back: direction is recorded, the screen enters from it, and a double press is ignored', () => {
  const app = read('src/App.tsx');
  assert.match(app, /data-nav-dir=\{navDir\.current\}/);
  assert.match(app, /navDir\.current='back'/);
  assert.match(app, /navDir\.current='forward'/);
  assert.match(app, /motionMs\('--motion-fast',140\)/);
  assert.match(css, /\.page-transition\[data-nav-dir="back"\] \{ animation-name: apex-m-slide-back; \}/);
});

test('P17.9 focus stays visible: shared ring for custom controls, stronger under high contrast', () => {
  assert.match(css, /:focus-visible \{ outline: 2px solid/);
  assert.match(css, /\.app\.high-contrast :focus-visible \{ outline: 3px solid #fff;/);
});

test('P17.10 the motion stylesheet loads last and the skeleton is announced', () => {
  const main = read('src/main.tsx');
  assert.ok(main.indexOf('./apex-motion.css') > main.indexOf('./apex3-design-system.css'));
  assert.match(read('src/ui/primitives.tsx'), /role="status" aria-label=\{label\}/);
  assert.match(read('src/screens/Coach.tsx'), /explaining&&<Skeleton/);
});
