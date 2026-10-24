// @vitest-environment happy-dom
import { Assets, Texture, TextureSource } from "./flatThree";
import type { Sprite } from "./flatThree";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlasmaLayer } from "./PlasmaLayer";
import type { PlasmaAnchor } from "./PlasmaLayer";
import type { EnergySource } from "./noteEnergy";
import { EMBER_LIFE_S } from "./emberMotion";

const anchor: PlasmaAnchor = { pitch: 60, x: 100, y: 400, width: 30, color: 0xff3300 };
const source: EnergySource = {
  id: "one",
  pitch: 60,
  color: 0xff3300,
  strength: 1,
  progress: 1,
  sounding: true
};

function mockAssets(failures: readonly string[] = []): Texture {
  const atlas = new Texture({ source: new TextureSource({ width: 1152, height: 2304 }) });
  const mist = new Texture({ source: new TextureSource({ width: 1536, height: 1152 }) });
  const note = new Texture({ source: new TextureSource({ width: 64, height: 80 }) });
  vi.spyOn(Assets, "load").mockImplementation((url) => {
    const name = typeof url === "string" ? url : "";
    const kind = name.includes("piano-mist")
      ? "piano-mist"
      : name.includes("plasma-flame")
        ? "plasma-flame"
        : "plasma-note";
    if (failures.includes(kind)) return Promise.reject(new Error("asset unavailable"));
    return Promise.resolve(
      (kind === "piano-mist" ? mist : kind === "plasma-note" ? note : atlas) as unknown as Record<
        string,
        unknown
      >
    );
  });
  return atlas;
}

function sprites(layer: PlasmaLayer, group: number): Sprite[] {
  const container = layer.container.children[group];
  if (!container) throw new Error(`Expected plasma group ${String(group)}`);
  return container.children as Sprite[];
}

function visible(layer: PlasmaLayer, group: number): Sprite[] {
  return sprites(layer, group).filter((sprite) => sprite.visible);
}

function firstVisible(layer: PlasmaLayer, group: number): Sprite {
  const sprite = visible(layer, group)[0];
  if (!sprite) throw new Error("Expected a visible effect sprite");
  return sprite;
}

afterEach(() => vi.restoreAllMocks());

