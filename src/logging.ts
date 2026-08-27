import type { Database } from "bun:sqlite";
import type { ResponseUsage } from "./response";

export interface CreateConversationOptions {
  model: string;
  name?: string;
}

export interface LogResponseRow {
  conversationId: string;
  durationMs: number;
  id: string;
  model: string;
  options?: Record<string, unknown>;
  prompt: string;
  responseText: string;
  system?: string;
  usage?: ResponseUsage;
}

export function createConversation(
  db: Database,
  opts: CreateConversationOptions
): string {
  const id = Bun.randomUUIDv7();
  db.query(
    "INSERT INTO conversations (id, name, model, created_at) VALUES (?, ?, ?, ?)"
  ).run(id, opts.name ?? null, opts.model, new Date().toISOString());
  return id;
}

export function logResponse(db: Database, row: LogResponseRow): void {
  db.query(
    `INSERT INTO responses (
      id, conversation_id, model, prompt, system, options,
      response, usage, created_at, duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.conversationId,
    row.model,
    row.prompt,
    row.system ?? null,
    row.options === undefined ? null : JSON.stringify(row.options),
    row.responseText,
    row.usage === undefined ? null : JSON.stringify(row.usage),
    new Date().toISOString(),
    row.durationMs
  );
}
