import type {
  CandidateAction,
  CoachConfidence,
  CoachContext,
  CoachDecision,
  CoachDecisionRequest,
  CoachEvidence,
  CoachingObjective,
  CoachResult,
  CoachPrescription,
  SafetyAssessment,
  SafetyStatus,
} from './types';
import type {GoalKind} from '../core/types';

const nowIso = (context: CoachContext): string => context.now;

const decisionId = (context: CoachContext): string =>
  `coach_${context.now.replace(/[^0-9A-Z]/gi, '')}_${context.exerciseId || context.workoutId || 'global'}`;

const evidenceId = (suffix: string): string => `e_${suffix}`;

/** Plateau evidence is weak with three comparable sessions and moderate with four. */
const plateauConfidence = (sessions: number): CoachConfidence => (sessions >= 4 ? 'medium' : 'low');

/** Describes the recovery values that were actually supplied. No thresholds are applied to them. */
function describeRecovery(signals: NonNullable<CoachContext['context']>): string[] {
  const parts: string[] = [];
  if (typeof signals.sleepHours === 'number') parts.push(`sleep ${signals.sleepHours} h`);
  if (typeof signals.sleepQuality === 'number') parts.push(`sleep quality ${signals.sleepQuality}/5`);
  if (typeof signals.soreness === 'number') parts.push(`soreness ${signals.soreness}/5`);
  if (typeof signals.fatigue === 'number') parts.push(`fatigue ${signals.fatigue}/5`);
  if (typeof signals.stress === 'number') parts.push(`stress ${signals.stress}/5`);
  if (typeof signals.readiness === 'number') parts.push(`readiness ${signals.readiness}/5`);
  return parts;
}

function buildEvidence(context: CoachContext): CoachEvidence[] {
  const evidence: CoachEvidence[] = [];

  if (context.profile) {
    evidence.push({
      id: evidenceId('profile'),
      statement: `User profile is available for ${context.profile.name}.`,
      source: 'profile',
      state: 'known',
      quality: 'high',
      pattern: 'signal',
      confidence: 'high',
      timestamp: context.now,
    });
  } else {
    evidence.push({
      id: evidenceId('profile_missing'),
      statement: 'User profile is not available.',
      source: 'profile',
      state: 'unknown',
      quality: 'missing',
      pattern: 'missing',
      confidence: 'low',
      timestamp: context.now,
    });
  }

  if (context.primaryGoal) {
    evidence.push({
      id: evidenceId('goal'),
      statement: `Primary goal is ${context.primaryGoal}.`,
      source: 'profile',
      state: 'known',
      quality: 'high',
      pattern: 'signal',
      confidence: 'high',
      timestamp: context.now,
    });
  } else {
    evidence.push({
      id: evidenceId('goal_missing'),
      statement: 'No primary training goal is currently known.',
      source: 'profile',
      state: 'unknown',
      quality: 'missing',
      pattern: 'missing',
      confidence: 'low',
      timestamp: context.now,
    });
  }

  if (context.workout) {
    evidence.push({
      id: evidenceId('workout'),
      statement: `Current workout is ${context.workout.name}.`,
      source: 'current_session',
      state: 'known',
      quality: 'high',
      pattern: 'signal',
      confidence: 'high',
      timestamp: context.now,
    });
  }

  if (context.exercise) {
    evidence.push({
      id: evidenceId('exercise'),
      statement: `Current exercise is ${context.exercise.name}.`,
      source: 'current_session',
      state: 'known',
      quality: 'high',
      pattern: 'signal',
      confidence: 'high',
      timestamp: context.now,
    });
  }

  const signals = context.context;
  if (signals) {
    if (signals.pain === true) {
      evidence.push({
        id: evidenceId('pain'),
        statement: 'User reported pain in the current coaching context.',
        source: 'user',
        state: 'known',
        quality: 'medium',
        pattern: 'signal',
        confidence: 'medium',
        timestamp: context.now,
      });
    }

    if (signals.discomfort === true) {
      evidence.push({
        id: evidenceId('discomfort'),
        statement: 'User reported discomfort in the current coaching context.',
        source: 'user',
        state: 'known',
        quality: 'medium',
        pattern: 'signal',
        confidence: 'medium',
        timestamp: context.now,
      });
    }
  }

  const recoveryParts = signals ? describeRecovery(signals) : [];
  if (recoveryParts.length) {
    evidence.push({
      id: evidenceId('recovery'),
      statement: `Self-reported recovery context: ${recoveryParts.join(', ')}.`,
      source: 'user',
      state: 'known',
      quality: 'low',
      pattern: 'confounder',
      confidence: 'low',
      timestamp: context.now,
    });
  }

  for (const plateau of context.plateaus || []) {
    evidence.push({
      id: evidenceId(`plateau_${plateau.exerciseId}`),
      statement: `${plateau.exerciseName}: completed-rep output was identical across the last ${plateau.sessions} comparable sessions.`,
      source: 'history',
      state: 'probable',
      quality: plateau.sessions >= 4 ? 'medium' : 'low',
      pattern: 'signal',
      confidence: plateauConfidence(plateau.sessions),
      timestamp: context.now,
      references: [plateau.exerciseId],
    });
  }

  if (context.userInput?.trim()) {
    evidence.push({
      id: evidenceId('user_input'),
      statement: context.userInput.trim(),
      source: 'user',
      state: 'known',
      quality: 'medium',
      pattern: 'signal',
      confidence: 'medium',
      timestamp: context.now,
    });
  }

  return evidence;
}

