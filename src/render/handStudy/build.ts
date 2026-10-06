import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { format, resolveConfig } from "prettier";

// Standalone study: bundle the TypeScript and inline our existing textures.
// Rebuild with: node --experimental-strip-types src/render/handStudy/build.ts
const entry = fileURLToPath(new URL("./preview.ts", import.meta.url));
const result = await build({
  configFile: false,
  logLevel: "warn",
  build: { write: false, minify: true, lib: { entry, name: "HandStudy", formats: ["iife"] } }
});
const bundles = Array.isArray(result) ? result : [result];
const script = bundles
  .flatMap((bundle) => ("output" in bundle ? bundle.output : []))
  .find((output) => output.type === "chunk");
if (!script) throw new Error("Hand study bundle was not produced");
const css = await readFile(new URL("./page.css", import.meta.url), "utf8");
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>SVG</title><style>${css}</style></head><body><main id="app"></main>
  <script>${script.code.replaceAll("</script", "<\\/script")}</script></body></html>`;
const destination = new URL("../../../public/hand-study.html", import.meta.url);
await mkdir(new URL(".", destination), { recursive: true });
await writeFile(
  destination,
  await format(html, { ...(await resolveConfig(fileURLToPath(destination))), parser: "html" })
);
console.log(fileURLToPath(destination));
