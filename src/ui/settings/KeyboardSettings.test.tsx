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
  flatNoteBurning: true,
  onFlatNoteBurning: noop,
  flatPressEffects: true,
  onFlatPressEffects: noop,
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

describe("free camera setting", () => {
  it("shows and changes the 3D toggle, hiding it in other styles", () => {
    const changed = vi.fn();
    act(() => {
      root.render(<KeyboardSettings {...base} freeCamera={true} onFreeCamera={changed} />);
    });
    const label = [...host.querySelectorAll("label")].find((node) =>
      node.textContent.includes("Свободная камера")
    );
    const box = label?.querySelector("input");
    expect(box?.checked).toBe(true);
    act(() => box?.click());
    expect(changed).toHaveBeenCalledWith(false);
    act(() => {
      root.render(
        <KeyboardSettings {...base} keyStyle="classic" freeCamera={true} onFreeCamera={changed} />
      );
    });
    expect(host.textContent).not.toContain("Свободная камера");
  });
});

describe("flat keyboard effects", () => {
  it.each(["classic", "arcade"] as const)(
    "toggles fire and press effects independently in %s",
    (keyStyle) => {
      const onBurning = vi.fn();
      const onPresses = vi.fn();
      act(() => {
        root.render(
          <KeyboardSettings
            {...base}
            keyStyle={keyStyle}
            onFlatNoteBurning={onBurning}
            onFlatPressEffects={onPresses}
          />
        );
      });
      const box = (text: string) => {
        const input = [...host.querySelectorAll("label")]
          .find((label) => label.textContent === text)
          ?.querySelector("input");
        if (!input) throw new Error("Expected the effect checkbox");
        return input;
      };
      const burning = box("Горение нот");
      const presses = box("Эффекты нажатия");
      expect(burning.checked).toBe(true);
      expect(presses.checked).toBe(true);
      act(() => {
        burning.click();
      });
      expect(onBurning).toHaveBeenCalledExactlyOnceWith(false);
      expect(onPresses).not.toHaveBeenCalled();
      act(() => {
        presses.click();
      });
      expect(onPresses).toHaveBeenCalledExactlyOnceWith(false);
    }
  );

  it.each(["perspective", "3d"] as const)(
    "does not offer flat effect settings in %s",
    (keyStyle) => {
      act(() => {
        root.render(<KeyboardSettings {...base} keyStyle={keyStyle} />);
      });
      expect(host.textContent).not.toContain("Горение нот");
      expect(host.textContent).not.toContain("Эффекты нажатия");
    }
  );

  it("translates both controls into English", () => {
    setInterfaceLanguage("en");
    act(() => {
      root.render(<KeyboardSettings {...base} keyStyle="arcade" />);
    });
    expect(host.textContent).toContain("Note flames");
    expect(host.textContent).toContain("Key press effects");
  });
});
