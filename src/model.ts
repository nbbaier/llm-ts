import type { Database } from "bun:sqlite";
import { generateObject, type LanguageModel, streamText } from "ai";
import { createConversation, logResponse } from "./logging";
import { Response, type ResponseCompletion } from "./response";
import type { ResolvedSchema } from "./schema";

export interface PromptOptions {
  conversationId?: string;
  db?: Database;
  log?: boolean;
  options?: Record<string, unknown>;
  schema?: ResolvedSchema;
  system?: string;
}

type StreamTextArgs = Parameters<typeof streamText>[0];
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
    const { conversationId, db, log = true, options, schema, system } = opts;
    // opts.options is spread first so arbitrary keys (e.g. -o prompt=...)
    // can never override the model, prompt text, or explicit system prompt —
    // Response metadata and logs must match what is actually sent.
    const callArgs = {
      ...options,
      model: this.languageModel,
      prompt: text,
      ...(system === undefined ? {} : { system }),
    };
    const onComplete =
      log && db
        ? (completion: ResponseCompletion) => {
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
    const meta = { modelId: this.id, onComplete, prompt: text };

    if (schema) {
      const objectArgs = {
        ...callArgs,
        schema: schema.schema,
      } as GenerateObjectArgs;
      return new Response(() => generateObject(objectArgs), meta, "object");
    }

    return new Response(() => streamText(callArgs as StreamTextArgs), meta);
  }
}
