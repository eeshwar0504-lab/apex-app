'use strict';
/*
 * Phase 5 / Objective 28: structured safety metadata. Descriptive and conservative, separate from load and progression,
 * and never a medical claim. Missing metadata says so instead of implying safety.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, T, EXERCISES, byId, session, threeSets, profile, addDays, DAY0 } = require('./phase1-helpers.cjs');

const S = E.exerciseSafety;

test('SM1 every recorded safety note in the catalogue is valid: known kind, bounded text, no medical claim, no duplicates', () => {
  assert.deepEqual(S.validateSafetyMetadata(EXERCISES), []);
  const recorded = EXERCISES.filter((e) => (e.safetyConsiderations || []).length);
  assert.ok(recorded.length >= 5, 'the catalogue records considerations where the exercise warrants them');
  for (const ex of recorded) for (const item of ex.safetyConsiderations) {
    assert.ok(S.SAFETY_KINDS.includes(item.kind), `${ex.id}: ${item.kind}`);
    assert.ok(item.note.length > 10 && item.note.length <= S.SAFETY_LIMITS.noteMax, `${ex.id}: note length`);
    assert.ok(item.modification === undefined || item.modification.length > 5, `${ex.id}: modification`);
  }
});

test('SM2 the validator rejects medical claims, bad kinds, empty and over-long text, and duplicates (and accepts plain descriptions)', () => {
  const ex = (items, extra = {}) => [{ ...byId('plank'), safetyConsiderations: items, ...extra }];
  const bad = (items, extra) => S.validateSafetyMetadata(ex(items, extra));
  for (const note of ['This exercise will treat knee pain.', 'It can cure a bad back.', 'Helps heal a shoulder injury.', 'Use as rehab after surgery.', 'Prevents injury to your lower back.', 'Not safe for people with hypertension.', 'This is unsafe for you.', 'You have a weak core, so be careful.', 'Contraindicated for your condition.', 'We diagnose poor mobility here.']) {
    assert.ok(bad([{ kind: 'setup', note }]).length > 0, `rejected: ${note}`);
  }
  for (const note of ['Pad the bar and set the bench so neither can slide.', 'A single-leg position that asks for balance as well as strength.', 'Use a load at which the position stays controlled.']) assert.deepEqual(bad([{ kind: 'setup', note }]), [], `accepted: ${note}`);
  assert.ok(bad([{ kind: 'astrology', note: 'A fine note about the setup.' }]).some((i) => /unknown safety kind/.test(i.message)));
  assert.ok(bad([{ kind: 'setup', note: '' }]).length > 0);
  assert.ok(bad([{ kind: 'setup', note: 'x'.repeat(201) }]).length > 0);
  assert.ok(bad([{ kind: 'setup', note: 'Same note here.' }, { kind: 'setup', note: 'Same note here.' }]).some((i) => /duplicate/.test(i.message)));
  assert.ok(bad([{ kind: 'setup', note: 'A fine note about the setup.', modification: 'You should treat it with ice.' }]).length > 0, 'modifications are checked too');
  assert.ok(bad([{ kind: 'setup', note: 'A fine note about the setup.', guidance: 'Diagnose it with a professional.' }]).length > 0, 'guidance is checked too');
  assert.ok(bad([], { safety: ['This will cure you.'] }).length > 0, 'the general safety lines are checked as well');
});

test('SM3 retrieval is deterministic: same exercise, same answer, sorted by kind then note, and independent of storage order', () => {
  const ex = { ...byId('plank'), safetyConsiderations: [{ kind: 'balance', note: 'B note about balance here.' }, { kind: 'setup', note: 'Z setup note here.' }, { kind: 'setup', note: 'A setup note here.' }, { kind: 'technique_sensitive', note: 'Technique note here.' }] };
  const out = S.exerciseSafety(ex).considerations.map((c) => `${c.kind}:${c.note}`);
  assert.deepEqual(out, ['technique_sensitive:Technique note here.', 'setup:A setup note here.', 'setup:Z setup note here.', 'balance:B note about balance here.']);
  const reversed = { ...ex, safetyConsiderations: [...ex.safetyConsiderations].reverse() };
  assert.deepEqual(S.exerciseSafety(reversed).considerations, S.exerciseSafety(ex).considerations);
  for (const e of EXERCISES) assert.deepEqual(S.explainSafety(e), S.explainSafety(e));
  const before = JSON.stringify(ex);
  S.exerciseSafety(ex).considerations.pop();
  assert.equal(JSON.stringify(ex), before, 'retrieval hands out copies; the catalogue is not mutable through it');
});

test('SM4 missing metadata is handled conservatively: it says nothing is recorded, never that the exercise is safe', () => {
  const none = EXERCISES.filter((e) => !(e.safetyConsiderations || []).length);
  assert.ok(none.length > 0);
  for (const ex of none) {
    const note = S.explainSafety(ex);
    assert.deepEqual(note.lines, [S.NO_SPECIFIC_CONSIDERATIONS], ex.id);
    assert.deepEqual(note.modifications, []);
    assert.deepEqual(note.guidance, []);
    assert.equal(S.exerciseSafety(ex).recorded, false);
    assert.doesNotMatch(note.lines.join(' '), /\bsafe\b|\bno risk\b|\bharmless\b/i, ex.id);
    assert.equal(note.boundary, S.SAFETY_BOUNDARY);
  }
  const bare = { ...byId('plank') };
  delete bare.safetyConsiderations; delete bare.safety; delete bare.contraindicationNotes;
  assert.doesNotThrow(() => S.explainSafety(bare));
  assert.deepEqual(S.exerciseSafety(bare), { recorded: false, considerations: [], general: [], contraindicationNotes: [] });
});

test('SM5 what the Coach or the screen may say: modifications and optional guidance come only from the recorded data, with the boundary statement', () => {
  const rdl = S.explainSafety(byId('romanian_deadlift'));
  assert.ok(rdl.lines.length >= 1 && rdl.modifications.length >= 1);
  assert.deepEqual(rdl.guidance, ['If the hip hinge is new to you, a qualified coach can check your technique.']);
  const bench = S.explainSafety(byId('barbell_bench_press'));
  assert.deepEqual(bench.guidance, [], 'guidance appears only where the data warrants it');
  for (const ex of EXERCISES) {
    const note = S.explainSafety(ex);
    const own = [...note.lines, ...note.modifications, ...note.guidance].join(' ');
    assert.doesNotMatch(own, /\b(you have|your (injury|condition)|diagnos\w*|safe for you|unsafe for you|cure\w*)\b/i, ex.id);
    assert.doesNotMatch(note.boundary, /diagnos|is safe|is unsafe|cure/i, 'the boundary statement makes no claim either');
    assert.match(note.boundary, /does not assess medical conditions/);
    assert.match(note.boundary, /qualified professional/);
  }
});

test('SM6 safety metadata never changes training: prescriptions, progression, plans and rankings are identical with and without it', () => {
  const stripped = EXERCISES.map(({ safetyConsiderations, contraindicationNotes, ...rest }) => rest);
  const loud = EXERCISES.map((e) => ({ ...e, safetyConsiderations: [{ kind: 'setup', note: 'An invented extra note about the setup.', modification: 'Do something else.', guidance: 'Ask a qualified coach.' }], contraindicationNotes: ['An invented note.'] }));
  const press = byId('machine_chest_press');
  const history = [session(press, DAY0, threeSets(press, 20, 12)), session(press, addDays(DAY0, 3), threeSets(press, 22.5, 12))];
  const p = profile({ primaryGoal: 'hypertrophy' });
  for (const ex of EXERCISES) {
    const a = stripped.find((e) => e.id === ex.id);
    const b = loud.find((e) => e.id === ex.id);
    assert.deepEqual(T.personalizedLoad(a, history, p, stripped, addDays(DAY0, 6)), T.personalizedLoad(b, history, p, loud, addDays(DAY0, 6)), ex.id);
    for (const eq of [['machine'], ['bodyweight']]) assert.deepEqual(T.rankSubstitutes(a, stripped, eq).map((r) => [r.exercise.id, r.score]), T.rankSubstitutes(b, loud, eq).map((r) => [r.exercise.id, r.score]), `${ex.id}: ranking`);
  }
  for (const days of [3, 5]) assert.deepEqual(T.buildPlan(profile({ trainingDays: days }), stripped, []).exerciseSets, T.buildPlan(profile({ trainingDays: days }), loud, []).exerciseSets);
});

test('SM7 the deterministic engine and the Coach pipeline do not read safety metadata for decisions', () => {
  const root = path.join(__dirname, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const decisionFiles = ['src/engine/training.ts', 'src/engine/guidedSession.ts', 'src/engine/intelligence.ts', 'src/engine/analytics.ts', 'src/engine/goalProgram.ts', 'src/engine/exerciseGraph.ts'];
  for (const file of decisionFiles) assert.doesNotMatch(read(file), /safetyConsiderations|exerciseSafety|explainSafety|contraindicationNotes/, `${file} must not read safety metadata`);
  for (const file of fs.readdirSync(path.join(root, 'src/coach')).filter((f) => f.endsWith('.ts'))) assert.doesNotMatch(read('src/coach/' + file), /safetyConsiderations|exerciseSafety|explainSafety|contraindicationNotes/, `coach/${file}: safety metadata is explanatory text, not a decision input`);
});

test('SM8 the exercise screen shows the recorded notes, the modifications and the boundary statement', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src/main.tsx'), 'utf8');
  assert.match(main, /explainSafety\(ex\)/);
  assert.match(main, /note\.boundary/);
  assert.match(main, /note\.modifications/);
});
