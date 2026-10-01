"""Crops part of a rendered page, so a system of the score can be read up close.

    python tools/course-import/crop.py page.png out.png x0 y0 x1 y1 [zoom]

Coordinates are fractions of the page (0..1); zoom scales the crop up (default 1).
"""

import sys

from PIL import Image

image = Image.open(sys.argv[1])
width, height = image.size
x0, y0, x1, y1 = map(float, sys.argv[3:7])
zoom = float(sys.argv[7]) if len(sys.argv) > 7 else 1
crop = image.crop((int(x0 * width), int(y0 * height), int(x1 * width), int(y1 * height)))
if zoom != 1:
    crop = crop.resize((int(crop.width * zoom), int(crop.height * zoom)))
crop.save(sys.argv[2])
