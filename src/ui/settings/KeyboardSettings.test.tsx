// @vitest-environment happy-dom
import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../../app/interfaceLanguage";
import { DEFAULT_CAMERA } from "../../render/worldCamera";
import { KeyboardSettings } from "./KeyboardSettings";

let host: HTMLDivElement;
let root: Root;
const noop = () => undefined;

const base: ComponentProps<typeof KeyboardSettings> = {
  keyRange: "song",
  onKeyRange: noop,
  showLabels: false,
  onShowLabels: noop,
  keyStyle: "3d",
  onKeyStyle: noop,
  notesPerspective: true,
  onNotesPerspective: noop,
  handStyle: "rendered",
  onHandStyle: noop,
  keyboardDim: false,
  onKeyboardDim: noop,
  roadGuides: false,
  onRoadGuides: noop,
  road: { far: 0.3, horizon: 0.3 },
  onRoad: noop,
  camera: DEFAULT_CAMERA,
  onCamera: noop,
  toggles: null
};

function pianistBox(): HTMLInputElement | undefined {
  const label = [...host.querySelectorAll("label")].find((l) =>
    l.textContent.includes("Мой пианист (проба)")
  );
  return label?.querySelector("input") ?? undefined;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setInterfaceLanguage("ru");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

describe("KeyboardSettings: the local pianist", () => {
  it("offers the pianist in 3D when the local model is there", () => {
    const onPianist = vi.fn();
    act(() => {
      root.render(<KeyboardSettings {...base} pianist={false} onPianist={onPianist} />);
    });
    const box = pianistBox();
    expect(box?.checked).toBe(false);
    act(() => {
      box?.click();
    });
    expect(onPianist).toHaveBeenCalledWith(true);
  });

  it("has no pianist choice without the local model", () => {
    act(() => {
      root.render(<KeyboardSettings {...base} onPianist={noop} />);
    });
    expect(pianistBox()).toBeUndefined();
  });

  it("has no pianist choice outside the 3D keys", () => {
    act(() => {
      root.render(
        <KeyboardSettings {...base} keyStyle="perspective" pianist={true} onPianist={noop} />
      );
    });
    expect(pianistBox()).toBeUndefined();
  });
});
