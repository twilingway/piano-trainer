// @vitest-environment happy-dom
import { Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Container, Sprite, Texture, TextureSource } from "./flatThree";
import { FallingNotesView } from "./FallingNotesView";
import { RoadLayer } from "./RoadLayer";
import { NativeKeyboardScene } from "./NativeKeyboardScene";
import { metricKeyboardCamera } from "./metricKeyboardCamera";
import { layoutKeyboard } from "./keyboardLayout";
import type { Geometry, KeysPlacement } from "./viewGeometry";
import { USUAL_PLACEMENT, viewGeometry, viewLayoutChanged } from "./viewGeometry";
import { CAMERA_PRESETS, DEFAULT_CAMERA, normalizeCamera, type CameraPrefs } from "./worldCamera";
import type { RoadShape } from "./roadLayoutCamera";
import { nativeViewCameras } from "./nativeViewCameras";
import * as framing from "./nativeKeyboardFraming";
import { nativeKeyboardFootprint, naturalNativeKeyboardHeight } from "./nativeKeyboardFraming";
import { projectionMatrix, viewMatrix } from "./three/threeCamera";
import { projectNoteLane } from "./noteLaneProjection";

afterEach(() => vi.restoreAllMocks());

function layoutHarness(
  width: number,
  height: number,
  low: number,
  high: number,
  prefs: CameraPrefs,
  hands: boolean,
  notes = true
) {
  const screen = { width, height };
  const physical = new NativeKeyboardScene();
  const texture = new Texture({ source: new TextureSource({ width: 1, height: 1 }) });
  const road = Object.assign(Object.create(RoadLayer.prototype) as object, {
    renderer: { resolution: 1 },
    app: { screen },
    container: new Container(),
    effects: new Container(),
    keys: physical,
    keysTexture: texture,
    style: "3d",
    shape: { far: 0.1, horizon: 0.1 },
    cameraPrefs: prefs,
    keyboardTop: false,
    notesPerspective: true,
    keysShift: undefined,
    pan: 0,
    fog: new Sprite(),
    size: { width: 0, height: 0 },
    three: { on: true, setEnabled: vi.fn(() => Promise.resolve()) }
  }) as unknown as RoadLayer;
  const view = Object.assign(Object.create(FallingNotesView.prototype) as object, {
    app: { screen, canvas: { parentElement: null } },
    road,
    roadMode: notes,
    keyStyle: "3d",
    cameraPrefs: prefs,
    keyboardTop: false,
    parts: { notes, keys: true, hands },
    placement: USUAL_PLACEMENT,
    labels: false,
    range: { low, high },
    rangeFitsViewport: true,
    rangeFitsSong: false,
    keys: new Map(),
    pan: 0,
    panLayout: { width: 0, total: 0 },
    whiteWidth: 0,
    hands: { live: hands, reset: vi.fn() },
    keyboard: { layout: vi.fn() },
    notesLayer: { layout: vi.fn() },
    hud: { layout: vi.fn() },
    hudTop: 0
  }) as unknown as FallingNotesView;
  const internal = view as unknown as {
    layout(width: number, height: number): void;
    geometry(height: number): Geometry;
    placement: KeysPlacement;
    laidOutFor: { width: number; height: number; liveHands: boolean };
  };
  const setKeyboard = vi.spyOn(road, "setKeyboard");
  const layout = () => {
    internal.layout(screen.width, screen.height);
    return internal.geometry(screen.height);
  };
  const scene = () => {
    const result = physical.scene;
    if (!result?.keyboardCamera) throw new Error("Missing real final native camera");
    return result;
  };
  const dispose = () => {
    physical.destroy();
    texture.destroy(true);
  };
  return { view, internal, screen, road, setKeyboard, layout, scene, dispose };
}

