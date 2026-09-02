import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { Model } from "../src/model";
import { resolveSchema } from "../src/schema";

const FIXTURES = join(import.meta.dir, "fixtures");
const INLINE_PARSE_ERROR = /Could not parse schema "\{\\"type\\":\}":/;

const generateResult = (value: unknown) => ({
  content: [{ text: JSON.stringify(value), type: "text" as const }],
  finishReason: { raw: undefined, unified: "stop" as const },
  usage: {
    inputTokens: {
      cacheRead: undefined,
      cacheWrite: undefined,
      noCache: undefined,
      total: 1,
    },
    outputTokens: { reasoning: undefined, text: undefined, total: 1 },
  },
  warnings: [],
});

test("resolves an inline JSON Schema", async () => {
  const resolved = await resolveSchema('{"type":"object"}');

  expect(resolved.kind).toBe("json");
  if (resolved.kind === "json") {
    expect(await resolved.schema.jsonSchema).toEqual({ type: "object" });
  }
});

test("resolves a JSON Schema file relative to cwd", async () => {
  const resolved = await resolveSchema("schema.json", FIXTURES);

  expect(resolved.kind).toBe("json");
  if (resolved.kind === "json") {
    expect(await resolved.schema.jsonSchema).toMatchObject({ type: "object" });
  }
});

test("resolves a default-exported zod schema relative to cwd", async () => {
  const resolved = await resolveSchema("schema.ts", FIXTURES);

  expect(resolved.kind).toBe("zod");
  if (resolved.kind === "zod") {
    expect(resolved.schema.parse({ name: "Pelly" })).toEqual({ name: "Pelly" });
  }
});

test("malformed inline JSON names the input and parse failure", async () => {
  await expect(resolveSchema('{"type":}')).rejects.toThrow(INLINE_PARSE_ERROR);
});

test("a schema module without a default zod export gives guidance", async () => {
  const directory = mkdtempSync(join(tmpdir(), "llmts-schema-"));
  writeFileSync(join(directory, "missing.ts"), "export const schema = {};\n");

  await expect(resolveSchema("missing.ts", directory)).rejects.toThrow(
    'Schema module "missing.ts" must export default z.object(...)'
  );
});

test("object mode exposes json, pretty text, and one replayable chunk", async () => {
  const languageModel = new MockLanguageModelV4({
    doGenerate: generateResult({ name: "Pelly" }),
  });
  const model = new Model({ id: "mock:test", languageModel });
  const schema = await resolveSchema("schema.json", FIXTURES);
  const response = model.prompt("extract a name", {
    options: { temperature: 0.5 },
    schema,
    system: "Return a person",
  });

  expect(languageModel.doGenerateCalls).toHaveLength(0);
  expect(await response.json()).toEqual({ name: "Pelly" });

  const prettyJson = '{\n  "name": "Pelly"\n}';
  expect(await response.text()).toBe(prettyJson);

  const chunks: string[] = [];
  for await (const chunk of response) {
    chunks.push(chunk);
  }

  expect(chunks).toEqual([prettyJson]);
  expect(languageModel.doGenerateCalls).toHaveLength(1);
  const [call] = languageModel.doGenerateCalls;
  expect(call?.temperature).toBe(0.5);
  expect(call?.prompt).toEqual([
    { content: "Return a person", role: "system" },
    {
      content: [{ text: "extract a name", type: "text" }],
      role: "user",
    },
  ]);
});

test("zod schema rejects a mismatching generated object", async () => {
  const languageModel = new MockLanguageModelV4({
    doGenerate: generateResult({ name: 42 }),
  });
  const model = new Model({ id: "mock:test", languageModel });
  const response = model.prompt("extract a name", {
    schema: { kind: "zod", schema: z.object({ name: z.string() }) },
  });

  await expect(response.json()).rejects.toThrow();
  expect(languageModel.doGenerateCalls).toHaveLength(1);
});

test("JSON Schema rejects a mismatching generated object", async () => {
  const languageModel = new MockLanguageModelV4({
    doGenerate: generateResult({ name: 42 }),
  });
  const model = new Model({ id: "mock:test", languageModel });
  const schema = await resolveSchema("schema.json", FIXTURES);
  const response = model.prompt("extract a name", { schema });

  await expect(response.json()).rejects.toThrow();
  expect(languageModel.doGenerateCalls).toHaveLength(1);
});

test("resolves a draft 2020-12 JSON Schema", async () => {
  const resolved = await resolveSchema(
    JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: { name: { type: "string" } },
      required: ["name"],
      type: "object",
    })
  );

  expect(resolved.kind).toBe("json");
  if (resolved.kind === "json") {
    expect(resolved.schema.validate?.({ name: "Pelly" })).toMatchObject({
      success: true,
    });
    expect(resolved.schema.validate?.({ name: 42 })).toMatchObject({
      success: false,
    });
  }
});

test("tolerates keywords Ajv does not know", async () => {
  const resolved = await resolveSchema(
    JSON.stringify({ example: { name: "Pelly" }, type: "object" })
  );

  expect(resolved.kind).toBe("json");
});
