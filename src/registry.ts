import { createAnthropic } from "@ai-sdk/anthropic";
import type { Config } from "./config";
import { Model } from "./model";
import { configFilePath } from "./paths";

export interface Registry {
  getModel(idOrAlias?: string): Model;
  listModels(): { id: string }[];
  registerModel(model: Model): void;
}

const ANTHROPIC_PREFIX = "anthropic:";

export const MISSING_ANTHROPIC_KEY_MESSAGE =
  "No API key for 'anthropic'. Run `llx keys set anthropic` or set ANTHROPIC_API_KEY.";

export function createRegistry(cfg: {
  config: Config;
  getKey: (name: string) => string | undefined;
}): Registry {
  const registered = new Map<string, Model>();

  function buildAnthropicModel(id: string): Model {
    const apiKey = cfg.getKey("anthropic");
    if (!apiKey) {
      throw new Error(MISSING_ANTHROPIC_KEY_MESSAGE);
    }
    const provider = createAnthropic({ apiKey });
    return new Model({
      id,
      languageModel: provider(id.slice(ANTHROPIC_PREFIX.length)),
    });
  }

  // Resolves a concrete model id: explicitly registered models win, then
  // the hardcoded anthropic: prefix (the general provider map is a later plan).
  function resolveId(id: string): Model {
    const explicit = registered.get(id);
    if (explicit) {
      return explicit;
    }
    if (id.startsWith(ANTHROPIC_PREFIX)) {
      return buildAnthropicModel(id);
    }
    throw new Error(`Unknown model "${id}"`);
  }

  function resolve(idOrAlias: string): Model {
    const explicit = registered.get(idOrAlias);
    if (explicit) {
      return explicit;
    }
    const aliased = cfg.config.aliases[idOrAlias];
    if (aliased !== undefined) {
      return resolveId(aliased);
    }
    return resolveId(idOrAlias);
  }

  return {
    getModel(idOrAlias?: string): Model {
      if (idOrAlias !== undefined) {
        return resolve(idOrAlias);
      }
      const fallback = cfg.config.defaultModel;
      if (!fallback) {
        throw new Error(
          `No model specified. Pass -m <model> or set "defaultModel" in ${configFilePath()}.`
        );
      }
      return resolve(fallback);
    },
    listModels(): { id: string }[] {
      return [...registered.keys()].map((id) => ({ id }));
    },
    registerModel(model: Model): void {
      registered.set(model.id, model);
    },
  };
}
