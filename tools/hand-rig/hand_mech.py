"""The pianist rig's hand as a mechanism: rigid phalanges, hinge joints whose limits are walls, and a finger's
natural curl as one number - the radius of a ball its phalanges lie on as chords.

Pure geometry with mathutils (run inside Blender). Lengths in mm, in the hand frame of a RIGHT hand: x towards
the little finger, y forward along the middle finger, z out of the back of the hand, the wrist bone's head at
the origin. A left hand is mirrored into that frame (armature x -> -x) and back, so one code path serves both.

grasp(rest, R): the palm lies on a ball of radius R; every phalanx of fingers 2-5 is a chord of the ball (its
palmar side touching it), each finger in the vertical plane through the ball's centre. The thumb wraps the
ball along the great circle through its CMC, heading away from the little finger's tip but at most
THUMB_RADIAL_MAX off the index. A joint that the ball would bend past its limit stops at the limit and is
reported as squeezed; nothing here ever leaves a joint outside LIM or ABD.
"""
import math
try:
    from mathutils import Matrix, Vector
except ImportError:                                     # outside Blender: the walls below, no geometry
    pass

R_FINGER = {1: 10.5, 2: 9.0, 3: 9.0, 4: 8.5, 5: 7.5}     # phalanx radius, mm (MED: adult averages)
PALM_HALF = 13.0                                        # half the palm's thickness, mm
THUMB_RADIAL_MAX = 90.0                                 # the thumb off the index in the palm's plane (the "L")
THUMB_PALMAR_MAX = 45.0                                 # the thumb off the palm's plane, towards the palm
# flexion limits, degrees (MED: textbook ranges; checked against the videos' angles in task 5.2)
LIM = {"mcp": (-20, 90), "pip": (0, 110), "dip": (0, 80), "t_mcp": (-10, 60), "t_ip": (-15, 80)}
# Spread at MCP, degrees, + towards the thumb: a finger's plane off the middle finger's rest direction (the
# fingers together; the rig's rest hand is fanned, its little finger 27-33 deg out). The little finger goes
# far out and hardly in, the index the other way (MED: the top video's fingers against the middle one)
ABD = {2: (-15.0, 30.0), 3: (-20.0, 20.0), 4: (-25.0, 15.0), 5: (-45.0, 15.0)}
# How a finger shares its bend between MCP, PIP and DIP, degrees: the medians of the side video's near hand
# (Hn6tFiyNMBQ, MediaPipe world points; MCP below the palm's plane through landmarks 0, 5, 17). A top view
# cannot split a bend between the joints, so a finger's shape from it is this split times one curl (MED)
BEND_SPLIT = {2: (30.0, 24.0, 18.0), 3: (17.0, 26.0, 24.0), 4: (19.0, 30.0, 21.0), 5: (44.0, 17.0, 18.0)}


def rest_from_rig(rig, side):
    """Rest geometry of one hand of the rig (bones finger<f>-<j>.<side>, wrist.<side>) in the hand frame."""
    b = rig.data.bones
    S = rig.matrix_world.to_3x3().median_scale * 1000
    mirror = side == "L"
    flip = lambda p: Vector((-p.x, p.y, p.z)) if mirror else Vector(p)
    head = lambda n: flip(b[f"{n}.{side}"].head_local)
    tail = lambda n: flip(b[f"{n}.{side}"].tail_local)
    w = head("wrist")
    fwd = (head("finger3-1") - w).normalized()
    ulnar = head("finger5-1") - head("finger2-1")
    ulnar = (ulnar - fwd * ulnar.dot(fwd)).normalized()
    F = Matrix((ulnar, fwd, ulnar.cross(fwd)))           # rows: the hand's axes in (mirrored) armature space
    loc = lambda p: (F @ (p - w)) * S
    return {"side": side, "S": S, "F": F, "w": w, "mirror": mirror,
            "mcp": {f: loc(head(f"finger{f}-1")) for f in range(1, 6)},
            "tip": {f: loc(tail(f"finger{f}-3")) for f in range(1, 6)},
            "len": {f: [b[f"finger{f}-{j}.{side}"].length * S for j in (1, 2, 3)] for f in range(1, 6)}}


def rest_for_place(rig, side):
    """rest_from_rig in hand_shape.load_rest's form (numpy, with the neutral and index directions): place()'s
    rest straight from the rig, without mech_sweep.py's report."""
    import numpy as np
    r = rest_from_rig(rig, side)
    mcp = {f: np.array(tuple(v)) for f, v in r["mcp"].items()}
    tip = {f: np.array(tuple(v)) for f, v in r["tip"].items()}
    flat_ = lambda v: np.array([v[0], v[1], 0.0]) / math.hypot(v[0], v[1])
    return {"mcp": mcp, "len": r["len"], "neutral": flat_(tip[3] - mcp[3]), "idx": flat_(mcp[2])}


def to_armature(rest, p):
    """A hand-frame point (mm) in the rig's armature space."""
    q = rest["w"] + rest["F"].transposed() @ (Vector(p) / rest["S"])
    return Vector((-q.x, q.y, q.z)) if rest["mirror"] else q


def circle_hits(p, L, c, rho):
    d = (c - p).length
    if d < 1e-9 or d > L + rho or d < abs(L - rho):
        return []
    a = (L * L - rho * rho + d * d) / (2 * d)
    hgt = math.sqrt(max(0.0, L * L - a * a))
    e = (c - p) / d
    n = Vector((-e.y, e.x))
    m = p + e * a
    return [m + n * hgt, m - n * hgt]


