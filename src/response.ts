import type { streamText } from "ai";

export interface ResponseUsage {
  inputTokens?: number;
  outputTokens?: number;
}

interface ResponseMeta {
  modelId: string;
  prompt: string;
}

type StreamResult = ReturnType<typeof streamText>;

// The record of one prompt execution against a Model. Execution is lazy
// (nothing runs until first consumption) and happens exactly once: deltas
// are buffered so iteration and text() can both be used without
// re-executing the stream. Execute-once is load-bearing for the logging
// plan, which attaches completion hooks.
export class Response implements AsyncIterable<string> {
  readonly modelId: string;
  readonly prompt: string;

  private readonly startStream: () => StreamResult;
  private result: StreamResult | undefined;
  private readonly deltas: string[] = [];
  private streamError: unknown;
  private failed = false;
  private done = false;
  private drained: Promise<void> | undefined;
  private waiters: (() => void)[] = [];

  constructor(start: () => StreamResult, meta: ResponseMeta) {
    this.startStream = start;
    this.modelId = meta.modelId;
    this.prompt = meta.prompt;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<string> {
    this.ensureStarted();
    let index = 0;
    while (true) {
      const delta = this.deltas[index];
      if (delta !== undefined) {
        index += 1;
        yield delta;
      } else if (this.done) {
        if (this.failed) {
          this.rethrow();
        }
        return;
      } else {
        await this.nextChange();
      }
    }
  }

  async text(): Promise<string> {
    this.ensureStarted();
    await this.drained;
    if (this.failed) {
      this.rethrow();
    }
    return this.deltas.join("");
  }

  async usage(): Promise<ResponseUsage> {
    const result = this.ensureStarted();
    const { inputTokens, outputTokens } = await result.usage;
    return { inputTokens, outputTokens };
  }

  private ensureStarted(): StreamResult {
    if (!this.result) {
      this.result = this.startStream();
      this.drained = this.drain(this.result);
    }
    return this.result;
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
