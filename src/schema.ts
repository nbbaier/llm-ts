import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { jsonSchema } from "ai";
import Ajv from "ajv";
import Ajv2019 from "ajv/dist/2019";
import Ajv2020 from "ajv/dist/2020";

// Unknown keywords are tolerated (strict: false) because schemas are also
// forwarded to providers, which accept vendor extensions Ajv does not know.
const AJV_OPTIONS = { addUsedSchema: false, allErrors: true, strict: false };

// Each Ajv instance understands a single draft, so the validator is chosen
// from the schema's $schema declaration (draft-07 when absent).
const validators: Record<string, Ajv | undefined> = {};

function ajvFor(schema: unknown): Ajv {
  const declared =
    typeof schema === "object" &&
    schema !== null &&
    "$schema" in schema &&
    typeof schema.$schema === "string"
      ? schema.$schema
      : "";
  let draft = "draft-07";
  if (declared.includes("2020-12")) {
    draft = "2020-12";
  } else if (declared.includes("2019-09")) {
    draft = "2019-09";
  }
  const existing = validators[draft];
  if (existing) {
    return existing;
  }
  let created: Ajv;
  if (draft === "2020-12") {
    created = new Ajv2020(AJV_OPTIONS);
  } else if (draft === "2019-09") {
    created = new Ajv2019(AJV_OPTIONS);
  } else {
    created = new Ajv(AJV_OPTIONS);
  }
  validators[draft] = created;
  return created;
}

interface ZodLikeSchema {
  parse: (value: unknown) => unknown;
}

export type ResolvedSchema =
  | { kind: "json"; schema: ReturnType<typeof jsonSchema> }
  | { kind: "zod"; schema: ZodLikeSchema };

function parseJsonSchema(contents: string, input: string): ResolvedSchema {
  let parsed: Parameters<typeof jsonSchema>[0];
  try {
    parsed = JSON.parse(contents) as Parameters<typeof jsonSchema>[0];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not parse schema ${JSON.stringify(input)}: ${reason}`,
      {
        cause: error,
      }
    );
  }

  const ajv = ajvFor(parsed);
  let validate: ReturnType<typeof ajv.compile>;
  try {
    validate = ajv.compile(parsed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON Schema ${JSON.stringify(input)}: ${reason}`, {
      cause: error,
    });
  }

  return {
    kind: "json",
    schema: jsonSchema(parsed, {
      validate: (value) => {
        if (validate(value)) {
          return { success: true, value };
        }
        const reason = ajv.errorsText(validate.errors, { separator: "; " });
        return {
          error: new Error(
            `Generated object does not match schema ${JSON.stringify(input)}: ${reason}`
          ),
          success: false,
        };
      },
    }),
  };
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
