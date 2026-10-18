import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// Migrazioni: array ordinato, mai modificare quelle già rilasciate, solo aggiungerne.
export const MIGRATIONS = [
  {
    version: 1,
    name: "schema iniziale",
    sql: `
      CREATE TABLE campaigns (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, data TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE entities (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        type TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_entities_campaign ON entities(campaign_id, type);
      CREATE TABLE relations (
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        from_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        to_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        field TEXT NOT NULL
      );
      CREATE INDEX idx_rel_from ON relations(from_id);
      CREATE INDEX idx_rel_to ON relations(to_id);
      CREATE TABLE revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, kind TEXT NOT NULL,
        version INTEGER NOT NULL, name TEXT, data TEXT NOT NULL,
        source TEXT NOT NULL, note TEXT, at TEXT NOT NULL
      );
      CREATE INDEX idx_rev_entity ON revisions(entity_id, version);
      CREATE INDEX idx_rev_campaign ON revisions(campaign_id, id);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `,
  },
];

export function openDb(file, migrations = MIGRATIONS) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  migrate(db, migrations);
  return db;
}

export function currentVersion(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT NOT NULL)");
  const r = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get();
  return r.v ?? 0;
}

/** Applica le migrazioni mancanti, ciascuna in transazione. Rifiuta DB più nuovi del codice. */
export function migrate(db, migrations = MIGRATIONS) {
  const cur = currentVersion(db);
  const latest = migrations[migrations.length - 1].version;
  if (cur > latest) throw new Error(`Il database è alla versione schema ${cur}, più recente di questa app (${latest}). Aggiorna l'applicazione.`);
  for (const m of migrations.filter((x) => x.version > cur)) {
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations(version,name,applied_at) VALUES (?,?,?)").run(m.version, m.name, new Date().toISOString());
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`Migrazione ${m.version} (${m.name}) fallita: ${e.message}`);
    }
  }
  return currentVersion(db);
}

// Transazione rientrante: la più esterna usa BEGIN/COMMIT, le annidate SAVEPOINT.
const depth = new WeakMap();
export function tx(db, fn) {
  const d = depth.get(db) ?? 0;
  const sp = `sp${d}`;
  db.exec(d === 0 ? "BEGIN" : `SAVEPOINT ${sp}`);
  depth.set(db, d + 1);
  try {
    const r = fn();
    db.exec(d === 0 ? "COMMIT" : `RELEASE ${sp}`);
    return r;
  } catch (e) {
    db.exec(d === 0 ? "ROLLBACK" : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw e;
  } finally {
    depth.set(db, d);
  }
}
