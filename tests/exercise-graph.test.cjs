'use strict';
/*
 * Phase 5 / Objectives 26, 27 and 29: the exercise graph (one graph, src/engine/exerciseGraph.ts), exercise
 * progressions and regressions (variations, not load progression), and the one similarity / ranking mechanism.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, EXERCISES, byId, session, threeSets, profile, addDays, DAY0 } = require('./phase1-helpers.cjs');

const G = E.exerciseGraph;
const K = E.knowledgeGraph;
const clone = () => EXERCISES.map((e) => JSON.parse(JSON.stringify(e)));
const withEdges = (list, id, patch) => list.map((e) => (e.id === id ? { ...e, ...patch } : e));
const shuffle = (list, seed) => { const out = [...list]; let s = seed; for (let i = out.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7fffffff; const j = s % (i + 1); [out[i], out[j]] = [out[j], out[i]]; } return out; };
const FULL = ['machine', 'cable', 'dumbbell', 'barbell', 'bench', 'kettlebell', 'bodyweight'];

/* ---------------------------------------------------------------- 26: the graph ---------------------------------- */

test('EG1 the catalogue graph is valid: no rejected edge, no issue, and it is built once per catalogue', () => {
  const graph = G.exerciseGraph(EXERCISES);
  assert.deepEqual(graph.issues, []);
  assert.equal(G.exerciseGraph(EXERCISES), graph, 'memoised: the same catalogue gives the same graph object');
  assert.ok(graph.edges.length > 0);
  const ids = new Set(EXERCISES.map((e) => e.id));
  for (const edge of graph.edges) {
    assert.ok(ids.has(edge.from) && ids.has(edge.to), `${edge.from} -> ${edge.to}`);
    assert.notEqual(edge.from, edge.to, 'no self link');
  }
  const keys = graph.edges.map((e) => `${e.from}|${e.kind}|${e.to}`);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate edge');
});

test('EG2 lookup is deterministic: the same answers in any catalogue order, repeated calls and fresh builds', () => {
  const base = G.buildExerciseGraph(EXERCISES);
  for (const seed of [1, 7, 42, 999]) {
    const other = G.buildExerciseGraph(shuffle(EXERCISES, seed));
    assert.deepEqual(other.edges, base.edges, `edges (order ${seed})`);
    assert.deepEqual(other.issues, base.issues);
    for (const ex of EXERCISES) {
      for (const method of ['alternativesOf', 'progressionsOf', 'regressionsOf']) assert.deepEqual(other[method](ex.id).map((e) => e.id), base[method](ex.id).map((e) => e.id), `${method} ${ex.id}`);
      assert.deepEqual(other.structuralRelations(ex.id).map((r) => [r.exercise.id, r.kinds]), base.structuralRelations(ex.id).map((r) => [r.exercise.id, r.kinds]));
    }
  }
  const sorted = (list) => list.every((e, i, a) => i === 0 || a[i - 1].id <= e.id);
  for (const ex of EXERCISES) assert.ok(sorted(base.alternativesOf(ex.id)) && sorted(base.progressionsOf(ex.id)) && sorted(base.regressionsOf(ex.id)), `${ex.id}: sorted by id`);
});

test('EG3 invalid references cannot enter the graph: unknown ids, self links and repeats are rejected and reported', () => {
  const bad = withEdges(withEdges(withEdges(clone(), 'machine_chest_press', { alternatives: ['incline_machine_press', 'no_such_exercise', 'machine_chest_press', 'incline_machine_press'] }), 'leg_press', { progressions: ['ghost'] }), 'lat_pulldown', { regressions: ['lat_pulldown'] });
  const graph = G.buildExerciseGraph(bad);
  const messages = graph.issues.map((i) => `${i.exerciseId}: ${i.message}`).join('\n');
  assert.match(messages, /machine_chest_press: alternatives points at unknown exercise: no_such_exercise/);
  assert.match(messages, /machine_chest_press: alternatives lists the exercise itself/);
  assert.match(messages, /machine_chest_press: alternatives lists incline_machine_press more than once/);
  assert.match(messages, /leg_press: progressions points at unknown exercise: ghost/);
  assert.match(messages, /lat_pulldown: regressions lists the exercise itself/);
  assert.ok(!graph.edges.some((e) => e.to === 'no_such_exercise' || e.to === 'ghost' || e.from === e.to), 'rejected edges are not in the graph');
  assert.deepEqual(graph.alternativesOf('machine_chest_press').map((e) => e.id), ['incline_machine_press']);
  assert.doesNotThrow(() => G.buildExerciseGraph([]));
  assert.deepEqual(G.buildExerciseGraph([]).edges, []);
  assert.deepEqual(graph.progressionsOf('does_not_exist'), []);
  const knowledge = K.validateExerciseKnowledge(bad).filter((i) => i.field === 'relationships');
  assert.ok(knowledge.some((i) => i.severity === 'error' && /unknown exercise: no_such_exercise/.test(i.message)), 'the knowledge validator reports it as an error');
});

