import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { dbPath, type Env } from "./paths";

export const MIGRATIONS: string[] = [
  `CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  name TEXT,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE responses (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  system TEXT,
  options TEXT,
  response TEXT NOT NULL,
  usage TEXT,
  created_at TEXT NOT NULL,
  duration_ms INTEGER
);
CREATE INDEX idx_responses_conversation ON responses(conversation_id, created_at);`,
];

export function openDb(env: Env = process.env): Database {
  const path = dbPath(env);
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON");
  const version = db
    .query<{ user_version: number }, []>("PRAGMA user_version")
    .get()?.user_version;

  for (let index = version ?? 0; index < MIGRATIONS.length; index += 1) {
    const migrate = db.transaction(() => {
      db.exec(MIGRATIONS[index] ?? "");
      db.exec(`PRAGMA user_version = ${index + 1}`);
    });
    migrate();
  }

  return db;
}
