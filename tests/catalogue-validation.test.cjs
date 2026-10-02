'use strict';
/*
 * P5: the exercise catalogue is validated as data, one assertion per rule, naming the exercise that breaks it.
 * (The metadata rules also run in equipment-integrity.test.cjs; this is the dedicated, complete check. The knowledge
 * graph validator keeps running unchanged.)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, EXERCISES } = require('./phase1-helpers.cjs');

const IDS = new Set(EXERCISES.map((e) => e.id));
const PATTERNS = new Set(['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'squat', 'hinge', 'unilateral_squat', 'knee_flexion', 'knee_extension', 'calf', 'core', 'arm_flexion', 'arm_extension', 'shoulder_abduction']);
const SEMANTICS = new Set(['per_hand', 'total', 'stack', 'assistance', 'bodyweight', 'time', 'none']);
const EQUIPMENT = new Set(['machine', 'cable', 'dumbbell', 'barbell', 'bench', 'kettlebell', 'bodyweight']);
const DIFFICULTY = new Set(['beginner', 'intermediate', 'advanced']);
const nonEmptyText = (v) => typeof v === 'string' && v.trim().length > 0;
const nonEmptyList = (v) => Array.isArray(v) && v.length > 0 && v.every(nonEmptyText);

test('catalogue: the catalogue is a non-empty list with unique, well-formed ids', () => {
  assert.ok(EXERCISES.length > 0);
  assert.equal(IDS.size, EXERCISES.length, 'duplicate exercise id');
  for (const ex of EXERCISES) assert.match(ex.id, /^[a-z0-9_]+$/, ex.id);
});

test('catalogue: required metadata is present and typed', () => {
  for (const ex of EXERCISES) {
    assert.ok(nonEmptyText(ex.name), `${ex.id}: name`);
    assert.ok(nonEmptyText(ex.family), `${ex.id}: family`);
    assert.ok(DIFFICULTY.has(ex.difficulty), `${ex.id}: difficulty ${ex.difficulty}`);
    assert.equal(typeof ex.unilateral, 'boolean', `${ex.id}: unilateral`);
    assert.ok(nonEmptyList(ex.primaryMuscles), `${ex.id}: primaryMuscles`);
    assert.ok(Array.isArray(ex.secondaryMuscles) && ex.secondaryMuscles.every(nonEmptyText), `${ex.id}: secondaryMuscles`);
    for (const field of ['cues', 'setup', 'steps']) assert.ok(nonEmptyList(ex[field]), `${ex.id}: ${field}`);
    for (const field of ['mistakes', 'safety']) assert.ok(Array.isArray(ex[field]) && ex[field].every(nonEmptyText), `${ex.id}: ${field}`);
    assert.ok(nonEmptyText(ex.breathing), `${ex.id}: breathing`);
  }
});

test('catalogue: movement pattern, equipment and load semantics are from the known vocabularies', () => {
  for (const ex of EXERCISES) {
    assert.ok(PATTERNS.has(ex.pattern), `${ex.id}: pattern ${ex.pattern}`);
    assert.ok(SEMANTICS.has(ex.loadSemantics), `${ex.id}: loadSemantics ${ex.loadSemantics}`);
    assert.ok(Array.isArray(ex.equipment) && ex.equipment.length > 0, `${ex.id}: equipment list`);
    for (const item of ex.equipment) assert.ok(EQUIPMENT.has(item), `${ex.id}: unknown equipment "${item}"`);
    assert.equal(new Set(ex.equipment).size, ex.equipment.length, `${ex.id}: duplicate equipment`);
  }
});

test('catalogue: load semantics agree with equipment and increment', () => {
  for (const ex of EXERCISES) {
    assert.ok(Number.isFinite(ex.incrementKg) && ex.incrementKg >= 0, `${ex.id}: incrementKg`);
    const loaded = ['stack', 'total', 'per_hand', 'assistance'].includes(ex.loadSemantics);
    if (loaded) assert.ok(ex.incrementKg > 0, `${ex.id}: a loaded movement needs a positive increment`);
    if (ex.loadSemantics === 'assistance') assert.ok(ex.equipment.some((i) => i === 'machine' || i === 'cable'), `${ex.id}: assistance needs a machine`);
    if (ex.loadSemantics === 'per_hand') assert.ok(ex.equipment.some((i) => i === 'dumbbell' || i === 'kettlebell'), `${ex.id}: per_hand needs free weights`);
    if (ex.loadSemantics === 'stack') assert.ok(ex.equipment.some((i) => i === 'machine' || i === 'cable'), `${ex.id}: stack needs a stack`);
    if (['bodyweight', 'none', 'time'].includes(ex.loadSemantics)) assert.ok(T.usesNoEquipment(ex), `${ex.id}: a no-load movement must not require equipment`);
  }
});

test('catalogue: rep and time semantics are valid', () => {
  for (const ex of EXERCISES) {
    const [lo, hi] = ex.repRange;
    assert.ok(Number.isInteger(lo) && Number.isInteger(hi) && lo >= 1 && lo < hi, `${ex.id}: repRange ${ex.repRange}`);
    assert.ok(hi <= (ex.loadSemantics === 'time' ? 600 : 60), `${ex.id}: repRange upper bound ${hi}`);
    assert.ok(Number.isFinite(ex.restSec) && ex.restSec >= 15 && ex.restSec <= 300, `${ex.id}: restSec`);
    if (ex.durationRangeSec !== undefined) {
      const [a, b] = ex.durationRangeSec;
      assert.ok(ex.loadSemantics === 'time', `${ex.id}: durationRangeSec on a non-timed movement`);
      assert.ok(Number.isFinite(a) && Number.isFinite(b) && a > 0 && a < b, `${ex.id}: durationRangeSec`);
    }
  }
});

test('catalogue: alternatives, progressions and regressions resolve, are unique, and never point at the exercise itself', () => {
  for (const ex of EXERCISES) {
    assert.ok(ex.alternatives.length > 0, `${ex.id}: no alternatives`);
    for (const field of ['alternatives', 'progressions', 'regressions']) {
      const list = ex[field] || [];
      assert.equal(new Set(list).size, list.length, `${ex.id}.${field}: duplicate`);
      for (const id of list) {
        assert.ok(IDS.has(id), `${ex.id}.${field}: dangling reference ${id}`);
        assert.notEqual(id, ex.id, `${ex.id}.${field}: references itself`);
      }
    }
  }
});

test('catalogue: every exercise has a usable substitute, and the ranking only ever returns catalogue exercises', () => {
  const full = ['machine', 'cable', 'dumbbell', 'barbell', 'bench', 'kettlebell', 'bodyweight'];
  for (const ex of EXERCISES) {
    const ranked = T.rankSubstitutes(ex, EXERCISES, full);
    assert.ok(ranked.length > 0, `${ex.id}: no substitute for a fully equipped athlete`);
    assert.ok(ranked.every((r) => IDS.has(r.exercise.id) && r.exercise.id !== ex.id), `${ex.id}: ranking returned an unknown or the same exercise`);
    const listed = T.smartAlternatives(ex, EXERCISES, full);
    assert.equal(listed.length, ex.alternatives.length, `${ex.id}: a listed alternative does not resolve`);
  }
});

test('catalogue: the knowledge-graph validator reports no errors', () => {
  const issues = E.knowledgeGraph.validateExerciseKnowledge(EXERCISES).filter((i) => i.severity === 'error');
  assert.deepEqual(issues, []);
});
