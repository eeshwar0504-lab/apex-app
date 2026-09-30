'use strict';
const { Rng, hashSeed } = require('./random.cjs');

const EQUIPMENT = {
  FULL: ['machine', 'cable', 'dumbbell', 'barbell', 'bench', 'bodyweight', 'kettlebell'],
  LIMITED: ['dumbbell', 'bench', 'bodyweight', 'cable'],
  HOME: ['dumbbell', 'bodyweight'],
  MINIMAL: ['bodyweight'],
};

/* Independent behavioural archetypes. None of these numbers come from APEX. */
const BASE = {
  experience: 'beginner', strengthScale: 1, potentialMultiple: 2.2, adaptation: 0.012, attendance: 0.95,
  sleep: 0.8, dayNoise: 0.03, fatigueGain: 0.12, recoveryRate: 0.6, intendedRir: 2, overshootReps: 3,
  rirNoise: 0.7, rirMissing: 0.05, bodyWeightKg: 78, equipment: 'FULL',
};
const ARCHETYPES = {
  consistent_beginner: { adaptation: 0.016, attendance: 0.98 },
  slow_responder: { adaptation: 0.004, potentialMultiple: 1.4 },
  fast_responder: { adaptation: 0.03, potentialMultiple: 3.2, experience: 'intermediate' },
  inconsistent_trainee: { attendance: 0.6, adaptation: 0.01 },
  poor_recovery_trainee: { sleep: 0.4, fatigueGain: 0.3, recoveryRate: 0.85, dayNoise: 0.06 },
  strong_inconsistent: { experience: 'advanced', strengthScale: 1.3, attendance: 0.55, adaptation: 0.006 },
  // a steady athlete who has genuinely stalled: strength ceiling reached and very little set-to-set noise
  plateauing_trainee: { experience: 'intermediate', potentialMultiple: 1.03, adaptation: 0.02, repNoise: 0.05, dayNoise: 0.004, sleep: 0.98, fatigueGain: 0.04, rirNoise: 0.2 },
  temporary_regression: { regressionWindows: [{ from: 28, to: 42, factor: 0.9 }] },
  equipment_limited: { equipment: 'LIMITED', equipmentSchedule: [{ fromWeek: 0, set: 'FULL' }, { fromWeek: 3, set: 'LIMITED' }, { fromWeek: 6, set: 'MINIMAL' }, { fromWeek: 8, set: 'LIMITED' }, { fromWeek: 10, set: 'FULL' }] },
  home_gym: { equipment: 'HOME', equipmentSchedule: [{ fromWeek: 0, set: 'HOME' }] },
  unit_switching: { unitSwitchWeeks: [2, 4, 5, 8, 9] },
  goal_changing: { goalChanges: [{ week: 3, goal: 'strength' }, { week: 6, goal: 'fat_loss' }, { week: 9, goal: 'hypertrophy' }], daysChange: [{ week: 5, days: 3 }] },
};

function makeScenario({ archetype, seed, weeks = 12, persistence = 0.08 }) {
  const rng = new Rng(hashSeed(seed, archetype));
  const a = { ...BASE, ...ARCHETYPES[archetype] };
  // per-user variation on top of the archetype
  a.strengthScale *= rng.float(0.8, 1.25);
  a.adaptation *= rng.float(0.8, 1.2);
  a.attendance = rng.clamp(a.attendance + rng.gauss(0, 0.03), 0.3, 1);
  a.bodyWeightKg = Math.round(rng.float(58, 105) * 10) / 10;
  const goals = ['strength', 'hypertrophy', 'general', 'fitness'];
  return {
    id: `${archetype}-${seed}`, archetype, seed, weeks, persistence, athlete: a,
    goal: rng.pick(goals),
    startEquipment: a.equipment,
    equipmentSchedule: a.equipmentSchedule || [{ fromWeek: 0, set: a.equipment }],
    unitSwitchWeeks: a.unitSwitchWeeks || [],
    goalChanges: a.goalChanges || [],
    daysChange: a.daysChange || [],
    breakWindows: a.breakWindows || [],
    bodyTrend: rng.pick([-0.03, 0, 0.02]),
  };
}
module.exports = { makeScenario, ARCHETYPES, EQUIPMENT, BASE };