describe("PlasmaLayer", () => {
  it("exposes only the owned neutral mist group without moving coloured effects", () => {
    const layer = new PlasmaLayer();
    expect(layer.mist).toBe(layer.container.children[1]);
    expect(layer.mist.parent).toBe(layer.container);
    expect(layer.mist).not.toBe(layer.container.children[2]);
    expect(layer.mist).not.toBe(layer.container.children[3]);
    layer.destroy();
    expect(layer.mist.destroyed).toBe(true);
  });
  it("covers the entire white-key horizon and includes black keys in local flames", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    const keys = [
      anchor,
      { ...anchor, pitch: 61, x: 115, black: true },
      { ...anchor, pitch: 62, x: 130 }
    ];
    layer.draw(keys, [{ ...source, pitch: 61 }], [], 600, 0.05);
    expect(visible(layer, 1)).toHaveLength(4);
    expect(visible(layer, 1).every((sprite) => sprite.width >= anchor.width * 6)).toBe(true);
    expect(visible(layer, 1).every((sprite) => sprite.height > 0)).toBe(true);
    expect(visible(layer, 1).every((sprite) => sprite.height <= anchor.width * 1.5 * 3.5)).toBe(
      true
    );
    expect(visible(layer, 3)).toHaveLength(3);
    expect(firstVisible(layer, 3).tint).toBe(source.color);
    expect(visible(layer, 3).some((sprite) => Math.abs(sprite.x - 115) < anchor.width * 0.1)).toBe(
      true
    );
    layer.destroy();
  });

  it("keeps particles and flame sprites bounded under dense attacks", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    const keys = Array.from({ length: 88 }, (_, index) => ({
      ...anchor,
      pitch: 21 + index,
      x: index * 10
    }));
    const sources = keys.map((key, index) => ({
      ...source,
      id: `note-${String(index)}`,
      pitch: key.pitch
    }));
    const initialCounts = layer.container.children.map((child) => child.children.length);
    layer.draw(keys, sources, sources, 600, 0.05);
    expect(visible(layer, 3)).toHaveLength(88);
    expect(visible(layer, 0)).toHaveLength(128);
    for (let index = 0; index < 60; index++) layer.draw(keys, sources, sources, 600, 0.05);
    expect(visible(layer, 0)).toHaveLength(128);
    expect(layer.container.children.map((child) => child.children.length)).toEqual(initialCounts);
    expect(initialCounts).toEqual([128, 176, 88, 88]);
    layer.clear();
    expect(layer.container.children.every((_, index) => visible(layer, index).length === 0)).toBe(
      true
    );
    layer.destroy();
  });

  it("drifts two overlapping fog layers independently and reads the complete 96-cell mist atlas", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    const keys = [anchor, { ...anchor, pitch: 62, x: 130 }];
    layer.draw(keys, [source], [], 600, 0.01);
    const rim = visible(layer, 1);
    const before = rim.map((sprite) => ({
      x: sprite.x,
      height: sprite.height,
      texture: sprite.texture
    }));
    expect(new Set(rim.map((sprite) => sprite.texture)).size).toBe(4);
    const first = rim[0];
    const next = rim[2];
    if (!first || !next) throw new Error("Expected neighboring rim flames");
    expect(first.x + first.width / 2).toBeGreaterThan(next.x - next.width / 2);
    let lastAtlasRow = 0;
    for (let index = 0; index < 90; index++) {
      layer.draw(keys, [source], [], 600, 0.05);
      for (const sprite of rim) {
        lastAtlasRow = Math.max(lastAtlasRow, sprite.texture.frame.y / 96);
        expect(sprite.texture.frame.width).toBe(192);
        expect(sprite.texture.frame.height).toBe(96);
        expect(sprite.texture.frame.x % 192).toBe(0);
        expect(sprite.texture.frame.y % 96).toBe(0);
        expect(sprite.texture.frame.x + 192).toBeLessThanOrEqual(1536);
        expect(sprite.texture.frame.y + 96).toBeLessThanOrEqual(1152);
        expect(sprite.alpha).toBeGreaterThanOrEqual(0.42);
        expect(sprite.alpha).toBeLessThanOrEqual(0.72);
        expect(sprite.width).toBeGreaterThanOrEqual(anchor.width * 6.5);
        expect(sprite.width).toBeLessThanOrEqual(anchor.width * 7.5);
      }
    }
    expect(lastAtlasRow).toBe(11);
    for (let index = 0; index < rim.length; index++) {
      expect(rim[index]?.x).not.toBe(before[index]?.x);
      expect(rim[index]?.height).not.toBe(before[index]?.height);
    }
    const paused = rim.map((sprite) => ({
      x: sprite.x,
      height: sprite.height,
      texture: sprite.texture
    }));
    layer.draw(keys, [source], [], 600, 0);
    expect(
      rim.map((sprite) => ({ x: sprite.x, height: sprite.height, texture: sprite.texture }))
    ).toEqual(paused);
    layer.destroy();
  });

  it("overlaps fog every third white key with covered edges and gentle height variation", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    const keys = Array.from({ length: 52 }, (_, index) => ({
      ...anchor,
      pitch: 21 + index,
      x: index * 30
    }));
    layer.draw(keys, [], [], 600, 0.01);
    const rim = visible(layer, 1);
    expect(rim).toHaveLength(36);
    const first = rim[0];
    const last = rim.at(-1);
    if (!first || !last) throw new Error("Expected the two keyboard edges");
    expect(first.x - first.width / 2).toBeLessThan(-15);
    expect(last.x + last.width / 2).toBeGreaterThan(51 * 30 + 15);
    const heights = rim.filter((_, index) => index % 2 === 0).map((sprite) => sprite.height);
    expect(Math.max(...heights) / Math.min(...heights)).toBeLessThan(1.6);
    const primary = rim.filter((_, index) => index % 2 === 0);
    for (let index = 1; index < primary.length; index++) {
      const previous = primary[index - 1];
      const next = primary[index];
      if (!previous || !next) throw new Error("Expected overlapping mist clouds");
      expect(previous.x + previous.width / 2).toBeGreaterThan(next.x - next.width / 2);
    }
    const initialFrame = (first.texture.frame.y / 96) * 8 + first.texture.frame.x / 192;
    for (let index = 0; index < 20; index++) layer.draw(keys, [], [], 600, 0.05);
    const nextFrame = (first.texture.frame.y / 96) * 8 + first.texture.frame.x / 192;
    const advanced = (nextFrame - initialFrame + 96) % 96;
    expect(advanced).toBeGreaterThanOrEqual(14);
    expect(advanced).toBeLessThanOrEqual(18);
    layer.destroy();
  });

  it("keeps neutral screen-lit fog with an airy body and bright low base frozen during pause", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    const keys = Array.from({ length: 9 }, (_, index) => ({
      ...anchor,
      pitch: 56 + index,
      x: index * 30
    }));
    layer.draw(keys, [], [], 600, 0.01);
    const rim = visible(layer, 1);
    expect(new Set(rim.map((sprite) => sprite.tint))).toEqual(new Set([0xd5dce0, 0xb9c1c8]));
    const snapshot = () =>
      rim.map((sprite) => ({
        x: sprite.x,
        y: sprite.y,
        height: sprite.height,
        width: sprite.width,
        tint: sprite.tint,
        texture: sprite.texture
      }));
    const before = snapshot();
    layer.draw(keys, [{ ...source, color: 0x00a9f5 }], [], 600, 0);
    expect(snapshot()).toEqual(before);
    layer.draw(keys, [], [], 600, 0);
    expect(snapshot()).toEqual(before);
    expect(rim.every((sprite) => sprite.blendMode === "screen")).toBe(true);
    const primary = rim[0];
    const secondary = rim[1];
    if (!primary || !secondary) throw new Error("Expected both neutral flame layers");
    expect(primary.height).toBeLessThan(primary.width * 0.55);
    expect(primary.height).toBeGreaterThan(primary.width * 0.25);
    expect(secondary.height).toBeCloseTo(primary.height * 0.24);
    expect(primary.alpha).toBe(0.42);
    expect(secondary.alpha).toBe(0.72);
    layer.destroy();
  });

  it("shows a much taller colored plume above the cool rim and bounds it to the available screen", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    for (let index = 0; index < 12; index++) layer.draw([anchor], [source], [], 600, 0.05);
    const flame = firstVisible(layer, 3);
    expect(flame.height).toBeGreaterThan(anchor.width * 7.4);
    expect(flame.width).toBeCloseTo(anchor.width * 1.8);
    expect(flame.tint).toBe(source.color);
    expect(flame.alpha).toBeLessThanOrEqual(1);
    expect(flame.height).toBeGreaterThan(
      Math.max(...visible(layer, 1).map((sprite) => sprite.height))
    );
    layer.draw([anchor], [source], [], 160, 0.05);
    expect(visible(layer, 1).every((sprite) => sprite.height <= 160 * 0.5)).toBe(true);
    expect(flame.height).toBeLessThanOrEqual(160 * 0.85);
    expect(flame.tint).toBe(source.color);
    layer.destroy();
  });

  it("spreads local flame three white keys each way with a smooth tail and no extra spark origins", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    const keys = [-4, -3.75, -3, -2, -1, 0, 1, 2, 3, 3.5, 3.75, 4].map((offset) => ({
      ...anchor,
      pitch: 60 + offset * 2,
      x: anchor.x + offset * anchor.width
    }));
    layer.draw(keys, [source], [], 1200, 0.01);
    expect(visible(layer, 3)).toHaveLength(7);
    expect(visible(layer, 0)).toHaveLength(0);
    for (let index = 0; index < 20; index++) layer.draw(keys, [source], [], 1200, 0.05);
    const atOffset = (offset: number) => {
      const sprite = visible(layer, 3).find(
        (candidate) =>
          Math.abs(candidate.x - (anchor.x + offset * anchor.width)) < anchor.width * 0.1
      );
      if (!sprite) throw new Error("Expected a flame at the neighboring white key");
      return sprite;
    };
    const center = atOffset(0);
    for (const side of [-1, 1]) {
      const first = atOffset(side);
      const second = atOffset(side * 2);
      const third = atOffset(side * 3);
      expect(first.alpha / center.alpha).toBeCloseTo(Math.exp(-0.5 / 1.45 ** 2));
      expect(second.alpha / center.alpha).toBeCloseTo(Math.exp(-2 / 1.45 ** 2));
      expect(first.height / center.height).toBeCloseTo(Math.exp(-0.5 / 1.45 ** 2), 1);
      expect(second.height / center.height).toBeCloseTo(Math.exp(-2 / 1.45 ** 2), 1);
      expect(first.height).toBeLessThan(center.height);
      expect(second.height).toBeLessThan(first.height);
      expect(third.alpha / center.alpha).toBeCloseTo(Math.exp(-4.5 / 1.45 ** 2));
      expect(third.height).toBeLessThan(second.height);
      expect(second.tint).toBe(source.color);
    }
    expect(
      visible(layer, 3).every((sprite) => Math.abs(sprite.x - anchor.x) < anchor.width * 3.75)
    ).toBe(true);
    expect(atOffset(3.5).alpha).toBeLessThan(atOffset(3).alpha * 0.25);
    layer.destroy();
  });

  it("preserves the Gaussian peak when large keys reach the screen-height limit", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    const keys = [
      { ...anchor, width: 100 },
      { ...anchor, pitch: 62, x: 200, width: 100 },
      { ...anchor, pitch: 64, x: 300, width: 100 }
    ];
    for (let index = 0; index < 20; index++) layer.draw(keys, [source], [], 640, 0.05);
    const flames = visible(layer, 3);
    const center = flames[0];
    const neighbor = flames[1];
    const second = flames[2];
    if (!center || !neighbor || !second) throw new Error("Expected the capped Gaussian plume");
    expect(center.height).toBeLessThan(640 * 0.47);
    expect(center.height).toBeGreaterThan(640 * 0.4);
    expect(neighbor.height / center.height).toBeCloseTo(Math.exp(-0.5 / 1.45 ** 2), 1);
    expect(second.height / center.height).toBeCloseTo(Math.exp(-2 / 1.45 ** 2), 1);
    expect(center.alpha).toBeGreaterThan(0.78);
    layer.destroy();
  });

  it("keeps a black note's plume highest at its own key using the neighboring white-key width", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    const keys = [
      anchor,
      { ...anchor, pitch: 61, x: 115, width: 18, black: true },
      { ...anchor, pitch: 62, x: 130 }
    ];
    const blackSource = { ...source, pitch: 61 };
    for (let index = 0; index < 40; index++) layer.draw(keys, [blackSource], [], 1200, 0.05);
    const center = visible(layer, 3).find((sprite) => Math.abs(sprite.x - 115) < 5);
    if (!center) throw new Error("Expected the black note's central flame");
    expect(center.width).toBeCloseTo(anchor.width * 1.8);
    for (const sprite of visible(layer, 3)) {
      if (sprite !== center) expect(sprite.height).toBeLessThan(center.height);
    }
    layer.destroy();
  });

  it("blends overlapping colored plumes without adding brightness beyond the pool's intensity limit", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    const keys = [anchor, { ...anchor, pitch: 62, x: 130 }];
    const chord = [
      { ...source, color: 0xff0000 },
      { ...source, id: "blue", pitch: 62, color: 0x0000ff }
    ];
    for (let index = 0; index < 20; index++) layer.draw(keys, chord, [], 1200, 0.05);
    const redSide = firstVisible(layer, 3);
    expect(redSide.tint).toBe(0x8f0070);
    expect(visible(layer, 3).every((sprite) => sprite.alpha <= 1)).toBe(true);
    layer.destroy();
  });

  it("adds a saturated halo synchronized with the core frame, envelope and paused geometry", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    const keys = [anchor, { ...anchor, pitch: 62, x: 130 }];
    for (let index = 0; index < 12; index++) layer.draw(keys, [source], [], 600, 0.05);
    const cores = visible(layer, 3);
    const halos = visible(layer, 2);
    expect(halos).toHaveLength(cores.length);
    for (let index = 0; index < cores.length; index++) {
      const core = cores[index];
      const halo = halos[index];
      if (!core || !halo) throw new Error("Expected paired core and halo sprites");
      expect(halo.texture).toBe(core.texture);
      expect(halo.position).toMatchObject({ x: core.x, y: core.y });
      expect(halo.width).toBeCloseTo(core.width * 1.35);
      expect(halo.height).toBeCloseTo(core.height * 1.05);
      expect(halo.tint).toBe(source.color);
      expect(halo.blendMode).toBe("screen");
      expect(core.blendMode).toBe("screen");
      expect(halo.alpha / core.alpha).toBeCloseTo(0.24 / 0.95);
    }
    const snapshot = (sprite: Sprite) => ({
      x: sprite.x,
      y: sprite.y,
      width: sprite.width,
      height: sprite.height,
      alpha: sprite.alpha,
      texture: sprite.texture
    });
    const before = [...halos, ...cores].map(snapshot);
    layer.draw(keys, [source], [], 600, 0);
    expect([...halos, ...cores].map(snapshot)).toEqual(before);
    layer.clear();
    expect(visible(layer, 2)).toHaveLength(0);
    layer.destroy();
  });

  it("deduplicates attack identities, freezes on pause and projects onto current anchors", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    layer.draw([anchor], [], [source], 600, 0);
    expect(visible(layer, 0)).toHaveLength(0);
    layer.draw([anchor], [], [source], 600, 0.01);
    expect(visible(layer, 0)).toHaveLength(2);
    expect(Math.max(...visible(layer, 0).map((sprite) => sprite.width))).toBeGreaterThan(3);
    const particle = firstVisible(layer, 0);
    const before = { x: particle.x, y: particle.y, alpha: particle.alpha };
    layer.draw([anchor], [], [source], 600, 0);
    expect({ x: particle.x, y: particle.y, alpha: particle.alpha }).toEqual(before);
    layer.draw([{ ...anchor, x: anchor.x + 200, y: anchor.y + 50 }], [], [], 600, 0);
    expect(particle.x).toBeCloseTo(before.x + 200);
    expect(particle.y).toBeCloseTo(before.y + 50);
    layer.draw([anchor], [], [source], 600, 0.01);
    expect(visible(layer, 0)).toHaveLength(2);
    layer.draw([anchor], [], [{ ...source, id: "same-pitch-next-note" }], 600, 0.01);
    expect(visible(layer, 0)).toHaveLength(4);
    layer.destroy();
  });

  it("ignites quickly then keeps the release tail visible without emitting more musical embers", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    layer.draw([anchor], [source], [source], 600, 0.05);
    layer.draw([anchor], [source], [], 600, 0.05);
    const flame = firstVisible(layer, 3);
    const attackAlpha = flame.alpha;
    expect(attackAlpha).toBeGreaterThan(0.8);
    expect(visible(layer, 0)).toHaveLength(2);
    for (let index = 0; index < 10; index++) layer.draw([anchor], [], [], 600, 0.05);
    expect(flame.visible).toBe(true);
    expect(flame.alpha).toBeGreaterThan(attackAlpha * 0.5);
    expect(flame.alpha).toBeLessThan(attackAlpha);
    expect(flame.tint).toBe(source.color);
    for (let index = 0; index < 10; index++) layer.draw([anchor], [], [], 600, 0.05);
    expect(flame.visible).toBe(true);
    expect(flame.alpha).toBeGreaterThan(attackAlpha * 0.25);
    expect(visible(layer, 0)).toHaveLength(2);
    for (let index = 0; index < 70; index++) layer.draw([anchor], [], [], 600, 0.05);
    expect(flame.visible).toBe(false);
    expect(visible(layer, 2)).toHaveLength(0);
    expect(visible(layer, 0)).toHaveLength(2);
    layer.destroy();
  });

  it("freezes a released flame during pause and removes the tail immediately on reset", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    layer.draw([anchor], [source], [source], 600, 0.05);
    layer.draw([anchor], [], [], 600, 0.05);
    const flame = firstVisible(layer, 3);
    const before = {
      alpha: flame.alpha,
      height: flame.height,
      tint: flame.tint,
      texture: flame.texture
    };
    for (let index = 0; index < 100; index++) layer.draw([anchor], [], [], 600, 0);
    expect(flame.visible).toBe(true);
    expect({
      alpha: flame.alpha,
      height: flame.height,
      tint: flame.tint,
      texture: flame.texture
    }).toEqual(before);
    layer.clear();
    expect(flame.visible).toBe(false);
    expect(layer.container.children.every((_, index) => visible(layer, index).length === 0)).toBe(
      true
    );
    layer.draw([anchor], [], [], 600, 0.05);
    expect(visible(layer, 3)).toHaveLength(0);
    expect(visible(layer, 2)).toHaveLength(0);
    layer.destroy();
  });

  it("fades flames after release and retires embers within their visual lifetime", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    layer.draw([anchor], [source], [source], 600, 0.05);
    const flame = firstVisible(layer, 3);
    const alpha = flame.alpha;
    layer.draw([anchor], [], [], 600, 0.05);
    expect(flame.visible).toBe(true);
    expect(flame.alpha).toBeLessThan(alpha);
    for (let elapsed = 0; elapsed <= EMBER_LIFE_S; elapsed += 0.05) {
      layer.draw([anchor], [], [], 600, 0.05);
    }
    expect(visible(layer, 3)).toHaveLength(0);
    expect(visible(layer, 0)).toHaveLength(0);
    layer.destroy();
  });

  it("clamps delayed frames and does not consume attacks during a paused frame", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    layer.draw([anchor], [], [source], 600, 10);
    const particle = firstVisible(layer, 0);
    expect(particle.alpha).toBeGreaterThan(0);
    layer.clear();
    layer.draw([anchor], [], [source], 600, -1);
    expect(visible(layer, 0)).toHaveLength(0);
    layer.draw([anchor], [], [source], 600, 0.01);
    expect(visible(layer, 0)).toHaveLength(2);
    layer.destroy();
  });

  it("reduces dense chord flames while leaving a single note's peak intact", async () => {
    mockAssets();
    const single = new PlasmaLayer();
    const chord = new PlasmaLayer();
    await Promise.all([single.load(), chord.load()]);
    const keys = Array.from({ length: 4 }, (_, index) => ({
      ...anchor,
      pitch: 60 + index,
      x: 100 + index * 300
    }));
    const sources = keys.map((key, index) => ({
      ...source,
      pitch: key.pitch,
      id: `chord-${String(index)}`
    }));
    for (let index = 0; index < 20; index++) {
      single.draw(keys, [source], [], 600, 0.05);
      chord.draw(keys, sources, [], 600, 0.05);
    }
    const singlePeak = firstVisible(single, 3);
    const chordPeak = firstVisible(chord, 3);
    expect(chordPeak.height).toBeLessThan(singlePeak.height * 0.8);
    expect(chordPeak.alpha).toBeLessThan(singlePeak.alpha * 0.8);
    expect(chordPeak.tint).toBe(source.color);
    single.destroy();
    chord.destroy();
  });

  it("keeps old embers climbing when its fixed pool is full instead of recycling them", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    const attacks = Array.from({ length: 128 }, (_, index) => ({
      ...source,
      id: `fill-${String(index)}`
    }));
    layer.draw([anchor], [], attacks, 600, 0.01);
    expect(visible(layer, 0)).toHaveLength(128);
    const sizes = visible(layer, 0).map((sprite) => sprite.height);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThan(1.5);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(34);
    const oldest = firstVisible(layer, 0);
    layer.draw([anchor], [], [], 600, 0.05);
    const previousY = oldest.y;
    layer.draw([anchor], [], [{ ...source, id: "pool-full" }], 600, 0.01);
    expect(visible(layer, 0)).toHaveLength(128);
    expect(oldest.y).toBeLessThan(previousY);
    expect(sprites(layer, 0)).toHaveLength(128);
    layer.destroy();
  });

  it("uses note duration to size both initial and held embers within a small footprint", async () => {
    mockAssets();
    const short = new PlasmaLayer();
    const long = new PlasmaLayer();
    await Promise.all([short.load(), long.load()]);
    short.draw([anchor], [{ ...source, duration: 0.5 }], [{ ...source, duration: 0.5 }], 600, 0.01);
    long.draw([anchor], [{ ...source, duration: 4 }], [{ ...source, duration: 4 }], 600, 0.01);
    short.draw([anchor], [{ ...source, duration: 0.5 }], [], 600, 0.05);
    long.draw([anchor], [{ ...source, duration: 4 }], [], 600, 0.05);
    short.draw([anchor], [{ ...source, duration: 0.5 }], [], 600, 0.05);
    long.draw([anchor], [{ ...source, duration: 4 }], [], 600, 0.05);
    for (let index = 0; index < 18; index++) {
      short.draw([anchor], [{ ...source, duration: 0.5 }], [], 600, 0.05);
      long.draw([anchor], [{ ...source, duration: 4 }], [], 600, 0.05);
    }
    const shortParticles = visible(short, 0);
    const longParticles = visible(long, 0);
    expect(shortParticles).toHaveLength(4);
    expect(longParticles).toHaveLength(4);
    for (let index = 0; index < 4; index++) {
      const small = shortParticles[index];
      const large = longParticles[index];
      if (!small || !large) throw new Error("Expected matching initial and held embers");
      expect(large.height).toBeGreaterThanOrEqual(small.height);
      expect(large.height).toBeLessThanOrEqual(34);
      expect(small.height).toBeGreaterThanOrEqual(12);
    }
    short.destroy();
    long.destroy();
  });

  it("grows emission from the base held rate without producing neighbor sparks", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    for (let index = 0; index < 20; index++) layer.draw([anchor], [source], [], 600, 0.05);
    expect(visible(layer, 0).length).toBeGreaterThanOrEqual(2);
    expect(visible(layer, 0).length).toBeLessThanOrEqual(4);
    layer.destroy();
  });

  it("keeps pure-colored sparks normal while colored local fire uses screen light", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    const blue = { ...source, color: 0x0033ff };
    layer.draw([anchor], [blue], [blue], 600, 0.05);
    expect(visible(layer, 0)).toHaveLength(2);
    for (const sprite of visible(layer, 0)) {
      expect(sprite.tint).toBe(blue.color);
      expect(sprite.blendMode).toBe("normal");
      expect(sprite.alpha).toBeGreaterThan(0);
      expect(sprite.height).toBeGreaterThanOrEqual(12);
    }
    expect(firstVisible(layer, 3).blendMode).toBe("screen");
    expect(firstVisible(layer, 3).tint).toBe(blue.color);
    expect(visible(layer, 1).every((sprite) => sprite.blendMode === "screen")).toBe(true);
    layer.destroy();
  });

  it("grows density with visual held age while the source stays unchanged in wait mode", async () => {
    mockAssets();
    const fresh = new PlasmaLayer();
    const held = new PlasmaLayer();
    await Promise.all([fresh.load(), held.load()]);
    for (let index = 0; index < 80; index++) held.draw([anchor], [source], [], 600, 0.05);
    const before = visible(held, 0).length;
    for (let index = 0; index < 20; index++) {
      fresh.draw([anchor], [source], [], 600, 0.05);
      held.draw([anchor], [source], [], 600, 0.05);
    }
    const emitted = visible(held, 0).length - before;
    expect(visible(fresh, 0).length).toBeLessThanOrEqual(4);
    expect(emitted).toBeGreaterThan(visible(fresh, 0).length * 1.6);
    expect(emitted).toBeLessThanOrEqual(6);
    fresh.destroy();
    held.destroy();
  });

  it("resets held age and fractional emission when a repeated pitch starts or is released", async () => {
    mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    for (let index = 0; index < 80; index++) layer.draw([anchor], [source], [], 600, 0.05);
    const before = visible(layer, 0).length;
    const repeated = { ...source, id: "next-note" };
    for (let index = 0; index < 20; index++) layer.draw([anchor], [repeated], [], 600, 0.05);
    const repeatedCount = visible(layer, 0).length - before;
    expect(repeatedCount).toBeGreaterThanOrEqual(2);
    expect(repeatedCount).toBeLessThanOrEqual(4);
    layer.draw([anchor], [], [], 600, 0.01);
    const released = visible(layer, 0).length;
    for (let index = 0; index < 20; index++) layer.draw([anchor], [repeated], [], 600, 0.05);
    expect(visible(layer, 0).length - released).toBe(repeatedCount);
    layer.destroy();
  });

  it("freezes visual held age and emission on paused frames", async () => {
    mockAssets();
    const paused = new PlasmaLayer();
    const control = new PlasmaLayer();
    await Promise.all([paused.load(), control.load()]);
    for (let index = 0; index < 20; index++) {
      paused.draw([anchor], [source], [], 600, 0.05);
      control.draw([anchor], [source], [], 600, 0.05);
    }
    const before = visible(paused, 0).length;
    for (let index = 0; index < 200; index++) paused.draw([anchor], [], [], 600, 0);
    expect(visible(paused, 0)).toHaveLength(before);
    for (let index = 0; index < 20; index++) {
      paused.draw([anchor], [source], [], 600, 0.05);
      control.draw([anchor], [source], [], 600, 0.05);
    }
    expect(visible(paused, 0).length).toBe(visible(control, 0).length);
    paused.destroy();
    control.destroy();
  });

  it.each([
    { missing: "piano-mist", rimCell: 144, local: true, notes: 2 },
    { missing: "plasma-flame", rimCell: 192, local: false, notes: 2 },
    { missing: "plasma-note", rimCell: 192, local: true, notes: 0 }
  ])(
    "keeps independent effects available when $missing fails",
    async ({ missing, rimCell, local, notes }) => {
      mockAssets([missing]);
      const layer = new PlasmaLayer();
      const firstLoad = layer.load();
      expect(layer.load()).toBe(firstLoad);
      await firstLoad;
      expect(vi.spyOn(Assets, "load")).toHaveBeenCalledTimes(3);
      layer.draw([anchor], [source], [source], 600, 0.05);
      expect(firstVisible(layer, 1).texture.frame.width).toBe(rimCell);
      expect(visible(layer, 3).length > 0).toBe(local);
      expect(visible(layer, 0)).toHaveLength(notes);
      layer.destroy();
    }
  );

  it("disposes both atlases' 96 owned frames once while preserving shared texture sources", async () => {
    const flame = mockAssets();
    const layer = new PlasmaLayer();
    await layer.load();
    layer.draw([anchor], [source], [], 600, 0.05);
    const mistSource = firstVisible(layer, 1).texture.source;
    expect(mistSource).not.toBe(flame.source);
    const destroyFlameSource = vi.spyOn(flame.source, "destroy");
    const destroyMistSource = vi.spyOn(mistSource, "destroy");
    const destroyFrame = vi.spyOn(Texture.prototype, "destroy");
    layer.destroy();
    expect(destroyFrame).toHaveBeenCalledTimes(192);
    expect(destroyFrame.mock.calls.every((call) => call[0] === false)).toBe(true);
    expect(destroyFlameSource).not.toHaveBeenCalled();
    expect(destroyMistSource).not.toHaveBeenCalled();
    layer.destroy();
    expect(destroyFrame).toHaveBeenCalledTimes(192);
  });

  it("stays invisible without assets and survives destruction during an asynchronous load", async () => {
    vi.spyOn(Assets, "load").mockRejectedValue(new Error("asset unavailable"));
    const missing = new PlasmaLayer();
    await missing.load();
    missing.draw([anchor], [source], [source], 600, 0.05);
    expect(
      missing.container.children.every((_, index) => visible(missing, index).length === 0)
    ).toBe(true);
    missing.destroy();

    const atlas = new Texture({ source: new TextureSource({ width: 1152, height: 2304 }) });
    const destroySource = vi.spyOn(atlas.source, "destroy");
    let finish: ((value: Record<string, unknown>) => void) | undefined;
    const deferred = new Promise<Record<string, unknown>>((resolve) => {
      finish = resolve;
    });
    vi.spyOn(Assets, "load").mockReturnValue(deferred);
    const pending = new PlasmaLayer();
    const loading = pending.load();
    pending.destroy();
    finish?.(atlas as unknown as Record<string, unknown>);
    await loading;
    expect(pending.container.destroyed).toBe(true);
    expect(destroySource).not.toHaveBeenCalled();
  });
});
