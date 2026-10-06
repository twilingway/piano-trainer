"""Render every hand-study pose (src/render/handStudy/poses.ts) from straight above, hand only.

Run inside Blender: exec(open(".../studio_study.py").read(), {"ONLY": ["triad"], "ASYNC": True}).
ONLY is optional (the full run also writes report.json); ASYNC solves one pose per timer tick, so the
call returns at once (a pose takes about a minute) and progress.log tells when it is DONE.
The pose list is hand-study's; each pose names only its pressed keys (semitones from C4). Free fingers
take their natural pose in studio_pose.py; "over" anchors a hand that presses nothing or tucks the thumb.
Writes blender/renders/study/<id>.png, poses/<id>.json (bone transforms) and report.json.
"""
import bpy, json, io, contextlib, os

# The repository on the machine that runs Blender; pass {"ROOT": ...} to exec to override. Renders
# go to the git-ignored blender/ workspace; the page's copies are made by export_webp.py.
ROOT = globals().get("ROOT", r"E:/MySource/ReactJS/piano-trainer")
SCRIPTS = os.path.join(ROOT, "tools/hand-rig")
OUT = globals().get("OUT", os.path.join(ROOT, "blender/renders/study"))
POSES_OUT = os.path.join(OUT, "poses")
ONLY = globals().get("ONLY")
RENDER = globals().get("RENDER", True)
os.makedirs(POSES_OUT, exist_ok=True)

C, D, E, F, G = 0, 2, 4, 5, 7          # five-finger position: finger f on the f-th of C D E F G
HOME = {1: C, 2: D, 3: E, 4: F, 5: G}


def spec(pid, down, over=None):
    return {"id": pid, "down": down, "over": over or {}}


combos = []
for i in range(1, 32):
    down = [f for f in range(1, 6) if i & (1 << (f - 1))]
    combos.append(spec(f"fingers-{i}", {f: HOME[f] for f in down}))
combos.sort(key=lambda s: (len(s["down"]), s["id"]))   # same order as poses.ts
STUDY = [spec("relaxed", {}, {3: E})] + combos + [
    spec("third", {1: C, 3: E}), spec("fifth", {1: C, 5: G}), spec("sixth", {1: C, 5: 9}),
    spec("seventh", {1: C, 5: 11}), spec("octave", {1: C, 5: 12}), spec("triad", {1: C, 3: E, 5: G}),
    spec("inversion", {1: E, 2: G, 5: 12}),                 # E G C: the first inversion of C
    spec("chord7", {1: C, 2: E, 3: G, 5: 11}),              # C E G B
    spec("black", {1: C, 3: 3, 5: G}),                      # C Eb G
    spec("tucked", {1: F}, {3: E}),                         # the thumb passes under to F, middle finger over E
]

src = open(os.path.join(SCRIPTS, "studio_pose.py"), encoding="utf-8").read()
reports = {}
todo = [s for s in STUDY if not ONLY or s["id"] in ONLY]
LOG = os.path.join(OUT, "progress.log")


def run_one(s):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(src, {"SPEC": s, "MODE": "top", "OUT": OUT, "RENDER": RENDER})
    reports[s["id"]] = r = json.loads(buf.getvalue().strip().splitlines()[-1])
    # the solved pose as keyframe data: every bone's local transform (pose.bones[name].matrix_basis
    # decomposed), so an animation can blend poses without running the solver
    rig = bpy.data.objects["HandRig"]
    bones = {}
    for pb in rig.pose.bones:
        loc, rot, scale = pb.matrix_basis.decompose()
        bones[pb.name] = {"location": [round(x, 6) for x in loc], "rotation_quaternion": [round(x, 6) for x in rot],
                          "scale": [round(x, 6) for x in scale]}
    with open(os.path.join(POSES_OUT, s["id"] + ".json"), "w", encoding="utf-8") as fh:
        json.dump({"id": s["id"], "down": s["down"], "over": s["over"], "units": "semitones from C4, metres",
                   "rig_matrix_world": [list(row) for row in rig.matrix_world], "bones": bones}, fh, indent=1)
    line = " ".join(map(str, (s["id"], "fit", r["fit_residual_mm"], "miss", r["miss_mm"], "pad", r["pad_gap_mm"],
                              "hover", r["hover_above_keys_mm"], "skin", r["skin_key_mm"], r["skin_finger_mm"])))
    with open(LOG, "a", encoding="utf-8") as fh:
        print(line, file=fh)
    print(line)


def finish():
    if not ONLY:
        with open(os.path.join(OUT, "report.json"), "w", encoding="utf-8") as fh:
            json.dump(reports, fh, indent=1)
    with open(LOG, "a", encoding="utf-8") as fh:
        print("DONE", file=fh)


open(LOG, "w").close()
if globals().get("ASYNC"):
    # one pose per timer tick: the call returns at once, Blender stays responsive and shows each pose
    def tick():
        try:
            run_one(todo.pop(0))
        except Exception as e:
            with open(LOG, "a", encoding="utf-8") as fh:
                print("ERROR", repr(e), file=fh)
            return None
        if todo:
            return 0.2
        finish()
        return None

    bpy.app.timers.register(tick, first_interval=0.2)
else:
    for s in todo:
        run_one(s)
    finish()