def polar(p, c):
    return math.atan2(p.y - c.y, p.x - c.x)


def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def chain_2d(start, lengths, c, rho, sign, h0, lims):
    """Segments from start, each ending on the circle (c, rho), going round it in the direction sign (+1
    counter-clockwise); a segment that cannot reach the circle points at its centre. A joint's turn (the first
    one from heading h0, if given) past its (lo, hi) limit in degrees is held at the limit: below lo the finger
    leaves the ball, above hi the ball is too small for it (squeezed)."""
    pts, p, h_prev, squeezed = [start], start, h0, []
    for i, L in enumerate(lengths):
        hits = circle_hits(p, L, c, rho)
        a0 = polar(p, c)
        best = None
        for q in hits:
            adv = wrap(polar(q, c) - a0) * sign
            if adv > 1e-6 and (best is None or adv < best[0]):
                best = (adv, q)
        if best is not None:
            q = best[1]
        elif hits:
            q = max(hits, key=lambda q: wrap(polar(q, c) - a0) * sign)
        else:
            q = p + (c - p).normalized() * L
        h = math.atan2(q.y - p.y, q.x - p.x)
        if h_prev is not None:
            flex = math.degrees(sign * wrap(h - h_prev))
            lo, hi = lims[i]
            if flex < lo or flex > hi:
                if flex > hi:
                    squeezed.append(i)
                flex = min(max(flex, lo), hi)
                h = h_prev + sign * math.radians(flex)
                q = p + Vector((math.cos(h), math.sin(h))) * L
        pts.append(q)
        p, h_prev = q, h
    return pts, squeezed


def turns(pts2):
    return [math.atan2(b.y - a.y, b.x - a.x) for a, b in zip(pts2, pts2[1:])]


def flat(v):
    return Vector((v.x, v.y, 0)).normalized()


def finger_on_ball(rest, f, C, R, spread=1.0):
    """Finger f (2-5) wrapped on the ball (centre C, radius R) in the vertical plane through its MCP whose
    direction is the middle finger's rest direction turned towards the ball's centre by spread (0..1), the
    turn held within ABD. Returns the joints MCP..tip, the angles and the joints held at a limit."""
    J0 = rest["mcp"][f]
    up = Vector((0, 0, 1))
    neutral = flat(rest["tip"][3] - rest["mcp"][3])
    radial = flat(J0 - C)
    d = neutral.lerp(radial, spread).normalized()
    abd = math.degrees(neutral.angle(d)) if (d - neutral).length > 1e-9 else 0.0
    abd = abd if neutral.cross(d).z > 0 else -abd
    lo, hi = ABD[f]
    if not lo <= abd <= hi:
        abd = min(max(abd, lo), hi)
        d = (Matrix.Rotation(math.radians(abd), 3, "Z") @ neutral).normalized()
    m = d.cross(up)
    off = (C - J0).dot(m)
    Cp = C - m * off                                     # the ball's centre seen in the finger's plane
    rho = math.sqrt(max((R + R_FINGER[f]) ** 2 - off ** 2, 1.0))
    to2 = lambda P: Vector(((P - J0).dot(d), (P - J0).dot(up)))
    pts2, sq = chain_2d(Vector((0, 0)), rest["len"][f], to2(Cp), rho, -1, 0.0,   # forward and down: clockwise
                        [LIM["mcp"], LIM["pip"], LIM["dip"]])
    h = turns(pts2)
    ang = {"mcp": -math.degrees(h[0]), "pip": -math.degrees(wrap(h[1] - h[0])),
           "dip": -math.degrees(wrap(h[2] - h[1])), "abd": abd}
    return ([J0 + d * q.x + up * q.y for q in pts2], {k: round(v, 1) for k, v in ang.items()},
            [("mcp", "pip", "dip")[i] for i in sq])


