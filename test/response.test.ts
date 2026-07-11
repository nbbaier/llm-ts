import { expect, test } from "bun:test";
import { streamText } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { Response } from "../src/response";

const MOCK_INPUT_TOKENS = 3;
const MOCK_OUTPUT_TOKENS = 7;

function mockModel(deltas: string[]): MockLanguageModelV4 {
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
                total: MOCK_INPUT_TOKENS,
              },
              outputTokens: {
                reasoning: undefined,
                text: undefined,
                total: MOCK_OUTPUT_TOKENS,
              },
            },
          },
        ],
      }),
    }),
  });
}

function makeResponse(model: MockLanguageModelV4): Response {
  return new Response(() => streamText({ model, prompt: "hi" }), {
    modelId: "mock:test",
    prompt: "hi",
  });
}

test("iterating yields the mocked deltas in order", async () => {
  const model = mockModel(["Hello", ", ", "world"]);
  const response = makeResponse(model);

  const seen: string[] = [];
  for await (const delta of response) {
    seen.push(delta);
  }

  expect(seen).toEqual(["Hello", ", ", "world"]);
});

test("execution is lazy: nothing runs until first consumption", async () => {
  const model = mockModel(["hi"]);
  const response = makeResponse(model);

  expect(model.doStreamCalls.length).toBe(0);

  await response.text();

  expect(model.doStreamCalls.length).toBe(1);
});

test("text() returns the concatenation of deltas", async () => {
  const model = mockModel(["Hello", ", ", "world"]);
  const response = makeResponse(model);

  expect(await response.text()).toBe("Hello, world");
});

test("text() after iteration does not re-execute", async () => {
  const model = mockModel(["a", "b"]);
  const response = makeResponse(model);

  const seen: string[] = [];
  for await (const delta of response) {
    seen.push(delta);
  }

  expect(await response.text()).toBe("ab");
  expect(seen).toEqual(["a", "b"]);
  expect(model.doStreamCalls.length).toBe(1);
});

test("iteration after text() replays buffered deltas without re-executing", async () => {
  const model = mockModel(["a", "b"]);
  const response = makeResponse(model);

  expect(await response.text()).toBe("ab");

  const seen: string[] = [];
  for await (const delta of response) {
    seen.push(delta);
  }

  expect(seen).toEqual(["a", "b"]);
  expect(model.doStreamCalls.length).toBe(1);
});

test("usage() resolves token counts", async () => {
  const model = mockModel(["hi"]);
  const response = makeResponse(model);

  expect(await response.usage()).toEqual({
    inputTokens: MOCK_INPUT_TOKENS,
    outputTokens: MOCK_OUTPUT_TOKENS,
  });
});

test("exposes modelId and prompt metadata", () => {
  const response = makeResponse(mockModel(["hi"]));

  expect(response.modelId).toBe("mock:test");
  expect(response.prompt).toBe("hi");
});
