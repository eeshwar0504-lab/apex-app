'use strict';
/*
 * P5: exercise / equipment integrity.
 * ONE compatibility rule: exerciseFitsEquipment() - no equipment needed, or bodyweight, or at least one listed piece of
 * equipment is available (exact, case-insensitive names). equipmentFit(), buildPlan() and the substitution ranking all
 * use it. ONE substitution ranking: substituteScore() / rankSubstitutes(). ONE equivalence rule: isEquivalentSubstitution().
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, EXERCISES, byId, session, threeSets, profile, addDays, DAY0 } = require('./phase1-helpers.cjs');

const KNOWN_EQUIPMENT = new Set(['machine', 'cable', 'dumbbell', 'barbell', 'bench', 'kettlebell', 'bodyweight']);
const SEMANTICS = new Set(['per_hand', 'total', 'stack', 'assistance', 'bodyweight', 'time', 'none']);
const PATTERNS = new Set(['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'squat', 'hinge', 'unilateral_squat', 'knee_flexion', 'knee_extension', 'calf', 'core', 'arm_flexion', 'arm_extension', 'shoulder_abduction']);

test('P5.5 every exercise in the catalogue is valid against its own metadata', () => {
  const ids = new Set();
  for (const ex of EXERCISES) {
    const at = ex.id;
    assert.ok(ex.id && /^[a-z0-9_]+$/.test(ex.id), `${at}: id`);
    assert.ok(!ids.has(ex.id), `${at}: duplicate id`);
    ids.add(ex.id);
    assert.ok(ex.name && ex.name.trim(), `${at}: name`);
    assert.ok(PATTERNS.has(ex.pattern), `${at}: unknown pattern ${ex.pattern}`);
    assert.ok(SEMANTICS.has(ex.loadSemantics), `${at}: unknown load semantics ${ex.loadSemantics}`);
    assert.ok(ex.equipment.length > 0 && ex.equipment.every((e) => KNOWN_EQUIPMENT.has(e)), `${at}: equipment ${ex.equipment}`);
    assert.equal(new Set(ex.equipment).size, ex.equipment.length, `${at}: duplicate equipment`);
    assert.ok(ex.primaryMuscles.length > 0, `${at}: primary muscles`);
    assert.ok(Array.isArray(ex.repRange) && ex.repRange.length === 2 && Number.isInteger(ex.repRange[0]) && Number.isInteger(ex.repRange[1]) && ex.repRange[0] >= 1 && ex.repRange[0] < ex.repRange[1] && ex.repRange[1] <= 60, `${at}: repRange ${ex.repRange}`);
    assert.ok(Number.isFinite(ex.restSec) && ex.restSec >= 15 && ex.restSec <= 300, `${at}: restSec`);
    assert.ok(Number.isFinite(ex.incrementKg) && ex.incrementKg >= 0, `${at}: incrementKg`);
    if (['stack', 'total', 'per_hand', 'assistance'].includes(ex.loadSemantics)) assert.ok(ex.incrementKg > 0, `${at}: a loaded movement needs a positive increment`);
    if (ex.loadSemantics === 'assistance') assert.ok(ex.equipment.includes('machine') || ex.equipment.includes('cable'), `${at}: assistance needs a machine`);
    if (ex.loadSemantics === 'per_hand') assert.ok(ex.equipment.includes('dumbbell') || ex.equipment.includes('kettlebell'), `${at}: per_hand needs free weights`);
    if (ex.loadSemantics === 'bodyweight' || ex.loadSemantics === 'none' || ex.loadSemantics === 'time') assert.ok(ex.equipment.includes('bodyweight'), `${at}: a no-load movement is bodyweight`);
    assert.ok(ex.cues.length > 0 && ex.setup.length > 0 && ex.steps.length > 0, `${at}: instructions`);
  }
  for (const ex of EXERCISES) {
    assert.ok(ex.alternatives.length > 0, `${ex.id}: no alternatives`);
    assert.equal(new Set(ex.alternatives).size, ex.alternatives.length, `${ex.id}: duplicate alternatives`);
    for (const id of [...ex.alternatives, ...(ex.progressions || []), ...(ex.regressions || [])]) {
      assert.ok(ids.has(id), `${ex.id}: unknown reference ${id}`);
      assert.notEqual(id, ex.id, `${ex.id}: references itself`);
    }
  }
});

test('P5.2 the one compatibility rule', () => {
  const fits = (id, eq) => T.exerciseFitsEquipment(byId(id), eq);
  assert.equal(fits('machine_chest_press', ['machine']), true);
  assert.equal(fits('machine_chest_press', ['dumbbell']), false);
  assert.equal(fits('overhead_triceps_extension', ['dumbbell']), true, 'any one listed piece of equipment is enough');
  assert.equal(fits('overhead_triceps_extension', ['cable']), true);
  assert.equal(fits('barbell_bench_press', ['bench']), true, 'bench alone satisfies "barbell + bench" under the any-of rule (the session brief confirms each item)');
  assert.equal(fits('barbell_bench_press', ['dumbbell', 'machine']), false);
  assert.equal(fits('machine_chest_press', ['MACHINE ']), true, 'case and whitespace are ignored');
  assert.equal(fits('machine_chest_press', ['mach']), false, 'no substring matching: "mach" is not "machine"');
  assert.equal(fits('barbell_bench_press', ['bar']), false, 'no substring matching: "bar" is not "barbell"');
  assert.equal(fits('dumbbell_bench_press', ['bench press']), false);
  assert.equal(fits('machine_chest_press', []), false);
});

test('P5.4 bodyweight movements are available everywhere: plan building, equipmentFit and the ranking agree', () => {
  const squat = byId('bodyweight_squat');
  for (const eq of [['machine'], ['dumbbell'], ['cable', 'barbell'], ['kettlebell']]) {
    assert.equal(T.exerciseFitsEquipment(squat, eq), true);
    assert.equal(T.equipmentFit(squat, eq), 'available', `equipmentFit with ${eq} (used to say "unavailable" while buildPlan offered it)`);
    const plan = T.buildPlan(profile({ equipment: eq }), EXERCISES, []);
    assert.ok(Object.values(plan.exerciseSets).flat().every((id) => T.exerciseFitsEquipment(byId(id), eq)));
  }
  assert.equal(T.equipmentFit(squat, []), 'available', 'no equipment listed: a bodyweight movement is still available (was "unknown", the inconsistency)');
  assert.equal(T.equipmentFit(squat, undefined), 'available');
  assert.equal(T.equipmentFit(byId('machine_chest_press'), ['dumbbell']), 'unavailable');
});

test('P5.6 equipment-limited users get a usable plan: every day has exercises and every exercise fits', () => {
  const combos = {
    'home gym (dumbbells)': ['dumbbell', 'bodyweight'],
    'dumbbells only': ['dumbbell'],
    'dumbbells + bench': ['dumbbell', 'bench'],
    'machines only': ['machine'],
    'cables only': ['cable'],
    'barbell + bench': ['barbell', 'bench'],
    'barbell only': ['barbell'],
    'kettlebell only': ['kettlebell'],
    'bench only': ['bench'],
    'bodyweight only': ['bodyweight'],
    'machines + cables': ['machine', 'cable'],
    'full gym': ['machine', 'cable', 'dumbbell', 'barbell', 'bench', 'bodyweight', 'kettlebell']
  };
  for (const [name, eq] of Object.entries(combos)) for (const days of [2, 3, 4, 5, 6]) {
    const plan = T.buildPlan(profile({ equipment: eq, trainingDays: days }), EXERCISES, []);
    for (const [setName, ids] of Object.entries(plan.exerciseSets)) {
      assert.ok(ids.length > 0, `${name} ${days}d: the ${setName} set is empty (an empty training day)`);
      assert.ok(ids.every((id) => T.exerciseFitsEquipment(byId(id), eq)), `${name}: unfit exercise in ${setName}`);
    }
    // the workouts the app creates from each day label are never empty either
    for (const d of plan.days.filter((x) => !x.rest)) {
      const list = d.label.includes('UPPER') ? plan.exerciseSets.upper : d.label.includes('LOWER') ? plan.exerciseSets.lower : plan.exerciseSets.full;
      const w = T.createWorkout(d.label, DAY0, list.slice(0, 7), EXERCISES, plan.id);
      assert.ok(w.exercises.length > 0, `${name} ${days}d ${d.label}: empty workout`);
    }
  }
});

test('P5.3 one substitution ranking: deterministic, equipment-aware, independent of catalogue order', () => {
  const src = byId('machine_chest_press');
  const home = ['dumbbell', 'bodyweight'];
  const ranked = T.rankSubstitutes(src, EXERCISES, home);
  assert.ok(ranked.length > 0);
  assert.ok(ranked.every((r) => T.equipmentFit(r.exercise, home) !== 'unavailable'), 'nothing the athlete cannot use');
  assert.ok(ranked.every((r, i) => i === 0 || ranked[i - 1].score >= r.score), 'best first');
  assert.ok(!ranked.some((r) => r.exercise.id === src.id));
  const shuffled = [...EXERCISES].reverse();
  assert.deepEqual(T.rankSubstitutes(src, shuffled, home).map((r) => r.exercise.id), ranked.map((r) => r.exercise.id), 'the catalogue storage order never changes the ranking');
  const blocked = T.rankSubstitutes(src, EXERCISES, ['machine', 'dumbbell'], ['dumbbell']);
  assert.ok(blocked.every((r) => !r.exercise.equipment.includes('dumbbell')), 'session-unavailable equipment is excluded');
  const top = T.rankSubstitutes(src, EXERCISES, ['machine'])[0];
  assert.ok(top.equivalent, 'a same-pattern, same-load-meaning machine move ranks first');
  assert.equal(T.substituteScore(src, top.exercise, ['machine']), top.score);
});

test('P5.3 smartAlternatives and the knowledge graph use the same score and the same equivalence rule', () => {
  const src = byId('machine_chest_press');
  const eq = ['machine', 'cable'];
  for (const a of T.smartAlternatives(src, EXERCISES, eq)) assert.equal(a.score, T.substituteScore(src, a.exercise, eq));
  const listed = T.smartAlternatives(src, EXERCISES, eq);
  assert.ok(listed.every((a, i) => i === 0 || listed[i - 1].score >= a.score));
  const KG = E.knowledgeGraph;
  assert.deepEqual(KG.rankedAlternatives(src, EXERCISES, eq).map((r) => r.exercise.id), T.rankSubstitutes(src, EXERCISES, eq).map((r) => r.exercise.id), 'the knowledge graph delegates to the engine ranking');
  assert.equal(KG.exerciseSimilarity(src, byId('incline_machine_press')), Math.round(T.comparisonScore(src, byId('incline_machine_press')) * 100));
  assert.ok(KG.rankedAlternatives(src, EXERCISES, eq).every((r) => r.comparable === T.isEquivalentSubstitution(src, r.exercise)));
  const similar = T.comparisonScore(src, byId('incline_machine_press'));
  assert.ok(similar > 0.4 && similar <= 1, String(similar));
});

test('P5.7 substitutions preserve valid progression semantics', () => {
  const press = byId('machine_chest_press');
  const incline = byId('incline_machine_press');
  const pull = byId('assisted_pullup');
  const lat = byId('lat_pulldown');
  // equivalence requires the same pattern, the same way of measuring load, the same rep-range width
  assert.equal(T.isEquivalentSubstitution(press, incline), true);
  assert.equal(T.isEquivalentSubstitution(pull, lat), false, 'assistance never carries over to a stack load');
  assert.equal(T.isEquivalentSubstitution(press, byId('dumbbell_bench_press')), false, 'stack vs per-hand');
  assert.equal(T.isEquivalentSubstitution(byId('leg_press'), byId('goblet_squat')), true);
  // after an equivalent swap the new exercise is prescribed from the old one's history (comparable estimate) and
  // from its own history as soon as it has any
  const history = [session(press, DAY0, threeSets(press, 30, 10))];
  const carried = T.personalizedLoad(incline, history, profile(), EXERCISES, addDays(DAY0, 2));
  assert.equal(carried.kind, 'comparable_estimate');
  assert.equal(carried.weight, 30);
  const own = [...history, session(incline, addDays(DAY0, 2), threeSets(incline, 25, 10))];
  assert.equal(T.personalizedLoad(incline, own, profile(), EXERCISES, addDays(DAY0, 4)).kind, 'baseline');
  assert.equal(T.personalizedLoad(incline, own, profile(), EXERCISES, addDays(DAY0, 4)).weight, 25);
  // a different-meaning swap starts a fresh baseline: nothing crosses over
  const crossed = T.personalizedLoad(pull, [session(lat, DAY0, threeSets(lat, 50, 10))], profile(), EXERCISES, addDays(DAY0, 2));
  assert.equal(crossed.kind, 'calibration');
});

/*
 * Bodyweight consistency. The original inconsistency: the compatibility rule treated bodyweight movements as always
 * usable, but equipmentFit() answered "unknown" for them when no equipment was listed, and the session equipment check
 * asked the athlete to confirm "bodyweight" as if it were a piece of equipment. All of it now derives from
 * usesNoEquipment() / requiredEquipment().
 */