test('EG4 variations must keep the movement, never get easier, and never contradict each other', () => {
  const list = clone();
  // different pattern
  let g = G.buildExerciseGraph(withEdges(list, 'machine_chest_press', { progressions: ['leg_press'] }));
  assert.ok(g.issues.some((i) => /different movement patterns/.test(i.message)));
  assert.deepEqual(g.progressionsOf('machine_chest_press').map((e) => e.id).filter((id) => id === 'leg_press'), []);
  // a "progression" that is catalogued as easier
  g = G.buildExerciseGraph(withEdges(list, 'barbell_bench_press', { progressions: ['machine_chest_press'] }));
  assert.ok(g.issues.some((i) => /catalogued as easier/.test(i.message)));
  // the same pair in both directions
  g = G.buildExerciseGraph(withEdges(withEdges(list, 'machine_chest_press', { progressions: ['incline_machine_press', 'dumbbell_bench_press'] }), 'incline_machine_press', { progressions: ['machine_chest_press'] }));
  assert.ok(g.issues.filter((i) => /contradicts/.test(i.message)).length >= 2);
  assert.deepEqual(g.progressionsOf('machine_chest_press').map((e) => e.id), ['dumbbell_bench_press'], 'only the consistent catalogue edge survives');
  // progression declared on one exercise and regression declared back on the other (same direction twice) is one edge, not two
  g = G.buildExerciseGraph(withEdges(list, 'dumbbell_bench_press', { regressions: ['machine_chest_press'] }));
  assert.equal(g.edges.filter((e) => e.kind === 'progression' && e.from === 'machine_chest_press' && e.to === 'dumbbell_bench_press').length, 1);
  // longer cycle: chest press -> dumbbell press -> barbell press -> chest press
  g = G.buildExerciseGraph(withEdges(list, 'barbell_bench_press', { progressions: ['machine_chest_press'] }));
  assert.ok(!g.edges.some((e) => e.kind === 'progression' && e.from === 'barbell_bench_press' && e.to === 'machine_chest_press'));
});

test('EG5 the catalogue declares real, directional progressions and the regressions are their exact reverse', () => {
  const graph = G.exerciseGraph(EXERCISES);
  const progressions = graph.edges.filter((e) => e.kind === 'progression');
  const regressions = graph.edges.filter((e) => e.kind === 'regression');
  assert.ok(progressions.length >= 7);
  assert.deepEqual(regressions.map((e) => `${e.to}>${e.from}`).sort(), progressions.map((e) => `${e.from}>${e.to}`).sort(), 'every progression has exactly one regression the other way');
  const rank = { beginner: 0, intermediate: 1, advanced: 2 };
  for (const e of progressions) {
    const [from, to] = [byId(e.from), byId(e.to)];
    assert.equal(from.pattern, to.pattern, `${e.from} -> ${e.to} keeps the movement pattern`);
    assert.ok(rank[to.difficulty] >= rank[from.difficulty], `${e.from} -> ${e.to} is not easier`);
    assert.notEqual(e.from, e.to);
    assert.equal(e.declared, true);
  }
  assert.deepEqual(graph.progressionsOf('machine_chest_press').map((x) => x.id), ['dumbbell_bench_press']);
  assert.deepEqual(graph.progressionsOf('dumbbell_bench_press').map((x) => x.id), ['barbell_bench_press']);
  assert.deepEqual(graph.regressionsOf('barbell_bench_press').map((x) => x.id), ['dumbbell_bench_press']);
  assert.deepEqual(graph.regressionsOf('nordic_curl').map((x) => x.id), ['leg_curl_machine']);
  assert.deepEqual(graph.regressionsOf('machine_chest_press'), [], 'the easiest in a chain has no regression');
});

