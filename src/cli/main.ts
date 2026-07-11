#!/usr/bin/env bun
import { defineCommand, runMain, showUsage } from "citty";
import type { PackageJson } from "../types";
import { keys } from "./commands/keys";
import { prompt } from "./commands/prompt";

const packageJson = (await Bun.file(
  new URL("../../package.json", import.meta.url)
).json()) as PackageJson;

const meta = {
  description: "LLM CLI on the Vercel AI SDK",
  name: "llx",
  version: packageJson.version,
};

const subCommands = { keys };

const root = defineCommand({
  meta,
  run(ctx) {
    if (ctx.rawArgs.length === 0) {
      return showUsage(ctx.cmd);
    }
  },
  subCommands,
});

const promptMain = defineCommand({ ...prompt, meta });

// citty rejects unknown positionals whenever subCommands exist, so bare
// `llx 'prompt'` is dispatched manually: only a leading subcommand name
// (or --help, or a bare interactive invocation) goes to the root command.
function routeToRoot(): boolean {
  const [first] = process.argv.slice(2);
  if (first === undefined) {
    return process.stdin.isTTY === true;
  }
  return first in subCommands || first === "--help" || first === "-h";
}

await (routeToRoot() ? runMain(root) : runMain(promptMain));
