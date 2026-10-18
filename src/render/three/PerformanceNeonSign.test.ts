// @vitest-environment happy-dom
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FINGER_COLOR } from "../fingerColors";
import { PerformanceNeonSign, neonSignLetters } from "./PerformanceNeonSign";
import { PerformanceWorldStage } from "./PerformanceWorldStage";
import type { KeyBox } from "./keyBoxes";

/** A 2D context that only records what each letter was drawn with. */
function recordingContext() {
  const drawn: { character: string; shadow: string; style: string }[] = [];
  const context = {
    font: "",
    shadowColor: "",
    shadowBlur: 0,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "miter",
    textBaseline: "alphabetic",
    measureText: (text: string) => ({ width: text.length * 80 }),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    fillText(character: string) {
      drawn.push({ character, shadow: context.shadowColor, style: context.fillStyle });
    },
    strokeText(character: string) {
      drawn.push({ character, shadow: context.shadowColor, style: context.strokeStyle });
    }
  };
  return { context, drawn };
}
const rgb = (color: number) =>
  `rgba(${String(color >> 16)}, ${String((color >> 8) & 0xff)}, ${String(color & 0xff)}, 1)`;
const camera = (z: number) => {
  const view = new PerspectiveCamera();
  view.position.set(0, 1000, z);
  view.updateMatrixWorld();
  return view;
};
const placement = { base: { x: 0, y: 1500, z: 900 }, width: 1200, maxHeight: 480 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("neon sign letters", () => {
  it("colours letters by fingers 1–5 in turn, spaces and punctuation taking none", () => {
    const letters = neonSignLetters("Ab, cd efgh!");
    const colours = letters.filter((letter) => letter.letter).map((letter) => letter.color);
    expect(colours).toEqual([
      FINGER_COLOR[1],
      FINGER_COLOR[2],
      FINGER_COLOR[3],
      FINGER_COLOR[4],
      FINGER_COLOR[5],
      FINGER_COLOR[1],
      FINGER_COLOR[2],
      FINGER_COLOR[3]
    ]);
    expect(letters.filter((letter) => !letter.letter).map((letter) => letter.character)).toEqual([
      ",",
      " ",
      " ",
      "!"
    ]);
  });
  it("treats Cyrillic as letters", () => {
    const letters = neonSignLetters("С днём");
    expect(letters.map((letter) => letter.letter)).toEqual([true, false, true, true, true, true]);
    expect(letters[2]?.color).toBe(FINGER_COLOR[2]);
  });
});

describe("neon sign mesh", () => {
  it("draws each letter's glow in its own colour and never draws a space", () => {
    const { context, drawn } = recordingContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as never);
    const sign = new PerformanceNeonSign("Ab c");
    expect(drawn.map((entry) => entry.character).join("")).toBe("Abc".repeat(4));
    for (const entry of drawn) {
      const finger = { A: 1, b: 2, c: 3 }[entry.character] as 1 | 2 | 3;
      expect(entry.shadow).toBe(rgb(FINGER_COLOR[finger]));
    }
    const material = sign.mesh.material;
    expect(material.toneMapped).toBe(false);
    expect(material.depthWrite).toBe(false);
    sign.dispose();
  });
  it("sits on its placement, shows to the front and hides from behind its plane", () => {
    const sign = new PerformanceNeonSign("Sample sign");
    sign.layout(placement);
    expect(sign.mesh.position.x).toBe(0);
    expect(sign.mesh.position.z).toBe(900);
    expect(sign.mesh.position.y - sign.mesh.scale.y / 2).toBeCloseTo(1500);
    expect(sign.mesh.scale.x).toBeLessThanOrEqual(1200);
    expect(sign.mesh.scale.y).toBeLessThanOrEqual(480);
    sign.update(30, camera(-4000), 1);
    expect(sign.mesh.visible).toBe(true);
    const opacity = sign.mesh.material.opacity;
    expect(opacity).toBeGreaterThan(0.85);
    sign.update(31.7, camera(-4000), 1);
    sign.update(30, camera(-4000), 1);
    expect(sign.mesh.material.opacity).toBe(opacity);
    sign.update(30, camera(2500), 1);
    expect(sign.mesh.visible).toBe(false);
    sign.update(30, camera(-4000), 0);
    expect(sign.mesh.visible).toBe(false);
    sign.dispose();
  });
  it("disposes its texture, material and geometry", () => {
    const sign = new PerformanceNeonSign("Sample sign");
    const map = sign.mesh.material.map;
    const disposed = vi.fn();
    map?.addEventListener("dispose", disposed);
    sign.mesh.material.addEventListener("dispose", disposed);
    sign.mesh.geometry.addEventListener("dispose", disposed);
    sign.dispose();
    expect(disposed).toHaveBeenCalledTimes(3);
  });
});

describe("neon sign on the world stage", () => {
  const box: KeyBox = {
    pitch: 60,
    black: false,
    x: 10,
    width: 22,
    bottom: 0,
    top: 22,
    front: 0,
    back: 142,
    uv: { u0: 0, u1: 1, v0: 0, v1: 1 }
  };
  const signs = (stage: PerformanceWorldStage) =>
    stage.group.children.filter((child) => child.name === "performance-neon-sign");
  it("creates no object without a sign, one with it, and removes it again", () => {
    const geometry = new BoxGeometry(1300, 1800, 900),
      material = new MeshBasicMaterial();
    const scene = new Group(),
      subject = new Group();
    subject.add(new Mesh(geometry, material));
    subject.updateMatrixWorld(true);
    const stage = new PerformanceWorldStage(scene);
    stage.update(true, 30, subject, [box], [], camera(-4000), 142);
    expect(signs(stage)).toHaveLength(0);
    stage.setSign("Sample sign");
    stage.setSign("Sample sign");
    expect(signs(stage)).toHaveLength(1);
    stage.update(true, 30, subject, [box], [], camera(-4000), 142);
    const [sign] = signs(stage);
    // Above the 900 mm top of the subject, behind its 450 mm back, facing the front.
    expect(sign?.position.y).toBeGreaterThan(900);
    expect(sign?.position.z).toBeCloseTo(650);
    expect(sign?.visible).toBe(true);
    stage.update(true, 0, subject, [box], [], camera(-4000), 142);
    expect(sign?.visible).toBe(false);
    stage.setSign(undefined);
    expect(signs(stage)).toHaveLength(0);
    stage.dispose();
    geometry.dispose();
    material.dispose();
  });
});
