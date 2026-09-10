const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('onboarding requires explicit core choices instead of fake defaults', () => {
  const src = fs.readFileSync(path.join(root, 'src/main.tsx'), 'utf8');

  if (!src.includes("[exp,setExp]=useState<'beginner'|'intermediate'|'advanced'|null>(null)")) {
    throw new Error('experience must start unset');
  }

  if (!src.includes("[goal,setGoal]=useState<GoalKind|null>(null)")) {
    throw new Error('goal must start unset');
  }

  if (!src.includes("[days,setDays]=useState<number|null>(null)")) {
    throw new Error('training days must start unset');
  }

  if (!src.includes("[mins,setMins]=useState<number|null>(null)")) {
    throw new Error('session duration must start unset');
  }

  if (!src.includes("[equipment,setEquipment]=useState<string[]>([])")) {
    throw new Error('equipment must start empty');
  }

  // The plan button must require all explicit onboarding choices.
  // The implementation may additionally disable the button while
  // the plan is being generated to prevent duplicate submissions.
  const requiresExplicitChoices =
    src.includes('!exp') &&
    src.includes('!goal') &&
    src.includes('!days') &&
    src.includes('!mins') &&
    src.includes('!equipment.length');

  if (!requiresExplicitChoices) {
    throw new Error('plan creation must require explicit choices');
  }

  if (!src.includes('disabled={building||!exp||!goal||!days||!mins||!equipment.length}')) {
    throw new Error('plan creation should also prevent duplicate submission while building');
  }
});