function assessSafety(context: CoachContext, evidence: CoachEvidence[]): SafetyAssessment {
  const signals = context.context;

  if (signals?.pain === true) {
    return {
      status: 'caution',
      reason: 'Pain was reported; normal training optimization should not override the safety concern.',
      evidence: evidence.filter((item) => item.id === evidenceId('pain')),
      recommendedAction: 'stop',
    };
  }

  if (signals?.recentIllness === true) {
    return {
      status: 'caution',
      reason: 'Recent illness is known, so normal training optimization should be conservative until current tolerance is established.',
      evidence,
      recommendedAction: 'ask',
    };
  }

  return {
    status: 'clear',
    reason: 'No explicit safety concern is present in the supplied coaching context.',
    evidence,
  };
}

function resolveObjective(context: CoachContext): CoachingObjective {
  const primary: GoalKind | string =
    context.primaryGoal || context.profile?.primaryGoal || 'general';

  const secondary = (context.goals.length > 0
    ? context.goals
        .filter((goal) => goal.kind !== primary && goal.status === 'active')
        .sort((a, b) => b.priority - a.priority)
        .map((goal) => goal.kind)
    : context.profile?.goals.filter((goal) => goal !== primary) || []) as GoalKind[];

  return {
    primary,
    secondary,
    description: `Protect the user's ${primary} training objective while respecting safety, sustainability, context, adherence and preference.`,
    priority: 1,
  };
}

