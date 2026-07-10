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

function envVarName(name: string): string {
  return `${name.toUpperCase().replaceAll("-", "_")}_API_KEY`;
}

function readKeysFile(env: Env): Record<string, string> {
  const filePath = keysFilePath(env);
  if (!existsSync(filePath)) {
    return {};
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, string>;
}

export function getKey(
  name: string,
  env: Env = process.env
): string | undefined {
  return env[envVarName(name)] ?? readKeysFile(env)[name];
}

export function setKey(
  name: string,
  value: string,
  env: Env = process.env
): void {
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