describe("independent world road", () => {
  interface RoadFields {
    camera: {
      project: (x: number, y: number, z: number) => { x: number; y: number };
      roadFarZ: number;
      sourceX: (x: number) => number;
      params: unknown;
    };
    size: { height: number };
    contactKeys: ReadonlyMap<number, { x: number; width: number; black: boolean }>;
    dock: { lanes: ReadonlyMap<number, { worldOffsetX?: number; depth?: number }> };
    shape: RoadShape;
  }
  const keyboards: readonly CameraPrefs[] = [
    CAMERA_PRESETS.top,
    CAMERA_PRESETS.player,
    CAMERA_PRESETS.hands,
    { ...CAMERA_PRESETS.player, fov: 25 },
    { ...CAMERA_PRESETS.player, fov: 85 },
    { ...CAMERA_PRESETS.player, height: 1000, distance: 1200 },
    { ...CAMERA_PRESETS.player, pitch: -5, targetY: 250 },
    { ...CAMERA_PRESETS.top, targetY: -250, scale: 0.55 },
    { ...CAMERA_PRESETS.top, scale: 1.6 }
  ];

  it("keeps the world road while every keyboard camera setting changes and joins the shown keys", () => {
    for (const horizon of [0.1, 0.99, 1, 1.01, 1.5])
      for (const [low, high] of [
        [48, 72],
        [21, 108]
      ] as const) {
        let world: string | undefined;
        for (const prefs of keyboards) {
          const test = layoutHarness(1440, 900, low, high, prefs, false);
          const road = test.road as unknown as RoadFields;
          road.shape = { far: 0.1, horizon };
          test.layout();
          const camera = test.scene().keyboardCamera;
          if (!camera) throw new Error("Missing camera");
          const far = [0, 400, 1440].map((x) =>
            road.camera.project(road.camera.sourceX(x), 22, road.camera.roadFarZ)
          );
          const signature = JSON.stringify([road.camera.params, road.camera.roadFarZ, far]);
          world ??= signature;
          expect(signature).toBe(world);
          for (const key of road.contactKeys.values()) {
            const keyX = key.x + key.width / 2;
            const lane = road.dock.lanes.get(keyX);
            const floor = key.black ? 34 : 22;
            const expected = camera.project(
              camera.sourceX(keyX) + (lane?.worldOffsetX ?? 0),
              floor,
              lane?.depth ?? 150
            );
            const actual = test.road.notePlace(keyX, road.size.height);
            expect(Math.abs((actual?.x ?? NaN) - expected.x)).toBeLessThanOrEqual(1);
            expect(Math.abs((actual?.y ?? NaN) - expected.y)).toBeLessThanOrEqual(1);
          }
          test.dispose();
        }
      }
  });
  it("straightens lanes onto the shown keys automatically and under a camera snapshot", () => {
    const lane = (fit: RoadShape["fit"], prefs: CameraPrefs) => {
      const test = layoutHarness(1440, 900, 21, 108, prefs, false);
      const road = test.road as unknown as RoadFields;
      road.shape = { far: 0.1, horizon: 0.1, fit };
      test.layout();
      const key = [...road.contactKeys.values()].find((each) => !each.black && each.x > 200);
      if (!key) throw new Error("Missing key");
      const points = [1, 0.95, 0.85, 0.7, 0.5, 0.25, 0].map(
        (share) =>
          test.road.notePlace(key.x + key.width / 2, road.size.height * share) ?? {
            x: NaN,
            y: NaN
          }
      );
      test.dispose();
      return points;
    };
    const deviation = (points: readonly { x: number; y: number }[]) => {
      const [a, b] = [points[0] ?? { x: NaN, y: NaN }, points.at(-1) ?? { x: NaN, y: NaN }];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      return Math.max(
        ...points.map(
          (p) => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / length
        )
      );
    };
    const near = (
      a: { x: number; y: number } | undefined,
      b: { x: number; y: number } | undefined
    ) => Math.hypot((a?.x ?? NaN) - (b?.x ?? NaN), (a?.y ?? NaN) - (b?.y ?? NaN));
    const tilted = CAMERA_PRESETS.player;
    const bent = lane(undefined, tilted);
    expect(deviation(bent)).toBeGreaterThan(1);
    expect(deviation(lane({ mode: "button" }, tilted))).toBeCloseTo(deviation(bent), 6);
    const auto = lane({ mode: "auto" }, tilted);
    expect(deviation(auto)).toBeLessThan(0.5);
    expect(near(auto[0], bent[0])).toBeLessThanOrEqual(0.01);
    expect(near(auto.at(-1), bent.at(-1))).toBeLessThanOrEqual(0.01);
    const snapshot = lane({ mode: "button", camera: tilted }, tilted);
    snapshot.forEach((point, i) => {
      expect(near(point, auto[i])).toBeLessThanOrEqual(0.5);
    });
    // A keyboard camera changed after the snapshot bends the near quarter again.
    const later = lane({ mode: "button", camera: CAMERA_PRESETS.hands }, tilted);
    expect(deviation(later)).toBeGreaterThan(1);
    expect(near(later[0], auto[0])).toBeLessThanOrEqual(0.01);
  });
});

