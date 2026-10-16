"""Seat the pianist (pianist_rig.py) at the 88-key piano of piano_kit.py (PIANO "pianist_piano", STAGE).

Run inside Blender: exec(open(".../pianist_pose.py").read(), {...overrides}).
The rig turns to face the keys (+Y); the pelvis sits on the front half of the bench; legs and arms
are placed by an analytic two-bone IK (the same math the game will run): hip -> knee -> ankle with
the knee forward, shoulder -> elbow -> wrist with the elbow out and down. The body follows the hands:
the pelvis slides on the bench, the spine leans and turns, the clavicles reach, the head looks at the
hands. Wrists go to WRIST targets above the keys, palms down; the left
sole stays flat on the floor, the right forefoot rests on the sustain footswitch.
"""
import bpy, math, os
from mathutils import Matrix, Quaternion, Vector

G = globals()
KEY_TOP, KEY_FRONT, X0, WHITE_W = 0.74, 0.30, 0.36, 0.0235
BENCH_H, BENCH_GAP = G.get("BENCH_H", 0.49), G.get("BENCH_GAP", 0.32)
CENTRE = (X0 + (-28 + 5) * WHITE_W + X0 + 28 * WHITE_W) / 2     # between A0 and C8
HIP_ABOVE_SEAT = G.get("HIP_ABOVE_SEAT", 0.10)                   # hip joints over the seat
HIP_BEHIND_EDGE = G.get("HIP_BEHIND_EDGE", 0.10)                 # ...and behind its front edge
LEAN = G.get("LEAN", (4, 4, 3))                                  # spine01..03 forward, degrees
PEDAL_X, PEDAL_BACK, PEDAL_TOP = 0.16, KEY_FRONT + 0.15, 0.045
ANKLE_UP, FOOT_REACH = 0.075, 0.15                               # ankle over the floor; ankle -> ball
WRIST_MAX = math.radians(G.get("WRIST_MAX_DEG", 25))             # the wrist's flexion and extension
ULNAR_MAX = math.radians(G.get("ULNAR_MAX_DEG", 35))             # its deviation towards the little finger
RADIAL_MAX = math.radians(G.get("RADIAL_MAX_DEG", 20))           # ...and towards the thumb
HAND_YAW_FREE = math.radians(30)        # the hand may turn this far off its register yaw towards the forearm
# The hand turns to the keys with the register, fitted to a pianist filmed from above (Seven Nation Army
# capture v3, 1238 onsets, wrist -> middle knuckle; the filmed pianist's shoulders put where this body
# puts them for the same two hands): (white keys from its own shoulder to the hand's middle, + to the
# treble; degrees, + fingers to the bass), straight between knots, flat past the ends. In towards the
# middle both hands turn about a degree a key, the right reaching into the bass alone far more; out
# past the shoulder the left points to the bass, the right stays nearly square. Never past HAND_YAW_MAX
# (the fingers still play along the keys; the wrist takes the forearm's angle beyond it).
REGISTER_YAW = G.get("REGISTER_YAW", {"L": ((-13, 12), (-4, 12), (0, 2), (8, -6)),
                                      "R": ((-15, 46), (-11, 13), (-3, 0), (1, -2), (9, -4))})
HAND_YAW_MAX = math.radians(G.get("HAND_YAW_MAX_DEG", 45))
ACROSS_MAX = G.get("ACROSS_MAX_DEG", 45)  # the upper arm in across the chest past straight forward, degrees
TWIST_MAX = G.get("TWIST_MAX_DEG", 60)    # the upper arm's twist in its socket that brings the elbow's hinge round
CHEST_FRONT = 0.12                        # an elbow in towards the midline stays this far in front of the shoulder
TWIST_SHARE = 0.4                                                # of the pronation on the upper forearm bone
# HANDS: finger -> semitone from C4 per hand; by default the five-finger position, every finger
# resting on its key (KEY_DIP 0: nothing pressed). The body follows them; SOLVE_HANDS False leaves the
# fingers out (the body alone, a quick run).
HANDS = G.get("HANDS", {"L": {1: -5, 2: -7, 3: -8, 4: -10, 5: -12}, "R": {1: 0, 2: 2, 3: 4, 4: 5, 5: 7}})
SOLVE_HANDS = G.get("SOLVE_HANDS", True)
ROOT = G.get("ROOT", r"E:/MySource/ReactJS/piano-trainer")
kb = {}
exec(open(os.path.join(ROOT, "tools/hand-rig/hand_keys.py"), encoding="utf-8").read(), kb)
HAND_X = {x: sum(kb["key_of"](s)[0] for s in keys.values()) / len(keys) for x, keys in HANDS.items()}
# Where the wrists go: x across the keyboard, y towards the keys, z up (world); by default behind the
# middle of the hand's keys (the hand solver moves them on).
WRIST = G.get("WRIST", {x: Vector((HAND_X.get(x, CENTRE + (-0.17 if x == "L" else 0.17)), KEY_FRONT - 0.11,
                                   KEY_TOP + 0.04)) for x in ("L", "R")})
HAND_FOLLOWS = 1.0      # how much of the forearm's turn across the keys the hand keeps; the wrist bends the rest
                        # sideways. A pianist's hand goes on in the forearm's line: half of it bent the wrist aside
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
        return angle
    return 0.0


