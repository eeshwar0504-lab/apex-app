'use strict';
/*
 * Beginner-first workout UX. The engines are unchanged; these tests pin what a first-time user is (and is not) asked to do, that
 * RIR is never invented, that feedback is optional, and that every advanced capability is still reachable.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine } = require('./longitudinal/load-engine.cjs');
const { uiSource } = require('./ui-source.cjs');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const E = loadEngine();
const EX = E.exercisesMod.EXERCISES;
const exercise = (id) => EX.find((e) => e.id === id);

function workoutWith(sets) {
  const ex = exercise('machine_chest_press');
  return {
    id: 'w1', planId: 'p', name: 'Full Body A', scheduledDate: '2026-10-03', status: 'in_progress', source: 'scheduled', version: 1,
    exercises: [{ exerciseId: ex.id, order: 0, prescribedSets: sets.length, repRange: [8, 12], restSec: 90, sets }],
    guidedSession: { phase: 'set_active', exerciseIndex: 0, setIndex: 0, completedSetIds: [], skippedSetIds: [], skippedExerciseIds: [], sessionEquipment: {}, version: 1 },
  };
}
const set = (id, extra = {}) => ({ id, type: 'working', weight: 10, reps: 8, completed: false, ...extra });

/* ---------------------------------------------------------------- no false RIR */

test('BW.1 logging a set without entering RIR leaves RIR unknown (never the target)', () => {
  const w = workoutWith([set('s1'), set('s2')]);
  const done = E.guided.completeSet(w, 0, 0);
  const logged = done.exercises[0].sets[0];
  assert.equal(logged.completed, true);
  assert.equal(logged.rir, undefined, 'the target RIR is a prescription, not a performed value');
  assert.equal(done.guidedSession.phase, 'feedback');
});

test('BW.2 the workout screen never writes a target RIR into a set', () => {
  const src = read('src/screens/Workout.tsx');
  assert.doesNotMatch(src, /ss\.rir\s*=\s*/, 'no assignment to a set RIR from a recommendation');
  assert.doesNotMatch(src, /\.rir\s*=\s*recommendation|\.rir\s*=\s*targetRir/);
  assert.match(src, /never written here|only ever what the athlete reported/);
});

test('BW.3 missing RIR is handled by feedback, rest and progression', () => {
  const w = E.guided.completeSet(workoutWith([set('s1'), set('s2')]), 0, 0);
  const ex = exercise('machine_chest_press');
  const after = E.guided.applySetFeedback(w, ex, 0, 0, 'right', undefined, 2);
  assert.equal(after.guidedSession.phase, 'rest');
  assert.equal(after.exercises[0].sets[0].rir, undefined);
  assert.equal(after.guidedSession.setFeedback.s1.rir, undefined, 'the feedback record carries an absent RIR, not an invented one');
  const heavy = E.guided.applySetFeedback(w, ex, 0, 0, 'heavy', undefined, 2);
  assert.ok(Number.isFinite(heavy.exercises[0].recommendedWeight ?? heavy.guidedSession.workingLoads?.[ex.id] ?? 0));
});

test('BW.4 RIR is entered only from the advanced controls', () => {
  const editor = read('src/screens/SetEditor.tsx');
  assert.match(editor, /showRir&&<div className="a3-control">/, 'the focused RIR stepper is conditional');
  const workout = read('src/screens/Workout.tsx');
  assert.match(workout, /showRir=\{advanced\}/);
  assert.match(workout, /showNotes=\{advanced\}/);
  assert.match(editor, /RIR \(reps left in the tank\)/, 'when shown it is explained');
});

/* ---------------------------------------------------------------- optional feedback */

test('BW.5 skipping set feedback records nothing and keeps the athlete moving', () => {
  const ex = exercise('machine_chest_press');
  const logged = E.guided.completeSet(workoutWith([set('s1'), set('s2')]), 0, 0);
  const before = JSON.parse(JSON.stringify(logged));
  const skipped = E.guided.skipSetFeedback(logged, ex, 0, 0, '2026-10-03T10:00:00.000Z');
  assert.equal(skipped.guidedSession.phase, 'rest');
  assert.ok(skipped.guidedSession.restStartedAt && skipped.guidedSession.restTargetSec > 0, 'a rest timer starts');
  assert.deepEqual(skipped.exercises, before.exercises, 'the logged set and the next set are untouched');
  assert.equal(skipped.guidedSession.setFeedback?.s1, undefined, 'no feedback value is invented');
  assert.deepEqual(skipped.guidedSession.setFeedback ?? {}, before.guidedSession.setFeedback ?? {});
  assert.deepEqual(skipped.guidedSession.recommendations ?? {}, before.guidedSession.recommendations ?? {});
  assert.deepEqual(skipped.guidedSession.calibration ?? {}, before.guidedSession.calibration ?? {});
  assert.deepEqual(skipped.guidedSession.workingLoads ?? {}, before.guidedSession.workingLoads ?? {});
  // and the workout carries on to the next set after the rest
  const next = E.guided.continueAfterRest(skipped).workout;
  assert.equal(next.guidedSession.phase, 'set_ready');
  assert.equal(next.guidedSession.setIndex, 1);
});

