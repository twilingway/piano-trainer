"""The hand solver: one hand's fingers onto their keys (hand study and the seated pianist).

Exec'd into the caller's namespace (exec(open(".../hand_solver.py").read())), which provides:
rig, mesh (skinned by rig), fx (a collection for the IK helpers), SIDE ("R" or "L"), pose
(finger -> semitone from C4, pressed or, with KEY_DIP 0, resting on its key), hover_x (finger ->
x a free finger hangs over), HAND_FWD (wrist -> middle knuckle of the neutral hand), ROLL, and
place_arm(wrist_at, frame, yaw), which brings the wrist to a point with the hand frame (side to the
thumb, forward, up) and leaves the rest of the arm to the caller; optionally wrist_excess(wrist_at,
frame), degrees the wrist would bend past its limit there, so the fit keeps to hands the arm can
hold. Optionally EXAMPLE, a pose taken from the video (hand_library.py): {"knuckle_x": metres, the
knuckles' middle across the keys; "yaw": radians in this solver's sense, + fingers to the bass;
"thumb": "pressing", "tucked" or "visible"}. Leaves its results in the same
namespace: turn, residual, SPREAD_FIT, targets, adjust, before, collision_report(), mesh_check(),
and with EXAMPLE example_report().
Bones carry MPFB names (studio_rig.py, pianist_rig.py): +X flexes; +Z turns to the pinky on the right
hand and to the thumb on the left, which mirrors it (MIRROR).
Solver from hand.py: the hand is a rigid body with "apple" curl, fitted by Nelder-Mead so the
fingertips land on their keys; IK closes the last millimetres; free fingers curl tighter to hover.
"""
import bpy, math, os
from mathutils import Vector, Matrix

exec(open(os.path.join(globals().get("ROOT", r"E:/MySource/ReactJS/piano-trainer"), "tools/hand-rig/hand_keys.py"),
          encoding="utf-8").read())
vl = bpy.context.view_layer
P = rig.pose.bones
MIRROR = 1 if SIDE == "R" else -1
HAND = [pb for pb in P if pb.name.endswith("." + SIDE) and pb.name.startswith(("finger", "metacarpal"))]

# --- pose geometry
TIP_IN = 0.055                       # pressed white-key tip, from the key's front edge
TIP_CLEAR = 0.004                    # bone tail above the key surface (pad thickness under it)
# Knuckle height is not set: the middle finger curls exactly round the apple and its tip drop
# (APPLE_DROP, below) puts the knuckles where they are; the other fingers level to it.
HOVER = 0.012
PLAY_DEPTH = 0.035                   # preferred tip depth from the key's front edge
THUMB_DEPTH = 0.015                  # the thumb plays nearer the edge: it sits behind the fingers
EDGE_DEPTH = 0.008                   # the front edge: the outer fingers of a full stretch
THUMB_SIDE = 0.006                   # and its tip may sit this far off the key's middle line
# MEAN_DEPTH (the caller's): only the tips' mean depth is held, not each tip's. A hand turned to the keys
# (towards a far register) lays its tips on an oblique line: the far side deeper, the near side nearer the
# edge; one depth per finger would make it contort to stay square. FIT_DEPTH: each tip's depth in the
# latest rigid fit, the depth a pressing finger may curl to before it is curled back.
MEAN_DEPTH = globals().get("MEAN_DEPTH", False)
FIT_DEPTH = {}
# EXAMPLE: the video gives the knuckles' place across the keys and the hand's turn on the key plane, not
# their depth (projected along the camera's rays, the knuckles land too deep) nor the height, pitch or
# roll: the tips on their keys set the depth and height, the rig's neutral the pitch and roll.
EXAMPLE = globals().get("EXAMPLE")
EXAMPLE_YAW_TOL = math.radians(5)      # the refit may turn the hand this far off the example
# The knuckles' x from the frame is not held: they stand above the key plane, and their projection
# drifts across x by up to 15 mm (left-hand single fingers missed 6-8 mm when pulled to it). The tips
# on their keys place the hand along the keyboard; the knuckles' offset stays in the report.
KNUCKLE_PULL = 0.0                     # 1 mm of the knuckles off the example's x costs as this many mm of tip miss


def empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    e.empty_display_size = 0.01
    fx.objects.link(e)
    return e


# Solving re-evaluates the scene hundreds of times: skip the mesh until the pose is final.
for m in mesh.modifiers:
    m.show_viewport = False


def world(name, attr="head"):
    return rig.matrix_world @ getattr(P[name], attr)


def rest_hand_frame():
    """(side to the thumb, forward, up) at rest, in the wrist bone's frame. The knuckles themselves
    move with the palm arch, so the live frame rides on the wrist bone instead."""
    b = rig.data.bones
    w = b[f"wrist.{SIDE}"].head_local
    fwd = (b[f"finger3-1.{SIDE}"].head_local - w).normalized()
    side = b[f"finger2-1.{SIDE}"].head_local - b[f"finger5-1.{SIDE}"].head_local
    side = (side - fwd * side.dot(fwd)).normalized()
    return b[f"wrist.{SIDE}"].matrix_local.to_3x3().inverted() @ Matrix((side, fwd, fwd.cross(side) * MIRROR)).transposed()


HAND_IN_WRIST = rest_hand_frame()


def hand_frame():
    return (rig.matrix_world @ P[f"wrist.{SIDE}"].matrix).to_quaternion().to_matrix() @ HAND_IN_WRIST


def frame_of(fwd, roll=ROLL):
    side = Vector((-MIRROR, 0, 0))
    side = (side - fwd * side.dot(fwd)).normalized()
    up = fwd.cross(side) * MIRROR
    side = side * math.cos(roll) + up * math.sin(roll)
    return Matrix((side, fwd, fwd.cross(side) * MIRROR)).transposed()


# The "apple" under the palm (as taught in music school): finger bones wrap a ball of
# APPLE_R, so each joint bends by half the arcs of the two phalanges meeting at it. +X flexes.
APPLE_R = 0.07


def rest_flex(parent, child):
    """How far `child` is already flexed (+X) against `parent` in the rest mesh, radians."""
    b = rig.data.bones
    d = b[parent].matrix_local.to_3x3().inverted() @ (b[child].tail_local - b[child].head_local)
    return math.atan2(d.z, d.y)


def apple_curl(f):
    """Joint bends that lay the phalanges on the apple, measured from a straight finger."""
    arcs = [2 * math.asin(min(1.0, P[f"finger{f}-{j}.{SIDE}"].length / (2 * APPLE_R))) for j in (1, 2, 3)]
    bends = [arcs[0] / 2, (arcs[0] + arcs[1]) / 2, (arcs[1] + arcs[2]) / 2]
    chain = [f"metacarpal{f - 1}.{SIDE}"] + [f"finger{f}-{j}.{SIDE}" for j in (1, 2, 3)]
    return [(("X", math.degrees(b - rest_flex(p, c))),) for b, p, c in zip(bends, chain, chain[1:])]


CURL = {1: [(("X", 10),), (("X", 20),), (("X", 15),)]}
CURL.update({f: apple_curl(f) for f in (2, 3, 4, 5)})


def reset():
    for pb in HAND:
        pb.matrix_basis = Matrix.Identity(4)
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    for o in [o for o in fx.objects if o.type == "EMPTY"]:
        bpy.data.objects.remove(o)
    vl.update()


