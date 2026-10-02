import type {Exercise} from './core/types';
import {equipmentFit} from './engine/exerciseGraph';
import {MEDICAL_CLAIM_PATTERN} from './engine/exerciseSafety';

/*
 * The AI boundary: what the AI layer is given, what it may return, and how its output is checked.
 *
 *   deterministic engine / Coach  --(GroundedAIContext, read only)-->  provider
 *   provider  --(untrusted text)-->  parseAIOutput  -->  vetAIOutput  -->  VettedAIOutput (text only)
 *
 * AI output is untrusted text. It is parsed against a closed schema, every sentence is checked against the grounded
 * context, and what survives is plain text for the screen. There is deliberately no field through which AI output could
 * carry a load, a set count, an exercise to insert or any other instruction: this module does not import anything that
 * can write training state, and a test enforces that.
 */

export type Confidence = 'low' | 'medium' | 'high';

export interface GroundedFact {
  id: string;
  statement: string;
}

/** An exercise the deterministic layer has already validated as a possible suggestion for this person. */
export interface GroundedCandidate {
  id: string;
  name: string;
  relation: 'current' | 'harder_variation' | 'easier_variation' | 'alternative';
}

/**
 * The minimal, purpose-specific description of one Coach answer. Everything in it was established by the application
 * before any provider is called. KNOWN = deterministic facts, INFERRED = the Coach's own interpretation,
 * UNKNOWN = what is missing. No identifiers of the person, no history beyond the facts the answer used.
 */
export interface GroundedAIContext {
  version: 1;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  question: string;
  intent: string;
  known: GroundedFact[];
  inferred: GroundedFact[];
  unknown: string[];
  /** The deterministic Coach answer. The AI may only explain or rephrase it. */
  deterministicAnswer: string;
  confidence: Confidence;
  /** True when the deterministic safety gate is not clear. */
  safetyGated: boolean;
  exercise?: {id: string; name: string; loadSemantics: string; pattern: string};
  candidates: GroundedCandidate[];
}

/** What a provider adapter receives. The adapter turns it into its own wire format; nothing here is vendor specific. */
export interface ProviderInput {
  system: string;
  user: string;
  /** The structured context, for providers that do not use a language model (the rule-based provider). */
  context: GroundedAIContext;
  expectJson: boolean;
  timeoutMs: number;
}

export type ProviderFailureCode = 'unavailable' | 'network' | 'timeout' | 'unsupported' | 'not_configured' | 'http_error' | 'empty_response';

export class ProviderError extends Error {
  constructor(readonly code: ProviderFailureCode, message?: string) {
    super(message || code);
    this.name = 'ProviderError';
  }
}

/** The only shape structured AI output may have. Any other key is a violation, not an extension. */
export interface AIStructuredOutput {
  response: string;
  groundedClaims: {claim: string; factIds: string[]}[];
  uncertainties: string[];
  requestedClarification?: string;
}

const ALLOWED_KEYS = new Set(['response', 'groundedClaims', 'uncertainties', 'requestedClarification']);
export const AI_LIMITS = {responseMax: 1200, claimsMax: 12, claimMax: 300, uncertaintiesMax: 8, uncertaintyMax: 300, clarificationMax: 300};

export type ParseResult = {ok: true; output: AIStructuredOutput} | {ok: false; reason: 'not_json' | 'not_object' | 'forbidden_field' | 'bad_shape' | 'too_long'; detail: string};

const text = (value: unknown, max: number): string | undefined => (typeof value === 'string' && value.trim().length > 0 && value.length <= max * 4 ? value.trim() : undefined);

