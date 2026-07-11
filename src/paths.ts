import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export type Env = Record<string, string | undefined>;

// XDG base dirs must be ignored unless they are non-empty absolute paths,
// otherwise config and secrets get silently relocated under the cwd.
function xdgDir(value: string | undefined, fallback: string): string {
  return value && isAbsolute(value) ? value : fallback;
}

export function configDir(env: Env = process.env): string {
  if (env.LLM_TS_HOME) {
    return env.LLM_TS_HOME;
  }
  return join(
    xdgDir(env.XDG_CONFIG_HOME, join(homedir(), ".config")),
    "llm-ts"
  );
}

export function dataDir(env: Env = process.env): string {
  if (env.LLM_TS_HOME) {
    return env.LLM_TS_HOME;
  }
  return join(
    xdgDir(env.XDG_DATA_HOME, join(homedir(), ".local", "share")),
    "llm-ts"
  );
}

export function configFilePath(env: Env = process.env): string {
  return join(configDir(env), "config.jsonc");
}

export function keysFilePath(env: Env = process.env): string {
  return join(configDir(env), "keys.json");
}

export function dbPath(env: Env = process.env): string {
  return join(dataDir(env), "logs.db");
}
