import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "llmts-config-"));
}

test("missing file returns defaults", () => {
  const env = { LLM_TS_HOME: tempHome() };

  expect(loadConfig(env)).toEqual({ aliases: {}, plugins: [], providers: {} });
});

test("valid JSONC with comments parses", () => {
  const home = tempHome();
  writeFileSync(
    join(home, "config.jsonc"),
    `{
  // default model for one-off prompts
  "defaultModel": "anthropic/claude-sonnet-5",
  "aliases": {
    "sonnet": "anthropic/claude-sonnet-5" // trailing comment
  },
  "plugins": ["some-plugin"],
  "providers": { "anthropic": "@ai-sdk/anthropic" }
}
`
  );

  expect(loadConfig({ LLM_TS_HOME: home })).toEqual({
    aliases: { sonnet: "anthropic/claude-sonnet-5" },
    defaultModel: "anthropic/claude-sonnet-5",
    plugins: ["some-plugin"],
    providers: { anthropic: "@ai-sdk/anthropic" },
  });
});

test("malformed JSONC throws with the file path in the message", () => {
  const home = tempHome();
  const filePath = join(home, "config.jsonc");
  writeFileSync(filePath, '{ "aliases": { broken ');

  expect(() => loadConfig({ LLM_TS_HOME: home })).toThrow(filePath);
});

test("JSONC with trailing commas throws with the file path", () => {
  const home = tempHome();
  const filePath = join(home, "config.jsonc");
  writeFileSync(filePath, '{ "plugins": [], }');

  expect(() => loadConfig({ LLM_TS_HOME: home })).toThrow(filePath);
});

test("config with invalid field types throws with the file path", () => {
  const home = tempHome();
  const filePath = join(home, "config.jsonc");
  writeFileSync(filePath, '{ "plugins": {} }');

  expect(() => loadConfig({ LLM_TS_HOME: home })).toThrow(filePath);
});
