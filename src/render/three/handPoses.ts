// Generated from tools/hand-rig/poses/fingers-31.json (base) and relaxed.json (lifted fingers):
// bone matrix_basis in Blender bone space, quaternions as (x, y, z, w). The rig sits at `rig`,
// a row-major Blender world matrix (Z up, keys towards +Y).

export const RIG: readonly number[] = [
  -0.926788, 0.088923, -0.364839, 0.386797, 0.357999, -0.084027, -0.929918, 0.197121, -0.11335,
  -0.992448, 0.046044, 0.801722, 0, 0, 0, 1
];

export const BASE: Readonly<
  Record<string, { readonly location: readonly number[]; readonly quaternion: readonly number[] }>
> = {
  "lowerarm02.R": {
    location: [-0.133656, -0.120231, 0.023732],
    quaternion: [-0.04831, -0.053513, -0.270309, 0.960071]
  },
  "wrist.R": { location: [0, 0, 0], quaternion: [0.007064, -0.000003, 0.174459, 0.984639] },
  "metacarpal1.R": { location: [0, 0, 0], quaternion: [0.018114, 0, 0, 0.999836] },
  "finger2-1.R": { location: [0, 0, 0], quaternion: [0.082859, 0.004102, 0.059413, 0.99478] },
  "finger2-2.R": { location: [0, 0, 0], quaternion: [0.225871, 0, 0, 0.974157] },
  "finger2-3.R": { location: [0, 0, 0], quaternion: [0.229617, 0, 0, 0.973281] },
  "metacarpal2.R": { location: [0, 0, 0], quaternion: [0, 0, 0, 1] },
  "finger3-1.R": { location: [0, 0, 0], quaternion: [0.125696, 0.00089, -0.002383, 0.992066] },
  "finger3-2.R": { location: [0, 0, 0], quaternion: [0.237448, 0, 0, 0.9714] },
  "finger3-3.R": { location: [0, 0, 0], quaternion: [0.271465, 0, 0, 0.962448] },
  "metacarpal3.R": { location: [0, 0, 0], quaternion: [0.059407, 0, 0, 0.998234] },
  "finger4-1.R": { location: [0, 0, 0], quaternion: [0.041114, -0.002007, -0.034325, 0.998563] },
  "finger4-2.R": { location: [0, 0, 0], quaternion: [0.184253, 0, 0, 0.982879] },
  "finger4-3.R": { location: [0, 0, 0], quaternion: [0.206966, 0, 0, 0.978348] },
  "metacarpal4.R": { location: [0, 0, 0], quaternion: [0.084646, 0, 0, 0.996411] },
  "finger5-1.R": { location: [0, 0, 0], quaternion: [0.078538, -0.010558, -0.096799, 0.992144] },
  "finger5-2.R": { location: [0, 0, 0], quaternion: [0.179998, 0, 0, 0.983667] },
  "finger5-3.R": { location: [0, 0, 0], quaternion: [0.133238, 0, 0, 0.991084] },
  "finger1-1.R": { location: [0, 0, 0], quaternion: [0.16678, -0.370168, 0.012579, 0.913784] },
  "finger1-2.R": { location: [0, 0, 0], quaternion: [0.027297, 0.014728, -0.067887, 0.997211] },
  "finger1-3.R": { location: [0, 0, 0], quaternion: [0.000391, 0, 0, 1] }
};

export const LIFTED: Readonly<Record<string, readonly number[]>> = {
  "finger2-1.R": [0.011061, 0.001049, 0.094403, 0.995472],
  "finger2-2.R": [0.099276, 0, 0, 0.99506],
  "finger2-3.R": [0.101138, 0, 0, 0.994872],
  "finger3-1.R": [0.046713, -0.000603, -0.012904, 0.998825],
  "finger3-2.R": [0.095827, 0, 0, 0.995398],
  "finger3-3.R": [0.110932, 0, 0, 0.993828],
  "finger4-1.R": [-0.046546, 0.003694, -0.079021, 0.995779],
  "finger4-2.R": [0.07403, 0, 0, 0.997256],
  "finger4-3.R": [0.085846, 0, 0, 0.996308],
  "finger5-1.R": [-0.025398, 0.005387, -0.207433, 0.977905],
  "finger5-2.R": [0.085974, 0, 0, 0.996297],
  "finger5-3.R": [0.058273, 0, 0, 0.998301],
  "finger1-1.R": [0.056912, -0.142175, 0.04456, 0.987199],
  "finger1-2.R": [0.138791, 0.003443, -0.00588, 0.990298],
  "finger1-3.R": [0.087522, 0.000703, -0.013943, 0.996065]
};
