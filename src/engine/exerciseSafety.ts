import type {Exercise, SafetyConsideration, SafetyConsiderationKind} from '../core/types';

/**
 * Exercise safety metadata: descriptive, conservative and separate from load and progression logic. Nothing in this module
 * is read by progression(), personalizedLoad() or plan building.
 *
 * What it is: movement, setup and technique considerations that the catalogue records for an exercise, the modification
 * that goes with each, and, only where the data says so, a suggestion to ask a qualified coach.
 * What it is not: it never diagnoses, never infers anything about a person's health, and never declares an exercise safe or
 * unsafe for someone. An exercise with no recorded considerations says exactly that.
 */
export const SAFETY_KINDS: readonly SafetyConsiderationKind[] = ['technique_sensitive', 'setup', 'load_control', 'equipment_check', 'range_of_motion', 'balance'];

export const SAFETY_LIMITS = {noteMax: 200};

/** What APEX says it does not do, shown wherever safety notes are explained. */
export const SAFETY_BOUNDARY = 'These are general notes about the movement. APEX does not assess medical conditions or tell you whether an exercise is right for your body. If something hurts or you have a health concern, stop and speak to a qualified professional.';

export const NO_SPECIFIC_CONSIDERATIONS = 'No exercise-specific considerations are recorded for this movement. The general guidance below still applies.';

/** Wording that would turn a note into a medical claim; the validator rejects it. */
export const MEDICAL_CLAIM_PATTERN = /\b(diagnos\w*|treat\w*|cure\w*|heal\w*|rehab\w*|therap\w*|prevent\w*\s+(an\s+)?(injur\w*|pain)|(un)?safe\s+for|not\s+(recommended|advised)\s+for|contraindicated\s+for|you\s+(have|suffer)|your\s+(injury|condition))\b/i;

export interface SafetyIssue {
  exerciseId: string;
  message: string;
}

export interface ExerciseSafety {
  /** True only when considerations were authored for this exercise. */
  recorded: boolean;
  considerations: SafetyConsideration[];
  /** The exercise's general safety lines (every exercise has them). */
  general: string[];
  /** Existing catalogue notes, passed through untouched. */
  contraindicationNotes: string[];
}

const KIND_ORDER = new Map(SAFETY_KINDS.map((kind, index) => [kind, index]));

export function exerciseSafety(ex: Exercise): ExerciseSafety {
  const considerations = [...(ex.safetyConsiderations || [])].sort(
    (a, b) => (KIND_ORDER.get(a.kind) ?? 99) - (KIND_ORDER.get(b.kind) ?? 99) || (a.note < b.note ? -1 : a.note > b.note ? 1 : 0)
  );
  return {
    recorded: considerations.length > 0,
    considerations,
    general: [...(ex.safety || [])],
    contraindicationNotes: [...(ex.contraindicationNotes || [])]
  };
}

export interface SafetyExplanation {
  exercise: string;
  lines: string[];
  modifications: string[];
  guidance: string[];
  boundary: string;
}

/**
 * What the Coach (or the exercise screen) may say about an exercise: the recorded considerations, their modifications and
 * any suggestion to ask a qualified coach, plus the boundary statement. Pure and deterministic.
 */
export function explainSafety(ex: Exercise): SafetyExplanation {
  const safety = exerciseSafety(ex);
  return {
    exercise: ex.name,
    lines: safety.recorded ? safety.considerations.map(item => item.note) : [NO_SPECIFIC_CONSIDERATIONS],
    modifications: safety.considerations.flatMap(item => (item.modification ? [item.modification] : [])),
    guidance: safety.considerations.flatMap(item => (item.guidance ? [item.guidance] : [])),
    boundary: SAFETY_BOUNDARY
  };
}

export function validateSafetyMetadata(exercises: readonly Exercise[]): SafetyIssue[] {
  const issues: SafetyIssue[] = [];
  const text = (id: string, label: string, value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) { issues.push({exerciseId: id, message: `${label} must be non-empty text`}); return; }
    if (value.length > SAFETY_LIMITS.noteMax) issues.push({exerciseId: id, message: `${label} is longer than ${SAFETY_LIMITS.noteMax} characters`});
    if (MEDICAL_CLAIM_PATTERN.test(value)) issues.push({exerciseId: id, message: `${label} reads as a medical claim: "${value}"`});
  };
  for (const ex of exercises) {
    for (const line of ex.safety || []) text(ex.id, 'safety line', line);
    for (const line of ex.contraindicationNotes || []) text(ex.id, 'contraindication note', line);
    const seen = new Set<string>();
    for (const item of ex.safetyConsiderations || []) {
      if (!SAFETY_KINDS.includes(item.kind)) issues.push({exerciseId: ex.id, message: `unknown safety kind: ${String(item.kind)}`});
      text(ex.id, 'safety note', item.note);
      if (item.modification !== undefined) text(ex.id, 'modification', item.modification);
      if (item.guidance !== undefined) text(ex.id, 'guidance', item.guidance);
      const key = `${item.kind}|${item.note}`;
      if (seen.has(key)) issues.push({exerciseId: ex.id, message: `duplicate safety note: ${item.note}`});
      seen.add(key);
    }
  }
  return issues;
}
