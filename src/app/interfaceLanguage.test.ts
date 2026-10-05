// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getInterfaceLanguage,
  LANGUAGE_STORAGE_KEY,
  loadInterfaceLanguage,
  saveInterfaceLanguage,
  setInterfaceLanguage,
  subscribeInterfaceLanguage
} from "./interfaceLanguage";

afterEach(() => {
  setInterfaceLanguage("ru");
});

describe("interface language preference", () => {
  it("restores a supported preference and safely rejects malformed or inaccessible data", () => {
    expect(loadInterfaceLanguage({ getItem: () => "en" })).toBe("en");
    expect(loadInterfaceLanguage({ getItem: () => '"en"' })).toBe("ru");
    expect(loadInterfaceLanguage({ getItem: () => "de" })).toBe("ru");
    expect(
      loadInterfaceLanguage({
        getItem: () => {
          throw new Error("denied");
        }
      })
    ).toBe("ru");
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
    expect(document.title).toBe("Twiling Keys");
    expect(listener).toHaveBeenCalledOnce();
    stop();
    setInterfaceLanguage("ru");
    expect(document.title).toBe("Нотопад");
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
});
