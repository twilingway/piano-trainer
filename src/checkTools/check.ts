import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The full gate in two phases. First the single-threaded steps run side by side, eslint split into
 * shards (alone it is the longest step); then the unit tests run on their own, because several of
 * them time real work and fail on a loaded CPU. Each step's output is held back and printed whole
 * when it ends, so logs never interleave.
 */
type Step = readonly [name: string, script: string, ...args: string[]];
const LINT_SHARDS = 3;
const PHASES: readonly (readonly Step[])[] = [
  [
    ["format", "format:check"],
    ...Array.from({ length: LINT_SHARDS }, (_, i): Step => [
      `lint ${String(i + 1)}/${String(LINT_SHARDS)}`,
      "lint:shard",
      `${String(i + 1)}/${String(LINT_SHARDS)}`
    ]),
    ["typecheck", "typecheck"],
    ["test:compiler", "test:compiler"],
    ["build", "build"]
  ],
  [["test", "test"]]
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const started = performance.now();

function run([name, script, ...args]: Step): Promise<boolean> {
  const begun = performance.now();
  return new Promise((done) => {
    // npm_execpath is pnpm's own entry while this runs as a pnpm script.
    const pnpm = process.env.npm_execpath;
    const child = pnpm
      ? spawn(process.execPath, [pnpm, "run", script, ...args], { cwd: root })
      : spawn("pnpm", ["run", script, ...args], { cwd: root, shell: true });
    const output: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => output.push(chunk));
    child.on("close", (code) => {
      const seconds = ((performance.now() - begun) / 1000).toFixed(1);
      const ok = code === 0;
      process.stdout.write(Buffer.concat(output));
      console.log(`check: ${name} ${ok ? "ok" : "FAILED"} (${seconds} s)\n`);
      done(ok);
    });
  });
}

const failed: string[] = [];
for (const phase of PHASES) {
  const results = await Promise.all(phase.map(run));
  failed.push(...phase.filter((_, i) => !results[i]).map(([name]) => name));
}
const total = ((performance.now() - started) / 1000).toFixed(1);
if (failed.length > 0) {
  console.error(`check: failed ${failed.join(", ")} (${total} s)`);
  process.exit(1);
}
console.log(`check: all steps ok (${total} s)`);
