import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The quick gate while working: format and lint only the files changed against dev, typecheck
 * incrementally, run only the tests those files reach; no build. `pnpm check` stays the gate
 * before a pull request.
 */
const BASE = "origin/dev";
const COMPILER_TESTS = [
  "src/app/useTwoHandCourse.test.tsx",
  "src/app/useHeldBassCourse.test.tsx",
  "src/app/useIndependentRhythmCourse.test.tsx"
];
const LINTED = /\.(?:[cm]?js|tsx?)$/;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cache = resolve(root, "node_modules/.cache");

function git(args: readonly string[]): string[] {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.trim()}`);
  return result.stdout.split("\n").filter((line) => line !== "");
}

/** The same set vitest --changed takes: commits since the merge base, staged, unstaged, new. */
function changedFiles(): string[] {
  const files = new Set([
    ...git(["diff", "--name-only", `${BASE}...HEAD`]),
    ...git(["diff", "--cached", "--name-only"]),
    ...git(["ls-files", "--others", "--modified", "--exclude-standard"])
  ]);
  return [...files].filter((file) => existsSync(resolve(root, file))).sort();
}

function step(name: string, bin: string, args: readonly string[]): void {
  const started = performance.now();
  const result = spawnSync(process.execPath, [resolve(root, "node_modules", bin), ...args], {
    cwd: root,
    stdio: "inherit"
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`check:changed: ${name} failed (${seconds} s)`);
    process.exit(result.status ?? 1);
  }
  console.log(`check:changed: ${name} ok (${seconds} s)`);
}

const files = changedFiles();
console.log(`check:changed: ${String(files.length)} files changed against ${BASE}`);

if (files.length > 0)
  step("format", "prettier/bin/prettier.cjs", [
    "--check",
    "--cache",
    "--cache-location",
    resolve(cache, "prettier/.prettiercache"),
    "--ignore-unknown",
    ...files
  ]);

const linted = files.filter((file) => LINTED.test(file));
if (linted.length > 0)
  step("lint", "eslint/bin/eslint.js", [
    "--cache",
    "--cache-location",
    resolve(cache, "eslint/"),
    "--no-warn-ignored",
    ...linted
  ]);

step("typecheck", "typescript/bin/tsc", [
  "--noEmit",
  "--incremental",
  "--tsBuildInfoFile",
  resolve(cache, "tsc/tsconfig.tsbuildinfo"),
  "-p",
  "tsconfig.json"
]);

step("test", "vitest/vitest.mjs", ["run", "--changed", BASE, "--passWithNoTests"]);
step("test:compiler", "vitest/vitest.mjs", [
  "run",
  "--changed",
  BASE,
  "--passWithNoTests",
  "--mode",
  "development",
  ...COMPILER_TESTS
]);
