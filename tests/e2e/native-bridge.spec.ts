import { test, expect, type Page } from '@playwright/test';

import { resetApp, completeOnboarding } from './helpers';

/*
 * Native bridge SIMULATION (not device certification).
 *
 * Chromium cannot run the Android WebView or the native plugins, so this installs a fake Capacitor bridge (`androidBridge` plus plugin
 * headers) with an in-memory SQLite row and notification scheduler. The real app code, the real @capacitor/core proxy and the real
 * plugin JavaScript layers run against it, which proves the wiring: which native calls are made, in what order, and what the app does
 * with the answers. It proves nothing about Android, the native SQLite engine or the alarm manager.
 */

const installBridge = (page: Page, opts: { permission?: 'prompt' | 'granted' | 'denied' } = {}) =>
  page.addInitScript((initial) => {
    const DB = '__fake_native_db';
    const CALLS = '__fake_native_calls';
    const read = (key: string, fallback: unknown) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
    const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
    const getDb = () => { const found = read(DB, null) as any; if (found) return found; const fresh = { payload: null, versions: [], pending: [], permission: initial.permission ?? 'prompt' }; write(DB, fresh); return fresh; };
    const log = (entry: string) => { const calls = read(CALLS, []) as string[]; calls.push(entry); write(CALLS, calls); };
    const listeners: Record<string, Array<(data: unknown) => void>> = {};
    (window as unknown as { __fakeEmit: (name: string, data: unknown) => void }).__fakeEmit = (name, data) => (listeners[name] || []).forEach((fn) => fn(data));

    const plugins: Record<string, Record<string, (o: any) => any>> = {
      CapacitorSQLite: {
        createConnection: () => { log('sqlite.createConnection'); return {}; },
        open: () => { log('sqlite.open'); return {}; },
        execute: () => { log('sqlite.execute'); return { changes: { changes: 0 } }; },
        query: ({ statement }) => {
          const db = getDb();
          if (/FROM schema_migrations/.test(statement)) return { values: db.versions.length ? [{ version: Math.max(...db.versions) }] : [] };
          if (/FROM app_state/.test(statement)) { log('sqlite.read'); return { values: db.payload ? [{ payload: db.payload }] : [] }; }
          return { values: [] };
        },
        run: ({ statement, values }) => {
          const db = getDb();
          if (/INSERT OR IGNORE INTO schema_migrations/.test(statement)) { db.versions.push(values[0]); log(`sqlite.migrate v${values[0]}`); }
          else if (/INSERT OR REPLACE INTO app_state/.test(statement)) { db.payload = values[1]; log('sqlite.write'); }
          else if (/DELETE FROM app_state/.test(statement)) { db.payload = null; log('sqlite.reset'); }
          write(DB, db);
          return { changes: { changes: 1 } };
        },
        close: () => ({}),
      },
      LocalNotifications: {
        getPending: () => ({ notifications: getDb().pending }),
        cancel: ({ notifications }) => { const db = getDb(); db.pending = db.pending.filter((p: any) => !notifications.some((n: any) => n.id === p.id)); write(DB, db); log(`notif.cancel ${notifications.length}`); },
        checkPermissions: () => ({ display: getDb().permission }),
        requestPermissions: () => { const db = getDb(); log('notif.requestPermissions'); if (db.permission === 'prompt') db.permission = 'granted'; write(DB, db); return { display: db.permission }; },
        createChannel: () => { log('notif.createChannel'); },
        schedule: ({ notifications }) => { const db = getDb(); db.pending.push(...notifications); write(DB, db); log(`notif.schedule ${notifications.map((n: any) => n.extra?.kind).join(',')}`); return { notifications: notifications.map((n: any) => ({ id: n.id })) }; },
      },
      App: { exitApp: () => { log('app.exit'); } },
      Filesystem: {
        writeFile: ({ path, data, directory }) => { log(`fs.write ${directory} ${path} ${String(data).length > 0 ? 'nonempty' : 'empty'}`); localStorage.setItem('__fake_exported', String(data)); return { uri: `file:///cache/${path}` }; },
        deleteFile: ({ path }) => { log(`fs.delete ${path}`); },
      },
      Share: {
        share: ({ url }) => { log(`share ${url}`); if (localStorage.getItem('__fake_share_cancel')) throw new Error('Share canceled'); return { activityType: 'fake' }; },
      },
    };
    const headers = Object.entries(plugins).map(([name, methods]) => ({
      name,
      methods: [...Object.keys(methods).map((n) => ({ name: n, rtype: 'promise' })), { name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'promise' }],
    }));
    let nextId = 1;
    (window as any).androidBridge = { postMessage() { /* answers go through nativePromise below */ } };
    (window as any).Capacitor = {
      PluginHeaders: headers,
      nativePromise: (plugin: string, method: string, options: unknown) =>
        Promise.resolve().then(() => (method === 'removeListener' ? undefined : plugins[plugin][method](options || {}))),
      nativeCallback: (_plugin: string, method: string, options: { eventName: string }, callback: (d: unknown) => void) => {
        if (method === 'addListener') { (listeners[options.eventName] ||= []).push(callback); }
        return String(nextId++);
      },
    };
  }, opts);

