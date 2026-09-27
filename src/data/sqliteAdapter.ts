/**
 * Native persistence boundary.
 *
 * APEX uses localStorage as its browser/Playwright persistence fallback.
 * Capacitor SQLite is used only when the application is actually running
 * inside a native Capacitor platform such as Android.
 *
 * The domain never talks to SQLite directly.
 */
import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';

export class ApexSQLiteStore {
  private readonly connection = new SQLiteConnection(CapacitorSQLite);

  private db?: SQLiteDBConnection;

  /**
   * SQLite is a native persistence implementation.
   *
   * Do not initialise it in:
   * - Vite development
   * - Playwright
   * - browser preview
   * - other web environments
   *
   * This keeps the repository's localStorage fallback deterministic on web.
   */
  private get isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Open the native APEX database.
   *
   * On web this is intentionally a no-op and returns undefined.
   * The repository will continue using its browser persistence layer.
   */
  async open(): Promise<SQLiteDBConnection | undefined> {
    if (!this.isNative) {
      return undefined;
    }

    if (this.db) {
      return this.db;
    }

    this.db = await this.connection.createConnection(
      'apex',
      false,
      'no-encryption',
      1,
      false
    );

    await this.db.open();

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK(id=1),
        schema_version INTEGER NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    return this.db;
  }

  /**
   * Read the native persisted application state.
   *
   * Web:
   *   Returns undefined so repository.loadAsync() falls back to localStorage.
   *
   * Android:
   *   Reads the single authoritative native application-state row.
   */
  async read(): Promise<string | undefined> {
    if (!this.isNative) {
      return undefined;
    }

    const db = await this.open();

    if (!db) {
      return undefined;
    }

    const result = await db.query(
      'SELECT payload FROM app_state WHERE id=1'
    );

    return result.values?.[0]?.payload as string | undefined;
  }

  /**
   * Reset native persisted state.
   *
   * Web:
   *   No-op. Browser state is owned by repository.ts/localStorage.
   *
   * Android:
   *   Removes the single persisted APEX state row.
   */
  async reset(): Promise<void> {
    if (!this.isNative) {
      return;
    }

    const db = await this.open();

    if (!db) {
      return;
    }

    await db.run(
      'DELETE FROM app_state WHERE id=1'
    );
  }

  /**
   * Persist native application state.
   *
   * Web:
   *   No-op. repository.save() already persists to localStorage.
   *
   * Android:
   *   Writes the complete serialized APEX state into SQLite.
   */
  async write(payload: string): Promise<void> {
    if (!this.isNative) {
      return;
    }

    const db = await this.open();

    if (!db) {
      return;
    }

    await db.run(
      `
        INSERT OR REPLACE INTO app_state(
          id,
          schema_version,
          payload,
          updated_at
        )
        VALUES(
          1,
          4,
          ?,
          ?
        )
      `,
      [
        payload,
        new Date().toISOString(),
      ]
    );
  }
}