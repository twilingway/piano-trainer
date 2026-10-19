"""Edit masks for the seam views (python -I): views-seam/<view>-edit.png + edit-overlay.png.

Input: views-seam/diag-<view>-uvmask.png (seam_mask.py's UV mask rendered from the view by
render_diag_view.py) and the view silhouette <view>-mask.png. White = Codex repaints.
Env EDIT_DIR (default views-seam) and EDIT_VIEWS (comma list, default every view there) reuse it
for close-ups in views-fix/; the overlay is then <EDIT_DIR>/seam-edit-overlay.png.
"""
import json
import os

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, os.environ.get("EDIT_DIR", "views-seam"))
views = list(json.load(open(os.path.join(DIR, "cameras.json"), encoding="utf-8"))["views"])
CLOSE_PX = int(os.environ.get("EDIT_CLOSE", 0)) | 1 if os.environ.get("EDIT_CLOSE") else 0
if os.environ.get("EDIT_VIEWS"):
    views = os.environ["EDIT_VIEWS"].split(",")
tiles = []
for view in views:
    uv = cv2.imread(os.path.join(DIR, f"diag-{view}-uvmask.png"), 0) > 127
    sil = cv2.imread(os.path.join(DIR, f"{view}-mask.png"), cv2.IMREAD_UNCHANGED)[..., 3] > 127
    edit = (uv & sil).astype(np.uint8)
    edit = cv2.morphologyEx(edit, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    if CLOSE_PX:  # fill the thin unmasked slivers inside a band (close-ups)
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (CLOSE_PX, CLOSE_PX))
        edit = cv2.morphologyEx(edit, cv2.MORPH_CLOSE, k) & sil.astype(np.uint8)
    cv2.imwrite(os.path.join(DIR, f"{view}-edit.png"), edit * 255)
    img = cv2.imread(os.path.join(DIR, f"{view}.png"))
    over = img.copy()
    over[edit > 0] = (over[edit > 0] * 0.5 + np.array([0, 0, 255]) * 0.5).astype(np.uint8)
    tile = cv2.resize(over, (400, 400), interpolation=cv2.INTER_AREA)
    cv2.putText(tile, view, (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 1, cv2.LINE_AA)
    tiles.append(tile)
    print(view, "edit px", int(edit.sum()))
rows = [np.hstack(tiles[i:i + 4]) for i in range(0, len(tiles), 4)]
name = "edit-overlay.png" if DIR.endswith("views-seam") else "seam-edit-overlay.png"
cv2.imwrite(os.path.join(DIR, name), np.vstack(rows))
