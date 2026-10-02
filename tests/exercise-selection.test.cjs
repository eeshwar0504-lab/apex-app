'use strict';
/*
 * Phase 10: ranked exercise selection (src/engine/selection.ts) and the Catalogue 2.0 additions.
 * Selection is a deterministic lexicographic ranking over exercises that already match the pattern and fit the equipment.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, T, EXERCISES, byId, session, threeSets, set, profile, addDays, DAY0 } = require('./phase1-helpers.cjs');

const S = E.selection;
const G = E.exerciseGraph;
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const FULL = ['machine', 'cable', 'dumbbell', 'barbell', 'bench', 'bodyweight', 'kettlebell'];
const ITEMS = ['machine', 'cable', 'dumbbell', 'barbell', 'bench', 'kettlebell', 'bodyweight'];
const PATTERNS = [...new Set(EXERCISES.map((e) => e.pattern))];
const PLAN_PATTERNS = ['horizontal_push', 'vertical_pull', 'horizontal_pull', 'vertical_push', 'arm_flexion', 'arm_extension', 'shoulder_abduction', 'squat', 'hinge', 'knee_flexion', 'knee_extension', 'calf', 'core'];
const pick = (pattern, over = {}) => S.selectForPattern(pattern, EXERCISES, { equipment: FULL, experience: 'beginner', goal: 'general', ...over });
const ranked = (pattern, over = {}) => S.rankForPattern(pattern, EXERCISES, { equipment: FULL, experience: 'beginner', goal: 'general', ...over }).map((r) => r.exercise.id);
const subsets = () => Array.from({ length: 1 << ITEMS.length }, (_, mask) => ITEMS.filter((_, i) => mask & (1 << i)));
const clone = (base, over) => ({ ...structuredClone(byId(base)), alternatives: [], progressions: undefined, regressions: undefined, ...over });
const EQUIPMENT_SETS = { full: FULL, limited: ['dumbbell', 'bench', 'bodyweight', 'cable'], home: ['dumbbell', 'bodyweight'], minimal: ['bodyweight'], machine: ['machine'], dbbench: ['dumbbell', 'bench'], barbell: ['barbell'], kb: ['kettlebell'] };
const plan = (equipment, experience, goal, days = 4) => T.buildPlan(profile({ equipment, experience, primaryGoal: goal, goals: [goal], trainingDays: days }), EXERCISES, [{ kind: goal }]);

test('P10.1 the ranking order is documented, complete and in one place', () => {
  assert.deepEqual([...S.SELECTION_FACTORS], ['fit', 'suitable', 'goal', 'continuity', 'exposure', 'default', 'coverage', 'progress', 'relations', 'light', 'id']);
  const src = read('src/engine/selection.ts');
  [['1', 'fit'], ['2', 'suitable'], ['3', 'goal'], ['4', 'continuity'], ['5', 'exposure'], ['6', 'default'], ['7', 'coverage'], ['8', 'progress'], ['9', 'relations'], ['10', 'light'], ['11', 'id']]
    .forEach(([n, name]) => assert.match(src, new RegExp(` ${n}\\. ${name}\\b`), `factor ${n} ${name} documented in order`));
  assert.doesNotMatch(src, /Math\.random|Date\.now|new Date\(|localStorage/, 'no randomness, clock or storage');
});

test('P10.1 selection never leaves the requested movement pattern, for every equipment subset', () => {
  for (const equipment of subsets()) for (const pattern of PLAN_PATTERNS) {
    const list = S.rankForPattern(pattern, EXERCISES, { equipment, experience: 'beginner', goal: 'general' });
    for (const r of list) assert.equal(r.exercise.pattern, pattern, `${equipment}: ${pattern} ranked ${r.exercise.id}`);
  }
  assert.equal(pick('not_a_pattern'), undefined);
});

test('P10.1 there is no cross-pattern fallback: nothing that fits means no pick, never a different movement', () => {
  assert.equal(pick('vertical_pull', { equipment: ['bodyweight'] }), undefined);
  assert.equal(pick('shoulder_abduction', { equipment: ['machine'] }), undefined, 'no raise fits a machine-only athlete, and nothing else is offered in its place');
  const p = plan(['bodyweight'], 'beginner', 'general');
  const patterns = new Set(Object.values(p.exerciseSets).flat().map((id) => byId(id).pattern));
  assert.ok(!patterns.has('vertical_pull') && !patterns.has('horizontal_pull'), 'no pulling pattern appears without anything to pull');
});

test('P10.2 unavailable equipment is never selected or ranked, for every equipment subset and pattern', () => {
  const fits = G.exerciseFitsEquipment;
  for (const equipment of subsets()) for (const pattern of PLAN_PATTERNS) for (const experience of ['beginner', 'advanced']) {
    for (const id of ranked(pattern, { equipment, experience })) assert.ok(fits(byId(id), equipment), `${equipment.join('+') || 'none'}: ${id}`);
  }
});

test('P10.2 metamorphic: adding exercises the athlete cannot use never changes the selection, however attractive they are', () => {
  // copies of every catalogue exercise that need only a barbell, with ids that sort before every real id
  const extras = EXERCISES.map((e) => clone(e.id, { id: `aaa_${e.id}`, equipment: ['barbell'], difficulty: 'beginner', secondaryMuscles: [...e.secondaryMuscles, 'extra'], loadSemantics: 'total' }));
  const withExtras = [...extras, ...EXERCISES];
  for (const equipment of subsets().filter((s) => !s.includes('barbell'))) for (const pattern of PLAN_PATTERNS) for (const goal of ['general', 'strength']) {
    const ctx = { equipment, experience: 'beginner', goal };
    assert.equal(S.selectForPattern(pattern, withExtras, ctx)?.id, S.selectForPattern(pattern, EXERCISES, ctx)?.id, `${equipment.join('+') || 'none'} / ${pattern} / ${goal}`);
  }
  // the same holds for whole plans
  for (const equipment of [['machine'], ['dumbbell', 'bench'], ['bodyweight']]) {
    const p = profile({ equipment });
    assert.deepEqual(T.buildPlan(p, withExtras, []).exerciseSets, T.buildPlan(p, EXERCISES, []).exerciseSets, equipment.join('+'));
  }
});

test('P10.2 metamorphic: catalogue storage order and equipment spelling never change the result', () => {
  const reversed = [...EXERCISES].reverse();
  const rotated = [...EXERCISES.slice(17), ...EXERCISES.slice(0, 17)];
  for (const equipment of [FULL, EQUIPMENT_SETS.home, EQUIPMENT_SETS.minimal, EQUIPMENT_SETS.machine]) for (const pattern of PLAN_PATTERNS) {
    const base = S.rankForPattern(pattern, EXERCISES, { equipment, experience: 'beginner', goal: 'strength' }).map((r) => r.exercise.id);
    for (const order of [reversed, rotated]) assert.deepEqual(S.rankForPattern(pattern, order, { equipment, experience: 'beginner', goal: 'strength' }).map((r) => r.exercise.id), base, `${pattern}`);
    assert.deepEqual(ranked(pattern, { equipment: equipment.map((x) => x.toUpperCase()), goal: 'strength' }), base, 'equipment names are case-insensitive');
  }
});

test('P10.3 determinism: the same inputs give the same ranking, and nothing is mutated', () => {
  const before = JSON.stringify(EXERCISES);
  const ctx = { equipment: FULL, experience: 'intermediate', goal: 'hypertrophy', history: [], incumbents: [], covered: ['chest'] };
  const first = JSON.stringify(S.rankForPattern('horizontal_push', EXERCISES, ctx));
  for (let i = 0; i < 20; i++) assert.equal(JSON.stringify(S.rankForPattern('horizontal_push', EXERCISES, ctx)), first);
  assert.equal(JSON.stringify(EXERCISES), before);
  const p = profile({ equipment: FULL });
  const a = JSON.stringify(T.buildPlan(p, EXERCISES, []).exerciseSets);
  for (let i = 0; i < 10; i++) assert.equal(JSON.stringify(T.buildPlan(p, EXERCISES, []).exerciseSets), a);
});

test('P10.4 stable id tie-break: identical candidates rank by id, in every input order', () => {
  const triplet = ['zz', 'mm', 'aa'].map((id) => clone('machine_chest_press', { id: `tie_${id}`, name: id }));
  const perms = [[0, 1, 2], [2, 1, 0], [1, 2, 0], [1, 0, 2]];
  for (const perm of perms) {
    const list = perm.map((i) => triplet[i]);
    const order = S.rankForPattern('horizontal_push', list, { equipment: FULL, experience: 'beginner', goal: 'general' }).map((r) => r.exercise.id);
    assert.deepEqual(order, ['tie_aa', 'tie_mm', 'tie_zz']);
  }
  assert.equal(S.selectForPattern('horizontal_push', triplet, { equipment: FULL }).id, 'tie_aa');
});

test('P10.4 fewer required pieces of equipment wins a tie, before the id decides', () => {
  const heavy = clone('goblet_squat', { id: 'light_a_heavy', equipment: ['dumbbell', 'kettlebell', 'bench'] });
  const light = clone('goblet_squat', { id: 'light_z_light', equipment: ['dumbbell'] });
  const order = S.rankForPattern('squat', [heavy, light], { equipment: FULL, experience: 'beginner', goal: 'general' }).map((r) => r.exercise.id);
  assert.deepEqual(order, ['light_z_light', 'light_a_heavy'], 'one piece beats three even though the id sorts later');
  const bodyweight = clone('goblet_squat', { id: 'light_b_none', loadSemantics: 'total', equipment: ['bodyweight'] });
  assert.equal(S.selectForPattern('squat', [heavy, light, bodyweight], { equipment: FULL }).id, 'light_b_none', 'needing nothing is lightest');
});

test('P10.5 equipment fit ranks first: a usable exercise beats an equally good one that needs unconfirmed equipment', () => {
  // with no equipment listed, bodyweight movements are 'available' and everything else is 'unknown'
  const only = S.rankForPattern('squat', EXERCISES, { equipment: [], experience: 'advanced', goal: 'general' }).map((r) => r.exercise.id);
  assert.deepEqual(only, ['bodyweight_squat'], 'with nothing listed only a no-equipment movement fits at all');
  const usable = ranked('calf', { equipment: ['dumbbell'] });
  assert.ok(!usable.includes('calf_raise_machine'), 'a machine movement does not rank for a dumbbell-only athlete');
});

test('P10.6 suitability: a beginner is given a beginner-level option over an intermediate one, an intermediate athlete is not', () => {
  assert.notEqual(pick('hinge', { experience: 'beginner' }).id, 'romanian_deadlift');
  assert.equal(byId(pick('hinge', { experience: 'beginner' }).id).difficulty, 'beginner');
  assert.equal(pick('hinge', { experience: 'intermediate' }).id, 'romanian_deadlift');
  assert.equal(pick('horizontal_push', { equipment: ['barbell', 'bench'], experience: 'beginner' }).id, 'dumbbell_bench_press', 'a beginner with a bench does not get a barbell bench press by default');
  assert.equal(pick('horizontal_push', { equipment: ['barbell'], experience: 'beginner' }).id, 'push_up', 'with only a barbell the beginner still gets a beginner-level press');
  assert.equal(pick('horizontal_pull', { equipment: ['barbell'], experience: 'beginner' }).id, 'barbell_row', 'when the only option is intermediate it is still chosen: suitability ranks, it does not filter');
  assert.equal(pick('squat', { equipment: ['barbell'], experience: 'intermediate' }).id, 'barbell_back_squat');
  assert.equal(pick('squat', { equipment: ['barbell'], experience: 'beginner' }).id, 'bodyweight_squat');
});

test('P10.7 goal compatibility: strength and hypertrophy prefer a measurable load, other goals are neutral; the goal outranks continuity', () => {
  const bodyweight = clone('goblet_squat', { id: 'g_bodyweight', loadSemantics: 'bodyweight', equipment: ['bodyweight'], incrementKg: 0 });
  const loaded = clone('goblet_squat', { id: 'g_loaded' });
  const list = [bodyweight, loaded];
  const top = (goal, incumbents) => S.selectForPattern('squat', list, { equipment: FULL, goal, incumbents }).id;
  assert.equal(top('strength', ['g_bodyweight']), 'g_loaded', 'strength: the loadable movement beats the bodyweight incumbent');
  assert.equal(top('hypertrophy', ['g_bodyweight']), 'g_loaded');
  assert.equal(top('general', ['g_bodyweight']), 'g_bodyweight', 'general: neutral, so the incumbent holds');
  assert.equal(top('fat_loss', ['g_bodyweight']), 'g_bodyweight');
  assert.equal(top('fitness', ['g_bodyweight']), 'g_bodyweight');
  // on the real catalogue the goal reaches the plan, and only through that one factor
  assert.equal(plan(FULL, 'intermediate', 'strength').exerciseSets.lower.at(-1), 'pallof_press');
  assert.equal(plan(FULL, 'intermediate', 'general').exerciseSets.lower.at(-1), 'plank');
});

test('P10.8 muscle coverage: an exercise that adds a new primary muscle beats one that repeats a covered muscle', () => {
  const repeat = clone('dumbbell_bicep_curl', { id: 'cov_a_repeat', primaryMuscles: ['biceps'] });
  const fresh = clone('dumbbell_bicep_curl', { id: 'cov_z_fresh', primaryMuscles: ['forearms'] });
  const ctx = { equipment: FULL, experience: 'beginner', goal: 'general' };
  assert.equal(S.selectForPattern('arm_flexion', [repeat, fresh], { ...ctx, covered: [] }).id, 'cov_a_repeat', 'nothing covered: the id decides');
  assert.equal(S.selectForPattern('arm_flexion', [repeat, fresh], { ...ctx, covered: ['biceps'] }).id, 'cov_z_fresh', 'biceps already covered: the new muscle wins');
  // in a real plan: after the squat covers quads and glutes, an intermediate hinge is the one that adds hamstrings
  assert.equal(plan(FULL, 'intermediate', 'general').exerciseSets.lower[1], 'romanian_deadlift');
  assert.equal(plan(FULL, 'beginner', 'general').exerciseSets.lower[1], 'kettlebell_deadlift', 'beginner: a beginner hinge that still adds hamstrings');
  assert.ok(!plan(FULL, 'beginner', 'general').exerciseSets.lower.includes('hip_thrust'), 'hip thrust repeats the glutes the squat covered');
});

test('P10.9 continuity: an incumbent keeps its place, and an alternative to an incumbent beats an unrelated exercise', () => {
  assert.equal(pick('arm_flexion', { incumbents: ['hammer_curl'] }).id, 'hammer_curl');
  assert.equal(pick('arm_flexion', { incumbents: ['cable_curl'] }).id, 'cable_curl', 'the plan wins over the catalogue default');
  assert.equal(pick('arm_flexion', { incumbents: [] }).id, 'dumbbell_bicep_curl', 'no incumbent: the catalogue default');
  const unrelated = clone('dumbbell_bicep_curl', { id: 'cont_a_unrelated' });
  const related = clone('dumbbell_bicep_curl', { id: 'cont_z_related', alternatives: ['cont_incumbent'] });
  const incumbent = clone('hammer_curl', { id: 'cont_incumbent', pattern: 'arm_flexion', equipment: ['cable'] });
  assert.equal(S.selectForPattern('arm_flexion', [unrelated, related, incumbent], { equipment: ['dumbbell'], incumbents: ['cont_incumbent'] }).id, 'cont_z_related');
});

test('P10.10 prior exposure: an exercise the athlete has trained outranks the catalogue default, but not a plan incumbent', () => {
  const curl = byId('cable_curl');
  const done = [0, 3, 6].map((d) => session(curl, addDays(DAY0, d), threeSets(curl, 20, 10)));
  assert.equal(pick('arm_flexion', { history: done }).id, 'cable_curl');
  assert.equal(pick('arm_flexion', { history: done, incumbents: ['hammer_curl'] }).id, 'hammer_curl', 'continuity outranks exposure');
  const warmupOnly = [session(curl, DAY0, [set(curl, 5, 10, 2, { type: 'warmup' })])];
  assert.equal(pick('arm_flexion', { history: warmupOnly }).id, 'dumbbell_bicep_curl', 'warm-up sets are not exposure');
  const planned = [{ ...session(curl, DAY0, threeSets(curl, 20, 10)), status: 'planned' }];
  assert.equal(pick('arm_flexion', { history: planned }).id, 'dumbbell_bicep_curl', 'only completed workouts count');
  const more = [0, 3].map((d) => session(byId('hammer_curl'), addDays(DAY0, d), threeSets(byId('hammer_curl'), 10, 10)));
  assert.equal(pick('arm_flexion', { history: [...done, ...more] }).id, 'cable_curl', 'more exposure wins');
});

test('P10.11 the catalogue default for each plan pattern exists, matches its pattern, and wins when nothing else decides', () => {
  assert.deepEqual(Object.keys(S.ESTABLISHED_DEFAULTS).sort(), [...PLAN_PATTERNS].sort());
  for (const [pattern, id] of Object.entries(S.ESTABLISHED_DEFAULTS)) {
    assert.ok(byId(id), id);
    assert.equal(byId(id).pattern, pattern, id);
  }
  // full equipment, intermediate, general: every default that is still the best fit is chosen, so plans did not churn
  const p = plan(FULL, 'intermediate', 'general');
  assert.deepEqual(p.exerciseSets.upper, ['machine_chest_press', 'lat_pulldown', 'seated_cable_row', 'dumbbell_shoulder_press', 'dumbbell_bicep_curl', 'cable_triceps_pushdown', 'dumbbell_lateral_raise']);
  assert.deepEqual(p.exerciseSets.lower, ['leg_press', 'romanian_deadlift', 'leg_curl_machine', 'leg_extension', 'calf_raise_machine', 'plank'], 'identical to the plan before ranking existed');
});

test('P10.12 harder and easier variations never influence selection: only alternatives count as catalogue relations', () => {
  const stripped = EXERCISES.map(({ progressions, regressions, ...rest }) => ({ ...rest }));
  for (const equipment of subsets()) for (const pattern of PLAN_PATTERNS) for (const experience of ['beginner', 'intermediate']) {
    const ctx = { equipment, experience, goal: 'general' };
    assert.equal(S.selectForPattern(pattern, stripped, ctx)?.id, S.selectForPattern(pattern, EXERCISES, ctx)?.id, `${equipment.join('+')} ${pattern}`);
  }
});

test('P10.13 recovery and fatigue are not inputs: selection imports nothing about them and plans ignore the recovery log', () => {
  const src = read('src/engine/selection.ts');
  assert.doesNotMatch(src, /from '\.\/(recovery|intelligence|analytics)'/);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ''); // the header explains why; the code must not use them
  assert.doesNotMatch(code, /recoveryLog|workloadFatigue|readiness|recovery/i);
  const buildPlan = read('src/engine/training.ts').match(/export function buildPlan\([\s\S]*?\r?\n\}\r?\n/)[0]; // CRLF checkouts (Windows) end lines with \r\n
  assert.doesNotMatch(buildPlan, /recoveryLog|workloadFatigue|readiness/);
});

test('P10.14 golden plans: selection per profile is exactly the reviewed result (a change here is a deliberate change)', () => {
  const golden = JSON.parse(read('tests/golden/plans.json'));
  const names = Object.keys(golden).filter((k) => !k.startsWith('_'));
  assert.ok(names.length >= 12);
  for (const key of names) {
    const [eq, experience, goal] = key.split('/');
    assert.deepEqual(plan(EQUIPMENT_SETS[eq], experience, goal).exerciseSets, golden[key], key);
  }
});

test('P10.15 the intended selection changes are exactly these, each explained by a stated rule', () => {
  // beginners are not defaulted to the intermediate Romanian deadlift when a beginner hinge exists
  assert.ok(!plan(FULL, 'beginner', 'general').exerciseSets.lower.includes('romanian_deadlift'));
  // a bench without a barbell no longer yields a barbell bench press (the one equipment rule matches any listed piece)
  assert.ok(!plan(EQUIPMENT_SETS.dbbench, 'beginner', 'general').exerciseSets.upper.includes('barbell_bench_press'));
  // home athletes with dumbbells get a row that needs only a dumbbell, and a beginner hinge instead of the intermediate one
  const home = plan(EQUIPMENT_SETS.home, 'beginner', 'general').exerciseSets;
  assert.ok(home.upper.includes('one_arm_dumbbell_row') && !home.upper.includes('chest_supported_row'));
  assert.ok(home.lower.includes('glute_bridge') && !home.lower.includes('romanian_deadlift'));
  // a loadable movement still beats a bodyweight one (progress): the dumbbell press stays ahead of the push-up
  assert.ok(home.upper.includes('dumbbell_bench_press') && !home.upper.includes('push_up'));
  // bodyweight-only athletes get a pressing and a hinging movement and a session set of at least three exercises
  const minimal = plan(EQUIPMENT_SETS.minimal, 'beginner', 'general').exerciseSets;
  assert.ok(minimal.upper.includes('push_up') && minimal.lower.includes('glute_bridge'));
  for (const set of Object.values(minimal)) assert.ok(set.length >= 3);
});

test('P10.16 a session set never shrinks below three exercises: too few movements falls back to the full-body set', () => {
  for (const [name, equipment] of Object.entries(EQUIPMENT_SETS)) for (const experience of ['beginner', 'intermediate']) {
    const sets = plan(equipment, experience, 'general').exerciseSets;
    for (const [which, ids] of Object.entries(sets)) assert.ok(ids.length >= 3, `${name}/${experience}: ${which} has ${ids.length}`);
  }
});

/* ------------------------------------------------------------------------------------------------------------- */
/* Catalogue 2.0                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------- */
const NEW = {
  one_arm_dumbbell_row: { pattern: 'horizontal_pull', difficulty: 'beginner', equipment: ['dumbbell'] },
  barbell_row: { pattern: 'horizontal_pull', difficulty: 'intermediate', equipment: ['barbell'] },
  push_up: { pattern: 'horizontal_push', difficulty: 'beginner', equipment: ['bodyweight'] },
  overhead_barbell_press: { pattern: 'vertical_push', difficulty: 'intermediate', equipment: ['barbell'] },
  barbell_back_squat: { pattern: 'squat', difficulty: 'intermediate', equipment: ['barbell'] },
  reverse_lunge: { pattern: 'unilateral_squat', difficulty: 'beginner', equipment: ['bodyweight', 'dumbbell'] },
  glute_bridge: { pattern: 'hinge', difficulty: 'beginner', equipment: ['bodyweight'] },
  kettlebell_deadlift: { pattern: 'hinge', difficulty: 'beginner', equipment: ['kettlebell'] },
  barbell_deadlift: { pattern: 'hinge', difficulty: 'intermediate', equipment: ['barbell'] },
  pallof_press: { pattern: 'core', difficulty: 'beginner', equipment: ['cable'] },
};