def bend_keys(joint, x, bend_deg):
    """Blends the joint's corrective shapes (pianist_rig.py) by the bend between its two bones: from
    the rest pose's bend through each key's angle, one key at a time."""
    keys = bpy.data.objects["PianistBody"].data.shape_keys
    if not keys:
        return
    named = sorted((int(k.name.rsplit("-", 1)[1]), k) for k in keys.key_blocks if k.name.startswith(f"{joint}.{x}-"))
    if joint == "hip":
        rest = 0.0                      # the hip's bend is taken from the thigh's rest direction
    else:
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


def smooth(a, b, x):
    u = min(max((x - a) / (b - a), 0.0), 1.0)
    return u * u * (3 - 2 * u)


def thumb_side(x):
    """The wrist bone's own direction across the palm towards the thumb (its Y runs along the hand)."""
    b = rig.data.bones
    v = b[f"wrist.{x}"].matrix_local.to_3x3().inverted() @ (b[f"finger2-1.{x}"].head_local - b[f"finger5-1.{x}"].head_local)
    v.y = 0
    return v.normalized()


THUMB_SIDE = {x: thumb_side(x) for x in ("L", "R")}
WRIST_NORM = 4


def register_yaw(x, shoulder):
    """The hand's neutral turn on the keys, radians, + counter-clockwise from above (fingers to the bass):
    REGISTER_YAW at the middle of its keys (the wrist's x without them) from the shoulder."""
    u = (HAND_X.get(x, WRIST[x].x) - shoulder.x) / WHITE_W
    knots = REGISTER_YAW[x]
    deg = knots[0][1] if u <= knots[0][0] else knots[-1][1]
    for (u0, d0), (u1, d1) in zip(knots, knots[1:]):
        if u0 <= u <= u1:
            deg = d0 + (d1 - d0) * (u - u0) / (u1 - u0)
    return min(max(math.radians(deg), -HAND_YAW_MAX), HAND_YAW_MAX)


def wrist_load(x, rest, now):
    """How hard the wrist bends, 1 at its limit: `rest`, `now` the forearm's direction in the wrist bone's
    frame with the hand as at rest on it and as placed. The forearm turned towards the thumb side is the
    hand deviated towards the little finger (ulnar, up to ULNAR_MAX), the other way RADIAL_MAX; flexion
    either way WRIST_MAX; a rounded box between (WRIST_NORM): a little flexion hardly limits deviation,
    an ellipse held the hand short of the keys. Deviation counts from the straight hand (the wrist bone's
    Y, the middle metacarpal, along the forearm), not from rest: the rest hand is turned to the thumb
    side (L 6, R 12 degrees), which ate that much of the ulnar range. Returns (load, ulnar deviation,
    flexion) in radians."""
    s = THUMB_SIDE[x]
    n = Vector((0, 1, 0)).cross(s)
    dev = math.atan2(now.dot(s), now.y)
    flex = math.atan2(now.dot(n), now.y) - math.atan2(rest.dot(n), rest.y)
    load = (abs(dev / (ULNAR_MAX if dev > 0 else RADIAL_MAX)) ** WRIST_NORM + abs(flex / WRIST_MAX) ** WRIST_NORM)
    return load ** (1 / WRIST_NORM), dev, flex


# --- the body follows the hands. The pelvis slides along the bench and turns a little, the spine leans
# forward (LEAN at rest), sideways and turns, the clavicles bring a far hand's shoulder out towards it,
# the head looks at the hands. A small search over (slide, yaw, side lean, extra forward lean) keeps each
# arm's reach (shoulder to wrist over the arm's length) under REACH_COMFY at the least body motion, the
# trunk turned FACE of the way towards the hands. The search turns the joints' points the way the bones
# will turn, without touching the rig; the bones then take the found turns.
report = {}
side = rig.matrix_world.to_3x3() @ Vector((1, 0, 0))            # the rig's side axis: a turn about it leans forward
REACH_COMFY = G.get("REACH_COMFY", 0.80)
REACH_SIGMA = 0.03                       # reach past REACH_COMFY that costs as much as one SIGMA of body motion
FACE = G.get("FACE", 0.3)                # of the angle to the hands' middle the trunk turns on its own
HEAD_FOLLOW = G.get("HEAD_FOLLOW", 0.6)  # of the turn to look at the hands the neck and head take; the eyes the rest
SIGMA = (0.05, 20, 8, 8)                 # slide m, yaw, side lean, forward lean degrees
LOW = (-0.10, -35, -15, -4)              # the seat's half width less the buttocks'; a spine's comfortable range
HIGH = (0.10, 35, 15, 15)
SPINE = ("spine01", "spine02", "spine03")
YAW_SHARE = {"pelvis": 0.2, "spine01": 0.15, "spine02": 0.35, "spine03": 0.3}   # the lumbar spine turns least
SIDE_SHARE = dict(zip(SPINE, (0.4, 0.4, 0.2)))
LEAN_OF = dict(zip(SPINE, LEAN))
FWD_SHARE = {n: d / sum(LEAN) for n, d in LEAN_OF.items()}
CLAV_FROM, CLAV_MAX = 0.7, math.radians(18)     # a clavicle reaches from this reach on, this far at most
TRACK = ("pelvis", *SPINE, "neck01", "head", "clavicle.L", "clavicle.R", "upperarm01.L", "upperarm01.R")
UNDER = {n: [c.name for c in rig.data.bones[n].children_recursive if c.name in TRACK] for n in TRACK}
ARM = {x: sum(pose[f"{n}.{x}"].length for n in ("upperarm01", "lowerarm01", "lowerarm02")) for x in ("L", "R")}
REST = {n: world(pose[n]) for n in TRACK}
mid = sum((WRIST[x] for x in HANDS), Vector()) / max(len(HANDS), 1) if HANDS else REST["spine03"] + Vector((0, 1, 0))
YAW_GOAL = math.degrees(math.atan2(mid.x - REST["pelvis"].x, mid.y - REST["pelvis"].y))


