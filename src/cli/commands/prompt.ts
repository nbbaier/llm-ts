import { defineCommand } from "citty";
import { loadConfig } from "../../config";
import { getKey } from "../../keys";
import { createRegistry } from "../../registry";

const NUMERIC_VALUE_PATTERN = /^-?\d+(?:\.\d+)?$/;

export function parseOptionFlags(pairs: string[]): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`Invalid option "${pair}": expected key=value`);
    }
    const key = pair.slice(0, separatorIndex);
    const value = pair.slice(separatorIndex + 1);
    options[key] = NUMERIC_VALUE_PATTERN.test(value) ? Number(value) : value;
  }
  return options;
}

// citty keeps only the last value of a repeated string flag, so the
// repeatable -o/--option values are collected from the raw arguments.
export function collectOptionFlags(rawArgs: string[]): string[] {
  const values: string[] = [];
  let index = 0;
  while (index < rawArgs.length) {
    const arg = rawArgs[index];
    if (arg === "-o" || arg === "--option") {
      const next = rawArgs[index + 1];
      if (next !== undefined) {
        values.push(next);
        index += 1;
      }
    } else if (arg?.startsWith("--option=")) {
      values.push(arg.slice("--option=".length));
    }
    index += 1;
  }
  return values;
}

async function resolvePromptText(
  positional: string | undefined
): Promise<string> {
  if (process.stdin.isTTY) {
    return positional ?? "";
  }
  const stdinText = (await Bun.stdin.text()).trimEnd();
  if (!stdinText) {
    return positional ?? "";
  }
  return positional ? `${stdinText}\n\n${positional}` : stdinText;
}

export const prompt = defineCommand({
  args: {
    model: {
      alias: "m",
      description: "Model id or alias (e.g. anthropic:claude-sonnet-4-5)",
      type: "string",
    },
    option: {
      alias: "o",
      description: "Model option as key=value (repeatable)",
      type: "string",
    },
    prompt: {
      description: "Prompt text (also read from piped stdin)",
      required: false,
      type: "positional",
    },
    system: {
      alias: "s",
      description: "System prompt",
      type: "string",
    },
  },
  meta: {
    description: "Send a prompt to a model and stream the reply",
    name: "llx",
  },
  async run({ args, rawArgs }) {
    const promptText = await resolvePromptText(args.prompt);
    if (!promptText) {
      throw new Error(
        "No prompt provided. Pass text as an argument or pipe it via stdin."
      );
    }

    const options = parseOptionFlags(collectOptionFlags(rawArgs));
    const registry = createRegistry({
      config: loadConfig(),
      getKey: (name) => getKey(name),
    });
    const model = registry.getModel(args.model);
    const response = model.prompt(promptText, {
      options,
      system: args.system,
    });

    for await (const delta of response) {
      process.stdout.write(delta);
    }
    process.stdout.write("\n");
  },
});