def grasp(rest, R, spread=1.0):
    """The hand closed on a ball of radius R (mm) under its palm."""
    palm_c = Vector((0.0, 55.0, -PALM_HALF))             # the palm's centre on its palmar side
    C = palm_c - Vector((0, 0, R))
    out = {"R": R, "C": C, "chains": {}, "angles": {}, "squeezed": {}}
    for f in (2, 3, 4, 5):
        ch, ang, sq = finger_on_ball(rest, f, C, R, spread)
        out["chains"][f], out["angles"][f] = ch, ang
        if sq:
            out["squeezed"][f] = sq
    # the thumb: the great circle through its CMC whose tangent at the CMC points away from the little tip,
    # at most THUMB_RADIAL_MAX off the index
    cmc, p5 = rest["mcp"][1], out["chains"][5][-1]
    idx = flat(rest["mcp"][2])
    want = flat(cmc - p5)
    if math.degrees(want.angle(idx)) > THUMB_RADIAL_MAX:
        turn = THUMB_RADIAL_MAX if idx.cross(want).z > 0 else -THUMB_RADIAL_MAX
        want = (Matrix.Rotation(math.radians(turn), 3, "Z") @ idx).normalized()
    e1 = (cmc - C).normalized()
    t = want - e1 * want.dot(e1)
    if t.length < 1e-6:
        t = Vector((0, 1, 0)) - e1 * e1.y
    e2 = t.normalized()
    to2 = lambda P: Vector(((P - C).dot(e1), (P - C).dot(e2)))
    pts2, sq = chain_2d(to2(cmc), rest["len"][1], Vector((0, 0)), R + R_FINGER[1], 1, None,
                        [(-90, 90), LIM["t_mcp"], LIM["t_ip"]])
    ch = [C + e1 * q.x + e2 * q.y for q in pts2]
    # CMC walls: palmar below the palm's plane, radial off the index in it. A thumb past one is turned back
    # onto it about the CMC as a whole (it leaves the ball there) and reported as squeezed at the CMC.
    t_dir = (ch[1] - cmc).normalized()
    palmar = math.degrees(math.asin(max(-1, min(1, -t_dir.z))))
    if palmar > THUMB_PALMAR_MAX + 0.01:
        M = Matrix.Rotation(math.radians(palmar - THUMB_PALMAR_MAX), 3, flat(t_dir).cross(Vector((0, 0, 1))))
        ch = [cmc + M @ (p - cmc) for p in ch]
        sq = sorted(set(sq) | {0})
    t_dir = (ch[1] - cmc).normalized()
    radial = math.degrees(flat(t_dir).angle(idx))
    if radial > THUMB_RADIAL_MAX + 0.01:
        turn = radial - THUMB_RADIAL_MAX
        M = Matrix.Rotation(math.radians(-turn if idx.cross(flat(t_dir)).z > 0 else turn), 3, "Z")
        ch = [cmc + M @ (p - cmc) for p in ch]
        sq = sorted(set(sq) | {0})
    t_dir = (ch[1] - cmc).normalized()
    radial = math.degrees(flat(t_dir).angle(idx))
    palmar = math.degrees(math.asin(max(-1, min(1, -t_dir.z))))
    out["chains"][1] = ch
    h = turns(pts2)
    out["angles"][1] = {"cmc_radial": round(radial, 1), "cmc_palmar": round(palmar, 1),
                        "t_mcp": round(math.degrees(wrap(h[1] - h[0])), 1),
                        "t_ip": round(math.degrees(wrap(h[2] - h[1])), 1)}
    if sq:
        out["squeezed"][1] = [("cmc", "t_mcp", "t_ip")[i] for i in sq]
    t1 = ch[-1]
    out["thumb_little_mm"] = round((t1 - p5).length - R_FINGER[1] - R_FINGER[5], 1)
    out["low_z"] = min(min(p.z - R_FINGER[f] for p in c) for f, c in out["chains"].items())
    out["palm_over_low_mm"] = round(palm_c.z - out["low_z"], 1)
    return out


def violations(g):
    """Joints outside their walls in a grasp result (must be empty: the walls hold)."""
    bad = []
    for f in (2, 3, 4, 5):
        a = g["angles"][f]
        for k in ("mcp", "pip", "dip"):
            lo, hi = LIM[k]
            if not lo - 0.05 <= a[k] <= hi + 0.05:
                bad.append(f"{f}.{k} {a[k]}")
        if not ABD[f][0] - 0.05 <= a["abd"] <= ABD[f][1] + 0.05:
            bad.append(f"{f}.abd {a['abd']}")
    a = g["angles"][1]
    for k in ("t_mcp", "t_ip"):
        lo, hi = LIM[k]
        if not lo - 0.05 <= a[k] <= hi + 0.05:
            bad.append(f"1.{k} {a[k]}")
    if a["cmc_radial"] > THUMB_RADIAL_MAX + 0.05:
        bad.append(f"1.cmc_radial {a['cmc_radial']}")
    if a["cmc_palmar"] > THUMB_PALMAR_MAX + 0.05:
        bad.append(f"1.cmc_palmar {a['cmc_palmar']}")
    return bad


# --- The pose in three layers: root, shape, press -------------------------------------------------------
# Pure numpy, no Blender. The rig hand comes from mech_sweep.py's report (hand_shape.load_rest); the world is
# hand_shape's: mm, x along the keys from C4's centre (mirrored for a left hand), y into the keys from the
# white front edge, z up from the white top. Fingers 2-5 bend BEND_SPLIT[f] * curl, a finger's curl being the
# hand's curl times the example's relative curl (times k after step 3); the thumb keeps its example angles.
#
#   python tools/hand-rig/hand_mech.py check <hand-poses dir> --rest <mech-report.json> [--from 2.7 --to 18.5]

WHITE_W, BLACK_FRONT, BLACK_TOP = 23.5, 55.0, 12.0       # mm (hand_keys.py's keys)
WHITE_PCS = (0, 2, 4, 5, 7, 9, 11)
CONTACT_X = {False: 6.0, True: 3.0}      # mm: a pressing tip's axis off its key's centre line (MED)
CONTACT_Y = {False: (15.0, 55.0), True: (60.0, 125.0)}    # mm into the keys: a white key short of the blacks
CONTACT_Y_DEEP = {False: (15.0, 110.0), True: (60.0, 125.0)}   # ...and between them, when the hand cannot
TIP_ABOVE = 0.8                          # of the finger's radius: the tip's axis over the key top (hand_shape)
CLEAR = 2.0                              # mm: a free finger's joints over the white top, past TIP_ABOVE
KEY_DIP = 10.0                           # mm: a key's travel, the press layer
MISS_MM, K_BAND, YAW_TOL = 6.0, (0.85, 1.15), 5.0      # a lesson, not a simulator: the tip in its key
AIM_PASSES = 3                           # fits per release stage, the tips' aims taken anew before each
ROLL = (-180.0, 20.0)                    # deg off palm-down, + = thumb down (the spec's roll wall)
PITCH = (-45.0, 60.0)                    # deg, + = fingers down
WRIST_Z = 40.0                           # mm over the white top: pianist_pose.py's default wrist (6.2: the arm's)
THUMB_RADIAL_MIN, THUMB_PALMAR_MIN = -10.0, -15.0        # hand_shape.py's floors (MED)
# A few tips fix fewer numbers than root and curl have: of the poses that touch, the one nearest this reference
# (yaw and wrist from the example). One sigma off it weighs as REF_W mm of a tip's miss: it only picks among
# poses that touch. Pitch and roll: the video fits' medians lie at roll -16 (left) / -7 (right) (MED)
REF = {"pitch": (10.0, 15.0), "roll": (-10.0, 15.0), "yaw": 3.0, "wrist": 20.0, "curl": (1.0, 0.3), "k": 0.1,
       "spread": 5.0}