# Spread at the knuckles for wide intervals, scaled by one fitted value 0..1; +Z turns to the pinky.
SPREAD = {f: [(a, d * MIRROR) for a, d in rots] for f, rots in
          {1: [], 2: [("Z", -12)], 3: [("Z", 5)], 4: [("Z", 8)], 5: [("Z", 20)]}.items()}


def neutral_yaw(f):
    """The rest mesh is fanned: turn finger f at the knuckle (local Z) parallel to the middle finger."""
    b, m = rig.data.bones[f"finger{f}-1.{SIDE}"], rig.data.bones[f"finger3-1.{SIDE}"]
    d = b.matrix_local.to_3x3().inverted() @ (rig.data.bones[f"finger3-3.{SIDE}"].tail_local - m.head_local)
    return math.degrees(math.atan2(-d.x, d.y))


NEUTRAL = {1: 0.0, 3: 0.0, **{f: neutral_yaw(f) for f in (2, 4, 5)}}


def set_finger(f, spread, scale, knuckle=(0.0, 0.0)):
    """Apple curl times `scale`; `knuckle` adds (flex, yaw) degrees at joint 1 without breaking the arc."""
    for j, rots in enumerate(CURL[f], 1):
        m = Matrix.Identity(4)
        extra = ([("Z", NEUTRAL[f] + knuckle[1]), ("X", knuckle[0])] + [(a, d * spread) for a, d in SPREAD[f]]
                 if j == 1 else [])
        for axis, deg in extra + [(a, d * scale) for a, d in rots]:
            m = m @ Matrix.Rotation(math.radians(deg), 4, axis)
        P[f"finger{f}-{j}.{SIDE}"].matrix_basis = m
    vl.update()


def tip_up(f):
    H = hand_frame()
    return (H.transposed() @ (world(f"finger{f}-3.{SIDE}", "tail") - world(f"wrist.{SIDE}"))).z


# Thumb home in the hand frame (side to the thumb, forward, up), from the index fingertip:
# one key to the thumb side, a little behind, tip level with the other fingertips.
THUMB_FROM_INDEX = Vector((WHITE_W, -0.035, 0.004))
THUMB_SPREAD = Vector((0.030, -0.012, 0.0))


def index_tip_local():
    return hand_frame().transposed() @ (world(f"finger2-3.{SIDE}", "tail") - world(f"wrist.{SIDE}"))


CURL_SCALE = {}


PALM_ARCH = {}                         # metacarpal flex, degrees: the palm cupping over the apple


def set_metacarpal(f, deg):
    P[f"metacarpal{f - 1}.{SIDE}"].matrix_basis = Matrix.Rotation(math.radians(deg), 4, "X")
    vl.update()


def apply_curl(spread=0.0):
    """Every finger lies on the apple; the palm cups (metacarpals flex) so the tips land level
    with the middle finger's. A finger too short even then curls past the apple (CURL_SCALE > 1)."""
    for f in (2, 3, 4, 5):
        CURL_SCALE[f] = 1.0
        set_finger(f, spread, 1.0)
    for f in (2, 4, 5):
        lo, hi = -15.0, 40.0
        for _ in range(18):
            mid = (lo + hi) / 2
            set_metacarpal(f, mid)
            if tip_up(f) > -APPLE_DROP:
                lo = mid
            else:
                hi = mid
        PALM_ARCH[f] = (lo + hi) / 2
        set_metacarpal(f, PALM_ARCH[f])
        if tip_up(f) > -APPLE_DROP + 0.001:
            lo, hi = 1.0, 2.5
            for _ in range(18):
                mid = (lo + hi) / 2
                set_finger(f, spread, mid)
                if tip_up(f) > -APPLE_DROP:
                    lo = mid
                else:
                    hi = mid
            CURL_SCALE[f] = (lo + hi) / 2
            set_finger(f, spread, CURL_SCALE[f])
    set_finger(1, spread, 1.0)
    place_thumb(index_tip_local() + THUMB_FROM_INDEX + THUMB_SPREAD * spread)


POLE_ANGLE = {}                       # per chain, last pick: the angle that keeps the current bend


def solve_ik(f, target_loc, pole_loc, chain=3, poles=(-90, 90, 0, 180)):
    """IK the finger chain (its first `chain` bones) to a point, keep the result as plain rotations;
    return the miss in mm."""
    bones = [P[f"finger{f}-{j}.{SIDE}"] for j in (1, 2, 3)][:chain]
    end = f"finger{f}-{chain}.{SIDE}"
    before = [b.matrix.copy() for b in bones]
    target, pole = empty(f"tip{f}", target_loc), empty(f"pole{f}", pole_loc)
    c = bones[-1].constraints.new("IK")
    c.target, c.pole_target, c.chain_count, c.use_tail = target, pole, chain, True
    best = None
    for a in poles:
        c.pole_angle = math.radians(a)
        vl.update()
        drift = sum(m.to_quaternion().rotation_difference(b.matrix.to_quaternion()).angle for m, b in zip(before, bones))
        miss = (world(end, "tail") - target.location).length
        score = drift + miss * 100
        if best is None or score < best[0]:
            best = (score, a, [b.matrix.copy() for b in bones])
    POLE_ANGLE[f] = best[1]
    bones[-1].constraints.remove(c)
    for b, m in zip(bones, best[2]):
        b.matrix = m
        vl.update()
    miss = round((world(end, "tail") - target.location).length * 1000, 1)
    return miss, target, pole


def solve_thumb_bent(target_loc, pole_loc, bend):
    """The thumb's tip joint held bent by `bend` degrees (+X flexes; the "L" that brings the tip down
    onto its key past the neighbour); the two upper bones carry the tip to the target. IK does not
    keep a posed joint, so: aim the middle bone's end at the target minus the tip bone, three times."""
    tip = P[f"finger1-3.{SIDE}"]
    tip.matrix_basis = Matrix.Rotation(math.radians(bend), 4, "X")
    vl.update()
    for k in range(3):
        aim = target_loc - (world(f"finger1-3.{SIDE}", "tail") - world(f"finger1-3.{SIDE}"))
        _, t, p = solve_ik(1, aim, pole_loc, chain=2, poles=(-90, 90, 0, 180) if k == 0 else (POLE_ANGLE[1],))
        for o in (t, p):
            bpy.data.objects.remove(o)
        tip.matrix_basis = Matrix.Rotation(math.radians(bend), 4, "X")
        vl.update()


def place_thumb(local):
    """Solve the thumb to a point in the hand frame."""
    H = hand_frame()
    side, up = H.col[0], H.col[2]
    knuckle = world(f"finger1-2.{SIDE}")
    global thumb_home_miss
    thumb_home_miss, t, p = solve_ik(1, world(f"wrist.{SIDE}") + H @ local, knuckle + side * 0.05 + up * 0.03)
    for o in (t, p):
        bpy.data.objects.remove(o)