function buildCandidates(
  context: CoachContext,
  safety: SafetyAssessment,
  objective: CoachingObjective,
  evidence: CoachEvidence[],
): CandidateAction[] {
  if (safety.status === 'stop') {
    return [{
      id: 'stop_training',
      action: 'stop',
      title: 'Stop the current training action',
      description: 'Do not continue normal training optimization while the safety gate requires stopping.',
      objectiveFit: 0,
      sustainabilityFit: 1,
      recoveryFit: 1,
      adherenceFit: 0,
      preferenceFit: 0,
      safetyStatus: 'stop',
      reversibility: 'easy',
      consequences: ['The current training action is not continued.'],
      evidence,
    }];
  }

  if (safety.status === 'refer') {
    return [{
      id: 'refer',
      action: 'refer',
      title: 'Seek appropriate professional evaluation',
      description: 'The available context does not support normal coaching optimization.',
      objectiveFit: 0,
      sustainabilityFit: 1,
      recoveryFit: 1,
      adherenceFit: 0,
      preferenceFit: 0,
      safetyStatus: 'refer',
      reversibility: 'easy',
      consequences: ['Normal coaching is deferred.'],
      evidence,
    }];
  }

  if (safety.status === 'caution') {
    return [
      {
        id: 'ask_context',
        action: 'ask',
        title: 'Collect the missing safety/context information',
        description: 'Clarify the relevant context before making a consequential training decision.',
        objectiveFit: 1,
        sustainabilityFit: 1,
        recoveryFit: 1,
        adherenceFit: 1,
        preferenceFit: 1,
        safetyStatus: 'caution',
        reversibility: 'easy',
        consequences: ['A normal training decision is delayed until the uncertainty is reduced.'],
        evidence,
      },
      {
        id: 'conservative_continue',
        action: 'modify',
        title: 'Use a conservative training modification',
        description: `Temporarily protect the ${objective.primary} objective while reducing unnecessary exposure to the contextual concern.`,
        objectiveFit: 1,
        sustainabilityFit: 1,
        recoveryFit: 1,
        adherenceFit: 1,
        preferenceFit: 1,
        safetyStatus: 'caution',
        reversibility: 'easy',
        consequences: ['Training stimulus may be temporarily reduced.'],
        evidence,
      },
    ];
  }

  const plateaus = context.plateaus || [];
  const recoveryParts = context.context ? describeRecovery(context.context) : [];
  const extra: CandidateAction[] = [];

  if (plateaus.length) {
    const names = plateaus.slice(0, 3).map((item) => item.exerciseName).join(', ');
    extra.push({
      id: 'review_plateau',
      action: 'review',
      title: `Review a possible plateau: ${names}`,
      description:
        `Review ${names}: completed reps have not changed across recent comparable sessions. ` +
        'APEX has not changed your plan. Options: keep the current load and aim for one more clean rep; ' +
        'check sleep, nutrition and recovery; check technique and range of motion; or choose a variation from the exercise alternatives. ' +
        'Identical output can also mean you are still building repeatable performance, so this is a signal, not a diagnosis.',
      objectiveFit: 1,
      sustainabilityFit: 1,
      recoveryFit: 1,
      adherenceFit: 1,
      preferenceFit: 1,
      safetyStatus: 'clear',
      reversibility: 'easy',
      consequences: ['Nothing changes unless you choose a change; the deterministic training engine stays authoritative.'],
      evidence,
    });
  }

  if (recoveryParts.length) {
    extra.push({
      id: 'lighter_session_option',
      action: 'modify',
      title: 'Train lighter or shorter today (your choice)',
      description: `Recovery context was reported (${recoveryParts.join(', ')}). It does not change today's prescription. If you feel run down you may shorten the session or use an easier load; you stay in control.`,
      objectiveFit: 0.5,
      sustainabilityFit: 1,
      recoveryFit: 1,
      adherenceFit: 0.5,
      preferenceFit: 0.5,
      safetyStatus: 'clear',
      reversibility: 'easy',
      consequences: ['Training stimulus would be temporarily lower if you choose this.'],
      evidence,
    });
  }

  return [
    ...extra.filter((item) => item.id === 'review_plateau'),
    {
      id: 'continue',
      action: 'continue',
      title: 'Continue the current training path',
      description: `Continue pursuing the ${objective.primary} objective when the supplied evidence supports doing so.`,
      objectiveFit: 1,
      sustainabilityFit: 1,
      recoveryFit: 1,
      adherenceFit: 1,
      preferenceFit: 1,
      safetyStatus: 'clear',
      reversibility: 'easy',
      consequences: [],
      evidence,
    },
    {
      id: 'collect_evidence',
      action: 'ask',
      title: 'Collect additional information',
      description: 'Ask only when the missing information could materially change the decision.',
      objectiveFit: 1,
      sustainabilityFit: 1,
      recoveryFit: 1,
      adherenceFit: 0,
      preferenceFit: 1,
      safetyStatus: 'clear',
      reversibility: 'easy',
      consequences: ['The current decision is delayed while more evidence is collected.'],
      evidence,
    },
    ...extra.filter((item) => item.id !== 'review_plateau'),
  ];
}

function selectCandidate(candidates: CandidateAction[]): CandidateAction {
  const safe = candidates.filter((candidate) => candidate.safetyStatus !== 'stop' && candidate.safetyStatus !== 'refer');
  const pool = safe.length > 0 ? safe : candidates;

  return [...pool].sort((a, b) => {
    const scoreA =
      a.objectiveFit * 5 +
      a.sustainabilityFit * 4 +
      a.recoveryFit * 3 +
      a.adherenceFit * 2 +
      a.preferenceFit;
    const scoreB =
      b.objectiveFit * 5 +
      b.sustainabilityFit * 4 +
      b.recoveryFit * 3 +
      b.adherenceFit * 2 +
      b.preferenceFit;
    return scoreB - scoreA;
  })[0];
}

