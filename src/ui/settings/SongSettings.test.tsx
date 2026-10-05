// @vitest-environment happy-dom
import { act, useState } from "react";
import type { ComponentProps, SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Key } from "../../song/keySignature";
import { SongSettings } from "./SongSettings";

const MAJOR_NAMES = [
  "До мажор",
  "Ре-бемоль мажор",
  "Ре мажор",
  "Ми-бемоль мажор",
  "Ми мажор",
  "Фа мажор",
  "Фа-диез мажор",
  "Соль мажор",
  "Ля-бемоль мажор",
  "Ля мажор",
  "Си-бемоль мажор",
  "Си мажор"
];
const MINOR_NAMES = [
  "До минор",
  "До-диез минор",
  "Ре минор",
  "Ре-диез минор",
  "Ми минор",
  "Фа минор",
  "Фа-диез минор",
  "Соль минор",
  "Соль-диез минор",
  "Ля минор",
  "Си-бемоль минор",
  "Си минор"
];
const TARGET_SHIFTS = [0, 1, 2, 3, 4, 5, 6, 7, -4, -3, -2, -1];

let host: HTMLDivElement;
let root: Root;
const onTranspose = vi.fn<(value: SetStateAction<number>) => void>();
const onResetFingers = vi.fn();
const onOctave = vi.fn<(octave: number) => void>();
const defaults: ComponentProps<typeof SongSettings> = {
  sourceKey: { tonic: 0, mode: "major", fifths: 0 },
  transpose: 0,
  onTranspose,
  octave: 0,
  onOctave,
  outside: 0,
  bestOctave: 0,
  fingersChanged: false,
  onResetFingers
};

async function render(props: Partial<ComponentProps<typeof SongSettings>> = {}) {
  await act(async () => {
    await Promise.resolve();
    root.render(<SongSettings {...defaults} {...props} />);
  });
}
function select() {
  const element = host.querySelector<HTMLSelectElement>("select[aria-label='Тональность']");
  if (!element) throw new Error("Missing key selector");
  return element;
}
async function choose(tonic: number) {
  await act(async () => {
    await Promise.resolve();
    const element = select();
    element.value = String(tonic);
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function click(label: string) {
  const element = host.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`);
  if (!element) throw new Error(`Missing button: ${label}`);
  await act(async () => {
    await Promise.resolve();
    // Happy DOM forwards a label click to its first button even for another button target.
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    event.preventDefault();
    element.dispatchEvent(event);
  });
}
function Harness({ sourceKey }: { sourceKey: Key }) {
  const [transpose, setTranspose] = useState(0);
  return (
    <SongSettings
      {...defaults}
      sourceKey={sourceKey}
      transpose={transpose}
      onTranspose={setTranspose}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

describe("song key settings", () => {
  it.each([
    { sourceKey: { tonic: 0, mode: "major", fifths: 0 } as const, names: MAJOR_NAMES },
    { sourceKey: { tonic: 9, mode: "minor", fifths: 0 } as const, names: MINOR_NAMES }
  ])(
    "names all 12 $sourceKey.mode targets consistently with their key signatures",
    async ({ sourceKey, names }) => {
      await render({ sourceKey });
      expect(Array.from(select().options, (option) => option.textContent)).toEqual(
        names.map((name, tonic) => name + (tonic === sourceKey.tonic ? " (как в нотах)" : ""))
      );
    }
  );

  it.each([
    { tonic: 1, mode: "major", fifths: 7, name: "До-диез мажор" },
    { tonic: 11, mode: "major", fifths: -7, name: "До-бемоль мажор" },
    { tonic: 6, mode: "major", fifths: -6, name: "Соль-бемоль мажор" },
    { tonic: 10, mode: "minor", fifths: 7, name: "Ля-диез минор" },
    { tonic: 8, mode: "minor", fifths: -7, name: "Ля-бемоль минор" },
    { tonic: 3, mode: "minor", fifths: -6, name: "Ми-бемоль минор" }
  ] as const)("preserves original $name at zero transposition", async ({ name, ...sourceKey }) => {
    await render({ sourceKey });
    const original = select().options[sourceKey.tonic];
    expect(original?.textContent).toBe(`${name} (как в нотах)`);
    expect(select().options[select().selectedIndex]).toBe(original);
    await choose(sourceKey.tonic);
    expect(onTranspose).toHaveBeenLastCalledWith(0);
  });

  it.each(["major", "minor"] as const)(
    "passes the correct semitone shift for every %s source and target",
    async (mode) => {
      for (let source = 0; source < 12; source++) {
        await render({ sourceKey: { tonic: source, mode } });
        for (let target = 0; target < 12; target++) {
          await choose(target);
          expect(onTranspose).toHaveBeenLastCalledWith(TARGET_SHIFTS[(target - source + 12) % 12]);
        }
      }
    }
  );

  it("keeps semitone buttons bounded and the selected pitch class in sync", async () => {
    await act(async () => {
      await Promise.resolve();
      root.render(<Harness sourceKey={{ tonic: 0, mode: "major", fifths: 0 }} />);
    });
    for (let shift = 1; shift <= 11; shift++) {
      await click("На полтона выше");
      expect(select().value).toBe(String(shift));
      expect(select().options[select().selectedIndex]?.textContent).toBe(MAJOR_NAMES[shift]);
    }
    await click("На полтона выше");
    expect(select().value).toBe("11");
    for (let shift = 10; shift >= -11; shift--) {
      await click("На полтона ниже");
      const tonic = (shift + 12) % 12;
      expect(select().value).toBe(String(tonic));
      expect(select().options[select().selectedIndex]?.textContent).toBe(
        (MAJOR_NAMES[tonic] ?? "") + (tonic === 0 ? " (как в нотах)" : "")
      );
    }
    await click("На полтона ниже");
    expect(select().value).toBe("1");
    await choose(0);
    expect(select().value).toBe("0");
    expect(select().options[select().selectedIndex]?.textContent).toBe("До мажор (как в нотах)");
  });

  it("hides key controls when no key is available and preserves disabled finger reset", async () => {
    await render({ sourceKey: undefined, fingersChanged: true });
    expect(host.querySelector("select")).toBeNull();
    expect(host.querySelector("[aria-label='На полтона выше']")).toBeNull();
    const reset = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Сбросить пальцы"
    );
    expect(reset?.textContent).toBe("Сбросить пальцы");
    expect(reset?.disabled).toBe(true);
    expect(host.textContent).toContain("Изменение пальцев временно отключено");
    reset?.click();
    expect(onResetFingers).not.toHaveBeenCalled();
  });

  it("offers the octave that fits the player's keyboard", async () => {
    await render({ outside: 7, bestOctave: -1 });
    expect(host.textContent).toContain("Нот вне вашей клавиатуры: 7.");
    const down = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Октава вниз"
    );
    if (!down) throw new Error("Missing octave button");
    await act(async () => {
      await Promise.resolve();
      down.click();
    });
    expect(onOctave).toHaveBeenCalledWith(-1);
  });

  it("only counts the notes when no octave helps", async () => {
    await render({ outside: 3, bestOctave: 0 });
    expect(host.textContent).toContain("Нот вне вашей клавиатуры: 3.");
    expect(host.textContent).not.toContain("Октава вниз");
    expect(host.textContent).not.toContain("Октава вверх");
  });

  it("labels an inferred source key without claiming it came from the score", async () => {
    await render({ sourceKey: { tonic: 9, mode: "minor" } });
    expect(select().options[select().selectedIndex]?.textContent).toBe("Ля минор (исходная)");
    expect(host.textContent).not.toContain("как в нотах");
  });
});
