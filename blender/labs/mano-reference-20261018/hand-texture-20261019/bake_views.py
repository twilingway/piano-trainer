"""Project the aligned Codex views onto the hand and bake them into the arm UV (python -I).

Inputs: subdiv-hand.npz (export_subdiv.py), views/cameras.json, generated-aligned/<view>.png.
Per texel: 3D point and normal on the subdivided surface; per view: orthographic projection,
visibility against the view's depth buffer, weight = cos(normal, view)^POWER times a fade
near the silhouette edge. Colours are blended in linear light; every blur of the blend runs
over the surface in 3D (Surface), so it ignores the UV layout.
Output: bake/albedo-4096.png (UV islands padded), bake/weights-<view>.png,
bake/dominant-view.png (which view wins each texel), bake/coverage.png.
"""

import json
import os

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
# view -> (render dir with cameras.json and masks, aligned Codex images, subdivided pose).
# The spread pose has the same faces, so its views bake into the same UV.
FLAT = ("views", "generated-aligned", "subdiv-hand.npz")
SPREAD = ("views-spread", "generated-spread-aligned", "subdiv-spread.npz")
# Touch-ups: a close-up render of the current texture, edited by Codex inside an edit mask
# (render_fix_view.py); projected back with top priority inside that mask only.
FIX = ("views-fix", "generated-fix", "subdiv-hand.npz")
FIX_WEIGHT = 1000.0  # spot close-ups outrank the wide seam views where both edited a texel
FIX_FADE_PX = 40.0  # edit-mask feather in close-up pixels (0.06 mm each)
# Seam pass: wide views (13 cm frame, seam_targets.py), Codex repainted the seam masks
# (seam_mask.py, seam_edits.py); same top priority, feather in 0.13 mm pixels.
SEAM = ("views-seam", "generated-seam", "subdiv-hand.npz")
SEAM_FADE_PX = 12.0
SEAM_WEIGHT = 100.0
TOUCH = (FIX, SEAM)
SPECS = {
    "dorsal": FLAT, "palmar": FLAT, "thumb-side": FLAT, "little-side": FLAT, "fingertips": FLAT,
    "dorsal-thumb": SPREAD, "dorsal-little": SPREAD, "palmar-thumb": SPREAD, "palmar-little": SPREAD,
    "fix-thumb-nail": FIX,
    # nail_edits.py NAIL_SET=top masks: straight-down close-ups, the free edge on the tip outline
    # (the tilted fix-<finger>-nail ones left 3-4 mm of skin before the nail).
    **{f"fix-{f}-nail-top": FIX for f in ("index", "middle", "ring", "little")},
    # Seam masks of seam_edits.py (EDIT_DIR=views-fix) on spot close-ups the user pointed at.
    "fix-index-thumb-side": FIX, "fix-middle-ring-web-thumb": FIX, "fix-middle-ring-web-little": FIX,
    **{f"seam-{v}": SEAM for v in ("dorsal", "palmar", "dorsal-thumb", "dorsal-little", "palmar-thumb",
                                   "palmar-little", "thumb-dorsal", "thumb-palmar")},
}
VIEWS = list(SPECS)
COLORS = {  # BGR, for the dominant-view map
    "dorsal": (60, 60, 230), "palmar": (60, 200, 60), "thumb-side": (230, 120, 40),
    "little-side": (40, 200, 230), "fingertips": (200, 60, 200),
    "dorsal-thumb": (40, 40, 140), "dorsal-little": (120, 120, 255), "palmar-thumb": (30, 120, 30),
    "palmar-little": (150, 255, 150), "fix-thumb-nail": (255, 255, 0),
    **{f"fix-{f}-nail-top": (0, 255 - 40 * i, 255) for i, f in enumerate(("index", "middle", "ring", "little"))},
    "fix-index-thumb-side": (255, 0, 255), "fix-middle-ring-web-thumb": (200, 0, 120),
    "fix-middle-ring-web-little": (120, 0, 200),
    **{v: (255, 255, 200 - 25 * i) for i, v in enumerate(s for s in SPECS if s.startswith("seam-"))},
}
# MASK_ONLY=1: weights from the render masks alone (coverage check before any generation).
MASK_ONLY = os.environ.get("MASK_ONLY") == "1"
TEX = int(os.environ.get("TEX", 4096))
POWER = float(os.environ.get("POWER", 4.0))  # sharper cos weighting: the best-facing view wins
# The 45° spread views are a patch for the finger sides only: their weight is scaled down so
# they win just where the five main views barely see. Mixed in at full weight they washed out
# the knuckle creases and veins (their details do not line up with dorsal/palmar).
PATCH_WEIGHT = float(os.environ.get("PATCH_WEIGHT", 0.1))
# Soft edges. Occlusion: a view's weight fades over OCCLUSION_FADE_PX view pixels toward every
# depth jump of DEPTH_JUMP in its frame (a neighbour finger's outline), instead of dropping to
# zero in one texel (that left saw-tooth seams on the finger sides). Confidence: where the
# summed weight is below CONF_FULL the texel fades into a blur of its neighbours.
OCCLUSION_FADE_PX = 16.0
DEPTH_JUMP = 0.004  # metres between neighbouring view pixels
CONF_FULL = 0.02
# Every blur of the blend runs over the hand surface in 3D (class Surface), not in UV: a UV
# blur stops at island borders (tone steps along the dorsal/palmar seam) and reaches skin that
# is only near in the packed layout (patches on small islands). Widths in millimetres of skin;
# the UV blend they replace used texels of a 1024 map, 0.46 mm each.
VOXEL_MM = float(os.environ.get("VOXEL_MM", 1.0))
# Two-band blend: band split, low-band and high-band hand-over widths between views.
SPLIT_MM, LOW_T_MM, HIGH_T_MM = 2.8, 4.6, 0.7
GRAZE_LO, GRAZE_HI = 0.3, 0.6  # cos range over which a view's fine detail fades in
SIDE_PRIORITY = float(os.environ.get("SIDE_PRIORITY", 0.35))  # selection only, not blending
SELECT_MM = float(os.environ.get("SELECT_MM", 5.6))  # smoothing of the weights that pick each texel's best view
ZONE_MM = 2.0  # a view fades in over about twice this inside its zone edge
FILL_MM, FILL_WIDE_MM, CONF_FADE_MM = 5.6, 22.0, 1.9  # holes and thin coverage
# UV seam levelling (the fix before the surface blend, off by default now): border texels
# are paired across the seam in 3D (within SEAM_MATCH metres), each side moves halfway to the
# other's tone (blur SEAM_SIGMA), and the shift fades out over SEAM_RANGE texels.
SEAM_LEVEL = os.environ.get("SEAM_LEVEL", "0") == "1"
SEAM_MATCH = 0.0015
SEAM_SIGMA, SEAM_RANGE = 4.0, 40.0  # texels of a 1024 map
EDGE_FADE_PX = 10.0  # silhouette fade in view pixels (edge colour is the least reliable)
DEPTH_TOL = 0.0015  # metres
MAIN = ("dorsal", "palmar")  # the flat-lit reference views for levelling
LEVEL = os.environ.get("LEVEL", "1") == "1"
LEVEL_MIN_W = 0.05  # overlap texels for the gain: both sides at least this weight
TAG = os.environ.get("TAG", "")
OUT = os.path.join(HERE, "bake" + TAG)  # TAG=-notips etc. for variants