test('BW.6 chosen feedback is still recorded exactly as before', () => {
  const ex = exercise('machine_chest_press');
  const logged = E.guided.completeSet(workoutWith([set('s1'), set('s2')]), 0, 0);
  const right = E.guided.applySetFeedback(logged, ex, 0, 0, 'right', undefined, 2);
  assert.equal(right.guidedSession.setFeedback.s1.difficulty, 3);
  assert.equal(right.guidedSession.calibration[ex.id], 'established');
});

test('BW.7 the feedback screen offers Not sure / skip and the three real choices', () => {
  const src = read('src/screens/Workout.tsx');
  assert.match(src, /Not sure · skip/);
  assert.match(src, /onClick=\{skipFeedback\}/);
  for (const k of ["'heavy'", "'right'", "'easy'"]) assert.ok(src.includes(`applyFeedback(${k})`), k);
  assert.match(src, /How did that feel\? <small[^>]*>\(optional\)/);
});

test('BW.8 session feedback is optional: Done is always enabled and writes no rating', () => {
  const src = read('src/screens/Workout.tsx');
  assert.match(src, /onClick=\{feel\?saveFeel:done\}>\{feel\?'Save feedback & finish':'Done'\}/);
  assert.doesNotMatch(src, /disabled=\{!feel\}/);
  assert.doesNotMatch(src, /Select how it felt/);
});

/* ---------------------------------------------------------------- one START SET, visible LOG SET */

