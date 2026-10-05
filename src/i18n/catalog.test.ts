import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { LOCALES } from "./locales";
import type { Locale } from "./locales";
import { messages } from "./messages";

function params(message: string): string[] {
  return [...new Set([...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
}

describe("translation coverage", () => {
  it("provides every registered language and matching named parameters", () => {
    for (const [source, translations] of Object.entries(messages)) {
      for (const locale of Object.keys(LOCALES) as Locale[]) {
        if (locale === "ru") continue;
        const translated = translations[locale];
        expect(translated.trim(), `${locale}: ${source}`).not.toBe("");
        expect(params(translated), `${locale}: ${source}`).toEqual(params(source));
      }
    }
  });

  it("includes every literal translation call in the production source", () => {
    const missing: string[] = [];
    const scan = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          scan(path);
          continue;
        }
        if (!/\.tsx?$/.test(path) || path.includes(".test.") || path.includes("i18n")) continue;
        const source = ts.createSourceFile(
          path,
          readFileSync(path, "utf8"),
          ts.ScriptTarget.Latest,
          true
        );
        const visit = (node: ts.Node) => {
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === "t"
          ) {
            const arg = node.arguments[0];
            if (arg && ts.isStringLiteral(arg) && !Object.hasOwn(messages, arg.text)) {
              missing.push(`${path}: ${arg.text}`);
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
    };
    scan(join(process.cwd(), "src"));
    expect(missing).toEqual([]);
  });
});
