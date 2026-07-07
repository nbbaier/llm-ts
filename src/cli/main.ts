#!/usr/bin/env bun
import { defineCommand, runMain, showUsage } from "citty";

interface PackageJson {
  version: string;
}

const packageJson = (await Bun.file(
  new URL("../../package.json", import.meta.url)
).json()) as PackageJson;

const main = defineCommand({
  meta: {
    description: "LLM CLI on the Vercel AI SDK",
    name: "llx",
    version: packageJson.version,
  },
  run({ cmd }) {
    return showUsage(cmd);
  },
});

await runMain(main);
