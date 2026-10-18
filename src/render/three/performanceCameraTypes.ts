import type { CameraBounds, CameraPoint } from "./performanceCameraMath";
import type { PerformanceKeyboardFlight } from "./performanceKeyboardFlight";

export interface PerformanceCameraRoad {
  readonly lanes: readonly CameraPoint[];
  readonly height: number;
  readonly horizontalHeight?: number;
}
export interface PerformanceCameraGeometry {
  readonly face?: CameraPoint;
  readonly aspect?: number;
  readonly duration?: number;
  readonly bounds: CameraBounds;
  readonly avatar: CameraBounds;
  readonly obstacles: readonly CameraBounds[];
  readonly keyboard: CameraPoint;
  readonly handSpan: number;
  readonly unit: number;
  readonly top: CameraPoint;
  readonly road?: PerformanceCameraRoad;
  readonly keyboardFlight?: PerformanceKeyboardFlight;
}
export interface PerformanceCameraPose {
  readonly position: CameraPoint;
  readonly direction: CameraPoint;
  readonly up: CameraPoint;
  readonly target: CameraPoint;
  readonly noteAngle: number;
  readonly roadScale: number;
  readonly fov: number;
  readonly shot: string;
  readonly crossing: "through" | "between" | undefined;
}
export interface PerformanceCameraNode {
  readonly time: number;
  position: CameraPoint;
  readonly target: CameraPoint;
  readonly noteAngle?: number;
  readonly roadScale?: number;
  readonly velocity?: CameraPoint;
  readonly forwardRoad?: boolean;
  readonly roadNormal?: number;
  readonly bank?: number;
  readonly fov: number;
  readonly shot: string;
  readonly crossing?: "through" | "between";
}
