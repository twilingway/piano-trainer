// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { WindowViewMemory } from "./windowViewMemory";

describe("ephemeral window view memory", () => {
  it("restores only stable disclosures, before reading layout, without input values or events", () => {
    const memory = new WindowViewMemory(),
      original = document.createElement("div");
    original.innerHTML =
      '<details data-window-detail="course:progress" open><summary>Old localized title</summary></details><input value="old">';
    original.scrollTop = 350;
    memory.capture("library", original);
    const destination = document.createElement("div");
    destination.innerHTML =
      '<details data-window-detail="new-course"><summary>Other result</summary></details><input value="current"><details data-window-detail="course:progress"><summary>New translated title</summary></details>';
    const input = destination.querySelector("input"),
      changed = vi.fn();
    destination.addEventListener("input", changed);
    destination.addEventListener("change", changed);
    Object.defineProperty(destination, "clientHeight", { value: 100 });
    Object.defineProperty(destination, "scrollHeight", {
      get: () =>
        destination.querySelector("[data-window-detail='course:progress']")?.hasAttribute("open")
          ? 600
          : 100
    });
    memory.restore("library", destination);
    expect(destination.scrollTop).toBe(350);
    expect(
      destination.querySelector("[data-window-detail='new-course']")?.hasAttribute("open")
    ).toBe(false);
    expect(input?.value).toBe("current");
    expect(changed).not.toHaveBeenCalled();
    destination.scrollTop = 0;
    new WindowViewMemory().restore("library", destination);
    expect(destination.scrollTop).toBe(0);
  });
});
