export interface NativeNoteLabelLayout {
  fingerWidth: number;
  fingerHeight: number;
  fingerY: number;
  nameWidth: number;
  nameHeight: number;
  nameY: number;
}

// The atlas's 80px font occupies a 128px-high cell; these caps mean 24px/16px font sizes.
const FINGER_HEIGHT = 24 * (128 / 80);
const NAME_HEIGHT = 16 * (128 / 80);
const BODY_SHARE = 0.82;

export const NATIVE_NOTE_LABEL_LAYOUT_SHADER = /* glsl */ `
vec4 captionStack(float width, float height, vec2 aspects) {
  float usableWidth = max(0.0, width * ${String(BODY_SHARE)});
  float finger = aspects.x > 0.0 ? min(${String(FINGER_HEIGHT)}, usableWidth / aspects.x) : 0.0;
  float name = aspects.y > 0.0 ? min(${String(NAME_HEIGHT)}, usableWidth / aspects.y) : 0.0;
  float gap = aspects.x > 0.0 && aspects.y > 0.0 ? min(2.0, width * 0.06) : 0.0;
  float fit = min(1.0, max(0.0, height * ${String(BODY_SHARE)}) / max(finger + name + gap, 0.000001));
  return vec4(finger, name, gap, finger + name + gap) * fit;
}
`;

/** Pixel-space sizing preserves glyph aspect even when the physical lane is seen edge-on. */
export function nativeNoteLabelLayout(
  width: number,
  height: number,
  fingerAspect: number,
  nameAspect: number,
  target: NativeNoteLabelLayout
): void {
  const hasFinger = Number.isFinite(fingerAspect) && fingerAspect > 0;
  const hasName = Number.isFinite(nameAspect) && nameAspect > 0;
  const usableWidth = Math.max(0, width * BODY_SHARE);
  const finger = hasFinger ? Math.min(FINGER_HEIGHT, usableWidth / fingerAspect) : 0;
  const name = hasName ? Math.min(NAME_HEIGHT, usableWidth / nameAspect) : 0;
  const gap = hasFinger && hasName ? Math.min(2, width * 0.06) : 0;
  const scale = Math.min(
    1,
    Math.max(0, height * BODY_SHARE) / Math.max(finger + name + gap, 0.000001)
  );
  target.fingerHeight = finger * scale;
  target.fingerWidth = target.fingerHeight * (hasFinger ? fingerAspect : 0);
  target.nameHeight = name * scale;
  target.nameWidth = target.nameHeight * (hasName ? nameAspect : 0);
  target.fingerY = hasName ? -(target.nameHeight + gap * scale) / 2 : 0;
  target.nameY = hasFinger ? (target.fingerHeight + gap * scale) / 2 : 0;
}
