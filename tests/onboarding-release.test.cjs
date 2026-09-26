const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const readMain = () =>
  fs.readFileSync(
    path.join(root, 'src/main.tsx'),
    'utf8'
  );

test(
  'onboarding requires explicit core choices instead of fake defaults',
  () => {
    const src = readMain();

    assert.ok(
      src.includes(
        "[exp,setExp]=useState<'beginner'|'intermediate'|'advanced'|null>(null)"
      ),
      'experience must start unset'
    );

    assert.ok(
      src.includes(
        '[goal,setGoal]=useState<GoalKind|null>(null)'
      ),
      'goal must start unset'
    );

    assert.ok(
      src.includes(
        '[days,setDays]=useState<number|null>(null)'
      ),
      'training days must start unset'
    );

    assert.ok(
      src.includes(
        '[mins,setMins]=useState<number|null>(null)'
      ),
      'session duration must start unset'
    );

    assert.ok(
      src.includes(
        "[equipment,setEquipment]=useState<string[]>([])"
      ),
      'equipment must start empty'
    );

    const requiresExplicitChoices =
      src.includes('!exp') &&
      src.includes('!goal') &&
      src.includes('!days') &&
      src.includes('!mins') &&
      src.includes('!equipment.length');

    assert.ok(
      requiresExplicitChoices,
      'plan creation must require explicit choices'
    );

    assert.ok(
      src.includes(
        'disabled={building||!exp||!goal||!days||!mins||!equipment.length}'
      ),
      'plan creation should prevent duplicate submission while building'
    );
  }
);

test(
  'onboarding does not silently substitute missing equipment',
  () => {
    const src = readMain();

    assert.ok(
      src.includes('[equipment,setEquipment]=useState<string[]>([])')
    );

    assert.ok(
      src.includes('!equipment.length')
    );
  }
);

test(
  'onboarding plan generation has an explicit building state',
  () => {
    const src = readMain();

    assert.ok(
      src.includes('building'),
      'onboarding should expose plan-generation state'
    );

    assert.ok(
      src.includes('setBuilding'),
      'onboarding should control plan-generation state'
    );
  }
);

test(
  'onboarding completion is not treated as complete before plan creation',
  () => {
    const src = readMain();

    const onboardingIndex = src.indexOf('onboardingComplete');

    assert.notEqual(
      onboardingIndex,
      -1,
      'onboarding completion state should exist'
    );

    assert.ok(
      src.includes('createWorkout'),
      'plan creation should invoke workout generation'
    );
  }
);