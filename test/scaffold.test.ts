import { expect, test } from "bun:test";
import type { PackageJson } from "../src/types";

const packageJson = (await Bun.file("package.json").json()) as PackageJson;

test("llx --version exits 0 and prints the package version", () => {
  const result = Bun.spawnSync(["bun", "src/cli/main.ts", "--version"]);
  const stdout = new TextDecoder().decode(result.stdout);

  expect(result.exitCode).toBe(0);
  expect(stdout).toContain(packageJson.version);
});