REF_W = 0.1
THUMB_KEYS = ("cmc_radial", "cmc_palmar", "t_mcp", "t_ip")
CHAIN = {1: (1, 2, 3, 4), 2: (5, 6, 7, 8), 3: (9, 10, 11, 12), 4: (13, 14, 15, 16), 5: (17, 18, 19, 20)}


def _np():
    import numpy
    return numpy


def _rot(axis, a):
    c, s = math.cos(a), math.sin(a)
    m = {"x": [[1, 0, 0], [0, c, -s], [0, s, c]], "y": [[c, 0, s], [0, 1, 0], [-s, 0, c]],
         "z": [[c, -s, 0], [s, c, 0], [0, 0, 1]]}[axis]
    return _np().array(m)


def hand_joints(rest, ang, root):
    """The 21 MediaPipe joints of the rig hand, world mm, for explicit angles {f: {mcp, pip, dip, abd}} and
    {1: thumb angles}, and root (yaw, pitch, roll, tx, ty, tz) - hand_shape.hand_points' mechanism."""
    np = _np()
    P = np.zeros((21, 3))
    up = np.array([0.0, 0.0, 1.0])
    for f in (2, 3, 4, 5):
        a = ang[f]
        m, p, d = (math.radians(a[k]) for k in ("mcp", "pip", "dip"))
        dirn = _rot("z", math.radians(a["abd"])) @ rest["neutral"]
        q = np.array(rest["mcp"][f], float)
        P[CHAIN[f][0]] = q
        for j, (L, h) in enumerate(zip(rest["len"][f], (-m, -m - p, -m - p - d))):
            q = q + L * (math.cos(h) * dirn + math.sin(h) * up)
            P[CHAIN[f][j + 1]] = q
    r, pl, tm, ti = (math.radians(ang[1][k]) for k in THUMB_KEYS)
    fl = _rot("z", r) @ rest["idx"]
    u = math.cos(pl) * fl - math.sin(pl) * up
    w = _rot("z", -math.pi / 2) @ fl
    q = np.array(rest["mcp"][1], float)
    P[1] = q
    for j, (L, h) in enumerate(zip(rest["len"][1], (0.0, tm, tm + ti))):
        q = q + L * (math.cos(h) * u + math.sin(h) * w)
        P[2 + j] = q
    yaw, pitch, roll, tx, ty, tz = root
    R = _rot("z", -math.radians(yaw)) @ _rot("x", -math.radians(pitch)) @ _rot("y", -math.radians(roll))
    return P @ R.T + np.array([tx, ty, tz])


def curl_max(f):
    """The largest curl of finger f (2-5) that keeps MCP, PIP and DIP inside their walls."""
    return min(LIM[k][1] / b for k, b in zip(("mcp", "pip", "dip"), BEND_SPLIT[f]))


def k_range(vals, lims, band=K_BAND):
    """The k with lo <= v * k <= hi for every (v, (lo, hi)), inside band."""
    lo, hi = band
    for v, (a, b) in zip(vals, lims):
        if abs(v) > 1e-9:
            k1, k2 = sorted((a / v, b / v))
            lo, hi = max(lo, k1), min(hi, k2)
    return lo, hi


def angles(shape, curl, k=None, spread=None, lift=None):
    """Explicit angles from a shape ({fingers: {f: {abd, rel}}, thumb}), the hand's curl and per finger k,
    spread (abd; the thumb's cmc_radial) and lift (deg off MCP; the thumb's off cmc_palmar), free fingers."""
    k, spread, lift = k or {}, spread or {}, lift or {}
    out = {}
    for f in (2, 3, 4, 5):
        s = shape["fingers"][str(f)]
        c = curl * s["rel"] * k.get(f, 1.0)
        m, p, d = (b * c for b in BEND_SPLIT[f])
        out[f] = {"mcp": m - lift.get(f, 0.0), "pip": p, "dip": d, "abd": spread.get(f, s["abd"])}
    t = dict(shape["thumb"])
    t["t_mcp"], t["t_ip"] = t["t_mcp"] * k.get(1, 1.0), t["t_ip"] * k.get(1, 1.0)
    sp = spread.get(1)
    if isinstance(sp, (tuple, list)):         # the thumb's spread is its CMC: radial and palmar
        t["cmc_radial"], t["cmc_palmar"] = sp
    elif sp is not None:
        t["cmc_radial"] = sp
    t["cmc_palmar"] -= lift.get(1, 0.0)
    out[1] = t
    return out


def key_target(pitch, finger, mirror, deep=False):
    """Where a pressing tip's axis goes on its key: a box across x and y (deep: a white key's stretch between
    the blacks too), a height z."""
    octave, pc = divmod(pitch - 60, 12)
    black = pc not in WHITE_PCS
    x = (octave * 7 + WHITE_PCS.index(pc - 1 if black else pc) + (0.5 if black else 0.0)) * WHITE_W
    return {"pitch": pitch, "finger": finger, "black": black, "x": -x if mirror else x, "dx": CONTACT_X[black],
            "y": (CONTACT_Y_DEEP if deep else CONTACT_Y)[black], "z": R_FINGER[finger] * TIP_ABOVE + (BLACK_TOP if black else 0.0)}


