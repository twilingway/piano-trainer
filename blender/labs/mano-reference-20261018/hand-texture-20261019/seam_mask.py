"""UV mask of the remaining seams for the Codex pass (python -I): bake/seam-mask-4096.png.

Seams = texels where the best view changes (bake/best-view-4096.png, DUMP_BEST=1 in
bake_views.py) plus the UV island border (the dorsal/palmar seam), grown by SEAM_MM on the
surface. render_diag_view.py renders it from the seam views; the result becomes the edit masks.
"""
import os

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SEAM_MM = float(os.environ.get("SEAM_MM", 2.0))
MM_PER_TEXEL = 0.1  # 4096 map on the hand (README: ~0.1 mm per texel)

best = cv2.imread(os.path.join(HERE, "bake", "best-view-4096.png"))
inside = cv2.imread(os.path.join(HERE, "bake", "hand-texels.png"), 0) > 127
inside = cv2.resize(inside.astype(np.uint8), best.shape[1::-1], interpolation=cv2.INTER_NEAREST) > 0
code = best.astype(np.int32) @ np.array([1, 256, 65536])
k3 = np.ones((3, 3), np.uint8)
inside8 = inside.astype(np.uint8)
# A change of view: a 3×3 neighbour inside the hand with another colour.
hi = cv2.dilate(np.where(inside, code, -1).astype(np.float32), k3)
lo = -cv2.dilate(np.where(inside, -code, -2**25).astype(np.float32), k3)
change = inside & (hi != lo)
border = inside & ~cv2.erode(inside8, k3).astype(bool)
seam = (change | border).astype(np.uint8)
r = int(round(SEAM_MM / MM_PER_TEXEL))
grown = cv2.dilate(seam, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))) & inside8
out = np.dstack([grown * 255] * 3).astype(np.uint8)
cv2.imwrite(os.path.join(HERE, "bake", "seam-mask-4096.png"), out)
print("seam texels", int(seam.sum()), "mask texels", int(grown.sum()), "of", int(inside.sum()))
