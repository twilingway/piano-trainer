import type { Finger } from "../../../fingering/fingering";

// The rig's hand as a mechanism (tools/hand-rig/hand_mech.py): rigid phalanges, hinge joints whose
// limits are walls. Lengths in mm in the hand frame of a RIGHT hand: x towards the little finger, y
// forward along the middle finger, z out of the back of the hand, the wrist's head at the origin. A
// left hand is solved mirrored (x -> -x on the keys), so one code path serves both.

export type Vec3 = readonly [number, number, number];
export type LongFinger = 2 | 3 | 4 | 5;
export type Range = readonly [number, number];
export type JointKey = "mcp" | "pip" | "dip" | "abd";
export type ThumbKey = "cmc_radial" | "cmc_palmar" | "t_mcp" | "t_ip";
export type FingerAngles = Readonly<Record<JointKey, number>>;
export type ThumbAngles = Readonly<Record<ThumbKey, number>>;
/** Explicit joint angles, degrees: the thumb's CMC, MCP and IP; MCP, PIP, DIP and spread of the rest. */
export type Angles = { readonly 1: ThumbAngles } & Readonly<Record<LongFinger, FingerAngles>>;
/** Per finger additions to its angles (the press and hover layers). */
export type AngleDelta = Readonly<
  Partial<Record<Finger, Readonly<Partial<Record<JointKey | ThumbKey, number>>>>>
>;
/** yaw, pitch, roll (degrees) and the wrist's place (mm): + yaw = fingers to the treble. */
export type Root = readonly [number, number, number, number, number, number];

export const FINGERS: readonly Finger[] = [1, 2, 3, 4, 5];
export const LONG: readonly LongFinger[] = [2, 3, 4, 5];
export const THUMB_KEYS: readonly ThumbKey[] = ["cmc_radial", "cmc_palmar", "t_mcp", "t_ip"];

/** Phalanx radius, mm. */
export const R_FINGER: Readonly<Record<Finger, number>> = { 1: 10.5, 2: 9, 3: 9, 4: 8.5, 5: 7.5 };
export const THUMB_RADIAL_MAX = 90;
export const THUMB_PALMAR_MAX = 45;
export const THUMB_RADIAL_MIN = -10;
export const THUMB_PALMAR_MIN = -15;
/** Flexion limits, degrees. */
export const LIM: Readonly<Record<"mcp" | "pip" | "dip" | "t_mcp" | "t_ip", Range>> = {
  mcp: [-20, 90],
  pip: [0, 110],
  dip: [0, 80],
  t_mcp: [-10, 60],
  t_ip: [-15, 80]
};
/** Spread at MCP, degrees, + towards the thumb. */
export const ABD: Readonly<Record<LongFinger, Range>> = {
  2: [-15, 30],
  3: [-20, 20],
  4: [-25, 15],
  5: [-45, 15]
};
/** How a finger shares its bend between MCP, PIP and DIP (the side video's medians). */
export const BEND_SPLIT: Readonly<Record<LongFinger, Vec3>> = {
  2: [30, 24, 18],
  3: [17, 26, 24],
  4: [19, 30, 21],
  5: [44, 17, 18]
};

export const WHITE_W = 23.5;
export const BLACK_TOP = 12;
/** Mm into the keys: the black keys' front edge; their width (piano_kit.py's). */
export const BLACK_FRONT = 55;
export const BLACK_W = 13.7;
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
/** Whites with a black key between them and the next white. */
const BLACK_AFTER = [0, 2, 5, 7, 9];
/** A pressing tip's axis off its key's centre line, mm: white, black. */
const CONTACT_X = { white: 6, black: 3 } as const;
/** Mm into the keys: a white key short of the blacks, and between them when the hand cannot. */
const CONTACT_Y = { white: [15, 55], black: [60, 125] } as const;
const CONTACT_Y_DEEP = { white: [15, 110], black: [60, 125] } as const;
/** Of the finger's radius: the tip's axis over the key top. */
export const TIP_ABOVE = 0.8;
/** Mm: a free finger's joints over the key top, past TIP_ABOVE. */
export const CLEAR = 2;
/** Mm: a key's travel, the press layer. */
export const KEY_DIP = 10;
export const MISS_MM = 6;
export const K_BAND: Range = [0.85, 1.15];
export const YAW_TOL = 5;
export const AIM_PASSES = 3;
/** Deg off palm-down, + = thumb down. */
export const ROLL: Range = [-180, 20];
/** Deg, + = fingers down. */
export const PITCH: Range = [-45, 60];
/** Mm over the white top: the seated pianist's wrist. */
export const WRIST_Z = 40;
/** Reference pose among those that touch: (value, sigma) or sigma. */
export const REF = {
  pitch: [10, 15],
  roll: [-10, 15],
  yaw: 3,
  wrist: 20,
  curl: [1, 0.3],
  k: 0.1,
  spread: 5
} as const;
export const REF_W = 0.1;
/** The MediaPipe joints of each finger: its MCP (the thumb's CMC side), then towards the tip. */
export const CHAIN: Readonly<Record<Finger, readonly [number, number, number, number]>> = {
  1: [1, 2, 3, 4],
  2: [5, 6, 7, 8],
  3: [9, 10, 11, 12],
  4: [13, 14, 15, 16],
  5: [17, 18, 19, 20]
};