def srgb_to_linear(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055) * 255.0


def raster(tri_xy, values, size, depth=None):
    """Rasterise triangles (pixel coords, N×3×2) and interpolate per-corner values (N×3×K).

    With depth (N×3) keeps the nearest (smallest) depth. Returns (out H×W×K, filled mask).
    """
    k = values.shape[-1]
    out = np.zeros((size, size, k), np.float32)
    zbuf = np.full((size, size), np.inf, np.float32)
    filled = np.zeros((size, size), bool)
    lo = np.floor(tri_xy.min(1)).astype(int)
    hi = np.ceil(tri_xy.max(1)).astype(int)
    for i in range(len(tri_xy)):
        x0, y0 = max(lo[i, 0], 0), max(lo[i, 1], 0)
        x1, y1 = min(hi[i, 0], size - 1), min(hi[i, 1], size - 1)
        if x1 < x0 or y1 < y0:
            continue
        (ax, ay), (bx, by), (cx, cy) = tri_xy[i]
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
        w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
        w2 = 1 - w0 - w1
        inside = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not inside.any():
            continue
        yy, xx = np.nonzero(inside)
        yy, xx = yy + y0, xx + x0
        b = np.stack([w0[inside], w1[inside], w2[inside]], -1)
        v = b @ values[i]
        if depth is not None:
            z = b @ depth[i]
            closer = z < zbuf[yy, xx]
            yy, xx, v, z = yy[closer], xx[closer], v[closer], z[closer]
            zbuf[yy, xx] = z
        out[yy, xx] = v
        filled[yy, xx] = True
    return out, filled, zbuf


