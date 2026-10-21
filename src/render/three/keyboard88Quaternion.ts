/** Hemisphere-corrected quaternion slerp without Three or mutable clock state. */
export function slerpKeyboard88Rotations(
  from: Float32Array,
  to: Float32Array,
  toOffset: number,
  alpha: number,
  out: Float32Array
): void {
  for (let i = 0; i < from.length; i += 4) {
    slerpKeyboard88Quaternion(from, i, to, toOffset + i, alpha, out, i);
  }
}

export function slerpKeyboard88Quaternion(
  from: Float32Array,
  fromOffset: number,
  to: Float32Array,
  toOffset: number,
  alpha: number,
  out: Float32Array,
  outOffset: number
): void {
  const i = fromOffset;
  const ax = from[i] ?? 0,
    ay = from[i + 1] ?? 0,
    az = from[i + 2] ?? 0,
    aw = from[i + 3] ?? 1;
  let bx = to[toOffset] ?? 0,
    by = to[toOffset + 1] ?? 0,
    bz = to[toOffset + 2] ?? 0,
    bw = to[toOffset + 3] ?? 1;
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) {
    dot = -dot;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let a = 1 - alpha,
    b = alpha;
  if (dot < 0.9995) {
    const theta = Math.acos(Math.min(1, dot)),
      sine = Math.sin(theta);
    a = Math.sin((1 - alpha) * theta) / sine;
    b = Math.sin(alpha * theta) / sine;
  }
  const x = a * ax + b * bx,
    y = a * ay + b * by,
    z = a * az + b * bz,
    w = a * aw + b * bw;
  const norm = Math.hypot(x, y, z, w);
  out[outOffset] = x / norm;
  out[outOffset + 1] = y / norm;
  out[outOffset + 2] = z / norm;
  out[outOffset + 3] = w / norm;
}
