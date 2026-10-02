import type {Exercise} from '../core/types';

export interface ExerciseComparison {
  exercise: Exercise;
  score: number;
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
}


/* ============================================================
   EXERCISE COMPARABILITY
   ============================================================ */

/**
 * Returns a graded similarity score instead of a simple
 * comparable / not-comparable decision.
 *
 * This prevents APEX from blindly transferring load between
 * unrelated exercises.
 */
export function comparisonScore(
  a: Exercise,
  b: Exercise
): number {
  if (a.id === b.id) {
    return 1;
  }

  let score = 0;

  if (a.family === b.family) {
    score += 0.30;
  }

  if (a.pattern === b.pattern) {
    score += 0.25;
  }

  const primaryOverlap = a.primaryMuscles.filter(
    muscle => b.primaryMuscles.includes(muscle)
  ).length;

  if (primaryOverlap > 0) {
    score += Math.min(
      0.20,
      primaryOverlap * 0.08
    );
  }

  const secondaryOverlap = a.secondaryMuscles.filter(
    muscle => b.secondaryMuscles.includes(muscle)
  ).length;

  if (secondaryOverlap > 0) {
    score += Math.min(
      0.08,
      secondaryOverlap * 0.04
    );
  }

  if (a.loadSemantics === b.loadSemantics) {
    score += 0.10;
  }

  if (a.unilateral === b.unilateral) {
    score += 0.04;
  }

  const equipmentOverlap = a.equipment.filter(
    equipment => b.equipment.includes(equipment)
  ).length;

  if (equipmentOverlap > 0) {
    score += Math.min(
      0.03,
      equipmentOverlap * 0.015
    );
  }

  return Math.min(1, score);
}

/**
 * Backwards-compatible boolean helper.
 */
export function comparable(
  a: Exercise,
  b: Exercise
): boolean {
  return comparisonScore(a, b) >= 0.50;
}

/**
 * Ranks exercises that could provide useful comparative evidence.
 */
export function rankComparableExercises(
  target: Exercise,
  exercises: Exercise[],
  availableIds?: Set<string>
): ExerciseComparison[] {
  return exercises
    .filter(ex => ex.id !== target.id)
    .map(ex => {
      const score = comparisonScore(target, ex);

      const reasons: string[] = [];

      if (target.family === ex.family) {
        reasons.push('same exercise family');
      }

      if (target.pattern === ex.pattern) {
        reasons.push('same movement pattern');
      }

      const primaryOverlap =
        target.primaryMuscles.filter(
          muscle => ex.primaryMuscles.includes(muscle)
        );

      if (primaryOverlap.length) {
        reasons.push(
          `shared primary muscle: ${primaryOverlap
            .slice(0, 2)
            .join(', ')}`
        );
      }

      if (target.loadSemantics === ex.loadSemantics) {
        reasons.push('same load semantics');
      }

      if (target.unilateral === ex.unilateral) {
        reasons.push('same unilateral/bilateral structure');
      }

      if (availableIds?.has(ex.id)) {
        reasons.push('available in current exercise set');
      }

      const confidence: ExerciseComparison['confidence'] =
        score >= 0.70
          ? 'high'
          : score >= 0.50
            ? 'medium'
            : 'low';

      return {
        exercise: ex,
        score,
        confidence,
        reasons
      };
    })
    .filter(item => item.score >= 0.30)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.exercise.name.localeCompare(
        b.exercise.name
      );
    });
}


/* ============================================================
   EQUIPMENT
   ============================================================ */

export type EquipmentFit =
  | 'available'
  | 'unknown'
  | 'unavailable';

/**
 * The one equipment-compatibility rule (plan building, substitutions, the library and the session brief all use it):
 * an exercise is usable when it needs no equipment, when it is bodyweight, or when at least one of the pieces of
 * equipment it lists is available. Matching is by exact, case-insensitive name.
 */
export function usesNoEquipment(ex: Exercise): boolean {
  return ex.equipment.length === 0 || ex.equipment.includes('bodyweight');
}

/**
 * The equipment an exercise actually needs the athlete to have. "bodyweight" and "none" are not equipment: they are
 * the absence of a requirement, so they are never listed, confirmed or counted as missing. An exercise that can be
 * done with bodyweight (alone or as one option) needs nothing.
 */
export function requiredEquipment(ex: Exercise): string[] {
  if (usesNoEquipment(ex)) return [];
  return ex.equipment.filter(item => item && item !== 'none');
}

export function exerciseFitsEquipment(ex: Exercise, available: readonly string[]): boolean {
  if (usesNoEquipment(ex)) return true;
  const normalized = new Set(available.map(value => String(value).toLowerCase().trim()));
  return ex.equipment.some(required => normalized.has(required.toLowerCase().trim()));
}