test('P10.17 the catalogue grew from 35 to 45 exercises, and every addition is the documented one', () => {
  assert.equal(EXERCISES.length, 45);
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, 45);
  for (const [id, want] of Object.entries(NEW)) {
    const ex = byId(id);
    assert.ok(ex, id);
    assert.equal(ex.pattern, want.pattern, `${id} pattern`);
    assert.equal(ex.difficulty, want.difficulty, `${id} difficulty`);
    assert.deepEqual(ex.equipment, want.equipment, `${id} equipment`);
  }
});

test('P10.17 every addition carries the full required metadata', () => {
  const text = (v) => typeof v === 'string' && v.trim().length > 0;
  for (const id of Object.keys(NEW)) {
    const ex = byId(id);
    assert.match(ex.id, /^[a-z0-9_]+$/);
    assert.ok(text(ex.name) && text(ex.family) && text(ex.breathing) && text(ex.loadDescription), `${id}: text fields`);
    assert.ok(ex.aliases.length >= 1 && ex.aliases.every(text), `${id}: aliases`);
    assert.ok(ex.primaryMuscles.length >= 1 && ex.primaryMuscles.every(text), `${id}: primary muscles`);
    assert.ok(Array.isArray(ex.secondaryMuscles) && ex.secondaryMuscles.length >= 1, `${id}: secondary muscles`);
    for (const f of ['cues', 'steps', 'mistakes']) assert.ok(ex[f].length >= 2 && ex[f].every(text), `${id}: ${f} is specific, not the generic default`);
    assert.ok(ex.setup.length >= 1 && ex.setup.every(text) && !ex.setup.includes('Adjust the equipment for a stable position'), `${id}: setup is specific, not the generic default`);
    assert.ok(!ex.steps.includes('Brace') || ex.steps.length >= 3, `${id}: steps`);
    assert.ok(ex.alternatives.length >= 2 && ex.alternatives.every((a) => byId(a)), `${id}: alternatives resolve`);
    assert.ok(['beginner', 'intermediate'].includes(ex.difficulty), `${id}: beginner/intermediate only`);
    const [lo, hi] = ex.repRange;
    assert.ok(lo >= 1 && lo < hi && hi <= 60 && ex.restSec >= 15 && ex.restSec <= 300, `${id}: rep and rest ranges`);
    assert.notDeepEqual(ex.cues, ['Use a controlled, repeatable range'], `${id}: cues are not the generic default`);
  }
});

