"""Albedo with the UV island borders drawn in red (python -I): bake/diag-seams-4096.png.

render_diag_view.py puts it on the hand, so a colour step in a close-up can be checked
against the UV seam: a step that runs along the red line comes from the seam.
"""
import os

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
alb = cv2.imread(os.path.join(HERE, "bake", "albedo-4096.png"))
inside = cv2.imread(os.path.join(HERE, "bake", "hand-texels.png"), 0) > 127
border = inside & ~cv2.erode(inside.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
alb[border] = (0, 0, 255)
cv2.imwrite(os.path.join(HERE, "bake", "diag-seams-4096.png"), alb)
print("border texels", int(border.sum()))