/** Parses provider text into the closed schema. Never throws. Anything else (including extra fields) is rejected. */
export function parseAIOutput(raw: unknown): ParseResult {
  if (typeof raw !== 'string') return {ok: false, reason: 'not_json', detail: 'the provider returned something that is not text'};
  const body = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return {ok: false, reason: 'not_json', detail: 'the provider text is not JSON'}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {ok: false, reason: 'not_object', detail: 'the provider JSON is not an object'};
  const record = parsed as Record<string, unknown>;
  const extra = Object.keys(record).filter(key => !ALLOWED_KEYS.has(key));
  if (extra.length) return {ok: false, reason: 'forbidden_field', detail: `fields outside the contract: ${extra.sort().join(', ')}`};
  const response = text(record.response, AI_LIMITS.responseMax);
  if (!response) return {ok: false, reason: 'bad_shape', detail: 'response must be non-empty text'};
  if (response.length > AI_LIMITS.responseMax) return {ok: false, reason: 'too_long', detail: 'response is too long'};
  const claimsRaw = record.groundedClaims ?? [];
  if (!Array.isArray(claimsRaw) || claimsRaw.length > AI_LIMITS.claimsMax) return {ok: false, reason: 'bad_shape', detail: 'groundedClaims must be a short list'};
  const claims: AIStructuredOutput['groundedClaims'] = [];
  for (const item of claimsRaw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return {ok: false, reason: 'bad_shape', detail: 'a grounded claim is not an object'};
    const extraClaimKeys = Object.keys(item).filter(key => key !== 'claim' && key !== 'factIds');
    if (extraClaimKeys.length) return {ok: false, reason: 'forbidden_field', detail: `claim fields outside the contract: ${extraClaimKeys.sort().join(', ')}`};
    const claim = text((item as Record<string, unknown>).claim, AI_LIMITS.claimMax);
    const ids = (item as Record<string, unknown>).factIds;
    if (!claim || !Array.isArray(ids) || ids.some(id => typeof id !== 'string')) return {ok: false, reason: 'bad_shape', detail: 'a grounded claim needs text and factIds'};
    claims.push({claim, factIds: ids as string[]});
  }
  const uncertaintiesRaw = record.uncertainties ?? [];
  if (!Array.isArray(uncertaintiesRaw) || uncertaintiesRaw.length > AI_LIMITS.uncertaintiesMax || uncertaintiesRaw.some(u => typeof u !== 'string')) return {ok: false, reason: 'bad_shape', detail: 'uncertainties must be a short list of text'};
  const clarification = record.requestedClarification;
  if (clarification !== undefined && clarification !== null && typeof clarification !== 'string') return {ok: false, reason: 'bad_shape', detail: 'requestedClarification must be text'};
  return {
    ok: true,
    output: {
      response,
      groundedClaims: claims,
      uncertainties: (uncertaintiesRaw as string[]).map(u => u.trim()).filter(Boolean).map(u => u.slice(0, AI_LIMITS.uncertaintyMax)),
      ...(typeof clarification === 'string' && clarification.trim() ? {requestedClarification: clarification.trim().slice(0, AI_LIMITS.clarificationMax)} : {})
    }
  };
}

export type RemovalReason = 'prescription_value' | 'prescription_directive' | 'medical_claim' | 'invented_history' | 'exercise_not_a_candidate' | 'exercise_unavailable';

export interface VettedAIOutput {
  /** Text safe to show: only sentences that passed every check. Empty when nothing survived. */
  text: string;
  removed: {sentence: string; reason: RemovalReason}[];
  claims: {grounded: {claim: string; factIds: string[]}[]; ungrounded: string[]};
  uncertainties: string[];
  requestedClarification?: string;
}

const UNIT = '(?:kg|kgs|lb|lbs|pounds?|kilograms?|reps?|repetitions?|sets?|seconds?|secs?|minutes?|mins?)';
const NUMBER_WITH_UNIT = new RegExp(`(\\d+(?:\\.\\d+)?)\\s?${UNIT}\\b`, 'gi');
const DIRECTIVE = /\b(set|change|update|adjust|use|increase|reduce|decrease|lower|raise|drop|bump|add|remove|replace|swap|insert|skip|delete|switch)\b[^.!?]{0,60}\b(load|weight|reps?|sets?|rest|rir|prescription|plan|workout|program)\b/i;
const IMPERATIVE_NOW = /\b(i've|i have|i will|i'll|let me)\s+(set|changed|updated|adjusted|increased|reduced|added|removed|replaced|swapped|inserted)\b/i;
const MEDICAL_SAFETY = /\b(medically|clinically)\s+(safe|fine|cleared)\b|\b(safe|fine|ok(?:ay)?)\s+(for you|to (do|continue|train))\b|\b(is|are)\s+(not\s+)?(un)?safe\b|\bno\s+risk\b|\bcleared\s+(to|for)\b/i;
/** Named conditions and injuries. The AI may not introduce one the grounded context does not already contain: that would be a diagnosis. */
const CONDITION_TERMS = /\b(injur\w*|tear|torn|strain(?:ed)?|sprain(?:ed)?|tendin\w*|impingement|herniat\w*|slipped disc|fractur\w*|arthrit\w*|rotator cuff|sciatica|bursitis|syndrome|disorder|osteo\w*|hypertension|diabet\w*)\b/i;
const DATE_TOKEN = /\b\d{4}-\d{2}-\d{2}\b/g;
const RELATIVE_HISTORY = /\b(last|previous|yesterday|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|session|workout|week)\b/i;

