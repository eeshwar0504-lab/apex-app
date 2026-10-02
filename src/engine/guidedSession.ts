import type {Exercise,SetLog,Workout} from '../core/types';
import {
  feedbackLoad,
  loadAvailability,
  snapToAvailableLoad,
  setLoad,
  recommendedRest,
} from './training';
import { WARMUP_RULES } from './warmup';

const WARMUP_REST_SEC = WARMUP_RULES.restSec;

/** A set the athlete still has to do: not completed, and not a warm-up they skipped (a skipped warm-up never blocks a session). */
const pending = (set: SetLog) => !set.completed && !(set.type === 'warmup' && set.disposition === 'skipped');

export type GuidedPhase =
  | 'prep'
  | 'ready'
  | 'set_ready'
  | 'set_active'
  | 'feedback'
  | 'rest'
  | 'exercise_complete'
  | 'complete';

type RestPreference = Parameters<typeof recommendedRest>[1];
type GuidedSession = NonNullable<Workout['guidedSession']>;

export type GuidedTransitionResult = {
  workout: Workout;
  nextExerciseIndex?: number;
};

const DEFAULT_SESSION: Omit<GuidedSession, 'updatedAt'> = {
  phase: 'prep',
  exerciseIndex: 0,
  setIndex: 0,
  completedSetIds: [],
  skippedSetIds: [],
  skippedExerciseIds: [],
  substitutions: {},
  workingLoads: {},
  recommendations: {},
  sessionEquipment: {},
  setFeedback: {},
  calibration: {},
  pausedTotalSec: 0,
  version: 1,
};

export function completeGuidedSession(
  value?: Workout['guidedSession'],
): GuidedSession {
  return {
    ...DEFAULT_SESSION,
    ...(value || {}),
    updatedAt:
      value?.updatedAt ||
      new Date().toISOString(),
  } as GuidedSession;
}

export function normalizeGuidedPosition(workout: Workout): Workout {
  const c = structuredClone(workout);
  const gs = completeGuidedSession(c.guidedSession);

  let exerciseIndex = Math.max(
    0,
    Math.min(gs.exerciseIndex, Math.max(0, c.exercises.length - 1)),
  );
  let setIndex = Math.max(0, gs.setIndex);

  const findNext = (from: number) => {
    for (let i = Math.max(0, from); i < c.exercises.length; i += 1) {
      const exercise = c.exercises[i];
      if (exercise.status === 'skipped') continue;

      const nextSet = exercise.sets.findIndex(pending);
      if (nextSet >= 0) {
        return { exerciseIndex: i, setIndex: nextSet };
      }
    }
    return null;
  };

  const currentExercise = c.exercises[exerciseIndex];

  if (
    !currentExercise ||
    currentExercise.status === 'skipped' ||
    currentExercise.sets[setIndex]?.completed ||
    (currentExercise.sets[setIndex] !== undefined && !pending(currentExercise.sets[setIndex]) && currentExercise.sets[setIndex].type === 'warmup')
  ) {
    const next = findNext(exerciseIndex);
    const first = next || findNext(0);

    if (first) {
      exerciseIndex = first.exerciseIndex;
      setIndex = first.setIndex;
    }
  }

  c.guidedSession = {
    ...gs,
    exerciseIndex,
    setIndex,
    updatedAt: gs.updatedAt,
  };

  return c;
}

export function nextIncompleteSet(
  workout: Workout,
  exerciseIndex: number,
  afterSetIndex: number,
) {
  const exercise = workout.exercises[exerciseIndex];
  if (!exercise) return -1;

  return exercise.sets.findIndex(
    (set, index) => index > afterSetIndex && pending(set),
  );
}

export function nextIncompleteExercise(
  workout: Workout,
  afterExerciseIndex: number,
) {
  return workout.exercises.findIndex(
    (exercise, index) =>
      index > afterExerciseIndex &&
      exercise.status !== 'skipped' &&
      exercise.sets.some(pending),
  );
}

/**
 * Completes exactly the active set.
 *
 * The important invariant is that completion never advances exerciseIndex or
 * setIndex by itself. The following set is selected only by the explicit
 * rest/advance transition. This prevents a 3-set exercise from being treated
 * as complete after set 2.
 */
