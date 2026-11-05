// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { fitSongCourseMiniature } from "./fitSongCourseMiniature";

afterEach(() => {
  document.body.replaceChildren();
});

function fixture() {
  const wrapper = document.body.appendChild(document.createElement("div"));
  wrapper.innerHTML =
    '<div class="staff"><div class="staff-page" style="padding-inline:52px"><svg viewBox="0 0 800 200"><g class="vf-clef"><path d="M10 0L30 100"/></g><g class="vf-timesignature"><path d="M40 20L50 50"/></g><g class="vf-keysignature"/><path class="staff-line" d="M0 50L180 50"/><g class="vf-stavenote"><g class="vf-notehead"><path d="M90 50L110 60"/></g><g class="vf-stem"><path d="M110 20L110 50"/></g></g></svg></div></div>';
  Object.defineProperties(wrapper, {
    clientWidth: { value: 104, configurable: true },
    clientHeight: { value: 104, configurable: true }
  });
  const svg = wrapper.querySelector("svg");
  const note = wrapper.querySelector<SVGGraphicsElement>(".vf-stavenote");
  if (!svg || !note) throw new Error("missing fixture");
  svg.getBBox = () => new DOMRect(0, 0, 180, 100);
  return { wrapper, svg, note };
}

describe("source-score miniature framing", () => {
  it("fits the complete real prefix and note together without changing their musical paths", () => {
    const { wrapper, svg, note } = fixture();
    const musicalInk = note.innerHTML;
    const clefInk = svg.querySelector(".vf-clef")?.innerHTML;
    const timeInk = svg.querySelector(".vf-timesignature")?.innerHTML;
    fitSongCourseMiniature(wrapper);
    expect(svg.getAttribute("viewBox")).toBe("-8 -8 196 116");
    expect(svg.getAttribute("width")).toBe("104");
    expect(svg.getAttribute("height")).toBe("104");
    expect(wrapper.querySelector<HTMLElement>(".staff-page")?.style.paddingInline).toBe("0px");
    expect(svg.querySelector<SVGElement>(".vf-clef")?.style.display).not.toBe("none");
    expect(svg.querySelector<SVGElement>(".vf-timesignature")?.style.display).not.toBe("none");
    expect(svg.querySelector(".vf-clef")?.innerHTML).toBe(clefInk);
    expect(svg.querySelector(".vf-timesignature")?.innerHTML).toBe(timeInk);
    expect(note.innerHTML).toBe(musicalInk);
    expect(wrapper.querySelector(".staff-line")?.getAttribute("d")).toBe("M0 50L180 50");
    const before = svg.outerHTML;
    fitSongCourseMiniature(wrapper);
    expect(svg.outerHTML).toBe(before);
  });
  it("does not invent a note for a pending or failed miniature", () => {
    const wrapper = document.body.appendChild(document.createElement("div"));
    wrapper.innerHTML = '<div class="staff"><div class="staff-page"/></div>';
    const before = wrapper.innerHTML;
    fitSongCourseMiniature(wrapper);
    expect(wrapper.innerHTML).toBe(before);
  });
  it("accounts for frame padding and refits without changing the measure", () => {
    const { wrapper, svg, note } = fixture();
    const before = note.innerHTML;
    fitSongCourseMiniature(wrapper);
    Object.defineProperties(wrapper, { clientWidth: { value: 82 }, clientHeight: { value: 90 } });
    wrapper.style.padding = "3px";
    fitSongCourseMiniature(wrapper);
    expect(svg.getAttribute("width")).toBe("76");
    expect(svg.getAttribute("height")).toBe("84");
    expect(svg.getAttribute("viewBox")).toBe("-8 -8 196 116");
    expect(note.innerHTML).toBe(before);
  });
});
