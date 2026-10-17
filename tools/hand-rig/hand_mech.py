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