def body_turns(p):
    """The bones' world turns for p = (slide, yaw, side lean, forward lean), root first; yaw > 0 turns
    towards +X (the treble), side lean > 0 leans that way."""
    _, yaw, lean, fwd = p
    turns = []
    for name in ("pelvis", *SPINE):
        r = Matrix.Rotation(-math.radians(yaw * YAW_SHARE[name]), 3, "Z")
        if name != "pelvis":
            r = r @ Matrix.Rotation(math.radians(lean * SIDE_SHARE[name]), 3, "Y") \
                  @ Matrix.Rotation(math.radians(LEAN_OF[name] + fwd * FWD_SHARE[name]), 3, side)
        turns.append((name, r))
    return turns


def clavicle_turn(x, pts):
    """The clavicle's turn bringing the shoulder towards a far wrist: none up to reach CLAV_FROM, CLAV_MAX
    at full reach."""
    c, s = pts[f"clavicle.{x}"], pts[f"upperarm01.{x}"]
    a, b = s - c, WRIST[x] - c
    k = smooth(CLAV_FROM, 1.0, (WRIST[x] - s).length / ARM[x])
    axis = a.cross(b)
    if k == 0 or axis.length < 1e-9:
        return Matrix.Identity(3), s
    r = Matrix.Rotation(min(a.angle(b), CLAV_MAX) * k, 3, axis.normalized())
    return r, c + r @ a


def simulate(p):
    """The tracked joints after the body's turns, and the chest's turn (world)."""
    pts = {n: v + Vector((p[0], 0, 0)) for n, v in REST.items()}
    chest = Matrix.Identity(3)
    for name, r in body_turns(p):
        pivot = pts[name]
        for d in UNDER[name]:
            pts[d] = pivot + r @ (pts[d] - pivot)
        chest = r @ chest
    return pts, chest


def arm_room(x, shoulder, chest):
    """How badly the arm fits, 0 if some elbow on its IK circle lets the hand take its register's yaw
    (the wrist's deviation within its limit and HAND_YAW_FREE), keeps an elbow in towards the midline
    CHEST_FRONT in front of the shoulder and the upper arm within ACROSS_MAX: a hand reaching across the
    body needs the room in front of the chest. Sums of the overshoots in units of 5 degrees and 2 cm, the best elbow."""
    out = -1 if x == "L" else 1
    ua = pose[f"upperarm01.{x}"].length
    la = ARM[x] - ua
    d = WRIST[x] - shoulder
    dist = min(d.length, (ua + la) * 0.999)
    u = d.normalized()
    along = (ua * ua - la * la + dist * dist) / (2 * dist)
    h = math.sqrt(max(ua * ua - along * along, 0.0))
    a = u.cross(Vector((0, 0, 1))).normalized()
    b = u.cross(a)
    to_chest = chest.inverted()
    yaw = register_yaw(x, shoulder)
    best = float("inf")
    for k in range(24):
        t = k * math.pi / 12
        elbow = shoulder + u * along + (a * math.cos(t) + b * math.sin(t)) * h
        f = shoulder + u * dist - elbow
        ulnar = -out * (math.atan2(f.x, f.y) + yaw)
        dev = max(0.0, ulnar - HAND_YAW_FREE - ULNAR_MAX, -ulnar - HAND_YAW_FREE - RADIAL_MAX)
        e = to_chest @ (elbow - shoulder)
        medial = -out * e.x
        across = math.degrees(math.asin(max(-1.0, min(1.0, medial / ua))))
        bad = math.degrees(dev) / 5 + max(0.0, across - ACROSS_MAX) / 5
        if medial > 0.03:
            bad += max(0.0, CHEST_FRONT - e.y) / 0.02
        best = min(best, bad)
    return best


def body_cost(p):
    pts, chest = simulate(p)
    c = 0.0
    for x in HANDS:
        shoulder = clavicle_turn(x, pts)[1]
        reach = (WRIST[x] - shoulder).length / ARM[x]
        c += (max(0.0, reach - REACH_COMFY) / REACH_SIGMA) ** 2 + arm_room(x, shoulder, chest) ** 2
    goal = (0.0, FACE * YAW_GOAL, 0.0, 0.0)
    return c + sum(((v - g) / s) ** 2 for v, g, s in zip(p, goal, SIGMA))


def solve_body():
    """Coordinate search with halving steps: four smooth parameters, a few hundred cheap evaluations."""
    p, step = [0.0] * 4, [0.02, 4.0, 2.0, 2.0]
    best = body_cost(p)
    for _ in range(8):
        better = True
        while better:
            better = False
            for i in range(4):
                for s in (step[i], -step[i]):
                    q = list(p)
                    q[i] = min(max(q[i] + s, LOW[i]), HIGH[i])
                    c = body_cost(q)
                    if c < best - 1e-12:
                        p, best, better = q, c, True
        step = [s / 2 for s in step]
    return p


BODY = G.get("BODY") or solve_body()
BODY_TURN = Matrix.Rotation(-math.radians(BODY[1]), 3, "Z")     # the trunk's turn: the elbows' poles turn with it
sim, sim_chest = simulate(BODY)
pb = pose["pelvis"]
pb.matrix = Matrix.Translation(rig_rot @ Vector((BODY[0], 0, 0))) @ pb.matrix
view.update()
for name, r in body_turns(BODY):
    turn(pose[name], r.to_4x4(), world(pose[name]))