const calls = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fake_native_calls') || '[]') as string[]);
const nativeDb = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fake_native_db') || '{}'));
const restart = async (page: Page) => {
  // a process restart: the app's own web storage is gone, the native database stays
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('apex-')) localStorage.removeItem(k); });
  await page.reload();
};

test.describe('native bridge simulation', () => {
  test('the native store is migrated, written and is the source of truth after a restart', async ({ page }) => {
    await installBridge(page);
    await resetApp(page);
    await completeOnboarding(page);

    await expect.poll(async () => (await calls(page)).some((c) => c === 'sqlite.migrate v4')).toBe(true);
    await expect.poll(async () => (await calls(page)).filter((c) => c === 'sqlite.write').length).toBeGreaterThan(0);
    const log = await calls(page);
    expect(log.indexOf('sqlite.open')).toBeLessThan(log.indexOf('sqlite.migrate v4'));
    expect(log.indexOf('sqlite.migrate v4')).toBeLessThan(log.indexOf('sqlite.write'));
    const saved = JSON.parse((await nativeDb(page)).payload);
    expect(saved.onboardingComplete).toBe(true);
    expect(saved.workouts.length).toBeGreaterThan(0);

    await restart(page);
    await expect(page.locator('[data-apex-route="home"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Command Center', exact: true })).toBeVisible();
    const after = JSON.parse((await nativeDb(page)).payload);
    expect(after.workouts.length).toBe(saved.workouts.length);
    expect(new Set(after.workouts.map((w: { id: string }) => w.id)).size).toBe(after.workouts.length);
  });

  test('notifications: one permission prompt, channel, a deduplicated plan, cancel-then-reschedule', async ({ page }) => {
    await installBridge(page);
    await resetApp(page);
    await completeOnboarding(page);

    await expect.poll(async () => (await calls(page)).some((c) => c.startsWith('notif.schedule'))).toBe(true);
    const log = await calls(page);
    expect(log.filter((c) => c === 'notif.requestPermissions').length).toBe(1);
    expect(log).toContain('notif.createChannel');
    const pending = (await nativeDb(page)).pending as Array<{ id: number; extra: { intentId: string; actionRoute: string } }>;
    expect(pending.length).toBeGreaterThan(0);
    expect(new Set(pending.map((p) => p.id)).size).toBe(pending.length);
    expect(new Set(pending.map((p) => p.extra.intentId)).size).toBe(pending.length);
    for (const p of pending) expect(['home', 'train', 'progress', 'coach']).toContain(p.extra.actionRoute);

    await restart(page);
    await expect(page.locator('[data-apex-route="home"]')).toBeVisible();
    await expect.poll(async () => (await nativeDb(page)).pending.length).toBe(pending.length);
    expect((await calls(page)).filter((c) => c === 'notif.requestPermissions').length).toBe(1);
  });

  test('notifications: turning them off cancels everything and schedules nothing', async ({ page }) => {
    await installBridge(page);
    await resetApp(page);
    await completeOnboarding(page);
    await expect.poll(async () => (await nativeDb(page)).pending.length).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'You', exact: true }).first().click();
    const toggle = page.getByLabel('Notifications enabled');
    await toggle.scrollIntoViewIfNeeded();
    await toggle.uncheck();
    await expect.poll(async () => (await nativeDb(page)).pending.length).toBe(0);
    const scheduledBefore = (await calls(page)).filter((c) => c.startsWith('notif.schedule')).length;
    await page.waitForTimeout(500);
    expect((await calls(page)).filter((c) => c.startsWith('notif.schedule')).length).toBe(scheduledBefore);
  });

  test('notifications: a denied permission schedules nothing, is not re-asked, and the settings say why', async ({ page }) => {
    await installBridge(page, { permission: 'denied' });
    await resetApp(page);
    await completeOnboarding(page);

    await page.getByRole('button', { name: 'You', exact: true }).first().click();
    await expect(page.getByText(/blocked in Android settings/)).toBeVisible();
    const log = await calls(page);
    expect(log.filter((c) => c.startsWith('notif.schedule')).length).toBe(0);
    expect((await nativeDb(page)).pending.length).toBe(0);
  });

  test('a notification tap opens only a known surface', async ({ page }) => {
    await installBridge(page);
    await resetApp(page);
    await completeOnboarding(page);
    await page.evaluate(() => (window as any).__fakeEmit('localNotificationActionPerformed', { notification: { extra: { actionRoute: 'progress' } } }));
    await expect(page.locator('[data-apex-route="progress"]')).toBeVisible();
    await page.evaluate(() => (window as any).__fakeEmit('localNotificationActionPerformed', { notification: { extra: { actionRoute: 'not-a-route' } } }));
    await expect(page.locator('[data-apex-route="progress"]')).toBeVisible();
  });

  test('Android backup export goes through the share sheet (a blob download does nothing in the WebView) and the cache copy is removed', async ({ page }) => {
    await installBridge(page);
    await resetApp(page);
    await completeOnboarding(page);
    await page.getByRole('button', { name: 'You', exact: true }).first().click();
    await page.getByLabel('Backup passphrase').fill('correct horse battery');
    await page.getByRole('button', { name: 'Create encrypted backup' }).click();
    await expect(page.getByText(/Backup created|Encrypted backup created/)).toBeVisible();
    const log = await calls(page);
    expect(log.some((c) => /^fs\.write CACHE apex-backup-\d{4}-\d{2}-\d{2}\.apex nonempty$/.test(c))).toBe(true);
    expect(log.some((c) => c.startsWith('share file:///cache/apex-backup-'))).toBe(true);
    expect(log.some((c) => c.startsWith('fs.delete apex-backup-'))).toBe(true);
    const exported = await page.evaluate(() => localStorage.getItem('__fake_exported') || '');
    expect(JSON.parse(exported).format).toBe('APEX_ENCRYPTED_BACKUP');
    expect(exported).not.toContain('onboardingComplete'); // encrypted: no plain state in the file
  });

  test('closing the share sheet is reported as not saved, not as a backup', async ({ page }) => {
    await installBridge(page);
    await resetApp(page);
    await completeOnboarding(page);
    await page.evaluate(() => localStorage.setItem('__fake_share_cancel', '1'));
    await page.getByRole('button', { name: 'You', exact: true }).first().click();
    await page.getByLabel('Backup passphrase').fill('correct horse battery');
    await page.getByRole('button', { name: 'Create encrypted backup' }).click();
    await expect(page.getByText(/Backup not saved/)).toBeVisible();
  });
});
