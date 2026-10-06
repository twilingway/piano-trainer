"""Copy a finished study run into the repository: webp renders for public/hand-study.html, solved poses.

Run with Python 3 and Pillow, outside Blender: python tools/hand-rig/export.py
Every render is cropped by the same box (the union of all hands, plus a margin), so the poses keep one
scale and one frame; then scaled to WIDTH and saved as webp with alpha.
"""
import json, os, shutil, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STUDY = os.path.join(ROOT, "blender", "renders", "study")
PAGE = os.path.join(ROOT, "public", "hand-study")
POSES = os.path.join(ROOT, "tools", "hand-rig", "poses")
WIDTH, MARGIN = 320, 12

ids = sorted(json.load(open(os.path.join(STUDY, "report.json"), encoding="utf-8")))
images = {i: Image.open(os.path.join(STUDY, i + ".png")).convert("RGBA") for i in ids}
boxes = [im.getchannel("A").getbbox() for im in images.values()]
w, h = next(iter(images.values())).size
box = (max(0, min(b[0] for b in boxes) - MARGIN), max(0, min(b[1] for b in boxes) - MARGIN),
       min(w, max(b[2] for b in boxes) + MARGIN), min(h, max(b[3] for b in boxes) + MARGIN))
size = (WIDTH, round(WIDTH * (box[3] - box[1]) / (box[2] - box[0])))
os.makedirs(PAGE, exist_ok=True)
os.makedirs(POSES, exist_ok=True)
for i, im in images.items():
    im.crop(box).resize(size, Image.LANCZOS).save(os.path.join(PAGE, i + ".webp"), quality=82, method=6)
    shutil.copy(os.path.join(STUDY, "poses", i + ".json"), os.path.join(POSES, i + ".json"))
shutil.copy(os.path.join(STUDY, "report.json"), os.path.join(POSES, "report.json"))
print(len(ids), "poses, crop", box, "->", size, file=sys.stderr)
