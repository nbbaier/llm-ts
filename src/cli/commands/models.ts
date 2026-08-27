import { defineCommand } from "citty";
import { loadConfig } from "../../config";
import { createRegistry, type ModelListing } from "../../registry";

const formatAlias = (
  alias: string,
  id: string,
  defaultModel: string | undefined
): string =>
  `  ${alias} → ${id}${defaultModel === alias || defaultModel === id ? " (default)" : ""}`;

const printAliases = (
  aliases: Record<string, string>,
  defaultModel: string | undefined
): void => {
  for (const [alias, id] of Object.entries(aliases)) {
    console.log(formatAlias(alias, id, defaultModel));
  }
};

const aliasesCommand = defineCommand({
  meta: {
    description: "List configured model aliases",
    name: "aliases",
  },
  run() {
    const config = loadConfig();
    printAliases(config.aliases, config.defaultModel);
    console.log("Edit aliases in config.jsonc.");
  },
});

const printModels = (
  listings: ModelListing[],
  configuredAliases: Record<string, string>,
  defaultModel: string | undefined
): void => {
  console.log("Provider prefixes:");
  for (const { id, source } of listings) {
    if (source === "provider-prefix") {
      console.log(`  ${id} — pass-through to any Anthropic model ID`);
    }
  }

  console.log("Registered models:");
  for (const { id, source } of listings) {
    if (source === "registered") {
      console.log(`  ${id}${defaultModel === id ? " (default)" : ""}`);
    }
  }

  console.log("Aliases:");
  printAliases(configuredAliases, defaultModel);

  const defaultIsListed =
    defaultModel === undefined ||
    listings.some(({ id }) => id === defaultModel) ||
    Object.entries(configuredAliases).some(
      ([alias, id]) => alias === defaultModel || id === defaultModel
    );
  if (!defaultIsListed) {
    console.log("Default model:");
    console.log(`  ${defaultModel} (default)`);
  }
};

export const models = defineCommand({
  args: {
    json: {
      description: "Output model information as JSON",
      type: "boolean",
    },
  },
  meta: {
    description: "List known models and configured aliases",
    name: "models",
  },
  run({ args, rawArgs }) {
    if (rawArgs[0] === "aliases") {
      return;
    }
    const config = loadConfig();
    const registry = createRegistry({ config, getKey: () => undefined });
    const listings = registry.listModels();
    const configuredAliases = registry.listAliases();

    if (args.json) {
      console.log(
        JSON.stringify({
          aliases: configuredAliases,
          defaultModel: config.defaultModel,
          models: listings,
        })
      );
      return;
    }

    printModels(listings, configuredAliases, config.defaultModel);
  },
  subCommands: { aliases: aliasesCommand },
});
