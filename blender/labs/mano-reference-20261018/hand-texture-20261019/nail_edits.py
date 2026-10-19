"""Edit masks for the finger-nail close-ups (python -I): views-fix/fix-<finger>-nail-edit.png.

As for the thumb nail: an ellipse around the nail plate, intersected with the silhouette. Its
centre is the back-of-finger surface point over the target focus (fix-targets.json), projected
into the close-up; the long axis follows the finger. Also writes views-fix/nail-edit-overlay.png.
"""
import json
import os

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
# Ellipse semi-axes: room for a full-size nail plate (~12×10 mm, the first pass drew them too
# small) plus a skin margin.
ALONG_MM, ACROSS_MM = 10.0, 7.5
# The painted nail sits further out than the target focus (measured on the close-ups).
SHIFT_MM = {"index": 8.0, "middle": 8.0, "ring": 8.0, "little": 4.5}
NEAR_MM = 4.0  # vertices this close to the focus across the back-of-hand axis (+Y)

verts = np.array([[float(x) for x in line.split()[1:]]
                  for line in open(os.path.join(HERE, "flat-hand.obj"), encoding="utf-8")
                  if line.startswith("v ")])
targets = json.load(open(os.path.join(HERE, "fix-targets.json"), encoding="utf-8"))
cams = json.load(open(os.path.join(HERE, "views-fix", "cameras.json"), encoding="utf-8"))
size, scale = cams["pixels"], cams["ortho_scale_m"]
px_per_mm = size / (scale * 1000)
tiles = []
for finger in ("index", "middle", "ring", "little"):
    view = f"fix-{finger}-nail"
    focus, along = np.array(targets[view]["focus"]), np.array(targets[view]["finger"])
    near = np.hypot(verts[:, 0] - focus[0], verts[:, 2] - focus[2]) < NEAR_MM / 1000
    top = verts[near][np.argmax(verts[near][:, 1])] + along * SHIFT_MM[finger] / 1000
    m = np.array(cams["views"][view]["matrix_world"])
    right, up, eye = m[:3, 0], m[:3, 1], m[:3, 3]
    cx = ((top - eye) @ right / scale + 0.5) * size
    cy = (0.5 - (top - eye) @ up / scale) * size
    angle = np.degrees(np.arctan2(-(along @ up), along @ right))
    edit = np.zeros((size, size), np.uint8)
    cv2.ellipse(edit, (int(cx), int(cy)), (int(ALONG_MM * px_per_mm), int(ACROSS_MM * px_per_mm)),
                angle, 0, 360, 255, -1)
    sil = cv2.imread(os.path.join(HERE, "views-fix", f"{view}-mask.png"), cv2.IMREAD_UNCHANGED)[..., 3] > 127
    edit[~sil] = 0
    cv2.imwrite(os.path.join(HERE, "views-fix", f"{view}-edit.png"), edit)
    img = cv2.imread(os.path.join(HERE, "views-fix", f"{view}.png"))
    over = img.copy()
    over[edit > 0] = (over[edit > 0] * 0.6 + np.array([255, 128, 0]) * 0.4).astype(np.uint8)
    tiles.append(cv2.resize(over, (512, 512), interpolation=cv2.INTER_AREA))
    print(view, "centre", int(cx), int(cy), "angle", round(float(angle), 1))
cv2.imwrite(os.path.join(HERE, "views-fix", "nail-edit-overlay.png"), np.hstack(tiles))