def frame_from(yaw, pitch, roll):
    fwd = Vector((-math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    return frame_of(fwd, roll)


def key_contact(semi, tip, clear=TIP_CLEAR):
    """Closest playable point of a pressed key to a fingertip: slides along the key."""
    x, black = key_of(semi)
    lo = key_front(black) + 0.008
    # White keys may be played between the black ones; PLAY_DEPTH prefers the front, and the
    # collision penalties keep a finger that does not fit between the black keys out.
    hi = key_front(black) + (0.06 if black else 0.075)
    y = min(max(tip.y, lo), hi)
    return Vector((x, y, pressed_top(black, y) + clear))


def nelder_mead(f, x0, steps, iters=1500, tol=1e-12):
    n = len(x0)
    pts = [list(x0)] + [[x0[i] + (steps[i] if i == k else 0) for i in range(n)] for k in range(n)]
    vals = [f(p) for p in pts]
    for _ in range(iters):
        order = sorted(range(n + 1), key=vals.__getitem__)
        pts, vals = [pts[i] for i in order], [vals[i] for i in order]
        if vals[-1] - vals[0] < tol:
            break
        c = [sum(p[i] for p in pts[:-1]) / n for i in range(n)]
        refl = [c[i] + (c[i] - pts[-1][i]) for i in range(n)]
        fr = f(refl)
        if fr < vals[0]:
            exp = [c[i] + 2 * (c[i] - pts[-1][i]) for i in range(n)]
            fe = f(exp)
            pts[-1], vals[-1] = (exp, fe) if fe < fr else (refl, fr)
        elif fr < vals[-2]:
            pts[-1], vals[-1] = refl, fr
        else:
            con = [c[i] + 0.5 * (pts[-1][i] - c[i]) for i in range(n)]
            fc = f(con)
            if fc < vals[-1]:
                pts[-1], vals[-1] = con, fc
            else:
                for k in range(1, n + 1):
                    pts[k] = [pts[0][i] + 0.5 * (pts[k][i] - pts[0][i]) for i in range(n)]
                    vals[k] = f(pts[k])
    best = min(range(n + 1), key=vals.__getitem__)
    return pts[best], vals[best]


# --- collisions. Every phalanx is a capsule whose section is a polar profile (12 sectors round the
# bone) measured from the rest mesh; fingers must not cut into each other or sink into the keys.
PRESSED = set(pose.values())
PAD_SQUISH = 0.002                     # a pressing pad may flatten this much into its key
FF_TOL = 0.001                         # neighbours may touch, not overlap more than this


def phalanx_radii():
    """Skin radius round each phalanx in 12 sectors of the bone's x-z plane (sector k at k*30 deg from
    +x towards the palm, +z): the farthest vertex, or the 90th percentile on the proximal phalanx,
    whose vertices include the web and the palm. Also how far each fingertip reaches past its tail."""
    to_rig = rig.matrix_world.inverted() @ mesh.matrix_world   # constant: the mesh is parented
    names = {g.index: g.name for g in mesh.vertex_groups}
    own = {}
    for v in mesh.data.vertices:
        groups = [g for g in v.groups if names[g.group] in rig.data.bones]     # not the skin's helper groups
        if groups:
            own.setdefault(names[max(groups, key=lambda g: g.weight).group], []).append(to_rig @ v.co)

    rad, ext = {}, {}
    for f in range(1, 6):
        for j in (1, 2, 3):
            b = rig.data.bones[f"finger{f}-{j}.{SIDE}"]
            inv = b.matrix_local.inverted()
            lo, hi = (0.1 * b.length, b.length) if j == 3 else (0.25 * b.length, 0.85 * b.length)
            sectors = [[] for _ in range(12)]
            for p in (inv @ c for c in own[b.name]):
                if lo <= p.y <= hi:
                    sectors[round(math.atan2(p.z, p.x) / (math.pi / 6)) % 12].append(math.hypot(p.x, p.z))
            prof = [sorted(r)[int(0.9 * (len(r) - 1))] if j == 1 and r else max(r, default=0.0) for r in sectors]
            # an empty sector borrows from its neighbours
            rad[f, j] = [r or max(prof[k - 1], prof[(k + 1) % 12]) for k, r in enumerate(prof)]
        ext[f] = max((inv @ c).y for c in own[b.name]) - b.length     # fingertip past the distal tail
    return rad, ext


RADII, TIP_EXT = phalanx_radii()
PHALANGES = {f: (2, 3) if f == 1 else (1, 2, 3) for f in range(1, 6)}   # finger1-1 is inside the thenar


def capsule(f, j):
    """World segment, side and palm axes, radii. The proximal one starts past the web between knuckles."""
    m = rig.matrix_world @ P[f"finger{f}-{j}.{SIDE}"].matrix
    a, b = m.translation.copy(), rig.matrix_world @ P[f"finger{f}-{j}.{SIDE}"].tail
    if j == 1:
        a = a.lerp(b, 0.4)
    return a, b, m.col[0].to_3d().normalized(), m.col[2].to_3d().normalized(), RADII[f, j]


def extent(X, Z, prof, n):
    """Reach of the section towards unit direction n."""
    nx, nz = n.dot(X), n.dot(Z)
    return prof[round(math.atan2(nz, nx) / (math.pi / 6)) % 12] * math.hypot(nx, nz)


def key_at(x, y):
    """Top of the keyboard under (x, y) and the key's semitone: pressed keys tilted, black keys on top."""
    if not KEY_FRONT <= y <= KEY_FRONT + WHITE_L:
        return -1.0, None
    i = math.floor((x - X0) / WHITE_W + 0.5)
    s = white_semitone(i)
    z = pressed_top(False, y) if s in PRESSED else KEY_TOP
    if y >= key_front(True):
        for s2 in (s - 1, s + 1):
            if s2 % 12 not in WHITE_PCS and abs(x - key_of(s2)[0]) <= BLACK_W / 2:
                return (pressed_top(True, y) if s2 in PRESSED else KEY_TOP + BLACK_H), s2
    return z, s


def key_depth(p, grow=0.0):
    """How deep point p (a ball of radius grow) is inside a key, measured to the nearest face it can
    leave by: the top, the front, a black key's side. Negative outside; the key's semitone or None."""
    top, semi = key_at(p.x, p.y)
    if semi is None:
        return -1.0, None
    black = semi % 12 not in WHITE_PCS
    d = min(top - p.z, p.y - key_front(black))
    if black:
        d = min(d, BLACK_W / 2 - abs(p.x - key_of(semi)[0]))
    return d + grow, semi


RING = [(math.cos(k * math.pi / 6), math.sin(k * math.pi / 6)) for k in range(12)]


def key_pens(f, margin=0.0):
    """Depths of finger f's skin inside the keys (grown by margin): the rim of each phalanx section at five
    points along the bone, and the fingertip past the distal tail. A pressing pad may squish its own key."""
    out = []
    for j in PHALANGES[f]:
        a, b, X, Z, r = capsule(f, j)
        along = [(s, 1.0) for s in (0.0, 0.25, 0.5, 0.75, 1.0)]
        if j == 3:
            along.append((1 + 0.6 * TIP_EXT[f] / (b - a).length, 0.6))
        for s, k in along:
            p = a + (b - a) * s
            for (c, sn), rk in zip(RING, r):
                q = p + (X * c + Z * sn) * (rk * k)
                d, semi = key_depth(q, margin)
                allow = PAD_SQUISH if j == 3 and semi is not None and semi == pose.get(f) else 0.0
                out.append(max(0.0, d - allow))
    return out


PAD_FIX = {}                           # capsule -> real skin, per finger (step 6)


def pad_depth(f):
    """Deepest point of finger f's fingertip skin in its own pressed key (negative: above it)."""
    return capsule_pad_depth(f) + PAD_FIX.get(f, 0.0)


def capsule_pad_depth(f):
    a, b, X, Z, r = capsule(f, 3)
    best = -0.02
    for s, k in ((0.5, 1.0), (0.75, 1.0), (1.0, 1.0), (1 + 0.6 * TIP_EXT[f] / (b - a).length, 0.6)):
        p = a + (b - a) * s
        for (c, sn), rk in zip(RING, r):
            q = p + (X * c + Z * sn) * (rk * k)
            top, semi = key_at(q.x, q.y)
            if semi == pose[f]:
                best = max(best, top - q.z)
    return best


def contact_miss(f):
    """Pressed finger f: the tip off its key's playing line (horizontal), and the pad off a light squish."""
    t = world(f"finger{f}-3.{SIDE}", "tail")
    d = t.xy - key_contact(pose[f], t).xy
    if f == 1:                         # the thumb plays with the side of its tip: anywhere near the middle
        d.x = math.copysign(max(0.0, abs(d.x) - THUMB_SIDE), d.x)
    return d.length_squared + (pad_depth(f) - PAD_SQUISH / 2) ** 2


def closest(p1, q1, p2, q2):
    """Closest points of two segments (Ericson, Real-Time Collision Detection 5.1.9)."""
    d1, d2, r = q1 - p1, q2 - p2, p1 - p2
    a, e, f_ = d1.dot(d1), d2.dot(d2), d2.dot(r)
    c, b = d1.dot(r), d1.dot(d2)
    den = a * e - b * b
    s = min(max((b * f_ - c * e) / den, 0.0), 1.0) if den > 1e-12 else 0.0
    t = (b * s + f_) / e
    if t < 0:
        t, s = 0.0, min(max(-c / a, 0.0), 1.0)
    elif t > 1:
        t, s = 1.0, min(max((b - c) / a, 0.0), 1.0)
    return p1 + d1 * s, p2 + d2 * t


def finger_pens(f, others=None):
    """Overlaps of finger f's capsules with every other finger's, beyond FF_TOL."""
    mine = [capsule(f, j) for j in PHALANGES[f]]
    out = []
    for g in others or [g for g in range(1, 6) if g != f]:
        for j in PHALANGES[g]:
            a2, b2, X2, Z2, r2 = capsule(g, j)
            for a1, b1, X1, Z1, r1 in mine:
                c1, c2 = closest(a1, b1, a2, b2)
                d = (c2 - c1).length
                n = (c2 - c1) / d if d > 1e-9 else X1
                out.append(max(0.0, extent(X1, Z1, r1, n) + extent(X2, Z2, r2, -n) - d - FF_TOL))
    return out


def collision_report():
    return ({f: round(max(key_pens(f)) * 1000, 1) for f in range(1, 6)},
            {f"{f}-{g}": round(max(finger_pens(f, [g])) * 1000, 1) for f in range(1, 6) for g in range(f + 1, 6)})


def mesh_check():
    """The same checks on the deformed skin (armature only): deepest vertex below the key tops per
    finger (0 = palm), deepest vertex of one finger inside another (mm)."""
    from mathutils.bvhtree import BVHTree
    subs = [m for m in mesh.modifiers if m.type == "SUBSURF" and m.show_viewport]
    for m in subs:
        m.show_viewport = False
    vl.update()
    ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    co = [mesh.matrix_world @ v.co for v in ev.data.vertices]
    names = {g.index: g.name for g in mesh.vertex_groups}
    owner, palm = [], set()            # palm: this hand's other skin (a body's trunk and legs are no part of it)
    for i, v in enumerate(mesh.data.vertices):
        groups = [g for g in v.groups if names[g.group] in rig.data.bones]
        n = names[max(groups, key=lambda g: g.weight).group] if groups else ""
        owner.append(int(n[6]) if n.startswith("finger") and n[8] in "123" and n.endswith("." + SIDE)
                     and n != f"finger1-1.{SIDE}" else 0)
        if n.startswith(("wrist", "metacarpal", "finger")) and n.endswith("." + SIDE):
            palm.add(i)
    keys = {}                          # a finger on its own pressed key is pad_gap_mm, not a collision
    for i, p in enumerate(co):
        if not owner[i] and i not in palm:
            continue
        d, semi = key_depth(p)
        if semi is not None and not (owner[i] and semi == pose.get(owner[i])):
            keys[owner[i]] = max(keys.get(owner[i], 0.0), d)
    polys = [list(p.vertices) for p in mesh.data.polygons]
    inside = {}
    for g in range(1, 6):
        mine = [p for p in polys if all(owner[i] == g for i in p)]
        edges = {}
        for p in mine:
            for e in zip(p, p[1:] + p[:1]):
                edges[frozenset(e)] = edges.get(frozenset(e), 0) + 1
        rim = {k for k, p in enumerate(mine) if any(edges[frozenset(e)] == 1 for e in zip(p, p[1:] + p[:1]))}
        tree = BVHTree.FromPolygons(co, mine)
        for i, p in enumerate(co):
            f = owner[i]
            if f in (0, g):
                continue
            loc, nrm, k, dist = tree.find_nearest(p, 0.015)
            if loc is not None and k not in rim and (p - loc).dot(nrm) < 0:
                key = f"{min(f, g)}-{max(f, g)}"
                inside[key] = max(inside.get(key, 0.0), dist)
    for m in subs:
        m.show_viewport = True
    vl.update()
    return ({f: round(d * 1000, 1) for f, d in sorted(keys.items()) if d > 0},
            {k: round(d * 1000, 1) for k, d in sorted(inside.items())})


# 1. The hand as a rigid body: curled fingers, tips read in the hand frame.
reset()
set_finger(3, 0.0, 1.0)
APPLE_DROP = -tip_up(3)
K3_UP = APPLE_DROP + TIP_CLEAR - globals().get("K3_LOW", 0.005)   # a little under the apple height: the thumb reaches down
STRETCH_DROP = 0.02                    # knuckles this much lower at full spread
SPREAD_MAX = 1.5                       # pinky up to 30 deg, index -18 deg at the knuckle
SAMPLES = [0, 0.375, 0.75, 1.125, 1.5]
tip_samples, body_samples, knuckle_samples = [], [], []


def knuckles_world():
    """The middle of the knuckles of fingers 2-5, as the video's knuckle point."""
    return sum((world(f"finger{f}-1.{SIDE}") for f in (2, 3, 4, 5)), Vector()) / 4


for sp in SAMPLES:
    apply_curl(sp)
    M = hand_frame().transposed()
    w0 = world(f"wrist.{SIDE}")
    tip_samples.append({f: M @ (world(f"finger{f}-3.{SIDE}", "tail") - w0) for f in range(1, 6)})
    knuckle_samples.append(M @ (knuckles_world() - w0))
    # the skin under fingers 2..5 for the key penalty: (point, palm-side radius, may squish a key)
    body = {}
    for f in range(2, 6):
        body[f] = []
        for j in (1, 2, 3):
            a, b, _, _, r = capsule(f, j)
            for s in ((0.0, 1.0) if j == 1 else (0.5, 1.0)):
                body[f].append((M @ (a.lerp(b, s) - w0), r[3], j == 3 and s == 1.0))
    body_samples.append(body)
local_k3 = M @ (world(f"finger3-1.{SIDE}") - w0)
# The thumb is not rigid: it may land anywhere within its reach from the CMC joint.
local_cmc = M @ (world(f"finger1-1.{SIDE}") - w0)
THUMB_REACH = 0.97 * sum(P[f"finger1-{j}.{SIDE}"].length for j in (1, 2, 3))
THUMB_PULL = 0.3                       # weak pull towards the thumb's home beside the index finger
REFIT_THUMB_PULL = 1.0                 # refit: the posed thumb is where it really got; the hand turns and drops to it
FINGER_PULL = 0.5                      # refit: pull of a pressed finger towards its present shape


def local_tip_at(f, sp):
    sp = min(max(sp, 0.0), SPREAD_MAX) / SPREAD_MAX * (len(SAMPLES) - 1)
    i = min(int(sp), len(SAMPLES) - 2)
    return tip_samples[i][f].lerp(tip_samples[i + 1][f], sp - i)


def local_knuckles_at(sp):
    sp = min(max(sp, 0.0), SPREAD_MAX) / SPREAD_MAX * (len(SAMPLES) - 1)
    i = min(int(sp), len(SAMPLES) - 2)
    return knuckle_samples[i].lerp(knuckle_samples[i + 1], sp - i)


def knuckle_cost(t, R, local):
    """The knuckles held at the example's place across the keys."""
    return (KNUCKLE_PULL * ((t + R @ local).x - EXAMPLE["knuckle_x"])) ** 2 if EXAMPLE else 0.0


def local_body_at(f, sp):
    sp = min(max(sp, 0.0), SPREAD_MAX) / SPREAD_MAX * (len(SAMPLES) - 1)
    i = min(int(sp), len(SAMPLES) - 2)
    return [(p.lerp(q[0], sp - i), r, pad) for (p, r, pad), q in zip(body_samples[i][f], body_samples[i + 1][f])]


W_HIT = 5.0                            # 1 mm into a key or a finger costs as much as 5 mm of miss

# 2. Fingertips first: fit the hand pose so the curled tips land on their keys. The same cost refits
# the hand later with the fingers as actually posed (step 5).
YAW0, PITCH0, ROLL0 = math.asin(-HAND_FWD.x), math.asin(HAND_FWD.z), ROLL
# The hand turns at the wrist and the forearm follows part of the turn (the elbow swings out): a wide
# reach turns the whole hand, as pianists do, instead of splaying one finger at its knuckle.
YAW_SIGMA = 0.6                        # radians of hand yaw that cost as much as 10 mm of miss
# Per-tip depths hold the yaw; with only their mean held, a hand whose thumb sits on its key's front
# bound lowers the mean by turning round the thumb, so the neutral must hold the yaw instead.
if MEAN_DEPTH:
    YAW_SIGMA = 0.15
STRETCH_YAW = math.radians(15)         # the extra turn of a full stretch
if EXAMPLE:                            # the example's turn already holds its stretch
    YAW0, STRETCH_YAW = EXAMPLE["yaw"], 0.0


def stretch_drop(spread):
    """A stretched hand goes flat and low: straighter fingers reach farther across the keys."""
    return STRETCH_DROP * min(max(spread - 1.0, 0.0) / (SPREAD_MAX - 1.0), 1.0)


def hand_cost(t, R, tips, body, hover_z, rest_pads, clear={}, reach={}, curled=None, drop=0.0,
              thumb_pull=None):
    """Rigid hand at wrist t, frame R; tips and body points (point, radius, pad) in the hand frame;
    clear: a pressed finger's tip height over its key, where known; reach: (knuckle, shortest,
    longest) of pressed fingers that may still curl or straighten, like the thumb always may."""
    c, misses = 0.0, []
    for f in pose:
        tip = t + R @ tips[f]
        contact = key_contact(pose[f], tip, clear.get(f, TIP_CLEAR))
        if f in reach:
            k, lo, hi = reach[f]
            to = R.transposed() @ (contact - (t + R @ k))
            d, now = to.length, tips[f] - k
            # a finger hardly turns sideways at its knuckle: the hand turns instead
            side = abs(math.atan2(to.x * now.y - to.y * now.x, to.x * now.x + to.y * now.y))
            c += ((FINGER_PULL * (tip - contact).length) ** 2 + max(0.0, d - hi) ** 2 + max(0.0, lo - d) ** 2
                  + (0.01 * max(0.0, math.degrees(side) - 20) / 5) ** 2)
        elif f == 1:
            c += ((thumb_pull or THUMB_PULL) * (tip - contact).length) ** 2
            c += max(0.0, (contact - (t + R @ local_cmc)).length - THUMB_REACH) ** 2
        else:
            c += (tip - contact).length_squared
        # play a little into the key, not on its very edge; the thumb nearer the edge; in a stretch
        # (drop > 0) the outer fingers come to the front edge, the hand turns and the middle ones go deep
        depth = THUMB_DEPTH if f == 1 else PLAY_DEPTH
        if f in (min(pose), max(pose)) and len(pose) > 1:
            depth += (EDGE_DEPTH - depth) * drop / STRETCH_DROP
        misses.append(contact.y - key_front(key_of(pose[f])[1]) - depth)
    if MEAN_DEPTH and misses:
        c += len(misses) * (0.3 * sum(misses) / len(misses)) ** 2     # a shift of every tip costs as before
    else:
        c += sum((0.3 * m) ** 2 for m in misses)
    # free fingers hang over their own keys
    for f, hx in hover_x.items():
        tip = t + R @ tips[f]
        c += ((0.2 if f == 1 else 1.0) * (tip.x - hx)) ** 2 + (0.3 * (tip.y - KEY_FRONT - PLAY_DEPTH)) ** 2
        if hover_z is not None:
            c += (tip.z - hover_z) ** 2
    # with no finger but the thumb pressed, the other free fingers keep the playing depth on average
    # (one term: it must not turn the hand), wherever across the keys they fall; judged curled round
    # the apple (curled: their apple tips, when tips holds them lifted and straightened)
    free = [f for f in range(2, 6) if f not in pose and f not in hover_x]
    if free and set(pose) <= {1}:
        y = sum((t + R @ (curled or tips)[f]).y for f in free) / len(free)
        c += (0.3 * (y - KEY_FRONT - PLAY_DEPTH)) ** 2
    # no knuckle, joint or pad below the key tops; only a pad on its own pressed key may squish it
    # (and, in the first fit, a free finger's pad resting on its key before the lift)
    for f, pts in body.items():
        for loc, r, pad in pts:
            p = t + R @ loc
            d, semi = key_depth(p, r)
            allow = PAD_SQUISH if pad and (semi == pose.get(f) or (rest_pads and f not in pose)) else 0.0
            c += (W_HIT * max(0.0, d - allow)) ** 2
    k3 = t + R @ local_k3
    c += (0.3 * (k3.z - KEY_TOP - K3_UP + drop)) ** 2
    return c


def turn_cost(a, drop=0.0, t=None):
    """Departure from the neutral hand; a stretched hand (drop > 0) is turned to the thumb side,
    counter-clockwise from above, as pianists take an octave. With the caller's wrist_excess(t, frame)
    (degrees the wrist would bend past its limit to hold the hand there), a hand the arm cannot hold
    costs as much as 3 mm of miss per degree."""
    yaw0 = YAW0 + MIRROR * STRETCH_YAW * drop / STRETCH_DROP
    c = 0.01 ** 2 * (((a[0] - yaw0) / YAW_SIGMA) ** 2 + ((a[1] - PITCH0) / 0.2) ** 2 + ((a[2] - ROLL0) / 0.35) ** 2)
    if EXAMPLE:
        # a wall at the tolerance: one degree past it costs as much as 10 mm of miss, so within it the
        # wrist below picks the turn the arm can hold; a load left past the limit is reported
        c += (0.01 * math.degrees(max(0.0, abs(a[0] - YAW0) - EXAMPLE_YAW_TOL))) ** 2
    if t is not None and "wrist_excess" in globals():
        c += (0.003 * wrist_excess(Vector(t), frame_from(*a))) ** 2
    return c


def cost(v):
    tips = {f: local_tip_at(f, v[6]) for f in range(1, 6)}
    body = {f: local_body_at(f, v[6]) for f in range(2, 6)}
    return (hand_cost(Vector(v[:3]), frame_from(*v[3:6]), tips, body, KEY_TOP + TIP_CLEAR, True, drop=stretch_drop(v[6]))
            + turn_cost(v[3:6], stretch_drop(v[6]), v[:3])
            + (0.006 * v[6]) ** 2 + (max(0, -v[6]) + max(0, v[6] - SPREAD_MAX)) ** 2)


R0 = frame_from(YAW0, PITCH0, ROLL0)
anchors = {f: key_contact(semi, Vector((0, KEY_FRONT + TIP_IN, 0))) for f, semi in pose.items()}
anchors.update({f: Vector((hx, KEY_FRONT + TIP_IN, KEY_TOP + TIP_CLEAR)) for f, hx in hover_x.items()})
t0 = (sum(anchors.values(), Vector()) - sum((R0 @ local_tip_at(f, 0) for f in anchors), Vector())) / len(anchors)
if EXAMPLE:
    # the turn is the example's; the wrist point, pitch, roll and spread are fitted (a wide thumb
    # rolls the hand onto its side: held at the neutral roll, the thumb pulled the hand off the fingers)
    def example_cost(v):
        return (cost([*v[:3], YAW0, *v[3:6]])
                + knuckle_cost(Vector(v[:3]), frame_from(YAW0, *v[3:5]), local_knuckles_at(v[5])))

    ex, residual = nelder_mead(example_cost, [*t0, PITCH0, ROLL0, 0.3], [0.01, 0.01, 0.01, 0.1, 0.1, 0.3])
    ex, residual = nelder_mead(example_cost, ex, [0.003, 0.003, 0.003, 0.03, 0.03, 0.1])
    best = [*ex[:3], YAW0, *ex[3:6]]
else:
    best, residual = nelder_mead(cost, [*t0, YAW0, PITCH0, ROLL0, 0.3], [0.01, 0.01, 0.01, 0.1, 0.1, 0.1, 0.3])
    best, residual = nelder_mead(cost, best, [0.003, 0.003, 0.003, 0.03, 0.03, 0.03, 0.1])
SPREAD_FIT = min(max(best[6], 0.0), SPREAD_MAX)


def fit_depths(t, R, tips):
    if MEAN_DEPTH:
        FIT_DEPTH.update({f: key_contact(semi, t + R @ tips[f]).y - key_front(key_of(semi)[1]) for f, semi in pose.items()})


fit_depths(Vector(best[:3]), frame_from(*best[3:6]), {f: local_tip_at(f, best[6]) for f in pose})

# 3. The arm brings the wrist there (the caller's place_arm: wrist point, hand frame, yaw).
reset()
place_arm(Vector(best[:3]), frame_from(*best[3:6]), best[3])

# 4. Curl every finger. Pressed fingers keep the apple arc: the last millimetres come from the
# curl scale and a small knuckle flex/yaw; only the thumb is solved by IK. Every step pays for
# skin in the keys or in another finger (hits).
apply_curl(SPREAD_FIT)
thumb_home = [P[f"finger1-{j}.{SIDE}"].matrix_basis.copy() for j in (1, 2, 3)]
targets, before, adjust = {}, {}, {}
for f, semi in pose.items():
    tip = world(f"finger{f}-3.{SIDE}", "tail")
    before[f] = round((tip - key_contact(semi, tip)).length * 1000, 1)


def hits(f, margin=0.0):
    return W_HIT ** 2 * (sum(p * p for p in key_pens(f, margin)) + sum(p * p for p in finger_pens(f)))


# Free fingers lift at the knuckle and straighten a little until the tip floats
# HOVER above the keys and no skin is within HOVER_SKIN of them; a free thumb is lifted by IK
# (flexing would fold it under the palm). Redone after every turn of the hand.
LIFT = (-30, -10, -10)             # degrees per unit of lift, joints 1, 2, 3: up at the knuckle, a little straighter
HOVER_SKIN = 0.003
# A free finger rests nearly straight over the apple: a fraction of the apple curl.
FREE_CURL = 0.6
# Knuckle abduction from the parallel (neutral) finger, degrees, +Z to the pinky; spread included.
ABDUCT = {f: (lo, hi) if MIRROR > 0 else (-hi, -lo) for f, (lo, hi) in
          {2: (-30.0, 15.0), 3: (-25.0, 25.0), 4: (-20.0, 25.0), 5: (-5.0, 45.0)}.items()}


def finger_angle(f):
    """Direction of finger f (knuckle to tip) seen from above the hand, degrees, + to the thumb."""
    v = hand_frame().transposed() @ (world(f"finger{f}-3.{SIDE}", "tail") - world(f"finger{f}-1.{SIDE}"))
    return math.degrees(math.atan2(v.x, v.y))


for f in range(2, 6):
    if f not in pose:
        set_finger(f, SPREAD_FIT, FREE_CURL * CURL_SCALE[f])
REST_ANGLE = {f: finger_angle(f) for f in range(2, 6)}     # the unturned fan at SPREAD_FIT
curl_base = {f: [P[f"finger{f}-{j}.{SIDE}"].matrix_basis.copy() for j in (1, 2, 3)] for f in range(2, 6) if f not in pose}
hover_base = {}


def thumb_to_home():
    for j, m in zip((1, 2, 3), thumb_home):
        P[f"finger1-{j}.{SIDE}"].matrix_basis = m
    vl.update()


def lift_thumb():
    thumb_to_home()
    H = hand_frame()
    knuckle = world(f"finger1-2.{SIDE}")
    tip = world(f"finger1-3.{SIDE}", "tail")
    _, t1, p1 = solve_ik(1, tip + Vector((0, 0, max(0.0, KEY_TOP + HOVER - tip.z))),
                         knuckle + H.col[0] * 0.05 + H.col[2] * 0.03)
    for o in (t1, p1):
        bpy.data.objects.remove(o)


# A tucked thumb (EXAMPLE) lies under the palm: its tip below the index finger's knuckle, towards the
# middle finger and the wrist, in the hand frame (side to the thumb, forward, up); never in the keys.
TUCK_FROM_INDEX = Vector((-0.010, -0.015, -0.030))


def tuck_thumb():
    thumb_to_home()
    H = hand_frame()
    goal = world(f"finger2-1.{SIDE}") + H @ TUCK_FROM_INDEX
    goal.z = max(goal.z, KEY_TOP + HOVER)
    knuckle = world(f"finger1-2.{SIDE}")
    _, t1, p1 = solve_ik(1, goal, knuckle + H.col[0] * 0.05 + H.col[2] * 0.03)
    for o in (t1, p1):
        bpy.data.objects.remove(o)


def lift_finger(f):
    bones = [P[f"finger{f}-{j}.{SIDE}"] for j in (1, 2, 3)]

    def lifted(u):
        for b, m, deg in zip(bones, curl_base[f], LIFT):
            b.matrix_basis = m @ Matrix.Rotation(math.radians(deg * u), 4, "X")
        vl.update()
        return world(f"finger{f}-3.{SIDE}", "tail").z >= KEY_TOP + HOVER and max(key_pens(f, HOVER_SKIN)) == 0

    if not lifted(0):
        lo, hi = 0.0, 2.0
        for _ in range(20):
            mid = (lo + hi) / 2
            if lifted(mid):
                hi = mid
            else:
                lo = mid
        lifted(hi)
    hover_base[f] = P[f"finger{f}-1.{SIDE}"].matrix_basis.copy()


def press_thumb():
    """IK the pressed thumb onto its key, then nudge the IK target so its skin keeps out of the
    keys and the fingers. Returns the contact point the thumb got to."""
    thumb_to_home()
    contact = key_contact(pose[1], world(f"finger1-3.{SIDE}", "tail"))
    knuckle = world(f"finger1-1.{SIDE}")
    pole = Vector((knuckle.x, knuckle.y + 0.02, knuckle.z + 0.08))

    def thumb_cost(v):
        thumb_to_home()
        bend = min(max(v[3], 0.0), THUMB_BEND_MAX)
        solve_thumb_bent(contact + Vector(v[:3]), pole, bend)
        # the thumb may bend its tip joint into an "L" to come down on its key past the neighbour
        return contact_miss(1) + hits(1) + (0.001 * bend / 30) ** 2 + (0.01 * (v[3] - bend)) ** 2

    tries = [nelder_mead(thumb_cost, [0.0, 0.0, 0.0, b], [0.003, 0.003, 0.003, 15.0], iters=50) for b in (10.0, 45.0)]
    v = min(tries, key=lambda r: r[1])[0]
    thumb_cost(v)
    adjust[1] = {"tip_bend": round(min(max(v[3], 0.0), THUMB_BEND_MAX), 1)}
    # the IK slides the tip along its key from the home point: the contact is where it got (its side
    # within THUMB_SIDE of the key's middle, as contact_miss judges it)
    tip = world(f"finger1-3.{SIDE}", "tail")
    contact = key_contact(pose[1], tip)
    contact.x += max(-THUMB_SIDE, min(THUMB_SIDE, tip.x - contact.x))
    return contact


THUMB_BEND_MAX = 80.0              # the thumb's tip joint, degrees past rest
YAW_EASY = 20.0                    # knuckle yaw past this is dear: the hand turns instead (step 5)
KNUCKLE_BACK = 10.0                # a pressing finger's knuckle bends back this far at most, degrees
CURL_MIN = 0.4                     # and its curl flattens to this share of the apple at most
STRAIGHT_FLEX = {f: rest_flex(f"metacarpal{f - 1}.{SIDE}", f"finger{f}-1.{SIDE}") for f in (2, 3, 4, 5)}


def press_finger(f, start):
    s0 = CURL_SCALE[f]

    def finger_cost(v):
        set_finger(f, SPREAD_FIT, v[0], (v[1], v[2]))
        # 10 degrees at the knuckle or 0.3 of curl scale cost as much as 2 mm of miss; a tip deeper
        # than the playing depth (towards the black keys) curls back
        deep = world(f"finger{f}-3.{SIDE}", "tail").y - key_front(black) - max(PLAY_DEPTH, FIT_DEPTH.get(f, 0.0))
        return (contact_miss(f) + (0.2 * max(0.0, deep)) ** 2
                + (0.002 * v[1] / 10) ** 2 + (0.002 * v[2] / 10) ** 2
                + (0.01 * max(0.0, abs(v[2]) - YAW_EASY) / 5) ** 2
                + (0.005 * max(0.0, y0 - v[2], v[2] - y1)) ** 2
                + (0.002 * (v[0] - s0) / 0.3) ** 2 + hits(f)
                # walls: no knuckle bent back past KNUCKLE_BACK, no curl flatter than CURL_MIN
                + (0.01 * max(0.0, -KNUCKLE_BACK - knuckle_flex(v)) / 5) ** 2
                + (0.01 * max(0.0, CURL_MIN - v[0]) / 0.1) ** 2)

    def knuckle_flex(v):
        """Flex of the knuckle from a straight finger, degrees."""
        return math.degrees(STRAIGHT_FLEX[f]) + v[1] + v[0] * CURL[f][0][0][1]

    y0, y1 = yaw_range(f)
    black = key_of(pose[f])[1]

    # the penalties are walls a simplex cannot cross: start from the last pose and from the apple
    tries = [nelder_mead(finger_cost, x, [0.1, 5.0, 5.0], iters=300) for x in (start, [s0, 0.0, 0.0], [s0 * 0.6, 10.0, 0.0])]
    v = min(tries, key=lambda r: r[1])[0]
    finger_cost(v)
    return v


def yaw_range(f):
    """Extra knuckle yaw that keeps finger f within its abduction, on top of the fitted spread."""
    lo, hi = ABDUCT[f]
    sp = sum(d for a, d in SPREAD[f] if a == "Z") * SPREAD_FIT
    return lo - sp, hi - sp


def fan_target(f):
    """Where a free finger points: the rest fan turned by its pressed neighbours' turn, between two of
    them in proportion, beside one fading with the distance (the tendons link neighbours)."""
    turn = {g: finger_angle(g) - REST_ANGLE[g] for g in range(2, 6) if g in pose}
    a = max((g for g in turn if g < f), default=None)
    b = min((g for g in turn if g > f), default=None)
    if a and b:
        d = turn[a] + (turn[b] - turn[a]) * (f - a) / (b - a)
    elif a or b:
        g = a or b
        d = turn[g] * 0.6 ** abs(f - g)
    else:
        d = 0.0
    return REST_ANGLE[f] + d


def hover_finger(f, hx=None):
    """Knuckle yaw about the rest palm normal, on top of the curl and the lift, within the finger's
    abduction: the tip over its key (hx), or else the finger along its natural fan."""
    knuckle = P[f"finger{f}-1.{SIDE}"]
    target = None if hx is not None else fan_target(f)

    def yaw_cost(yaw):
        knuckle.matrix_basis = Matrix.Rotation(math.radians(yaw), 4, "Z") @ hover_base[f]
        vl.update()
        aim = ((world(f"finger{f}-3.{SIDE}", "tail").x - hx) ** 2 if target is None
               else (0.002 * (finger_angle(f) - target) / 5) ** 2)
        return aim + hits(f)

    y0, y1 = yaw_range(f)
    yaw = min((y0 + (y1 - y0) * k / 24 for k in range(25)), key=yaw_cost)
    lo, hi = max(y0, yaw - 2.5), min(y1, yaw + 2.5)
    for _ in range(12):
        m1, m2 = lo + (hi - lo) / 3, hi - (hi - lo) / 3
        if yaw_cost(m1) < yaw_cost(m2):
            hi = m2
        else:
            lo = m1
    yaw = (lo + hi) / 2
    yaw_cost(yaw)
    return yaw


press_v = {}


def settle():
    if 1 in pose:
        targets[1] = press_thumb()
    elif EXAMPLE and EXAMPLE.get("thumb") == "tucked":
        tuck_thumb()
    else:
        lift_thumb()
    for f in curl_base:
        lift_finger(f)
    for f in pose:
        if f != 1:
            press_v[f] = v = press_finger(f, press_v.get(f, [CURL_SCALE[f], 0.0, 0.0]))
            targets[f] = key_contact(pose[f], world(f"finger{f}-3.{SIDE}", "tail"))
            adjust[f] = {"scale": round(v[0], 2), "flex": round(v[1], 1), "yaw": round(v[2], 1)}
    # free fingers follow the pressed ones (twice: free neighbours settle against each other)
    for _ in range(2):
        for f in curl_base:
            adjust[f] = {"hover_yaw": round(hover_finger(f, hover_x.get(f)), 1)}
            if f not in hover_x:
                adjust[f]["fan_deg"] = [round(fan_target(f) - REST_ANGLE[f], 1), round(finger_angle(f) - REST_ANGLE[f], 1)]


settle()


# 5. Turn the hand with the fingers as posed: a rigid refit of the wrist position and the hand's
# rotation (the forearm follows part of the yaw), then the fingers settle again. Twice.
def posed_shape():
    M, w0 = hand_frame().transposed(), world(f"wrist.{SIDE}")
    tips = {f: M @ (world(f"finger{f}-3.{SIDE}", "tail") - w0) for f in range(1, 6)}
    reach = {}
    for f in pose:
        if f != 1:
            longest = 0.97 * sum(P[f"finger{f}-{j}.{SIDE}"].length for j in (1, 2, 3))
            reach[f] = (M @ (world(f"finger{f}-1.{SIDE}") - w0), 0.6 * longest, longest)
    body = {}
    for f in range(1, 6):
        body[f] = []
        for j in PHALANGES[f]:
            a, b, X, Z, r = capsule(f, j)
            for s in (0.0, 0.5, 1.0):
                for (c, sn), rk in list(zip(RING, r))[::2]:
                    q = a + (b - a) * s + (X * c + Z * sn) * rk
                    body[f].append((M @ (q - w0), 0.0, j == 3))
    return tips, body, reach


def quality():
    """What a finished pose is judged by: pressed pads on their keys, no skin in the keys or in
    another finger, free tips over their keys."""
    q = sum(contact_miss(f) for f in pose) + sum(hits(f) for f in range(1, 6))
    return q + sum(((0.2 if f == 1 else 1.0) * (world(f"finger{f}-3.{SIDE}", "tail").x - hx)) ** 2
                   for f, hx in hover_x.items())


def snapshot():
    return (quality(), rig.matrix_world.copy(), [pb.matrix_basis.copy() for pb in P], dict(targets),
            {f: dict(a) for f, a in adjust.items()}, list(turn))


turn = list(best[:6])
kept = snapshot()
for _ in range(2):
    # Every finger is posed again after the turn: a pressed one may curl or straighten within its
    # reach (weakly pulled to its present shape) and aims at the height where its pad just touches;
    # only the pressed thumb's skin counts here (its IK does not see the keys).
    tips, body, reach = posed_shape()
    body = {f: pts for f, pts in body.items() if f == 1 and f in pose}
    clear = {}
    for f in pose:
        t = world(f"finger{f}-3.{SIDE}", "tail")
        clear[f] = t.z - pressed_top(key_of(pose[f])[1], t.y) + pad_depth(f) - PAD_SQUISH / 2

    curled = {f: local_tip_at(f, SPREAD_FIT) for f in range(2, 6)}
    knuckles = hand_frame().transposed() @ (knuckles_world() - world(f"wrist.{SIDE}"))

    def refit(v):
        t, R = Vector(v[:3]), frame_from(*v[3:6])
        return (hand_cost(t, R, tips, body, None, False, clear, reach, curled, stretch_drop(SPREAD_FIT), REFIT_THUMB_PULL)
                + turn_cost(v[3:6], stretch_drop(SPREAD_FIT), v[:3]) + knuckle_cost(t, R, knuckles))

    turn, residual = nelder_mead(refit, turn, [0.003, 0.003, 0.003, 0.05, 0.03, 0.03], iters=800)
    fit_depths(Vector(turn[:3]), frame_from(*turn[3:6]), tips)
    place_arm(Vector(turn[:3]), frame_from(*turn[3:6]), turn[3])
    settle()
    if quality() < kept[0]:
        kept = snapshot()
# a turn that made the pose worse is undone
_, rig.matrix_world, bases, targets, adjust, turn = kept
for pb, m in zip(P, bases):
    pb.matrix_basis = m
vl.update()


# 6. The capsules only guess the skin (the thumb's pad deforms higher than its capsule, subdivision
# pulls every fingertip in): measure the pad on the mesh as rendered, correct the capsule by the
# difference and press again.
def mesh_pad_depth(f):
    arm = list(mesh.modifiers)
    for m in arm:
        m.show_viewport = True
    vl.update()
    ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    tail, best = world(f"finger{f}-3.{SIDE}", "tail"), -0.02
    for v in ev.data.vertices:
        p = mesh.matrix_world @ v.co
        if (p - tail).length < 0.014:
            top, semi = key_at(p.x, p.y)
            if semi == pose[f]:
                best = max(best, top - p.z)
    for m in arm:
        m.show_viewport = False
    vl.update()
    return best


for _ in range(2):
    for f in pose:
        PAD_FIX[f] = mesh_pad_depth(f) - capsule_pad_depth(f)
    for f in pose:
        if f == 1:
            targets[1] = press_thumb()
        else:
            press_v[f] = v = press_finger(f, press_v[f])
            targets[f] = key_contact(pose[f], world(f"finger{f}-3.{SIDE}", "tail"))
            adjust[f] = {"scale": round(v[0], 2), "flex": round(v[1], 1), "yaw": round(v[2], 1)}

for m in mesh.modifiers:
    m.show_viewport = True
vl.update()


def example_report():
    """How the posed hand keeps to the example: its turn on the key plane and the knuckles across the keys
    (as the video measures them: wrist -> middle knuckle, + fingers to the treble), and the thumb tip."""
    fwd = world(f"finger3-1.{SIDE}") - world(f"wrist.{SIDE}")
    yaw = math.atan2(-fwd.x, fwd.y)
    thumb = world(f"finger1-3.{SIDE}", "tail")
    return {"yaw off deg": round(math.degrees(yaw - EXAMPLE["yaw"]), 1),
            "knuckles off mm": round((knuckles_world().x - EXAMPLE["knuckle_x"]) * 1000, 1),
            "thumb": EXAMPLE.get("thumb"), "thumb tip over keys mm": round((thumb.z - KEY_TOP) * 1000, 1)}
