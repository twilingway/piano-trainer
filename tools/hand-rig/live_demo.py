"""Key the live hand on the piano kit: the phrase planned by src/render/three/handPlacement.ts.

First: node --experimental-strip-types src/render/three/handDemo.ts (writes blender/exports/hand-demo.json).
Then inside Blender, after piano_kit.py: exec(open(".../live_demo.py").read(), {}).

The pose is the position's base (fingers-31: forearm, wrist, palm, all five fingers down on C..G)
with every finger blended on its own between lifted (relaxed's finger bones) and pressed
(fingers-31's), by the plan's press. A finger reaches sideways by turning at its knuckle and towards
the black keys by straightening there; the hand moves by sliding the rig along the keys.
"""
import bpy, json, math, os
from mathutils import Quaternion, Vector

ROOT = globals().get("ROOT", r"E:/MySource/ReactJS/piano-trainer")
POSES = os.path.join(ROOT, "tools/hand-rig/poses")
DEMO = globals().get("DEMO", os.path.join(ROOT, "blender/exports/hand-demo.json"))

WHITE_W, WHITE_L = 0.0235, 0.150
BLACK_L = 0.095
KEY_TOP, KEY_FRONT = 0.74, 0.30
KEY_DIP = 0.010                         # a pressed key's front edge sinks this far (studio_pose.py)
PIVOT_Y = KEY_FRONT + WHITE_L + 0.10
# Measured on fingers-31: 10 degrees at the knuckle move the tip about 13 mm sideways (about Z;
# the thumb about X) and, about -X, 11 mm in and 10 mm up. These are the radians per metre.
SIDE_AXIS = {1: "X", 2: "Z", 3: "Z", 4: "Z", 5: "Z"}
SIDE_RADIUS = {1: 0.100, 2: 0.075, 3: 0.073, 4: 0.075, 5: 0.086}
BLACK_REACH = math.radians(15)          # straightening that brings a tip onto a black key

rig = bpy.data.objects["HandRig"]
scene = bpy.context.scene


def load(pid):
    with open(os.path.join(POSES, pid + ".json"), encoding="utf-8") as fh:
        return json.load(fh)["bones"]


base, lifted = load("fingers-31"), load("relaxed")
with open(DEMO, encoding="utf-8") as fh:
    demo = json.load(fh)


def finger_of(name):
    return next((f for f in range(1, 6) if name.startswith(f"finger{f}-")), None)


def axis(name):
    return Vector({"X": (1, 0, 0), "Z": (0, 0, 1)}[name])


def pose(frame):
    for pb in rig.pose.bones:
        b = base[pb.name]
        f = finger_of(pb.name)
        q = Quaternion(b["rotation_quaternion"])
        if f is not None:
            state = frame["fingers"][str(f)]
            q = Quaternion(lifted[pb.name]["rotation_quaternion"]).slerp(q, state["press"])
            if pb.name.endswith("-1.R"):
                side = state["offset"] * WHITE_W / SIDE_RADIUS[f]
                q = q @ Quaternion(axis(SIDE_AXIS[f]), side)
                if f != 1:
                    q = q @ Quaternion(Vector((1, 0, 0)), -BLACK_REACH * state["depth"])
        pb.location = b["location"]
        pb.rotation_quaternion = q
        pb.scale = b["scale"]
        for path in ("location", "rotation_quaternion", "scale"):
            pb.keyframe_insert(path)


def is_black(midi):
    return midi % 12 not in (0, 2, 4, 5, 7, 9, 11)


keys = {int(o.name[4:]): o for o in bpy.data.collections["piano"].objects if o.name.startswith("key-")}
rest = {midi: o.location.copy() for midi, o in keys.items()}


def press_keys(frame):
    for midi, o in keys.items():
        front = KEY_FRONT + (WHITE_L - BLACK_L if is_black(midi) else 0)
        angle = math.atan2(KEY_DIP, PIVOT_Y - front) * frame["keys"].get(str(midi), 0)
        y, z = rest[midi].y - PIVOT_Y, rest[midi].z - KEY_TOP
        o.location = (rest[midi].x, PIVOT_Y + y * math.cos(angle) - z * math.sin(angle),
                      KEY_TOP + y * math.sin(angle) + z * math.cos(angle))
        o.rotation_euler = (angle, 0, 0)
        o.keyframe_insert("location")
        o.keyframe_insert("rotation_euler")


rig.animation_data_clear()
for o in keys.values():
    o.animation_data_clear()
x0 = rig.get("live_x0", rig.location.x)
rig["live_x0"] = x0
for index, frame in enumerate(demo["frames"]):
    scene.frame_set(index + 1)
    rig.location.x = x0 + frame["anchor"] * WHITE_W
    rig.keyframe_insert("location", index=0)
    pose(frame)
    press_keys(frame)
scene.render.fps = demo["fps"]
scene.frame_start, scene.frame_end = 1, len(demo["frames"])
scene.frame_set(1)
print("keyed", len(demo["frames"]), "frames")