test('P10.17 intermediate and technique-sensitive additions have safety metadata; none makes a medical claim', () => {
  for (const [id, want] of Object.entries(NEW)) {
    const ex = byId(id);
    if (want.difficulty === 'intermediate') assert.ok((ex.safetyConsiderations || []).length >= 1, `${id}: intermediate lift needs safety notes`);
  }
  for (const id of ['barbell_back_squat', 'barbell_deadlift', 'barbell_row', 'overhead_barbell_press', 'kettlebell_deadlift']) {
    assert.ok(byId(id).safetyConsiderations.some((s) => ['technique_sensitive', 'load_control'].includes(s.kind)), id);
  }
  assert.ok(byId('reverse_lunge').safetyConsiderations.some((s) => s.kind === 'balance'));
  assert.ok(byId('barbell_back_squat').safetyConsiderations.some((s) => s.kind === 'setup'));
  assert.deepEqual(E.exerciseSafety.validateSafetyMetadata(EXERCISES), [], 'no medical claim, no overlong note, no duplicate');
  for (const ex of EXERCISES) assert.equal(ex.contraindicationNotes, undefined, `${ex.id}: no contraindication claims were invented`);
});

test('P10.18 the graph and every validator stay clean with the new exercises', () => {
  assert.deepEqual(E.knowledgeGraph.validateExerciseKnowledge(EXERCISES), []);
  assert.deepEqual(G.exerciseGraph(EXERCISES).issues, []);
  assert.equal(E.knowledgeGraph.knowledgeReport({ exercises: EXERCISES }).healthy, true);
});

