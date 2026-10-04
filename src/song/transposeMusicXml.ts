import { transposeFifths, transposeWrittenPitch } from "./keySignature";
import type { PitchStep } from "./keySignature";

interface KeyContext {
  common: number;
  readonly staves: Map<number, number>;
}

function traditionalFifths(element: Element | null, fallback: number): number {
  const text = element?.textContent.trim();
  const value = text && /^[+-]?\d+$/.test(text) ? Number(text) : Number.NaN;
  return Number.isInteger(value) && Math.abs(value) <= 7 ? value : fallback;
}

/** A score without an initial signature uses the inferred source key supplied by the caller. */
function ensureInitialKey(part: Element, fifths: number): void {
  const measure = part.querySelector(":scope > measure");
  if (!measure || measure.querySelector(":scope > attributes > key")) return;
  const document = part.ownerDocument;
  const create = (tag: string) => document.createElementNS(part.namespaceURI, tag);
  let attributes = measure.querySelector(":scope > attributes");
  if (!attributes) {
    attributes = create("attributes");
    measure.prepend(attributes);
  }
  const key = create("key");
  const node = create("fifths");
  node.textContent = String(fifths);
  key.append(node);
  const divisions = attributes.querySelector(":scope > divisions");
  if (divisions) divisions.after(key);
  else attributes.prepend(key);
}

/** Move written pitches by the same chromatic and diatonic interval in each staff's active key. */
export function transposeMusicXml(xml: string, semitones: number, fallbackFifths = 0): string {
  if (semitones === 0) return xml;
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const walk = (element: Element, context: KeyContext): void => {
    if (element.tagName === "key") {
      if (element.querySelector(":scope > key-step, :scope > key-alter")) return;
      let node = element.querySelector(":scope > fifths");
      if (!node) {
        node = document.createElementNS(element.namespaceURI, "fifths");
        node.textContent = String(fallbackFifths);
        const cancel = element.querySelector(":scope > cancel");
        if (cancel) cancel.after(node);
        else element.prepend(node);
      }
      const original = traditionalFifths(node, fallbackFifths);
      node.textContent = String(transposeFifths(original, semitones));
      const number = element.getAttribute("number");
      if (number === null) {
        context.common = original;
        context.staves.clear();
      } else context.staves.set(Number(number), original);
      const cancel = element.querySelector(":scope > cancel");
      if (cancel)
        cancel.textContent = String(
          transposeFifths(traditionalFifths(cancel, original), semitones)
        );
      return;
    }
    if (element.tagName === "pitch") {
      const step = element.querySelector(":scope > step");
      const alter = element.querySelector(":scope > alter");
      const octave = element.querySelector(":scope > octave");
      const staff = Number(
        element.parentElement?.querySelector(":scope > staff")?.textContent ?? 1
      );
      const moved = transposeWrittenPitch(
        {
          step: (step?.textContent.trim() ?? "C") as PitchStep,
          alter: Math.round(Number(alter?.textContent ?? 0)),
          octave: Number(octave?.textContent ?? 4)
        },
        context.staves.get(staff) ?? context.common,
        semitones
      );
      if (step) step.textContent = moved.step;
      if (octave) octave.textContent = String(moved.octave);
      if (moved.alter === 0) alter?.remove();
      else if (alter) alter.textContent = String(moved.alter);
      else {
        const created = document.createElementNS(element.namespaceURI, "alter");
        created.textContent = String(moved.alter);
        step?.after(created);
      }
      return;
    }
    // Fingers belong to the original keys; explicit accidentals belong to the original spelling.
    if (element.tagName === "fingering" || element.tagName === "accidental") {
      element.remove();
      return;
    }
    for (const child of Array.from(element.children)) walk(child, context);
  };
  for (const part of Array.from(document.querySelectorAll("part"))) {
    ensureInitialKey(part, fallbackFifths);
    walk(part, { common: fallbackFifths, staves: new Map() });
  }
  return new XMLSerializer().serializeToString(document);
}
