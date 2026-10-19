"""Affine registration of the Codex views onto the render masks.

python -I align_views.py  ->  generated-aligned/<view>.png (RGBA, alpha = render mask),
generated-aligned/<view>-overlay.png, generated-aligned/sheet.png, report printed.
"""

import json
import os

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
VIEWS = ["dorsal", "palmar", "thumb-side", "little-side", "fingertips"]
RENDERS, GENERATED, OUT = "views", "generated", os.path.join(HERE, "generated-aligned")
if os.environ.get("SET") == "spread":  # spread-finger pose, oblique cameras
    VIEWS = ["dorsal-thumb", "dorsal-little", "palmar-thumb", "palmar-little"]
    RENDERS, GENERATED = "views-spread", "generated-spread"
    OUT = os.path.join(HERE, "generated-spread-aligned")


def read_rgba(path):
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    return img if img.shape[2] == 4 else cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)  # BGRA


def render_mask(view):
    m = read_rgba(os.path.join(HERE, RENDERS, f"{view}-mask.png"))
    return (m[..., 3] > 127).astype(np.uint8)


def generated_mask(img):
    # Background is near-white (253..254); skin and nails are darker in at least one channel.
    fg = (img[..., :3].min(-1) < 243).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
    keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    fg = (lab == keep).astype(np.uint8)
    # Fill holes (pale nails, highlights).
    flood = fg.copy()
    h, w = fg.shape
    cv2.floodFill(flood, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 1)
    return fg | (1 - flood)


def iou(a, b):
    return float((a & b).sum()) / float((a | b).sum())


def moments_init(src, dst):
    """Similarity from centroids and sqrt(area) ratio, as a 2x3 warp src->dst."""
    ms, md = cv2.moments(src, True), cv2.moments(dst, True)
    cs = np.array([ms["m10"] / ms["m00"], ms["m01"] / ms["m00"]])
    cd = np.array([md["m10"] / md["m00"], md["m01"] / md["m00"]])
    s = np.sqrt(md["m00"] / ms["m00"])
    return np.array([[s, 0, cd[0] - s * cs[0]], [0, s, cd[1] - s * cs[1]]], np.float32)


def ecc(src, dst, warp, mode):
    # ECC maximises correlation of blurred masks; warp maps dst coords -> src coords.
    a = cv2.GaussianBlur(dst.astype(np.float32), (0, 0), 6)
    b = cv2.GaussianBlur(src.astype(np.float32), (0, 0), 6)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 500, 1e-7)
    _, w = cv2.findTransformECC(a, b, warp, mode, crit, None, 5)
    return w


def warp_img(img, inv_warp, interp=cv2.INTER_LINEAR):
    h, w = img.shape[:2]
    return cv2.warpAffine(
        img, inv_warp, (w, h), flags=interp | cv2.WARP_INVERSE_MAP,
        borderMode=cv2.BORDER_CONSTANT, borderValue=(253, 253, 253, 255),
    )


def sdf8(mask, clip=40.0):
    """Signed distance to the silhouette edge, clipped and packed into 0..255."""
    inside = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    outside = cv2.distanceTransform(1 - mask, cv2.DIST_L2, 5)
    d = np.clip(inside - outside, -clip, clip)
    return ((d + clip) * (255.0 / (2 * clip))).astype(np.uint8)


def edge(mask):
    return mask - cv2.erode(mask, np.ones((3, 3), np.uint8))