describe("native natural framing", () => {
  it("keeps the full parallel key travel inside the player viewport", () => {
    for (const [width, height] of [
      [2913, 1126],
      [2904, 1076],
      [2904, 803],
      [390, 844],
      [667, 375],
      [320, 100]
    ] as const)
      for (const [low, high] of [
        [48, 72],
        [36, 84],
        [21, 108]
      ] as const) {
        const test = layoutHarness(width, height, low, high, CAMERA_PRESETS.player, true);
        test.layout();
        const camera = test.scene().keyboardCamera;
        if (!camera) throw new Error("Missing camera");
        const lower = camera.project(0, -8, 0).y;
        expect(
          lower,
          `${String(width)}x${String(height)} ${String(low)}..${String(high)} pressed-front ${String(lower)}`
        ).toBeLessThanOrEqual(height);
        test.dispose();
      }
  });
  it("uses metric 150/23.5 overhead proportions at reset without changing the legacy reference", () => {
    expect(DEFAULT_CAMERA).toEqual({
      fov: 43,
      height: 230,
      distance: 720,
      pitch: 25,
      targetY: 0,
      scale: 1
    });
    expect(CAMERA_PRESETS.player).not.toBe(DEFAULT_CAMERA);
    expect(normalizeCamera(null)).toEqual(DEFAULT_CAMERA);
    const keys = layoutKeyboard(2913, 21, 108);
    const base = metricKeyboardCamera(2913, 2913, 1126, CAMERA_PRESETS.top, 0.1, keys.values());
    const natural = naturalNativeKeyboardHeight(base, false);
    const width = base.project(23.5, 22, 150).x - base.project(0, 22, 150).x;
    expect(natural / width).toBeCloseTo(150 / 23.5, 8);
    const camera = nativeViewCameras(
      base,
      natural,
      false,
      true,
      1126,
      0.1,
      1126,
      1120,
      undefined,
      undefined,
      2913,
      1
    ).keyboard;
    expect(camera.params.keyboardDepthScale).toBeUndefined();
    expect(camera.params.orthographicScale).toBe(base.params.orthographicScale);
  });

  it("uses uniform camera fit on a short viewport without an automatic longitudinal deformation", () => {
    const keys = layoutKeyboard(2904, 48, 72);
    const base = metricKeyboardCamera(2904, 2904, 100, CAMERA_PRESETS.top, 0.1, keys.values());
    const natural = naturalNativeKeyboardHeight(base, false);
    const geometry = viewGeometry(
      100,
      keys.get(48)?.width ?? 0,
      { notes: true, keys: true, hands: false },
      false,
      true,
      USUAL_PLACEMENT,
      natural
    );
    const camera = nativeViewCameras(
      base,
      geometry.keyboardHeight,
      false,
      true,
      100,
      0.1,
      100,
      geometry.keyboardTop + geometry.keyboardHeight,
      undefined,
      undefined,
      2904,
      1
    ).keyboard;
    expect(camera.params.keyboardDepthScale).toBeUndefined();
    expect(camera.params.orthographicScale).toBeLessThan(base.params.orthographicScale ?? 0);
    const across = camera.project(23.5, 22, 150).x - camera.project(0, 22, 150).x;
    expect(nativeKeyboardFootprint(camera).height / across).toBeCloseTo(150 / 23.5, 8);
    expect(geometry.hitY).toBeGreaterThanOrEqual(25);
  });

  it("frames the complete native mesh through real FallingNotesView layout with and without hands/notes", () => {
    for (const [width, height] of [
      [2913, 1126],
      [2904, 1076],
      [390, 844],
      [667, 375],
      [320, 100],
      [2904, 100]
    ] as const)
      for (const [low, high] of [
        [48, 72],
        [36, 84],
        [21, 108]
      ] as const)
        for (const prefs of [CAMERA_PRESETS.top, CAMERA_PRESETS.player])
          for (const hands of [false, true])
            for (const notes of [false, true]) {
              const test = layoutHarness(width, height, low, high, prefs, hands, notes);
              const geometry = test.layout();
              const camera = test.scene().keyboardCamera;
              if (!camera) throw new Error("Missing camera");
              const footprint = nativeKeyboardFootprint(camera);
              expect(footprint.height).toBeGreaterThan(0);
              expect(footprint.bottom).toBeCloseTo(
                geometry.keyboardTop + geometry.keyboardHeight,
                6
              );
              expect(footprint.bottom).toBeLessThanOrEqual(height);
              expect(footprint.top).toBeGreaterThanOrEqual(-1e-6);
              expect(test.setKeyboard.mock.lastCall?.[2]).toBe(true);
              expect(camera.params.keyboardDepthScale).toBeUndefined();
              test.dispose();
            }
  });

  it("keeps CPU/GPU surfaces and contact lanes identical after manual height and viewport fitting", () => {
    for (const prefs of [CAMERA_PRESETS.top, CAMERA_PRESETS.player])
      for (const scale of [0.6, 1, 1.8]) {
        const test = layoutHarness(667, 180, 36, 84, prefs, true);
        test.internal.placement = { ...USUAL_PLACEMENT, scale };
        test.layout();
        const scene = test.scene(),
          camera = scene.keyboardCamera;
        if (!camera) throw new Error("Missing camera");
        const gpuView = viewMatrix(camera.params),
          gpuProjection = projectionMatrix(camera.params, 667, 180);
        for (const x of [-100, 0, 100])
          for (const [y, z] of [
            [0, 0],
            [22, 0],
            [22, 149.1938],
            [34, 145.8]
          ] as const) {
            const expected = camera.project(x, y, z);
            const point = new Vector3(x, y, -z)
              .multiplyScalar(prefs.scale)
              .applyMatrix4(gpuView)
              .applyMatrix4(gpuProjection);
            expect(((point.x + 1) * 667) / 2).toBeCloseTo(expected.x, 6);
            expect(((1 - point.y) * 180) / 2).toBeCloseTo(expected.y, 6);
            expect(point.z).toBeLessThan(1);
            // The displayed keys' own note camera; the reference world joins it at contact.
            const fields = (
              test.road as unknown as {
                dock: {
                  cameras: {
                    notes: typeof camera;
                    blackLane: Parameters<typeof projectNoteLane>[1];
                    whiteLane: Parameters<typeof projectNoteLane>[1];
                  };
                };
              }
            ).dock.cameras;
            if (z > 100) {
              const contact = projectNoteLane(
                fields.notes.project(x, y, z),
                y === 34 ? fields.blackLane : fields.whiteLane
              );
              expect(contact.x).toBeCloseTo(expected.x, 6);
              expect(contact.y).toBeCloseTo(expected.y, 6);
            }
          }
        test.dispose();
      }
  });

  it("caches the fresh-camera footprint and recomputes it after reset, camera change and live-hand readiness", () => {
    const cached = vi.spyOn(framing, "naturalNativeViewHeight");
    const test = layoutHarness(1366, 768, 21, 108, CAMERA_PRESETS.player, true, false);
    Object.assign(test.view.hands, { live: false });
    test.layout();
    const before = cached.mock.calls.length;
    for (let frame = 0; frame < 60; frame++) test.internal.geometry(768);
    expect(cached).toHaveBeenCalledTimes(before);
    Object.assign(test.view.hands, { live: true });
    expect(viewLayoutChanged(test.screen, test.internal.laidOutFor, true)).toBe(true);
    const ready = test.layout();
    const readyCamera = test.scene().keyboardCamera;
    if (!readyCamera) throw new Error("Missing ready camera");
    expect(nativeKeyboardFootprint(readyCamera).bottom).toBeCloseTo(
      ready.keyboardTop + ready.keyboardHeight,
      6
    );
    test.view.setCamera({ ...CAMERA_PRESETS.player, height: 500 });
    expect(test.internal.laidOutFor.width).toBe(0);
    test.internal.placement = { ...USUAL_PLACEMENT, scale: 0.6 };
    const short = test.layout();
    test.view.setKeysPlacement(USUAL_PLACEMENT);
    const reset = test.layout();
    expect(reset.keyboardHeight).toBeGreaterThan(short.keyboardHeight);
    // Each layout measures the player's keyboard and the world's fixed reference keyboard.
    expect(cached.mock.calls.length).toBe(before + 6);
    test.dispose();
  });
});
