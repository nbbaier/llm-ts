import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runModels(args: string[] = []): {
  exitCode: number | null;
  stderr: string;
  stdout: string;
} {
  const home = mkdtempSync(join(tmpdir(), "llmts-models-"));
  writeFileSync(
    join(home, "config.jsonc"),
    `{
  // Models stay editable by hand.
  "defaultModel": "anthropic:claude-sonnet-4-5",
  "aliases": {
    "sonnet": "anthropic:claude-sonnet-4-5"
  }
}`
  );
  const result = Bun.spawnSync(["bun", "src/cli/main.ts", "models", ...args], {
    env: { ...process.env, LLM_TS_HOME: home },
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

test("models lists provider prefixes and aliases", () => {
  const result = runModels();

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("anthropic:<model-id>");
  expect(result.stdout).toContain("sonnet → anthropic:claude-sonnet-4-5");
  expect(result.stdout).toContain("anthropic:claude-sonnet-4-5 (default)");
});

test("models --json emits valid JSON only", () => {
  const result = runModels(["--json"]);

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual({
    aliases: { sonnet: "anthropic:claude-sonnet-4-5" },
    defaultModel: "anthropic:claude-sonnet-4-5",
    models: [{ id: "anthropic:<model-id>", source: "provider-prefix" }],
  });
});

test("models aliases shows aliases and the config editing hint", () => {
  const result = runModels(["aliases"]);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(
    "sonnet → anthropic:claude-sonnet-4-5 (default)"
  );
  expect(result.stdout).toContain("Edit aliases in config.jsonc.");
  expect(result.stdout).not.toContain("anthropic:<model-id>");
});
