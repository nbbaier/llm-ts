import { expect, test } from "bun:test";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getKey, listKeyNames, setKey } from "../src/keys";
import { keysFilePath } from "../src/paths";

const FILE_MODE_MASK = 0o777;
const OWNER_ONLY_RW = 0o600;

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "llmts-keys-"));
}

test("setKey then getKey round-trips", () => {
  const env = { LLM_TS_HOME: tempHome() };

  setKey("anthropic", "sk-test-123", env);

  expect(getKey("anthropic", env)).toBe("sk-test-123");
});

test("env var wins over file value", () => {
  const env = {
    ANTHROPIC_API_KEY: "sk-from-env",
    LLM_TS_HOME: tempHome(),
  };

  setKey("anthropic", "sk-from-file", env);

  expect(getKey("anthropic", env)).toBe("sk-from-env");
});

test("dashed names map to underscored env vars", () => {
  const env = {
    LLM_TS_HOME: tempHome(),
    MY_PROVIDER_API_KEY: "sk-dashed",
  };

  expect(getKey("my-provider", env)).toBe("sk-dashed");
});

test("getKey returns undefined for unknown names", () => {
  const env = { LLM_TS_HOME: tempHome() };

  expect(getKey("nonexistent", env)).toBeUndefined();
});

test("keys.json is written with mode 600", () => {
  const env = { LLM_TS_HOME: tempHome() };

  setKey("anthropic", "sk-test-123", env);

  const mode = statSync(keysFilePath(env)).mode & FILE_MODE_MASK;
  expect(mode).toBe(OWNER_ONLY_RW);
});

test("listKeyNames returns names only, never values", () => {
  const env = { LLM_TS_HOME: tempHome() };

  setKey("anthropic", "sk-secret", env);
  setKey("openai", "sk-other-secret", env);

  const names = listKeyNames(env);
  expect(names.toSorted()).toEqual(["anthropic", "openai"]);
  expect(JSON.stringify(names)).not.toContain("sk-");
});

test("setKey merges into an existing keys.json", () => {
  const env = { LLM_TS_HOME: tempHome() };

  setKey("anthropic", "sk-a", env);
  setKey("openai", "sk-b", env);

  expect(getKey("anthropic", env)).toBe("sk-a");
  expect(getKey("openai", env)).toBe("sk-b");
});