export function completeSet(
  workout: Workout,
  exerciseIndex: number,
  setIndex: number,
  at = new Date().toISOString(),
): Workout {
  const c = structuredClone(workout);
  const gs = completeGuidedSession(c.guidedSession);
  const exercise = c.exercises[exerciseIndex];
  const set = exercise?.sets[setIndex];

  if (!exercise || !set) return workout;

  if (set.completed) {
    return {
      ...c,
      guidedSession: {
        ...gs,
        phase: 'set_active',
        exerciseIndex,
        setIndex,
        updatedAt: at,
        version: gs.version + 1,
      },
    };
  }

  if (set.type !== 'warmup' && set.reps === undefined && set.seconds === undefined) {
    return workout;
  }

  set.completed = true;
  set.timestamp = at;

  /*
   * A warm-up is not training evidence, so it never opens the "how did that feel" step (that feedback adjusts the working
   * load). It goes straight to a short rest, and nothing about the working prescription is touched.
   */
  if (set.type === 'warmup') {
    c.guidedSession = {
      ...gs,
      completedSetIds: Array.from(new Set([...(gs.completedSetIds || []), set.id])),
      phase: 'rest',
      exerciseIndex,
      setIndex,
      updatedAt: at,
      version: gs.version + 1,
    };
    Object.assign(c.guidedSession as any, {
      restStartedAt: at,
      restTargetSec: WARMUP_REST_SEC,
      workStartedAt: undefined,
      workTargetSec: undefined,
    });
    return c;
  }

  c.guidedSession = {
    ...gs,
    completedSetIds: Array.from(
      new Set([...(gs.completedSetIds || []), set.id]),
    ),
    phase: 'feedback',
    exerciseIndex,
    setIndex,
    updatedAt: at,
    version: gs.version + 1,
  };

  return c;
}

/**
 * Applies feedback to the current exercise while preserving the completed
 * set's actual load. Only future, uncompleted, non-warmup sets are updated.
 */
export function applySetFeedback(
  workout: Workout,
  exercise: Exercise,
  exerciseIndex: number,
  setIndex: number,
  kind: 'heavy' | 'right' | 'easy',
  profile: any,
  targetRir?: number,
  at = new Date().toISOString(),
  preferences?: { restPreference?: RestPreference; restCustomSec?: number },
): Workout {
  const c = structuredClone(workout);
  const gs = completeGuidedSession(c.guidedSession);
  const target = c.exercises[exerciseIndex];
  const activeSet = target?.sets[setIndex];

  if (!target || !activeSet) return workout;

  // feedback is about the load the athlete actually lifted; the recommendation is only the fallback
  const currentLoad =
    setLoad(exercise, activeSet) ?? target.recommendedWeight;

  const next = feedbackLoad(
    exercise,
    currentLoad,
    kind,
    {
      reps: activeSet.reps,
      rir: activeSet.rir,
    },
    target.repRange,
    targetRir,
    profile,
  );

  const recommendationWeight =
    next === undefined
      ? undefined
      : snapToAvailableLoad(exercise, next, profile);

  if (recommendationWeight !== undefined) {
    target.recommendedWeight = recommendationWeight;

    // bodyweight, timed and no-load movements have no load to carry forward
    const carriesLoad = !['bodyweight', 'none', 'time'].includes(exercise.loadSemantics);
    target.sets.forEach((set, index) => {
      if (
        carriesLoad &&
        !set.completed &&
        index > setIndex &&
        set.type !== 'warmup'
      ) {
        if (exercise.loadSemantics === 'assistance') {
          set.assistance = recommendationWeight;
          set.loadDetail = { kind: 'assistance', assistanceKg: recommendationWeight };
        } else {
          set.weight = recommendationWeight;
        }
      }
    });
  }

  c.guidedSession = {
    ...gs,
    workingLoads: {
      ...(gs.workingLoads || {}),
      ...(recommendationWeight !== undefined
        ? { [exercise.id]: recommendationWeight }
        : {}),
    },
    recommendations: {
      ...(gs.recommendations || {}),
      [exercise.id]: {
        ...(gs.recommendations?.[exercise.id] || {}),
        weight: recommendationWeight,
        confidence: kind === 'right' ? 'high' : 'medium',
        kind: gs.recommendations?.[exercise.id]?.kind ?? 'baseline',
        reason:
          kind === 'right'
            ? 'You marked the load about right; this performance strengthens the exercise-specific baseline.'
            : kind === 'heavy'
              ? 'You reported the load as too heavy; the next recommendation is reduced conservatively.'
              : 'You reported the load as too easy; the next recommendation is increased conservatively.',
        source: 'recent_performance',
        loadSemantics: exercise.loadSemantics,
        incrementKg: loadAvailability(exercise, profile).incrementKg,
        generatedAt: at,
      },
    },
    setFeedback: {
      ...(gs.setFeedback || {}),
      [activeSet.id]: {
        rir: activeSet.rir,
        difficulty: kind === 'heavy' ? 4 : kind === 'easy' ? 2 : 3,
        timestamp: at,
      },
    },
    calibration: {
      ...(gs.calibration || {}),
      [exercise.id]: kind === 'right' ? 'established' : 'calibrating',
    },
    phase: 'rest',
    exerciseIndex,
    setIndex,
    updatedAt: at,
    version: gs.version + 1,
  };

  Object.assign(c.guidedSession as any, {
    restStartedAt: at,
    restTargetSec: recommendedRest(
      exercise,
      preferences?.restPreference ?? 'adaptive',
      preferences?.restCustomSec,
      activeSet.rir,
    ),
    workStartedAt: undefined,
    workTargetSec: undefined,
  });

  return c;
}

