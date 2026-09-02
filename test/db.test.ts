import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db";

const tempDirectories: string[] = [];

function tempHome(): string {
  const directory = mkdtempSync(join(tmpdir(), "llmts-db-"));
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("openDb creates and migrates a fresh database", () => {
  const home = tempHome();
  const databasePath = join(home, "nested", "logs.db");
  const db = openDb({ LLM_TS_HOME: join(home, "nested") });

  expect(existsSync(databasePath)).toBe(true);
  expect(
    db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      )
      .all()
  ).toEqual([{ name: "conversations" }, { name: "responses" }]);
  expect(
    db.query<{ user_version: number }, []>("PRAGMA user_version").get()
  ).toEqual({ user_version: 1 });
  expect(
    db.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get()
  ).toEqual({ foreign_keys: 1 });
  expect(
    db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_responses_conversation'"
      )
      .get()
  ).toEqual({ name: "idx_responses_conversation" });
  db.close();
});

test("openDb applies migrations idempotently", () => {
  const home = tempHome();
  const env = { LLM_TS_HOME: home };
  const first = openDb(env);
  first.close();

  const second = openDb(env);
  expect(
    second.query<{ user_version: number }, []>("PRAGMA user_version").get()
  ).toEqual({ user_version: 1 });
  expect(
    second
      .query<{ count: number }, []>(
        "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('conversations', 'responses')"
      )
      .get()
  ).toEqual({ count: 2 });
  second.close();
});
