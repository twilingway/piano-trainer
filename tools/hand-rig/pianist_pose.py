"""Seat the pianist (pianist_rig.py) at the 88-key piano of piano_kit.py (PIANO "pianist_piano", STAGE).

Run inside Blender: exec(open(".../pianist_pose.py").read(), {...overrides}).
The rig turns to face the keys (+Y); the pelvis sits on the front half of the bench; legs and arms
are placed by an analytic two-bone IK (the same math the game will run): hip -> knee -> ankle with
the knee forward, shoulder -> elbow -> wrist with the elbow out and down. The spine leans forward,
the head looks down at the keys. Wrists go to WRIST targets above the keys, palms down; the left
sole stays flat on the floor, the right forefoot rests on the sustain footswitch.
"""
import bpy, math
from mathutils import Matrix, Vector

G = globals()
KEY_TOP, KEY_FRONT, X0, WHITE_W = 0.74, 0.30, 0.36, 0.0235
BENCH_H, BENCH_GAP = 0.49, G.get("BENCH_GAP", 0.28)
CENTRE = (X0 + (-28 + 5) * WHITE_W + X0 + 28 * WHITE_W) / 2     # between A0 and C8
HIP_ABOVE_SEAT = G.get("HIP_ABOVE_SEAT", 0.10)                   # hip joints over the seat
HIP_BEHIND_EDGE = G.get("HIP_BEHIND_EDGE", 0.10)                 # ...and behind its front edge
LEAN = G.get("LEAN", (4, 4, 3))                                  # spine01..03 forward, degrees
LOOK = G.get("LOOK", (10, 14))                                   # neck01, head down, degrees
PEDAL_X, PEDAL_BACK, PEDAL_TOP = 0.16, KEY_FRONT + 0.15, 0.045
ANKLE_UP, FOOT_REACH = 0.075, 0.15                               # ankle over the floor; ankle -> ball
# Where the wrists go: x across the keyboard, y towards the keys, z up (world).
WRIST = G.get("WRIST", {"L": Vector((X0 - 7 * WHITE_W + 2 * WHITE_W, KEY_FRONT - 0.11, KEY_TOP + 0.04)),
                        "R": Vector((X0 + 2 * WHITE_W, KEY_FRONT - 0.11, KEY_TOP + 0.04))})
FEET = G.get("FEET", {"L": Vector((CENTRE - 0.14, KEY_FRONT - 0.02, 0)),            # ball of the foot
                      "R": Vector((CENTRE + PEDAL_X, PEDAL_BACK - 0.07, PEDAL_TOP))})

view = bpy.context.view_layer
rig = bpy.data.objects["PianistRig"]
pose = rig.pose.bones
for pb in pose:
    pb.matrix_basis = Matrix.Identity(4)
rig.matrix_world = Matrix.Identity(4)
view.update()

# --- the rig turned to the keys, the hip joints on the bench
hip_mid = rig.data.bones["pelvis"].head_local.copy()
seat_front = KEY_FRONT - BENCH_GAP
target = Vector((CENTRE, seat_front - HIP_BEHIND_EDGE, BENCH_H + HIP_ABOVE_SEAT))
rig.matrix_world = Matrix.Translation(target) @ Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Translation(-hip_mid)
view.update()
to_rig = rig.matrix_world.inverted()
rig_rot = to_rig.to_3x3()


def world(pb, at="head"):
    return rig.matrix_world @ (pb.head if at == "head" else pb.tail)


def turn(pb, rotation_world, pivot_world):
    """Turns a pose bone (and so its children) by a world rotation about a world point."""
    r = (rig_rot @ rotation_world.to_3x3() @ rig_rot.inverted()).to_4x4()
    p = to_rig @ pivot_world
    pb.matrix = Matrix.Translation(p) @ r @ Matrix.Translation(-p) @ pb.matrix
    view.update()


def aim(pb, point_world):
    """Turns a bone about its head so its tail points at a world point (shortest turn)."""
    head = world(pb)
    turn(pb, (world(pb, "tail") - head).rotation_difference(point_world - head).to_matrix().to_4x4(), head)


def two_bone(root, a, b, goal, pole):
    """The middle joint of a two-bone chain from `root` with lengths a, b reaching `goal`, bent
    towards `pole`. A goal out of reach is pulled in along the line to it."""
    d = goal - root
    dist = min(d.length, (a + b) * 0.999)
    u = d.normalized()
    x = (a * a - b * b + dist * dist) / (2 * dist)
    h = math.sqrt(max(a * a - x * x, 0.0))
    v = (pole - root) - u * (pole - root).dot(u)
    return root + u * x + v.normalized() * h, root + u * dist


# --- the spine leans forward, the head looks down at the keys (about the rig's side axis)
side = rig.matrix_world.to_3x3() @ Vector((1, 0, 0))
for name, deg in zip(("spine01", "spine02", "spine03"), LEAN):
    turn(pose[name], Matrix.Rotation(math.radians(deg), 4, side), world(pose[name]))
for name, deg in zip(("neck01", "head"), LOOK):
    turn(pose[name], Matrix.Rotation(math.radians(deg), 4, side), world(pose[name]))

report = {}
for x in ("L", "R"):
    out = -1 if x == "L" else 1                      # the left side is towards -X at the piano

    # legs: knee forward and up, foot from the ankle to the ball, toes flat
    hip, upper, lower = world(pose[f"upperleg01.{x}"]), pose[f"upperleg01.{x}"], pose[f"lowerleg01.{x}"]
    ball = FEET[x]
    ankle_goal = ball + Vector((0, -FOOT_REACH, ANKLE_UP - (ball.z if x == "L" else 0)))
    knee, ankle = two_bone(hip, upper.length, lower.length, ankle_goal, hip + Vector((0, 0.5, 0.3)))
    aim(upper, knee)
    aim(lower, ankle)
    aim(pose[f"foot.{x}"], ball + Vector((0, 0, 0.02)))
    aim(pose[f"toe.{x}"], ball + Vector((0, 0.06, 0.012 + (ball.z if x == "R" else 0))))
    report["ankle miss mm " + x] = round((world(lower, "tail") - ankle_goal).length * 1000)

    # arms: elbow out, back and down; the forearm's two bones stay in line
    shoulder = world(pose[f"upperarm01.{x}"])
    ua, la1, la2 = pose[f"upperarm01.{x}"], pose[f"lowerarm01.{x}"], pose[f"lowerarm02.{x}"]
    pole = shoulder + Vector((0.3 * out, -0.2, -0.3))
    elbow, wrist = two_bone(shoulder, ua.length, la1.length + la2.length, WRIST[x], pole)
    aim(ua, elbow)
    aim(la1, wrist)
    # palm down, fingers to the keys: the wrist bone's Y forward and a little down, its Z (palm) down
    wb = pose[f"wrist.{x}"]
    y = Vector((0, 1, -0.15)).normalized()
    z = Vector((0, 0, -1))
    xa = y.cross(z).normalized()
    z = xa.cross(y)
    head = to_rig @ world(wb)
    wb.matrix = Matrix.Translation(head) @ (rig_rot @ Matrix((xa, y, z)).transposed()).to_4x4()
    view.update()
    report["wrist miss mm " + x] = round((world(wb) - WRIST[x]).length * 1000)
    report["reach " + x] = round((WRIST[x] - shoulder).length / (ua.length + la1.length + la2.length), 2)

print("pianist seated", report)
