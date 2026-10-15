"""Seat the pianist (pianist_rig.py) at the 88-key piano of piano_kit.py (PIANO "pianist_piano", STAGE).

Run inside Blender: exec(open(".../pianist_pose.py").read(), {...overrides}).
The rig turns to face the keys (+Y); the pelvis sits on the front half of the bench; legs and arms
are placed by an analytic two-bone IK (the same math the game will run): hip -> knee -> ankle with
the knee forward, shoulder -> elbow -> wrist with the elbow out and down. The spine leans forward,
the head looks down at the keys. Wrists go to WRIST targets above the keys, palms down; the left
sole stays flat on the floor, the right forefoot rests on the sustain footswitch.
"""
import bpy, math
from mathutils import Matrix, Quaternion, Vector

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
WRIST_MAX = math.radians(G.get("WRIST_MAX_DEG", 25))             # bend and deviation of the wrist together
TWIST_SHARE = 0.4                                                # of the pronation on the upper forearm bone
# Where the wrists go: x across the keyboard, y towards the keys, z up (world).
WRIST = G.get("WRIST", {"L": Vector((CENTRE - 0.17, KEY_FRONT - 0.11, KEY_TOP + 0.04)),
                        "R": Vector((CENTRE + 0.17, KEY_FRONT - 0.11, KEY_TOP + 0.04))})
HAND_FOLLOWS = 0.5      # how much of the forearm's turn across the keys the hand keeps; the wrist bends the rest
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


def half_bend(helper, a, joint, b):
    """Turns a joint helper (pianist_rig.py) half the bend between a->joint and joint->b."""
    axis = (joint - a).cross(b - joint)
    if axis.length > 1e-9:
        turn(helper, Matrix.Rotation((joint - a).angle(b - joint) / 2, 4, axis.normalized()), joint)


def hinge_to(upper, helper, lower_dir):
    """Turns the upper bone about its own axis (the humerus or the femur rotating in its socket) so
    the joint's hinge (the helper's X axis, pianist_rig.py) stands square to the bend: the lower bone
    then swings in the joint's own plane and the bony point stays behind the bend."""
    axis = (world(upper, "tail") - world(upper)).normalized()
    want = lower_dir.cross(axis)
    have = rig.matrix_world.to_3x3() @ helper.matrix.to_3x3().col[0]
    want, have = (v - axis * v.dot(axis) for v in (want, have))
    if want.length > 1e-6 and have.length > 1e-6:
        angle = have.angle(want)
        if have.cross(want).dot(axis) < 0:
            angle = -angle
        turn(upper, Matrix.Rotation(angle, 4, axis), world(upper))


def bend_keys(joint, x, bend_deg):
    """Blends the joint's corrective shapes (pianist_rig.py) by the bend between its two bones: from
    the rest pose's bend through each key's angle, one key at a time."""
    keys = bpy.data.objects["PianistBody"].data.shape_keys
    if not keys:
        return
    named = sorted((int(k.name.rsplit("-", 1)[1]), k) for k in keys.key_blocks if k.name.startswith(f"{joint}.{x}-"))
    up, low = {"elbow": ("upperarm01", "lowerarm01"), "knee": ("upperleg01", "lowerleg01")}[joint]
    bu, bl = rig.data.bones[f"{up}.{x}"], rig.data.bones[f"{low}.{x}"]
    rest = math.degrees((bu.tail_local - bu.head_local).angle(bl.tail_local - bl.head_local))
    angles = [rest] + [a for a, _ in named]
    for i, (a, k) in enumerate(named, 1):
        lo, hi = angles[i - 1], angles[i + 1] if i + 1 < len(angles) else None
        if bend_deg <= lo:
            k.value = 0.0
        elif bend_deg <= a:
            k.value = (bend_deg - lo) / (a - lo)
        else:
            k.value = 1.0 if hi is None else max(0.0, (hi - bend_deg) / (hi - a))
    report[f"{joint} bend deg {x}"] = round(bend_deg)


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


def place_arm(x, spread):
    """Shoulder -> elbow -> wrist by two-bone IK, the elbow out by `spread` (metres of pole offset),
    then the palm turned down by the forearm and bent by the wrist."""
    out = -1 if x == "L" else 1
    for name in ("upperarm01", "lowerarm01", "lowerarm02", "wrist", "elbow"):
        pose[f"{name}.{x}"].matrix_basis = Matrix.Identity(4)
    view.update()
    # arms: elbow out, back and down; the forearm's two bones stay in line
    shoulder = world(pose[f"upperarm01.{x}"])
    ua, la1, la2 = pose[f"upperarm01.{x}"], pose[f"lowerarm01.{x}"], pose[f"lowerarm02.{x}"]
    pole = shoulder + Vector((spread * out, -0.2, -0.3))
    elbow, wrist = two_bone(shoulder, ua.length, la1.length + la2.length, WRIST[x], pole)
    aim(ua, elbow)
    hinge_to(ua, pose[f"elbow.{x}"], (wrist - elbow).normalized())
    aim(la1, wrist)
    half_bend(pose[f"elbow.{x}"], shoulder, elbow, wrist)
    bend_keys("elbow", x, math.degrees((elbow - shoulder).angle(wrist - elbow)))
    # palm down, fingers to the keys: the wrist bone's Y forward and a little down, its Z (palm) down.
    # The forearm turns the palm (pronation: twist about its own axis, shared by its two bones as the
    # radius rolls over the ulna); the wrist only bends. One bone taking it all folds the skin.
    wb = pose[f"wrist.{x}"]
    axis = (wrist - elbow).normalized()
    flat = Vector((axis.x, axis.y, 0)).normalized()
    y = (Vector((0, 1, 0)).lerp(flat, HAND_FOLLOWS).normalized() + Vector((0, 0, -0.15))).normalized()
    z = Vector((0, 0, -1))
    xa = y.cross(z).normalized()
    z = xa.cross(y)
    want = Matrix((xa, y, z)).transposed().to_quaternion()
    have = lambda: (rig.matrix_world @ wb.matrix).to_quaternion()
    q = want @ have().inverted()
    if q.w < 0:
        q.negate()                      # the short way round
    along = Vector((q.x, q.y, q.z)).dot(axis)
    twist = 2 * math.atan2(along, q.w)
    for bone_, share, pivot in ((la1, TWIST_SHARE, elbow), (la2, 1 - TWIST_SHARE, world(la2))):
        turn(bone_, Matrix.Rotation(twist * share, 4, axis), pivot)
    swing = want @ have().inverted()
    if swing.w < 0:
        swing.negate()
    if swing.angle > WRIST_MAX:         # a wrist bends this far at most; the hand keeps the rest
        swing = Quaternion().slerp(swing, WRIST_MAX / swing.angle)
    turn(wb, swing.to_matrix().to_4x4(), world(wb))
    report["pronation deg " + x] = round(math.degrees(twist))
    report["wrist bend deg " + x] = round(math.degrees(swing.angle))
    report["wrist miss mm " + x] = round((world(wb) - WRIST[x]).length * 1000)
    report["reach " + x] = round((WRIST[x] - shoulder).length / (ua.length + la1.length + la2.length), 2)


