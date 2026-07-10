import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  configDir,
  configFilePath,
  dataDir,
  dbPath,
  keysFilePath,
} from "../src/paths";

test("LLM_TS_HOME overrides both config and data dirs", () => {
  const env = {
    LLM_TS_HOME: "/tmp/llmts-home",
    XDG_CONFIG_HOME: "/tmp/xdg-config",
    XDG_DATA_HOME: "/tmp/xdg-data",
  };

  expect(configDir(env)).toBe("/tmp/llmts-home");
  expect(dataDir(env)).toBe("/tmp/llmts-home");
});

test("XDG vars are honored when LLM_TS_HOME is unset", () => {
  const env = {
    XDG_CONFIG_HOME: "/tmp/xdg-config",
    XDG_DATA_HOME: "/tmp/xdg-data",
  };

  expect(configDir(env)).toBe(join("/tmp/xdg-config", "llm-ts"));
  expect(dataDir(env)).toBe(join("/tmp/xdg-data", "llm-ts"));
});

test("defaults fall back to the home directory", () => {
  const env = {};

  expect(configDir(env)).toBe(join(homedir(), ".config", "llm-ts"));
  expect(dataDir(env)).toBe(join(homedir(), ".local", "share", "llm-ts"));
});

test("file paths live under the right dirs", () => {
  const env = { LLM_TS_HOME: "/tmp/llmts-home" };

  expect(configFilePath(env)).toBe(join("/tmp/llmts-home", "config.jsonc"));
  expect(keysFilePath(env)).toBe(join("/tmp/llmts-home", "keys.json"));
  expect(dbPath(env)).toBe(join("/tmp/llmts-home", "logs.db"));
});