function confidenceFor(
  context: CoachContext,
  safety: SafetyAssessment,
  evidence: CoachEvidence[],
): { confidence: CoachConfidence; reason: string } {
  if (safety.status === 'stop' || safety.status === 'refer') {
    return {
      confidence: 'high',
      reason: 'The safety gate has priority over normal training optimization.',
    };
  }

  const known = evidence.filter((item) => item.state === 'known' && item.quality === 'high').length;
  const missing = evidence.filter((item) => item.quality === 'missing').length;

  if (!context.primaryGoal || missing > 0) {
    return {
      confidence: 'low',
      reason: 'Important coaching context is missing, so a consequential prescription would be premature.',
    };
  }

  if (known >= 3 && context.exercise && context.workout) {
    return {
      confidence: 'medium',
      reason: 'The current objective, workout and exercise context are known, but the detailed training decision rules have not yet been applied.',
    };
  }

  return {
    confidence: 'low',
    reason: 'The available evidence is insufficient for a high-confidence consequential prescription.',
  };
}

function buildPrescription(candidate: CandidateAction, context: CoachContext): CoachPrescription {
  if (candidate.action === 'ask') {
    return {
      action: 'ask',
      instruction: 'Provide the missing information needed before making a consequential coaching decision.',
      reason: candidate.description,
    };
  }

  if (candidate.action === 'stop') {
    return {
      action: 'stop',
      instruction: 'Stop the current training action and address the safety concern.',
      reason: candidate.description,
    };
  }

  if (candidate.action === 'refer') {
    return {
      action: 'refer',
      instruction: 'Seek appropriate professional evaluation before continuing normal training decisions.',
      reason: candidate.description,
    };
  }

  return {
    action: candidate.action,
    exerciseId: context.exerciseId,
    setId: context.setId,
    instruction: candidate.description,
    reason: candidate.description,
  };
}

/**
 * Runs the structural APEX decision pipeline.
 *
 * This first implementation deliberately establishes the coach boundary and
 * safety/context flow. Exercise-specific prescription rules will be layered
 * onto this pipeline rather than embedded inside React components.
 */
export function runCoachDecision(request: CoachDecisionRequest): CoachResult {
  const {context} = request;
  const evidence = buildEvidence(context);
  const safety = assessSafety(context, evidence);
  const objective = resolveObjective(context);
  const candidates = buildCandidates(context, safety, objective, evidence);
  const selected = selectCandidate(candidates);
  let confidence = confidenceFor(context, safety, evidence);
  if (selected.id === 'review_plateau') {
    const weakest = Math.min(...(context.plateaus || []).map((item) => item.sessions));
    confidence = {
      confidence: plateauConfidence(weakest),
      reason: `Plateau evidence rests on ${weakest} comparable session${weakest === 1 ? '' : 's'} with identical rep output; that is ${weakest >= 4 ? 'moderate' : 'weak'} evidence and is not a diagnosis.`,
    };
  }
  const prescription = buildPrescription(selected, context);
  const recoveryParts = context.context ? describeRecovery(context.context) : [];
  const recoveryNote = recoveryParts.length && safety.status === 'clear'
    ? ` Recovery context noted (${recoveryParts.join(', ')}); it is evidence only and does not change your prescription.`
    : '';

  const decision: CoachDecision = {
    id: decisionId(context),
    timestamp: nowIso(context),
    gate: safety.status === 'clear' ? 'decision' : 'safety',
    action: selected.action,
    objective,
    safety,
    evidence,
    candidates,
    selectedCandidateId: selected.id,
    consequences: selected.consequences.map((description) => ({
      scope: 'session',
      description,
      severity: selected.action === 'stop' || selected.action === 'refer' ? 'high' : 'low',
      reversible: selected.reversibility === 'easy',
      requiresUserInvolvement: selected.action === 'ask' || selected.action === 'refer',
    })),
    prescription,
    confidence: confidence.confidence,
    confidenceReason: confidence.reason,
    reason: selected.description + recoveryNote,
    requiresUserConfirmation:
      selected.action === 'ask' ||
      selected.action === 'stop' ||
      selected.action === 'refer',
  };

  return {
    decision,
    nextAction: prescription,
    explanation: selected.description + recoveryNote,
    evidence,
  };
}

export type {SafetyStatus};
