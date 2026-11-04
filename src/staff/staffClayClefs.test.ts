// @vitest-environment happy-dom
import { OpenSheetMusicDisplay, VexFlowMeasure } from "opensheetmusicdisplay";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import manifest from "./art/manifest.json";
import { applyStaffClayClefs, clayClefPlacement } from "./staffClayClefs";

const attributes = (clefs: string) =>
  `<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>${clefs}</attributes>`;
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected fixture value");
  return value;
}
const note = (staff: number) =>
  `<note><pitch><step>C</step><octave>${String(staff === 1 ? 4 : 3)}</octave></pitch><duration>4</duration><voice>${String(staff)}</voice><type>whole</type><staff>${String(staff)}</staff></note>`;
const score = (clefs: string) =>
  `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list><part id="P1"><measure number="1">${attributes(clefs)}${note(1)}<backup><duration>4</duration></backup>${note(2)}</measure></part></score-partwise>`;
let host: HTMLDivElement;
let osmd: OpenSheetMusicDisplay;
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ measureText: (s: string) => ({ width: s.length * 7 }) }) as unknown as GPUCanvasContext
  );
  host = document.body.appendChild(document.createElement("div"));
  Object.defineProperty(host, "offsetWidth", { value: 1000 });
  osmd = new OpenSheetMusicDisplay(host, { backend: "svg", autoResize: false });
});
afterEach(() => {
  osmd.clear();
  host.remove();
  vi.restoreAllMocks();
});
const standard =
  '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>';

function mockInk(): void {
  for (const group of host.querySelectorAll<SVGGraphicsElement>(".vf-clef")) {
    const first = /^M([\d.]+) ([\d.]+)M/.exec(group.querySelector("path")?.getAttribute("d") ?? "");
    if (!first) throw new Error("Expected installed VexFlow glyph anchor");
    const x = Number(first[1]),
      y = Number(first[2]);
    Object.defineProperty(group, "getBBox", {
      configurable: true,
      value: () => new DOMRect(x, y - 44, 30, 68)
    });
  }
}

describe("musical clay clef anchors", () => {
  it("fits uniformly within the existing ink while holding the musical line", () => {
    for (const asset of manifest.assets) {
      const box = { x: 20, y: 10, width: 40, height: 80 };
      const position = clayClefPlacement(box, 47, asset);
      expect(position).toBeDefined();
      if (!position) throw new Error("Expected placement");
      expect(position.x).toBeGreaterThanOrEqual(box.x);
      expect(position.y).toBeGreaterThanOrEqual(box.y);
      expect(position.x + position.width).toBeLessThanOrEqual(box.x + box.width + 1e-8);
      expect(position.y + position.height).toBeLessThanOrEqual(box.y + box.height + 1e-8);
      expect(position.y + position.height * required(asset.anchorNormalized[1])).toBeCloseTo(47, 9);
      expect(position.width / position.height).toBeCloseTo(asset.width / asset.height, 9);
    }
    expect(
      clayClefPlacement({ x: 0, y: 0, width: 0, height: 10 }, 5, required(manifest.assets[0]))
    ).toBeUndefined();
    expect(
      clayClefPlacement({ x: 0, y: 0, width: 10, height: 10 }, 20, required(manifest.assets[0]))
    ).toBeUndefined();
  });

  it("maps the installed G2/F4 glyph anchors to their correct staff lines and preserves contours", async () => {
    await osmd.load(score(standard));
    osmd.render();
    mockInk();
    const paths = [...host.querySelectorAll(".vf-clef path")].map((p) => p.getAttribute("d"));
    applyStaffClayClefs(host, true, osmd);
    const images = [...host.querySelectorAll<SVGImageElement>("[data-clay-clef-image]")];
    expect(images.map((i) => i.dataset.clayClefImage)).toEqual(["treble", "bass"]);
    const measures = osmd.GraphicSheet.MeasureList[0] ?? [];
    for (const [index, image] of images.entries()) {
      const measure = measures[index];
      if (!(measure instanceof VexFlowMeasure)) throw new Error("Expected VexFlow measure");
      const kind = image.dataset.clayClefImage;
      const asset = manifest.assets.find((a) => a.file === `${String(kind)}-clay.webp`);
      if (!asset) throw new Error("Expected clef asset");
      const y = Number(image.getAttribute("y"));
      const height = Number(image.getAttribute("height"));
      expect(y + height * required(asset.anchorNormalized[1])).toBeCloseTo(
        measure.getVFStave().getYForLine(kind === "treble" ? 3 : 1),
        9
      );
      expect(image.getAttribute("pointer-events")).toBe("none");
    }
    expect([...host.querySelectorAll(".vf-clef path")].map((p) => p.getAttribute("d"))).toEqual(
      paths
    );
    applyStaffClayClefs(host, true, osmd);
    expect(host.querySelectorAll("[data-clay-clef-image]")).toHaveLength(2);
    osmd.render();
    mockInk();
    applyStaffClayClefs(host, true, osmd);
    expect(host.querySelectorAll("[data-clay-clef-image]")).toHaveLength(2);
    applyStaffClayClefs(host, false, osmd);
    expect(host.querySelectorAll("[data-clay-clef-image], [data-clay-clef-original]")).toHaveLength(
      0
    );
    expect(
      [...host.querySelectorAll<SVGElement>(".vf-clef path")].every(
        (p) => p.style.visibility !== "hidden"
      )
    ).toBe(true);
  });

  it("keeps unsupported and octave-annotated clefs in their original form", async () => {
    await osmd.load(
      score(
        '<clef number="1"><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef><clef number="2"><sign>C</sign><line>3</line></clef>'
      )
    );
    osmd.render();
    mockInk();
    applyStaffClayClefs(host, true, osmd);
    expect(host.querySelector("[data-clay-clef-image]")).toBeNull();
    expect(host.querySelector("[data-clay-clef-original]")).toBeNull();
  });

  it("restores the original readable clef if its bitmap cannot load", async () => {
    await osmd.load(score(standard));
    osmd.render();
    mockInk();
    applyStaffClayClefs(host, true, osmd);
    const image = host.querySelector("[data-clay-clef-image]");
    expect(image).not.toBeNull();
    const group = image?.parentElement;
    image?.dispatchEvent(new Event("error"));
    expect(group?.querySelector("[data-clay-clef-image]")).toBeNull();
    expect(
      [...required(group).querySelectorAll<SVGElement>("path")].every(
        (p) => p.style.visibility !== "hidden"
      )
    ).toBe(true);
  });
  it("ignores an old image error after relayout has installed its replacement", async () => {
    await osmd.load(score(standard));
    osmd.render();
    mockInk();
    applyStaffClayClefs(host, true, osmd);
    const old = required(host.querySelector("[data-clay-clef-image]"));
    applyStaffClayClefs(host, true, osmd);
    old.dispatchEvent(new Event("error"));
    expect(host.querySelectorAll("[data-clay-clef-image]")).toHaveLength(2);
    expect(
      [...host.querySelectorAll<SVGElement>("[data-clay-clef-original]")].every(
        (p) => p.style.visibility === "hidden"
      )
    ).toBe(true);
  });
});
