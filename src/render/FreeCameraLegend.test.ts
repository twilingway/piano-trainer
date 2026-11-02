// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { FreeCameraLegend } from "./FreeCameraLegend";

describe("free camera legend", () => {
  it("shows only for an effective camera, translates every control and resets", () => {
    const host = document.createElement("div");
    const reset = vi.fn();
    const legend = new FreeCameraLegend(host, reset, "ru");
    const element = host.querySelector("aside");
    expect(element?.hidden).toBe(true);
    legend.setVisible(true);
    expect(element?.hidden).toBe(false);
    expect(element?.textContent).toContain("СКМ — вращать");
    expect(element?.textContent).toContain("Shift + СКМ — перемещать");
    expect(element?.textContent).toContain("Колесо — масштаб");
    host.querySelector("button")?.click();
    expect(reset).toHaveBeenCalledOnce();
    legend.setLocale("en");
    expect(element?.textContent).toContain("MMB — orbit");
    expect(element?.textContent).toContain("Shift + MMB — pan");
    expect(element?.textContent).toContain("Wheel — zoom");
    expect(host.querySelector("button")?.textContent).toBe("Return to the piano");
    legend.setVisible(false);
    expect(element?.hidden).toBe(true);
    legend.destroy();
    expect(host.children).toHaveLength(0);
  });
});