test('P5.6 bodyweight: one answer everywhere, for every equipment list including none', () => {
  const lists = [undefined, [], ['bodyweight'], ['machine'], ['dumbbell', 'bench'], ['kettlebell']];
  for (const ex of EXERCISES.filter((e) => T.usesNoEquipment(e))) {
    assert.deepEqual(T.requiredEquipment(ex), [], `${ex.id}: needs nothing`);
    for (const list of lists) {
      assert.equal(T.equipmentFit(ex, list), 'available', `${ex.id} / ${JSON.stringify(list)}: equipmentFit`);
      assert.equal(T.exerciseFitsEquipment(ex, list || []), true, `${ex.id} / ${JSON.stringify(list)}: exerciseFitsEquipment`);
      assert.ok(T.rankSubstitutes(byId('plank'), EXERCISES, list).some((r) => r.exercise.id === ex.id || ex.id === 'plank'), `${ex.id} / ${JSON.stringify(list)}: ranking must not drop it`);
    }
  }
  for (const ex of EXERCISES) {
    const required = T.requiredEquipment(ex);
    assert.ok(!required.includes('bodyweight') && !required.includes('none'), `${ex.id}: bodyweight/none are not equipment`);
    assert.equal(required.length === 0, T.usesNoEquipment(ex), `${ex.id}: required equipment and usesNoEquipment disagree`);
  }
});