def contact(tip, t):
    """The tip's miss of its target box, mm, as a vector (zero inside)."""
    dx = tip[0] - t["x"]
    lo, hi = t["y"]
    return [dx - max(-t["dx"], min(t["dx"], dx)), tip[1] - max(lo, min(hi, tip[1])), tip[2] - t["z"]]


def violations_of(ang, root):
    """Joints and roll outside their walls (must be empty)."""
    bad = []
    for f in (2, 3, 4, 5):
        for k in ("mcp", "pip", "dip"):
            if not LIM[k][0] - 0.05 <= ang[f][k] <= LIM[k][1] + 0.05:
                bad.append(f"{f}.{k} {ang[f][k]:.1f}")
        if not ABD[f][0] - 0.05 <= ang[f]["abd"] <= ABD[f][1] + 0.05:
            bad.append(f"{f}.abd {ang[f]['abd']:.1f}")
    t = ang[1]
    for k, (lo, hi) in (("t_mcp", LIM["t_mcp"]), ("t_ip", LIM["t_ip"]), ("cmc_radial", (THUMB_RADIAL_MIN, THUMB_RADIAL_MAX)),
                        ("cmc_palmar", (THUMB_PALMAR_MIN, THUMB_PALMAR_MAX))):
        if not lo - 0.05 <= t[k] <= hi + 0.05:
            bad.append(f"1.{k} {t[k]:.1f}")
    if not ROLL[0] - 0.05 <= root[2] <= ROLL[1] + 0.05:
        bad.append(f"roll {root[2]:.1f}")
    return bad


def _fit(x0, lo, hi, fun, active=None):
    import hand_shape
    np = _np()
    act = np.ones(len(x0), bool) if active is None else np.array(active, bool)
    return hand_shape.fit(np.array(x0, float), act, np.array(lo, float), np.array(hi, float), fun)


def _solve(rest, shape, targets, yaw0, start, wrist_z, k_band=K_BAND, yaw_tol=YAW_TOL):
    """Steps 2 and 3 for the pressed targets: root and the hand's curl by the tips, then k and spread per
    pressed finger. Returns the pose and its misses."""
    np = _np()
    pressed = {t["finger"]: t for t in targets}
    rels = [shape["fingers"][str(f)]["rel"] for f in (2, 3, 4, 5)]
    cmax = min(curl_max(f) / r for f, r in zip((2, 3, 4, 5), rels) if r > 1e-6)
    floor = [(i, R_FINGER[f] * TIP_ABOVE) for f in pressed for i in CHAIN[f][1:-1] if f != 1]

    ref = np.array([yaw0, REF["pitch"][0], REF["roll"][0], start[0], start[1], REF["curl"][0]])
    sig = np.array([REF["yaw"], REF["pitch"][1], REF["roll"][1], REF["wrist"], REF["wrist"], REF["curl"][1]])
    # Each tip aims at the point of its box nearest to where the pose puts it, the aims taken again after every
    # fit: a point, not the box, since a miss that is zero inside the box has a kink at its edge where the
    # descent stalls (yaw on its wall)
    aim = {}

    def take_aims(p):
        X = hand_joints(rest, angles(shape, p[5]), [*p[:5], wrist_z])
        aim.update({f: X[CHAIN[f][-1]] - np.array(contact(X[CHAIN[f][-1]], t)) for f, t in pressed.items()})

    def res2(p):
        X = hand_joints(rest, angles(shape, p[5]), [p[0], p[1], p[2], p[3], p[4], wrist_z])
        r = [c for f in pressed for c in X[CHAIN[f][-1]] - aim[f]]
        return np.array(r + [min(0.0, X[i][2] - z) for i, z in floor] + list(REF_W * (np.asarray(p) - ref) / sig))

    lo = [yaw0 - yaw_tol, PITCH[0], ROLL[0], -3000, -400, 0.0]
    hi = [yaw0 + yaw_tol, PITCH[1], ROLL[1], 3000, 400, cmax]

    def worst(p):
        X = hand_joints(rest, angles(shape, p[5]), [p[0], p[1], p[2], p[3], p[4], wrist_z])
        return max(float(np.linalg.norm(contact(X[CHAIN[f][-1]], t))) for f, t in pressed.items())

    # Released in order, not all at once: a few tips fix fewer numbers than root and curl have, and a joint
    # descent with everything free settles on the walls (single notes: curl 0, roll +20). The wrist's place,
    # the yaw and the pitch go first, the shape and roll held at the reference; the curl, then the roll, only
    # when the tips still miss.
    p = ref.copy()
    for active in ((1, 1, 0, 1, 1, 0), (1, 1, 0, 1, 1, 1), (1, 1, 1, 1, 1, 1)):
        for _ in range(AIM_PASSES):
            take_aims(p)
            p, _ = _fit(p, lo, hi, res2, active)
        if worst(p) <= MISS_MM:
            break
    return _fingers(rest, shape, targets, [p[0], p[1], p[2], p[3], p[4], wrist_z], p[5], k_band)