export function equipmentFit(
  ex: Exercise,
  available:
    | string[]
    | undefined
): EquipmentFit {

  // a movement that needs no equipment is available whether or not the athlete has listed any
  if (usesNoEquipment(ex)) {
    return 'available';
  }

  if (
    !available ||
    !available.length
  ) {
    return 'unknown';
  }

  return exerciseFitsEquipment(ex, available)
    ? 'available'
    : 'unavailable';
}

/** True when the catalogue itself relates the two exercises: a listed alternative, progression or regression, either way round. */
export function catalogueRelates(a: Exercise, b: Exercise): boolean {
  const lists = (x: Exercise) => [...(x.alternatives || []), ...(x.progressions || []), ...(x.regressions || [])];
  return lists(a).includes(b.id) || lists(b).includes(a.id);
}

/**
 * The one substitution ranking. It is a lexicographic comparison, not a weighted sum, so no dimension can be traded off
 * against another by an arbitrary weight. In order of priority:
 *   1. equipment fit: usable now, unknown until confirmed, unavailable;
 *   2. whether the swap keeps the prescription meaningful (isEquivalentSubstitution: same pattern, load meaning, rep width);
 *   3. similarity(): the one similarity measure (family, pattern, shared muscles, load meaning, laterality, equipment);
 *   4. whether the catalogue relates the pair (listed alternative, progression or regression);
 *   5. fewer pieces of equipment needed.
 * The number returned is those five fields packed into disjoint digit ranges, so comparing scores IS comparing the
 * tuple. Ties are broken by exercise id (see rankSubstitutes), never by storage order.
 */
export function substituteScore(
  source: Exercise,
  candidate: Exercise,
  available: readonly string[] | undefined
): number {
  const fit = equipmentFit(candidate, available ? [...available] : undefined);
  const fitTier = fit === 'available' ? 2 : fit === 'unknown' ? 1 : 0;
  const equivalent = isEquivalentSubstitution(source, candidate) ? 1 : 0;
  const similarityPct = Math.round(comparisonScore(source, candidate) * 100);
  const related = catalogueRelates(source, candidate) ? 1 : 0;
  const lighter = candidate.equipment.length < source.equipment.length ? 1 : 0;
  return fitTier * 100000 + equivalent * 10000 + similarityPct * 4 + related * 2 + lighter;
}

/**
 * Every usable replacement for an exercise, best first: the catalogue's listed alternatives plus every other
 * exercise, minus anything the athlete cannot use (profile equipment) or has marked unavailable for this session.
 * Ties are broken by id so the order never depends on how the catalogue happens to be stored.
 */
export function rankSubstitutes(
  source: Exercise,
  exercises: Exercise[],
  available: readonly string[] | undefined,
  unavailableItems: readonly string[] = []
): { exercise: Exercise; score: number; equivalent: boolean }[] {
  const blocked = new Set(unavailableItems.map(item => item.toLowerCase().trim()));
  return exercises
    .filter(candidate => candidate.id !== source.id)
    .filter(candidate => !candidate.equipment.some(item => blocked.has(item.toLowerCase().trim())))
    .filter(candidate => equipmentFit(candidate, available ? [...available] : undefined) !== 'unavailable')
    .map(candidate => ({
      exercise: candidate,
      score: substituteScore(source, candidate, available),
      equivalent: isEquivalentSubstitution(source, candidate)
    }))
    .sort((x, y) => y.score - x.score || x.exercise.id.localeCompare(y.exercise.id));
}

/** The catalogue's listed alternatives for an exercise, best first, including ones the equipment rules exclude. */
export function smartAlternatives(
  ex: Exercise,
  exercises: Exercise[],
  available:
    | string[]
    | undefined
) {

  return ex.alternatives
    .map(id => exercises.find(exercise => exercise.id === id))
    .filter((exercise): exercise is Exercise => Boolean(exercise))
    .map(exercise => ({
      exercise,
      fit: equipmentFit(exercise, available),
      samePattern: exercise.pattern === ex.pattern,
      sameLoad: exercise.loadSemantics === ex.loadSemantics,
      similarity: comparisonScore(ex, exercise),
      score: substituteScore(ex, exercise, available)
    }))
    .sort((a, b) => b.score - a.score || b.similarity - a.similarity || a.exercise.id.localeCompare(b.exercise.id));
}


/**
 * The one substitution-equivalence rule: a replacement carries the old prescription forward only when it moves the
 * same pattern, measures load the same way and has the same rep-range width. Anything else starts a new baseline.
 */
