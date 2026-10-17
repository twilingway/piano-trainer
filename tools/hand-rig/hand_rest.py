"""Rest geometry of the studio hand for the live hands' solver (src/render/three/handSolver).

Run inside Blender after studio_rig.py: exec(open(r"<repo>/tools/hand-rig/hand_rest.py").read()).
glTF keeps the bones' heads but not their lengths, and the solver needs both. Writes
tools/hand-rig/poses/studio-rest.json:
- "place": hand_mech.rest_for_place(HandRig, "R") - the MCPs, the phalanx lengths, the neutral and
  index directions, mm in the hand frame (x to the little finger, y along the middle finger, z out
  of the back of the hand, the wrist's head at the origin);
- "frame": rest_from_rig's F (rows: the hand's axes in armature space), w (the wrist's head) and S
  (mm a unit), which take the solver's joints into the rig;
- "bones": every bone's head, tail and length in armature space (Blender units), for the check
  against hand.glb.
"""
import json, os, sys

import bpy

ROOT = globals().get("ROOT", r"E:/MySource/ReactJS/piano-trainer")
OUT = os.path.join(ROOT, "tools", "hand-rig", "poses", "studio-rest.json")
if os.path.join(ROOT, "tools/hand-rig") not in sys.path:
    sys.path.insert(0, os.path.join(ROOT, "tools/hand-rig"))
import hand_mech

rig = bpy.data.objects["HandRig"]
place = hand_mech.rest_for_place(rig, "R")
frame = hand_mech.rest_from_rig(rig, "R")
r6 = lambda v: [round(float(c), 6) for c in v]
out = {
    "place": {"mcp": {str(f): r6(v) for f, v in place["mcp"].items()},
              "len": {str(f): r6(v) for f, v in place["len"].items()},
              "neutral": r6(place["neutral"]), "idx": r6(place["idx"])},
    "frame": {"F": [r6(row) for row in frame["F"]], "w": r6(frame["w"]), "S": round(frame["S"], 6)},
    "bones": {b.name: {"head": r6(b.head_local), "tail": r6(b.tail_local), "length": round(b.length, 6)}
              for b in rig.data.bones},
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=1)
print("hand_rest:", OUT, "S", out["frame"]["S"], "lengths",
      {f: [round(v, 1) for v in ls] for f, ls in out["place"]["len"].items()})
