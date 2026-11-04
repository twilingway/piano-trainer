import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { ExtrudeGeometry, Float32BufferAttribute, Shape } from "three";
import { isBlackKey } from "../../fingering/fingering";
import {
  KEYBOARD_BLACK_FRONT,
  KEYBOARD_BLACK_WIDTH,
  KEYBOARD_WHITE_WIDTH,
  metricKeyX
} from "../keyboardMetrics";
import type { KeyBox } from "./keyBoxes";

/** An authored low-poly clay key. Metric centres and the top contact plane never move. */
export function clayKeyGeometry(box: KeyBox): ExtrudeGeometry {
  const radius = box.black ? 2.1 : 3.2;
  const half = (box.black ? box.width : KEYBOARD_WHITE_WIDTH) / 2;
  const left = -half + radius,
    right = half - radius;
  const front = box.front + radius,
    back = box.back - radius;
  let neckLeft = left,
    neckRight = right;
  if (!box.black) {
    if (box.pitch > 21 && isBlackKey(box.pitch - 1))
      neckLeft =
        metricKeyX(box.pitch - 1) -
        metricKeyX(box.pitch) +
        KEYBOARD_BLACK_WIDTH / 2 +
        0.65 +
        radius;
    if (box.pitch < 108 && isBlackKey(box.pitch + 1))
      neckRight =
        metricKeyX(box.pitch + 1) -
        metricKeyX(box.pitch) -
        KEYBOARD_BLACK_WIDTH / 2 -
        0.65 -
        radius;
  }
  const shoulder = KEYBOARD_BLACK_FRONT - radius - 0.8;
  const points: [number, number][] = [];
  const outline = {
    moveTo: (x: number, y: number) => points.push([x, y]),
    lineTo: (x: number, y: number) => points.push([x, y])
  };
  outline.moveTo(left, front);
  outline.lineTo(right, front);
  if (!box.black && neckRight < right) {
    outline.lineTo(right, shoulder);
    outline.lineTo(neckRight, shoulder);
  }
  outline.lineTo(neckRight, back);
  outline.lineTo(neckLeft, back);
  if (!box.black && neckLeft > left) {
    outline.lineTo(neckLeft, shoulder);
    outline.lineTo(left, shoulder);
  }
  outline.lineTo(left, front);
  points.pop();
  const shape = new Shape();
  for (let i = 0; i < points.length; i++) {
    const at = points[i]!,
      before = points[(i + points.length - 1) % points.length]!,
      after = points[(i + 1) % points.length]!;
    const leftLength = Math.hypot(before[0] - at[0], before[1] - at[1]);
    const rightLength = Math.hypot(after[0] - at[0], after[1] - at[1]);
    const corner = Math.min(1.8, leftLength * 0.24, rightLength * 0.24);
    const x = at[0] + ((before[0] - at[0]) * corner) / leftLength;
    const y = at[1] + ((before[1] - at[1]) * corner) / leftLength;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
    shape.quadraticCurveTo(
      at[0],
      at[1],
      at[0] + ((after[0] - at[0]) * corner) / rightLength,
      at[1] + ((after[1] - at[1]) * corner) / rightLength
    );
  }
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: box.top - box.bottom - 2 * radius,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelThickness: radius,
    bevelSize: radius,
    curveSegments: 3
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, box.bottom - 22 + radius, 0);
  const position = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const paint = new Float32Array(position.count * 2);
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i++) {
    const u = position.getX(i) / (half * 2) + 0.5;
    const v = (-position.getZ(i) - box.front) / (box.back - box.front);
    paint[i * 2] = box.uv.u0 + u * (box.uv.u1 - box.uv.u0);
    paint[i * 2 + 1] = box.uv.v1 - v * (box.uv.v1 - box.uv.v0);
    uv.setXY(i, position.getX(i) / 40, -position.getZ(i) / 40);
  }
  geometry.setAttribute("keyPaintUv", new Float32BufferAttribute(paint, 2));
  // Only the upward cap carries the original labels; the underside stays an unpainted body.
  geometry.clearGroups();
  let start = 0,
    previous = normals.getY(0) > 0.99 ? 0 : 1;
  for (let i = 3; i <= position.count; i += 3) {
    const material = i < position.count && normals.getY(i) > 0.99 ? 0 : 1;
    if (i === position.count || material !== previous) {
      geometry.addGroup(start, i - start, previous);
      start = i;
      previous = material;
    }
  }
  // ExtrudeGeometry splits triangle normals. Weld only equal attributes before averaging so the
  // rounded clay edge has a soft surface, while paint UVs and top/body material groups survive.
  geometry.deleteAttribute("normal");
  const welded = mergeVertices(geometry, 0.0001);
  welded.computeVertexNormals();
  const smooth = welded.toNonIndexed();
  geometry.copy(smooth);
  smooth.dispose();
  welded.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
