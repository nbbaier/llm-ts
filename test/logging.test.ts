import type { Database } from "bun:sqlite";
import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { openDb } from "../src/db";
import { createConversation, logResponse } from "../src/logging";
import { Model } from "../src/model";

const tempDirectories: string[] = [];

function tempDb(): Database {
  const home = mkdtempSync(join(tmpdir(), "llmts-logging-"));
  tempDirectories.push(home);
  return openDb({ LLM_TS_HOME: home });
}

function mockModel(): Model {
  const languageModel = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { id: "1", type: "text-start" as const },
          { delta: "Hello", id: "1", type: "text-delta" as const },
          { delta: " world", id: "1", type: "text-delta" as const },
          { id: "1", type: "text-end" as const },
          {
            finishReason: { raw: undefined, unified: "stop" as const },
            type: "finish" as const,
            usage: {
              inputTokens: {
                cacheRead: undefined,
                cacheWrite: undefined,
                noCache: undefined,
                total: 4,
              },
              outputTokens: { reasoning: undefined, text: undefined, total: 2 },
            },
          },
        ],
      }),
    }),
  });
  return new Model({ id: "mock:test", languageModel });
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("createConversation and logResponse persist every field", () => {
  const db = tempDb();
  const conversationId = createConversation(db, {
    model: "mock:test",
    name: "Test conversation",
  });

  logResponse(db, {
    conversationId,
    durationMs: 123,
    id: "response-id",
    model: "mock:test",
    options: { temperature: 0.5 },
    prompt: "Say hello",
    responseText: "Hello world",
    system: "Be brief",
    usage: { inputTokens: 4, outputTokens: 2 },
  });

  const conversation = db.query("SELECT * FROM conversations").get() as Record<
    string,
    unknown
  >;
  expect(conversation.id).toBe(conversationId);
  expect(conversationId[14]).toBe("7");
  expect(conversation.name).toBe("Test conversation");
  expect(conversation.model).toBe("mock:test");
  expect(new Date(conversation.created_at as string).toISOString()).toBe(
    conversation.created_at as string
  );

  const response = db.query("SELECT * FROM responses").get() as Record<
    string,
    unknown
  >;
  expect(response).toMatchObject({
    conversation_id: conversationId,
    duration_ms: 123,
    id: "response-id",
    model: "mock:test",
    prompt: "Say hello",
    response: "Hello world",
    system: "Be brief",
  });
  expect(JSON.parse(response.options as string)).toEqual({ temperature: 0.5 });
  expect(JSON.parse(response.usage as string)).toEqual({
    inputTokens: 4,
    outputTokens: 2,
  });
  expect(new Date(response.created_at as string).toISOString()).toBe(
    response.created_at as string
  );
  db.close();
});

test("logResponse rejects a missing conversation", () => {
  const db = tempDb();

  expect(() =>
    logResponse(db, {
      conversationId: "missing",
      durationMs: 1,
      id: "response-id",
      model: "mock:test",
      prompt: "Hello",
      responseText: "Hi",
    })
  ).toThrow("FOREIGN KEY constraint failed");
  expect(
    db
      .query<{ count: number }, []>("SELECT count(*) AS count FROM responses")
      .get()
  ).toEqual({ count: 0 });
  db.close();
});

test("Model.prompt logs once by default when the response completes", async () => {
  const db = tempDb();
  const response = mockModel().prompt("Say hello", {
    db,
    options: { temperature: 0.5 },
    system: "Be brief",
  });

  expect(await response.text()).toBe("Hello world");
  expect(await response.text()).toBe("Hello world");

  expect(
    db
      .query<{ count: number }, []>(
        "SELECT count(*) AS count FROM conversations"
      )
      .get()
  ).toEqual({ count: 1 });
  const logged = db.query("SELECT * FROM responses").get() as Record<
    string,
    unknown
  >;
  expect(logged).toMatchObject({
    model: "mock:test",
    prompt: "Say hello",
    response: "Hello world",
    system: "Be brief",
  });
  expect(logged.id?.toString()[14]).toBe("7");
  expect(JSON.parse(logged.options as string)).toEqual({ temperature: 0.5 });
  expect(JSON.parse(logged.usage as string)).toEqual({
    inputTokens: 4,
    outputTokens: 2,
  });
  expect(logged.duration_ms).toBeGreaterThanOrEqual(0);
  db.close();
});

test("log false disables response logging", async () => {
  const db = tempDb();

  expect(await mockModel().prompt("No log", { db, log: false }).text()).toBe(
    "Hello world"
  );

  expect(
    db
      .query<{ count: number }, []>(
        "SELECT count(*) AS count FROM conversations"
      )
      .get()
  ).toEqual({ count: 0 });
  expect(
    db
      .query<{ count: number }, []>("SELECT count(*) AS count FROM responses")
      .get()
  ).toEqual({ count: 0 });
  db.close();
});

test("each one-shot prompt creates a new conversation", async () => {
  const db = tempDb();
  const model = mockModel();

  await model.prompt("First", { db }).text();
  await model.prompt("Second", { db }).text();

  expect(
    db
      .query<{ count: number }, []>(
        "SELECT count(*) AS count FROM conversations"
      )
      .get()
  ).toEqual({ count: 2 });
  expect(
    db
      .query<{ count: number }, []>(
        "SELECT count(DISTINCT conversation_id) AS count FROM responses"
      )
      .get()
  ).toEqual({ count: 2 });
  db.close();
});

test("a supplied conversation id is reused", async () => {
  const db = tempDb();
  const model = mockModel();
  const conversationId = createConversation(db, { model: "mock:test" });

  await model.prompt("Continue", { conversationId, db }).text();

  expect(
    db
      .query<{ conversation_id: string }, []>(
        "SELECT conversation_id FROM responses"
      )
      .get()
  ).toEqual({ conversation_id: conversationId });
  expect(
    db
      .query<{ count: number }, []>(
        "SELECT count(*) AS count FROM conversations"
      )
      .get()
  ).toEqual({ count: 1 });
  db.close();
});

test("one-shot logging rolls back its conversation when the response insert fails", async () => {
  const db = tempDb();
  db.exec(`CREATE TRIGGER reject_response
    BEFORE INSERT ON responses
    BEGIN
      SELECT RAISE(ABORT, 'response rejected');
    END`);
  const warning = spyOn(process.stderr, "write").mockImplementation(() => true);

  expect(await mockModel().prompt("Still return this", { db }).text()).toBe(
    "Hello world"
  );

  expect(warning).toHaveBeenCalledTimes(1);
  expect(
    db
      .query<{ count: number }, []>(
        "SELECT count(*) AS count FROM conversations"
      )
      .get()
  ).toEqual({ count: 0 });
  warning.mockRestore();
  db.close();
});

test("a closed database warns once without losing response text", async () => {
  const db = tempDb();
  const response = mockModel().prompt("Still return this", { db });
  db.close();
  const warning = spyOn(process.stderr, "write").mockImplementation(() => true);

  expect(await response.text()).toBe("Hello world");
  expect(await response.text()).toBe("Hello world");
  expect(warning).toHaveBeenCalledTimes(1);
  expect(warning.mock.calls[0]?.[0]?.toString()).toContain(
    "failed to log response"
  );
  warning.mockRestore();
});
