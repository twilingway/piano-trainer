"""Copy a finished study run into the repository: webp renders for public/hand-study.html, solved poses.

Run with Python 3 and Pillow, outside Blender: python tools/hand-rig/export.py
Every render is cropped by the same fixed box (it holds every pose: the octave reaches left, the
tucked thumb right), so the poses keep one scale and one frame; then scaled to WIDTH and saved as webp with alpha. Exports
the poses finished so far (progress.log); report.json once the full run is DONE.
"""
import json, os, shutil, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STUDY = os.path.join(ROOT, "blender", "renders", "study")
PAGE = os.path.join(ROOT, "public", "hand-study")
POSES = os.path.join(ROOT, "tools", "hand-rig", "poses")
WIDTH = 320
BOX = (160, 0, 1024, 1024)             # of the 1024 px render; octave x 273..889, tucked x 406..1006

log = open(os.path.join(STUDY, "progress.log"), encoding="utf-8").read().splitlines()
ids = [line.split()[0] for line in log if " fit " in line]
images = {i: Image.open(os.path.join(STUDY, i + ".png")).convert("RGBA") for i in ids}
for i, im in images.items():
    a, b, c, d = im.getchannel("A").getbbox()
    if a < BOX[0] or c > BOX[2] or b < BOX[1]:
        print("clipped:", i, (a, b, c, d), file=sys.stderr)
box = BOX
size = (WIDTH, round(WIDTH * (box[3] - box[1]) / (box[2] - box[0])))
os.makedirs(PAGE, exist_ok=True)
os.makedirs(POSES, exist_ok=True)
for i, im in images.items():
    im.crop(box).resize(size, Image.LANCZOS).save(os.path.join(PAGE, i + ".webp"), quality=82, method=6)
    shutil.copy(os.path.join(STUDY, "poses", i + ".json"), os.path.join(POSES, i + ".json"))
# the pressed keys of every exported pose, for the page's keyboard under the render
keys = {}
for name in sorted(os.listdir(POSES)):
    if name.endswith(".json") and name != "report.json":
        pose = json.load(open(os.path.join(POSES, name), encoding="utf-8"))
        keys[pose["id"]] = pose["down"]
with open(os.path.join(ROOT, "src", "render", "handStudy", "renderPoses.json"), "w", encoding="utf-8") as fh:
    json.dump(keys, fh, indent=2)
    print(file=fh)
if "DONE" in log:
    shutil.copy(os.path.join(STUDY, "report.json"), os.path.join(POSES, "report.json"))
print(len(ids), "poses, crop", box, "->", size, file=sys.stderr)