/** The solver's rest of one hand: MCP heads, phalanx lengths, the neutral and thumb directions. */
export interface Rest {
  readonly mcp: Readonly<Record<Finger, Vec3>>;
  readonly len: Readonly<Record<Finger, Vec3>>;
  readonly neutral: Vec3;
  /** The thumb's own first phalanx at rest, a unit vector: its heading and its dip below the palm. */
  readonly thumb: Vec3;
}

export const at = <T>(list: readonly T[], i: number): T => {
  const v = list[i];
  if (v === undefined) throw new Error(`index ${String(i)} out of ${String(list.length)}`);
  return v;
};
export const rad = (deg: number) => (deg * Math.PI) / 180;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Mat3 = readonly [Vec3, Vec3, Vec3];

function rot(axis: "x" | "y" | "z", a: number): Mat3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  if (axis === "x")
    return [
      [1, 0, 0],
      [0, c, -s],
      [0, s, c]
    ];
  if (axis === "y")
    return [
      [c, 0, s],
      [0, 1, 0],
      [-s, 0, c]
    ];
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1]
  ];
}

const apply = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
];

function mul(a: Mat3, b: Mat3): Mat3 {
  const row = (r: Vec3): Vec3 => [
    r[0] * b[0][0] + r[1] * b[1][0] + r[2] * b[2][0],
    r[0] * b[0][1] + r[1] * b[1][1] + r[2] * b[2][1],
    r[0] * b[0][2] + r[1] * b[1][2] + r[2] * b[2][2]
  ];
  return [row(a[0]), row(a[1]), row(a[2])];
}

/** The hand's turn for a root: yaw about z, pitch about x, roll about y, as hand_joints has it. */
export function rootRotation(root: Root): Mat3 {
  return mul(mul(rot("z", -rad(root[0])), rot("x", -rad(root[1]))), rot("y", -rad(root[2])));
}

/** The 21 MediaPipe joints of the rig hand, world mm, for explicit angles and a root. */
export function handJoints(rest: Rest, ang: Angles, root: Root): Vec3[] {
  const P: Vec3[] = Array.from({ length: 21 }, (): Vec3 => [0, 0, 0]);
  for (const f of LONG) {
    const a = ang[f];
    const m = rad(a.mcp);
    const p = rad(a.pip);
    const d = rad(a.dip);
    const dirn = apply(rot("z", rad(a.abd)), rest.neutral);
    let q = rest.mcp[f];
    const chain = CHAIN[f];
    P[chain[0]] = q;
    const heads = [-m, -m - p, -m - p - d];
    for (let j = 0; j < 3; j++) {
      const L = rest.len[f][j as 0 | 1 | 2];
      const h = at(heads, j);
      const c = Math.cos(h);
      const s = Math.sin(h);
      q = [q[0] + L * c * dirn[0], q[1] + L * c * dirn[1], q[2] + L * (c * dirn[2] + s)];
      P[at(chain, j + 1)] = q;
    }
  }
  const t = ang[1];
  // The CMC turns the thumb from its own rest, not from the index finger's direction.
  const [ox, oy, oz] = rest.thumb;
  const flat = Math.hypot(ox, oy);
  const pl = rad(t.cmc_palmar) + Math.atan2(-oz, flat);
  const tm = rad(t.t_mcp);
  const ti = rad(t.t_ip);
  // A flat direction is taken as given, as the Python solver takes the index direction.
  const scale = oz === 0 ? 1 : 1 / flat;
  const fl = apply(rot("z", rad(t.cmc_radial)), [ox * scale, oy * scale, 0]);
  const u: Vec3 = [Math.cos(pl) * fl[0], Math.cos(pl) * fl[1], Math.cos(pl) * fl[2] - Math.sin(pl)];
  const w = apply(rot("z", -Math.PI / 2), fl);
  let q = rest.mcp[1];
  P[1] = q;
  const heads = [0, tm, tm + ti];
  for (let j = 0; j < 3; j++) {
    const L = rest.len[1][j as 0 | 1 | 2];
    const c = Math.cos(at(heads, j));
    const s = Math.sin(at(heads, j));
    q = [
      q[0] + L * (c * u[0] + s * w[0]),
      q[1] + L * (c * u[1] + s * w[1]),
      q[2] + L * (c * u[2] + s * w[2])
    ];
    P[2 + j] = q;
  }
  const R = rootRotation(root);
  return P.map((v) => {
    const r = apply(R, v);
    return [r[0] + root[3], r[1] + root[4], r[2] + root[5]];
  });
}

