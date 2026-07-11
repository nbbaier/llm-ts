import { defineCommand, showUsage } from "citty";
import { listKeyNames, setKey } from "../../keys";
import { keysFilePath } from "../../paths";

async function readLineFromStdin(): Promise<string> {
  for await (const line of console) {
    return line;
  }
  return "";
}

const set = defineCommand({
  args: {
    name: {
      description: "Key name (e.g. anthropic)",
      required: true,
      type: "positional",
    },
    value: {
      description: "Key value (read from stdin if omitted)",
      required: false,
      type: "positional",
    },
  },
  meta: {
    description: "Store an API key in keys.json",
    name: "set",
  },
  async run({ args }) {
    const value = args.value ?? (await readLineFromStdin());
    if (!value) {
      throw new Error(`No value provided for key "${args.name}"`);
    }
    setKey(args.name, value);
  },
});

const list = defineCommand({
  meta: {
    description: "List stored key names (never values)",
    name: "list",
  },
  run() {
    for (const name of listKeyNames()) {
      console.log(name);
    }
  },
});

const path = defineCommand({
  meta: {
    description: "Print the path of keys.json",
    name: "path",
  },
  run() {
    console.log(keysFilePath());
  },
});

export const keys = defineCommand({
  meta: {
    description: "Manage API keys",
    name: "keys",
  },
  run(ctx) {
    if (ctx.rawArgs.length === 0) {
      return showUsage(ctx.cmd);
    }
  },
  subCommands: { list, path, set },
});