def _fingers(rest, shape, targets, root, curl, k_band=K_BAND):
    """Step 3 at a given root and curl: k and spread per pressed finger. Returns the pose and its misses."""
    np = _np()
    pressed = {t["finger"]: t for t in targets}
    floor = [(i, R_FINGER[f] * TIP_ABOVE) for f in pressed for i in CHAIN[f][1:-1] if f != 1]
    k, spread = {}, {}
    for f, t in pressed.items():
        if f == 1:
            th = shape["thumb"]
            kr = k_range((th["t_mcp"], th["t_ip"]), (LIM["t_mcp"], LIM["t_ip"]), k_band)
            sr, s0 = [(THUMB_RADIAL_MIN, THUMB_RADIAL_MAX), (THUMB_PALMAR_MIN, THUMB_PALMAR_MAX)],                 [th["cmc_radial"], th["cmc_palmar"]]
        else:
            c = curl * shape["fingers"][str(f)]["rel"]
            kr = k_range([b * c for b in BEND_SPLIT[f]], [LIM[j] for j in ("mcp", "pip", "dip")], k_band)
            sr, s0 = [ABD[f]], [shape["fingers"][str(f)]["abd"]]
        if kr[0] > kr[1]:
            kr = (kr[1], kr[1])

        def res3(q, f=f, t=t, s0=s0):
            sp = tuple(q[1:]) if f == 1 else q[1]
            X = hand_joints(rest, angles(shape, curl, {f: q[0]}, {f: sp}), root)
            fl = [min(0.0, X[i][2] - z) for i, z in floor if i in CHAIN[f]]
            near = [REF_W * (q[0] - 1.0) / REF["k"]] + [REF_W * (v - v0) / REF["spread"] for v, v0 in zip(q[1:], s0)]
            return np.array(contact(X[CHAIN[f][-1]], t) + fl + near)

        x0 = [min(max(1.0, kr[0]), kr[1])] + [min(max(v, a), b) for v, (a, b) in zip(s0, sr)]
        q, _ = _fit(x0, [kr[0]] + [a for a, _ in sr], [kr[1]] + [b for _, b in sr], res3)
        k[f] = float(q[0])
        spread[f] = tuple(float(v) for v in q[1:]) if f == 1 else float(q[1])
    X = hand_joints(rest, angles(shape, curl, k, spread), root)
    miss = {f: float(np.linalg.norm(contact(X[CHAIN[f][-1]], t))) for f, t in pressed.items()}
    return {"root": [float(v) for v in root], "curl": float(curl), "k": k, "spread": spread, "miss": miss}


def lift_free(rest, shape, pose, free):
    """A free finger whose joints would sink into the keys rises at MCP (the thumb at its CMC, palmar) until
    they clear the white top; PIP and DIP keep the example's shape."""
    lift = {}
    for f in free:
        lo = LIM["mcp"][0] if f != 1 else THUMB_PALMAR_MIN
        for deg in range(0, 181):
            lift[f] = float(deg)
            ang = angles(shape, pose["curl"], pose["k"], pose["spread"], lift)
            cur = ang[f]["mcp"] if f != 1 else ang[f]["cmc_palmar"]
            X = hand_joints(rest, ang, pose["root"])
            if min(X[i][2] for i in CHAIN[f][1:]) >= R_FINGER[f] * TIP_ABOVE + CLEAR or cur - 1 < lo:
                break
        if lift[f] == 0.0:
            del lift[f]
    return lift


def add_angles(ang, delta):
    """Angles with per finger deltas {f: {joint: deg}} added (press_delta's)."""
    out = {g: dict(v) for g, v in ang.items()}
    for f, d in delta.items():
        for k, v in d.items():
            out[f][k] += v
    return out


def press_delta(rest, ang, root, f, depth=KEY_DIP):
    """The press layer: extra flexion {joint: deg} that takes finger f's tip straight down by depth mm (up for
    a negative depth), the tip kept over its point of the key. Fingers 2-5 bend MCP and PIP (DIP with PIP in
    its BEND_SPLIT share): MCP alone swings the tip back along the finger. The thumb lies on its side, its MCP
    and IP bend along the keys, so it goes down at its CMC, towards the palm. Every joint stays in its walls."""
    np = _np()
    tip = lambda d: hand_joints(rest, add_angles(ang, {f: d}), root)[CHAIN[f][-1]]
    goal = tip({}) - np.array([0.0, 0.0, depth])
    if f == 1:
        a, b = THUMB_PALMAR_MIN - ang[1]["cmc_palmar"], THUMB_PALMAR_MAX - ang[1]["cmc_palmar"]
        for _ in range(30):                   # the tip's height falls as the CMC turns towards the palm
            mid = (a + b) / 2
            if tip({"cmc_palmar": mid})[2] > goal[2]:
                a = mid
            else:
                b = mid
        return {"cmc_palmar": round((a + b) / 2, 1)}
    a = ang[f]
    share = BEND_SPLIT[f][2] / BEND_SPLIT[f][1]
    lo = [LIM["mcp"][0] - a["mcp"], max(LIM["pip"][0] - a["pip"], (LIM["dip"][0] - a["dip"]) / share)]
    hi = [LIM["mcp"][1] - a["mcp"], min(LIM["pip"][1] - a["pip"], (LIM["dip"][1] - a["dip"]) / share)]
    of = lambda q: {"mcp": q[0], "pip": q[1], "dip": q[1] * share}
    q, _ = _fit([0.0, 0.0], lo, hi, lambda q: tip(of(q)) - goal)
    return {k: round(float(v), 1) for k, v in of(q).items()}