for x in ("L", "R"):
    r, _ = clavicle_turn(x, {n: world(pose[n]) for n in TRACK})
    turn(pose[f"clavicle.{x}"], r.to_4x4(), world(pose[f"clavicle.{x}"]))
    report["clavicle deg " + x] = round(math.degrees(r.to_quaternion().angle), 1)
    report["reach before arms " + x] = round((WRIST[x] - world(pose[f"upperarm01.{x}"])).length / ARM[x], 2)
report["body"] = {"slide mm": round(BODY[0] * 1000), "yaw deg": round(BODY[1], 1), "side lean deg": round(BODY[2], 1),
                  "forward extra deg": round(BODY[3], 1), "yaw goal deg": round(YAW_GOAL, 1),
                  "search vs bones mm": round(max((sim[n] - world(pose[n])).length for n in TRACK[:6]) * 1000, 2)}


def look_at_hands():
    """Neck and head turn HEAD_FOLLOW of the way to look at the middle of the hands' keys: across
    (about the vertical) first, then down (about the face's side axis), split between the two bones."""
    eyes = [o for o in rig.children if ".eye." in o.name]
    eye = sum((o.matrix_world.translation for o in eyes), Vector()) / len(eyes) if eyes else world(pose["head"])
    keys_x = sum(HAND_X.values()) / len(HAND_X) if HAND_X else CENTRE
    look = Vector((keys_x, KEY_FRONT + 0.04, KEY_TOP)) - eye
    rest = rig.data.bones["head"].matrix_local.to_3x3()

    def face():
        return (rig_rot.inverted() @ pose["head"].matrix.to_3x3() @ rest.inverted() @ rig_rot) @ Vector((0, 1, 0))

    f = face()
    across = math.atan2(f.x * look.y - f.y * look.x, f.x * look.x + f.y * look.y)
    for name, share in (("neck01", 0.4), ("head", 0.6)):
        turn(pose[name], Matrix.Rotation(across * HEAD_FOLLOW * share, 4, "Z"), world(pose[name]))
    f = face()
    down = math.asin(look.normalized().z) - math.asin(f.z)
    axis = f.cross(Vector((0, 0, 1))).normalized()
    for name, share in (("neck01", 0.4), ("head", 0.6)):
        turn(pose[name], Matrix.Rotation(down * HEAD_FOLLOW * share, 4, axis), world(pose[name]))
    report["head"] = {"across deg": round(math.degrees(across * HEAD_FOLLOW), 1),
                      "down deg": round(math.degrees(down * HEAD_FOLLOW), 1)}


look_at_hands()


def pole_of(x, spread, swing, shoulder, wrist_goal):
    """Where the elbow bends to: out by `spread` (metres), back and down in the trunk's frame, swung
    `swing` degrees round the shoulder -> wrist line."""
    offset = BODY_TURN @ Vector((spread * (-1 if x == "L" else 1), -0.2, -0.3))
    if swing:
        offset = Matrix.Rotation(math.radians(swing), 3, (wrist_goal - shoulder).normalized()) @ offset
    return shoulder + offset


SHOULDER = {}   # per side: the upper arm across the chest and its twist in the socket, degrees
LOAD = {}       # per side: the wrist's load (wrist_load) for the hand wanted and for the hand facing the keys


