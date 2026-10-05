// @vitest-environment happy-dom
import { setInterfaceLanguage } from "../../app/interfaceLanguage";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildInfo } from "../../app/buildInfo";
import { AboutSettings } from "./AboutSettings";

let host: HTMLDivElement;
let root: Root;
const sha = "bf6b780978702193f91bb9e7c0689a5652c209bf";
const builtAt = "2026-10-05T13:04:11.000Z";

beforeEach(() => {
  setInterfaceLanguage("ru");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

function render(build: BuildInfo) {
  act(() => {
    root.render(<AboutSettings build={build} />);
  });
  return host.querySelector(".about-build dd")?.textContent;
}

function link(text: string) {
  return Array.from(host.querySelectorAll("a")).find((anchor) => anchor.textContent === text);
}

describe("about settings", () => {
  it("links the merged pull request and the commit", () => {
    expect(render({ sha, pr: 67, builtAt })).toBe("#67 · bf6b780");
    expect(link("#67")?.href).toBe("https://github.com/twilingway/piano-trainer/pull/67");
    expect(link("bf6b780")?.href).toBe(`https://github.com/twilingway/piano-trainer/commit/${sha}`);
    expect(host.querySelector("time")?.getAttribute("datetime")).toBe(builtAt);
  });

  it("shows only the commit without a pull request", () => {
    expect(render({ sha, pr: null, builtAt })).toBe("bf6b780");
  });

  it("marks a local build", () => {
    expect(render({ sha: null, pr: null, builtAt })).toBe("локальная сборка");
  });

  it("opens the author's channels in a new tab", () => {
    render({ sha, pr: 67, builtAt });
    for (const name of ["Telegram", "YouTube", "Rutube", "VK"]) {
      const anchor = link(name);
      expect(anchor?.target).toBe("_blank");
      expect(anchor?.rel).toBe("noreferrer");
    }
    expect(link("Telegram")?.href).toBe("https://t.me/twilingkeys");
  });
});