test('P10.18 progression links are only the justified ones, and regressions are derived from them', () => {
  const pairs = G.exerciseGraph(EXERCISES).edges.filter((e) => e.kind === 'progression').map((e) => `${e.from}>${e.to}`).sort();
  assert.equal(pairs.length, 12, 'seven earlier links and five new ones');
  for (const added of ['chest_supported_row>barbell_row', 'goblet_squat>barbell_back_squat', 'dumbbell_shoulder_press>overhead_barbell_press', 'glute_bridge>hip_thrust', 'kettlebell_deadlift>barbell_deadlift']) assert.ok(pairs.includes(added), added);
  const graph = G.exerciseGraph(EXERCISES);
  assert.deepEqual(graph.regressionsOf('barbell_row').map((e) => e.id), ['chest_supported_row']);
  assert.deepEqual(graph.regressionsOf('barbell_deadlift').map((e) => e.id), ['kettlebell_deadlift']);
  assert.deepEqual(graph.regressionsOf('hip_thrust').map((e) => e.id), ['glute_bridge']);
  // every link keeps the movement pattern and never lowers the difficulty
  const order = { beginner: 0, intermediate: 1, advanced: 2 };
  for (const p of pairs) {
    const [a, b] = p.split('>');
    assert.equal(byId(a).pattern, byId(b).pattern, p);
    assert.ok(order[byId(b).difficulty] >= order[byId(a).difficulty], p);
  }
  // no progression was added to the exercises whose harder variation the catalogue cannot state
  for (const id of ['push_up', 'one_arm_dumbbell_row', 'reverse_lunge', 'pallof_press', 'barbell_back_squat', 'barbell_row', 'overhead_barbell_press']) assert.equal(byId(id).progressions, undefined, id);
});