def place_arm(x, spread, want=None, swing=0.0):
    """Shoulder -> elbow -> wrist by two-bone IK, the elbow out by `spread` (metres of pole offset) and
    swung by `swing` (pole_of), then the palm turned down by the forearm and bent by the wrist; `want`:
    the wrist bone's world rotation, if the hand solver has one."""
    for name in ("upperarm01", "lowerarm01", "lowerarm02", "wrist", "elbow"):
        pose[f"{name}.{x}"].matrix_basis = Matrix.Identity(4)
    view.update()
    # arms: elbow out, back and down; the forearm's two bones stay in line
    shoulder = world(pose[f"upperarm01.{x}"])
    ua, la1, la2 = pose[f"upperarm01.{x}"], pose[f"lowerarm01.{x}"], pose[f"lowerarm02.{x}"]
    pole = pole_of(x, spread, swing, shoulder, WRIST[x])
    elbow, wrist = two_bone(shoulder, ua.length, la1.length + la2.length, WRIST[x], pole)
    aim(ua, elbow)
    twist_ua = hinge_to(ua, pose[f"elbow.{x}"], (wrist - elbow).normalized())
    # the shoulder as the trunk sees it: the upper arm's angle in towards the midline (across the chest)
    chest = rig.matrix_world.to_3x3() @ (pose["spine03"].matrix.to_3x3() @ pose["spine03"].bone.matrix_local.to_3x3().inverted())         @ rig.matrix_world.to_3x3().inverted()
    d = chest.inverted() @ (elbow - shoulder).normalized()
    SHOULDER[x] = {"across": math.degrees(math.asin(max(-1.0, min(1.0, -d.x * (-1 if x == "L" else 1))))),
                   "twist": math.degrees(twist_ua)}
    aim(la1, wrist)
    half_bend(pose[f"elbow.{x}"], shoulder, elbow, wrist)
    bend_keys("elbow", x, math.degrees((elbow - shoulder).angle(wrist - elbow)))
    # palm down, fingers to the keys: the wrist bone's Y forward and a little down, its Z (palm) down.
    # The forearm turns the palm (pronation: twist about its own axis, shared by its two bones as the
    # radius rolls over the ulna); the wrist only bends. One bone taking it all folds the skin.
    wb = pose[f"wrist.{x}"]
    axis = (wrist - elbow).normalized()
    if want is None:
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
    rest_axis = have().to_matrix().inverted() @ axis
    load, dev, flex = wrist_load(x, rest_axis, want.to_matrix().inverted() @ axis)
    # the hand at its register's yaw on the keys, palm down: only its deviation counts, the hand solver
    # picks the pitch itself
    yaw = register_yaw(x, shoulder)
    y = Matrix.Rotation(yaw, 3, "Z") @ Vector((0, 1, -0.15)).normalized()
    xa = y.cross(Vector((0, 0, -1))).normalized()
    keys = Matrix((xa, y, xa.cross(y))).transposed()
    keys_dev = wrist_load(x, rest_axis, keys.inverted() @ axis)[1]
    LOAD[x] = {"wanted": load, "keys": max(0.0, abs(keys_dev) - HAND_YAW_FREE) / (ULNAR_MAX if keys_dev > 0 else RADIAL_MAX)}
    report["register yaw deg " + x] = round(math.degrees(yaw), 1)
    report["wrist wanted deg " + x] = {"ulnar": round(math.degrees(dev)), "flex": round(math.degrees(flex))}
    if load > 1:                       # the wrist bends this far at most; the hand keeps the rest
        swing = Quaternion().slerp(swing, 1 / load)
    turn(wb, swing.to_matrix().to_4x4(), world(wb))
    _, dev, flex = wrist_load(x, rest_axis, have().to_matrix().inverted() @ axis)
    report["pronation deg " + x] = round(math.degrees(twist))
    report["wrist bend deg " + x] = {"ulnar": round(math.degrees(dev)), "flex": round(math.degrees(flex))}
    report["wrist miss mm " + x] = round((world(wb) - WRIST[x]).length * 1000)
    report["reach " + x] = round((WRIST[x] - shoulder).length / (ua.length + la1.length + la2.length), 2)


for x in ("L", "R"):
    out = -1 if x == "L" else 1                      # the left side is towards -X at the piano

    # legs: knee forward and up, foot from the ankle to the ball, toes flat
    hip, upper, lower = world(pose[f"upperleg01.{x}"]), pose[f"upperleg01.{x}"], pose[f"lowerleg01.{x}"]
    ball = FEET[x]
    ankle_goal = ball + Vector((0, -FOOT_REACH, ANKLE_UP - (ball.z if x == "L" else 0)))
    knee, ankle = two_bone(hip, upper.length, lower.length, ankle_goal, hip + Vector((0, 0.5, 0.3)))
    pelvis_turn = (rig.matrix_world @ pose["pelvis"].matrix @ pose["pelvis"].bone.matrix_local.inverted()).to_3x3()
    thigh_rest = pelvis_turn @ (upper.bone.tail_local - upper.bone.head_local)
    aim(upper, knee)
    if f"hip.{x}" in pose:
        half_bend(pose[f"hip.{x}"], hip - thigh_rest, hip, knee)
        bend_keys("hip", x, math.degrees(thigh_rest.angle(knee - hip)))
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
PEN_SLACK = 0.001       # past the tolerances: the measure jitters by a fraction of a millimetre from pose to pose,
                        # and every elbow step out for it bends the wrist some 4-5 degrees further
PEN_GAIN = 0.0005       # a step out that takes less than this off the depth stops the elbow: what is left sits
                        # by the armpit, where the elbow going out hardly moves the skin (a 1 mm plateau out to 0.54)


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
        best = max((g for g in v.groups if names[g.group] in rig.data.bones), key=lambda g: g.weight, default=None)
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
SPREAD_OF = {}


SWING_OF = {}
TRIED = {}
SWINGS = G.get("SWINGS", [s * k for k in range(20, 161, 20) for s in (1, -1)])    # degrees round the shoulder -> wrist line


def fit_elbow(x, want=None, spread=SPREAD0, swing=0.0):
    """The elbow at `swing`, out from `spread` until no arm skin is in the trunk. A wrist that would bend
    past its limits there (for `want`, or with no hand solved yet for the hand facing the keys: a hand
    reaching across the body) has the elbow swung round instead, behind the hand and in front of the
    trunk: the least swing that frees the wrist, else the swing that loads it least."""
    def fit(sw):
        sp = spread
        place_arm(x, sp, want, sw)
        last = None
        while True:
            depth, part = penetration()[x]       # beyond its tolerance
            if depth <= PEN_SLACK or sp >= SPREAD_MAX or (last is not None and last - depth < PEN_GAIN):
                break
            last = depth
            sp += SPREAD_STEP
            place_arm(x, sp, want, sw)
        return sp, depth, part, LOAD[x]["keys" if want is None else "wanted"], dict(SHOULDER[x])

    tried = {swing: fit(swing)}
    TRIED[x] = tried
    if tried[swing][3] > 1:
        for sw in SWINGS:
            if sw != swing:
                tried[sw] = fit(sw)
        clear = [sw for sw, t in tried.items() if t[1] <= PEN_SLACK and (sw == 0 or (t[4]["across"] <= ACROSS_MAX
                                                                          and abs(t[4]["twist"]) <= TWIST_MAX))]
        free = [sw for sw in clear if tried[sw][3] <= 1]
        if free:
            swing = min(free, key=abs)
        elif clear:
            swing = min(clear, key=lambda sw: tried[sw][3])
        sp, depth, part, load, _ = tried[swing]
        place_arm(x, sp, want, swing)
    sp, depth, part, load, _ = tried[swing]
    SPREAD_OF[x], SWING_OF[x] = sp, swing
    report["arm past tolerance mm " + x] = (round(depth * 1000, 1), part)
    report["elbow spread " + x] = round(sp, 2)
    report["elbow swing deg " + x] = swing
    report["wrist load " + x] = round(load, 2)