export function isEquivalentSubstitution(oldEx: Exercise, newEx: Exercise): boolean {
  return (
    oldEx.pattern === newEx.pattern &&
    oldEx.loadSemantics === newEx.loadSemantics &&
    oldEx.repRange[1] - oldEx.repRange[0] === newEx.repRange[1] - newEx.repRange[0]
  );
}

/* ============================================================
   EXERCISE GRAPH
   ============================================================ */

/*
 * The one authoritative graph of how exercises relate. The catalogue (src/knowledge/exercises.ts) declares edges on each
 * exercise (`alternatives`, `progressions`, `regressions`); this module validates them and answers every question about
 * them. Only `progressions` are authored in the catalogue: "B is a progression of A" means A -> B is a harder variation, and
 * the reverse ("A is a regression of B") is derived, so a pair can never be declared twice or in two directions.
 *
 * Directionality (exercise variations, not load progression):
 *   progression: current exercise -> a harder compatible variation
 *   regression:  current exercise -> an easier compatible variation
 * A variation keeps the movement pattern and never lowers the catalogue difficulty. Nothing here replaces an exercise a
 * person has programmed; the graph only describes options for planning, substitution and the Coach.
 */
export type RelationKind = 'alternative' | 'progression' | 'regression';
export type StructuralRelationKind = 'same_family' | 'same_pattern' | 'shared_primary_muscle' | 'shared_equipment';

export interface GraphEdge {
  from: string;
  to: string;
  kind: RelationKind;
  /** false for the regression edges derived from a declared progression. */
  declared: boolean;
}

export interface GraphIssue {
  exerciseId: string;
  field: 'alternatives' | 'progressions' | 'regressions';
  message: string;
  severity: 'error' | 'warning';
}

export interface ExerciseGraph {
  /** Accepted edges only, sorted by (from, kind, to). */
  readonly edges: readonly GraphEdge[];
  /** Everything that was rejected or suspicious. A rejected edge is never part of `edges`. */
  readonly issues: readonly GraphIssue[];
  alternativesOf(id: string): Exercise[];
  progressionsOf(id: string): Exercise[];
  regressionsOf(id: string): Exercise[];
  /** Structural relations (same family, same pattern, shared primary muscle, shared equipment), sorted by exercise id. */
  structuralRelations(id: string): {exercise: Exercise; kinds: StructuralRelationKind[]}[];
}

