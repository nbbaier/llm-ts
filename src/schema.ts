import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { jsonSchema } from "ai";

interface ZodLikeSchema {
  parse: (value: unknown) => unknown;
}

export type ResolvedSchema =
  | { kind: "json"; schema: ReturnType<typeof jsonSchema> }
  | { kind: "zod"; schema: ZodLikeSchema };

function parseJsonSchema(contents: string, input: string): ResolvedSchema {
  try {
    const parsed = JSON.parse(contents) as Parameters<typeof jsonSchema>[0];
    return { kind: "json", schema: jsonSchema(parsed) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not parse schema ${JSON.stringify(input)}: ${reason}`,
      {
        cause: error,
      }
    );
  }
}

function isZodLikeSchema(value: unknown): value is ZodLikeSchema {
  return (
    typeof value === "object" &&
    value !== null &&
    "parse" in value &&
    typeof value.parse === "function"
  );
}

export async function resolveSchema(
  value: string,
  cwd = process.cwd()
): Promise<ResolvedSchema> {
  const input = value.trim();
  if (input.startsWith("{")) {
    return parseJsonSchema(input, input);
  }

  if (input.endsWith(".json")) {
    let contents: string;
    try {
      contents = await readFile(resolve(cwd, input), "utf8");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not read schema ${JSON.stringify(input)}: ${reason}`,
        {
          cause: error,
        }
      );
    }
    return parseJsonSchema(contents, input);
  }

  if (input.endsWith(".ts") || input.endsWith(".js")) {
    let defaultExport: unknown;
    try {
      const module = (await import(resolve(cwd, input))) as {
        default?: unknown;
      };
      defaultExport = module.default;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not import schema module ${JSON.stringify(input)}: ${reason}`,
        { cause: error }
      );
    }

    if (!isZodLikeSchema(defaultExport)) {
      throw new Error(
        `Schema module ${JSON.stringify(input)} must export default z.object(...)`
      );
    }
    return { kind: "zod", schema: defaultExport };
  }

  throw new Error(
    `Unsupported schema ${JSON.stringify(input)}: use inline JSON or a .json, .ts, or .js file`
  );
}