/** A finger's tip: the last joint of its chain. */
export const tipOf = (X: readonly Vec3[], f: Finger): Vec3 => at(X, CHAIN[f][3]);

/** The largest curl of finger f that keeps MCP, PIP and DIP inside their walls. */
export function curlMax(f: LongFinger): number {
  const b = BEND_SPLIT[f];
  return Math.min(LIM.mcp[1] / b[0], LIM.pip[1] / b[1], LIM.dip[1] / b[2]);
}

/** The k with lo <= v * k <= hi for every (v, (lo, hi)), inside band. */
export function kRange(
  vals: readonly number[],
  lims: readonly Range[],
  band: Range = K_BAND
): Range {
  let [lo, hi] = band;
  vals.forEach((v, i) => {
    if (Math.abs(v) <= 1e-9) return;
    const [a, b] = at(lims, i);
    const k1 = Math.min(a / v, b / v);
    const k2 = Math.max(a / v, b / v);
    lo = Math.max(lo, k1);
    hi = Math.min(hi, k2);
  });
  return [lo, hi];
}

export interface Shape {
  readonly fingers: Readonly<
    Record<"2" | "3" | "4" | "5", { readonly abd: number; readonly rel: number }>
  >;
  readonly thumb: ThumbAngles;
}

/** A finger's spread: a number, or the thumb's CMC (radial, palmar). */
export type Spread = number | readonly [number, number];

/** Explicit angles from a shape, the hand's curl and per finger k, spread and lift (free fingers). */
export function angles(
  shape: Shape,
  curl: number,
  k: Readonly<Partial<Record<Finger, number>>> = {},
  spread: Readonly<Partial<Record<Finger, Spread>>> = {},
  lift: Readonly<Partial<Record<Finger, number>>> = {}
): Angles {
  const finger = (f: LongFinger): FingerAngles => {
    const s = shape.fingers[String(f) as "2"];
    const c = curl * s.rel * (k[f] ?? 1);
    const b = BEND_SPLIT[f];
    const sp = spread[f];
    return {
      mcp: b[0] * c - (lift[f] ?? 0),
      pip: b[1] * c,
      dip: b[2] * c,
      abd: typeof sp === "number" ? sp : s.abd
    };
  };
  const th = shape.thumb;
  const sp = spread[1];
  let cmcRadial = th.cmc_radial;
  let cmcPalmar = th.cmc_palmar;
  if (Array.isArray(sp)) [cmcRadial, cmcPalmar] = sp as readonly [number, number];
  else if (typeof sp === "number") cmcRadial = sp;
  return {
    1: {
      cmc_radial: cmcRadial,
      cmc_palmar: cmcPalmar - (lift[1] ?? 0),
      t_mcp: th.t_mcp * (k[1] ?? 1),
      t_ip: th.t_ip * (k[1] ?? 1)
    },
    2: finger(2),
    3: finger(3),
    4: finger(4),
    5: finger(5)
  };
}

/** Angles with per finger deltas added. */
export function addAngles(ang: Angles, delta: AngleDelta): Angles {
  const out = {
    1: { ...ang[1] },
    2: { ...ang[2] },
    3: { ...ang[3] },
    4: { ...ang[4] },
    5: { ...ang[5] }
  } as Record<Finger, Record<string, number>>;
  for (const f of FINGERS) {
    const d = delta[f];
    if (!d) continue;
    for (const [key, v] of Object.entries(d)) out[f][key] = (out[f][key] ?? 0) + v;
  }
  return out as unknown as Angles;
}

export const isBlack = (pitch: number) => !WHITE_PCS.includes(((pitch % 12) + 12) % 12);