for x in ("L", "R"):
    fit_elbow(x)


# --- the seat is soft, and so is the pianist. Skin below the seat's top is flattened onto it, a little
# under, where the cushion gives (SEAT_GIVE); the flesh pressed away bulges round the contact, and the
# cushion is dented under it. The body's part is a shape key "seat", taken back through the skinning
# as pianist_rig.py's joint keys are; the dent goes into the seat's own copy of the bench mesh.
SEAT_GIVE = G.get("SEAT_GIVE", 0.008)
DENT_R = 0.03                   # the dent's edge: from full depth under the contact to none
BULGE_H, BULGE_R = 0.12, 0.12   # the pressed flesh bulges this high above the contact and this far round it


def sit():
    from mathutils.kdtree import KDTree
    body = bpy.data.objects["PianistBody"]
    blocks = body.data.shape_keys.key_blocks
    if "seat" in blocks:
        body.shape_key_remove(blocks["seat"])
    seat = next(o for o in bpy.data.collections["piano"].all_objects if o.name.startswith("bench"))
    old = seat.data if seat.data.name == "bench-seated" else None
    seat.data = bpy.data.meshes["bench"].copy()
    if old:
        bpy.data.meshes.remove(old)
    seat.data.name = "bench-seated"
    cushion = [v for v in seat.data.vertices if abs(v.co.z) < 1e-6]
    xs = [(seat.matrix_world @ v.co) for v in cushion]
    x0, x1 = min(p.x for p in xs), max(p.x for p in xs)
    y0, y1 = min(p.y for p in xs), max(p.y for p in xs)
    top = seat.matrix_world.translation.z
    plane = top - SEAT_GIVE

    subs = [m for m in body.modifiers if m.type == "SUBSURF"]
    for m in subs:
        m.show_viewport = False
    view.update()
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    rot = body.matrix_world.to_3x3()
    co = [body.matrix_world @ v.co for v in me.vertices]
    normals = [(rot @ v.normal).normalized() for v in me.vertices]
    area = [0.0] * len(co)
    for poly in me.polygons:
        for vi in poly.vertices:
            area[vi] += poly.area / len(poly.vertices)
    ev.to_mesh_clear()

    contact = [i for i, p in enumerate(co) if x0 <= p.x <= x1 and y0 <= p.y <= y1 and top - 0.1 < p.z < plane]
    delta = {i: Vector((0, 0, plane - co[i].z)) for i in contact}
    pressed = sum(d.z * area[i] for i, d in delta.items())
    kd = KDTree(len(contact))
    for k, i in enumerate(contact):
        kd.insert(Vector((co[i].x, co[i].y, 0)), k)
    kd.balance()
    band = {}
    if contact:
        for i, p in enumerate(co):
            h = p.z - plane
            if i in delta or not 0 < h < BULGE_H:
                continue
            dist = kd.find(Vector((p.x, p.y, 0)))[2]
            if dist < BULGE_R:
                band[i] = (1 - h / BULGE_H) ** 2 * (1 - dist / BULGE_R)
    grow = sum(w * area[i] for i, w in band.items())
    bulge = pressed / grow if grow > 0 else 0.0
    for i, w in band.items():
        delta[i] = normals[i] * (w * bulge)

    # world offsets back through each vertex's skinning into the rest shape
    names = {g.index: g.name for g in body.vertex_groups}
    mats = {b.name: (b.matrix @ b.bone.matrix_local.inverted()).to_3x3() for b in pose}
    to_rig = rig.matrix_world.to_3x3().inverted()
    to_body = (body.matrix_world.inverted() @ rig.matrix_world).to_3x3()
    key = body.shape_key_add(name="seat", from_mix=False)
    for i, d in delta.items():
        m, total = Matrix(((0,) * 3,) * 3), 0.0
        for g in body.data.vertices[i].groups:
            b = mats.get(names[g.group])
            if b is not None and g.weight > 0:
                m += b * g.weight
                total += g.weight
        if total > 0:
            key.data[i].co = key.data[i].co + to_body @ ((m * (1 / total)).inverted() @ (to_rig @ d))
    key.value = 1.0
    view.update()
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    below = max((plane - (body.matrix_world @ me.vertices[i].co).z for i in contact), default=0.0)
    ev.to_mesh_clear()
    for m in subs:
        m.show_viewport = True

    # the cushion's dent: full under the contact, easing out over DENT_R
    dent = 0.0
    if contact:
        for v in cushion:
            p = seat.matrix_world @ v.co
            depth = SEAT_GIVE * (1 - smooth(0.012, 0.012 + DENT_R, kd.find(Vector((p.x, p.y, 0)))[2]))
            v.co.z -= depth / seat.matrix_world.to_scale().z
            dent = max(dent, depth)
    seat.data.update()
    view.update()
    report["seat contact verts"] = len(contact)
    report["seat pressed cm3"] = round(pressed * 1e6)
    report["seat bulge mm"] = round(1000 * bulge * max(band.values(), default=0), 1)
    report["seat dent mm"] = round(dent * 1000, 1)
    report["seat skin left below mm"] = round(below * 1000, 1)