report = {}
for x in ("L", "R"):
    out = -1 if x == "L" else 1                      # the left side is towards -X at the piano

    # legs: knee forward and up, foot from the ankle to the ball, toes flat
    hip, upper, lower = world(pose[f"upperleg01.{x}"]), pose[f"upperleg01.{x}"], pose[f"lowerleg01.{x}"]
    ball = FEET[x]
    ankle_goal = ball + Vector((0, -FOOT_REACH, ANKLE_UP - (ball.z if x == "L" else 0)))
    knee, ankle = two_bone(hip, upper.length, lower.length, ankle_goal, hip + Vector((0, 0.5, 0.3)))
    aim(upper, knee)
    hinge_to(upper, pose[f"knee.{x}"], (ankle - knee).normalized())
    aim(lower, ankle)
    half_bend(pose[f"knee.{x}"], hip, knee, ankle)
    bend_keys("knee", x, math.degrees((knee - hip).angle(ankle - knee)))
    aim(pose[f"foot.{x}"], ball + Vector((0, 0, 0.02)))
    aim(pose[f"toe.{x}"], ball + Vector((0, 0.06, 0.012 + (ball.z if x == "R" else 0))))
    report["ankle miss mm " + x] = round((world(lower, "tail") - ankle_goal).length * 1000)



# --- arms must not go into the body: arm skin against the trunk and thighs on the deformed mesh
ARM_BONES = ("upperarm01", "lowerarm01", "lowerarm02", "wrist", "metacarpal", "finger")
ARMPIT = 0.45           # of the upper arm from the shoulder: closer in, skin meets the chest anyway
SKIN_TOL = 0.004        # forearm and hand skin may press this deep into the trunk
UPPER_TOL = 0.012       # the upper arm rests on the side of the chest: soft on soft, it gives more


def penetration():
    """Deepest arm vertex inside the trunk or thighs per side, in metres, on the posed mesh."""
    from mathutils.bvhtree import BVHTree
    body = bpy.data.objects["PianistBody"]
    subs = [m for m in body.modifiers if m.type == "SUBSURF"]
    for m in subs:
        m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    co = [body.matrix_world @ v.co for v in me.vertices]
    names = {g.index: g.name for g in body.vertex_groups}
    owner = []
    for v in body.data.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        owner.append(names[best.group] if best else "")
    arm = {i for i, n in enumerate(owner) if n.split(".")[0].rstrip("0123456789-") in
           ("upperarm", "lowerarm", "elbow", "wrist", "metacarpal", "finger")}
    trunk_faces = [tuple(p.vertices) for p in me.polygons if not arm.intersection(p.vertices)]
    bvh = BVHTree.FromPolygons(co, trunk_faces)
    worst = {"L": (0.0, None), "R": (0.0, None)}
    for i in arm:
        name = owner[i]
        x = name[-1]
        if name.startswith("upperarm"):
            sh = world(pose[f"upperarm01.{x}"])
            el = world(pose[f"upperarm01.{x}"], "tail")
            t = (co[i] - sh).dot(el - sh) / (el - sh).length_squared
            if t < ARMPIT:
                continue
        hit = bvh.find_nearest(co[i], 0.08)
        if hit[0] is None:
            continue
        depth = -(co[i] - hit[0]).dot(hit[1])
        over = depth - (UPPER_TOL if name.startswith("upperarm") else SKIN_TOL)
        if over > worst[x][0]:
            worst[x] = (over, name)
    ev.to_mesh_clear()
    for m in subs:
        m.show_viewport = True
    return worst


# Elbows hang by the trunk and move out only until no arm skin is inside it (beyond SKIN_TOL).
SPREAD0, SPREAD_STEP, SPREAD_MAX = 0.02, 0.04, 1.2     # elbows start at the trunk (piano technique)
for x in ("L", "R"):
    spread = SPREAD0
    place_arm(x, spread)
    while True:
        depth, part = penetration()[x]       # beyond its tolerance
        if depth <= 0 or spread >= SPREAD_MAX:
            break
        spread += SPREAD_STEP
        place_arm(x, spread)
    report["arm past tolerance mm " + x] = (round(depth * 1000, 1), part)
    report["elbow spread " + x] = round(spread, 2)
print("pianist seated", report)
