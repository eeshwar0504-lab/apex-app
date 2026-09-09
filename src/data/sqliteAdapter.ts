/**
 * Native persistence boundary. The web app uses the repository fallback when
 * SQLite is unavailable; Android can use this adapter through Capacitor.
 * The domain never talks to SQLite directly.
 */
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

export class ApexSQLiteStore {
  private connection = new SQLiteConnection(CapacitorSQLite);
  private db?: SQLiteDBConnection;
  async open(){
    this.db=await this.connection.createConnection('apex',false,'no-encryption',1,false);
    await this.db.open();
    await this.db.execute(`CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), schema_version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);`);
    return this.db;
  }
  async read(){
    if(!this.db)await this.open();
    const r=await this.db!.query('SELECT payload FROM app_state WHERE id=1');
    return r.values?.[0]?.payload as string|undefined;
  }
  async reset(){
    if(!this.db)await this.open();
    await this.db!.run('DELETE FROM app_state WHERE id=1');
  }
  async write(payload:string){
    if(!this.db)await this.open();
    await this.db!.run('INSERT OR REPLACE INTO app_state(id,schema_version,payload,updated_at) VALUES(1,4,?,?)',[payload,new Date().toISOString()]);
  }
}
