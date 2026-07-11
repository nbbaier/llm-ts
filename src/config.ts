import { existsSync, readFileSync } from "node:fs";
import { type ParseError, parse } from "jsonc-parser";
import { configFilePath, type Env } from "./paths";

export interface Config {
  aliases: Record<string, string>; // alias -> model id
  defaultModel?: string;
  plugins: string[]; // npm package names or paths
  providers: Record<string, string>; // model-id prefix -> AI SDK package name
}

function defaultConfig(): Config {
  return { aliases: {}, plugins: [], providers: {} };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function validateConfig(value: unknown, filePath: string): Config {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid config in ${filePath}: expected an object`);
  }

  const {
    aliases = {},
    defaultModel,
    plugins = [],
    providers = {},
  } = value as Record<string, unknown>;
  if (defaultModel !== undefined && typeof defaultModel !== "string") {
    throw new Error(`Invalid config field types in ${filePath}`);
  }
  if (!(isStringRecord(aliases) && isStringRecord(providers))) {
    throw new Error(`Invalid config field types in ${filePath}`);
  }
  if (
    !(
      Array.isArray(plugins) &&
      plugins.every((plugin) => typeof plugin === "string")
    )
  ) {
    throw new Error(`Invalid config field types in ${filePath}`);
  }

  return { aliases, defaultModel, plugins, providers };
}

export function loadConfig(env: Env = process.env): Config {
  const filePath = configFilePath(env);
  if (!existsSync(filePath)) {
    return defaultConfig();
  }

  const text = readFileSync(filePath, "utf8");
  const errors: ParseError[] = [];
  const parsed: unknown = parse(text, errors);
  if (errors.length > 0) {
    throw new Error(
      `Malformed JSONC in ${filePath}: first parse error at offset ${errors[0]?.offset}`
    );
  }

  return validateConfig(parsed, filePath);
}
