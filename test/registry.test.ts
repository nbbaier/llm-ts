import { expect, test } from "bun:test";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import type { Config } from "../src/config";
import { Model } from "../src/model";
import { createRegistry, MISSING_ANTHROPIC_KEY_MESSAGE } from "../src/registry";

function baseConfig(overrides: Partial<Config> = {}): Config {
  return { aliases: {}, plugins: [], providers: {}, ...overrides };
}

function mockLanguageModel(deltas: string[]): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { id: "1", type: "text-start" as const },
          ...deltas.map((delta) => ({
            delta,
            id: "1",
            type: "text-delta" as const,
          })),
          { id: "1", type: "text-end" as const },
          {
            finishReason: { raw: undefined, unified: "stop" as const },
            type: "finish" as const,
            usage: {
              inputTokens: {
                cacheRead: undefined,
                cacheWrite: undefined,
                noCache: undefined,
                total: 1,
              },
              outputTokens: { reasoning: undefined, text: undefined, total: 1 },
            },
          },
        ],
      }),
    }),
  });
}

function mockModel(id: string): Model {
  return new Model({ id, languageModel: mockLanguageModel(["ok"]) });
}

const noKey = () => undefined;

test("registerModel then getModel round-trips", () => {
  const registry = createRegistry({ config: baseConfig(), getKey: noKey });
  const model = mockModel("mock:one");

  registry.registerModel(model);

  expect(registry.getModel("mock:one")).toBe(model);
});

test("listModels lists registered model ids", () => {
  const registry = createRegistry({ config: baseConfig(), getKey: noKey });

  registry.registerModel(mockModel("mock:one"));
  registry.registerModel(mockModel("mock:two"));

  expect(registry.listModels()).toEqual([
    { id: "mock:one" },
    { id: "mock:two" },
  ]);
});

test("alias from config resolves to the registered model", () => {
  const registry = createRegistry({
    config: baseConfig({ aliases: { short: "mock:one" } }),
    getKey: noKey,
  });
  const model = mockModel("mock:one");
  registry.registerModel(model);

  expect(registry.getModel("short")).toBe(model);
});

test("unknown model id throws", () => {
  const registry = createRegistry({ config: baseConfig(), getKey: noKey });

  expect(() => registry.getModel("nope:missing")).toThrow(
    'Unknown model "nope:missing"'
  );
});

test("missing anthropic key throws the exact remediation guidance", () => {
  const registry = createRegistry({ config: baseConfig(), getKey: noKey });

  expect(() => registry.getModel("anthropic:claude-x")).toThrow(
    MISSING_ANTHROPIC_KEY_MESSAGE
  );
  expect(MISSING_ANTHROPIC_KEY_MESSAGE).toBe(
    "No API key for 'anthropic'. Run `llx keys set anthropic` or set ANTHROPIC_API_KEY."
  );
});

test("anthropic: prefix builds a model when a key is present", () => {
  const registry = createRegistry({
    config: baseConfig(),
    getKey: (name) => (name === "anthropic" ? "sk-test" : undefined),
  });

  expect(registry.getModel("anthropic:claude-x").id).toBe("anthropic:claude-x");
});

test("getModel() with no argument uses config.defaultModel", () => {
  const registry = createRegistry({
    config: baseConfig({ defaultModel: "mock:one" }),
    getKey: noKey,
  });
  const model = mockModel("mock:one");
  registry.registerModel(model);

  expect(registry.getModel()).toBe(model);
});

test("getModel() with no argument resolves a defaultModel alias", () => {
  const registry = createRegistry({
    config: baseConfig({
      aliases: { short: "mock:one" },
      defaultModel: "short",
    }),
    getKey: noKey,
  });
  const model = mockModel("mock:one");
  registry.registerModel(model);

  expect(registry.getModel()).toBe(model);
});

test("no argument and no defaultModel throws naming -m and defaultModel", () => {
  const registry = createRegistry({ config: baseConfig(), getKey: noKey });

  expect(() => registry.getModel()).toThrow("-m");
  expect(() => registry.getModel()).toThrow("defaultModel");
});

test("Model.prompt passes system and spread options to the underlying call", async () => {
  const languageModel = mockLanguageModel(["ok"]);
  const model = new Model({ id: "mock:one", languageModel });

  const response = model.prompt("hello", {
    options: { maxOutputTokens: 100, temperature: 0.5 },
    system: "be brief",
  });
  await response.text();

  const [call] = languageModel.doStreamCalls;
  expect(call?.temperature).toBe(0.5);
  expect(call?.maxOutputTokens).toBe(100);
  expect(call?.prompt).toEqual([
    { content: "be brief", role: "system" },
    { content: [{ text: "hello", type: "text" }], role: "user" },
  ]);
});

test("Model.prompt options cannot override model, prompt, or system", async () => {
  const languageModel = mockLanguageModel(["ok"]);
  const model = new Model({ id: "mock:one", languageModel });

  const response = model.prompt("hello", {
    options: { model: "evil:model", prompt: "evil prompt", system: "evil" },
    system: "be brief",
  });
  await response.text();

  expect(languageModel.doStreamCalls.length).toBe(1);
  const [call] = languageModel.doStreamCalls;
  expect(call?.prompt).toEqual([
    { content: "be brief", role: "system" },
    { content: [{ text: "hello", type: "text" }], role: "user" },
  ]);
});
