"""Tone retouch of small spots that no view sees well (python -I, after bake_views.py).

retouch-targets.json: close-up view (views-fix/cameras.json) -> polygon in its pixels. The
texels visible inside the polygon get the skin around them, without their own detail (the
spot's hard edge is that detail). "Around" is measured on the surface in 3D, not in UV: spots
sit on the dorsal/palmar UV seam, where a UV blur gives each side its own island's tone.
The edge is feathered. Rewrites
bake/albedo-4096.png in place and writes bake/retouch-mask-4096.png. Run again after every
bake, then check_bake.py.
"""
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bake_views as B  # noqa: E402

GROW_MM, FEATHER_MM = 1.5, 1.5
# Depth window behind the visible surface: the bake's 3×3 min-depth test calls a thin sliver
# next to a nearer finger's outline hidden, and those were exactly the wedge's texels.
DEPTH_MM = 3.0
TONE_MM = 2.5  # gaussian over the surrounding skin, in 3D
VOXEL_MM = 0.7
MM = 10.0  # texels per mm on the 4096 map (README: ~0.1 mm per texel)


def main():
    tex = B.TEX
    inside, p, _, pos = B.texel_geometry(B.FLAT[2])
    cams = json.load(open(os.path.join(HERE, "views-fix", "cameras.json"), encoding="utf-8"))
    size = cams["pixels"]
    mask = np.zeros((tex, tex), np.uint8)
    for view, poly in json.load(open(os.path.join(HERE, "retouch-targets.json"), encoding="utf-8")).items():
        x, y, z = B.to_pixels(pos.reshape(-1, 3).astype(np.float64), cams, view)
        _, _, zbuf = B.raster(np.stack([x, y], -1).reshape(-1, 3, 2), np.zeros((len(pos), 3, 1), np.float32),
                              size, depth=z.reshape(-1, 3).astype(np.float32))
        tx, ty, tz = B.to_pixels(p, cams, view)
        ix = np.clip(np.floor(tx).astype(int), 0, size - 1)
        iy = np.clip(np.floor(ty).astype(int), 0, size - 1)
        zvis = np.where(np.isinf(zbuf), 1e9, zbuf).astype(np.float32)
        area = np.zeros((size, size), np.uint8)
        cv2.fillPoly(area, [np.array(poly, np.int32)], 1)
        hit = (tz <= zvis[iy, ix] + DEPTH_MM / 1000) & (area[iy, ix] > 0)
        hit &= (tx >= 0) & (tx < size) & (ty >= 0) & (ty < size)
        m = np.zeros(int(inside.sum()), np.uint8)
        m[hit] = 1
        layer = np.zeros((tex, tex), np.uint8)
        layer[inside] = m
        mask |= layer
        print(view, "texels", int(hit.sum()))
    r = int(GROW_MM * MM)
    mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    mask &= inside.astype(np.uint8)
    # Normalised by the island: at the UV seam the plain blur fell to ~0.5 and left half the step.
    feather = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), FEATHER_MM * MM)
    feather /= np.maximum(cv2.GaussianBlur(inside.astype(np.float32), (0, 0), FEATHER_MM * MM), 1e-6)
    feather = np.clip(feather, 0, 1) * inside

    path = os.path.join(HERE, "bake", f"albedo-{tex}.png")
    lin = B.srgb_to_linear(cv2.imread(path)[..., ::-1].astype(np.float32))
    # Voxel averages of the unmasked skin near the spots, then a gaussian over voxels.
    cols = lin[inside]
    in_mask = mask[inside] > 0
    touch = feather[inside] > 1e-3
    lo, hi = p[touch].min(0) - 4 * TONE_MM / 1000, p[touch].max(0) + 4 * TONE_MM / 1000
    near = np.all((p >= lo) & (p <= hi), axis=1)
    cell = VOXEL_MM / 1000
    shape = np.ceil((hi - lo) / cell).astype(int) + 1
    src = near & ~in_mask
    vi = np.floor((p[src] - lo) / cell).astype(int)
    flat = np.ravel_multi_index(vi.T, shape)
    acc = np.zeros((np.prod(shape), 3))
    cnt = np.zeros(np.prod(shape))
    np.add.at(acc, flat, cols[src])
    np.add.at(cnt, flat, 1)
    acc, cnt = acc.reshape(*shape, 3), cnt.reshape(shape)
    reach = int(np.ceil(2 * TONE_MM / VOXEL_MM))
    num, den = np.zeros_like(acc), np.zeros_like(cnt)
    for dx in range(-reach, reach + 1):
        for dy in range(-reach, reach + 1):
            for dz in range(-reach, reach + 1):
                g = np.exp(-((dx * dx + dy * dy + dz * dz) * VOXEL_MM ** 2) / (2 * TONE_MM ** 2))
                if g < 0.02:
                    continue
                num += g * np.roll(acc, (dx, dy, dz), (0, 1, 2))
                den += g * np.roll(cnt, (dx, dy, dz), (0, 1, 2))
    ti = np.floor((p[touch] - lo) / cell).astype(int)
    tone = num[tuple(ti.T)] / np.maximum(den[tuple(ti.T)], 1e-6)[:, None]
    f = feather[inside][touch][:, None]
    cols[touch] = cols[touch] * (1 - f) + np.clip(tone, 0, 1) * f
    out = np.zeros_like(lin)
    out[inside] = cols
    # Re-grow the padding past the island borders: grazing views of a thin island sliver sample
    # it, and the old padding kept the spot's colour.
    out = B.pad_islands(np.where(inside[..., None], out, 0).astype(np.float32), inside,
                        iterations=max(4, tex // 256))
    srgb = B.linear_to_srgb(out)
    cv2.imwrite(path, srgb[..., ::-1].astype(np.uint8))
    cv2.imwrite(os.path.join(HERE, "bake", f"retouch-mask-{tex}.png"), mask * 255)
    print("retouched texels", int(mask.sum()))


if __name__ == "__main__":
    main()
