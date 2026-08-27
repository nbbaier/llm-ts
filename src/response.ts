import type { GenerateObjectResult, generateObject, streamText } from "ai";

export interface ResponseUsage {
  inputTokens?: number;
  outputTokens?: number;
}

interface ResponseMeta {
  modelId: string;
  prompt: string;
}

type StreamResult = ReturnType<typeof streamText>;
type ObjectResult = GenerateObjectResult<unknown>;
type ObjectResultPromise = ReturnType<typeof generateObject>;

// The record of one prompt execution against a Model. Execution is lazy
// (nothing runs until first consumption) and happens exactly once: deltas
// are buffered so iteration and text() can both be used without
// re-executing the stream. Execute-once is load-bearing for the logging
// plan, which attaches completion hooks.
export class Response implements AsyncIterable<string> {
  readonly modelId: string;
  readonly prompt: string;

  private readonly startStream: (() => StreamResult) | undefined;
  private readonly startObject: (() => ObjectResultPromise) | undefined;
  private result: StreamResult | undefined;
  private objectResult: Promise<ObjectResult> | undefined;
  private readonly deltas: string[] = [];
  private streamError: unknown;
  private failed = false;
  private done = false;
  private drained: Promise<void> | undefined;
  private waiters: (() => void)[] = [];

  constructor(start: () => StreamResult, meta: ResponseMeta);
  constructor(
    start: () => ObjectResultPromise,
    meta: ResponseMeta,
    mode: "object"
  );
  constructor(
    start: (() => StreamResult) | (() => ObjectResultPromise),
    meta: ResponseMeta,
    mode: "text" | "object" = "text"
  ) {
    this.startStream =
      mode === "text" ? (start as () => StreamResult) : undefined;
    this.startObject =
      mode === "object" ? (start as () => ObjectResultPromise) : undefined;
    this.modelId = meta.modelId;
    this.prompt = meta.prompt;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    if (this.startObject) {
      yield await this.text();
      return;
    }

    this.ensureStarted();
    let index = 0;
    while (index < this.deltas.length || !this.isDone()) {
      const delta = this.deltas[index];
      if (delta === undefined) {
        // biome-ignore lint/performance/noAwaitInLoops: waits for the producer to buffer the next delta; sequential by nature
        await this.nextChange();
      } else {
        index += 1;
        yield delta;
      }
    }
    if (this.hasFailed()) {
      this.rethrow();
    }
  }

  async text(): Promise<string> {
    if (this.startObject) {
      const serialized = JSON.stringify(await this.json(), null, 2);
      if (serialized === undefined) {
        throw new Error("Structured output could not be serialized as JSON");
      }
      return serialized;
    }

    this.ensureStarted();
    await this.drained;
    if (this.hasFailed()) {
      this.rethrow();
    }
    return this.deltas.join("");
  }

  async json(): Promise<unknown> {
    if (!this.startObject) {
      throw new Error("json() requires a schema");
    }
    return (await this.ensureObjectStarted()).object;
  }

  async usage(): Promise<ResponseUsage> {
    if (this.startObject) {
      const { inputTokens, outputTokens } = (await this.ensureObjectStarted())
        .usage;
      return { inputTokens, outputTokens };
    }

    const result = this.ensureStarted();
    const { inputTokens, outputTokens } = await result.usage;
    return { inputTokens, outputTokens };
  }

  // done/failed are mutated by the concurrently running drain(); reading
  // them through methods keeps static analysis from narrowing them.
  private isDone(): boolean {
    return this.done;
  }

  private hasFailed(): boolean {
    return this.failed;
  }

  private ensureStarted(): StreamResult {
    if (!this.result) {
      if (!this.startStream) {
        throw new Error("Response is not in text mode");
      }
      this.result = this.startStream();
      this.drained = this.drain(this.result);
    }
    return this.result;
  }

  private ensureObjectStarted(): Promise<ObjectResult> {
    if (!this.objectResult) {
      const start = this.startObject;
      if (!start) {
        throw new Error("Response is not in object mode");
      }
      this.objectResult = Promise.resolve().then(start);
    }
    return this.objectResult;
  }

  private async drain(result: StreamResult): Promise<void> {
    try {
      for await (const delta of result.textStream) {
        this.deltas.push(delta);
        this.notify();
      }
    } catch (error) {
      this.failed = true;
      this.streamError = error;
    } finally {
      this.done = true;
      this.notify();
    }
  }

  private notify(): void {
    const pending = this.waiters;
    this.waiters = [];
    for (const wake of pending) {
      wake();
    }
  }

  private nextChange(): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private rethrow(): never {
    if (this.streamError instanceof Error) {
      throw this.streamError;
    }
    throw new Error(String(this.streamError));
  }
}
