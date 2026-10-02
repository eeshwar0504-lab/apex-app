/**
 * Native SQLite schema versioning.
 *
 * The ordered migration list is the ONLY authority on the SQLite schema version: SQLITE_SCHEMA_VERSION is derived
 * from it, and the adapter stamps every row it writes with that value. To change the schema, append a migration with
 * the next version number. Never edit or reorder a migration that has shipped.
 *
 * Rules for a migration:
 *  - statements must be idempotent (CREATE ... IF NOT EXISTS, guarded ALTERs). A migration that is interrupted before
 *    its version is recorded is simply run again on the next open.
 *  - the version is recorded only after every statement has run.
 *
 * This module has no Capacitor import, so it is exercised by the Node tests with a fake database.
 */

export interface SqlDatabase {
  execute(sql: string): Promise<unknown>;
  run(sql: string, values?: unknown[]): Promise<unknown>;
  query(sql: string): Promise<{ values?: Array<Record<string, unknown>> }>;
}

export interface SqliteMigration {
  version: number;
  description: string;
  statements: string[];
}

export const SQLITE_MIGRATIONS: readonly SqliteMigration[] = [
  {
    // Baseline of every database written by APEX 3.x/4.0: one row holding the whole app state.
    version: 4,
    description: 'app_state: a single row holding the serialized application state',
    statements: [
      `CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK(id=1),
        schema_version INTEGER NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
    ],
  },
];

/** A database written by a newer APEX than this one. It is left untouched rather than downgraded or overwritten. */
export class SqliteSchemaTooNewError extends Error {
  constructor(readonly found: number, readonly supported: number) {
    super(`The native database is at schema version ${found}, newer than this app supports (${supported}).`);
    this.name = 'SqliteSchemaTooNewError';
  }
}

/** Versions must be positive integers in strictly increasing order. */
export function validateMigrations(migrations: readonly SqliteMigration[]): void {
  let previous = 0;
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= previous) {
      throw new Error(`SQLite migration versions must be positive integers in strictly increasing order (got ${migration.version} after ${previous}).`);
    }
    if (!migration.statements.length) throw new Error(`SQLite migration ${migration.version} has no statements.`);
    previous = migration.version;
  }
}

export const latestVersion = (migrations: readonly SqliteMigration[] = SQLITE_MIGRATIONS): number =>
  migrations.length ? migrations[migrations.length - 1].version : 0;

/** The schema version this build of APEX reads and writes. */
export const SQLITE_SCHEMA_VERSION = latestVersion();

/** Brings the database to the latest version. Returns the versions that were applied by this call. */
export async function runSqliteMigrations(
  db: SqlDatabase,
  migrations: readonly SqliteMigration[] = SQLITE_MIGRATIONS,
  now: () => string = () => new Date().toISOString(),
): Promise<number[]> {
  validateMigrations(migrations);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = await db.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
  const highestApplied = Number(applied.values?.[0]?.version ?? 0);
  const latest = latestVersion(migrations);

  if (highestApplied > latest) throw new SqliteSchemaTooNewError(highestApplied, latest);

  const ran: number[] = [];
  for (const migration of migrations) {
    if (migration.version <= highestApplied) continue;
    for (const statement of migration.statements) await db.execute(statement);
    await db.run('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(?, ?)', [migration.version, now()]);
    ran.push(migration.version);
  }
  return ran;
}
