import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { AppState } from '../core/types';
import {
  APEX_NOTIFICATION_MAX,
  APEX_NOTIFICATION_MIN,
  isNotificationRoute,
  notificationIds,
  notificationIntents,
  reconcileIntents,
  type NotificationLedger,
} from '../engine/notifications';

const LEDGER_KEY = 'apex-notification-ledger-v1';
const ASKED_KEY = 'apex-notification-permission-asked';
const CHANNEL_ID = 'apex-training';

export type NotificationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

function readLedger(): NotificationLedger {
  try {
    const raw = JSON.parse(localStorage.getItem(LEDGER_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function writeLedger(ledger: NotificationLedger): void {
  try { localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger)); } catch { /* the plan is simply recomputed next time */ }
}

/** The system permission as the app sees it. The web build has no notification surface. */
export async function notificationPermission(): Promise<NotificationPermissionState> {
  if (!Capacitor.isNativePlatform()) return 'unsupported';
  try {
    const p = await LocalNotifications.checkPermissions();
    return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** Asks the system for permission. Called when the athlete turns notifications on, and once automatically after they are hydrated. */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!Capacitor.isNativePlatform()) return 'unsupported';
  try {
    try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* ignore */ }
    const p = await LocalNotifications.requestPermissions();
    return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'unsupported';
  }
}

/* Syncs run one at a time: a burst of edits would otherwise interleave cancel and schedule calls and duplicate notifications. */
let chain: Promise<void> = Promise.resolve();

/**
 * Makes the system's pending APEX notifications equal to what the saved state calls for, and nothing else:
 *  - everything APEX scheduled before is cancelled first (the stale ones go, an unchanged one is simply planned again);
 *  - nothing is scheduled when notifications are off or the system permission is not granted (a denial is not re-asked);
 *  - the engine's ledger keeps a notification that already fired from firing again and a pending one at its first time.
 * Delivery itself is the system alarm manager, so it works offline and after a restart; a failure here must never reach training: core training must never fail because of notifications.
 */
export function syncLocalNotifications(state: AppState, now: Date = new Date()): Promise<void> {
  chain = chain.then(() => applySync(state, now)).catch(() => { /* notification delivery is optional */ });
  return chain;
}

async function applySync(state: AppState, now: Date): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const pending = await LocalNotifications.getPending();
  // Never touch notifications owned by other apps. APEX reserves its own numeric range.
  const apexPending = pending.notifications.filter(n => n.id >= APEX_NOTIFICATION_MIN && n.id <= APEX_NOTIFICATION_MAX);
  if (apexPending.length) await LocalNotifications.cancel({ notifications: apexPending.map(n => ({ id: n.id })) });
  if (!state.preferences.notifications.enabled) return;

  let permission = await notificationPermission();
  if (permission === 'prompt') {
    let asked = false;
    try { asked = localStorage.getItem(ASKED_KEY) === '1'; } catch { /* ignore */ }
    if (!asked) permission = await requestNotificationPermission();
  }
  if (permission !== 'granted') return;

  const plan = reconcileIntents(notificationIntents(state, now), readLedger(), now);
  if (plan.schedule.length) {
    await LocalNotifications.createChannel({ id: CHANNEL_ID, name: 'Training reminders', description: 'Scheduled sessions, missed-session follow-ups, the weekly review and recovery checks', importance: 3 });
    const ids = notificationIds(plan.schedule.map(i => i.id));
    await LocalNotifications.schedule({
      notifications: plan.schedule.map(i => ({
        id: ids.get(i.id)!,
        title: i.title,
        body: i.body,
        channelId: CHANNEL_ID,
        schedule: { at: new Date(i.scheduledFor), allowWhileIdle: true },
        extra: { actionRoute: i.actionRoute, kind: i.kind, intentId: i.id },
      })),
    });
  }
  writeLedger(plan.ledger);
}

export async function listenForNotificationActions(onRoute: (route: string) => void): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) return async () => {};
  const handle = await LocalNotifications.addListener('localNotificationActionPerformed', action => {
    const route = action.notification.extra?.actionRoute;
    if (isNotificationRoute(route)) onRoute(route);
  });
  return () => handle.remove();
}
