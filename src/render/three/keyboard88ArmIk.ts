/** Pure metric two-bone IK. All inputs, outputs and scratch are reused between calls. */
export interface ArmVector {
  x: number;
  y: number;
  z: number;
}
export interface ArmRotation extends ArmVector {
  w: number;
}
export interface Keyboard88ArmPose {
  shoulder: ArmVector;
  elbow: ArmVector;
  wrist: ArmVector;
  parentRotation: ArmRotation;
  shoulderRotation: ArmRotation;
  elbowRotation: ArmRotation;
}
export interface Keyboard88ArmTarget {
  position: ArmVector;
  rotation: ArmRotation;
  pole: ArmVector;
}
export const armVector = (): ArmVector => ({ x: 0, y: 0, z: 0 });
export const armRotation = (): ArmRotation => ({ x: 0, y: 0, z: 0, w: 1 });

function subtract(out: ArmVector, a: ArmVector, b: ArmVector): void {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
}
function length(v: ArmVector): number {
  return Math.hypot(v.x, v.y, v.z);
}
function normalize(v: ArmVector): void {
  const n = length(v);
  if (n > 0) {
    v.x /= n;
    v.y /= n;
    v.z /= n;
  }
}
function multiply(out: ArmRotation, a: ArmRotation, b: ArmRotation): void {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  const n = Math.hypot(x, y, z, w);
  out.x = x / n;
  out.y = y / n;
  out.z = z / n;
  out.w = w / n;
}
function inverse(out: ArmRotation, q: ArmRotation): void {
  out.x = -q.x;
  out.y = -q.y;
  out.z = -q.z;
  out.w = q.w;
}
function rotate(out: ArmVector, q: ArmRotation, v: ArmVector): void {
  const tx = 2 * (q.y * v.z - q.z * v.y),
    ty = 2 * (q.z * v.x - q.x * v.z),
    tz = 2 * (q.x * v.y - q.y * v.x);
  const x = v.x + q.w * tx + q.y * tz - q.z * ty;
  const y = v.y + q.w * ty + q.z * tx - q.x * tz;
  const z = v.z + q.w * tz + q.x * ty - q.y * tx;
  out.x = x;
  out.y = y;
  out.z = z;
}
function aim(out: ArmRotation, from: ArmVector, to: ArmVector): void {
  normalize(from);
  normalize(to);
  const dot = from.x * to.x + from.y * to.y + from.z * to.z;
  let x = from.y * to.z - from.z * to.y,
    y = from.z * to.x - from.x * to.z;
  let z = from.x * to.y - from.y * to.x,
    w = 1 + dot;
  if (w < 1e-12) {
    if (Math.abs(from.x) > Math.abs(from.z)) {
      x = -from.y;
      y = from.x;
      z = 0;
    } else {
      x = 0;
      y = -from.z;
      z = from.y;
    }
    w = 0;
  }
  const n = Math.hypot(x, y, z, w);
  out.x = x / n;
  out.y = y / n;
  out.z = z / n;
  out.w = w / n;
}

export class Keyboard88ArmIk {
  readonly shoulder = armRotation();
  readonly elbow = armRotation();
  readonly wrist = armRotation();
  readonly reached = armVector();
  private readonly direction = armVector();
  private readonly plane = armVector();
  private readonly wantedElbow = armVector();
  private readonly upper = armVector();
  private readonly lower = armVector();
  private readonly wanted = armVector();
  private readonly delta = armRotation();
  private readonly upperWorld = armRotation();
  private readonly lowerWorld = armRotation();
  private readonly inv = armRotation();

  /** False means the target was clamped to the reachable annulus; lengths never change. */
  solve(pose: Keyboard88ArmPose, target: Keyboard88ArmTarget): boolean {
    subtract(this.upper, pose.elbow, pose.shoulder);
    subtract(this.lower, pose.wrist, pose.elbow);
    const a = length(this.upper),
      b = length(this.lower);
    subtract(this.direction, target.position, pose.shoulder);
    const requested = length(this.direction);
    if (requested < 1e-12) {
      this.direction.x = 1;
      this.direction.y = 0;
      this.direction.z = 0;
    } else normalize(this.direction);
    const distance = Math.max(Math.abs(a - b), Math.min(a + b, requested));
    const d = Math.max(distance, 1e-12);
    const along = (a * a - b * b + distance * distance) / (2 * d);
    const dot =
      target.pole.x * this.direction.x +
      target.pole.y * this.direction.y +
      target.pole.z * this.direction.z;
    this.plane.x = target.pole.x - dot * this.direction.x;
    this.plane.y = target.pole.y - dot * this.direction.y;
    this.plane.z = target.pole.z - dot * this.direction.z;
    if (length(this.plane) < 1e-10) {
      if (Math.abs(this.direction.y) < 0.9) {
        this.plane.x = -this.direction.z;
        this.plane.y = 0;
        this.plane.z = this.direction.x;
      } else {
        this.plane.x = this.direction.y;
        this.plane.y = -this.direction.x;
        this.plane.z = 0;
      }
    }
    normalize(this.plane);
    const height = Math.sqrt(Math.max(0, a * a - along * along));
    this.wantedElbow.x = pose.shoulder.x + along * this.direction.x + height * this.plane.x;
    this.wantedElbow.y = pose.shoulder.y + along * this.direction.y + height * this.plane.y;
    this.wantedElbow.z = pose.shoulder.z + along * this.direction.z + height * this.plane.z;
    this.reached.x = pose.shoulder.x + distance * this.direction.x;
    this.reached.y = pose.shoulder.y + distance * this.direction.y;
    this.reached.z = pose.shoulder.z + distance * this.direction.z;
    subtract(this.wanted, this.wantedElbow, pose.shoulder);
    aim(this.delta, this.upper, this.wanted);
    multiply(this.upperWorld, this.delta, pose.shoulderRotation);
    multiply(this.lowerWorld, this.delta, pose.elbowRotation);
    rotate(this.lower, this.delta, this.lower);
    subtract(this.wanted, this.reached, this.wantedElbow);
    aim(this.delta, this.lower, this.wanted);
    multiply(this.lowerWorld, this.delta, this.lowerWorld);
    inverse(this.inv, pose.parentRotation);
    multiply(this.shoulder, this.inv, this.upperWorld);
    inverse(this.inv, this.upperWorld);
    multiply(this.elbow, this.inv, this.lowerWorld);
    inverse(this.inv, this.lowerWorld);
    multiply(this.wrist, this.inv, target.rotation);
    return Math.abs(requested - distance) < 1e-7;
  }
}
