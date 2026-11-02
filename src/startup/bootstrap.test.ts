// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootPianoStartup } from "./bootstrap";
import { startupShell } from "../startupTools/startupShell";
import { appMessages } from "../i18n/appMessages";
import { startupMessages } from "../i18n/startupMessages";
import { translate } from "../i18n/translate";
import { captureStartupStyles } from "./earlyStyles";

const catalog = { ...appMessages, ...startupMessages };
const messages = Object.fromEntries(
  (["ru", "en"] as const).map((locale) => [
    locale,
    Object.fromEntries(Object.keys(catalog).map((key) => [key, translate(locale, catalog, key)]))
  ])
) as Record<"ru" | "en", Record<string, string>>;

describe("inline piano startup", () => {
  beforeEach(() => {
    vi.stubGlobal("PerformanceObserver", undefined);
    localStorage.clear();
    document.documentElement.className = "piano-booting";
    document.body.innerHTML = `${startupShell("en")}<div id="root"></div>`;
  });
  afterEach(() => {
    window.pianoStartup?.ready("scene");
    window.pianoStartup?.ready("staff");
    delete window.pianoStartup;
    window.pianoStartupStyleCleanup?.();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("keeps React hidden and inert until both the selected scene and score are ready", () => {
    bootPianoStartup({ messages, sizes: {} });
    expect(document.getElementById("root")?.inert).toBe(true);
    window.pianoStartup?.ready("scene");
    expect(document.getElementById("piano-startup")).not.toBeNull();
    window.pianoStartup?.ready("staff");
    expect(document.getElementById("piano-startup")).toBeNull();
    expect(document.documentElement.classList.contains("piano-booting")).toBe(false);
    expect(document.getElementById("root")?.inert).toBe(false);
    expect(window.pianoStartup).toBeUndefined();
  });

  it("uses the manual language immediately and shows a scoped decoded model remainder", () => {
    localStorage.setItem("interface-language-v1", "ru");
    bootPianoStartup({ messages, sizes: { "/models/keyboard88.glb": 2_000_000 } });
    expect(document.getElementById("startup-title")?.textContent).toBe("Загружаем пианино");
    expect(document.getElementById("startup-brand")?.textContent).toBe("Нотопад");
    window.pianoStartup?.progress("/models/keyboard88.glb", 500_000);
    expect(document.getElementById("startup-known")?.textContent).toContain("1,50 МБ");
    expect(document.getElementById("startup-remaining")?.textContent).toBe(
      "Осталось примерно 1,50 МБ ресурсов"
    );
  });

  it("retains the reload action after failure and ignores late ready notifications", () => {
    bootPianoStartup({ messages, sizes: {} });
    window.pianoStartup?.fail();
    window.pianoStartup?.ready("scene");
    window.pianoStartup?.ready("staff");
    expect(document.getElementById("piano-startup")).not.toBeNull();
    expect(document.getElementById("startup-reload")?.hidden).toBe(false);
    expect(document.getElementById("startup-title")?.textContent).toBe("Could not load the piano");
  });

  it("still works when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    bootPianoStartup({ messages, sizes: {} });
    expect(window.pianoStartup).toBeDefined();
    expect(document.getElementById("startup-title")?.textContent).not.toBe("");
  });

  it("waits for local application styles while external fonts do not hold the screen", () => {
    const local = document.createElement("link");
    local.rel = "stylesheet";
    local.media = "print";
    local.href = "/assets/app.css";
    const external = document.createElement("link");
    external.rel = "stylesheet";
    external.media = "print";
    external.href = "https://fonts.invalid/fonts.css";
    vi.spyOn(document, "querySelectorAll").mockReturnValue([
      local,
      external
    ] as unknown as NodeListOf<Element>);
    bootPianoStartup({ messages, sizes: {} });
    window.pianoStartup?.ready("scene");
    window.pianoStartup?.ready("staff");
    expect(document.getElementById("piano-startup")).not.toBeNull();
    local.dispatchEvent(new Event("load"));
    expect(local.media).toBe("all");
    expect(local.dataset.startupSettled).toBe("true");
    expect(document.getElementById("piano-startup")).toBeNull();
    expect(external.media).toBe("print");
    external.dispatchEvent(new Event("error"));
    expect(external.dataset.startupSettled).toBe("true");
  });

  it("measures 304 traffic from transferSize and counts separate requests for one URL", () => {
    let emit: ((entries: PerformanceEntry[]) => void) | undefined;
    vi.stubGlobal(
      "PerformanceObserver",
      class {
        constructor(callback: PerformanceObserverCallback) {
          emit = (entries) => {
            callback(
              { getEntries: () => entries } as PerformanceObserverEntryList,
              {} as PerformanceObserver
            );
          };
        }
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );
    bootPianoStartup({ messages, sizes: {} });
    const request = {
      name: new URL("/large.glb", document.baseURI).href,
      entryType: "resource",
      decodedBodySize: 2_000_000,
      encodedBodySize: 1_000_000,
      transferSize: 500,
      responseStatus: 304,
      startTime: 1,
      duration: 10,
      initiatorType: "fetch"
    };
    emit?.([request as PerformanceResourceTiming]);
    expect(document.getElementById("startup-network")?.textContent).toBe(
      "Network traffic: 0.00 MB"
    );
    expect(document.getElementById("startup-resources")?.textContent).toBe(
      "Resources: 2.00 MB · cached: 2.00 MB"
    );
    emit?.([
      {
        ...request,
        startTime: 20,
        transferSize: 1_000_300,
        responseStatus: 200
      } as PerformanceResourceTiming
    ]);
    expect(document.getElementById("startup-network")?.textContent).toBe(
      "Network traffic: 1.00 MB"
    );
    expect(document.getElementById("startup-resources")?.textContent).toBe(
      "Resources: 4.00 MB · cached: 2.00 MB"
    );
  });

  it("remembers a stylesheet error from head before the body bootstrap exists", () => {
    captureStartupStyles();
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.media = "print";
    document.body.prepend(stylesheet);
    stylesheet.dispatchEvent(new Event("error"));
    expect(stylesheet.dataset.startupSettled).toBe("true");
    expect(stylesheet.dataset.startupFailed).toBe("true");
    bootPianoStartup({ messages, sizes: {} });
    expect(window.pianoStartupStyleCleanup).toBeUndefined();
    expect(document.getElementById("startup-reload")?.hidden).toBe(false);
    expect(document.getElementById("startup-title")?.textContent).toBe("Could not load the piano");
  });

  it("shows an initial content estimate immediately before any network measurements", () => {
    bootPianoStartup({
      messages,
      sizes: { "/entry.js": 2_000_000, "/keyboard.glb": 1_000_000 },
      initial: ["/entry.js", "/keyboard.glb"]
    });
    expect(document.getElementById("startup-estimate")?.textContent).toBe(
      "To start: about 3.00 MB of resources"
    );
    expect(document.getElementById("startup-remaining")?.textContent).toBe(
      "About 3.00 MB of resources remaining"
    );
    window.pianoStartup?.progress("/keyboard.glb", 250_000);
    expect(document.getElementById("startup-remaining")?.textContent).toBe(
      "About 2.75 MB of resources remaining"
    );
  });

  it("keeps a development image import wrapper separate from the actual image download", () => {
    bootPianoStartup({
      messages,
      sizes: { "/src/image.webp": 2_000_000 },
      initial: ["/src/image.webp"]
    });
    window.pianoStartup?.progress("/src/image.webp?import", 100);
    expect(document.getElementById("startup-remaining")?.textContent).toBe(
      "About 2.00 MB of resources remaining"
    );
    window.pianoStartup?.progress("/src/image.webp", 500_000);
    expect(document.getElementById("startup-remaining")?.textContent).toBe(
      "About 1.50 MB of resources remaining"
    );
  });
});
