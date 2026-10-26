// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { defaultTimingPreferences } from "../app/timingPreferences";
import { TimingSettings, type TimingSettingsProps } from "./TimingSettings";

function render(
  countdown: number | null,
  running = true,
  phase: TimingSettingsProps["phase"] = null
) {
  const props: TimingSettingsProps = {
    preferences: defaultTimingPreferences(),
    deviceId: "piano",
    deviceName: "Piano",
    transport: "usb",
    progress: { warmup: 0, measured: 0, total: 24, complete: false, result: null },
    running,
    countdown,
    phase,
    onTransport: vi.fn(),
    onOffsets: vi.fn(),
    onStart: vi.fn(),
    onCancel: vi.fn()
  };
  return renderToStaticMarkup(<TimingSettings {...props} />);
}

afterEach(() => {
  setInterfaceLanguage("ru");
});

describe("calibration instructions", () => {
  it("shows a localized countdown with cancellation before tap counts", () => {
    setInterfaceLanguage("ru");
    const preparing = render(3);
    expect(preparing).toContain('role="status" aria-live="assertive"');
    expect(preparing).toContain("Приготовьтесь: 3");
    expect(preparing).toContain("Отменить калибровку");
    expect(preparing).not.toContain("Разминка: 0/4 нажатия");
    const ready = render(null);
    expect(ready).not.toContain("Приготовьтесь:");
    expect(ready).toContain("Разминка: 0/4 нажатия · Замер: 0/24 нажатия");
    expect(ready).toContain("24/24 — все 24 нажатия записаны");
  });

  it("shows distinct introductory, warm-up and measurement phases in both languages", () => {
    expect(render(null, true, "lead-in")).toContain("первые 3 щелчка не считаются");
    expect(render(null, true, "warmup")).toContain("Разминка: нажимайте C4");
    expect(render(null, true, "measurement")).toContain("Замер: продолжайте нажимать C4");
    expect(render(null, false, "lead-in")).not.toContain("Подстройтесь под метроном:");
    setInterfaceLanguage("en");
    expect(render(null, true, "lead-in")).toContain(
      "Find the beat: the first 3 clicks do not count."
    );
    expect(render(null, true, "warmup")).toContain("Warm-up: press C4 with each click.");
    expect(render(null, true, "measurement")).toContain(
      "Measurement: keep pressing C4 with each click."
    );
  });

  it("translates preparation and explains the 24 taps in English", () => {
    setInterfaceLanguage("en");
    const preparing = render(2);
    expect(preparing).toContain("Get ready: 2");
    expect(preparing).toContain("4 warm-up taps do not count");
    expect(preparing).toContain("24/24 means all 24 taps were recorded");
    expect(render(null)).toContain("Warm-up: 0/4 taps · Measurement: 0/24 taps");
    expect(render(2, false)).not.toContain("Get ready:");
  });
});
