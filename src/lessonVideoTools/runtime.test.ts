import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertLocalRuntime, assertNoLink, safeDirectory, writeJson } from "./runtime";

const temporary: string[] = [];
async function fixture() {
  const path = await mkdtemp(resolve(tmpdir(), "piano-video-test-"));
  temporary.push(path);
  const root = resolve(path, "repo"),
    outside = resolve(path, "outside");
  await mkdir(root);
  await mkdir(outside);
  return { root, outside };
}
afterEach(async () => {
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

describe("local video runtime confinement", () => {
  it("rejects an environment junction before pip can mutate another environment", async () => {
    const { root, outside } = await fixture();
    const directory = resolve(root, ".browser-artifacts/lesson-analysis");
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(outside, "marker"), "keep");
    await symlink(outside, resolve(directory, ".venv"), "junction");
    await expect(
      assertLocalRuntime(root, directory, resolve(directory, ".venv/Scripts/python.exe"))
    ).rejects.toThrow();
    expect(await readFile(resolve(outside, "marker"), "utf8")).toBe("keep");
  });
  it("rejects output and nested model cache junctions outside the repository", async () => {
    const { root, outside } = await fixture();
    await symlink(outside, resolve(root, "redirect"), "junction");
    await expect(safeDirectory(root, resolve(root, "redirect/output"))).rejects.toThrow();
    const directory = resolve(root, ".browser-artifacts/lesson-analysis");
    await mkdir(resolve(directory, "models"), { recursive: true });
    await symlink(outside, resolve(directory, "models/redirect"), "junction");
    await expect(
      assertLocalRuntime(root, directory, resolve(directory, ".venv/Scripts/python.exe"))
    ).rejects.toThrow();
  });
  it("rejects dangling links and preserves existing metadata on exclusive writes", async () => {
    const { root, outside } = await fixture();
    const link = resolve(root, "dangling");
    await symlink(outside, link, "junction");
    await rename(outside, `${outside}-moved`);
    await expect(assertNoLink(link)).rejects.toThrow();
    const metadata = resolve(root, "metadata.json");
    await writeJson(metadata, { source: "first" });
    await expect(writeJson(metadata, { source: "second" })).rejects.toThrow();
    expect(JSON.parse(await readFile(metadata, "utf8"))).toEqual({ source: "first" });
  });
});
