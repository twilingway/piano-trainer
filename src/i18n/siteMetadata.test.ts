import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { canonicalSiteUrl, siteLocaleFromPath } from "./siteMetadata";
import { escapeHtml, renderSiteMetadataHtml } from "./siteMetadataHtml";

const template = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

describe("static localized site metadata", () => {
  it.each([
    ["/", "en", "Twiling Keys", "en_US", "social-card-en-v3.png"],
    ["/ru/", "ru", "Нотопад", "ru_RU", "social-card-ru-v3.png"],
    ["/en/", "en", "Twiling Keys", "en_US", "social-card-en-v3.png"]
  ] as const)(
    "provides crawler-readable metadata at %s without executing scripts",
    (path, locale, brand, ogLocale, image) => {
      const html = renderSiteMetadataHtml(template, locale, path);
      const window = new Window({
        settings: {
          disableCSSFileLoading: true,
          disableJavaScriptFileLoading: true,
          disableJavaScriptEvaluation: true
        }
      });
      window.document.write(html);
      const document = window.document;
      const meta = (key: string) =>
        document
          .querySelector(`meta[name="${key}"], meta[property="${key}"]`)
          ?.getAttribute("content");
      expect(document.documentElement.lang).toBe(locale);
      expect(document.title).toContain(brand);
      expect(meta("description")).toContain(brand);
      expect(meta("og:site_name")).toBe(brand);
      expect(meta("og:title")).toBe(document.title);
      expect(meta("twitter:title")).toBe(document.title);
      expect(meta("og:locale")).toBe(ogLocale);
      expect(meta("og:image")).toBe(`https://keys.twiling.ru/${image}`);
      expect(meta("twitter:image")).toBe(meta("og:image"));
      expect(meta("og:image:width")).toBe("1200");
      expect(meta("og:image:height")).toBe("630");
      expect(meta("og:image:alt")).toContain(brand);
      expect(meta("og:description")).toBe(meta("twitter:description"));
      expect(meta("og:url")).toBe(`https://keys.twiling.ru${path}`);
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
        meta("og:url")
      );
      expect(document.querySelector('link[hreflang="ru"]')?.getAttribute("href")).toBe(
        "https://keys.twiling.ru/ru/"
      );
      expect(document.querySelector('link[hreflang="en"]')?.getAttribute("href")).toBe(
        "https://keys.twiling.ru/en/"
      );
      expect(document.querySelector('link[hreflang="x-default"]')?.getAttribute("href")).toBe(
        "https://keys.twiling.ru/"
      );
      const keys = Array.from(
        document.querySelectorAll("meta[name], meta[property]"),
        (element) => element.getAttribute("name") ?? element.getAttribute("property")
      );
      expect(new Set(keys).size).toBe(keys.length);
      expect(html).toContain('src="/src/main.tsx"');
      expect(html).toContain('href="/favicon.svg"');
      if (locale === "en") expect(html).not.toMatch(/[А-Яа-яЁё]/);
      window.close();
    }
  );

  it("normalizes only supported entry paths and rejects prefix lookalikes", () => {
    for (const locale of ["ru", "en"] as const) {
      for (const path of [
        `/${locale}`,
        `/${locale}/`,
        `/${locale}/index.html`,
        `/${locale}/?song=a#bar`
      ]) {
        expect(siteLocaleFromPath(path)).toBe(locale);
        expect(canonicalSiteUrl(path)).toBe(`https://keys.twiling.ru/${locale}/`);
      }
    }
    for (const path of ["/", "/index.html", "/de/", "/russian/", "/ru/song"]) {
      expect(siteLocaleFromPath(path)).toBeUndefined();
      expect(canonicalSiteUrl(path)).toBe("https://keys.twiling.ru/");
    }
  });

  it("preserves the built app and analytics when localizing an already transformed HTML", () => {
    const built = template
      .replace("/src/main.tsx", "/assets/app-hash.js")
      .replace("</head>", '<script id="analytics">productionCounter()</script></head>');
    const html = renderSiteMetadataHtml(renderSiteMetadataHtml(built, "en", "/"), "ru", "/ru/");
    expect(html).toContain('src="/assets/app-hash.js"');
    expect(html).toContain('<script id="analytics">productionCounter()</script>');
    expect(html.match(/<title>/g)).toHaveLength(1);
  });

  it("escapes metadata and fails if the controlled HTML section is missing", () => {
    expect(escapeHtml('<test title="A&B">')).toBe("&lt;test title=&quot;A&amp;B&quot;&gt;");
    expect(() => renderSiteMetadataHtml('<html lang="en"></html>', "en", "/")).toThrow(
      "metadata section is missing"
    );
  });
});
