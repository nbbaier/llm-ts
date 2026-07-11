import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { configDir, type Env, keysFilePath } from "./paths";

// Keys are plaintext-on-disk by design (mode 600, single-user machine); no OS keychain.
const OWNER_ONLY_RW = 0o600;
const KEY_NAME_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i;

function assertValidKeyName(name: string): void {
  if (!KEY_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid key name "${name}"`);
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([name, entry]) =>
        KEY_NAME_PATTERN.test(name) && typeof entry === "string"
    )
  );
}

function envVarName(name: string): string {
  return `${name.toUpperCase().replaceAll("-", "_")}_API_KEY`;
}

function readKeysFile(env: Env): Record<string, string> {
  const filePath = keysFilePath(env);
  if (!existsSync(filePath)) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Malformed keys file at ${filePath}`, { cause: error });
  }
  if (!isStringRecord(parsed)) {
    throw new Error(`Invalid keys file at ${filePath}: expected string values`);
  }
  return parsed;
}

export function getKey(
  name: string,
  env: Env = process.env
): string | undefined {
  assertValidKeyName(name);
  const envValue = env[envVarName(name)];
  if (envValue) {
    return envValue;
  }
  return readKeysFile(env)[name];
}

export function setKey(
  name: string,
  value: string,
  env: Env = process.env
): void {
  assertValidKeyName(name);
  mkdirSync(configDir(env), { recursive: true });
  const keys = readKeysFile(env);
  keys[name] = value;
  const filePath = keysFilePath(env);
  writeFileSync(filePath, `${JSON.stringify(keys, null, 2)}\n`, {
    mode: OWNER_ONLY_RW,
  });
  chmodSync(filePath, OWNER_ONLY_RW);
}

export function listKeyNames(env: Env = process.env): string[] {
  return Object.keys(readKeysFile(env));
}
