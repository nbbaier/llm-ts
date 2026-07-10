#!/usr/bin/env bun
import { defineCommand, runMain, showUsage } from "citty";
import type { PackageJson } from "../types";
import { keys } from "./commands/keys";

const packageJson = (await Bun.file(
  new URL("../../package.json", import.meta.url)
).json()) as PackageJson;

const main = defineCommand({
  meta: {
    description: "LLM CLI on the Vercel AI SDK",
    name: "llx",
    version: packageJson.version,
  },
  run(ctx) {
    if (ctx.rawArgs.length === 0) {
      return showUsage(ctx.cmd);
    }
  },
  subCommands: { keys },
});

await runMain(main);