test('P5.6 bodyweight: equipment that is genuinely needed is still "unknown" with no list and "unavailable" with the wrong list', () => {
  const press = byId('machine_chest_press');
  assert.equal(T.equipmentFit(press, undefined), 'unknown');
  assert.equal(T.equipmentFit(press, []), 'unknown');
  assert.equal(T.equipmentFit(press, ['dumbbell']), 'unavailable');
  assert.equal(T.equipmentFit(press, ['machine']), 'available');
  assert.deepEqual(T.requiredEquipment(press), ['machine']);
});

test('P5.6 bodyweight: a bodyweight-only athlete gets a complete, valid plan whose every exercise they can do', () => {
  for (const equipment of [['bodyweight'], []]) {
    for (const days of [2, 3, 4, 5, 6]) {
      const p = profile({ equipment, trainingDays: days });
      const plan = T.buildPlan(p, EXERCISES, []);
      assert.equal(plan.days.filter((d) => !d.rest).length, days);
      for (const [name, ids] of Object.entries(plan.exerciseSets)) {
        assert.ok(ids.length > 0, `${name} is empty`);
        for (const id of ids) assert.equal(T.equipmentFit(byId(id), equipment), 'available', `${id} in ${name} for ${JSON.stringify(equipment)}`);
      }
      const day = plan.days.find((d) => !d.rest);
      const w = T.createWorkout('BW', DAY0, plan.exerciseSets.full, EXERCISES, plan.id);
      assert.ok(w.exercises.length > 0 && day);
      for (const we of w.exercises) assert.deepEqual(T.requiredEquipment(byId(we.exerciseId)), [], `${we.exerciseId} would ask for equipment`);
    }
  }
});
