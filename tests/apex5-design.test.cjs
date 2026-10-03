'use strict';
/*
 * APEX 5.0 design contract. The experience is "insanely sophisticated underneath, ridiculously simple on the surface": these tests
 * pin the systems that make it so (one line, one object, one component system with three disclosure levels) and the things the
 * design refuses to do. The engines are untouched, so several of them assert that they do not know the interface exists.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { loadEngine } = require('./longitudinal/load-engine.cjs');
const { uiSource } = require('./ui-source.cjs');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const E = loadEngine();
const css = () => read('src/apex5.css');
const allCss = () => fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.css')).map((f) => read(`src/${f}`)).join('\n');

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => m.delete(k) };
}
function hydrate(preferences) {
  global.localStorage = memoryStorage();
  const { repository, fresh } = E.loadRepository();
  repository.load();
  const s = fresh();
  s.onboardingComplete = true;
  s.preferences = { ...s.preferences, ...preferences };
  return E.loadRepository().migratePersistedState(s);
}

/* ---------------------------------------------------------------- 1-2. identity, the Line, the object */

test('A5.1 the APEX Line is one primitive with a few meanings, and it stays scarce', () => {
  const prim = read('src/ui/primitives.tsx');
  assert.match(prim, /export function ApexLine/);
  for (const v of ["'progress'", "'timer'", "'baseline'", "'signal'"]) assert.ok(prim.includes(v), v);
  const used = [...uiSource().matchAll(/<ApexLine\b/g)].length;
  assert.ok(used >= 8, 'it is the navigation, progress, timer, baseline and completion signal');
  assert.ok(used <= 20, `gold is earned: ${used} uses`);
  // never inside a repeated list of cards
  assert.doesNotMatch(read('src/screens/Home.tsx'), /<ApexLine/, 'Home draws the week through WeekLine, not extra lines');
  assert.match(css(), /\.apex-line > i \{[^}]*transform-origin: left center/);
});

