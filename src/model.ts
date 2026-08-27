import { generateObject, type LanguageModel, streamText } from "ai";
import { Response } from "./response";
import type { ResolvedSchema } from "./schema";

export interface PromptOptions {
  options?: Record<string, unknown>;
  schema?: ResolvedSchema;
  system?: string;
}

type GenerateObjectArgs = Parameters<typeof generateObject>[0];

// A chat-capable model exposed to the user, wrapping an AI SDK
// LanguageModel plus llm-ts metadata.
export class Model {
  readonly id: string;
  private readonly languageModel: LanguageModel;

  constructor(spec: { id: string; languageModel: LanguageModel }) {
    this.id = spec.id;
    this.languageModel = spec.languageModel;
  }

  prompt(text: string, opts: PromptOptions = {}): Response {
    // opts.options is spread first so arbitrary keys (e.g. -o prompt=...)
    // can never override the model, prompt text, or explicit system prompt —
    // Response metadata and future logs must match what is actually sent.
    const callArgs = {
      ...opts.options,
      model: this.languageModel,
      prompt: text,
      ...(opts.system === undefined ? {} : { system: opts.system }),
    };
    const meta = {
      modelId: this.id,
      prompt: text,
    };

    if (opts.schema) {
      const objectArgs = {
        ...callArgs,
        schema: opts.schema.schema,
      } as GenerateObjectArgs;
      return new Response(() => generateObject(objectArgs), meta, "object");
    }

    return new Response(() => streamText(callArgs), {
      ...meta,
    });
  }
}
