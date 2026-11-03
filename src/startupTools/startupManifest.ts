import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

export interface StartupManifest {
  readonly sizes: Readonly<Record<string, number>>;
  readonly initial: readonly string[];
}

interface BuildOutput {
  readonly type: "chunk" | "asset";
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
  readonly imports?: readonly string[];
  readonly isEntry?: boolean;
  readonly name?: string | undefined;
  readonly originalFileNames?: readonly string[];
}

const INITIAL_EFFECT =
  /(?:plasma-flame|piano-mist|piano-hit|piano-glitter|horizon-explosion|card-neon|neon-rail|neon-cursor|piano-music-glyphs)[.-]/;

/** The map knows all shipped sizes; the baseline contains only the ordinary startup graph. */
export function createStartupManifest(
  root: string,
  base: string,
  bundle?: Readonly<Record<string, BuildOutput>>
): StartupManifest {
  const sizes: Record<string, number> = {};
  const initial = new Set<string>();
  const addPublic = (directory: string) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) addPublic(path);
      else if (entry.isFile())
        sizes[`${base}${relative(resolve(root, "public"), path).replaceAll("\\", "/")}`] =
          statSync(path).size;
    }
  };
  addPublic(resolve(root, "public"));
  if (sizes[`${base}models/keyboard88.glb`] !== undefined)
    initial.add(`${base}models/keyboard88.glb`);
  if (bundle) {
    const visit = (fileName: string) => {
      const url = `${base}${fileName}`;
      if (initial.has(url)) return;
      initial.add(url);
      for (const imported of bundle[fileName]?.imports ?? []) visit(imported);
    };
    for (const output of Object.values(bundle)) {
      const source = output.type === "chunk" ? (output.code ?? "") : (output.source ?? "");
      sizes[`${base}${output.fileName}`] =
        typeof source === "string" ? Buffer.byteLength(source) : source.byteLength;
      if (
        output.type === "chunk" &&
        (output.isEntry || output.name === "ThreeStage" || output.name === "keyboard88")
      )
        visit(output.fileName);
      if (
        output.type === "asset" &&
        (output.fileName.endsWith(".css") ||
          INITIAL_EFFECT.test(output.fileName) ||
          output.originalFileNames?.some((name) => /[/\\]render[/\\]keys-arcade[/\\]/.test(name)))
      )
        initial.add(`${base}${output.fileName}`);
    }
  } else {
    // Development modules are transformed on demand. Raw source is a preliminary content estimate.
    const visited = new Set<string>();
    const visitSource = (path: string) => {
      if (visited.has(path) || !existsSync(path)) return;
      visited.add(path);
      const url = `${base}${relative(root, path).replaceAll("\\", "/")}`;
      sizes[url] = statSync(path).size;
      initial.add(url);
      if (!/\.tsx?$/.test(path)) return;
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(
        /(?:import|export)\s+(?:[^;]*?\s+from\s+)?["'](\.[^"']+)["']/g
      )) {
        const specifier = match[1];
        if (!specifier) continue;
        const target = resolve(path, "..", specifier);
        const resolved = extname(target)
          ? target
          : [".ts", ".tsx", "/index.ts", "/index.tsx"]
              .map((extension) => target + extension)
              .find(existsSync);
        if (resolved) visitSource(resolved);
      }
    };
    for (const entry of [
      "src/main.tsx",
      "src/render/three/ThreeStage.ts",
      "src/render/three/keyboard88.ts"
    ])
      visitSource(resolve(root, entry));
    for (const directory of ["src/fx", "src/render/keys-arcade"]) {
      for (const file of readdirSync(resolve(root, directory))) {
        if (/\.(?:webp|svg)$/.test(file)) visitSource(resolve(root, directory, file));
      }
    }
  }
  return { sizes, initial: [...initial] };
}
