import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectOptionFlags,
  parseOptionFlags,
} from "../src/cli/commands/prompt";

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "llmts-cli-"));
}

function runCli(args: string[]): {
  exitCode: number | null;
  stderr: string;
  stdout: string;
} {
  const { ANTHROPIC_API_KEY: _removed, ...baseEnv } = process.env;
  const env = { ...baseEnv, LLM_TS_HOME: tempHome() };
  const result = Bun.spawnSync(["bun", "src/cli/main.ts", ...args], {
    env,
    stderr: "pipe",
    stdin: "ignore",
    stdout: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stderr: new TextDecoder().decode(result.stderr),
    stdout: new TextDecoder().decode(result.stdout),
  };
}

test("missing anthropic key exits non-zero with remediation guidance", () => {
  const result = runCli(["-m", "anthropic:claude-x", "hi"]);

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("llx keys set anthropic");
});

test("no -m and no defaultModel exits non-zero naming -m", () => {
  const result = runCli(["hi"]);

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("-m");
  expect(result.stderr).toContain("defaultModel");
});

test("parseOptionFlags coerces numeric values to numbers", () => {
  expect(
    parseOptionFlags(["temperature=0.5", "maxOutputTokens=100", "stop=END"])
  ).toEqual({ maxOutputTokens: 100, stop: "END", temperature: 0.5 });
});

test("parseOptionFlags rejects values without key=value shape", () => {
  expect(() => parseOptionFlags(["temperature"])).toThrow("key=value");
});

test("collectOptionFlags gathers every repeated -o/--option value", () => {
  expect(
    collectOptionFlags([
      "-o",
      "temperature=0.5",
      "--option",
      "topP=1",
      "--option=maxOutputTokens=100",
      "-m",
      "anthropic:claude-x",
      "hi",
    ])
  ).toEqual(["temperature=0.5", "topP=1", "maxOutputTokens=100"]);
});
