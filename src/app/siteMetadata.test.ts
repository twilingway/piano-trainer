// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { updateSiteMetadata } from "./siteMetadata";

describe("live site metadata", () => {
  it("changes all translated fields without changing URL identity or duplicating tags", () => {
    document.head.innerHTML =
      '<link rel="stylesheet" href="data:text/css,body{}"><meta name="description" content="old">';
    const currentUrl = window.location.href;
    localStorage.setItem("staff-prefs", "kept");
    updateSiteMetadata(document, "ru", "/ru/");
    expect(document.title).toBe("Нотопад — игра и тренажёр фортепиано");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toContain(
      "Нотопад"
    );
    updateSiteMetadata(document, "en", "/ru/");
    updateSiteMetadata(document, "en", "/ru/");
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("Twiling Keys — piano game and trainer");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toContain(
      "Twiling Keys"
    );
    expect(document.querySelector('meta[property="og:locale"]')?.getAttribute("content")).toBe(
      "en_US"
    );
    expect(document.querySelector('meta[property="og:site_name"]')?.getAttribute("content")).toBe(
      "Twiling Keys"
    );
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute("content")).toContain(
      "social-card-en-v3.png"
    );
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(
      "https://keys.twiling.ru/ru/"
    );
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://keys.twiling.ru/ru/"
    );
    expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.querySelectorAll('meta[property="og:locale"]')).toHaveLength(1);
    expect(document.querySelectorAll('link[rel="alternate"]')).toHaveLength(3);
    expect(document.querySelector('link[rel="stylesheet"]')?.getAttribute("href")).toBe(
      "data:text/css,body{}"
    );
    expect(window.location.href).toBe(currentUrl);
    expect(localStorage.getItem("staff-prefs")).toBe("kept");
  });
});
