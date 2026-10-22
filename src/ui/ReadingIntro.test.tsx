// @vitest-environment happy-dom
import { act, type ComponentProps, type ReactNode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setInterfaceLanguage } from "../app/interfaceLanguage";
import { READING_INTRO_NOTES } from "../reading/introduction";
import { HAND_SPRITES } from "../render/handSpriteCatalog";
import type { Staff } from "../staff/Staff";
import { ReadingIntro } from "./ReadingIntro";

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
    return <div data-testid="intro-staff" data-beat={props.beat} />;
  }
}));
vi.mock("./GameDialog", () => ({
  GameDialog: ({
    title,
    className,
    children,
    onClose
  }: {
    title: string;
    className: string;
    children: ReactNode;
    onClose: () => void;
  }) => (
    <section aria-label={title} className={className}>
      <button type="button" data-testid="close-intro" onClick={onClose} />
      {children}
    </section>
  )
}));

let host: HTMLDivElement;
let root: Root;
const noop = () => undefined;

async function render() {
  await act(async () => {
    await Promise.resolve();
    root.render(<ReadingIntro onClose={noop} onStart={noop} />);
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
  if (!props) throw new Error("Missing staff props");
  return props;
}
function selectedButtons() {
  return [...host.querySelectorAll<HTMLButtonElement>('button[aria-pressed="true"]')];
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

describe("visual reading introduction", () => {
  it("shows how to locate middle C and separates octaves from finger numbers", async () => {
    await render();
    expect(host.textContent).toContain("До — белая клавиша слева от двух чёрных.");
    expect(host.textContent).toContain("4 — октаву, не номер пальца.");
    expect(host.textContent).toContain("Названий нот семь");
    expect(host.textContent).toContain("Нет пианино?");
    expect(
      [...host.querySelectorAll(".reading-intro-overview strong")].map((key) => key.textContent)
    ).toEqual(["C2", "C3", "C4", "C5", "C6"]);
    expect(host.querySelector(".reading-intro-overview .is-selected")?.textContent).toBe("C4");
    expect(
      host.querySelectorAll(".reading-intro-keyboard .reading-intro-white-row > *")
    ).toHaveLength(7);
    const blackKeys = [
      ...host.querySelectorAll<HTMLElement>(".reading-intro-keyboard .reading-intro-black-key")
    ];
    expect(blackKeys.map((key) => Number.parseFloat(key.style.left))).toEqual(
      [1, 2, 4, 5, 6].map((index) => (index / 7) * 100)
    );
    expect(currentStaff().beat).toBe(0);
    expect(currentStaff().shareGeometry).toBe(false);
    expect(currentStaff().liveBeat).toBeUndefined();
    expect(host.textContent).toContain("Правая рука: Большой палец — палец 1.");
  });

  it("links every note name and white key to its staff position and named finger without reloading XML", async () => {
    await render();
    const xml = currentStaff().musicXml;
    const id = currentStaff().presentation?.id;
    for (const note of READING_INTRO_NOTES) {
      const nameButton = [
        ...host.querySelectorAll<HTMLButtonElement>(".reading-intro-note-buttons button")
      ].find((button) => button.textContent === `${note.name}${note.notation}`);
      await click(nameButton ?? null);
      expect(currentStaff().beat).toBe(note.beat);
      expect(currentStaff().presentation?.id).toBe(id);
      expect(currentStaff().musicXml).toBe(xml);
      expect(selectedButtons()).toHaveLength(3);
      expect(host.querySelector(".reading-intro-detail")?.textContent).toContain(
        `Выбрана нота: ${note.name} (${note.notation})`
      );
      expect(host.querySelector(".reading-intro-detail")?.textContent).toContain(note.position);
      expect(host.querySelector(".reading-intro-detail")?.textContent).toContain(note.fingerName);
    }
    for (const note of READING_INTRO_NOTES) {
      const key = host.querySelector<HTMLButtonElement>(
        `.reading-intro-keyboard button[aria-label="Клавиша ${note.name}, ${note.notation}"]`
      );
      expect(key?.getAttribute("type")).toBe("button");
      expect(key?.disabled).toBe(false);
      expect(key?.getAttribute("tabindex")).toBeNull();
      key?.focus();
      expect(document.activeElement).toBe(key);
      await click(key);
      expect(currentStaff().beat).toBe(note.beat);
      expect(selectedButtons().every((button) => button.textContent.includes(note.notation))).toBe(
        true
      );
    }
    expect(staff.loads).toEqual([xml]);
  });

  it("reuses the calibrated right hand and links all five finger labels to the selected note", async () => {
    await render();
    const source = HAND_SPRITES.find((sprite) => sprite.id === "five");
    if (!source) throw new Error("Missing five-finger hand asset");
    const image = host.querySelector(".reading-intro-hand image");
    expect(image?.getAttribute("href")).toBe(source.url);
    const labels = [
      ...host.querySelectorAll<HTMLButtonElement>(".reading-intro-finger-buttons button")
    ];
    expect(labels).toHaveLength(5);
    const xml = currentStaff().musicXml;
    for (const [index, note] of READING_INTRO_NOTES.entries()) {
      const label = labels[index];
      if (!label) throw new Error("Missing finger label");
      expect(label.textContent).toBe(`${String(note.finger)}${note.fingerName}${note.notation}`);
      expect(label.type).toBe("button");
      await click(label);
      expect(currentStaff().beat).toBe(note.beat);
      expect(selectedButtons()).toHaveLength(3);
      expect(selectedButtons().every((button) => button.textContent.includes(note.notation))).toBe(
        true
      );
      const highlighted = host.querySelector(".reading-intro-hand-tip.is-selected");
      expect(highlighted?.getAttribute("data-finger")).toBe(String(note.finger));
      expect(highlighted?.getAttribute("cx")).toBe(String(source.tips[note.finger].x));
      expect(highlighted?.getAttribute("cy")).toBe(String(source.tips[note.finger].y));
      expect(host.querySelector(".reading-intro-hand")?.getAttribute("aria-label")).toContain(
        note.fingerName
      );
      expect(currentStaff().musicXml).toBe(xml);
    }
    expect(staff.loads).toEqual([xml]);
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(labels.map((label) => label.textContent)).toEqual([
      "1thumbC4",
      "2index fingerD4",
      "3middle fingerE4",
      "4ring fingerF4",
      "5little fingerG4"
    ]);
    expect(host.querySelector(".reading-intro-hand")?.getAttribute("aria-label")).toBe(
      "Right-hand diagram: little finger, finger 5, is highlighted"
    );
  });

  it("offers a staff retry and ignores callbacks from an old load", async () => {
    await render();
    const original = currentStaff().presentation;
    if (!original) throw new Error("Missing presentation callback");
    await act(async () => {
      await Promise.resolve();
      original.onError(original.id);
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Не удалось показать ноты."
    );
    await click(host.querySelector(".reading-intro-staff-error button"));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    const retried = currentStaff().presentation;
    expect(retried?.id).not.toBe(original.id);
    expect(staff.loads).toHaveLength(2);
    await act(async () => {
      await Promise.resolve();
      original.onError(original.id);
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    if (!retried) throw new Error("Missing retried presentation callback");
    await act(async () => {
      await Promise.resolve();
      retried.onError(retried.id);
    });
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelectorAll(".reading-intro-keyboard button:disabled")).toHaveLength(0);
    expect(host.querySelector<HTMLButtonElement>(".reading-intro-start")?.disabled).toBe(false);
  });

  it("localizes the illustration, selected finger and staff labels to English", async () => {
    await render();
    const oldLoad = currentStaff().presentation;
    await act(async () => {
      await Promise.resolve();
      setInterfaceLanguage("en");
    });
    expect(host.textContent).toContain("C is the white key to the left of two black keys.");
    expect(host.textContent).toContain("4 is the octave, not a finger number.");
    expect(host.textContent).toContain("Right hand: thumb — finger 1.");
    expect(host.textContent).toContain("There are seven note names");
    expect(host.querySelector(".reading-intro-start")?.textContent).toBe("Start reading notes");
    const xml = new DOMParser().parseFromString(currentStaff().musicXml, "application/xml");
    expect([...xml.querySelectorAll("lyric text")].map((element) => element.textContent)).toEqual([
      "C",
      "D",
      "E",
      "F",
      "G"
    ]);
    await click(host.querySelector('.reading-intro-keyboard button[aria-label="Piano key D, D4"]'));
    expect(host.querySelector(".reading-intro-detail")?.textContent).toContain(
      "D sits just below the bottom line"
    );
    expect(host.querySelector(".reading-intro-detail")?.textContent).toContain(
      "index finger — finger 2"
    );
    if (!oldLoad) throw new Error("Missing old language callback");
    await act(async () => {
      await Promise.resolve();
      oldLoad.onError(oldLoad.id);
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("starts only through the explicit CTA and closes independently", async () => {
    const onStart = vi.fn();
    const onClose = vi.fn();
    await act(async () => {
      await Promise.resolve();
      root.render(<ReadingIntro onStart={onStart} onClose={onClose} />);
    });
    await click(host.querySelector(".reading-intro-keyboard button"));
    expect(onStart).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await click(host.querySelector('[data-testid="close-intro"]'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
    await click(host.querySelector(".reading-intro-start"));
    expect(onStart).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