def camera_frame(cams, view):
    m = np.array(cams["views"][view]["matrix_world"], np.float64)
    right, up, back, eye = m[:3, 0], m[:3, 1], m[:3, 2], m[:3, 3]
    return right, up, back, eye


def to_pixels(p, cams, view):
    """World points -> (x px, y px, depth m) for an orthographic camera (y down)."""
    right, up, back, eye = camera_frame(cams, view)
    size, scale = cams["pixels"], cams["ortho_scale_m"]
    d = p - eye
    x = (d @ right / scale + 0.5) * size
    y = (0.5 - d @ up / scale) * size
    z = -(d @ back)
    return x, y, z


def sample(img, x, y):
    """Bilinear lookup at continuous pixel coords (pixel centres at +0.5), edge-clamped."""
    h, w = img.shape[:2]
    x = np.clip(x - 0.5, 0, w - 1.001)
    y = np.clip(y - 0.5, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    if img.ndim == 3:
        fx, fy = fx[:, None], fy[:, None]
    top = img[y0, x0] * (1 - fx) + img[y0, x0 + 1] * fx
    bot = img[y0 + 1, x0] * (1 - fx) + img[y0 + 1, x0 + 1] * fx
    return top * (1 - fy) + bot * fy


def pad_islands(img, filled, iterations=64):
    """Grow colour outward from filled texels (mip-safe padding)."""
    img = img.copy()
    mask = filled.astype(np.uint8)
    k = np.ones((3, 3), np.float32)
    for _ in range(iterations):
        grow = cv2.dilate(mask, np.ones((3, 3), np.uint8)) & (1 - mask)
        if not grow.any():
            break
        s = cv2.filter2D(img * mask[..., None], -1, k, borderType=cv2.BORDER_CONSTANT)
        n = cv2.filter2D(mask.astype(np.float32), -1, k, borderType=cv2.BORDER_CONSTANT)
        g = grow > 0
        img[g] = s[g] / n[g][:, None]
        mask = mask | grow
    return img


def pull_push_fill(img, known):
    """Fill unknown texels from a blurred pyramid of the known ones (inside islands)."""
    levels = []
    c, w = img * known[..., None], known.astype(np.float32)
    while min(w.shape) > 8:
        levels.append((c, w))
        c = cv2.resize(c, (c.shape[1] // 2, c.shape[0] // 2), interpolation=cv2.INTER_AREA)
        w = cv2.resize(w, (w.shape[1] // 2, w.shape[0] // 2), interpolation=cv2.INTER_AREA)
    est = c / np.maximum(w, 1e-6)[..., None]
    for c, w in reversed(levels):
        up = cv2.resize(est, (c.shape[1], c.shape[0]), interpolation=cv2.INTER_LINEAR)
        a = np.clip(w, 0, 1)[..., None]
        est = c / np.maximum(w, 1e-6)[..., None] * a + up * (1 - a)
    return est


def level_gain(col, w, cols, weights):
    """One gain per channel: median ratio to dorsal/palmar where both see the texel well."""
    num = sum(cols[v] * weights[v][:, None] for v in MAIN if v in cols)
    den = sum(weights[v] for v in MAIN if v in cols)
    both = (w > LEVEL_MIN_W) & (den > LEVEL_MIN_W)
    ref = num[both] / den[both][:, None]
    return np.median(ref / np.maximum(col[both], 1e-4), axis=0).astype(np.float32), int(both.sum())


def seam_level(lin_tex, inside, p):
    """Meet the tone halfway across UV island borders that touch in 3D (see SEAM_LEVEL)."""
    unit = TEX / 1024
    n_lab, labels = cv2.connectedComponents(inside.astype(np.uint8), connectivity=8)
    ring = inside & ~cv2.erode(inside.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    pos = np.zeros((TEX, TEX, 3), np.float32)
    pos[inside] = p
    ry, rx = np.nonzero(ring)
    rp, rl = pos[ry, rx], labels[ry, rx]
    # Tone of each island near its border: blur normalised within the island only.
    low = np.zeros_like(lin_tex)
    for lab in range(1, n_lab):
        m = (labels == lab).astype(np.float32)
        num = cv2.GaussianBlur(lin_tex * m[..., None], (0, 0), SEAM_SIGMA * unit)
        low += num / np.maximum(cv2.GaussianBlur(m, (0, 0), SEAM_SIGMA * unit), 1e-6)[..., None] * m[..., None]
    partner = np.full(len(rp), -1)
    for start in range(0, len(rp), 256):
        d = np.linalg.norm(rp[start:start + 256, None] - rp[None], axis=-1)
        d[rl[start:start + 256, None] == rl[None]] = np.inf
        j = d.argmin(1)
        ok = d[np.arange(len(j)), j] < SEAM_MATCH
        partner[start:start + 256][ok] = j[ok]
    hit = partner >= 0
    print("seam texels paired", int(hit.sum()), "of", len(rp))
    delta = np.zeros_like(lin_tex)
    matched = np.zeros((TEX, TEX), np.float32)
    hy, hx, pj = ry[hit], rx[hit], partner[hit]
    delta[hy, hx] = (low[ry[pj], rx[pj]] - low[hy, hx]) / 2
    matched[hy, hx] = 1
    field = np.zeros_like(lin_tex)
    reach = cv2.distanceTransform((1 - matched).astype(np.uint8), cv2.DIST_L2, 5) / (SEAM_RANGE * unit)
    fall = np.clip(1 - reach, 0, 1)
    fall = fall * fall * (3 - 2 * fall)
    for lab in range(1, n_lab):
        m = (labels == lab).astype(np.float32)
        mm = matched * m
        if mm.sum() == 0:
            continue
        sigma = SEAM_RANGE * unit / 2
        num = cv2.GaussianBlur(delta * mm[..., None], (0, 0), sigma)
        field += num / np.maximum(cv2.GaussianBlur(mm, (0, 0), sigma), 1e-6)[..., None] * (m * fall)[..., None]
    return np.clip(lin_tex + field, 0, 1)


def texel_geometry(npz, cache={}):
    """UV raster of one pose: (inside mask, texel positions, unit normals, triangle positions)."""
    if npz not in cache:
        data = np.load(os.path.join(HERE, npz))
        pos, nrm, uvs = data["positions"], data["normals"], data["uvs"]
        uv_px = np.stack([uvs[..., 0] * TEX, (1 - uvs[..., 1]) * TEX], -1)
        tex, inside, _ = raster(uv_px, np.concatenate([pos, nrm], -1), TEX)
        p = tex[inside, :3].astype(np.float64)
        n = tex[inside, 3:]
        n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
        cache[npz] = inside, p, n, pos
    return cache[npz]


def blur3(grid, sigma_vox):
    """Separable Gaussian over the three axes of a (X, Y, Z, C) grid, zero outside."""
    kern = cv2.getGaussianKernel(2 * int(np.ceil(3 * sigma_vox)) + 1, sigma_vox).astype(np.float32)
    one = np.ones((1, 1), np.float32)
    for axis in range(3):
        g = np.ascontiguousarray(np.moveaxis(grid, axis, 0))
        flat = cv2.sepFilter2D(g.reshape(g.shape[0], -1, g.shape[-1]), -1, one, kern,
                               borderType=cv2.BORDER_CONSTANT)
        grid = np.moveaxis(flat.reshape(g.shape), 0, axis)
    return grid


class Surface:
    """Gaussian blur over the hand surface in 3D (flat pose).

    Texels are splatted (trilinear) into voxel grids, one per normal direction; a texel
    splats into and reads from the directions of its own normal, so skin facing away (the
    side of the next finger, the other wall of a web) does not mix, while UV seams and the
    gaps between UV islands do not exist here.
    """

    DIRS = np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], np.float32)
    CORNERS = [(dx, dy, dz) for dx in (0, 1) for dy in (0, 1) for dz in (0, 1)]

    def __init__(self, p, n):
        g = (p - p.min(0)) / (VOXEL_MM / 1000)
        self.i0 = np.floor(g).astype(np.int64)
        self.f = (g - self.i0).astype(np.float32)
        b = np.clip(n.astype(np.float32) @ self.DIRS.T, 0, None) ** 2
        self.bins = (b / b.sum(1, keepdims=True)).astype(np.float32)
        self.n = len(p)
        self._area = {}

    def _corners(self, ix, lo, shape):
        c, f = self.i0[ix] - lo, self.f[ix]
        idx = np.stack([((c[:, 0] + dx) * shape[1] + c[:, 1] + dy) * shape[2] + c[:, 2] + dz
                        for dx, dy, dz in self.CORNERS], 1)
        w = np.stack([(f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1])
                      * (f[:, 2] if dz else 1 - f[:, 2]) for dx, dy, dz in self.CORNERS], 1)
        return idx, w

    def sums(self, values, sigma_mm, src, dst):
        """Blurred sums of values (N×C, C ≤ 4) splatted from texels src, read at texels dst."""
        si, di = np.nonzero(src)[0], np.nonzero(dst)[0]
        out = np.zeros((len(di), values.shape[1]), np.float32)
        if not len(si) or not len(di):
            return out
        s = sigma_mm / VOXEL_MM
        reach = int(np.ceil(3 * s)) + 1
        lo = np.minimum(self.i0[si].min(0), self.i0[di].min(0)) - reach
        shape = np.maximum(self.i0[si].max(0), self.i0[di].max(0)) + reach + 2 - lo
        size = int(np.prod(shape))
        sidx, sw = self._corners(si, lo, shape)
        didx, dw = self._corners(di, lo, shape)
        vals = values[si]
        for k in range(len(self.DIRS)):
            bs, bd = self.bins[si, k], self.bins[di, k]
            us, ud = bs > 1e-3, bd > 1e-3
            if not us.any() or not ud.any():
                continue
            grid = np.stack([np.bincount(sidx[us].ravel(), minlength=size,
                                         weights=(sw[us] * (vals[us, c] * bs[us])[:, None]).ravel())
                             for c in range(values.shape[1])], -1).astype(np.float32)
            grid = blur3(grid.reshape(*shape, -1), s).reshape(size, -1)
            out[ud] += bd[ud, None] * np.einsum("nj,njc->nc", dw[ud], grid[didx[ud]])
        return out

    def area(self, sigma_mm):
        """Blurred surface area (sums of ones) at every texel, the normaliser of a plain blur."""
        if sigma_mm not in self._area:
            every = np.ones(self.n, bool)
            self._area[sigma_mm] = np.maximum(
                self.sums(np.ones((self.n, 1), np.float32), sigma_mm, every, every)[:, 0], 1e-9)
        return self._area[sigma_mm]

    def blur(self, values, sigma_mm, src, dst):
        """Plain blur: blurred values over blurred area (values are 0 off src), at dst."""
        return self.sums(values, sigma_mm, src, dst) / self.area(sigma_mm)[dst][:, None]


def main():
    os.makedirs(OUT, exist_ok=True)
    inside = texel_geometry(FLAT[2])[0]
    print("texels on hand", int(inside.sum()))

    default = [v for v in VIEWS if MASK_ONLY or os.path.exists(
        os.path.join(HERE, SPECS[v][1], f"{v}.png"))]
    active = [v for v in VIEWS if v in os.environ.get("BAKE_VIEWS", ",".join(default)).split(",")]
    cols, weights, grazes = {}, {}, {}
    for view in active:
        views_dir, images_dir, npz = SPECS[view]
        vin, p, n, pos = texel_geometry(npz)
        assert (vin == inside).all(), "poses must share the UV raster"
        cams = json.load(open(os.path.join(HERE, views_dir, "cameras.json"), encoding="utf-8"))
        size = cams["pixels"]
        # Depth buffer of the view from the same subdivided surface.
        flat = pos.reshape(-1, 3).astype(np.float64)
        x, y, z = to_pixels(flat, cams, view)
        tri_xy = np.stack([x, y], -1).reshape(-1, 3, 2)
        _, _, zbuf = raster(tri_xy, np.zeros((len(tri_xy), 3, 1), np.float32), size,
                            depth=z.reshape(-1, 3).astype(np.float32))

        tx, ty, tz = to_pixels(p, cams, view)
        ix = np.clip(np.floor(tx).astype(int), 0, size - 1)
        iy = np.clip(np.floor(ty).astype(int), 0, size - 1)
        # Min depth over a 3×3 neighbourhood: tolerant to raster edges, still blocks fingers.
        zmin = cv2.erode(np.where(np.isinf(zbuf), 1e9, zbuf).astype(np.float32),
                         np.ones((3, 3), np.uint8))
        visible = tz <= zmin[iy, ix] + DEPTH_TOL
        zb = np.where(np.isinf(zbuf), 10.0, zbuf).astype(np.float32)
        k3 = np.ones((3, 3), np.uint8)
        jump = ((cv2.dilate(zb, k3) - cv2.erode(zb, k3)) > DEPTH_JUMP).astype(np.uint8)
        occl = np.clip(cv2.distanceTransform(1 - jump, cv2.DIST_L2, 5) / OCCLUSION_FADE_PX, 0, 1)
        occl = occl * occl * (3 - 2 * occl)

        if MASK_ONLY:
            img = cv2.imread(os.path.join(HERE, views_dir, f"{view}-mask.png"), cv2.IMREAD_UNCHANGED)
            img[..., :3] = 128
        else:
            img = cv2.imread(os.path.join(HERE, images_dir, f"{view}.png"), cv2.IMREAD_UNCHANGED)
            if img.shape[2] == 3:  # unaligned (touch-up) image: silhouette from the render
                sil = cv2.imread(os.path.join(HERE, views_dir, f"{view}-mask.png"), cv2.IMREAD_UNCHANGED)
                img = np.dstack([img, sil[..., 3]])
        # Valid = render silhouette with real skin in it (the alignment warp fills uncovered
        # corners, e.g. the wrist cut at the frame edge, with the white background).
        skin = img[..., :3].min(-1) < 243
        mask = ((img[..., 3] > 127) & skin).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        fade_px = EDGE_FADE_PX
        if SPECS[view] in TOUCH:
            edit = cv2.imread(os.path.join(HERE, views_dir, f"{view}-edit.png"), 0) > 127
            mask = mask & edit.astype(np.uint8)
            fade_px = FIX_FADE_PX if SPECS[view] is FIX else SEAM_FADE_PX
            # The frame edge is an edge too: points past it were clamped onto the border
            # pixels and smeared their colour into a flat band (a finger cut by the frame).
            mask[[0, -1], :] = 0
            mask[:, [0, -1]] = 0
        edge = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
        fade = np.clip(edge / fade_px, 0, 1)
        fade = fade * fade * (3 - 2 * fade)
        lin = srgb_to_linear(img[..., :3][..., ::-1].astype(np.float32))  # RGB linear
        col = sample(lin, tx, ty)
        f = sample(fade * occl, tx, ty)

        _, _, back, _ = camera_frame(cams, view)
        cos = np.clip(n @ back, 0, 1)
        w = (cos ** POWER) * f * visible
        if SPECS[view] in TOUCH:
            w = w * ((tx >= 0) & (tx < size) & (ty >= 0) & (ty < size))
        if SPECS[view] is SPREAD:
            w = w * PATCH_WEIGHT
        if SPECS[view] in TOUCH:
            w = w * (FIX_WEIGHT if SPECS[view] is FIX else SEAM_WEIGHT)
        cols[view], weights[view] = col.astype(np.float32), w.astype(np.float32)
        # Detail of a view fades out at grazing angles: there one view pixel smears over
        # millimetres of surface (the thumb nail's free edge, drawn at the dorsal outline,
        # became a second line down the side of the thumb tip).
        g = np.clip((cos - GRAZE_LO) / (GRAZE_HI - GRAZE_LO), 0, 1)
        grazes[view] = (g * g * (3 - 2 * g)).astype(np.float32)
        print(view, "texels used", int((w > 0.01).sum()))

    # Level the other views to dorsal/palmar with one gain per channel: a spatial gain
    # field was tried and left blotches (it is measured on thin overlap strips only).
    if LEVEL and not MASK_ONLY:
        for view in active:
            if view in MAIN or SPECS[view] in TOUCH:  # a touch-up is already in the texture's tone
                continue
            gain, count = level_gain(cols[view], weights[view], cols, weights)
            cols[view] *= gain
            print(view, "gain", gain.round(3).tolist(), "from", count, "texels")

    count = int(inside.sum())
    wsum = np.zeros(count, np.float64)
    best_w = np.zeros(count)
    best_v = np.full(count, -1)
    for vi, view in enumerate(VIEWS):
        if view not in active:
            continue
        w = weights[view]
        wsum += w
        better = w > best_w
        best_w[better], best_v[better] = w[better], vi
        wimg = np.zeros((TEX, TEX), np.float32)
        wimg[inside] = w
        cv2.imwrite(os.path.join(OUT, f"weights-{view}.png"),
                    cv2.resize((wimg * 255).astype(np.uint8), (1024, 1024), interpolation=cv2.INTER_AREA))

    # Two-band blend. Each view splits into low (tone) and high (pores, creases, nail outline)
    # frequencies. Every texel has one best view; the low band hands over between views across
    # a wide blur of that choice (no hard seams), the high band across a narrow one (details
    # from one view only: averaging them doubled the thumb nail). All blurs over the surface.
    _, p_flat, n_flat, _ = texel_geometry(FLAT[2])
    surf = Surface(p_flat, n_flat)
    every = np.ones(count, bool)
    # The best view comes from weights smoothed over SELECT_MM, so whole features (a nail,
    # about 12 mm) come from one view: a per-texel choice switched views across the thumb
    # nail and showed two nails drawn at different places.
    best = np.full(count, -1, np.int16)
    best_score = np.zeros(count, np.float32)
    for vi, view in enumerate(VIEWS):
        if view not in active:
            continue
        w = weights[view]
        hard = w > 0.002
        score = np.zeros(count, np.float32)
        score[hard] = surf.blur(w[:, None], SELECT_MM, w > 0, hard)[:, 0]
        if view not in MAIN and SPECS[view] not in TOUCH:  # views disagree on nails: dorsal/palmar decide
            score *= SIDE_PRIORITY
        better = score > best_score
        best[better], best_score[better] = vi, score[better]
    if os.environ.get("DUMP_BEST") == "1":  # debug: best-view map as an albedo-shaped image
        pal = np.array([COLORS[v] for v in VIEWS] + [(0, 0, 0)], np.uint8)
        best_img = np.full((TEX, TEX), -1, np.int16)
        best_img[inside] = best
        cv2.imwrite(os.path.join(OUT, "best-view-4096.png"), pal[best_img])
    acc_l = np.zeros((count, 3), np.float32)
    acc_a = np.zeros(count, np.float32)
    acc_h = np.zeros((count, 3), np.float32)
    acc_b = np.zeros(count, np.float32)
    for vi, view in enumerate(VIEWS):
        if view not in active:
            continue
        hard = weights[view] > 0.002
        if not hard.any():
            continue
        # A view's own zone fades to zero INSIDE its edge (the blurred zone is 0.5 at the
        # edge), so leaving it is gradual: a hard zone edge showed as polygonal seams.
        cover = surf.blur(hard[:, None].astype(np.float32), ZONE_MM, hard, hard)[:, 0]
        z = np.clip((cover - 0.5) / 0.45, 0, 1)
        valid = np.zeros(count, np.float32)
        valid[hard] = z * z * (3 - 2 * z)
        col = cols[view][hard]
        vh = valid[hard]
        s = surf.sums(np.concatenate([cols[view] * valid[:, None], valid[:, None]], 1), SPLIT_MM, hard, hard)
        low = s[:, :3] / np.maximum(s[:, 3:], 1e-9)
        onehot = (best == vi).astype(np.float32)[:, None]
        a = surf.blur(onehot, LOW_T_MM, best == vi, hard)[:, 0] * vh
        b = surf.blur(onehot, HIGH_T_MM, best == vi, hard)[:, 0] * vh * grazes[view][hard]
        acc_l[hard] += low * a[:, None]
        acc_a[hard] += a
        acc_h[hard] += (col - low) * b[:, None]
        acc_b[hard] += b
        print(view, "blended")
    known = acc_a > 1e-4
    # Detail is divided by at least 1: a view that holds a texel only with a sliver of weight
    # (just outside the best view's zone) adds faint detail, not its full detail.
    lin = acc_l / np.maximum(acc_a, 1e-6)[:, None] + acc_h / np.maximum(acc_b, 1.0)[:, None]
    lin = np.where(known[:, None], np.clip(lin, 0, 1), 0).astype(np.float32)
    del acc_l, acc_h
    print("texels with no view", int(count - known.sum()))
    for limit in (0.05, 0.2):
        print(f"texels whose best view weight < {limit}:", int((best_w < limit).sum()))

    # Holes inside the hand (between fingers, under the thumb) from surface neighbours, and a
    # soft hand-over to a blur of the neighbours wherever the views are thin.
    conf = np.clip(wsum / CONF_FULL, 0, 1).astype(np.float32)
    smooth = np.zeros((count, 3), np.float32)
    todo = every
    for sigma in (FILL_MM, FILL_WIDE_MM):
        s = surf.sums(np.concatenate([lin * conf[:, None], conf[:, None]], 1), sigma, conf > 0, todo)
        reached = s[:, 3] / surf.area(sigma)[todo] > 0.02
        ix = np.nonzero(todo)[0]
        smooth[ix[reached]] = s[reached, :3] / s[reached, 3:]
        todo = todo.copy()
        todo[ix[reached]] = False
    lin_tex = np.zeros((TEX, TEX, 3), np.float32)
    if todo.any():  # beyond both blurs: pull-push in UV
        lin_tex[inside] = lin
        known_img = np.zeros((TEX, TEX), bool)
        known_img[inside] = known
        smooth[todo] = pull_push_fill(lin_tex, known_img)[inside][todo]
    print("texels filled by pull-push", int(todo.sum()))
    conf = surf.blur(conf[:, None], CONF_FADE_MM, conf > 0, every)[:, 0] * conf  # also fade in from hole borders
    lin = np.where(known[:, None], lin, smooth)
    lin = lin * conf[:, None] + smooth * (1 - conf[:, None])
    lin_tex[inside] = lin
    print("texels with confidence < 0.5:", int((conf < 0.5).sum()))
    if SEAM_LEVEL:
        lin_tex = seam_level(lin_tex, inside, texel_geometry(FLAT[2])[1])
    lin_tex = pad_islands(lin_tex, inside, iterations=max(4, TEX // 256))
    srgb = linear_to_srgb(lin_tex)
    alpha = (inside * 255).astype(np.uint8)
    out = np.dstack([srgb[..., ::-1].astype(np.uint8), alpha])
    cv2.imwrite(os.path.join(OUT, f"albedo-{TEX}.png"), out[..., :3])
    cv2.imwrite(os.path.join(OUT, "hand-texels.png"), alpha)

    dom = np.full((TEX, TEX, 3), 255, np.uint8)
    dv = np.full(count, -1)
    dv[best_w > 1e-3] = best_v[best_w > 1e-3]
    cols = np.array([COLORS[v] for v in VIEWS] + [(0, 0, 0)], np.uint8)
    dom[inside] = cols[dv]
    cv2.imwrite(os.path.join(OUT, "dominant-view.png"),
                cv2.resize(dom, (1024, 1024), interpolation=cv2.INTER_NEAREST))
    cov = np.full((TEX, TEX), 255, np.uint8)
    cov[inside] = np.clip(wsum * 255, 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, "coverage.png"), cv2.resize(cov, (1024, 1024), interpolation=cv2.INTER_AREA))


if __name__ == "__main__":
    main()