test('BW.9 the first set of an exercise starts from READY directly (no second START SET)', () => {
  const src = read('src/screens/Workout.tsx');
  assert.match(src, /if\(phase==='ready'\)\{\s*startSet\(\);\s*return;\s*\}/);
  assert.doesNotMatch(src, /setGuided\(\{phase:'set_ready'\}\)/);
  assert.match(src, /if\(phase==='prep'\)\{\s*setGuided\(\{phase:'ready'\}\);/, 'prep no longer detours through a second equipment screen');
});

test('BW.10 the active set has a visible LOG SET label and no unlabeled icon-only actions', () => {
  const editor = read('src/screens/SetEditor.tsx');
  assert.match(editor, /'LOG SET'/);
  assert.match(editor, /'Log set'/);
  const workout = read('src/screens/Workout.tsx');
  assert.doesNotMatch(workout, /a3-roundbtn/, 'the icon-only check and pause buttons are gone');
  assert.doesNotMatch(workout, /logOpen|a3-logscreen/, 'no separate Log Set screen to open first');
  // pause lives behind More
  assert.match(workout, /aria-label=\{current\.pausedAt\?'Resume workout':'Pause workout'\}/);
});

/* ---------------------------------------------------------------- equipment default */

test('BW.11 the profile equipment is the default and Change keeps the per-exercise override', () => {
  const src = read('src/screens/Train.tsx');
  assert.match(src, /effectiveStatus=\(exerciseId:string,item:string\)[^\n]*statusFor\(exerciseId,item\)\|\|\(fitOf\(exerciseId\)==='available'\?'profile_available':undefined\)/);
  assert.match(src, /const resolved=requirements\.every\(\(\{exerciseId,item\}\)=>!!effectiveStatus\(exerciseId,item\)\)/);
  assert.match(src, /Using the equipment from your setup\./);
  assert.match(src, />\{showEquip\?'Hide':'Change'\}</);
  assert.match(src, /Confirm available/);
  assert.match(src, /Not available/);
});

test('BW.12 a beginner profile resolves every first-workout requirement without a single answer', () => {
  const profile = { id: 'u', name: '', experience: 'beginner', goals: ['general'], primaryGoal: 'general', trainingDays: 3, sessionMinutes: 45, equipment: ['machine', 'cable', 'dumbbell', 'bodyweight'], body: {}, createdAt: new Date().toISOString() };
  const plan = E.training.buildPlan(profile, EX, [{ id: 'g', kind: 'general', title: 'Train Balanced', priority: 1, periodId: 'p', status: 'active' }]);
  const ids = plan.exerciseSets.full.map((id) => exercise(id));
  assert.ok(ids.length >= 5);
  for (const ex of ids) assert.equal(E.exerciseGraph.equipmentFit(ex, profile.equipment), 'available', `${ex.name} is available from the profile, so it needs no question`);
});

/* ---------------------------------------------------------------- advanced controls remain reachable */

test('BW.13 every advanced capability is still in the workout, behind one Advanced controls switch', () => {
  const src = read('src/screens/Workout.tsx');
  assert.match(src, /Advanced controls/);
  assert.match(src, /useAdvancedControls\(\)/);
  for (const re of [/aria-label="Set type"/, /\+ Add set/, /− Remove/, /Open workout overview/, /Replace exercise…/, /reorderWorkoutExercise/, /aria-label="Workout notes"/, /Skip exercise/, /label="History"|'History'/]) assert.match(src, re, String(re));
  // set type, add/remove, notes, overview and the history/options tabs are gated
  assert.match(src, /\{advanced&&<select value=\{activeSet\.type\}/);
  assert.match(src, /\{advanced&&<button className="a3-pill" onClick=\{onSetAdd\}>/);
  assert.match(src, /\{advanced&&<button className="a3-pill" onClick=\{onSetRemove\}>/);
  assert.match(src, /\{advanced&&phase!=='complete'&&/);
  assert.match(src, /\{advanced&&<div className="a3-footer">/);
  assert.match(src, /\{advanced&&<div className="a3-tabs" role="tablist" aria-label="Before set">/);
});

test('BW.14 the advanced switch is a device display preference, not training data', () => {
  const src = read('src/ui/advanced.ts');
  assert.match(src, /apex-advanced-workout/);
  assert.match(src, /try\{/);
  assert.doesNotMatch(src, /repository|AppState|update\(/);
});

/* ---------------------------------------------------------------- confirmation */

test('BW.15 destructive actions ask first; normal actions do not', () => {
  const train = read('src/screens/Train.tsx');
  assert.match(train, /createExtra=\(\)=>ask\(\{title:'Start an extra session\?'/);
  assert.match(train, /skipWorkout=\(w:Workout\)=>ask\(\{title:'Skip this workout\?'/);
  assert.match(train, /onClick=\{\(\)=>skipWorkout\(w\)\}/);
  const workout = read('src/screens/Workout.tsx');
  assert.match(workout, /title:'Remove this set\?'/);
  assert.match(workout, /title:'Skip this set\?'/);
  assert.match(workout, /askSkipSet\(skipCurrentSet\)/);
  // logging a set, starting a set and skipping rest stay one tap
  assert.doesNotMatch(workout, /ask\(\{title:'(Log|Start|Skip rest)/);
  assert.match(read('src/ui/dialogs.tsx'), /autoFocus onClick=\{\(\)=>setReq\(null\)\}>Cancel/, 'Cancel is the default focus');
});

/* ---------------------------------------------------------------- dead control */

test('BW.16 the Journal pill goes to the Journal and nothing in the workout is a no-op', () => {
  const workout = read('src/screens/Workout.tsx');
  assert.match(workout, /onClick=\{onJournal\}\s*>\s*Journal/);
  assert.doesNotMatch(workout, /notes:x\.notes\|\|''/, 'the old self-assignment is gone');
  assert.match(read('src/App.tsx'), /onJournal=\{\(\)=>nav\('journal'\)\}/);
});

/* ---------------------------------------------------------------- zero data */

test('BW.17 a brand-new user sees one next step on Home and no empty analytics', () => {
  const home = read('src/screens/Home.tsx');
  assert.match(home, /const firstRun=!s\.workouts\.some\(w=>w\.status==='completed'\)/);
  assert.match(home, /\{firstRun&&<article[^>]*aria-label="Your first workout"/);
  assert.match(home, /\{!firstRun&&<>\s*<div className="a3-stats">/);
  const progress = read('src/screens/Progress.tsx');
  assert.match(progress, /const zero=done\.length===0/);
  assert.match(progress, /Your progress starts with your first workout/);
  assert.match(progress, /\{!zero&&tab==='overview'&&<>/);
  const train = read('src/screens/Train.tsx');
  assert.match(train, /\(isActive\|\|doneSets>0\)&&<div className="a3-session-pct">/);
  assert.match(train, /\{completed>0&&<div className="a3-card a3-stat">/);
});

test('BW.18 analytics return once there is data (the zero-data gates are on completed sessions only)', () => {
  assert.doesNotMatch(read('src/screens/Home.tsx'), /firstRun=.*planned|firstRun=.*length===0&&/);
  assert.match(read('src/screens/Progress.tsx'), /const zero=done\.length===0/);
});

/* ---------------------------------------------------------------- internal wording */

test('BW.19 every movement pattern and load type in the catalogue has a plain label', () => {
  const shared = read('src/ui/shared.ts');
  const grab = (name) => {
    const m = shared.match(new RegExp(`const ${name}:Record<string,string>=(\\{[^}]*\\})`));
    assert.ok(m, name);
    return Function(`return (${m[1]})`)();
  };
  const patterns = grab('PATTERN_LABELS');
  const loads = grab('LOAD_TYPE_LABELS');
  const equipment = grab('EQUIPMENT_LABELS');
  for (const p of new Set(EX.map((e) => e.pattern))) {
    assert.ok(patterns[p], `pattern ${p}`);
    assert.doesNotMatch(patterns[p], /_/, p);
  }
  for (const l of new Set(EX.map((e) => e.loadSemantics))) assert.ok(loads[l], `load ${l}`);
  for (const q of new Set(EX.flatMap((e) => e.equipment))) assert.ok(equipment[q], `equipment ${q}`);
});

test('BW.20 the workout-facing screens no longer print raw identifiers or engine wording by default', () => {
  const ui = uiSource();
  assert.doesNotMatch(ui, /\{activeEx\.pattern\}|\{e\.pattern\} ·|\{ex\.pattern\.replace/, 'no raw pattern');
  assert.doesNotMatch(ui, /v\{w\.version\}|\{w\.source\} ·/, 'no internal version or source label');
  assert.doesNotMatch(ui, /'CALIBRATION'|CONTROLLED CALIBRATION|Calibration set required|Start with a controlled calibration set/);
  assert.doesNotMatch(read('src/screens/Train.tsx'), /LOAD GUIDANCE|FIRST MOVEMENT|CONFIDENCE · INITIAL(?![^]*advanced)/);
  // the calibration wording is replaced by a plain sentence; the engine text for it is shown only with the advanced switch
  const workout = read('src/screens/Workout.tsx');
  assert.ok(workout.includes("currentRecommendation?.kind==='calibration'&&<small>{displayText(currentRecommendation.reason)}"));
  assert.ok(workout.includes("{advanced&&<>") && workout.indexOf("{advanced&&<>", workout.indexOf("Why this weight")) < workout.indexOf("currentRecommendation?.kind==='calibration'&&<small>"));
  const train = read('src/screens/Train.tsx');
  assert.ok(train.indexOf("{advanced&&firstRec&&<>") > -1 && train.indexOf("{advanced&&firstRec&&<>") < train.indexOf("firstRec.kind==='calibration'&&<small>"));
});

test('BW.21 the exercise is explained on the exercise itself, from the existing knowledge data', () => {
  const guide = read('src/screens/ExerciseGuide.tsx');
  for (const f of ['ex.setup', 'ex.steps', 'ex.cues', 'ex.mistakes', 'ex.safety']) assert.ok(guide.includes(f), f);
  assert.match(guide, /How to do it/);
  const workout = read('src/screens/Workout.tsx');
  assert.match(workout, /<ExerciseGuide ex=\{activeEx\}\/>/);
  // hierarchy: guide, then today's target, then START SET
  const ready = workout.slice(workout.indexOf("{phase==='ready'&&"), workout.indexOf("{phase==='set_ready'&&"));
  assert.ok(ready.indexOf('<ExerciseGuide') < ready.indexOf("TODAY'S TARGET"));
  assert.ok(ready.indexOf("TODAY'S TARGET") < ready.indexOf('START SET'));
  // every first-workout exercise has content to show
  for (const e of EX) assert.ok(e.setup.length && e.steps.length, `${e.name} has instructions`);
});

test('BW.22 rest keeps countdown, next, Skip rest and +30 SEC and drops the timer explanation', () => {
  const src = read('src/screens/Workout.tsx');
  for (const s of ['SKIP REST', '+30 SEC', 'NEXT · ', 'role="timer"']) assert.ok(src.includes(s), s);
  assert.doesNotMatch(src, /actual elapsed timestamp/);
});

test('BW.23 primary actions keep a real touch target and accessible name', () => {
  const css = ['src/apex3-design-system.css'].filter((f) => fs.existsSync(path.join(root, f))).map(read).join('\n');
  assert.match(css, /\.a3-cta\s*\{[^}]*min-height:\s*(4\d|5\d)px/s, 'a3-cta is at least 40px tall');
  const editor = read('src/screens/SetEditor.tsx');
  assert.match(editor, /aria-label=\{set\.completed\?'Undo set':'Log set'\}/);
  assert.doesNotMatch(read('src/screens/Workout.tsx'), /onClick=\{\(\)=>setRq\(''\)\}.*role="button"/);
});