test('EG6 existing substitutions keep working: listed alternatives resolve, ranking and equivalence are unchanged in kind', () => {
  const graph = G.exerciseGraph(EXERCISES);
  for (const ex of EXERCISES) {
    assert.deepEqual(graph.alternativesOf(ex.id).map((e) => e.id).sort(), [...ex.alternatives].sort(), `${ex.id}: graph alternatives = declared alternatives`);
    assert.equal(T.smartAlternatives(ex, EXERCISES, FULL).length, ex.alternatives.length);
    const ranked = T.rankSubstitutes(ex, EXERCISES, FULL);
    assert.ok(ranked.length > 0 && ranked.every((r) => r.exercise.id !== ex.id));
  }
  assert.equal(T.isEquivalentSubstitution(byId('machine_chest_press'), byId('incline_machine_press')), true);
  assert.equal(T.isEquivalentSubstitution(byId('machine_chest_press'), byId('leg_press')), false);
});

test('EG7 graph enrichment never changes training: loads, plans and prescriptions are identical without any relationship data', () => {
  const stripped = EXERCISES.map(({ progressions, regressions, contraindicationNotes, safetyConsiderations, ...rest }) => ({ ...rest, alternatives: [...rest.alternatives] }));
  const press = byId('machine_chest_press');
  const history = [session(press, DAY0, threeSets(press, 20, 12)), session(press, addDays(DAY0, 3), threeSets(press, 22.5, 12))];
  const p = profile({ primaryGoal: 'strength' });
  for (const ex of EXERCISES) {
    const bare = stripped.find((e) => e.id === ex.id);
    assert.deepEqual(T.personalizedLoad(ex, history, p, EXERCISES, addDays(DAY0, 6)), T.personalizedLoad(bare, history, p, stripped, addDays(DAY0, 6)), `${ex.id}: prescription`);
    assert.deepEqual(T.progression(ex, history.flatMap((w) => w.exercises.flatMap((x) => x.sets)), { goal: 'strength' }), T.progression(bare, history.flatMap((w) => w.exercises.flatMap((x) => x.sets)), { goal: 'strength' }), `${ex.id}: progression`);
  }
  for (const equipment of [['machine'], ['bodyweight'], FULL]) for (const days of [2, 4, 6]) {
    const withData = T.buildPlan(profile({ equipment, trainingDays: days }), EXERCISES, []);
    const without = T.buildPlan(profile({ equipment, trainingDays: days }), stripped, []);
    assert.deepEqual(withData.exerciseSets, without.exerciseSets, `plan ${equipment} ${days}d`);
  }
});

test('EG8 structural relations are symmetric and explainable (family, pattern, shared muscle, shared equipment)', () => {
  const graph = G.exerciseGraph(EXERCISES);
  for (const ex of EXERCISES) for (const rel of graph.structuralRelations(ex.id)) {
    const back = graph.structuralRelations(rel.exercise.id).find((r) => r.exercise.id === ex.id);
    assert.ok(back, `${ex.id} <-> ${rel.exercise.id}`);
    assert.deepEqual(back.kinds, rel.kinds);
    if (rel.kinds.includes('same_pattern')) assert.equal(rel.exercise.pattern, ex.pattern);
    if (rel.kinds.includes('same_family')) assert.equal(rel.exercise.family, ex.family);
    if (rel.kinds.includes('shared_primary_muscle')) assert.ok(rel.exercise.primaryMuscles.some((m) => ex.primaryMuscles.includes(m)));
    if (rel.kinds.includes('shared_equipment')) assert.ok(rel.exercise.equipment.some((m) => ex.equipment.includes(m)));
  }
  assert.deepEqual(graph.structuralRelations('missing'), []);
});

/* ------------------------------------------------------- 27: variations (progressions / regressions) ------------- */