test('P10.18 the new exercises are connected, similar and comparable to what they relate to', () => {
  const graph = G.exerciseGraph(EXERCISES);
  for (const id of Object.keys(NEW)) {
    assert.ok(graph.alternativesOf(id).length >= 2, `${id}: alternatives in the graph`);
    assert.ok(graph.structuralRelations(id).some((r) => r.kinds.includes('same_pattern')), `${id}: structurally related to its pattern`);
  }
  assert.ok(G.comparisonScore(byId('barbell_row'), byId('seated_cable_row')) >= 0.5, 'a row is comparable to a row');
  assert.ok(G.comparisonScore(byId('push_up'), byId('machine_chest_press')) >= 0.5);
  assert.ok(G.comparisonScore(byId('barbell_back_squat'), byId('goblet_squat')) >= 0.5);
  assert.ok(G.comparisonScore(byId('pallof_press'), byId('bird_dog')) >= 0.5, 'both are anti-rotation core work');
  assert.ok(byId('barbell_row').primaryMuscles.some((m) => byId('seated_cable_row').primaryMuscles.includes(m)), 'muscle overlap');
  assert.ok(G.comparisonScore(byId('barbell_row'), byId('barbell_back_squat')) < 0.5, 'unrelated movements are not comparable');
});

test('P10.19 substitution keeps its contract with the new exercises: equipment filtered, same ranking rule, ties by id', () => {
  for (const equipment of [['barbell'], ['dumbbell'], ['bodyweight'], undefined]) for (const id of Object.keys(NEW)) {
    const a = T.rankSubstitutes(byId(id), EXERCISES, equipment).map((r) => r.exercise.id);
    const b = T.rankSubstitutes(byId(id), [...EXERCISES].reverse(), equipment).map((r) => r.exercise.id);
    assert.deepEqual(a, b, `${id} / ${equipment}`);
    if (equipment) for (const r of T.rankSubstitutes(byId(id), EXERCISES, equipment)) assert.ok(G.exerciseFitsEquipment(r.exercise, equipment), `${id}: ${r.exercise.id}`);
  }
  assert.ok(T.rankSubstitutes(byId('chest_supported_row'), EXERCISES, ['barbell']).some((r) => r.exercise.id === 'barbell_row'));
  assert.ok(T.rankSubstitutes(byId('hip_thrust'), EXERCISES, ['bodyweight']).some((r) => r.exercise.id === 'glute_bridge'));
  assert.equal(T.rankSubstitutes(byId('barbell_row'), EXERCISES, ['dumbbell'])[0].exercise.pattern, 'horizontal_pull', 'a dumbbell athlete swapping a barbell row is offered a row first');
});

