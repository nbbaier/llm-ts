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

export function loadConfig(env: Env = process.env): Config {
  const filePath = configFilePath(env);
  if (!existsSync(filePath)) {
    return defaultConfig();
  }

  const text = readFileSync(filePath, "utf8");
  const errors: ParseError[] = [];
  const parsed = parse(text, errors, { allowTrailingComma: true }) as
    | Partial<Config>
    | undefined;
  if (errors.length > 0) {
    throw new Error(
      `Malformed JSONC in ${filePath}: first parse error at offset ${errors[0]?.offset}`
    );
  }

  return { ...defaultConfig(), ...parsed };
}
