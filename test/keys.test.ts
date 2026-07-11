import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
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

test("empty env var falls back to the stored file value", () => {
  const env = {
    ANTHROPIC_API_KEY: "",
    LLM_TS_HOME: tempHome(),
  };

  setKey("anthropic", "sk-from-file", env);

  expect(getKey("anthropic", env)).toBe("sk-from-file");
});

test("dashed names map to underscored env vars", () => {
  const env = {
    LLM_TS_HOME: tempHome(),
    MY_PROVIDER_API_KEY: "sk-dashed",
  };

  expect(getKey("my-provider", env)).toBe("sk-dashed");
});

test("setKey rejects names that cannot map safely to environment variables", () => {
  const env = { LLM_TS_HOME: tempHome() };

  expect(() => setKey("__proto__", "sk-test", env)).toThrow("Invalid key name");
});

test("getKey returns undefined for unknown names", () => {
  const env = { LLM_TS_HOME: tempHome() };

  expect(getKey("nonexistent", env)).toBeUndefined();
});

test("getKey rejects a keys file containing non-string values", () => {
  const env = { LLM_TS_HOME: tempHome() };
  const filePath = keysFilePath(env);
  writeFileSync(filePath, '{ "anthropic": 42 }');

  expect(() => getKey("anthropic", env)).toThrow(filePath);
});

test("keys.json is written with mode 600", () => {
  const env = { LLM_TS_HOME: tempHome() };

  setKey("anthropic", "sk-test-123", env);

  // biome-ignore lint/suspicious/noBitwiseOperators: masking permission bits out of st_mode requires bitwise AND
  const mode = statSync(keysFilePath(env)).mode & FILE_MODE_MASK;
  expect(mode).toBe(OWNER_ONLY_RW);
});

test("setKey atomically replaces an existing permissive keys file", () => {
  const env = { LLM_TS_HOME: tempHome() };
  const filePath = keysFilePath(env);
  writeFileSync(filePath, '{ "anthropic": "sk-existing" }');
  chmodSync(filePath, 0o644);
  const originalInode = statSync(filePath).ino;

  setKey("openai", "sk-new", env);

  const replacement = statSync(filePath);
  // biome-ignore lint/suspicious/noBitwiseOperators: masking permission bits out of st_mode requires bitwise AND
  expect(replacement.mode & FILE_MODE_MASK).toBe(OWNER_ONLY_RW);
  expect(replacement.ino).not.toBe(originalInode);
  expect(getKey("anthropic", env)).toBe("sk-existing");
  expect(getKey("openai", env)).toBe("sk-new");
});

test("listKeyNames returns names only, never values", () => {
  const env = { LLM_TS_HOME: tempHome() };

  setKey("anthropic", "sk-secret", env);
  setKey("openai", "sk-other-secret", env);

  const names = listKeyNames(env);
  expect(names.toSorted((a, b) => a.localeCompare(b))).toEqual([
    "anthropic",
    "openai",
  ]);
  expect(JSON.stringify(names)).not.toContain("sk-");
});

test("keys set reads the value from piped stdin when omitted", () => {
  const home = tempHome();

  const result = Bun.spawnSync(
    ["bun", "src/cli/main.ts", "keys", "set", "anthropic"],
    {
      env: { ...process.env, LLM_TS_HOME: home },
      stdin: Buffer.from("sk-from-stdin\n"),
    }
  );

  expect(result.exitCode).toBe(0);
  expect(getKey("anthropic", { LLM_TS_HOME: home })).toBe("sk-from-stdin");
});

test("setKey merges into an existing keys.json", () => {
  const env = { LLM_TS_HOME: tempHome() };

  setKey("anthropic", "sk-a", env);
  setKey("openai", "sk-b", env);

  expect(getKey("anthropic", env)).toBe("sk-a");
  expect(getKey("openai", env)).toBe("sk-b");
});
