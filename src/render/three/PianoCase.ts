import { Group, Mesh, MeshStandardMaterial } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { KIT_DEPTH, KIT_TOP } from "./pianoKit";

/** A closed digital-piano shell and an open-centre stand, in the keys' local world units. */
export class PianoCase {
  readonly group = new Group();
  private disposed = false;
  private readonly hardware = new MeshStandardMaterial({
    color: 0x252830,
    roughness: 0.42,
    metalness: 0.18
  });

  constructor(private readonly shell: MeshStandardMaterial) {}

  layout(left: number, right: number, metres: number): void {
    this.clear();
    if (
      this.disposed ||
      ![left, right, metres].every(Number.isFinite) ||
      right <= left ||
      metres <= 0
    )
      return;
    const cheek = 0.034 * metres;
    const centre = (left + right) / 2;
    const width = right - left + 2 * cheek;
    const bottom = -54;
    // Vertical key/avatar units are millimetres; only the keyboard width follows metres.
    const floor = KIT_TOP - 740;
    const footHeight = 12;
    const legThickness = 0.024 * metres;
    // Even a short controller leaves room for the seated player's knees and central pedal.
    const span = Math.max(width - cheek, 0.72 * metres);
    const supportLeft = centre - span / 2;
    const supportRight = centre + span / 2;
    this.add("case-bottom", width, 29, 142, centre, bottom + 14.5, -71);
    // Below the white lane (22): the cap cannot cover notes entering at the key backs.
    this.add("case-rear", width, 74, 3.5, centre, -17, -144.25);
    this.add("case-left-edge", cheek, 110, 142, left - cheek / 2, 1, -71);
    this.add("case-right-edge", cheek, 110, 142, right + cheek / 2, 1, -71);
    this.add(
      "stand-top-beam",
      span + legThickness,
      footHeight,
      0.065 * KIT_DEPTH,
      centre,
      bottom - footHeight / 2,
      -90,
      this.hardware
    );
    const legTop = bottom;
    const legBottom = floor + footHeight;
    if (legBottom >= legTop) return;
    for (const [side, x] of [
      ["left", supportLeft],
      ["right", supportRight]
    ] as const) {
      this.add(
        `stand-${side}-panel`,
        legThickness,
        legTop - legBottom,
        0.21 * KIT_DEPTH,
        x,
        (legTop + legBottom) / 2,
        -88
      );
      this.add(
        `stand-${side}-foot`,
        0.062 * metres,
        footHeight,
        0.34 * KIT_DEPTH,
        x,
        floor + footHeight / 2,
        -80,
        this.hardware
      );
    }
    this.add(
      "stand-rear-brace",
      span,
      45,
      0.025 * KIT_DEPTH,
      centre,
      floor + 180,
      -175,
      this.hardware
    );
  }

  private add(
    name: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material = this.shell
  ): void {
    const radius = Math.min(3, width / 6, height / 6, depth / 6);
    const mesh = new Mesh(new RoundedBoxGeometry(width, height, depth, 2, radius), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    this.group.add(mesh);
  }

  clear(): void {
    for (const child of this.group.children) {
      if (child instanceof Mesh) (child as Mesh).geometry.dispose();
    }
    this.group.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.hardware.dispose();
  }
}