const DIFFICULTY_ORDER: Record<string, number> = {beginner: 0, intermediate: 1, advanced: 2};
const byIdOrder = (a: Exercise, b: Exercise) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function buildExerciseGraph(exercises: readonly Exercise[]): ExerciseGraph {
  const byId = new Map<string, Exercise>();
  const issues: GraphIssue[] = [];
  for (const ex of exercises) if (!byId.has(ex.id)) byId.set(ex.id, ex);

  const report = (exerciseId: string, field: GraphIssue['field'], message: string, severity: GraphIssue['severity'] = 'error') =>
    issues.push({exerciseId, field, message, severity});

  /* 1. read the declared lists; reject unknown ids, self links and repeats */
  const declared: {from: string; to: string; field: GraphIssue['field']}[] = [];
  for (const ex of exercises) {
    for (const field of ['alternatives', 'progressions', 'regressions'] as const) {
      const seen = new Set<string>();
      for (const id of ex[field] || []) {
        if (id === ex.id) { report(ex.id, field, `${field} lists the exercise itself`); continue; }
        if (!byId.has(id)) { report(ex.id, field, `${field} points at unknown exercise: ${id}`); continue; }
        if (seen.has(id)) { report(ex.id, field, `${field} lists ${id} more than once`, 'warning'); continue; }
        seen.add(id);
        declared.push({from: ex.id, to: id, field});
      }
    }
  }

  /* 2. variation edges as "harder" pairs: progressions[A]∋B means B is harder than A; regressions[A]∋B means B is easier */
  type Variation = {easier: string; harder: string; field: GraphIssue['field']; owner: string};
  let variations: Variation[] = declared
    .filter(d => d.field !== 'alternatives')
    .map(d => (d.field === 'progressions' ? {easier: d.from, harder: d.to, field: d.field, owner: d.from} : {easier: d.to, harder: d.from, field: d.field, owner: d.from}));

  const accept = (v: Variation): boolean => {
    const easier = byId.get(v.easier) as Exercise;
    const harder = byId.get(v.harder) as Exercise;
    if (easier.pattern !== harder.pattern) { report(v.owner, v.field, `${easier.id} and ${harder.id} use different movement patterns (${easier.pattern} / ${harder.pattern}); a variation keeps the movement`); return false; }
    if ((DIFFICULTY_ORDER[harder.difficulty] ?? 0) < (DIFFICULTY_ORDER[easier.difficulty] ?? 0)) { report(v.owner, v.field, `${harder.id} is catalogued as easier than ${easier.id}, so it cannot be the harder variation`); return false; }
    return true;
  };
  variations = variations.filter(accept);

  /* 3. contradictions: the same pair in both directions, or any cycle of "harder than" */
  const key = (v: {easier: string; harder: string}) => `${v.easier}>${v.harder}`;
  const pairSet = new Set(variations.map(key));
  const reaches = (from: string, to: string, pairs: Variation[]): boolean => {
    const stack = [from];
    const seen = new Set<string>();
    while (stack.length) {
      const node = stack.pop() as string;
      if (node === to) return true;
      if (seen.has(node)) continue;
      seen.add(node);
      for (const p of pairs) if (p.easier === node) stack.push(p.harder);
    }
    return false;
  };
  const contradictory = variations.filter(v => pairSet.has(`${v.harder}>${v.easier}`) || reaches(v.harder, v.easier, variations));
  for (const v of contradictory) report(v.owner, v.field, `${v.easier} -> ${v.harder} contradicts another variation relationship (a cycle of harder-than)`);
  const contradictoryKeys = new Set(contradictory.map(key));
  const accepted = new Map<string, Variation>();
  for (const v of variations) if (!contradictoryKeys.has(key(v)) && !accepted.has(key(v))) accepted.set(key(v), v);

  /* 4. the accepted edge list: declared alternatives, declared progressions, and the derived regressions */
  const edges: GraphEdge[] = [];
  for (const d of declared) if (d.field === 'alternatives') edges.push({from: d.from, to: d.to, kind: 'alternative', declared: true});
  for (const v of accepted.values()) {
    edges.push({from: v.easier, to: v.harder, kind: 'progression', declared: v.field === 'progressions'});
    edges.push({from: v.harder, to: v.easier, kind: 'regression', declared: v.field === 'regressions'});
  }
  const kindOrder: Record<RelationKind, number> = {alternative: 0, progression: 1, regression: 2};
  edges.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : kindOrder[a.kind] - kindOrder[b.kind] || (a.to < b.to ? -1 : a.to > b.to ? 1 : 0)));
  issues.sort((a, b) => (a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : a.field < b.field ? -1 : a.field > b.field ? 1 : a.message < b.message ? -1 : a.message > b.message ? 1 : 0));

  const targets = (id: string, kind: RelationKind): Exercise[] =>
    edges.filter(e => e.from === id && e.kind === kind).map(e => byId.get(e.to) as Exercise).sort(byIdOrder);

  return {
    edges,
    issues,
    alternativesOf: id => targets(id, 'alternative'),
    progressionsOf: id => targets(id, 'progression'),
    regressionsOf: id => targets(id, 'regression'),
    structuralRelations: id => {
      const source = byId.get(id);
      if (!source) return [];
      const out: {exercise: Exercise; kinds: StructuralRelationKind[]}[] = [];
      for (const other of [...byId.values()].sort(byIdOrder)) {
        if (other.id === id) continue;
        const kinds: StructuralRelationKind[] = [];
        if (other.family === source.family) kinds.push('same_family');
        if (other.pattern === source.pattern) kinds.push('same_pattern');
        if (other.primaryMuscles.some(muscle => source.primaryMuscles.includes(muscle))) kinds.push('shared_primary_muscle');
        if (other.equipment.some(item => source.equipment.includes(item))) kinds.push('shared_equipment');
        if (kinds.length) out.push({exercise: other, kinds});
      }
      return out;
    }
  };
}

const graphCache = new WeakMap<readonly Exercise[], ExerciseGraph>();

/** buildExerciseGraph, memoised per catalogue array: the same catalogue always gives the same graph object. */
export function exerciseGraph(exercises: readonly Exercise[]): ExerciseGraph {
  let graph = graphCache.get(exercises);
  if (!graph) { graph = buildExerciseGraph(exercises); graphCache.set(exercises, graph); }
  return graph;
}

export interface VariationOptions {
  progressions: Exercise[];
  regressions: Exercise[];
}

/**
 * The harder and easier variations of an exercise that the athlete can do with `available` equipment (all of them when no
 * equipment list is given). Read-only: the engine never swaps a programmed exercise because an option exists.
 */
export function variationOptions(ex: Exercise, exercises: readonly Exercise[], available?: readonly string[]): VariationOptions {
  const graph = exerciseGraph(exercises);
  const usable = (candidate: Exercise) => !available || equipmentFit(candidate, [...available]) !== 'unavailable';
  return {
    progressions: graph.progressionsOf(ex.id).filter(usable),
    regressions: graph.regressionsOf(ex.id).filter(usable)
  };
}