def refine_flow(src, dst, sigma=15.0):
    """Dense dst->src offsets that move the src silhouette onto dst (after the affine step).

    Each dst edge pixel is paired with the nearest src edge pixel; the offsets are spread by
    normalised Gaussian convolution, so they fade to zero ~2.5 sigma away from the edge.
    """
    se, de = edge(src), edge(dst)
    _, labels = cv2.distanceTransformWithLabels(
        1 - se, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(se)
    nearest = np.zeros((labels.max() + 1, 2), np.float32)
    nearest[labels[ys, xs]] = np.stack([xs, ys], -1)
    dy, dx = np.nonzero(de)
    tgt = nearest[labels[dy, dx]]
    num = np.zeros(dst.shape + (2,), np.float32)
    den = np.zeros(dst.shape, np.float32)
    num[dy, dx, 0] = tgt[:, 0] - dx
    num[dy, dx, 1] = tgt[:, 1] - dy
    den[dy, dx] = 1.0
    num = cv2.GaussianBlur(num, (0, 0), sigma)
    den = cv2.GaussianBlur(den, (0, 0), sigma)
    eps = 0.08 / (np.sqrt(2 * np.pi) * sigma)
    return (num / (den[..., None] + eps)).astype(np.float32)


def remap(img, flow, interp=cv2.INTER_LINEAR, border=(253, 253, 253, 255)):
    h, w = flow.shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return cv2.remap(img, gx + flow[..., 0], gy + flow[..., 1], interp,
                     borderMode=cv2.BORDER_CONSTANT, borderValue=border)


def overlay(img_bgr, mask):
    out = img_bgr.copy()
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(out, cnts, -1, (0, 0, 255), 2)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    report = {}
    tiles = []
    for view in VIEWS:
        gen = read_rgba(os.path.join(HERE, GENERATED, f"{view}.png"))
        dst = render_mask(view)
        src = generated_mask(gen)
        before = iou(src, dst)

        # Moments give src->dst; ECC wants the inverse map (dst -> src).
        fwd = moments_init(src, dst)
        inv = cv2.invertAffineTransform(fwd).astype(np.float32)
        try:
            inv = ecc(src, dst, inv, cv2.MOTION_AFFINE)
        except cv2.error as e:
            print(view, "ECC failed:", e)
        warped = warp_img(gen, inv)
        wmask = cv2.warpAffine(
            src * 255, inv, src.shape[::-1], flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP,
            borderMode=cv2.BORDER_CONSTANT, borderValue=0,
        ) > 127
        affine_iou = iou(wmask.astype(np.uint8), dst)

        # Non-rigid pass: finger angles differ by a degree or two, which no affine fixes.
        # Two rounds: each closes most of the remaining edge gap.
        flow = np.zeros(dst.shape + (2,), np.float32)
        for _ in range(2):
            step = refine_flow(wmask.astype(np.uint8), dst)
            # Compose: sample the previous field at the new positions, then add the step.
            flow = remap(flow, step, cv2.INTER_LINEAR, 0) + step
            wmask = cv2.warpAffine(
                src * 255, inv, src.shape[::-1], flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP,
                borderMode=cv2.BORDER_CONSTANT, borderValue=0,
            )
            wmask = remap(wmask, flow, cv2.INTER_NEAREST, 0) > 127
        warped = remap(warped, flow)
        after = iou(wmask.astype(np.uint8), dst)
        mag = np.linalg.norm(flow, axis=-1)

        A =cv2.invertAffineTransform(inv)  # src -> dst
        sx, sy = np.linalg.norm(A[:, 0]), np.linalg.norm(A[:, 1])
        rot = np.degrees(np.arctan2(A[1, 0], A[0, 0]))
        report[view] = {
            "iou_before": round(before, 3),
            "iou_affine": round(affine_iou, 3),
            "iou_after": round(after, 3),
            "flow_max_px": round(float(mag.max()), 1),
            "scale": [round(float(sx), 3), round(float(sy), 3)],
            "rotation_deg": round(float(rot), 2),
            "shift_px": [round(float(A[0, 2]), 1), round(float(A[1, 2]), 1)],
            "warp_dst_to_src": inv.tolist(),
        }
        print(view, report[view]["iou_before"], "->", affine_iou, "->", report[view]["iou_after"],
              "flow max", report[view]["flow_max_px"],
              "scale", report[view]["scale"], "rot", report[view]["rotation_deg"])

        rgba = warped.copy()
        rgba[..., 3] = dst * 255
        cv2.imwrite(os.path.join(OUT, f"{view}.png"), rgba)
        ov_before = overlay(gen[..., :3], dst)
        ov_after = overlay(warped[..., :3], dst)
        cv2.imwrite(os.path.join(OUT, f"{view}-overlay.png"), ov_after)
        tiles.append((view, ov_before, ov_after, before, after))

    # Sheet: one row per view, before | after, red = render silhouette.
    t = 360
    rows = []
    for view, b, a, ib, ia in tiles:
        row = []
        for img, label in ((b, f"{view} before IoU {ib:.2f}"), (a, f"after IoU {ia:.2f}")):
            s = cv2.resize(img, (t, t), interpolation=cv2.INTER_AREA)
            cv2.putText(s, label, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 30, 30), 1, cv2.LINE_AA)
            row.append(s)
        rows.append(np.hstack(row))
    sheet = np.vstack(rows)
    # Two columns of views to keep the sheet readable.
    half = (len(rows) + 1) // 2
    left = np.vstack(rows[:half])
    right = np.vstack(rows[half:] + [np.full_like(rows[0], 255)] * (half * 2 - len(rows)))
    sheet = np.hstack([left, np.full((left.shape[0], 12, 3), 255, np.uint8), right])
    cv2.imwrite(os.path.join(OUT, "sheet.png"), sheet)
    with open(os.path.join(OUT, "align.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1)


if __name__ == "__main__":
    main()
