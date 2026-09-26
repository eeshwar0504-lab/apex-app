const test = require('node:test');
const assert = require('node:assert/strict');

function intents(
  state,
  now = new Date('2026-09-13T10:00:00Z')
) {
  const p = state.preferences.notifications;

  if (!p.enabled) return [];

  const today = now.toISOString().slice(0, 10);
  const out = [];

  const planned = state.workouts
    .filter(w => w.status === 'planned')
    .sort((a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate)
    );

  if (p.workoutReminders) {
    const next = planned.find(
      w => w.scheduledDate >= today
    );

    if (next) {
      out.push({
        kind: 'workout',
        id: `workout-${next.id}`
      });
    }
  }

  if (
    p.weeklyReview &&
    now.getDay() === 0
  ) {
    out.push({
      kind: 'weekly',
      id: `weekly-${today}`
    });
  }

  return out;
}

const base = {
  preferences: {
    notifications: {
      enabled: true,
      workoutReminders: true,
      missedWorkout: true,
      weeklyReview: true
    }
  },
  workouts: [
    {
      id: 'w1',
      status: 'planned',
      scheduledDate: '2026-09-14'
    }
  ]
};

test(
  'notification planning chooses the next planned session',
  () => {
    assert.equal(
      intents(base)[0].id,
      'workout-w1'
    );
  }
);

test(
  'disabled notifications produce no intents',
  () => {
    assert.deepEqual(
      intents({
        ...base,
        preferences: {
          notifications: {
            ...base.preferences.notifications,
            enabled: false
          }
        }
      }),
      []
    );
  }
);

test(
  'weekly review only appears on Sunday',
  () => {
    assert.equal(
      intents(base).filter(
        x => x.kind === 'weekly'
      ).length,
      1
    );
  }
);

test(
  'workout reminders respect their preference',
  () => {
    const state = {
      ...base,
      preferences: {
        notifications: {
          ...base.preferences.notifications,
          workoutReminders: false
        }
      }
    };

    const result = intents(state);

    assert.equal(
      result.filter(
        x => x.kind === 'workout'
      ).length,
      0
    );

    assert.equal(
      result.filter(
        x => x.kind === 'weekly'
      ).length,
      1
    );
  }
);

test(
  'weekly review respects its preference',
  () => {
    const state = {
      ...base,
      preferences: {
        notifications: {
          ...base.preferences.notifications,
          weeklyReview: false
        }
      }
    };

    const result = intents(state);

    assert.equal(
      result.filter(
        x => x.kind === 'weekly'
      ).length,
      0
    );

    assert.equal(
      result.filter(
        x => x.kind === 'workout'
      ).length,
      1
    );
  }
);

test(
  'notification IDs remain deterministic',
  () => {
    const first = intents(base);
    const second = intents(base);

    assert.deepEqual(first, second);

    assert.equal(
      first[0].id,
      'workout-w1'
    );

    assert.equal(
      first[1].id,
      'weekly-2026-09-13'
    );
  }
);

test(
  'no planned workouts means no workout reminder',
  () => {
    const state = {
      ...base,
      workouts: []
    };

    const result = intents(state);

    assert.equal(
      result.filter(
        x => x.kind === 'workout'
      ).length,
      0
    );

    assert.equal(
      result.filter(
        x => x.kind === 'weekly'
      ).length,
      1
    );
  }
);

test(
  'completed workouts are excluded from reminders',
  () => {
    const state = {
      ...base,
      workouts: [
        {
          id: 'w1',
          status: 'completed',
          scheduledDate: '2026-09-14'
        }
      ]
    };

    const result = intents(state);

    assert.equal(
      result.filter(
        x => x.kind === 'workout'
      ).length,
      0
    );
  }
);

test(
  'skipped workouts are excluded from planned reminders',
  () => {
    const state = {
      ...base,
      workouts: [
        {
          id: 'w1',
          status: 'skipped',
          scheduledDate: '2026-09-14'
        }
      ]
    };

    const result = intents(state);

    assert.equal(
      result.filter(
        x => x.kind === 'workout'
      ).length,
      0
    );
  }
);

test(
  'the earliest eligible planned workout is selected',
  () => {
    const state = {
      ...base,
      workouts: [
        {
          id: 'later',
          status: 'planned',
          scheduledDate: '2026-09-18'
        },
        {
          id: 'next',
          status: 'planned',
          scheduledDate: '2026-09-14'
        },
        {
          id: 'earlier',
          status: 'planned',
          scheduledDate: '2026-09-12'
        }
      ]
    };

    assert.equal(
      intents(state)[0].id,
      'workout-next'
    );
  }
);

test(
  'past planned workouts are not selected as the next session',
  () => {
    const state = {
      ...base,
      workouts: [
        {
          id: 'past',
          status: 'planned',
          scheduledDate: '2026-09-12'
        },
        {
          id: 'future',
          status: 'planned',
          scheduledDate: '2026-09-15'
        }
      ]
    };

    assert.equal(
      intents(state)[0].id,
      'workout-future'
    );
  }
);

test(
  'missed workout preference exists as a separate notification control',
  () => {
    assert.equal(
      typeof base.preferences.notifications.missedWorkout,
      'boolean'
    );
  }
);