test('EV1 variation options: harder and easier variations the athlete can do, never applied automatically', () => {
  const press = byId('machine_chest_press');
  const all = G.variationOptions(press, EXERCISES);
  assert.deepEqual(all.progressions.map((e) => e.id), ['dumbbell_bench_press']);
  assert.deepEqual(all.regressions, []);
  const bench = G.variationOptions(byId('dumbbell_bench_press'), EXERCISES);
  assert.deepEqual([bench.progressions.map((e) => e.id), bench.regressions.map((e) => e.id)], [['barbell_bench_press'], ['machine_chest_press']]);
  // equipment compatibility is respected
  assert.deepEqual(G.variationOptions(press, EXERCISES, ['machine']).progressions, [], 'no dumbbells: the harder variation is not offered');
  assert.deepEqual(G.variationOptions(press, EXERCISES, ['dumbbell', 'bench']).progressions.map((e) => e.id), ['dumbbell_bench_press']);
  assert.deepEqual(G.variationOptions(press, EXERCISES, []).progressions.map((e) => e.id), ['dumbbell_bench_press'], 'equipment not yet known: still listed (it is confirmed before training)');
  assert.deepEqual(G.variationOptions(byId('bodyweight_squat'), EXERCISES, ['machine']).progressions, [], 'goblet squat needs a dumbbell or kettlebell');
  assert.deepEqual(G.variationOptions(byId('plank'), EXERCISES), { progressions: [], regressions: [] }, 'no data, no options (never invented)');
});

test('EV2 asking for options changes nothing: the catalogue, the workout and the prescription are untouched', () => {
  const snapshot = JSON.stringify(EXERCISES);
  const press = byId('machine_chest_press');
  const workout = T.createWorkout('Upper', DAY0, ['machine_chest_press'], EXERCISES, 'p');
  const before = JSON.stringify(workout);
  G.variationOptions(press, EXERCISES, FULL);
  G.exerciseGraph(EXERCISES).progressionsOf(press.id);
  assert.equal(JSON.stringify(EXERCISES), snapshot);
  assert.equal(JSON.stringify(workout), before);
  assert.equal(workout.exercises[0].exerciseId, 'machine_chest_press', 'the programmed exercise is never replaced');
});

test('EV3 metamorphic: relabelling every exercise id leaves the shape of the graph unchanged; direction flips swap the sets', () => {
  const rename = (id) => 'x_' + id;
  const renamed = EXERCISES.map((e) => ({ ...e, id: rename(e.id), alternatives: e.alternatives.map(rename), progressions: (e.progressions || []).map(rename), regressions: (e.regressions || []).map(rename) }));
  const a = G.buildExerciseGraph(EXERCISES);
  const b = G.buildExerciseGraph(renamed);
  assert.deepEqual(new Set(b.edges.map((e) => `${e.from.slice(2)}|${e.kind}|${e.to.slice(2)}`)), new Set(a.edges.map((e) => `${e.from}|${e.kind}|${e.to}`)));
  // declaring the same relationship as a regression on the harder exercise instead of a progression on the easier one gives the same graph
  const flipped = clone().map((e) => ({ ...e, progressions: [], regressions: [] }));
  const harder = G.exerciseGraph(EXERCISES).edges.filter((e) => e.kind === 'progression');
  for (const edge of harder) flipped.find((e) => e.id === edge.to).regressions.push(edge.from);
  const c = G.buildExerciseGraph(flipped);
  assert.deepEqual(c.issues, []);
  assert.deepEqual(c.edges.map((e) => `${e.from}|${e.kind}|${e.to}`), a.edges.map((e) => `${e.from}|${e.kind}|${e.to}`), 'same edges, whichever side declared them');
  assert.ok(c.edges.filter((e) => e.kind === 'regression').every((e) => e.declared) && c.edges.filter((e) => e.kind === 'progression').every((e) => !e.declared));
});

test('EV4 the Coach lists the variations of a plateaued exercise as options and does not apply them', () => {
  const press = byId('machine_chest_press');
  const sess = (date) => session(press, date, threeSets(press, 20, 9));
  const workouts = [sess('2026-01-01'), sess('2026-01-04'), sess('2026-01-07'), sess('2026-01-10')];
  const state = { schemaVersion: 4, goals: [], workouts, exercises: EXERCISES, achievements: [], measurements: [], journal: [], observations: [], preferences: {}, activeRoute: 'home', onboardingComplete: true, coachMemory: [], workoutTemplates: [], learnedPreferences: {}, eventLog: [], profile: profile({ equipment: ['machine', 'dumbbell', 'bench'] }) };
  const before = JSON.stringify(state);
  const ev = E.coachMod.coachEvidenceFromState(state, '2026-01-12');
  assert.equal(ev.plateaus.length, 1);
  const result = E.coachMod.coach({ state, profile: state.profile, goals: [], primaryGoal: 'general', recentWorkoutIds: [], recentExerciseEntryIds: [], now: '2026-01-12T10:00:00.000Z', plateaus: ev.plateaus });
  assert.match(result.explanation, /a harder variation: Dumbbell Bench Press/);
  assert.match(result.explanation, /options only; APEX has not switched your exercise/i);
  assert.equal(JSON.stringify(state), before, 'read only');
  // without the equipment for the harder variation it is not offered
  const noDumbbells = { ...state, profile: profile({ equipment: ['machine'] }) };
  const r2 = E.coachMod.coach({ state: noDumbbells, profile: noDumbbells.profile, goals: [], primaryGoal: 'general', recentWorkoutIds: [], recentExerciseEntryIds: [], now: '2026-01-12T10:00:00.000Z', plateaus: ev.plateaus });
  assert.doesNotMatch(r2.explanation, /harder variation/);
});

