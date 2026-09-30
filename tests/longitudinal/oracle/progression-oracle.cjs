'use strict';
/*
 * Exact expectations for the DOCUMENTED deterministic progression rules
 * (double progression: reach the top of the rep range on repeated sets, then
 * add one increment; repeated sub-range performance is flagged; very low RIR
 * holds). These are written from the rule statements, not by calling the
 * function under test to produce the expected value.
 */
const { loadEngine } = require('../load-engine.cjs');

const set = (weight, reps, rir, extra = {}) => ({ id: 's' + Math.random().toString(36).slice(2), type: 'working', weight, reps, rir, completed: true, ...extra });
const rec = (category, name, status, detail) => ({ category, name, status, detail });

function exactProgressionCases() {
  const E = loadEngine();
  const T = E.training;
  const ex = E.exercisesMod.EXERCISES.find((e) => e.id === 'machine_chest_press');
  const [lo, hi] = ex.repRange;
  const inc = ex.incrementKg;
  const out = [];
  const check = (name, got, want, category = 'progressive_overload', status = 'fail') => {
    const ok = want(got);
    out.push(rec(category, name, ok ? 'pass' : status, { got: { action: got.action, weight: got.weight }, exercise: ex.id, repRange: ex.repRange, increment: inc }));
  };
  // 1 no evidence -> calibrate
  check('no comparable work -> calibrate', T.progression(ex, []), (r) => r.action === 'calibrate');
  // 2 three sets at top of range -> +1 increment
  check('three sets at top of range -> increase by exactly one increment', T.progression(ex, [set(20, hi, 2), set(20, hi, 2), set(20, hi, 2)]), (r) => r.action === 'increase' && Math.abs(r.weight - (20 + inc)) < 1e-9);
  // 3 two sets at top (with earlier lower set) -> still increase (last three: two at top? rule needs all of last three)
  check('single set at top of range does NOT increase', T.progression(ex, [set(20, hi, 2)]), (r) => r.action !== 'increase');
  // 4 mid-range -> hold same load
  check('mid-range performance -> hold the same load', T.progression(ex, [set(20, lo + 1, 2), set(20, lo + 1, 2), set(20, lo + 1, 2)]), (r) => r.action === 'hold' && r.weight === 20);
  // 5 very low RIR -> hold
  check('RIR 0 with in-range reps -> hold', T.progression(ex, [set(20, lo + 1, 0), set(20, lo + 1, 0), set(20, lo + 1, 0)]), (r) => r.action === 'hold' && r.weight === 20);
  // 6 repeatedly below range -> reduce flag
  const below = T.progression(ex, [set(20, lo - 2, 0), set(20, lo - 2, 0), set(20, lo - 3, 0)]);
  check('repeated sub-range performance -> flagged as reduce', below, (r) => r.action === 'reduce');
  // 6b the action must mean what it says: the prescribed load is LOWER (regression for the reduce-keeps-load bug)
  out.push(rec('regression', 'repeated sub-range performance lowers the load by one increment (reduce means reduce)', below.weight === 20 - inc ? 'pass' : 'fail', { expected: 20 - inc, got: { action: below.action, weight: below.weight } }));
  // 7 elevated fatigue context -> recover
  check('elevated fatigue context -> recover (no load increase)', T.progression(ex, [set(20, hi, 2), set(20, hi, 2), set(20, hi, 2)], { fatigue: 'elevated' }), (r) => r.action === 'recover' && r.weight === 20, 'recovery');
  // 8 assisted movement: progression = LESS assistance
  const assisted = E.exercisesMod.EXERCISES.find((e) => e.loadSemantics === 'assistance');
  if (assisted) {
    const ah = assisted.repRange[1];
    const r = T.progression(assisted, [set(30, ah, 2, { assistance: 30 }), set(30, ah, 2), set(30, ah, 2)]);
    out.push(rec('progressive_overload', 'assisted movement: top-of-range progression lowers the assistance', r.action === 'increase' && r.weight < 30 ? 'pass' : 'fail', { got: { action: r.action, weight: r.weight }, exercise: assisted.id }));
  }
  // 9 warm-up sets never count as evidence
  const w = T.progression(ex, [set(5, hi, 5, { type: 'warmup' }), set(5, hi, 5, { type: 'warmup' })]);
  out.push(rec('progressive_overload', 'warm-up sets alone are not progression evidence', w.action === 'calibrate' ? 'pass' : 'fail', { got: { action: w.action } }));
  // 10 custom increments (available loads) respected by snapping
  const prof = { experience: 'beginner', primaryGoal: 'general', equipment: ['machine'], loadIncrementsKg: { machine: [10, 15, 25, 30] } };
  const snapped = T.snapToAvailableLoad(ex, 17, prof);
  out.push(rec('progressive_overload', 'custom load list: a prescribed load is always one of the configured loads', [10, 15, 25, 30].includes(snapped) ? 'pass' : 'fail', { requested: 17, got: snapped }));
  return out;
}

/* Independent PR oracle over a simulated history. */
function prOracle(state, exercises) {
  const out = [];
  const done = state.workouts.filter((w) => w.status === 'completed');
  const best = new Map();
  let checked = 0;
  for (const w of done) {
    const byEx = new Map();
    for (const we of w.exercises) {
      const loads = we.sets.filter((s) => s.completed && s.type !== 'warmup' && s.weight > 0).map((s) => s.weight);
      if (loads.length) byEx.set(we.exerciseId, Math.max(...loads));
    }
    const ach = state.achievements.filter((a) => a.workoutId === w.id && a.kind === 'load');
    for (const [id, maxLoad] of byEx) {
      const prev = best.get(id) ?? 0;
      const hasPr = ach.some((a) => a.exerciseId === id);
      checked++;
      if (maxLoad > prev + 1e-9 && prev > 0 && !hasPr) out.push({ severity: 'warn', category: 'prs', name: 'load above all previous work recorded no load PR', detail: { exercise: id, date: w.scheduledDate, prev, maxLoad } });
      if (maxLoad <= prev + 1e-9 && hasPr) out.push({ severity: 'hard', category: 'prs', name: 'load PR recorded without exceeding prior best', detail: { exercise: id, date: w.scheduledDate, prev, maxLoad } });
      best.set(id, Math.max(prev, maxLoad));
    }
  }
  return { issues: out, checked };
}

module.exports = { exactProgressionCases, prOracle, set };
