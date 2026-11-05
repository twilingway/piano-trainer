// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { findSongCourseSource } from "./catalog";
import type { SongCourseSource } from "./model";
import { coursePath, nextCoursePathNode } from "./path";

const fixture = findSongCourseSource("hot-cross-buns");
if (!fixture) throw new Error("missing fixture");
const source = fixture;
const id = (suffix: string) => `${source.id}/${suffix}`;
function modifiedXml(change: (xml: Document) => void): SongCourseSource {
  const xml = new DOMParser().parseFromString(source.musicXml, "application/xml");
  change(xml);
  return { ...source, musicXml: new XMLSerializer().serializeToString(xml) };
}
function note(xml: Document): Element {
  const result = xml.querySelector('note[id="hot-cross-buns-m3-n1"]');
  if (!result) throw new Error("missing note");
  return result;
}

describe("compact musical course path", () => {
  it("collapses only equivalent phrase kinds and never changes the full source", () => {
    const before = source.musicXml;
    const path = coursePath(source);
    expect(path.representativeById.get(id("guided-2"))).toBe(id("guided-1"));
    expect(path.representativeById.get(id("guided-4"))).toBe(id("guided-1"));
    expect(path.representativeById.get(id("independent-2"))).toBe(id("independent-1"));
    expect(path.representativeById.get(id("independent-1"))).toBe(id("independent-1"));
    expect(path.representativeById.get(id("guided-3"))).toBe(id("guided-3"));
    expect(path.repeats.map((node) => node.id)).toEqual([
      id("guided-2"),
      id("guided-4"),
      id("independent-2"),
      id("independent-4")
    ]);
    for (const node of source.nodes.filter(
      (node) => !["guided-phrase", "independent-phrase"].includes(node.kind)
    ))
      expect(path.nodes).toContain(node);
    expect(source.musicXml).toBe(before);
    expect(source.nodes).toHaveLength(path.nodes.length + path.repeats.length);
    expect(coursePath(source)).toBe(path);
  });
  it("does not collapse another pitch", () => {
    const changed = modifiedXml((xml) => {
      const step = note(xml).querySelector("step");
      if (step) step.textContent = "F";
    });
    expect(coursePath(changed).representativeById.get(id("guided-2"))).toBe(id("guided-2"));
  });
  it("does not collapse another written finger", () => {
    const changed = modifiedXml((xml) => {
      const finger = note(xml).querySelector("fingering");
      if (finger) finger.textContent = "4";
    });
    expect(coursePath(changed).representativeById.get(id("guided-2"))).toBe(id("guided-2"));
  });
  it("does not collapse another rhythm with a rest", () => {
    const changed = modifiedXml((xml) => {
      const target = note(xml);
      const duration = target.querySelector("duration"),
        type = target.querySelector("type");
      if (duration) duration.textContent = "4";
      if (type) type.textContent = "quarter";
      const rest = xml.createElement("note");
      rest.innerHTML =
        "<rest/><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff>";
      target.after(rest);
    });
    expect(coursePath(changed).representativeById.get(id("guided-2"))).toBe(id("guided-2"));
  });
  it("does not collapse a different hand or staff", () => {
    const changed = modifiedXml((xml) => {
      const staff = note(xml).querySelector("staff");
      if (staff) staff.textContent = "2";
    });
    const withHand = {
      ...changed,
      partHands: [...changed.partHands, { partId: "learner", staff: "2", hand: "left" as const }]
    };
    expect(coursePath(withHand).representativeById.get(id("guided-2"))).toBe(id("guided-2"));
  });
  it("keeps a different full phrase span even with the same selected notes", () => {
    const first = source.phrases[0];
    if (!first) throw new Error("missing phrase");
    const changed = {
      ...source,
      nodes: source.nodes.map((node) =>
        node.id === id("guided-2") ? { ...node, phraseIds: [first.id, ...node.phraseIds] } : node
      )
    };
    expect(coursePath(changed).representativeById.get(id("guided-2"))).toBe(id("guided-2"));
  });
  it("advances an explicitly chosen repeat by its original position rather than backwards", () => {
    expect(nextCoursePathNode(source, id("guided-1"))?.id).toBe(id("guided-3"));
    expect(nextCoursePathNode(source, id("guided-2"))?.id).toBe(id("guided-3"));
    expect(nextCoursePathNode(source, id("guided-4"))?.id).toBe(id("independent-1"));
    expect(nextCoursePathNode(source, id("performance"))).toBeUndefined();
    expect(nextCoursePathNode(source, "missing")).toBeUndefined();
  });
});

it("does not collapse an otherwise identical phrase in another learner part", () => {
  const xml = new DOMParser().parseFromString(source.musicXml, "application/xml");
  const original = xml.querySelector('part[id="learner"]');
  const scorePart = xml.querySelector('score-part[id="learner"]');
  if (!original || !scorePart) throw new Error("missing learner part");
  const extra = original.cloneNode(true) as Element;
  extra.setAttribute("id", "second-learner");
  const extraName = scorePart.cloneNode(true) as Element;
  extraName.setAttribute("id", "second-learner");
  scorePart.after(extraName);
  original.after(extra);
  for (const [part, keepThird] of [
    [original, false],
    [extra, true]
  ] as const) {
    for (const entry of [...part.querySelectorAll("note")].filter((item) =>
      item.querySelector("pitch")
    )) {
      const inThird = entry.getAttribute("id")?.startsWith("hot-cross-buns-m3-") === true;
      if (inThird === keepThird) continue;
      const rest = xml.createElement("rest");
      entry.querySelector("pitch")?.replaceWith(rest);
      entry.removeAttribute("id");
      entry.querySelector("notations")?.remove();
      entry.querySelector("stem")?.remove();
    }
  }
  const changed: SongCourseSource = {
    ...source,
    musicXml: new XMLSerializer().serializeToString(xml),
    learnerPartIds: ["learner", "second-learner"],
    partHands: [...source.partHands, { partId: "second-learner", staff: "1", hand: "right" }]
  };
  expect(coursePath(changed).representativeById.get(id("guided-2"))).toBe(id("guided-2"));
});