/* --------------------------------------------------------- 29: unified similarity / ranking ---------------------- */

test('ER1 one similarity measure: comparisonScore keeps its documented values, and every caller reads the same function', () => {
  const near = T.comparisonScore(byId('machine_chest_press'), byId('incline_machine_press'));
  assert.ok(Math.abs(near - 0.485) < 1e-9, `chest press vs incline press: ${near}`);
  assert.equal(T.comparisonScore(byId('leg_press'), byId('leg_press')), 1);
  for (const a of EXERCISES) for (const b of EXERCISES) {
    assert.equal(T.comparisonScore(a, b), T.comparisonScore(b, a), `${a.id}/${b.id}: symmetric`);
    assert.equal(K.exerciseSimilarity(a, b), Math.round(T.comparisonScore(a, b) * 100), 'the knowledge layer delegates');
    assert.equal(G.comparisonScore(a, b), T.comparisonScore(a, b), 'the engine re-exports the graph module function');
  }
  const press = byId('machine_chest_press');
  assert.deepEqual(T.rankComparableExercises(press, EXERCISES).map((x) => x.score), T.rankComparableExercises(press, EXERCISES).map((x) => x.score).slice().sort((x, y) => y - x), 'comparable exercises are ranked by that score');
});

test('ER2 substitution ranking is a lexicographic rule: fit, then equivalence, then similarity, then catalogue relation, then fewer pieces of equipment', () => {
  const src = byId('machine_chest_press');
  const parts = (c, eq) => {
    const fit = T.equipmentFit(c, eq);
    return [fit === 'available' ? 2 : fit === 'unknown' ? 1 : 0, T.isEquivalentSubstitution(src, c) ? 1 : 0, Math.round(T.comparisonScore(src, c) * 100), G.catalogueRelates(src, c) ? 1 : 0, c.equipment.length < src.equipment.length ? 1 : 0];
  };
  const lex = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
  for (const eq of [['machine'], ['dumbbell', 'bench'], FULL, undefined]) {
    const candidates = EXERCISES.filter((c) => c.id !== src.id);
    const byScore = [...candidates].sort((a, b) => T.substituteScore(src, b, eq) - T.substituteScore(src, a, eq) || (a.id < b.id ? -1 : 1));
    const byTuple = [...candidates].sort((a, b) => lex(parts(a, eq), parts(b, eq)) || (a.id < b.id ? -1 : 1));
    assert.deepEqual(byScore.map((c) => c.id), byTuple.map((c) => c.id), `score order = tuple order for ${JSON.stringify(eq)}`);
    for (const a of candidates) for (const b of candidates) {
      const sign = (n) => Math.sign(n) || 0;
      assert.equal(sign(T.substituteScore(src, a, eq) - T.substituteScore(src, b, eq)), sign(-lex(parts(a, eq), parts(b, eq)) || 0), `${a.id} vs ${b.id}`);
    }
  }
});

test('ER3 equal inputs give equal rankings, in any catalogue order, with no dependence on storage', () => {
  for (const src of EXERCISES) for (const eq of [['machine'], FULL, undefined]) {
    const base = T.rankSubstitutes(src, EXERCISES, eq).map((r) => [r.exercise.id, r.score, r.equivalent]);
    for (const seed of [3, 11]) assert.deepEqual(T.rankSubstitutes(src, shuffle(EXERCISES, seed), eq).map((r) => [r.exercise.id, r.score, r.equivalent]), base, `${src.id}`);
    assert.deepEqual(K.rankedAlternatives(src, EXERCISES, eq || []).map((r) => [r.exercise.id, r.score]), base.map(([id, score]) => [id, score]), 'the knowledge-layer view is the same ranking');
  }
});

