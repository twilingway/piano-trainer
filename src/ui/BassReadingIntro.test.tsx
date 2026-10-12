// @vitest-environment happy-dom
import { act, type ComponentProps, type ReactNode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setInterfaceLanguage } from "../app/interfaceLanguage";
import type { Staff } from "../staff/Staff";
import { BassReadingIntro } from "./BassReadingIntro";

const staff = vi.hoisted(() => ({
  renders: [] as ComponentProps<typeof Staff>[],
  loads: [] as string[]
}));
vi.mock("../staff/Staff", () => ({
  Staff: (props: ComponentProps<typeof Staff>) => {
    staff.renders.push(props);
    useEffect(() => {
      staff.loads.push(props.musicXml);
    }, [props.musicXml]);
    return <div data-testid="bass-intro-staff" />;
  }
}));
vi.mock("./GameDialog", () => ({
  GameDialog: ({
    title,
    children,
    onClose
  }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
  }) => (
    <section aria-label={title}>
      <button type="button" data-testid="close" onClick={onClose} />
      {children}
    </section>
  )
}));
let host: HTMLDivElement;
let root: Root;
const noop = () => undefined;
async function render(props: Partial<ComponentProps<typeof BassReadingIntro>> = {}) {
  await act(async () => {
    await Promise.resolve();
    root.render(
      <BassReadingIntro
        onClose={noop}
        onStart={noop}
        keyBindings={[
          { pitch: 48, label: "Z" },
          { pitch: 60, label: "A" }
        ]}
        {...props}
      />
    );
  });
}
async function click(target: HTMLElement | null) {
  if (!target) throw new Error("Missing target");
  await act(async () => {
    await Promise.resolve();
    target.click();
  });
}
function currentStaff() {
  const props = staff.renders.at(-1);
  if (!props) throw new Error("Missing staff");
  return props;
}
beforeEach(() => {
  setInterfaceLanguage("ru");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  staff.renders.length = 0;
  staff.loads.length = 0;
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => {
    await Promise.resolve();
    root.unmount();
  });
  host.remove();
  setInterfaceLanguage("ru");
  localStorage.removeItem("interface-language-v1");
  vi.unstubAllGlobals();
});
describe("bass reading introduction", () => {
  it("shows C3–G3 on a bass staff, left fingers 5–1 and accurate binding limitations", async () => {
    await render();
    const xml = new DOMParser().parseFromString(currentStaff().musicXml, "application/xml");
    expect(xml.querySelector("clef sign")?.textContent).toBe("F");
    expect([...xml.querySelectorAll("pitch octave")].map((node) => node.textContent)).toEqual([
      "3",
      "3",
      "3",
      "3",
      "3"
    ]);
    expect(host.textContent).toContain("3 означает октаву, а не палец");
    expect(host.textContent).toContain("не определяет, какой рукой и пальцем");
    expect(host.textContent).toContain("Левая рука: Мизинец — палец 5.");
    expect(host.querySelectorAll(".reading-intro-keyboard button")).toHaveLength(5);
    expect([...host.querySelectorAll("ul li")].map((item) => item.textContent)).toEqual([
      "C3: Z",
      ...["D3", "E3", "F3", "G3"].map((note) => `${note}: Нет назначения для этой басовой ноты`)
    ]);
    expect(host.textContent).toContain("без сдвига октавы и модификаторов");
    expect(host.textContent).toContain("«Настройки» → «Ввод с ПК»");
    expect(host.textContent).toContain("Shift повышает ноту на полутон");
    expect(currentStaff().fingers).toBe(false);
    expect(currentStaff().shareGeometry).toBe(false);
  });
  it("links note, key and finger selection without reloading the fixed score or starting a run", async () => {
    const onStart = vi.fn();
    const onClose = vi.fn();
    await render({ onStart, onClose });
    const xml = currentStaff().musicXml;
    const fingers = [
      ...host.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Выбор пальца левой руки для знакомства"] button'
      )
    ];
    for (const [index, finger] of fingers.entries()) {
      await click(finger);
      expect(currentStaff().beat).toBe(index);
      expect(currentStaff().musicXml).toBe(xml);
    }
    expect(host.querySelector(".reading-intro-detail")?.textContent).toContain(
      "Большой палец — палец 1."
    );
    expect(staff.loads).toHaveLength(1);
    expect(onStart).not.toHaveBeenCalled();
    await click(host.querySelector('.reading-intro-keyboard button[aria-label="Клавиша ми, E3"]'));
    expect(currentStaff().beat).toBe(2);
    await click(host.querySelector(".reading-intro-start"));
    expect(onStart).toHaveBeenCalledOnce();
    await click(host.querySelector('[data-testid="close"]'));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("localizes notation and ignores errors from obsolete presentations, with retry for current errors", async () => {
    await render();
    const previous = currentStaff().presentation;
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("Left hand: little finger — finger 5.");
    expect(host.textContent).toContain("No binding for this bass note");
    const xml = new DOMParser().parseFromString(currentStaff().musicXml, "application/xml");
    expect([...xml.querySelectorAll("lyric text")].map((node) => node.textContent)).toEqual([
      "C",
      "D",
      "E",
      "F",
      "G"
    ]);
    if (!previous) throw new Error("Missing previous presentation");
    await act(async () => {
      await Promise.resolve();
      previous.onError(previous.id);
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    const current = currentStaff().presentation;
    if (!current) throw new Error("Missing current presentation");
    await act(async () => {
      await Promise.resolve();
      current.onError(current.id);
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not display");
    await click(host.querySelector('[role="alert"] button'));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(currentStaff().presentation?.id).not.toBe(current.id);
  });
});