/** An instruction to change something. "It does not change your plan" is a statement, not an instruction, so a negation just before the verb clears it. */
function isDirective(sentence: string): boolean {
  const match = DIRECTIVE.exec(sentence);
  if (!match) return false;
  const before = sentence.slice(Math.max(0, match.index - 30), match.index + match[1].length);
  return !/\b(not|never|no|cannot|can't|won't|doesn't|don't|without)\b/i.test(before);
}

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ');
const numbersOf = (value: string): Set<string> => {
  const out = new Set<string>();
  for (const match of value.matchAll(/\d+(?:\.\d+)?/g)) out.add(String(Number(match[0])));
  return out;
};

export interface VetOptions {
  /** Every exercise in the catalogue, used to recognise exercise names in AI text. */
  exercises: readonly Exercise[];
  /** The athlete's equipment, for the independent availability check. */
  equipment?: readonly string[];
}

/**
 * Checks parsed AI output against the grounded context, sentence by sentence. A sentence that states a prescription value
 * that the context does not contain, instructs a change, makes a medical claim, cites history that was not supplied, or
 * names an exercise that is not a validated candidate is removed. Claims need a real fact id from the context.
 */
export function vetAIOutput(output: AIStructuredOutput, context: GroundedAIContext, options: VetOptions): VettedAIOutput {
  const contextText = [context.deterministicAnswer, ...context.known.map(f => f.statement), ...context.inferred.map(f => f.statement), ...context.unknown, context.question].join(' ');
  const knownNumbers = numbersOf(contextText);
  const knownDates = new Set([context.date, ...(contextText.match(DATE_TOKEN) || [])]);
  const factIds = new Set([...context.known, ...context.inferred].map(f => f.id));
  const allowed = new Map<string, GroundedCandidate>();
  for (const candidate of context.candidates) allowed.set(candidate.id, candidate);
  if (context.exercise) allowed.set(context.exercise.id, {id: context.exercise.id, name: context.exercise.name, relation: 'current'});
  const byName = [...options.exercises].sort((a, b) => b.name.length - a.name.length);

  const removed: VettedAIOutput['removed'] = [];
  const kept: string[] = [];
  const sentences = output.response.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  for (const sentence of sentences) {
    const lower = normalize(sentence);
    let reason: RemovalReason | undefined;
    if (MEDICAL_SAFETY.test(sentence) || MEDICAL_CLAIM_PATTERN.test(sentence) || (CONDITION_TERMS.test(sentence) && !CONDITION_TERMS.test(contextText))) reason = 'medical_claim';
    else if (IMPERATIVE_NOW.test(sentence) || isDirective(sentence)) reason = 'prescription_directive';
    else {
      const values = [...sentence.matchAll(NUMBER_WITH_UNIT)].map(m => String(Number(m[1])));
      if (values.some(value => !knownNumbers.has(value))) reason = 'prescription_value';
      else if ((sentence.match(DATE_TOKEN) || []).some(day => !knownDates.has(day)) || (RELATIVE_HISTORY.test(sentence) && !RELATIVE_HISTORY.test(contextText))) reason = 'invented_history';
    }
    if (!reason) {
      for (const ex of byName) {
        if (!lower.includes(ex.name.toLowerCase())) continue;
        if (allowed.has(ex.id)) continue;
        reason = options.equipment && equipmentFit(ex, [...options.equipment]) === 'unavailable' ? 'exercise_unavailable' : 'exercise_not_a_candidate';
        break;
      }
    }
    if (reason) removed.push({sentence, reason}); else kept.push(sentence);
  }

  const grounded: VettedAIOutput['claims']['grounded'] = [];
  const ungrounded: string[] = [];
  for (const claim of output.groundedClaims) {
    const ids = [...new Set(claim.factIds)];
    if (ids.length > 0 && ids.every(id => factIds.has(id))) grounded.push({claim: claim.claim, factIds: ids});
    else ungrounded.push(claim.claim);
  }
  return {
    text: kept.join(' '),
    removed,
    claims: {grounded, ungrounded},
    uncertainties: output.uncertainties,
    ...(output.requestedClarification ? {requestedClarification: output.requestedClarification} : {})
  };
}
