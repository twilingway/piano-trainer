import { computerGeometry, layoutComputerKeys } from "./computerKeyboardLayout";
import type { KeysLayer } from "./ComputerKeyboardLayer";
import type { KeyRect } from "./keyboardLayout";
import type { CameraPrefs } from "./worldCamera";
import type { ViewParts, KeysPlacement } from "./viewGeometry";
import { viewGeometry } from "./viewGeometry";
import { naturalNativeViewHeight } from "./nativeKeyboardFraming";
import type { RoadLayer } from "./RoadLayer";
import type { HandsLayer } from "./HandsLayer";
import type { NotesLayer } from "./NotesLayer";
import type { HudLayer } from "./HudLayer";
import { publishOverlayLayout } from "./viewOverlayLayout";

/** Layout-only composition; cached dimensions are returned for the existing frame path. */
export function layoutFallingKeyboard(options: {
  readonly screen: { readonly width: number; readonly height: number };
  readonly total: number;
  readonly keys: Map<number, KeyRect>;
  readonly prefs: CameraPrefs;
  readonly native: boolean;
  readonly overhead: boolean;
  readonly computer: boolean;
  readonly parts: ViewParts;
  readonly placement: KeysPlacement;
  readonly labels: boolean;
  readonly fits: boolean;
  readonly keysLayer: KeysLayer | undefined;
  readonly hands: Pick<HandsLayer, "reset" | "live">;
  readonly notes: Pick<NotesLayer, "layout"> | undefined;
  readonly road: RoadLayer | undefined;
  readonly roadMode: boolean;
  readonly hud: Pick<HudLayer, "layout">;
  readonly hudTop: number;
  readonly host: HTMLElement | null;
}) {
  const { screen, total, parts, placement, native, computer, road, roadMode } = options;
  const whiteWidth = [...options.keys.values()].find((key) => !key.black)?.width ?? 0;
  const layoutParts = native && options.hands.live ? { ...parts, hands: false } : parts;
  const flat = computer
    ? computerGeometry(screen.height, total, parts, placement)
    : viewGeometry(screen.height, whiteWidth, layoutParts, options.labels, options.fits, placement);
  const nativeHeight =
    native && parts.keys
      ? naturalNativeViewHeight(
          screen,
          total,
          options.prefs,
          options.keys,
          options.overhead,
          placement.lift,
          parts.hands && !options.hands.live ? flat : undefined
        )
      : undefined;
  const geometry =
    nativeHeight === undefined
      ? flat
      : viewGeometry(
          screen.height,
          whiteWidth,
          layoutParts,
          options.labels,
          options.fits,
          placement,
          nativeHeight
        );
  const keys = computer ? layoutComputerKeys(total, geometry).keys : options.keys;
  options.keysLayer?.layout(keys, geometry, total);
  options.hands.reset();
  options.notes?.layout(computer ? new Map() : keys, geometry.hitY, total);
  const floor = parts.keys ? screen.height * placement.lift : 0;
  const bottom = geometry.keyboardTop + geometry.keyboardHeight;
  const handRoom = parts.hands && !options.hands.live ? screen.height - floor - bottom : 0;
  road?.layoutView(
    keys,
    geometry,
    total,
    { width: screen.width, height: screen.height, floor, handRoom },
    !parts.hands || native,
    native ? placement.scale : undefined,
    computer,
    roadMode
  );
  const hitLine = roadMode && road ? road.hitLineY : geometry.hitY;
  options.hud.layout(screen.width, hitLine, options.hudTop);
  publishOverlayLayout(options.host, hitLine, bottom, options.hudTop);
  return { keys, nativeHeight, keysFloor: screen.height - bottom };
}
