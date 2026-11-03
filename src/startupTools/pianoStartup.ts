import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import type { Plugin } from "vite";
import { startupMessages } from "../i18n/startupMessages.ts";
import { appMessages } from "../i18n/appMessages.ts";
import { translate } from "../i18n/translate.ts";
import type { Locale } from "../i18n/locales.ts";
import { startupShell } from "./startupShell.ts";
import { createStartupManifest } from "./startupManifest.ts";
import type { StartupManifest } from "./startupManifest.ts";

export function localizeStartupHtml(html: string, locale: Locale): string {
  return html.replace(
    /<!-- piano-startup:start -->[\s\S]*?<!-- piano-startup:end -->/,
    () => `<!-- piano-startup:start -->${startupShell(locale)}<!-- piano-startup:end -->`
  );
}

export function startupStylesSource(root: string): string {
  const source = readFileSync(resolve(root, "src/startup/earlyStyles.ts"), "utf8").replace(
    /^export /gm,
    ""
  );
  return ts.transpileModule(`(() => {\n${source}\ncaptureStartupStyles();\n})();`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  }).outputText;
}

/** Compile just the self-contained startup sources, keeping the initial HTML independent of chunks. */
export function startupBootstrapSource(
  root: string,
  base: string,
  manifest: StartupManifest = createStartupManifest(root, base)
): string {
  const sources = ["resourceProgress.ts", "bootstrap.ts"]
    .map((name) => readFileSync(resolve(root, "src/startup", name), "utf8"))
    .join("\n")
    .replace(/^import [^\n]+\n/gm, "")
    .replace(/^export /gm, "");
  const messages = Object.fromEntries(
    (["ru", "en"] as const).map((locale) => [
      locale,
      Object.fromEntries(
        [...Object.keys(startupMessages), "Нотопад"].map((key) => [
          key,
          translate(locale, { ...appMessages, ...startupMessages }, key)
        ])
      )
    ])
  );
  const options = JSON.stringify({ messages, ...manifest }).replace(/</g, "\\u003c");
  return ts.transpileModule(`(() => {\n${sources}\nbootPianoStartup(${options});\n})();`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  }).outputText;
}

export function pianoStartup(): Plugin {
  let root = process.cwd();
  let base = "/";
  return {
    name: "piano-startup",
    configResolved(config) {
      root = config.root;
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        const locale: Locale = /^\/ru(?:\/|$)/.test(context.originalUrl ?? context.path)
          ? "ru"
          : "en";
        return html
          .replace(
            /<meta\b[^>]*\bcharset="UTF-8"[^>]*>/i,
            (meta) => `${meta}<script>${startupStylesSource(root)}</script>`
          )
          .replace("<html ", '<html class="piano-booting" ')
          .replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, (link) =>
            /\bmedia=/.test(link) ? link : link.replace("<link", '<link media="print"')
          )
          .replace(
            "<!-- piano-startup -->",
            `<!-- piano-startup:start -->${startupShell(locale)}<!-- piano-startup:end -->`
          )
          .replace(
            "<!-- piano-startup-script -->",
            `<script>${startupBootstrapSource(root, base, createStartupManifest(root, base, context.bundle))}</script>`
          );
      }
    }
  };
}
