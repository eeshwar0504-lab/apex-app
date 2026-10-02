'use strict';
/*
 * Phase 4 / Objective 22: library actions. "Use in training" adds the exercise to the athlete's next editable workout
 * through the one rule shared with Plan Studio (src/engine/workoutEdit.ts). History is never touched.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, T, EXERCISES, byId, session, threeSets, profile, addDays, DAY0 } = require('./phase1-helpers.cjs');

const W = E.workoutEdit;
const press = byId('machine_chest_press');
const row = byId('seated_cable_row');
const NOW = '2026-03-10T09:00:00.000Z';
const TODAY = '2026-03-10';
const planned = (date, ids = ['machine_chest_press'], extra = {}) => ({ ...T.createWorkout('Upper', date, ids, EXERCISES, 'p'), id: 'w-' + date + '-' + ids.join(), ...extra });

test('WE1 an exercise is added as a new entry with two empty working sets, a new version, and nothing else changes', () => {
  const w = planned(TODAY);
  const snapshot = JSON.stringify(w);
  const r = W.addExerciseToWorkout(w, row, { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.workout.exercises.length, 2);
  const added = r.workout.exercises[1];
  assert.equal(added.exerciseId, 'seated_cable_row');
  assert.equal(added.order, 1);
  assert.equal(added.prescribedSets, 2);
  assert.equal(added.sets.length, 2);
  assert.ok(added.sets.every((s) => s.type === 'working' && s.completed === false));
  assert.deepEqual(added.repRange, row.repRange);
  assert.equal(added.restSec, row.restSec);
  assert.equal(r.workout.version, w.version + 1);
  assert.equal(r.workout.updatedAt, NOW);
  assert.deepEqual(r.workout.exercises[0], w.exercises[0], 'existing entries are untouched');
  assert.equal(JSON.stringify(w), snapshot, 'the input workout is never mutated');
});

test('WE2 the exercise as programmed for the goal is what is added (rep range and rest follow the goal)', () => {
  const programmed = E.goalProgram.programExercise(press, 'strength');
  const r = W.addExerciseToWorkout(planned(TODAY, ['seated_cable_row']), programmed, { now: NOW });
  assert.deepEqual(r.workout.exercises[1].repRange, [5, 9]);
  assert.equal(r.workout.exercises[1].restSec, 120);
});

test('WE3 a duplicate is refused unless explicitly allowed (Plan Studio allows it)', () => {
  const w = planned(TODAY);
  const refused = W.addExerciseToWorkout(w, press, { now: NOW });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'already-in-workout');
  assert.match(refused.message, /already in/);
  const allowed = W.addExerciseToWorkout(w, press, { now: NOW, allowDuplicate: true });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.workout.exercises.length, 2);
});

test('WE4 equipment: an exercise the athlete cannot do is refused with a reason; bodyweight is always allowed', () => {
  const w = planned(TODAY);
  const refused = W.addExerciseToWorkout(w, byId('barbell_bench_press'), { now: NOW, equipment: ['machine'] });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'equipment-unavailable');
  assert.equal(W.addExerciseToWorkout(w, row, { now: NOW, equipment: ['cable'] }).ok, true);
  assert.equal(W.addExerciseToWorkout(w, byId('plank'), { now: NOW, equipment: ['machine'] }).ok, true, 'a bodyweight movement needs no equipment');
  assert.equal(W.addExerciseToWorkout(w, byId('plank'), { now: NOW, equipment: [] }).ok, true);
  assert.equal(W.addExerciseToWorkout(w, row, { now: NOW }).ok, true, 'no equipment list given: no filtering (Plan Studio)');
});

test('WE5 only a workout that has not started can be edited', () => {
  const base = planned(TODAY);
  assert.equal(W.isEditableWorkout(base), true);
  assert.equal(W.isEditableWorkout({ ...base, status: 'rescheduled' }), true);
  for (const status of ['completed', 'in_progress', 'skipped', 'missed', 'extra']) assert.equal(W.isEditableWorkout({ ...base, status }), false, status);
  assert.equal(W.isEditableWorkout({ ...base, completedAt: NOW }), false);
  assert.equal(W.isEditableWorkout({ ...base, startedAt: NOW }), false);
  const logged = { ...base, exercises: [{ ...base.exercises[0], sets: base.exercises[0].sets.map((s, i) => (i === 0 ? { ...s, completed: true, reps: 8, weight: 20 } : s)) }] };
  assert.equal(W.isEditableWorkout(logged), false, 'a logged set makes it history');
  assert.equal(W.isEditableWorkout({ ...base, guidedSession: { phase: 'training' } }), false, 'an open guided session');
  assert.equal(W.isEditableWorkout({ ...base, guidedSession: { phase: 'prep' } }), true, 'prepared but not started');
  const r = W.addExerciseToWorkout({ ...base, status: 'completed' }, row, { now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not-editable');
});

test('WE6 the next editable workout: soonest from today, skipping history, missed and started ones', () => {
  const done = session(press, addDays(TODAY, -2), threeSets(press, 20, 10));
  const started = planned(TODAY, ['lat_pulldown'], { status: 'in_progress', startedAt: NOW });
  const later = planned(addDays(TODAY, 4), ['leg_press']);
  const sooner = planned(addDays(TODAY, 2), ['seated_cable_row']);
  const missed = planned(addDays(TODAY, -1), ['hammer_curl'], { status: 'missed' });
  const past = planned(addDays(TODAY, -3), ['cable_curl']);
  assert.equal(W.nextEditableWorkout([done, started, later, sooner, missed, past], TODAY).id, sooner.id);
  assert.equal(W.nextEditableWorkout([done, started, missed, past], TODAY), undefined, 'nothing upcoming: no target');
  assert.equal(W.nextEditableWorkout([], TODAY), undefined);
  assert.equal(W.nextEditableWorkout([planned(TODAY)], 'not-a-date'), undefined);
  const today1 = planned(TODAY, ['leg_press']);
  const today2 = planned(TODAY, ['hammer_curl']);
  assert.equal(W.nextEditableWorkout([today1, today2], TODAY).id, today1.id, 'ties keep stored order');
  assert.equal(W.nextEditableWorkout([planned(addDays(TODAY, -1))], TODAY), undefined, 'yesterday is not upcoming (local day arithmetic)');
});

test('WE7 an added exercise is prescribed by the normal engine on preparation, and history is untouched', () => {
  const history = [session(row, addDays(DAY0, -6), threeSets(row, 30, 12)), session(row, addDays(DAY0, -3), threeSets(row, 30, 12))];
  const before = JSON.stringify(history);
  const w = planned(addDays(DAY0, 1));
  const added = W.addExerciseToWorkout(w, row, { now: NOW }).workout;
  const prepared = T.applyWorkoutAdaptation(added, EXERCISES, history, profile());
  const rec = T.personalizedLoad(row, history, profile(), EXERCISES, added.scheduledDate);
  assert.equal(prepared.exercises[1].recommendedWeight, rec.weight, 'the same prescription any exercise gets');
  assert.ok(rec.weight > 30, 'twelve reps on three sessions earns an increase');
  assert.equal(JSON.stringify(history), before);
});

test('WE8 no exercise in the catalogue can be added in a way that breaks the entry shape', () => {
  for (const ex of EXPECTED_ALL()) {
    const r = W.addExerciseToWorkout(planned(TODAY, ['seated_cable_row']), ex, { now: NOW });
    if (ex.id === 'seated_cable_row') continue;
    assert.equal(r.ok, true, ex.id);
    const entry = r.workout.exercises[1];
    assert.ok(entry.sets.length === 2 && entry.prescribedSets === 2 && entry.repRange[0] < entry.repRange[1] && entry.restSec > 0, ex.id);
    if (ex.loadSemantics === 'time') assert.ok(entry.sets.every((s) => typeof s.seconds === 'number' && s.seconds > 0), `${ex.id}: a timed exercise starts with a duration`);
  }
});
function EXPECTED_ALL() { return EXERCISES; }
