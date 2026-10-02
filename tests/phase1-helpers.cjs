'use strict';
/* Shared fixtures for the Phase 1 correctness tests (not itself a test file). */
const { loadEngine } = require('./longitudinal/load-engine.cjs');

const E = loadEngine();
const T = E.training;
const EXERCISES = E.exercisesMod.EXERCISES;
const byId = (id) => EXERCISES.find((e) => e.id === id);

let counter = 0;
const uid = (p) => `${p}${++counter}`;

/** A completed working set. `load` goes to weight, or to assistance for assisted movements. */
function set(ex, load, reps, rir = 2, extra = {}) {
  const s = { id: uid('s'), type: 'working', reps, rir, completed: true, ...extra };
  if (load !== undefined) {
    if (ex && ex.loadSemantics === 'assistance') s.assistance = load;
    else s.weight = load;
  }
  return s;
}

const addDays = (date, days) => E.dates.addDaysLocal(date, days);

/** A completed workout at local noon on `date`. */
function session(ex, date, sets, extra = {}) {
  const [y, m, d] = date.split('-').map(Number);
  const completedAt = new Date(y, m - 1, d, 12, 0).toISOString();
  return { id: uid('w'), planId: 'p', name: 'S', scheduledDate: date, status: 'completed', source: 'scheduled', version: 1, completedAt, updatedAt: completedAt, exercises: [{ exerciseId: ex.id, order: 0, prescribedSets: sets.length, repRange: ex.repRange, restSec: ex.restSec, sets }], ...extra };
}

/** Three sets of `reps` at `load`. */
const threeSets = (ex, load, reps, rir = 2) => [set(ex, load, reps, rir), set(ex, load, reps, rir), set(ex, load, reps, rir)];

const profile = (extra = {}) => ({ id: 'u', name: 'T', experience: 'beginner', goals: ['general'], primaryGoal: 'general', trainingDays: 4, sessionMinutes: 60, equipment: ['machine', 'cable', 'dumbbell', 'barbell', 'bench', 'bodyweight', 'kettlebell'], body: {}, createdAt: '2026-01-01T00:00:00.000Z', ...extra });

const DAY0 = '2026-03-02';

/** The authoritative prescription for `ex` given history, three days after the last session. */
function prescribe(ex, history, prof, asOf = addDays(DAY0, 3)) {
  return T.personalizedLoad(ex, history, prof, EXERCISES, asOf);
}

module.exports = { E, T, EXERCISES, byId, set, session, threeSets, profile, addDays, prescribe, DAY0, uid };
