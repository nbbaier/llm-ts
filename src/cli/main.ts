#!/usr/bin/env bun
import { defineCommand, runMain, showUsage } from "citty";

type PackageJson = {
  version: string;
};

const packageJson = (await Bun.file(
  new URL("../../package.json", import.meta.url),
).json()) as PackageJson;

const main = defineCommand({
  meta: {
    name: "llx",
    version: packageJson.version,
    description: "LLM CLI on the Vercel AI SDK",
  },
  run({ cmd }) {
    return showUsage(cmd);
  },
});

await runMain(main);