sit()


# --- the hands on the keys: the hand study's solver (hand_solver.py) per hand; the arm brings the
# wrist where the solver wants it, the elbow kept as fitted above, then fitted again by the trunk.
fx = bpy.data.collections.get("pianist_fx") or bpy.data.collections.new("pianist_fx")
if fx.name not in bpy.context.scene.collection.children:
    bpy.context.scene.collection.children.link(fx)
fx.hide_render = True
SOLVES = 3              # a hand solved with the elbow as fitted; the elbow pushed out by it means a new solve


def wrist_excess(x, wrist_at, frame, hand_in_wrist):
    """Degrees the wrist would bend past its limits (wrist_load, in WRIST_MAX's degrees) to hold the hand frame at wrist_at with the elbow as
    fitted. The wrist bends by the swing that takes the forearm's axis, as the hand carries it at rest,
    onto the forearm placed by the IK (the twist goes to pronation): place_arm's own split."""
    b, ua = rig.data.bones, pose[f"upperarm01.{x}"]
    in_wrist = b[f"wrist.{x}"].matrix_local.to_3x3().inverted() @ (b[f"lowerarm01.{x}"].tail_local
                                                                  - b[f"lowerarm01.{x}"].head_local)
    shoulder = world(ua)
    pole = pole_of(x, SPREAD_OF[x], SWING_OF[x], shoulder, wrist_at)
    elbow, wrist = two_bone(shoulder, ua.length, pose[f"lowerarm01.{x}"].length + pose[f"lowerarm02.{x}"].length,
                            wrist_at, pole)
    load = wrist_load(x, in_wrist, (frame @ hand_in_wrist.inverted()).inverted() @ (wrist - elbow))[0]
    return max(0.0, (load - 1) * math.degrees(WRIST_MAX))


for x, keys in (HANDS if SOLVE_HANDS else {}).items():
    # the neutral hand: pitched as the arm holds it, turned to its register (the solver's YAW0 is
    # asin(-HAND_FWD.x)); the wrist bends between it and the forearm
    hand_fwd = (world(pose[f"finger3-1.{x}"]) - world(pose[f"wrist.{x}"])).normalized()
    yaw = register_yaw(x, world(pose[f"upperarm01.{x}"]))
    hand_fwd = Vector((-math.sin(yaw), 0, hand_fwd.z))
    hand_fwd.y = math.sqrt(max(0.0, 1 - hand_fwd.x ** 2 - hand_fwd.z ** 2))
    for solve in range(SOLVES):
        hand = {"__name__": "hand_solver", "ROOT": ROOT, "rig": rig, "mesh": bpy.data.objects["PianistBody"],
                "fx": fx, "SIDE": x, "pose": keys, "hover_x": {}, "KEY_DIP": G.get("KEY_DIP", 0.0),
                "ROLL": math.radians(G.get("ROLL_DEG", 2)), "HAND_FWD": hand_fwd, "MEAN_DEPTH": True}

        def arm(wrist_at, frame, yaw, x=x, hand=hand):
            WRIST[x] = wrist_at
            place_arm(x, SPREAD_OF[x], (frame @ hand["HAND_IN_WRIST"].inverted()).to_quaternion(), SWING_OF[x])

        hand["place_arm"] = arm
        hand["wrist_excess"] = lambda wrist_at, frame, x=x, hand=hand: wrist_excess(x, wrist_at, frame,
                                                                                    hand["HAND_IN_WRIST"])
        exec(open(os.path.join(ROOT, "tools/hand-rig/hand_solver.py"), encoding="utf-8").read(), hand)
        WRIST[x] = world(pose[f"wrist.{x}"])
        # from the solver's own elbow: tucking it in again would turn the forearm under the solved hand
        solved_with = SPREAD_OF[x], SWING_OF[x]
        fit_elbow(x, (rig.matrix_world @ pose[f"wrist.{x}"].matrix).to_quaternion(), *solved_with)
        report["hand solves " + x] = solve + 1
        if (SPREAD_OF[x], SWING_OF[x]) == solved_with:
            break
    tips = {f: hand["world"](f"finger{f}-3.{x}", "tail") for f in keys}
    report["hand " + x] = {"miss mm": {f: round((tips[f].xy - hand["targets"][f].xy).length * 1000, 1) for f in keys},
                           "fit residual mm": round(math.sqrt(hand["residual"]) * 1000, 1),
                           "adjust": hand["adjust"],
                           "skin in keys, fingers mm": hand["mesh_check"]()}


# --- the muscle in the thumb's web. A thumb drawn in to the index finger folds the back of the web into
# a pit under linear skinning; a real hand has the first dorsal interosseous there, and the skin stretches
# over it. The muscle is an ellipsoid between the thumb's and the index finger's metacarpals, placed from
# the posed bones and keeping its volume: squeezed across, it thickens. A Shrinkwrap pushes the skin out
# of it along the skin's normals (the folded skin can sit deep inside, where the nearest surface point
# is on the palm side), and a smooth in a ring round the held skin blends it in.
WEB_SHIFT, WEB_ALONG = 0.15, 0.75      # towards the wrist, of the metacarpals; the length's share: the belly
WEB_THICK = 0.009                      # half its thickness at rest, before the fit to the skin
WEB_REACH = 1.8                        # held skin: within this many muscle radii at rest
WEB_RINGS = 3                          # the blend ring round the held skin, in edges