/** A key's centre across the keyboard in white keys from C4's centre. */
export function whitePosition(pitch: number): number {
  const octave = Math.floor((pitch - 60) / 12);
  const pc = pitch - 60 - octave * 12;
  const black = !WHITE_PCS.includes(pc);
  return octave * 7 + WHITE_PCS.indexOf(black ? pc - 1 : pc) + (black ? 0.5 : 0);
}

/** The key under a point of the keys' plane (x mirrored for a left hand) and its top. */
export function keyUnder(
  x: number,
  y: number,
  mirror: boolean
): { readonly pitch: number; readonly top: number } {
  const u = (mirror ? -x : x) / WHITE_W;
  const white = (w: number) => {
    const octave = Math.floor(w / 7);
    return 60 + octave * 12 + at(WHITE_PCS, w - octave * 7);
  };
  const b = Math.floor(u);
  const over =
    y >= BLACK_FRONT &&
    BLACK_AFTER.includes(at(WHITE_PCS, ((b % 7) + 7) % 7)) &&
    Math.abs(u - b - 0.5) * WHITE_W <= BLACK_W / 2;
  return over ? { pitch: white(b) + 1, top: BLACK_TOP } : { pitch: white(Math.round(u)), top: 0 };
}

/** The key top under a point of the keys' plane (x mirrored for a left hand): a black key's or the white. */
export const keyTop = (x: number, y: number, mirror: boolean): number => keyUnder(x, y, mirror).top;

export interface KeyTarget {
  readonly pitch: number;
  readonly finger: Finger;
  readonly black: boolean;
  readonly x: number;
  readonly dx: number;
  readonly y: Range;
  readonly z: number;
}

/** Where a pressing tip's axis goes on its key: a box across x and y, a height z. */
export function keyTarget(pitch: number, finger: Finger, mirror: boolean, deep = false): KeyTarget {
  const black = isBlack(pitch);
  const x = whitePosition(pitch) * WHITE_W;
  const side = black ? "black" : "white";
  return {
    pitch,
    finger,
    black,
    x: mirror ? -x : x,
    dx: CONTACT_X[side],
    y: (deep ? CONTACT_Y_DEEP : CONTACT_Y)[side],
    z: R_FINGER[finger] * TIP_ABOVE + (black ? BLACK_TOP : 0)
  };
}

/** The tip's miss of its target box, mm, as a vector (zero inside). */
export function contact(tip: Vec3, t: KeyTarget): Vec3 {
  const dx = tip[0] - t.x;
  const [lo, hi] = t.y;
  return [dx - clamp(dx, -t.dx, t.dx), tip[1] - clamp(tip[1], lo, hi), tip[2] - t.z];
}

export const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

/** Joints and roll outside their walls (must be empty). */
export function violations(ang: Angles, root: Root): string[] {
  const bad: string[] = [];
  const out = (name: string, v: number, [lo, hi]: Range) => {
    if (!(lo - 0.05 <= v && v <= hi + 0.05)) bad.push(`${name} ${v.toFixed(1)}`);
  };
  for (const f of LONG) {
    for (const k of ["mcp", "pip", "dip"] as const) out(`${String(f)}.${k}`, ang[f][k], LIM[k]);
    out(`${String(f)}.abd`, ang[f].abd, ABD[f]);
  }
  const t = ang[1];
  out("1.t_mcp", t.t_mcp, LIM.t_mcp);
  out("1.t_ip", t.t_ip, LIM.t_ip);
  out("1.cmc_radial", t.cmc_radial, [THUMB_RADIAL_MIN, THUMB_RADIAL_MAX]);
  out("1.cmc_palmar", t.cmc_palmar, [THUMB_PALMAR_MIN, THUMB_PALMAR_MAX]);
  out("roll", root[2], ROLL);
  return bad;
}

/** Oriented flexion plane, continuous through a straight or slightly extended joint. */
export function fingerPlane(rest: Rest, ang: Angles, root: Root, f: Finger): Vec3 {
  const bend = f === 1 ? { 1: { t_mcp: 30 - ang[1].t_mcp } } : { [f]: { pip: 30 - ang[f].pip } };
  const X = handJoints(rest, addAngles(ang, bend), root),
    c = CHAIN[f];
  const a = at(X, c[0]),
    b = at(X, c[1]),
    d = at(X, c[2]);
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
    v: Vec3 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n),
    sign = f === 1 ? 1 : -1;
  return [(sign * n[0]) / length, (sign * n[1]) / length, (sign * n[2]) / length];
}