def canonical_shape(library, hand):
    """The library's median shape for a hand (the default when no example has the finger set)."""
    from statistics import median
    es = [e["shape"] for e in library["entries"] if e["hand"] == hand and e.get("shape")]
    th = [s["thumb"] for s in es if s.get("thumb")]
    return {"fingers": {f: {k: median(s["fingers"][f][k] for s in es) for k in ("abd", "rel")} for f in "2345"},
            "thumb": {k: median(t[k] for t in th) for k in THUMB_KEYS}}


def place(rest, library, hand, notes, thumb=None, wrist_z=WRIST_Z, hold=None, ref=None):
    """The hand's pose for notes [(finger, pitch)] in three layers, the contact made in the design's order.
    hold: the previous strike's pose (hand_plan.py); the hand stays where it was if its pressed fingers reach
    their keys by k and spread alone (and its yaw is within the example's tolerance), as a pianist's does.
    ref: [(notes, thumb)] whose examples set the root's reference (their mean yaw and wrist) when the notes
    as a whole have no example of their own (a nearest one may come from another register): a hand position
    that covers several strikes stands where all of theirs do, its yaw within YAW_TOL of every one of their
    examples (their yaws too far apart: the found example's reference, as without ref).
    Returns root, curl, per finger k and spread, the explicit angles, the press layer, misses and flags."""
    import hand_library
    np = _np()
    mirror = hand == "left"
    sx = -1.0 if mirror else 1.0
    canon = canonical_shape(library, hand)
    flags, dropped, yaw_tol = [], [], YAW_TOL
    found = hand_library.nearest(library, hand, list(notes), thumb)
    if found is None:
        shape, source, where = canon, "canonical", None
        flags.append("canonical")
    else:
        entry, anchor, source = found
        if not entry.get("shape"):
            flags.append("canonical")
        s = entry.get("shape") or canon
        shape = {"fingers": s["fingers"], "thumb": s.get("thumb") or canon["thumb"]}
        where = hand_library.place(entry, key_target(anchor, 1, False)["x"] / WHITE_W)
    if ref and source != "own":
        wheres = []
        for ns, th in ref:
            got = hand_library.nearest(library, hand, list(ns), th)
            if got is not None:
                wheres.append(hand_library.place(got[0], key_target(got[1], 1, False)["x"] / WHITE_W))
        yaws = [w["yawDeg"] for w in wheres]
        if wheres and max(yaws) - min(yaws) < 2 * YAW_TOL:
            where = {k: float(np.mean([w[k] for w in wheres])) for k in ("wristX", "wristDepthCm")}
            where["yawDeg"] = (max(yaws) + min(yaws)) / 2
            yaw_tol = YAW_TOL - (max(yaws) - min(yaws)) / 2
    yaw0 = sx * where["yawDeg"] if where else 0.0
    keep = list(notes)
    while True:
        # the hand stays if its fingers reach from there, deeper between the blacks if they must; it moves
        # only when they cannot, to white keys short of the blacks first
        tries = ([("hold", False), ("hold", True)] if hold is not None and
                 abs(hold["rootVec"][0] - yaw0) <= yaw_tol + 0.05 else []) + [("solve", False), ("solve", True)]
        for how, deep in tries:
            targets = [key_target(p, f, mirror, deep) for f, p in keep]
            start = ((sx * where["wristX"] * WHITE_W, where["wristDepthCm"] * 10.0) if where else
                     (float(np.mean([t["x"] for t in targets])), -100.0))
            pose = (_fingers(rest, shape, targets, list(hold["rootVec"]), hold["curl"]) if how == "hold" else
                    _solve(rest, shape, targets, yaw0, start, wrist_z, yaw_tol=yaw_tol))
            if max(pose["miss"].values()) <= MISS_MM:
                break
        bad = {f: m for f, m in pose["miss"].items() if m > MISS_MM}
        if not bad:
            break
        # within the joints' walls, would a wider k reach? yes: strained (the pose stays); no: impossible
        wide = _solve(rest, shape, targets, yaw0, start, wrist_z, k_band=(0.0, 10.0), yaw_tol=yaw_tol)
        if all(m <= MISS_MM for m in wide["miss"].values()):
            flags.append("strained")
            break
        if "impossible" not in flags:
            flags.append("impossible")
        if len(keep) == 1:
            break
        worst = max(bad, key=bad.get)
        dropped += [p for f, p in keep if f == worst]
        keep = [(f, p) for f, p in keep if f != worst]
    free = [f for f in (1, 2, 3, 4, 5) if f not in {f for f, _ in keep}]
    lift = lift_free(rest, shape, pose, free)
    ang = angles(shape, pose["curl"], pose["k"], pose["spread"], lift)
    press = {f: press_delta(rest, ang, pose["root"], f) for f, _ in keep}
    yaw, pitch, roll = pose["root"][:3]
    return {"hand": hand, "notes": list(notes), "source": source, "flags": flags, "dropped": dropped,
            "root": {"yawDeg": round(sx * yaw, 2), "pitchDeg": round(pitch, 2), "rollDeg": round(roll, 2),
                     "wristMm": [round(v, 1) for v in pose["root"][3:]]},
            "exampleYawDeg": round(sx * yaw0, 2), "curl": round(pose["curl"], 3),
            "k": {f: round(v, 3) for f, v in pose["k"].items()}, "spread": {f: [round(u, 1) for u in v] if isinstance(v, tuple) else round(v, 1)
                                                    for f, v in pose["spread"].items()},
            "lift": lift, "press": press, "missMm": {f: round(v, 2) for f, v in pose["miss"].items()},
            "angles": ang, "rootVec": pose["root"], "shape": shape, "violations": violations_of(ang, pose["root"])}