test('P10.19 nothing swaps an exercise during a workout: selection is used only to build a plan', () => {
  for (const f of ['src/engine/guidedSession.ts', 'src/engine/workoutEdit.ts', 'src/engine/rolling.ts']) {
    const src = read(f);
    assert.doesNotMatch(src, /from '\.\/selection'|selectForPattern|rankForPattern/, f);
  }
  const training = read('src/engine/training.ts');
  assert.equal((training.match(/selectForPattern\(/g) || []).length, 1, 'one call site, inside buildPlan');
  assert.doesNotMatch(training, /function chooseByPattern/, 'the first-match selection is gone');
});

test('P10.20 rolling generation uses the ranked selection, both from the stored plan and when the plan has none', () => {
  const R = E.rolling;
  const today = '2026-03-02';
  const noon = new Date(2026, 2, 2, 12, 0).toISOString();
  const state = (equipment, withSets) => {
    const prof = profile({ equipment, trainingDays: 4, primaryGoal: 'general', goals: ['general'] });
    const exercises = E.goalProgram.programExercises(EXERCISES, 'general');
    const built = T.buildPlan(prof, exercises, [{ kind: 'general' }]);
    const p = { id: 'plan-sel', name: built.name, mode: 'continuous', days: built.days, version: 1, createdAt: noon, updatedAt: noon, ...(withSets ? { exerciseSets: built.exerciseSets } : {}) };
    return { state: { onboardingComplete: true, profile: prof, plan: p, workouts: [], exercises, goals: [], preferences: {}, eventLog: [] }, built };
  };
  for (const withSets of [true, false]) {
    const { state: s, built } = state(EQUIPMENT_SETS.home, withSets);
    const out = R.maintainTrainingHorizon(s, { today, now: `${today}T12:00:00.000Z` });
    const used = new Set(out.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)));
    assert.ok(used.has('one_arm_dumbbell_row') && used.has('glute_bridge'), `withSets=${withSets}: the ranked picks are generated`);
    assert.ok(!used.has('chest_supported_row') && !used.has('romanian_deadlift'), `withSets=${withSets}: not the old first-match picks`);
    for (const w of out.workouts) {
      const key = w.name.includes('UPPER') ? 'upper' : w.name.includes('LOWER') ? 'lower' : 'full';
      assert.deepEqual(w.exercises.map((e) => e.exerciseId), built.exerciseSets[key].slice(0, 7), `${w.name}: exactly the ranked selection for its day type`);
    }
  }
});
