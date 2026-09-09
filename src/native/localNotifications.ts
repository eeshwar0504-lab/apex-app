import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { AppState } from '../core/types';
import { notificationIntents } from '../engine/notifications';

const APEX_NOTIFICATION_MIN = 1800000000;
const APEX_NOTIFICATION_MAX = 1899999999;

export async function syncLocalNotifications(state: AppState): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const pending = await LocalNotifications.getPending();
    // Never touch notifications owned by other apps. APEX reserves its own numeric range.
    const apexPending = pending.notifications.filter(n => n.id >= APEX_NOTIFICATION_MIN && n.id <= APEX_NOTIFICATION_MAX);
    if (apexPending.length) {
      await LocalNotifications.cancel({ notifications: apexPending.map(n => ({ id: n.id })) });
    }
    if (!state.preferences.notifications.enabled) return;

    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') {
      const requested = await LocalNotifications.requestPermissions();
      if (requested.display !== 'granted') return;
    }

    const intents = notificationIntents(state)
      .filter(i => new Date(i.scheduledFor).getTime() > Date.now());
    if (!intents.length) return;

    await LocalNotifications.schedule({
      notifications: intents.map((i, index) => ({
        id: stableNotificationId(i.id, index),
        title: i.title,
        body: i.body,
        schedule: { at: new Date(i.scheduledFor) },
        extra: { actionRoute: i.actionRoute, kind: i.kind, intentId: i.id },
      }))
    });
  } catch {
    // Notification delivery is optional; core training must never fail because of it.
  }
}

export async function listenForNotificationActions(onRoute: (route: string) => void): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) return async () => {};
  const handle = await LocalNotifications.addListener('localNotificationActionPerformed', action => {
    const route = action.notification.extra?.actionRoute;
    if (typeof route === 'string' && route) onRoute(route);
  });
  return () => handle.remove();
}

function stableNotificationId(seed: string, offset: number): number {
  let hash = 2166136261;
  for (const ch of seed) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return APEX_NOTIFICATION_MIN + (Math.abs(hash + offset) % (APEX_NOTIFICATION_MAX - APEX_NOTIFICATION_MIN + 1));
}
