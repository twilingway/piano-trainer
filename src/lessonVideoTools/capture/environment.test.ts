import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { capturePython, setupCapture } from "./environment";
import { run } from "../runtime";
import type * as Runtime from "../runtime.ts";

vi.mock("../runtime.ts", async (original) => ({
  ...(await original<typeof Runtime>()),
  run: vi.fn()
}));
const temporary: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  for (const path of temporary.splice(0)) await rm(path, { force: true, recursive: true });
});
async function fixture() {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), "capture-environment-")));
  temporary.push(root);
  return root;
}

describe("capture environment", () => {
  it("rejects an unsupported base Python before installing dependencies", async () => {
    const root = await fixture();
    vi.mocked(run).mockResolvedValue("3.13\n");
    await expect(setupCapture(root, { python: "python" })).rejects.toThrow("Python 3.11");
    expect(vi.mocked(run).mock.calls).toHaveLength(1);
    expect(vi.mocked(run).mock.calls[0]?.[1]).not.toContain("pip");
  });

  it("rejects a redirected venv before any subprocess can modify it", async () => {
    const root = await fixture(),
      outside = await fixture();
    const directory = resolve(root, ".browser-artifacts/video-capture");
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(outside, "marker"), "preserve");
    await symlink(outside, resolve(directory, ".venv"), "junction");
    await expect(setupCapture(root, { python: "python" })).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(await readFile(resolve(outside, "marker"), "utf8")).toBe("preserve");
  });

  it("bootstraps missing pip locally and preserves a model with an invalid checksum", async () => {
    const root = await fixture(),
      python = capturePython(root);
    await mkdir(resolve(python, ".."), { recursive: true });
    await writeFile(python, "local executable placeholder");
    const models = resolve(root, ".browser-artifacts/video-capture/models");
    await mkdir(models);
    await writeFile(resolve(models, "hand_landmarker.task"), "corrupt model");
    vi.mocked(run).mockImplementation((_command, args) => {
      if (args.includes("-c") && (args[1] ?? "").includes("'prefix'"))
        return Promise.resolve(
          JSON.stringify({
            prefix: resolve(root, ".browser-artifacts/video-capture/.venv"),
            version: [3, 11]
          })
        );
      if (args.includes("-c")) return Promise.resolve("False");
      return Promise.resolve("");
    });
    await expect(setupCapture(root, { python: "python" })).rejects.toThrow("Контрольная сумма");
    expect(
      vi
        .mocked(run)
        .mock.calls.some(([command, args]) => command === python && args.includes("ensurepip"))
    ).toBe(true);
    const install = vi.mocked(run).mock.calls.find(([, args]) => args.includes("install"));
    expect(install?.[0]).toBe(python);
    expect(install?.[1]).toContain(resolve(root, ".browser-artifacts/video-capture/cache"));
    expect(await readFile(resolve(models, "hand_landmarker.task"), "utf8")).toBe("corrupt model");
  });
});