test('A5.2 the Session Thread is one named object across Home, briefing, workout, dock, artifact and week', () => {
  const owners = { 'src/screens/Home.tsx': 1, 'src/screens/Train.tsx': 1, 'src/screens/Workout.tsx': 2, 'src/ui/navigation.tsx': 1, 'src/screens/TrainingMap.tsx': 1 };
  for (const [file, max] of Object.entries(owners)) {
    const n = [...read(file).matchAll(/viewTransitionName:'session-thread'/g)].length;
    assert.ok(n >= 1 && n <= max, `${file} carries the thread ${n} time(s)`);
  }
  assert.match(read('src/ui/motion.ts'), /startViewTransition/);
  assert.match(read('src/ui/motion.ts'), /motionReduced\(reducedPreference\)/, 'reduced motion skips the travel');
  assert.match(css(), /::view-transition-group\(session-thread\)/);
  assert.match(read('src/App.tsx'), /withViewTransition\(\(\)=>\{setRoute\(r\)/);
});

test('A5.3 the dock keeps a running workout within reach, with a visible Resume', () => {
  const nav = read('src/ui/navigation.tsx');
  assert.match(nav, /export function SessionDock/);
  assert.match(nav, /SESSION IN PROGRESS/);
  assert.match(nav, /Resume<Icon/);
  const app = read('src/App.tsx');
  assert.match(app, /<SessionDock workout=\{active\}/);
  assert.match(app, /route!=='home'&&route!=='workout'/);
});

/* ---------------------------------------------------------------- 3-4. navigation, motion vocabulary */

test('A5.4 four zones stay obvious: Home, Train, Progress, You, with no gesture-only navigation', () => {
  const app = read('src/App.tsx');
  for (const l of ['Home', 'Train', 'Progress', 'You']) assert.ok(app.includes(`label="${l}"`), l);
  assert.doesNotMatch(uiSource(), /onTouchStart|onTouchMove|onPointerMove|swipe/i, 'no swipe-only controls');
});

test('A5.5 the motion vocabulary is eight named behaviours, all driven by tokens that reduced motion collapses', () => {
  const c = css();
  for (const name of ['mo-emerge', 'mo-settle', 'mo-travel', 'mo-fold', 'mo-recede', 'mo-breathe', 'mo-release']) assert.ok(c.includes(`.${name}`), name);
  assert.match(c, /view-transition/, 'morph');
  assert.match(read('src/apex-motion.css'), /--motion-smooth: \.01ms/, 'reduced motion collapses the tokens');
  assert.match(c, /@media \(prefers-reduced-motion: reduce\)/);
  for (const name of ['mo-emerge', 'mo-release', 'mo-fold', 'mo-recede']) assert.ok(uiSource().includes(name), `${name} is used, not only defined`);
});

test('A5.6 cause becomes effect: one path shows what a logged set changed', () => {
  const parts = read('src/screens/WorkoutParts.tsx');
  assert.match(parts, /aria-label="What this set changed"/);
  const workout = read('src/screens/Workout.tsx');
  for (const label of ["'SET'", "'EXERCISE'", "'SESSION'", "'WEEK'"]) assert.ok(workout.includes(`label:${label}`), label);
  assert.match(workout, /<CausePath steps=\{causeSteps\}\/>/);
});

/* ---------------------------------------------------------------- 5. one component system, three levels */

test('A5.7 Guided is the default and the level never reaches the engines', () => {
  const s = hydrate({});
  assert.equal(s.preferences.uiExperience, 'guided');
  assert.equal(hydrate({ uiExperience: 'advanced' }).preferences.uiExperience, 'advanced');
  assert.equal(hydrate({ uiExperience: 'standard' }).preferences.uiExperience, 'standard');
  assert.equal(hydrate({ uiExperience: 'nonsense' }).preferences.uiExperience, 'guided');
  for (const dir of ['src/engine', 'src/coach', 'src/knowledge', 'src/native']) {
    for (const f of fs.readdirSync(path.join(root, dir)).filter((x) => x.endsWith('.ts'))) {
      assert.doesNotMatch(read(`${dir}/${f}`), /uiExperience|useExperience|UiExperience/, `${dir}/${f}`);
    }
  }
});

test('A5.8 changing the level changes nothing the engines compute', () => {
  const profile = { id: 'u', name: '', experience: 'beginner', goals: ['general'], primaryGoal: 'general', trainingDays: 3, sessionMinutes: 45, equipment: ['machine', 'cable', 'bodyweight'], body: {}, createdAt: '2026-01-01T00:00:00.000Z' };
  const EX = E.exercisesMod.EXERCISES;
  const plan = (level) => {
    const p = E.training.buildPlan({ ...profile, uiExperience: level }, EX, [{ id: 'g', kind: 'general', title: 'x', priority: 1, periodId: 'p', status: 'active' }]);
    return JSON.stringify({ days: p.days.map((d) => [d.label, d.rest, d.dayIndex]), sets: p.exerciseSets });
  };
  assert.equal(plan('guided'), plan('advanced'));
  const ex = EX.find((e) => e.id === 'machine_chest_press');
  const load = (level) => JSON.stringify(E.training.personalizedLoad(ex, [], { ...profile, uiExperience: level }, EX, '2026-02-01', []));
  assert.equal(load('guided'), load('standard'));
  assert.equal(load('standard'), load('advanced'));
});

test('A5.9 every major screen reads the same disclosure context rather than keeping its own flag', () => {
  for (const f of ['Workout', 'Train', 'Home', 'Progress', 'Coach', 'Library', 'Nutrition', 'You']) {
    assert.match(read(`src/screens/${f}.tsx`), /useExperience\(\)/, f);
  }
  assert.match(read('src/App.tsx'), /<ExperienceProvider value=\{normalizeExperience\(s\.preferences\.uiExperience\)\}>/);
  assert.equal([...uiSource().matchAll(/createContext</g)].length, 1, 'one disclosure context');
});

test('A5.10 Workout Experience lives in Settings with copy, a live preview and no "better" ranking', () => {
  const you = read('src/screens/You.tsx');
  assert.match(you, /This changes what you see, not what you train\./);
  assert.match(you, /<ExperiencePreview level=\{level\}\/>/);
  const exp = read('src/ui/experience.tsx');
  for (const note of ['Essentials, explained as needed.', 'More context and control.', 'Full detail and control.']) assert.ok(exp.includes(note), note);
  assert.doesNotMatch(exp, /best|better|pro\b|expert/i);
});

/* ---------------------------------------------------------------- 6-9. Home, Train, briefing, focus */

test('A5.11 Home is a command center: the session first, the week second, intelligence only when it exists', () => {
  const home = read('src/screens/Home.tsx');
  const i = (s) => home.indexOf(s);
  assert.ok(i('aria-label="Daily briefing"') < i('aria-label="This week"') && i('aria-label="This week"') < i('aria-label="Coach observation"'));
  assert.match(home, /Begin session/);
  assert.doesNotMatch(home, /Streak|0 PRs|ApexStat/, 'no zero tiles, no streak guilt');
  assert.match(read('src/ui/homeState.ts'), /'normal'\|'progressing'\|'returning'\|'fatigued'\|'deload'\|'recovery'/);
});

test('A5.12 the Home state only reads engine results', () => {
  const src = read('src/ui/homeState.ts');
  assert.match(src, /recoveryStatus\(s,today\(\)\)/);
  assert.match(src, /returning/);
  assert.doesNotMatch(src, /Math\.random|Date\.now/);
});

test('A5.13 the Training Map is a line of nodes with text names, deliberate editing and a scale', () => {
  const map = read('src/screens/TrainingMap.tsx');
  assert.match(map, /role="group" aria-label=\{`Training week from/);
  assert.match(map, /aria-label=\{name\}/);
  assert.match(map, /rest day/);
  const train = read('src/screens/Train.tsx');
  assert.match(train, /\['session','Session'\],\['week','Week'\],\['block','Block'\],\['history','History'\]/);
  assert.match(train, /\{editing&&/, 'Move and Skip need Edit');
  assert.match(css(), /\.apex-week\.is-deload/, 'a deload changes the rhythm');
});

test('A5.14 trainingWeek treats a planned rest day as space and only a planned, undone session as missed', () => {
  const src = read('src/ui/week.ts');
  const body = src.split('\n').filter((l) => !l.startsWith('import ')).join('\n').replace(/export /g, '');
  const js = "const {todayLocal,addDaysLocal,workoutDay}=require('dates');\n" + ts.transpileModule(body, { compilerOptions: { module: 'commonjs', target: 'es2020' } }).outputText + '\nmodule.exports={trainingWeek};';
  const m = { exports: {} };
  new Function('module', 'exports', 'require', js)(m, m.exports, () => require(path.join(E.out, 'src/data/dates.js')));
  const day = (iso) => ({ iso });
  const wk = m.exports.trainingWeek({ workouts: [
    { id: 'a', status: 'completed', scheduledDate: '2026-03-02', completedAt: '2026-03-02T10:00:00', exercises: [] },
    { id: 'b', status: 'planned', scheduledDate: '2026-03-04', exercises: [] },
    { id: 'c', status: 'missed', scheduledDate: '2026-03-03', exercises: [] },
  ], deloads: [] }, 0, '2026-03-05');
  const by = Object.fromEntries(wk.nodes.map((n) => [n.iso, n.state]));
  assert.equal(by['2026-03-02'], 'done');
  assert.equal(by['2026-03-03'], 'missed');
  assert.equal(by['2026-03-04'], 'planned');
  assert.equal(by['2026-03-05'], 'rest', 'a day with nothing planned is rest, not failure');
  assert.equal(by['2026-03-06'], 'rest');
  assert.ok(day);
});

test('A5.15 the briefing is a mission: name, duration, intent, exercises, preparation, one START', () => {
  const src = read('src/screens/Train.tsx');
  for (const s of ['SESSION BRIEFING', "TODAY'S INTENT", 'PREPARATION', 'Warm-up sets are added automatically']) assert.ok(src.includes(s), s);
  assert.match(src, /className="apex-sticky-action"/);
  assert.match(src, /startLabel=readyToStart\?'Start training'/);
});

test('A5.16 during training the workout is the environment: chrome recedes and nothing critical needs a gesture', () => {
  assert.match(read('src/App.tsx'), /route==='workout'\?' is-focus'/);
  assert.match(css(), /\.app\.is-focus \.topbar \{ opacity/);
  assert.match(css(), /\.app\.is-focus \.apex-dock \{ display: none/);
});

/* ---------------------------------------------------------------- 10-13. ghost, logging, rest, completion */

test('A5.17 the Ghost Set reads last time and never feeds a prescription', () => {
  const prev = read('src/ui/previous.ts');
  assert.match(prev, /status==='completed'/);
  assert.match(prev, /isWorkingSet/);
  assert.doesNotMatch(prev, /personalizedLoad|recommend/i);
  const parts = read('src/screens/WorkoutParts.tsx');
  assert.match(parts, /LAST TIME/);
  assert.match(parts, /is-dissolving/);
  assert.match(read('src/screens/Workout.tsx'), /const ghost=standard&&/, 'previous performance is Standard and up');
});

test('A5.18 set logging adapts by level and never saves a target as an actual', () => {
  const w = read('src/screens/Workout.tsx');
  assert.match(w, /showRir=\{standard\}/);
  assert.match(w, /showNotes=\{advanced\}/);
  assert.match(w, /\{advanced&&activeEx\.tempo&&<span>Tempo/);
  assert.doesNotMatch(w, /ss\.rir\s*=\s*/);
  assert.doesNotMatch(read('src/screens/SetEditor.tsx'), /swipe|onTouch/i);
});

test('A5.19 rest is the APEX Line contracting, with +15, +30, skip and the next set', () => {
  const parts = read('src/screens/WorkoutParts.tsx');
  assert.match(parts, /export function RestLine/);
  assert.match(parts, /<ApexLine value=\{p\} variant="timer"\/>/);
  assert.match(parts, /role="timer"/);
  const w = read('src/screens/Workout.tsx');
  assert.match(w, /\[15,30\]\.map/);
  assert.match(w, /SKIP REST/);
  assert.match(css(), /\.apex-line-timer > i \{ transition: transform 500ms linear/);
});

test('A5.20 completion is an artifact, not a congratulation, and it travels into the week', () => {
  const w = read('src/screens/Workout.tsx');
  assert.match(w, /SESSION COMPLETE/);
  assert.doesNotMatch(uiSource(), /Congratulations|🎉|Great work today/);
  assert.match(w, /<SessionArtifact/);
  assert.match(w, /apex-fresh-session/);
  assert.match(read('src/screens/Train.tsx'), /apex-fresh-session/);
  assert.match(read('src/screens/TrainingMap.tsx'), /is-fresh/);
  assert.match(w, /PR<\/strong>/, 'a personal record is an event on the record');
});

/* ---------------------------------------------------------------- 14-18. Progress, Coach */

test('A5.21 Progress is three levels: overview, dimensions, evidence, and every point opens its sets', () => {
  const p = read('src/screens/Progress.tsx');
  for (const t of ["['overview','Overview']", "['strength','Strength']", "['volume','Volume']", "['consistency','Consistency']", "['recovery','Recovery']", "['body','Body']"]) assert.ok(p.includes(t), t);
  assert.match(p, /aria-label="What changed"/);
  assert.match(p, /aria-label="Evidence"/);
  assert.match(p, /<EvidenceSets/);
  assert.match(p, /Open session/);
  const parts = read('src/screens/ProgressParts.tsx');
  assert.match(parts, /role="button" tabIndex=\{0\}/, 'chart points are keyboard-reachable');
  assert.match(parts, /apex-traj-pr/, 'personal records are events on the line');
  assert.match(parts, /role="table" aria-label="Training rhythm/);
  assert.match(parts, /role="list" aria-label="Weekly volume by muscle"/);
});

test('A5.22 fatigue is a state trajectory in words, not a mystery percentage', () => {
  const parts = read('src/screens/ProgressParts.tsx');
  assert.match(parts, /Recovery needed/);
  const recovery = parts.slice(parts.indexOf('export function RecoveryTrajectory'));
  assert.doesNotMatch(recovery, /\.score|%|percent/i, 'no score and no percentage');
});

test('A5.23 Coach is an observation system with structured, linked answers', () => {
  const c = read('src/screens/Coach.tsx');
  for (const s of ['APEX OBSERVATION', 'label="WHY"', 'label="WHAT CHANGED"', 'WHAT APEX RECOMMENDS']) assert.ok(c.includes(s), s);
  for (const s of ['ANSWER', 'EVIDENCE', 'INTERPRETATION', 'RECOMMENDATION', 'NEXT ACTION']) assert.ok(c.includes(`>${s}<`), s);
  assert.match(c, /onExercise&&r\.prescription/, 'links back to the exact exercise');
  assert.match(c, /STEP_ROUTE/);
  assert.match(c, /answerCoachQuestion\(s,question,coachContext\(s,question\)\)/, 'answers come from the deterministic layer');
  assert.doesNotMatch(c, /Coach rule: Evidence first/);
});

test('A5.24 Coach opens from the object that raised the question', () => {
  const app = read('src/App.tsx');
  assert.match(app, /sheet\?\.startsWith\('coach:'\)/);
  assert.match(app, /onAsk=\{ask\}/);
  assert.match(read('src/screens/Workout.tsx'), /onAsk\(asks\)/, 'from a set');
  assert.match(read('src/screens/Progress.tsx'), /onAsk\(`Why did my \$\{selected\.name\} change\?`\)/, 'from a trend');
  assert.match(read('src/screens/Home.tsx'), /Why is this week lighter\?/, 'from a deload');
  assert.match(read('src/screens/Library.tsx'), /Why am I using this movement\?/, 'from an exercise');
});

test('A5.25 AI stays subordinate: the deterministic answer is built before and without it', () => {
  const c = read('src/screens/Coach.tsx');
  assert.ok(c.indexOf('answerCoachQuestion(s,t,coachContext(s,t))') < c.indexOf('void explainWithAI(t)'));
  assert.match(c, /The Coach answer above is unchanged/);
});

/* ---------------------------------------------------------------- 19-23. Library, onboarding, You, states */

test('A5.26 the Exercise Dossier is an object with text instructions and no video dependency', () => {
  const lib = read('src/screens/Library.tsx');
  for (const h of ['HOW TO', 'SETUP', 'TECHNIQUE', 'MUSCLES', 'EQUIPMENT', 'YOUR HISTORY', 'PROGRESSION', 'ALTERNATIVES']) assert.ok(lib.includes(`"${h}"`), h);
  assert.doesNotMatch(lib, /<video|youtube/i);
  assert.match(read('src/ui/dialogs.tsx'), /let lastPointer/, 'sheets grow from the tap that opened them');
});

test('A5.27 onboarding calibrates in order and assembles the plan from the answers', () => {
  const o = read('src/screens/Onboarding.tsx');
  const order = ['GOAL / 02', 'EXPERIENCE / 03', 'SCHEDULE / 04', 'EQUIPMENT / 05', 'PREFERENCES / 06', 'VIEW / 07', 'YOUR APEX PROFILE / 08'];
  order.reduce((at, s) => { const i = o.indexOf(s); assert.ok(i > at, `${s} in order`); return i; }, -1);
  assert.match(o, /apex-assemble/);
  assert.match(o, /BUILDING YOUR PLAN/);
  assert.match(o, /buildPlan\(p,EXERCISES,\[g\]\)/, 'the engine builds the plan');
  assert.match(o, /reducedMotion\?0:motionMs/, 'no wait with reduced motion');
});

test('A5.28 You is an operating profile: identity, goals, level, view, measurements, journal, nutrition, settings by consequence', () => {
  const you = read('src/screens/You.tsx');
  for (const s of ['TRAINING IDENTITY', 'Training level', 'Goals', 'Body weight']) assert.ok(you.includes(s), s);
  const order = ['title="Training"', 'title="Experience"', 'title="Appearance"', 'title="Notifications"', 'title="Haptics"', 'title="Accessibility"', 'title="Data"', 'title="Privacy"'];
  order.reduce((at, s) => { const i = you.indexOf(s); assert.ok(i > at, s); return i; }, -1);
  assert.doesNotMatch(uiSource(), /follower|leaderboard|feed\b/i);
});

test('A5.29 goals are trajectories with a current state, target, trend and next signal', () => {
  const p = read('src/screens/Personal.tsx');
  for (const s of ['CURRENT STATE', 'NEXT MEANINGFUL SIGNAL', '<dt>TREND</dt>', '<dt>TARGET</dt>']) assert.ok(p.includes(s), s);
  assert.match(p, /<ApexLine value=\{gp\.percent\/100\}/);
  assert.doesNotMatch(p, /a3-bar/, 'no arbitrary progress bar');
});

test('A5.30 the journal is one sentence away, and measurements and nutrition follow the same language', () => {
  const p = read('src/screens/Personal.tsx');
  assert.match(p, /One sentence is enough\./);
  assert.match(p, /\{\(\{general:'Day',workout:'Session',exercise:'Exercise'/);
  assert.match(p, /More measurements/);
  assert.match(read('src/screens/Nutrition.tsx'), /const tab=standard\?nutTab:'today'/);
});

test('A5.31 empty states are complete and errors are an instrument reporting a problem', () => {
  const ui = uiSource();
  for (const s of ['Your first session draws the first line', 'Your training history begins here.', 'Complete a few sessions and APEX will begin finding patterns.']) assert.ok(ui.includes(s), s);
  assert.doesNotMatch(ui, /Nothing here\b|Nothing to show/);
  const prim = read('src/ui/primitives.tsx');
  for (const s of ['What happened', 'What is safe', 'What to do']) assert.ok(prim.includes(s), s);
  assert.match(read('src/App.tsx'), /title="NOT SAVED"/);
  assert.match(read('src/App.tsx'), /Your previous data is safe on this device\./);
  assert.match(prim, /ErrorPanel=.*ErrorState/s);
});

test('A5.32 sheets keep context and dialogs are only for destructive, irreversible or permission moments', () => {
  const dialogs = read('src/ui/dialogs.tsx');
  assert.match(dialogs, /useLayoutEffect/);
  assert.match(read('src/App.tsx'), /mo-recede/, 'the background recedes behind a sheet');
  const ask = [...uiSource().matchAll(/ask\(\{title:'([^']+)'/g)].map((m) => m[1]);
  for (const t of ask) assert.match(t, /^(Remove|Skip|Delete|Start an extra|Replace your|Reset)/, `confirmation reserved for consequence: ${t}`);
});

/* ---------------------------------------------------------------- 24-26. themes, type, surfaces, haptics, accessibility */

test('A5.33 four atmospheres: Obsidian, Graphite, Bone / Paper Night, High Contrast; the earlier five migrate', () => {
  for (const id of ['obsidian', 'graphite', 'bone', 'contrast']) assert.match(css(), new RegExp(`\\.app\\[data-theme="${id}"\\]`), id);
  assert.doesNotMatch(allCss(), /data-theme="(classic|steel|aurora|crimson)"/, 'the old themes are gone');
  assert.equal(hydrate({ theme: 'apex' }).preferences.theme, 'obsidian');
  assert.equal(hydrate({ theme: 'classic' }).preferences.theme, 'bone');
  assert.equal(hydrate({ theme: 'steel' }).preferences.theme, 'graphite');
  assert.equal(hydrate({ theme: 'aurora' }).preferences.theme, 'graphite');
  assert.equal(hydrate({ theme: 'crimson' }).preferences.theme, 'obsidian');
  assert.equal(hydrate({ theme: 'contrast' }).preferences.theme, 'contrast');
  assert.equal(hydrate({ theme: 'nonsense' }).preferences.theme, 'obsidian');
  assert.equal(hydrate({}).preferences.theme, 'obsidian');
});

test('A5.34 typography has two roles: a grotesk for UI and data with tabular numerals, serif for editorial moments only', () => {
  const c = css();
  assert.match(c, /--a3-ui: Inter/);
  assert.match(c, /font-variant-numeric: tabular-nums/);
  assert.match(c, /\.apex-observation[^{]*\{ font-family: var\(--a3-serif\)/);
  assert.match(c, /\.a3-focus-head h2[^{]*\{ font-family: var\(--a3-ui\)/, 'the working exercise name is UI type, not serif');
});

test('A5.35 surfaces are tonal: no glow, no card gradients, and the few gradients are scrims', () => {
  const c = css();
  assert.match(c, /--a3-card-bg: var\(--apex3-surface-raised\)/);
  assert.match(c, /--apex3-shadow-surface: none/);
  assert.doesNotMatch(allCss(), /neon|text-shadow: 0 0 \d+px/i);
  assert.ok([...c.matchAll(/(linear|radial|conic)-gradient/g)].length <= 4, 'APEX 5.0 adds almost no gradients');
  assert.doesNotMatch(allCss(), /a3-pr-rays|\.a3-ridge/);
});

test('A5.36 the haptic vocabulary is four patterns, gentler on request, silent when off', () => {
  const src = read('src/ui/haptics.ts');
  const js = ts.transpileModule(src, { compilerOptions: { module: 'commonjs', target: 'es2020' } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', js)(m, m.exports);
  const sent = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { vibrate: (p) => { sent.push(p); return true; } } });
  m.exports.haptic('tick', { haptics: true });
  m.exports.haptic('tick', { haptics: true, hapticsGentle: true });
  m.exports.haptic('thud', { haptics: true });
  m.exports.haptic('double', { haptics: true });
  m.exports.haptic('click', { haptics: false });
  assert.equal(sent.length, 4, 'nothing when off');
  assert.ok(sent[1][0] < sent[0][0], 'gentle is shorter');
  assert.equal(sent[3].length, 3, 'a double is two pulses');
  if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator;
  for (const k of ['tick', 'click', 'thud', 'double']) assert.match(src, new RegExp(`${k}:\\[`));
  assert.match(read('src/screens/Workout.tsx'), /buzz\('thud'\)/);
  assert.match(read('src/screens/Workout.tsx'), /buzz\('double'\)/);
});

test('A5.37 accessibility: 48dp everywhere, 56dp for the workout, text alternatives for every spatial view', () => {
  const c = css();
  assert.match(c, /\.a3-workout \.a3-cta, \.a3-workout \.a3-complete \{ min-height: 56px/);
  assert.match(c, /\.a3-workout \.a3-stepper > button \{ min-width: 56px; min-height: 56px/);
  assert.match(c, /\.a3-pill, \.mini-btn \{ min-height: 48px/);
  assert.match(c, /\.apex-node \{[^}]*min-height: 48px/);
  const map = read('src/screens/TrainingMap.tsx');
  assert.match(map, /weekSentence/, 'the week also exists as a sentence');
  assert.match(read('src/screens/Train.tsx'), /sessionRow/, 'and as a list of sessions');
  assert.match(read('src/screens/ProgressParts.tsx'), /aria-label=\{`Fatigue state over/);
  assert.match(css(), /\.app\.high-contrast/);
});

/* ---------------------------------------------------------------- 28-29. exclusions and the design test */

test('A5.38 the exclusions: nothing social, no streak guilt, no confetti, no gesture-only critical action, no chatbot-first Coach', () => {
  const ui = uiSource();
  assert.doesNotMatch(ui, /confetti|leaderboard|followers|Streak|streak:/i);
  assert.doesNotMatch(ui, /onTouchStart|onTouchEnd|swipe/i);
  assert.match(read('src/screens/Coach.tsx'), /APEX OBSERVATION/);
  assert.ok(read('src/screens/Coach.tsx').indexOf('APEX OBSERVATION') < read('src/screens/Coach.tsx').indexOf('Ask the coach'), 'the observation comes before the question box');
});

test('A5.39 the APEX Design Test is written down and every new feature maps to it', () => {
  const doc = read('docs/APEX_DESIGN_TEST.md');
  for (const q of ['easier to understand', 'communicate something meaningful', "visual identity", 'simple for Guided users', 'deeper functionality']) assert.ok(doc.includes(q), q);
  for (const system of ['APEX Line', 'Session Thread', 'Ghost Set', 'Observatory', 'Training Map', 'Guided / Standard / Advanced']) assert.ok(doc.includes(system), system);
});
