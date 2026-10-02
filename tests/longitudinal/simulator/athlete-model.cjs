'use strict';
/*
 * Independent synthetic athlete. It knows nothing about APEX's progression
 * rules: it has its own strength state (estimated 1RM per exercise), its own
 * adaptation, fatigue, sleep and attendance behaviour, and decides what it
 * actually achieves for whatever load it is handed.
 */
const CLASS_FACTOR = {
  // e1RM (kg) for an average beginner before scaling, keyed by movement pattern
  squat: 60, hinge: 70, horizontal_push: 45, horizontal_pull: 40, vertical_push: 30, vertical_pull: 40,
  arm_flexion: 18, arm_extension: 20, shoulder_abduction: 10, knee_flexion: 30, knee_extension: 45, calf: 60,
};
const EXPERIENCE_SCALE = { beginner: 1, intermediate: 1.5, advanced: 2.1 };

class AthleteModel {
  constructor(cfg, rng) {
    this.cfg = cfg; this.rng = rng;
    this.strength = new Map();        // exerciseId -> e1RM kg
    this.potential = new Map();       // exerciseId -> ceiling
    this.familiarity = new Map();     // exerciseId -> 0..1
    this.fatigue = 0;                 // 0..1 accumulated
    this.sleepQuality = cfg.sleep;    // 0..1 baseline
    this.sessionsDone = 0;
    this.dayState = { readiness: 1, sleep: 1, soreness: 0 };
  }
  ensure(ex) {
    if (this.strength.has(ex.id)) return;
    const base = (CLASS_FACTOR[ex.pattern] ?? 25) * (EXPERIENCE_SCALE[this.cfg.experience] ?? 1) * this.cfg.strengthScale;
    const inc = ex.loadSemantics === 'stack' ? 1 : 1;
    const variation = this.rng.float(0.85, 1.15);
    if (ex.loadSemantics === 'assistance') {
      // an assisted pull-up: the athlete lifts (bodyweight - assistance); capacity is relative to bodyweight
      const cap = Math.max(3, (this.cfg.bodyWeightKg || 75) * 0.9 * variation * (EXPERIENCE_SCALE[this.cfg.experience] ?? 1) ** 0.5 * Math.min(1.3, this.cfg.strengthScale));
      this.strength.set(ex.id, cap);
      this.potential.set(ex.id, cap * this.cfg.potentialMultiple ** 0.5);
      this.familiarity.set(ex.id, this.cfg.experience === 'beginner' ? 0.55 : 0.8);
      return;
    }
    const v = ex.loadSemantics === 'per_hand' ? base * 0.42 * variation : base * variation * inc;
    this.strength.set(ex.id, Math.max(3, v));
    this.potential.set(ex.id, Math.max(3, v) * this.cfg.potentialMultiple);
    this.familiarity.set(ex.id, this.cfg.experience === 'beginner' ? 0.55 : 0.8);
  }
  /* Draw the state of the athlete for one training day. */
  startDay(dayIndex) {
    const c = this.cfg;
    const sleep = this.rng.clamp(this.rng.gauss(this.sleepQuality, 0.12), 0.2, 1);
    const soreness = this.rng.clamp(this.fatigue * 0.8 + this.rng.gauss(0, 0.08), 0, 1);
    let readiness = 1 - (1 - sleep) * 0.18 - soreness * 0.12 - this.fatigue * 0.1 + this.rng.gauss(0, c.dayNoise);
    // scripted regression / illness windows
    for (const w of c.regressionWindows || []) if (dayIndex >= w.from && dayIndex < w.to) readiness *= w.factor;
    this.dayState = { readiness: this.rng.clamp(readiness, 0.6, 1.1), sleep, soreness };
    return this.dayState;
  }
  /* What the athlete actually does on one set at a prescribed load. */
  performSet(ex, loadKg, repRange, setIndex) {
    this.ensure(ex);
    const e1 = this.strength.get(ex.id) * this.dayState.readiness * Math.pow(0.975, setIndex) * (0.9 + 0.1 * this.familiarity.get(ex.id));
    const load = Math.max(0.5, loadKg);
    const rMax = Math.max(0, 30 * (e1 / load - 1));         // Epley inverted
    const intended = this.cfg.intendedRir + (this.rng.chance(0.15) ? 1 : 0);
    const cap = repRange[1] + this.cfg.overshootReps;
    let reps = Math.floor(Math.min(rMax - intended + this.rng.gauss(0, this.cfg.repNoise ?? 0.6), cap));
    /* An athlete who can lift the load at all logs at least one rep (they attempted it); below ~0.5 rMax they skip it. */
    reps = rMax >= 0.5 ? Math.max(1, reps) : 0;
    const trueRir = Math.max(0, Math.round(rMax - reps));
    const noisy = trueRir + Math.round(this.rng.gauss(0, this.cfg.rirNoise));
    const missing = this.rng.chance(this.cfg.rirMissing);
    const rir = missing ? undefined : this.rng.clamp(noisy, 0, 5);
    return { reps, rir, trueRir, rMax };
  }
  /* Adaptation after a session: independent of what APEX recommended. */
  afterSession(exercisesTrained, sessionQuality) {
    this.sessionsDone += 1;
    for (const ex of exercisesTrained) {
      this.ensure(ex);
      const cur = this.strength.get(ex.id), cap = this.potential.get(ex.id);
      const room = Math.max(0, 1 - cur / cap);
      const rate = this.cfg.adaptation * room * sessionQuality * (0.6 + 0.4 * this.dayState.sleep);
      this.strength.set(ex.id, cur * (1 + rate));
      this.familiarity.set(ex.id, Math.min(1, this.familiarity.get(ex.id) + 0.03));
    }
    this.fatigue = this.rng.clamp(this.fatigue * 0.6 + this.cfg.fatigueGain, 0, 1);
  }
  rest(days) { this.fatigue = this.rng.clamp(this.fatigue * Math.pow(this.cfg.recoveryRate, days), 0, 1); }
  detrain(weeks) {
    for (const [id, v] of this.strength) this.strength.set(id, v * Math.pow(0.985, weeks));
  }
  attends(dayIndex, weekday) {
    let p = this.cfg.attendance;
    for (const w of this.cfg.breakWindows || []) if (dayIndex >= w.from && dayIndex < w.to) p = 0;
    return this.rng.chance(p);
  }
}
module.exports = { AthleteModel, CLASS_FACTOR };