def _check(argv):
    import argparse, json, os
    import hand_library, hand_shape
    np = _np()
    ap = argparse.ArgumentParser(prog="hand_mech.py check")
    ap.add_argument("folder")
    ap.add_argument("--rest", required=True)
    ap.add_argument("--song", default="seven-nation-army")
    ap.add_argument("--from", dest="t0", type=float, default=2.7)
    ap.add_argument("--to", dest="t1", type=float, default=18.5)
    ap.add_argument("--wrist-z", type=float, default=WRIST_Z)
    a = ap.parse_args(argv)
    rests = {s: hand_shape.load_rest(a.rest, s) for s in ("R", "L")}
    lib = hand_library.load(a.song)

    # the model is hand_shape's: the same angles give the same joints
    x = hand_shape.start({"yawDeg": 12.0, "wrist": {"x": 1.0, "depthCm": -8.0}}, False, -10.0, 1.0)
    x[hand_shape.IX["2.abd"]], x[hand_shape.IX["5.curl"]] = 7.0, 0.6
    ang = {f: {**{k: b * x[hand_shape.IX[f"{f}.curl"]] for k, b in zip(("mcp", "pip", "dip"), BEND_SPLIT[f])},
               "abd": x[hand_shape.IX[f"{f}.abd"]]} for f in (2, 3, 4, 5)}
    ang[1] = {k: x[hand_shape.IX[f"1.{k}"]] for k in THUMB_KEYS}
    root = [x[hand_shape.IX[n]] for n in ("yaw", "pitch", "roll", "tx", "ty", "tz")]
    same = np.abs(hand_joints(rests["R"], ang, root) - hand_shape.world_points(rests["R"], x)).max()
    print(f"model vs hand_shape: {same:.2e} mm")
    assert same < 1e-6

    feats = json.load(open(os.path.join(a.folder, "features.json"), encoding="utf-8"))["onsets"]
    feats = [o for o in feats if a.t0 <= o["time"] <= a.t1 and all(n["finger"] for n in o["notes"])]
    out, viol, yaw_off = [], 0, []
    for o in feats:
        notes = [(n["finger"], n["pitch"]) for n in o["notes"]]
        r = place(rests["L" if o["hand"] == "left" else "R"], lib, o["hand"], notes, o["thumb"], a.wrist_z)
        out.append(r)
        viol += len(r["violations"])
        yaw_off.append(abs(r["root"]["yawDeg"] - r["exampleYawDeg"]))
        print(f"{o['id']} {o['hand'][0].upper()} {notes} {r['source']:9s} miss {max(r['missMm'].values()):5.2f} "
              f"curl {r['curl']:.2f} k {r['k']} roll {r['root']['rollDeg']:6.1f} pitch {r['root']['pitchDeg']:5.1f} "
              f"yaw {r['root']['yawDeg']:6.1f}/{r['exampleYawDeg']:6.1f} lift {r['lift']} {' '.join(r['flags'])} "
              f"{'dropped ' + str(r['dropped']) if r['dropped'] else ''} {'VIOL ' + str(r['violations']) if r['violations'] else ''}")
    passed = all(max(r["missMm"].values()) <= MISS_MM or {"strained", "impossible"} & set(r["flags"]) for r in out)
    print(f"onsets {len(out)}: in contact {sum(max(r['missMm'].values()) <= MISS_MM for r in out)}, strained "
          f"{sum('strained' in r['flags'] for r in out)}, impossible {sum('impossible' in r['flags'] for r in out)}, "
          f"canonical {sum('canonical' in r['flags'] for r in out)}; walls broken {viol}; yaw off the example max "
          f"{max(yaw_off):.2f} deg; every miss over {MISS_MM} mm flagged: {passed}")

    # a target that needs the hand rolled 30 deg onto the thumb: the roll stops at the wall, and a flag
    ex = next(e for e in lib["entries"] if e["hand"] == "right" and e.get("shape") and e["shape"].get("thumb"))
    shape = {"fingers": ex["shape"]["fingers"], "thumb": ex["shape"]["thumb"]}
    root = [0.0, 10.0, 30.0, 0.0, -90.0, a.wrist_z]
    X = hand_joints(rests["R"], angles(shape, 1.0), root)
    targets = [{"pitch": None, "finger": f, "black": False, "x": X[CHAIN[f][-1]][0], "dx": 0.5,
                "y": (X[CHAIN[f][-1]][1] - 0.5, X[CHAIN[f][-1]][1] + 0.5), "z": X[CHAIN[f][-1]][2]} for f in (1, 3, 5)]
    pose = _solve(rests["R"], shape, targets, 0.0, (0.0, -90.0), a.wrist_z)
    worst = max(pose["miss"].values())
    flag = None
    if worst > MISS_MM:
        wide = _solve(rests["R"], shape, targets, 0.0, (0.0, -90.0), a.wrist_z, k_band=(0.0, 10.0))
        flag = "strained" if max(wide["miss"].values()) <= MISS_MM else "impossible"
    print(f"roll test: wanted 30, got {pose['root'][2]:.2f}; miss max {worst:.2f} mm; flag {flag}")
    assert abs(pose["root"][2] - ROLL[1]) < 0.05 and flag, "roll test failed"
    assert viol == 0 and passed and max(yaw_off) <= YAW_TOL + 0.05
    print("CHECK PASSED")


if __name__ == "__main__":
    import sys
    if sys.argv[1:2] == ["check"]:
        _check(sys.argv[2:])