def web_frame(points, palm, scale=1.0):
    """Centre and half axes (along the metacarpals, across, out of the back of the hand) of the muscle
    between the thumb's metacarpal A->T and the index finger's I0->I1; right-handed, so its normals
    point out on either hand."""
    A, T, I0, I1 = points
    base, tip = (A + I0) / 2, (T + I1) / 2
    u = (tip - base).normalized()
    th, ix = A.lerp(T, 0.55 - WEB_SHIFT), I0.lerp(I1, 0.45 - WEB_SHIFT)
    w = u.cross(th - ix).normalized()
    if w.dot(palm) > 0:
        w.negate()
    v = w.cross(u)
    return (th + ix) / 2, u * (0.4 * WEB_ALONG * (tip - base).length), v * (0.5 * (th - ix).length), w


def hold_web(x):
    from collections import deque
    import bmesh
    body = bpy.data.objects["PianistBody"]
    bones = rig.data.bones
    names = {g.index: g.name for g in body.vertex_groups}
    rest_pts = [bones[f"{n}.{x}"].head_local for n in ("finger1-1", "finger1-2", "metacarpal1", "finger2-1")]
    C0, a0, b0, w0 = web_frame(rest_pts, bones[f"wrist.{x}"].matrix_local.to_3x3().col[2])
    c0 = w0 * WEB_THICK
    to_rest = Matrix((a0, b0, c0)).transposed().inverted()
    to_rig_ = rig.matrix_world.inverted() @ body.matrix_world
    rest_co = [to_rig_ @ v.co for v in body.data.vertices]
    radius = lambda p: (to_rest @ (p - C0)).length
    bone_of = [names[max((g for g in v.groups if names[g.group] in bones), key=lambda g: g.weight).group]
               if any(names[g.group] in bones for g in v.groups) else "" for v in body.data.vertices]
    own = [i for i, n in enumerate(bone_of) if n.endswith("." + x) and (rest_co[i] - C0).length < 0.06]
    fit = 0.97 * min(radius(rest_co[i]) for i in own)        # just under the rest skin: at rest it holds nothing
    # the back of the web; the thumb's and the index finger's phalanges keep their own shape
    hold = [i for i in own if radius(rest_co[i]) < WEB_REACH * fit and (rest_co[i] - C0).dot(w0) > -0.3 * WEB_THICK * fit
            and not bone_of[i].startswith(("finger1-2", "finger1-3", "finger2"))]
    nb = {}
    for e in body.data.edges:
        p, q = e.vertices
        nb.setdefault(p, []).append(q)
        nb.setdefault(q, []).append(p)
    ring = {i: 0 for i in hold}
    todo = deque(hold)
    while todo:
        i = todo.popleft()
        if ring[i] < WEB_RINGS:
            for j in nb[i]:
                if j not in ring:
                    ring[j] = ring[i] + 1
                    todo.append(j)
    held, blend = (body.vertex_groups.get(n) or body.vertex_groups.new(name=n)
                   for n in (f"muscle-web.{x}", f"muscle-web-blend.{x}"))
    for g in (held, blend):
        g.remove(list(range(len(body.data.vertices))))
    held.add(hold, 1.0, "REPLACE")
    for i, d in ring.items():
        if d:
            blend.add([i], 1 - (d - 1) / WEB_RINGS, "REPLACE")

    muscle = bpy.data.objects.get(f"muscle-web.{x}")
    if muscle is None:
        mesh = bpy.data.meshes.new(f"muscle-web.{x}")
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=1.0)
        bm.to_mesh(mesh)
        bm.free()
        muscle = bpy.data.objects.new(mesh.name, mesh)
        rig.users_collection[0].objects.link(muscle)
        muscle.display_type, muscle.hide_render, muscle.hide_viewport = "WIRE", True, True
    posed = [pose[f"{n}.{x}"].head for n in ("finger1-1", "finger1-2", "metacarpal1", "finger2-1")]
    C, a, b, w = web_frame(posed, pose[f"wrist.{x}"].matrix.to_3x3().col[2])
    c = w * (WEB_THICK * a0.length * b0.length / (a.length * b.length))
    muscle.matrix_world = rig.matrix_world @ Matrix.Translation(C) @ (Matrix((a, b, c)).transposed() * fit).to_4x4()

    sw = body.modifiers.get(f"muscle-web.{x}") or body.modifiers.new(f"muscle-web.{x}", "SHRINKWRAP")
    sw.target, sw.vertex_group = muscle, held.name
    sw.wrap_method, sw.wrap_mode, sw.cull_face = "PROJECT", "OUTSIDE", "OFF"
    sw.use_project_x = sw.use_project_y = sw.use_project_z = False      # along the skin's normals
    sw.use_positive_direction, sw.use_negative_direction = True, False
    sm = body.modifiers.get(f"muscle-web-smooth.{x}") or body.modifiers.new(f"muscle-web-smooth.{x}", "SMOOTH")
    sm.vertex_group, sm.factor, sm.iterations = blend.name, 0.5, 6
    after = next(i for i, m in enumerate(body.modifiers) if m.type == "ARMATURE")
    for m in (sw, sm):
        after += 1
        body.modifiers.move(list(body.modifiers).index(m), after)
    view.update()
    report["web muscle " + x] = {"held verts": len(hold), "half axes mm": [round(v.length * fit * 1000) for v in (a0, b0, c0)],
                                 "posed thickness mm": round(c.length * fit * 1000, 1)}


for x in ("L", "R"):
    hold_web(x)
print("pianist seated", report)