/**
 * The athlete chose not to rate the set ("Not sure"). Feedback is optional, so this leaves the set exactly as it was logged and
 * starts the rest: no recommendation, load, calibration or feedback record is created or changed, and no value is invented.
 */
export function skipSetFeedback(
  workout: Workout,
  exercise: Exercise,
  exerciseIndex: number,
  setIndex: number,
  at = new Date().toISOString(),
  preferences?: { restPreference?: RestPreference; restCustomSec?: number },
): Workout {
  const c = structuredClone(workout);
  const gs = completeGuidedSession(c.guidedSession);
  const activeSet = c.exercises[exerciseIndex]?.sets[setIndex];

  if (!activeSet) return workout;

  c.guidedSession = {
    ...gs,
    phase: 'rest',
    exerciseIndex,
    setIndex,
    updatedAt: at,
    version: gs.version + 1,
  };

  Object.assign(c.guidedSession as any, {
    restStartedAt: at,
    restTargetSec: recommendedRest(
      exercise,
      preferences?.restPreference ?? 'adaptive',
      preferences?.restCustomSec,
      activeSet.rir,
    ),
    workStartedAt: undefined,
    workTargetSec: undefined,
  });

  return c;
}

/**
 * After rest, select the next incomplete set in the SAME exercise first.
 * Only when no set remains do we move to the next exercise.
 */
export function continueAfterRest(
  workout: Workout,
  at = new Date().toISOString(),
): GuidedTransitionResult {
  const c = structuredClone(workout);
  const gs = completeGuidedSession(c.guidedSession);
  const { exerciseIndex, setIndex } = gs;

  const sameExerciseSet = nextIncompleteSet(
    c,
    exerciseIndex,
    setIndex,
  );

  if (sameExerciseSet >= 0) {
    c.guidedSession = {
      ...gs,
      phase: 'set_ready',
      exerciseIndex,
      setIndex: sameExerciseSet,
      updatedAt: at,
      version: gs.version + 1,
      ...({
        restStartedAt: undefined,
        restTargetSec: undefined,
      } as any),
    };

    return { workout: c };
  }

  const nextExercise = nextIncompleteExercise(
    c,
    exerciseIndex,
  );

  if (nextExercise >= 0) {
    c.guidedSession = {
      ...gs,
      phase: 'exercise_complete',
      exerciseIndex,
      setIndex,
      updatedAt: at,
      version: gs.version + 1,
      ...({
        restStartedAt: undefined,
        restTargetSec: undefined,
        nextExerciseIndex: nextExercise,
      } as any),
    };

    return {
      workout: c,
      nextExerciseIndex: nextExercise,
    };
  }

  c.guidedSession = {
    ...gs,
    phase: 'complete',
    updatedAt: at,
    version: gs.version + 1,
    ...({
      restStartedAt: undefined,
      restTargetSec: undefined,
    } as any),
  };

  return { workout: c };
}

export function advanceToNextExercise(
  workout: Workout,
  at = new Date().toISOString(),
): Workout {
  const c = structuredClone(workout);
  const gs = completeGuidedSession(c.guidedSession);
  const requested = Number((gs as any).nextExerciseIndex);

  if (Number.isInteger(requested) && requested >= 0) {
    const nextSet = c.exercises[requested]?.sets.findIndex(pending);

    if (nextSet !== undefined && nextSet >= 0) {
      c.guidedSession = {
        ...gs,
        phase: 'set_ready',
        exerciseIndex: requested,
        setIndex: nextSet,
        updatedAt: at,
        version: gs.version + 1,
        ...({ nextExerciseIndex: undefined } as any),
      };
      return c;
    }
  }

  const fallback = nextIncompleteExercise(
    c,
    gs.exerciseIndex,
  );

  if (fallback >= 0) {
    const nextSet = c.exercises[fallback].sets.findIndex(pending);

    c.guidedSession = {
      ...gs,
      phase: 'set_ready',
      exerciseIndex: fallback,
      setIndex: Math.max(0, nextSet),
      updatedAt: at,
      version: gs.version + 1,
      ...({ nextExerciseIndex: undefined } as any),
    };

    return c;
  }

  c.guidedSession = {
    ...gs,
    phase: 'complete',
    updatedAt: at,
    version: gs.version + 1,
    ...({ nextExerciseIndex: undefined } as any),
  };

  return c;
}
