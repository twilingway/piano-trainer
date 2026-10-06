// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getInterfaceLanguage,
  LANGUAGE_STORAGE_KEY,
  loadInterfaceLanguage,
  readBrowserLanguage,
  saveInterfaceLanguage,
  setInterfaceLanguage,
  subscribeInterfaceLanguage
} from "./interfaceLanguage";

afterEach(() => {
  setInterfaceLanguage("ru");
});

describe("interface language preference", () => {
  it("restores a supported preference and safely rejects malformed or inaccessible data", () => {
    expect(loadInterfaceLanguage({ getItem: () => "en" }, "ru-RU")).toBe("en");
    expect(loadInterfaceLanguage({ getItem: () => '"en"' }, "ru-RU")).toBe("ru");
    expect(loadInterfaceLanguage({ getItem: () => "de" }, "en-US")).toBe("en");
    expect(
      loadInterfaceLanguage(
        {
          getItem: () => {
            throw new Error("denied");
          }
        },
        "ru-RU"
      )
    ).toBe("ru");
  });

  it("uses only the primary browser language, falling back to the first entry when absent", () => {
    try {
      vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US", "ru-RU"] });
      expect(loadInterfaceLanguage({ getItem: () => null })).toBe("en");
      vi.stubGlobal("navigator", { language: "", languages: ["ru-RU", "en-US"] });
      expect(loadInterfaceLanguage({ getItem: () => null })).toBe("ru");
      vi.stubGlobal("navigator", undefined);
      expect(readBrowserLanguage()).toBeUndefined();
      expect(loadInterfaceLanguage({ getItem: () => null })).toBe("en");
      expect(
        loadInterfaceLanguage({
          getItem: () => {
            throw new Error("denied");
          }
        })
      ).toBe("en");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("initializes before rendering without saving the automatic choice", async () => {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    vi.stubGlobal("navigator", { language: "ru-RU" });
    try {
      vi.resetModules();
      const fresh = await import("./interfaceLanguage");
      expect(fresh.getInterfaceLanguage()).toBe("ru");
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBeNull();
      fresh.setInterfaceLanguage("en");
      vi.resetModules();
      const reloaded = await import("./interfaceLanguage");
      expect(reloaded.getInterfaceLanguage()).toBe("en");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("persists just the language, updates the document and notifies subscribers", () => {
    localStorage.setItem("staff-prefs", "kept");
    const listener = vi.fn();
    const stop = subscribeInterfaceLanguage(listener);
    setInterfaceLanguage("en");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(loadInterfaceLanguage(localStorage)).toBe("en");
    expect(localStorage.getItem("staff-prefs")).toBe("kept");
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("Twiling Keys — piano game and trainer");
    expect(listener).toHaveBeenCalledOnce();
    stop();
    setInterfaceLanguage("ru");
    expect(document.title).toBe("Нотопад — игра и тренажёр фортепиано");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("keeps the in-memory language when writing to storage is denied", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("denied");
      }
    });
    try {
      expect(saveInterfaceLanguage(localStorage, "en")).toBe(false);
      setInterfaceLanguage("en");
      expect(getInterfaceLanguage()).toBe("en");
      expect(document.documentElement.lang).toBe("en");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses a localized link after manual preference, before the browser, without saving it", () => {
    const getItem = vi.fn(() => null);
    expect(loadInterfaceLanguage({ getItem }, "en-US", "/ru/")).toBe("ru");
    expect(loadInterfaceLanguage({ getItem }, "ru-RU", "/en/")).toBe("en");
    expect(loadInterfaceLanguage({ getItem: () => "en" }, "ru-RU", "/ru/")).toBe("en");
    expect(loadInterfaceLanguage({ getItem: () => "broken" }, "en-US", "/ru")).toBe("ru");
    expect(loadInterfaceLanguage({ getItem }, "ru-RU", "/de/")).toBe("ru");
    expect(loadInterfaceLanguage({ getItem }, undefined, "/")).toBe("en");
    const denied = {
      getItem: () => {
        throw new Error("denied");
      }
    };
    expect(loadInterfaceLanguage(denied, "en-US", "/ru/index.html")).toBe("ru");
  });
});
