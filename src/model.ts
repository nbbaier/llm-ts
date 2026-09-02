import { generateObject, type LanguageModel, streamText } from "ai";
import type { Database } from "bun:sqlite";
import { type LanguageModel, streamText } from "ai";
import { createConversation, logResponse } from "./logging";
import { Response } from "./response";
import type { ResolvedSchema } from "./schema";

export interface PromptOptions {
  conversationId?: string;
  db?: Database;
  log?: boolean;
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
    const { conversationId, db, log = true, options, system } = opts;
    // opts.options is spread first so arbitrary keys (e.g. -o prompt=...)
    // can never override the model, prompt text, or explicit system prompt —
    // Response metadata and future logs must match what is actually sent.
    const callArgs = {
      ...options,
      model: this.languageModel,
      prompt: text,
      ...(opts.system === undefined ? {} : { system: opts.system }),
    };
    const meta = {
      ...(system === undefined ? {} : { system }),
    } as StreamTextArgs;
    const onComplete =
      log && db
        ? (completion: {
            durationMs: number;
            responseText: string;
            usage: { inputTokens?: number; outputTokens?: number };
          }) => {
            const row = {
              ...completion,
              id: Bun.randomUUIDv7(),
              model: this.id,
              options,
              prompt: text,
              system,
            };
            if (conversationId) {
              logResponse(db, { ...row, conversationId });
              return;
            }
            const logOneShot = db.transaction(() => {
              const newConversationId = createConversation(db, {
                model: this.id,
              });
              logResponse(db, {
                ...row,
                conversationId: newConversationId,
              });
            });
            logOneShot();
          }
        : undefined;
    return new Response(() => streamText(callArgs), {
      modelId: this.id,
      onComplete,
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