test('ER4 a change in one relevant dimension moves the ranking only where intended', () => {
  const src = byId('machine_chest_press');
  const near = byId('incline_machine_press');
  const base = T.substituteScore(src, near, ['machine']);
  // equipment: losing the machine drops it from the ranking entirely; equipment the athlete has never listed keeps it, lower than a confirmed one
  assert.ok(!T.rankSubstitutes(src, EXERCISES, ['dumbbell']).some((r) => r.exercise.id === near.id));
  assert.ok(T.substituteScore(src, near, undefined) < base, 'unknown equipment ranks below confirmed equipment');
  // equivalence beats raw similarity
  const equivalent = T.rankSubstitutes(src, EXERCISES, FULL).filter((r) => r.equivalent);
  const notEquivalent = T.rankSubstitutes(src, EXERCISES, FULL).filter((r) => !r.equivalent && T.equipmentFit(r.exercise, FULL) === 'available');
  assert.ok(equivalent.length && notEquivalent.length);
  assert.ok(Math.min(...equivalent.map((r) => r.score)) > Math.max(...notEquivalent.map((r) => r.score)), 'every equivalent swap ranks above every non-equivalent one');
  // similarity: same pattern/equivalence, differing muscles -> the closer one wins
  const a = { ...near, id: 'twin_a' };
  const b = { ...near, id: 'twin_b', primaryMuscles: ['calves'], secondaryMuscles: [] };
  assert.ok(T.substituteScore(src, a, ['machine']) > T.substituteScore(src, b, ['machine']), 'shared muscles raise the rank');
  // catalogue relation: an otherwise identical candidate listed as a relation ranks just above the unlisted twin
  const related = { ...near, id: 'twin_c', alternatives: [] };
  const listedSrc = { ...src, alternatives: [...src.alternatives, 'twin_c'] };
  assert.ok(T.substituteScore(listedSrc, related, ['machine']) > T.substituteScore(listedSrc, { ...near, id: 'twin_d', alternatives: [] }, ['machine']));
  assert.equal(T.substituteScore(listedSrc, related, ['machine']) - T.substituteScore(listedSrc, { ...near, id: 'twin_d', alternatives: [] }, ['machine']), 2, 'a relation is a tie-break, not a weight');
  // a relation never outranks a closer unrelated exercise
  assert.ok(T.substituteScore(listedSrc, near, ['machine']) >= T.substituteScore(listedSrc, { ...byId('leg_press'), id: 'leg_press' }, ['machine']));
  // progression / regression relations count as catalogue relations
  assert.equal(G.catalogueRelates(byId('machine_chest_press'), byId('dumbbell_bench_press')), true);
  assert.equal(G.catalogueRelates(byId('dumbbell_bench_press'), byId('machine_chest_press')), true, 'either way round');
  assert.equal(G.catalogueRelates(byId('plank'), byId('leg_press')), false);
});

test('ER5 plan generation, equipment filtering and the knowledge queries stay consistent with the one rule', () => {
  for (const equipment of [['machine'], ['dumbbell', 'bench'], ['bodyweight'], FULL]) {
    const plan = T.buildPlan(profile({ equipment }), EXERCISES, []);
    for (const ids of Object.values(plan.exerciseSets)) for (const id of ids) {
      assert.equal(T.exerciseFitsEquipment(byId(id), equipment), true, `${id} in a plan for ${equipment}`);
      assert.notEqual(T.equipmentFit(byId(id), equipment), 'unavailable');
    }
    for (const src of EXERCISES) for (const r of T.rankSubstitutes(src, EXERCISES, equipment)) assert.notEqual(T.equipmentFit(r.exercise, equipment), 'unavailable', 'ranking never offers what the athlete cannot do');
  }
  for (const ex of EXERCISES) for (const a of T.smartAlternatives(ex, EXERCISES, FULL)) assert.equal(a.score, T.substituteScore(ex, a.exercise, FULL), 'listed alternatives are scored by the same function');
  assert.deepEqual(K.knowledgeReport({ exercises: EXERCISES }).issues, []);
});
