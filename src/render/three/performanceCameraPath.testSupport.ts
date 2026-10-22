import type { PerformanceCameraGeometry } from "./performanceCameraPath";
import { point } from "./performanceCameraMath";

/** A posed pianist, bench and keyboard in millimetres, shared by the camera route tests. */
export const geometry: PerformanceCameraGeometry = {
  bounds: { min: point(-650, -700, -200), max: point(650, 1200, 700) },
  avatar: { min: point(-200, -650, 70), max: point(200, 1200, 650) },
  obstacles: [
    { min: point(-650, -600, -200), max: point(650, 50, 0) },
    { min: point(-200, 200, 150), max: point(200, 900, 480) },
    { min: point(-110, 900, 190), max: point(110, 1200, 400) }
  ],
  keyboard: point(-100, 22, 30),
  handSpan: 352,
  unit: 1,
  keyboardFlight: {
    start: point(-650, 37, 140),
    end: point(650, 37, 140),
    targetStart: point(-100, 92, 30),
    targetEnd: point(-100, 92, 30),
    underHands: true
  },
  top: point(0, 2500, 250),
  road: {
    lanes: [
      point(-330, 22, -142),
      point(-150, 22, -142),
      point(60, 34, -142),
      point(330, 22, -142)
    ],
    height: 1900
  }
};
