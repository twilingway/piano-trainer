// @vitest-environment happy-dom
import { act } from "react";
import type { ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../../app/interfaceLanguage";
import { CAMERA_PRESETS, DEFAULT_CAMERA } from "../../render/worldCamera";
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
  freeRoadLayout: { height: 2, distance: 0, width: 4, shape: "line" },
  onFreeRoadLayout: noop,
  onNotesPerspective: noop,
  fallingNoteStyle: "filled",
  onFallingNoteStyle: noop,
  handStyle: "rendered",
  onHandStyle: noop,
  flatNoteBurning: true,
  onFlatNoteBurning: noop,
  flatPressEffects: true,
  onFlatPressEffects: noop,
  noteParticles: true,
  onNoteParticles: noop,
  keyboardDim: false,
  onKeyboardDim: noop,
  roadGuides: false,
  onRoadGuides: noop,
  road: { far: 0.3, horizon: 0.3 },
  onRoad: noop,
  camera: DEFAULT_CAMERA,
  onCamera: noop
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
        <KeyboardSettings {...base} keyStyle="classic" pianist={true} onPianist={noop} />
      );
    });
    expect(pianistBox()).toBeUndefined();
  });
});

describe("free camera setting", () => {
  it("replaces screen percentages with world controls only in free 3D and restores the saved framing", () => {
    const changed = vi.fn();
    const roadChanged = vi.fn();
    act(() => {
      root.render(
        <KeyboardSettings
          {...base}
          freeCamera
          onRoad={roadChanged}
          freeRoadLayout={{ height: 2, distance: 4, width: 6, shape: "convex" }}
          onFreeRoadLayout={changed}
        />
      );
    });
    expect(host.querySelector('[data-setting-target="road-horizon"]')).toBeNull();
    expect(host.querySelector('[data-setting-target="road-width"]')).toBeNull();
    expect(
      host.querySelector<HTMLInputElement>('[data-setting-target="free-source-height"]')?.value
    ).toBe("2");
    expect(
      host.querySelector<HTMLInputElement>('[data-setting-target="free-source-distance"]')?.value
    ).toBe("4");
    expect(
      host.querySelector<HTMLSelectElement>('[data-setting-target="free-source-shape"]')?.value
    ).toBe("convex");
    act(() => {
      root.render(<KeyboardSettings {...base} freeCamera={false} onRoad={roadChanged} />);
    });
    expect(host.querySelector('[data-setting-target="free-source-height"]')).toBeNull();
    expect(
      host.querySelector<HTMLInputElement>('[data-setting-target="road-horizon"]')?.value
    ).toBe(String(base.road.horizon * 100));
    expect(host.querySelector<HTMLInputElement>('[data-setting-target="road-width"]')?.value).toBe(
      String(base.road.far * 100)
    );
    expect(
      host.querySelector<HTMLInputElement>('[data-setting-target="road-horizon-number"]')?.value
    ).toBe("30");
    expect(
      host.querySelector<HTMLInputElement>('[data-setting-target="road-width-number"]')?.value
    ).toBe("30");
    expect(roadChanged).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
  it.each(["ru", "en"] as const)("offers WASD only in the 3D free camera in %s", (language) => {
    setInterfaceLanguage(language);
    const change = vi.fn();
    act(() => {
      root.render(
        <KeyboardSettings {...base} freeCamera freeCameraWasd onFreeCameraWasd={change} />
      );
    });
    const box = host.querySelector<HTMLInputElement>(
      '[data-setting-target="free-camera-wasd"] input'
    );
    expect(box?.checked).toBe(true);
    expect(box?.closest("label")?.textContent).toBe(
      language === "ru" ? "Передвижение WASD" : "Move with WASD"
    );
    act(() => box?.click());
    expect(change).toHaveBeenCalledWith(false);
    act(() => {
      root.render(
        <KeyboardSettings {...base} freeCamera={false} freeCameraWasd onFreeCameraWasd={change} />
      );
    });
    expect(host.querySelector('[data-setting-target="free-camera-wasd"]')).toBeNull();
    act(() => {
      root.render(
        <KeyboardSettings
          {...base}
          keyStyle="arcade"
          freeCamera
          freeCameraWasd
          onFreeCameraWasd={change}
        />
      );
    });
    expect(host.querySelector('[data-setting-target="free-camera-wasd"]')).toBeNull();
  });
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

describe("independent keyboard effects", () => {
  it.each(["classic", "arcade", "3d"] as const)(
    "offers all three independent effects in %s",
    (keyStyle) => {
      const burning = vi.fn();
      const flash = vi.fn();
      const particles = vi.fn();
      act(() => {
        root.render(
          <KeyboardSettings
            {...base}
            keyStyle={keyStyle}
            onFlatNoteBurning={burning}
            onFlatPressEffects={flash}
            onNoteParticles={particles}
          />
        );
      });
      const control = (name: string) => {
        const box = [...host.querySelectorAll("label")]
          .find((label) => label.textContent === name)
          ?.querySelector("input");
        if (!box) throw new Error("Expected effect control");
        return box;
      };
      expect(host.textContent).toContain("Анимация и эффекты");
      act(() => {
        control("Летящие нотки").click();
      });
      expect(particles).toHaveBeenCalledExactlyOnceWith(false);
      expect(burning).not.toHaveBeenCalled();
      expect(flash).not.toHaveBeenCalled();
      act(() => {
        control("Горение").click();
      });
      expect(burning).toHaveBeenCalledExactlyOnceWith(false);
      act(() => {
        control("Вспышка при нажатии").click();
      });
      expect(flash).toHaveBeenCalledExactlyOnceWith(false);
      expect(host.querySelector('[data-setting-target="note-particles"]')).toBe(
        control("Летящие нотки")
      );
    }
  );

  it("translates the effects into English", () => {
    setInterfaceLanguage("en");
    act(() => {
      root.render(<KeyboardSettings {...base} />);
    });
    expect(host.textContent).toContain("Animation and effects");
    expect(host.textContent).toContain("Flames");
    expect(host.textContent).toContain("Key press flash");
    expect(host.textContent).toContain("Floating notes");
  });

  it("shows only the new 3D hands without rewriting the flat hand preference", () => {
    const changed = vi.fn();
    act(() => {
      root.render(
        <KeyboardSettings {...base} keyStyle="3d" handStyle="drawn" onHandStyle={changed} />
      );
    });
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Вид рук"]');
    expect(select?.value).toBe("rendered");
    expect(select?.disabled).toBe(true);
    expect(select?.options.length).toBe(1);
    expect(changed).not.toHaveBeenCalled();
    act(() => {
      root.render(
        <KeyboardSettings {...base} keyStyle="classic" handStyle="drawn" onHandStyle={changed} />
      );
    });
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Вид рук"]')?.value).toBe(
      "drawn"
    );
    expect(
      host.querySelector<HTMLSelectElement>('select[aria-label="Вид рук"]')?.options.length
    ).toBe(2);
    expect(changed).not.toHaveBeenCalled();
  });
});

it.each(["ru", "en"] as const)(
  "offers exactly three keyboard styles in %s with independent note projection",
  (language) => {
    setInterfaceLanguage(language);
    act(() => {
      root.render(<KeyboardSettings {...base} />);
    });
    const selects = host.querySelectorAll("select");
    const style = selects[1];
    const projection = selects[2];
    if (!style || !projection) throw new Error("Expected style and projection selects");
    expect(Array.from(style.options, (option) => option.value)).toEqual([
      "classic",
      "arcade",
      "3d"
    ]);
    expect(style.options[2]?.textContent).toBe("3D");
    expect(Array.from(projection.options, (option) => option.value)).toEqual([
      "direct",
      "perspective"
    ]);
  }
);

it("resets the camera to the initial full top preset", () => {
  const onCamera = vi.fn();
  act(() => {
    root.render(<KeyboardSettings {...base} onCamera={onCamera} />);
  });
  const reset = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Сбросить камеру"
  );
  act(() => {
    reset?.click();
  });
  expect(onCamera).toHaveBeenCalledExactlyOnceWith(CAMERA_PRESETS.top);
});

it.each(["classic", "arcade", "3d"] as const)(
  "offers saved horizon controls in %s only while perspective is enabled",
  (keyStyle) => {
    const change = vi.fn();
    act(() => {
      root.render(
        <KeyboardSettings {...base} keyStyle={keyStyle} notesPerspective={false} onRoad={change} />
      );
    });
    const horizon = () =>
      host.querySelector<HTMLInputElement>('[data-setting-target="road-horizon"]');
    const far = () => host.querySelector<HTMLInputElement>('[data-setting-target="road-width"]');
    expect(horizon()?.disabled).toBe(true);
    expect(far()?.disabled).toBe(true);
    expect(horizon()?.value).toBe(String(base.road.horizon * 100));
    expect(host.textContent).toContain(
      "Горизонт и ширина у горизонта доступны в перспективной проекции."
    );
    act(() => {
      root.render(
        <KeyboardSettings {...base} keyStyle={keyStyle} notesPerspective={true} onRoad={change} />
      );
    });
    expect(horizon()?.disabled).toBe(false);
    expect(far()?.disabled).toBe(false);
    expect(horizon()?.min).toBe("0");
    expect(horizon()?.max).toBe("150");
    expect(far()?.min).toBe("-100");
    expect(far()?.max).toBe("90");
    const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    const slider = horizon();
    if (!slider || !nativeValue?.set) throw new Error("Expected horizon control");
    act(() => {
      nativeValue.set?.call(slider, "0");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(change).toHaveBeenCalledWith({ horizon: 0 });
    const width = far();
    if (!width) throw new Error("Expected width control");
    act(() => {
      nativeValue.set?.call(width, "-100");
      width.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(change).toHaveBeenCalledWith({ far: -1 });
    expect(width.step).toBe("1");
  }
);
it.each(["filled", "flat", "glass"] as const)(
  "selects %s 3D notes without changing the keyboard style",
  (fallingNoteStyle) => {
    const change = vi.fn();
    const keyChange = vi.fn();
    act(() => {
      root.render(
        <KeyboardSettings
          {...base}
          fallingNoteStyle={fallingNoteStyle}
          onFallingNoteStyle={change}
          onKeyStyle={keyChange}
        />
      );
    });
    const style = host.querySelector<HTMLSelectElement>(
      '[data-setting-target="falling-note-style"]'
    );
    expect(style?.value).toBe(fallingNoteStyle);
    expect([...(style?.options ?? [])].map((option) => option.value)).toEqual([
      "filled",
      "flat",
      "glass"
    ]);
    act(() => {
      if (style) {
        style.value = "flat";
        style.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(change).toHaveBeenCalledWith("flat");
    expect(keyChange).not.toHaveBeenCalled();
    act(() => {
      root.render(
        <KeyboardSettings
          {...base}
          keyStyle="classic"
          fallingNoteStyle={fallingNoteStyle}
          onFallingNoteStyle={change}
        />
      );
    });
    expect(host.querySelector('select[aria-label="Оформление нот"]')).toBeNull();
  }
);

describe("camera compositions", () => {
  it("changes the composition and world FOV without invoking musical or keyboard camera actions", () => {
    const onCameraComposition = vi.fn(),
      onWorldFov = vi.fn(),
      onCamera = vi.fn();
    act(() => {
      root.render(
        <KeyboardSettings
          {...base}
          cameraComposition="free"
          onCameraComposition={onCameraComposition}
          worldFov={67}
          onWorldFov={onWorldFov}
          onCamera={onCamera}
        />
      );
    });
    const select = host.querySelector<HTMLSelectElement>(
      '[data-setting-target="camera-composition"]'
    );
    const fov = host.querySelector<HTMLInputElement>('[data-setting-target="world-fov"]');
    expect(select?.value).toBe("free");
    expect(fov?.value).toBe("67");
    act(() => {
      if (select) {
        select.value = "game";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(onCameraComposition).toHaveBeenCalledWith("game");
    act(() => {
      if (fov) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(fov, "80");
        fov.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    expect(onWorldFov).toHaveBeenCalledWith(80);
    expect(onCamera).not.toHaveBeenCalled();
    expect(host.querySelector('[data-setting-target="free-source-height"]')).not.toBeNull();
  });
  it("explains performance camera priority and translates the composition selector", () => {
    setInterfaceLanguage("en");
    act(() => {
      root.render(
        <KeyboardSettings
          {...base}
          cameraComposition="game"
          onCameraComposition={vi.fn()}
          performanceScene
        />
      );
    });
    const select = host.querySelector<HTMLSelectElement>('[aria-label="3D composition"]');
    expect(select?.disabled).toBe(true);
    expect(select?.textContent).toContain("Game frame");
    expect(host.textContent).toContain("Your composition returns");
    setInterfaceLanguage("ru");
  });
});
