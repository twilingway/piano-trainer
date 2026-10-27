import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * One shard of the full lint for parallel CI jobs: every tracked or new lintable file, sorted and
 * dealt round-robin, so the shards together cover exactly what `eslint .` checks in a checkout.
 * Usage: `pnpm lint:shard 2/3`.
 */
const LINTED = /\.(?:[cm]?js|tsx?)$/;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [index, total] = (process.argv[2] ?? "").split("/").map(Number);
if (!index || !total || index < 1 || index > total) {
  console.error("lint:shard: expected <index>/<total>, for example 2/3");
  process.exit(2);
}

const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  cwd: root,
  encoding: "utf8"
});
if (listed.status !== 0) {
  console.error(`lint:shard: git ls-files: ${listed.stderr.trim()}`);
  process.exit(1);
}
const files = listed.stdout
  .split("\n")
  .filter((file) => LINTED.test(file))
  .sort()
  .filter((_, i) => i % total === index - 1);
console.log(`lint:shard: ${String(index)}/${String(total)} lints ${String(files.length)} files`);

const result = spawnSync(
  process.execPath,
  [resolve(root, "node_modules/eslint/bin/eslint.js"), "--no-warn-ignored", ...files],
  { cwd: root, stdio: "inherit" }
);
process.exit(result.status ?? 1);
