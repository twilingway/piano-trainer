"""Rig the Blender Studio male body and its skeleton on one armature built from the skeleton's joints.

Run inside Blender (blender MCP): exec(open(".../pianist_rig.py").read()).
Appends "Body Male - Realistic" and "Skeleton - Realistic" from the Human Base Meshes bundle into
scene "pianist" (fresh copies on every run). Every skeleton piece pivots at its joint, so the pieces'
origins are the joints. The skeleton is scaled into the skin, then each limb segment is turned about
its joint onto the body's centre line. The armature "PianistRig" takes its joints from the fitted
skeleton (bone names after MPFB, as in HandRig); the skeleton pieces ride on their bones rigidly and
the body ("PianistBody", base level of the Multires) gets automatic weights. The body faces -Y.
"""
import bpy, math, os
from mathutils import Euler, Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

ROOT = globals().get("ROOT", r"E:/MySource/ReactJS/piano-trainer")
LIB = globals().get("LIB", os.path.join(ROOT, "blender/assets/human-base-meshes/bundle/human-base-meshes-bundle-v1.4.1/"
                                                "human_base_meshes_bundle.blend"))
exec(open(os.path.join(ROOT, "tools/hand-rig/studio_geo.py"), encoding="utf-8").read())

SCENE = "pianist"
BODY_COLL, SKEL_COLL, RIG_COLL = "Body Male - Realistic", "Skeleton - Realistic", "pianist"
BODY_SRC = "GEO-body_male_realistic"
P = "GEO-skeletion."
SCALP = 0.006           # skin over the skull's top
SOLE = 0.012            # heel pad under the calcaneus
FORWARD = Vector((0, -1, 0))
UP = Vector((0, 0, 1))
SIDES = ("L", "R")

scene = bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)
if bpy.context.window:                  # none when run headless (blender -b --scene pianist)
    bpy.context.window.scene = scene


def drop_collection(name):
    coll = bpy.data.collections.get(name)
    if not coll:
        return
    for o in list(coll.all_objects):
        data = o.data
        bpy.data.objects.remove(o)
        if data is not None and data.users == 0:
            (bpy.data.meshes if isinstance(data, bpy.types.Mesh) else bpy.data.armatures).remove(data)
    for child in list(coll.children_recursive):
        bpy.data.collections.remove(child)
    bpy.data.collections.remove(coll)


for name in (BODY_COLL, SKEL_COLL, RIG_COLL):
    drop_collection(name)
with bpy.data.libraries.load(LIB, link=False) as (src, dst):
    dst.collections = [c for c in src.collections if c in (BODY_COLL, SKEL_COLL)]
for c in dst.collections:
    scene.collection.children.link(c)
rig_coll = bpy.data.collections.new(RIG_COLL)
scene.collection.children.link(rig_coll)
view = bpy.context.view_layer

src_body = bpy.data.objects[BODY_SRC]
src_body.location.x = 0
skel = {o.name[len(P):]: o for o in bpy.data.collections[SKEL_COLL].all_objects}
skel["hip"].location.x = 0
view.update()

joint = lambda n: skel[n].matrix_world.translation.copy()


def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return (Vector([min(p[i] for p in pts) for i in range(3)]),
            Vector([max(p[i] for p in pts) for i in range(3)]))


def transform(o, m):
    o.matrix_world = m @ o.matrix_world
    view.update()


# --- the skeleton into the skin: uniform scale about the floor, the pelvis centred in the body's hips
blo, bhi = bounds([src_body])
slo, shi = bounds(skel.values())
s = (bhi.z - SCALP - (blo.z + SOLE)) / (shi.z - slo.z)
pivot = Vector((0, 0, slo.z))
transform(skel["hip"], Matrix.Translation(Vector((0, 0, blo.z + SOLE))) @ Matrix.Scale(s, 4)
          @ Matrix.Translation(-pivot))

mods = [m for m in src_body.modifiers if m.type == "MULTIRES"]
for m in mods:
    m.show_viewport = False
bm = load_bm(BODY_SRC)
for m in mods:
    m.show_viewport = True


def nearest_loop(p, normal, rmax):
    loops = [(c, g) for c, g in section(bm, p, normal) if max((q - c).length for q in g) < rmax]
    if not loops:
        return None
    c, _ = min(loops, key=lambda r: (r[0] - p).length)
    return c if (c - p).length < 0.06 else None


hip_mid = (joint("leg_femur.L") + joint("leg_femur.R")) / 2
pelvis_c = nearest_loop(hip_mid + Vector((0, 0, 0.06)), UP, 0.3)
transform(skel["hip"], Matrix.Translation(Vector((pelvis_c.x - hip_mid.x, pelvis_c.y - hip_mid.y, 0))))


def aim(o, child, rmax):
    """Turns piece `o` about its joint towards the centre of the body's section at its child's joint.
    Along a segment the section's centre is no guide (the calf pulls it off the shin bone); at the
    elbow, wrist, knee and ankle the joint sits near the middle of the limb."""
    j, c = joint(o.name[len(P):]), joint(child)
    centre = nearest_loop(c, (c - j).normalized(), rmax)
    if centre is None:
        return None
    r = (c - j).rotation_difference(centre - j).to_matrix().to_4x4()
    transform(o, Matrix.Translation(j) @ r @ Matrix.Translation(-j))
    return round((c - j).angle(centre - j) * 57.2958, 1), round((centre - c).length * 1000)


fit = {}
for x in SIDES:
    fit["upper." + x] = aim(skel[f"arm_humerus.{x}"], f"arm_radius.{x}", 0.07)
    fit["fore." + x] = aim(skel[f"arm_radius.{x}"], f"hand_center.{x}", 0.06)
    fit["thigh." + x] = aim(skel[f"leg_femur.{x}"], f"leg_tibula.{x}", 0.1)
    fit["shin." + x] = aim(skel[f"leg_tibula.{x}"], f"foot_talus.{x}", 0.07)
print("fit (deg turned, joint moved mm)", fit)
bm.free()

# --- the body: base level of the Multires, smooth; eyes go with it
me = src_body.data.copy()
me.name = "PianistBody"
body = bpy.data.objects.new("PianistBody", me)
rig_coll.objects.link(body)
body.matrix_world = src_body.matrix_world
for poly in me.polygons:
    poly.use_smooth = True
src_body.hide_set(True)
src_body.hide_render = True

# --- the hand's bones from its own skin. The bundle's skeleton is another man's, its fingers lie
# otherwise than the skin's: bones on its joints stood up to 5 cm out of the fingers. So each finger's
# centre line is traced in the skin, section by section from the tip back to where the finger joins the
# palm, and its joints are set along that line at the skeleton's phalanx lengths, scaled by the hand's
# length; a knuckle beyond the free part lies on the line carried on into the palm. The thumb's
# metacarpal goes on the same way to its base in the thenar. The skeleton's hand is then put onto
# these bones (below), so its phalanges bend where the skin's fingers bend.
import bmesh, heapq
TIP_IN = 0.005          # a distal bone's tail this far inside the fingertip
CARPUS = 0.022          # the wrist bone's length; the metacarpals start further on
MC_BASE = 0.28          # a finger's metacarpal starts this far from the wrist to its knuckle
STEP = 0.003            # between the finger's sections
WIDENS = 1.5            # a section this much wider than the finger's median: the palm or the web
FINGER_OF = {"thumb": 1, "index": 2, "middle": 3, "ring": 4, "little": 5}
# The filmed pianist's fingers, knuckle to tip on the key plane (Seven Nation Army capture: 90th
# percentile over the frames where the finger lies straight, both hands' mean; the palm is as wide as
# this skin's, 61 mm across the knuckles). This skin's are shorter by 8-30 %; its fingers are drawn out
# to these. The thumb stays (within 5 % of the film, which measures it worst).
FILMED_FINGER = globals().get("FILMED_FINGER", {2: 0.105, 3: 0.110, 4: 0.100, 5: 0.075})


def frame(y, z):
    """Columns X, Y, Z with Y along `y` and Z towards `z`."""
    y = y.normalized()
    z = (z - y * z.dot(y)).normalized()
    return Matrix((y.cross(z), y, z)).transposed()


def smoothstep(a, b, x):
    u = min(max((x - a) / (b - a), 0.0), 1.0)
    return u * u * (3 - 2 * u)


def finger_line(bmh, tip, d):
    """Centres of a finger's sections from the tip back to the palm, each plane square to the finger's
    own direction there (`d`, base to tip, refined as the line grows)."""
    line, widths = [], []
    p = tip - d * STEP
    while len(line) < 40:
        loops = section(bmh, p, d)
        if not loops:
            break
        c, g = min(loops, key=lambda r: (r[0] - p).length)
        width = max((q - c).length for q in g)
        if (c - p).length > 0.012 or len(widths) >= 3 and width > WIDENS * sorted(widths)[len(widths) // 2]:
            break
        line.append(c)
        widths.append(width)
        if len(line) >= 3:
            d = (line[max(0, len(line) - 6)] - line[-1]).normalized()
        p = c - d * STEP
    return line


def far_end(piece, start):
    """The point of a piece's mesh farthest from `start`: the tip of a distal phalanx or a toe."""
    o = skel[piece]
    return max((o.matrix_world @ v.co for v in o.data.vertices), key=lambda p: (p - start).length)


def along_line(poly, s):
    """The point `s` along a polyline, carried on straight past its end."""
    for a, b in zip(poly, poly[1:]):
        l = (b - a).length
        if s <= l:
            return a.lerp(b, s / l)
        s -= l
    return poly[-1] + (poly[-1] - poly[-2]).normalized() * s


bmb = bmesh.new()
bmb.from_mesh(me)
bmb.verts.ensure_lookup_table()
HAND_BONES, hand_report = {}, {}
for x in SIDES:
    w, e = joint(f"hand_center.{x}"), joint(f"arm_radius.{x}")
    axis = (w - e).normalized()
    along = lambda p: (p - w).dot(axis)
    # the hand: the skin past the wrist connected to it (the thigh next to it is another surface)
    seed = min((v for v in bmb.verts if 0.04 < along(v.co) < 0.06), key=lambda v: ((v.co - w) - axis * along(v.co)).length)
    hand, todo = {seed}, [seed]
    while todo:
        v = todo.pop()
        for edge in v.link_edges:
            u = edge.other_vert(v)
            if u not in hand and along(u.co) > -0.005:
                hand.add(u)
                todo.append(u)
    # geodesic distance from the wrist over the hand's edges: the fingertips are its five far peaks
    dist = {v: 0.0 for v in hand if along(v.co) < 0.005}
    heap = [(0.0, v.index) for v in dist]
    heapq.heapify(heap)
    while heap:
        dv, i = heapq.heappop(heap)
        v = bmb.verts[i]
        if dv > dist[v]:
            continue
        for edge in v.link_edges:
            u = edge.other_vert(v)
            if u in hand and dv + edge.calc_length() < dist.get(u, 1e9):
                dist[u] = dv + edge.calc_length()
                heapq.heappush(heap, (dist[u], u.index))
    def peak(v):
        near = {u for e1 in v.link_edges for u in (e1.other_vert(v),)}
        near |= {e2.other_vert(u) for u in near for e2 in u.link_edges}
        return all(dist.get(u, 0.0) <= dist[v] for u in near if u in hand)
    tips = []
    for v in sorted((v for v in hand if dist.get(v, 0.0) > 0.08 and peak(v)), key=lambda v: -dist[v]):
        if all((v.co - t.co).length > 0.015 for t in tips):
            tips.append(v)
    assert len(tips) == 5, f"{len(tips)} fingertips on the {x} hand"
    bmh = bmb.copy()
    bmh.verts.ensure_lookup_table()
    keep = {v.index for v in hand}
    bmesh.ops.delete(bmh, geom=[v for v in bmh.verts if v.index not in keep], context="VERTS")
    bmh.edges.index_update()

    # which tip is which: the thumb's is the nearest the wrist, the rest go from the index across
    across = joint(f"metacarpal.index.{x}") - joint(f"metacarpal.little.{x}")
    thumb = min(tips, key=lambda t: along(t.co))
    rest = sorted((t for t in tips if t is not thumb), key=lambda t: -t.co.dot(across))
    tip_of = {1: thumb, 2: rest[0], 3: rest[1], 4: rest[2], 5: rest[3]}

    # the skeleton's phalanges and the hand's scale: wrist to the middle fingertip, skin over skeleton
    names = {f: n for n, f in FINGER_OF.items()}
    def chain(f):
        n = names[f]
        kinds = ("metacarpal", "proximal", "distal") if f == 1 else ("proximal", "middle", "distal")
        pts = [joint(f"{k}.{n}.{x}") for k in kinds]
        return pts + [far_end(f"distal.{n}.{x}", pts[-1])]
    k = (tip_of[3].co - w).length / (chain(3)[-1] - w).length
    joints, lines, inner = {}, {}, []
    for f, t in tip_of.items():
        near = [v.co for v in hand if (v.co - t.co).length < 0.025 and dist[v] > dist[t] - 0.03]
        d = (t.co - sum(near, Vector()) / len(near)).normalized()
        line = lines[f] = finger_line(bmh, t.co, d)
        end = line[0] + (t.co - line[0]).normalized() * max((t.co - line[0]).length - TIP_IN, 0.0)
        poly = [end] + line
        free = sum((b - a).length for a, b in zip(poly, poly[1:]))
        lengths = [(b - a).length * k for a, b in zip(chain(f), chain(f)[1:])]
        joints[f] = [along_line(poly, sum(lengths[i:])) for i in range(3)] + [end]
        inner += [(f, i) for i in range(3) if sum(lengths[i:]) > free]
    hand_bvh = BVHTree.FromBMesh(bmh)
    bmh.free()

    def palm_of(joints):
        knuckles = (joints[2][0] - joints[5][0]).normalized()
        palm = knuckles.cross(joints[3][0] - w).normalized()
        return knuckles, -palm if palm.x * (1 if x == "L" else -1) > 0 else palm   # the A pose's palm faces the thigh

    # A joint past the finger's free part (a knuckle, the thumb's base) lies on the line carried on
    # straight, which runs out towards the back of the hand: it goes to the middle of the hand's
    # thickness there, between the palm's skin and the back's.
    palm = palm_of(joints)[1]
    # The thumb's base, though, is no straight run of the thumb (that came out at the wrist's side): it
    # sits in the thenar where the skeleton has it, taken over in the hand's frame (wrist, middle
    # knuckle, palm) at the skin's size.
    hc, mid = joint(f"hand_center.{x}"), joint(f"proximal.middle.{x}")
    s_palm = (joint(f"metacarpal.index.{x}") - joint(f"metacarpal.little.{x}")).cross(mid - hc)
    s_frame, k_frame = frame(mid - hc, s_palm if s_palm.dot(palm_of(joints)[1]) > 0 else -s_palm), \
        frame(joints[3][0] - w, palm)
    joints[1][0] = w + k_frame @ s_frame.transposed() @ (joint(f"metacarpal.thumb.{x}") - hc) \
        * ((joints[3][0] - w).length / (mid - hc).length)
    for f, i in inner:
        p = joints[f][i]
        a = hand_bvh.ray_cast(p + palm * 0.04, -palm, 0.08)[0]
        b = hand_bvh.ray_cast(p - palm * 0.04, palm, 0.08)[0]
        if a is not None and b is not None:
            joints[f][i] = (a + b) / 2

    # Each finger drawn out past its knuckle: every phalanx by the same factor, the skin over it carried
    # with the point of the phalanx it lies on (the tip's pad moves with the tip). A skin vertex follows
    # each finger by the inverse fourth power of its distance to it, so the webs between fingers of
    # different factors stay smooth; the palm lies behind the knuckles and does not move.
    stretch = {}
    for f in (1, 2, 3, 4, 5):
        J = joints[f]
        fs = FILMED_FINGER[f] / (sum((b - a).length for a, b in zip(J, J[1:])) + TIP_IN) if f in FILMED_FINGER else 1.0
        Q = [J[0]]
        for a, b in zip(J, J[1:]):
            Q.append(Q[-1] + (b - a) * fs)
        stretch[f] = (J, Q, round(fs, 3))
    shift = {}
    for v in hand:
        ws, ds = 0.0, Vector()
        for f, (J, Q, _) in stretch.items():
            best = None
            for i in range(3):
                seg = J[i + 1] - J[i]
                t = min(max((v.co - J[i]).dot(seg) / seg.length_squared, 0.0), 1.0)
                d = (v.co - J[i] - seg * t).length
                if best is None or d < best[0]:
                    best = (d, Q[i].lerp(Q[i + 1], t) - J[i].lerp(J[i + 1], t))
            w4 = 1.0 / (best[0] ** 4 + 1e-12)
            ws, ds = ws + w4, ds + best[1] * w4
        if (ds / ws).length > 1e-5:
            shift[v.index] = ds / ws
    for i, d in shift.items():
        me.vertices[i].co += d
    for f, (J, Q, _) in stretch.items():
        joints[f] = Q

    # rolls: the fingers flex about the knuckle line, their Z towards the palm; the thumb's pad faces
    # the palm and the index finger
    knuckles, palm = palm_of(joints)
    def flex_z(head, tail):
        y = (tail - head).normalized()
        z = (knuckles - y * knuckles.dot(y)).normalized().cross(y)
        return z if z.dot(palm) > 0 else -z
    to_index = joints[2][0] - joints[1][0]
    thumb_palm = (palm * 0.8 + (to_index - palm * to_index.dot(palm)).normalized() * 0.6).normalized()
    bones = {f"wrist.{x}": (w, w + (joints[3][0] - w).normalized() * CARPUS, palm, f"lowerarm02.{x}", True)}
    for f in (2, 3, 4, 5):
        j, mc = joints[f], f"metacarpal{f - 1}.{x}"
        base = w.lerp(j[0], MC_BASE)
        bones[mc] = (base, j[0], flex_z(base, j[0]), f"wrist.{x}", False)
        for i in (1, 2, 3):
            bones[f"finger{f}-{i}.{x}"] = (j[i - 1], j[i], flex_z(j[i - 1], j[i]),
                                           mc if i == 1 else f"finger{f}-{i - 1}.{x}", i > 1)
    for i in (1, 2, 3):
        j = joints[1]
        bones[f"finger1-{i}.{x}"] = (j[i - 1], j[i], thumb_palm, f"wrist.{x}" if i == 1 else f"finger1-{i - 1}.{x}", i > 1)
    HAND_BONES[x] = bones
    hand_report[x] = {"scale": round(k, 3), "drawn out": {f: v[2] for f, v in stretch.items()},
                      "free part mm": {f: round(sum((b - a).length for a, b in zip(l, l[1:])) * 1000) for f, l in lines.items()},
                      "phalanges mm": {f: [round((b - a).length * 1000) for a, b in zip(j, j[1:])] for f, j in joints.items()}}
bmb.free()
print("hands from the skin", hand_report)

# the skeleton's hand onto those bones: every piece turned and scaled so its joint sits on its bone's
# head, its length runs along the bone and its palm side faces the bone's Z (the palm)


def hand_bone(piece):
    kind, name = piece.split(".")[:2]
    f = FINGER_OF[name]
    if kind == "metacarpal":
        return "finger1-1" if f == 1 else f"metacarpal{f - 1}"
    return f"finger{f}-{min({'proximal': 1, 'middle': 2, 'distal': 3}[kind] + (f == 1), 3)}"


def depth(o):
    return 0 if o.parent is None else 1 + depth(o.parent)


for x in SIDES:
    hc = skel[f"hand_center.{x}"]
    pieces = [hc] + sorted((o for o in hc.children_recursive if o.name.startswith(P)), key=depth)
    orig = {o: o.matrix_world.copy() for o in pieces}
    at = lambda n: orig[skel[f"{n}.{x}"]].translation
    palm = (at("metacarpal.index") - at("metacarpal.little")).cross(at("proximal.middle") - at("hand_center")).normalized()
    if palm.x * (1 if x == "L" else -1) > 0:
        palm = -palm                       # the A pose's palm faces the thigh
    to_index = at("metacarpal.index") - at("metacarpal.thumb")
    thumb_palm = (palm * 0.8 + (to_index - palm * to_index.dot(palm)).normalized() * 0.6).normalized()
    hb = HAND_BONES[x]
    for o in pieces:
        name = o.name[len(P):-2]
        start = orig[o].translation
        kids = [c for c in o.children if c.name.startswith(P)]
        if name == "hand_center":
            end, target, z_s = at("metacarpal.middle"), hb[f"wrist.{x}"], palm
            k = (hb[f"finger2-1.{x}"][0] - hb[f"finger5-1.{x}"][0]).length / (at("proximal.index") - at("proximal.little")).length
        else:
            end = orig[kids[0]].translation if kids else max((orig[o] @ v.co for v in o.data.vertices),
                                                             key=lambda p: (p - start).length)
            target = hb[hand_bone(name) + "." + x]
            z_s = thumb_palm if name.endswith("thumb") else palm
            k = (target[1] - target[0]).length / (end - start).length
        head, tail, z_t = target[:3]
        turn = frame(tail - head, z_t) @ frame(end - start, z_s).transposed()
        o.matrix_world = Matrix.Translation(head) @ (turn * k).to_4x4() @ Matrix.Translation(-start) @ orig[o]
        view.update()

# --- the skeleton inside the skin. The bundle's skeleton is another man's: after the uniform scale and
# the limbs' aim its spine stands 2 cm out of the back, the skull through the scalp, the big toe through
# the foot. Piece by piece from the pelvis out (the bundle's pieces hang on each other, so a turned piece
# carries what hangs on it), a piece is turned a little about its joint and shrunk a little towards it
# until it lies SKIN_MARGIN under the skin the viewer sees (one subdivision level). The pelvis, the rib
# cage, the shoulder blades and the long limb bones only shrink: turning them would carry the arms and
# legs off their fit. The hand's pieces sit on the skin's hand bones already: they only shrink.
SKIN_MARGIN = 0.002
MAX_TURN = math.radians(8)
MIN_SCALE = 0.85
FIT_POINTS = 1500       # vertices per piece the fit looks at
NO_TURN = ("hip", "ripcage", "shoulder_scapula", "arm_humerus", "arm_radius", "leg_femur", "leg_tibula",
           "foot_talus", "foot_center", "clavicle")
HAND = ("hand_center", "metacarpal.", "proximal.", "middle.", "distal.")


def in_hand(name):
    return name.startswith(HAND) and not name.split(".")[1].isdigit()


sub = body.modifiers.new("fit", "SUBSURF")
sub.levels = 1
view.update()
ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
skin_me = ev.to_mesh()
skin = BVHTree.FromPolygons([body.matrix_world @ v.co for v in skin_me.vertices],
                            [tuple(p.vertices) for p in skin_me.polygons])
ev.to_mesh_clear()
body.modifiers.remove(sub)


def sample(o):
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    return pts[::max(1, len(pts) // FIT_POINTS)]


def overshoot(pts):
    """Sum of squared depths past SKIN_MARGIN under the skin, and the deepest point outside it."""
    total, worst = 0.0, 0.0
    for p in pts:
        loc, normal, _, d = skin.find_nearest(p)
        out = d if (p - loc).dot(normal) > 0 else -d
        if out > -SKIN_MARGIN:
            total += (out + SKIN_MARGIN) ** 2
        worst = max(worst, out)
    return total, worst


def place_in_skin(o, turn, chain):
    """Pattern search over a turn about the piece's joint (x, y, z) and its own shrink. `chain`: points of
    what hangs on it and should come inside with it (the spine above a vertebra). A piece on the midline
    only nods (about x): turned or tilted aside it would make the body lopsided."""
    j = o.matrix_world.translation.copy()
    own, rest = sample(o), chain
    def moved(q):
        r = Euler(q[:3]).to_matrix()
        return [j + r @ ((p - j) * q[3]) for p in own], [j + r @ (p - j) for p in rest]
    def cost(q):
        a, b = moved(q)
        return overshoot(a)[0] + overshoot(b)[0] + 0.03 * (q[0] ** 2 + q[1] ** 2 + q[2] ** 2) + 0.004 * (1 - q[3]) ** 2
    q, best = [0.0, 0.0, 0.0, 1.0], cost([0.0, 0.0, 0.0, 1.0])
    if overshoot(own)[1] <= -SKIN_MARGIN and not chain:
        return q
    midline = not o.name.endswith((".L", ".R"))
    steps = [math.radians(2) * turn, math.radians(2) * turn * (not midline), math.radians(2) * turn * (not midline), 0.03]
    while max(steps) > 1e-3:
        better = False
        for k in range(4):
            for sign in (1, -1):
                c = q[:]
                c[k] += sign * steps[k]
                if k < 3 and abs(c[k]) > MAX_TURN or k == 3 and not MIN_SCALE <= c[k] <= 1:
                    continue
                v = cost(c)
                if v < best:
                    q, best, better = c, v, True
        if not better:
            steps = [s / 2 for s in steps]
    return q


skin_fit = {}
order = [skel["hip"]]
for o in order:
    order.extend(c for c in o.children if c.name.startswith(P))
for o in order:
    name = o.name[len(P):]
    turn = not in_hand(name) and not name.startswith(NO_TURN) and \
        (name.startswith(("spine_", "sacral", "skull")) or not o.children)
    chain = [p for c in o.children_recursive if c.name[len(P):].startswith("spine_") for p in sample(c)] \
        if name.startswith(("spine_", "sacral")) else []
    before = overshoot(sample(o))[1]
    q = place_in_skin(o, turn, chain)
    if q != [0.0, 0.0, 0.0, 1.0]:
        if q[3] != 1.0:
            o.data = o.data.copy()
            o.data.transform(Matrix.Scale(q[3], 4))
        j = o.matrix_world.translation.copy()
        transform(o, Matrix.Translation(j) @ Euler(q[:3]).to_matrix().to_4x4() @ Matrix.Translation(-j))
    after = overshoot(sample(o))[1]
    if before > 0.001 or after > 0.001:
        skin_fit[name] = (round(before * 1000), round(after * 1000), round(math.degrees(max(map(abs, q[:3]))), 1),
                          round(q[3], 2))
print("skeleton into the skin (mm out before, after, deg turned, scale)", skin_fit)

# --- the armature from the fitted joints
arm_data = bpy.data.armatures.new("PianistRig")
rig = bpy.data.objects.new("PianistRig", arm_data)
rig_coll.objects.link(rig)
rig.show_in_front = True
arm_data.display_type = "STICK"
for o in view.objects:
    o.select_set(False)
view.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones


def bone(name, head, tail, parent=None, roll_to=FORWARD, connect=False):
    b = eb.new(name)
    b.head, b.tail = head, tail
    b.align_roll(roll_to)
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    return b


def near_end(piece, to):
    o = skel[piece]
    return min((o.matrix_world @ v.co for v in o.data.vertices), key=lambda p: (p - to).length)


v = {n: joint(n) for n in ("spine_lumbar_l5", "spine_lumbar_l1", "spine_thoracic_7", "spine_cervical_c7",
                           "spine_cervical_c1")}
bone("pelvis", hip_mid, v["spine_lumbar_l5"])
bone("spine01", v["spine_lumbar_l5"], v["spine_lumbar_l1"], "pelvis", connect=True)
bone("spine02", v["spine_lumbar_l1"], v["spine_thoracic_7"], "spine01", connect=True)
bone("spine03", v["spine_thoracic_7"], v["spine_cervical_c7"], "spine02", connect=True)
bone("neck01", v["spine_cervical_c7"], v["spine_cervical_c1"], "spine03", connect=True)
bone("head", v["spine_cervical_c1"], v["spine_cervical_c1"] + UP * 0.18 * s, "neck01", connect=True)

FINGERS = {2: "index", 3: "middle", 4: "ring", 5: "little"}
for x in SIDES:
    shoulder, elbow, wrist = joint(f"arm_humerus.{x}"), joint(f"arm_radius.{x}"), joint(f"hand_center.{x}")
    bone(f"clavicle.{x}", near_end(f"clavicle.{x}", Vector((0, shoulder.y, shoulder.z))), shoulder, "spine03")
    bone(f"upperarm01.{x}", shoulder, elbow, f"clavicle.{x}")
    mid = elbow.lerp(wrist, 0.5)
    bone(f"lowerarm01.{x}", elbow, mid, f"upperarm01.{x}", connect=True)
    bone(f"lowerarm02.{x}", mid, wrist, f"lowerarm01.{x}", connect=True)
    for name, (head, tail, z, parent, connect) in HAND_BONES[x].items():     # the hand's bones from its skin
        bone(name, head, tail, parent, roll_to=z, connect=connect)

    hip, knee, ankle = joint(f"leg_femur.{x}"), joint(f"leg_tibula.{x}"), joint(f"foot_talus.{x}")
    bone(f"upperleg01.{x}", hip, knee, "pelvis")
    bone(f"lowerleg01.{x}", knee, ankle, f"upperleg01.{x}", connect=True)
    balls = sum((joint(f"proximal.{t}.{x}") for t in range(1, 6)), Vector()) / 5
    bone(f"foot.{x}", ankle, balls, f"lowerleg01.{x}", roll_to=UP, connect=True)
    bone(f"toe.{x}", balls, far_end(f"distal.2.{x}", balls), f"foot.{x}", roll_to=UP, connect=True)
bpy.ops.object.mode_set(mode="OBJECT")


# --- skeleton pieces ride on their bones
def bone_for(piece):
    n, _, x = piece.rpartition(".") if piece.endswith((".L", ".R")) else (piece, "", "")
    if n == "skull":
        return "head"
    if n.startswith("spine_cervical"):
        return "neck01"
    if n.startswith("spine_thoracic"):
        k = int("".join(ch for ch in n.split("_")[-1] if ch.isdigit()))
        return "spine03" if k < 7 else "spine02"
    if n == "ripcage":
        return "spine03"
    if n.startswith("spine_lumbar"):
        return "spine01"
    if n in ("hip", "sacral", "coccygeal"):
        return "pelvis"
    side = "." + x
    table = {"clavicle": "clavicle", "shoulder_scapula": "clavicle", "arm_humerus": "upperarm01",
             "arm_radius": "lowerarm01", "arm_ulna": "lowerarm01", "hand_center": "wrist",
             "leg_femur": "upperleg01", "leg_tibula": "lowerleg01", "leg_fibula": "lowerleg01",
             "leg_patella": "lowerleg01", "foot_talus": "foot", "foot_calcaneus": "foot",
             "foot_center": "foot"}
    if n in table:
        return table[n] + side
    kind, _, digit = n.partition(".")
    if digit in FINGERS.values() or digit == "thumb":
        f = 1 if digit == "thumb" else next(k for k, v in FINGERS.items() if v == digit)
        if kind == "metacarpal":
            return f"finger1-1{side}" if f == 1 else f"metacarpal{f - 1}{side}"
        j = {"proximal": 1, "middle": 2, "distal": 3}[kind] + (1 if f == 1 else 0)
        return f"finger{f}-{min(j, 3)}{side}"
    if kind in ("metatarsal",):
        return "foot" + side
    if kind in ("proximal", "middle", "distal"):
        return "toe" + side
    return None


unmapped = []
for name, o in skel.items():
    b = bone_for(name)
    if not b or b not in rig.data.bones:
        unmapped.append(name)
        continue
    world = o.matrix_world.copy()
    o.parent = rig
    o.parent_type = "BONE"
    o.parent_bone = b
    o.matrix_world = world
for eye in [o for o in bpy.data.collections[BODY_COLL].all_objects if ".eye." in o.name]:
    world = eye.matrix_world.copy()
    eye.parent, eye.parent_type, eye.parent_bone = rig, "BONE", "head"
    eye.matrix_world = world
    eye.users_collection[0].objects.unlink(eye)
    rig_coll.objects.link(eye)
skel_coll = bpy.data.collections[SKEL_COLL]
scene.collection.children.unlink(skel_coll)
rig_coll.children.link(skel_coll)
view.update()

# --- automatic weights for the body
for o in view.objects:
    o.select_set(False)
body.select_set(True)
rig.select_set(True)
view.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")

groups = {g.name: g for g in body.vertex_groups}

# The forearm turns the palm down by twisting its two bones (pianist_pose.py: 40 % on the upper, the
# rest on the lower). The automatic weights pass from one to the other within a few centimetres in
# the middle, so the skin twisted there in one step, like a screw. Spread along the whole forearm,
# the pronation winds the skin gradually from the elbow to the wrist.
TWIST_RAMP = (0.15, 0.85)       # of the forearm from the elbow: all on the upper bone -> all on the lower
for x in SIDES:
    g1, g2 = groups[f"lowerarm01.{x}"], groups[f"lowerarm02.{x}"]
    e, wr = arm_data.bones[f"lowerarm01.{x}"].head_local, arm_data.bones[f"lowerarm02.{x}"].tail_local
    for vert in me.vertices:
        ws = {g.group: g.weight for g in vert.groups}
        total = ws.get(g1.index, 0.0) + ws.get(g2.index, 0.0)
        if total <= 0:
            continue
        s = smoothstep(*TWIST_RAMP, (vert.co - e).dot(wr - e) / (wr - e).length_squared)
        g1.add([vert.index], total * (1 - s), "REPLACE")
        g2.add([vert.index], total * s, "REPLACE")

# --- joint helpers: a bone at each elbow, knee and hip that turns half the bend (pianist_pose.py and the
# game set it). The skin ring around the joint follows it, so under linear skinning the bend keeps
# its volume instead of collapsing like a let-down balloon. Only on the flexor side, though: on the
# extensor side a bony point shows through the skin (the olecranon behind the elbow, the patella in
# front of the knee), and the skin over it rides the lower bone rigidly so the bent joint is pointed.
# The helper's X axis is the joint's hinge: bending turns the lower bone about -X, towards the flexors.
# The bundle names the forearm bones the other way round (its "arm_radius" carries the olecranon), so
# the point is found as the extensor-most vertex of the pieces listed, whatever their names.
# The hip has no such point (the buttock sits on the bench), so its skin is all ring: the groin's
# fold and the buttock both follow the helper. The pelvis bone runs up the spine and the thigh hangs
# off it unconnected, so the hip's joint is the thigh's head and its rest bend is nil: the "upper"
# side is the thigh's rest direction carried on into the trunk.
HELPERS = {"elbow": ("upperarm01", "lowerarm01", 0.05, -FORWARD, ("arm_radius", "arm_ulna")),
           "knee": ("upperleg01", "lowerleg01", 0.06, FORWARD, ("leg_patella", "leg_tibula")),
           "hip": ("pelvis", "upperleg01", 0.08, -FORWARD, ())}
HELPER_RADIAL = 0.09    # only skin this close to the limb's axis: not the trunk next to the elbow
POINT_BLEND = 0.03      # above the bony point the extensor skin passes from the upper bone to the lower
EXT_CONE = (60, 100)    # degrees round the limb from the bony point: extensor treatment -> flexor
RING = {"elbow": False, "knee": True, "hip": True}  # the helper carries a skin ring; at the elbow that
                                                    # ring rose as a lump where the forearm's muscles press into the biceps
MIDLINE = 0.03          # a hip's skin fades out this close to the body's midplane: the other leg is not its own


def smooth(a, b, x):
    u = min(max((x - a) / (b - a), 0.0), 1.0)
    return u * u * (3 - 2 * u)


def sided(name, x):
    return f"{name}.{x}" if f"{name}.{x}" in arm_data.bones else name


mid_x = arm_data.bones["pelvis"].head_local.x


def own_side(p, j):
    """1 on the joint's side of the midplane, fading to 0 at it."""
    return smooth(0, MIDLINE, (p.x - mid_x) * math.copysign(1, j.x - mid_x))


hinges = {}
for x in SIDES:
    for h, (up, low, reach, ext_hint, pieces) in HELPERS.items():
        bu, bl = arm_data.bones[sided(up, x)], arm_data.bones[sided(low, x)]
        j = bl.head_local.copy()
        up_dir = (bu.tail_local - bu.head_local if bl.use_connect else bl.tail_local - bl.head_local).normalized()
        radial = lambda p: (p - j) - up_dir * (p - j).dot(up_dir)
        hint = (ext_hint - up_dir * ext_hint.dot(up_dir)).normalized()
        if not pieces:
            hinges[h, x] = (j, up_dir, hint, 0.0, j)
            continue
        near = [skel[f"{n}.{x}"].matrix_world @ vert.co for n in pieces for vert in skel[f"{n}.{x}"].data.vertices]
        near = [p for p in near if abs((p - j).dot(up_dir)) < reach]
        tip = max(near, key=lambda p: radial(p).dot(hint))
        ext = radial(tip).normalized()
        depth = radial(tip).dot(ext)
        top = min((p - j).dot(up_dir) for p in near if radial(p).dot(ext) > depth - 0.012)
        hinges[h, x] = (j, up_dir, ext, top, tip)

view.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
for x in SIDES:
    for h, (up, *_) in HELPERS.items():
        j, up_dir, ext = hinges[h, x][:3]
        b = eb.new(f"{h}.{x}")
        b.head = j
        b.tail = j + up_dir * 0.05
        b.align_roll(ext)                      # Z to the bony point, so X = Y x Z is the hinge
        b.parent = eb[sided(up, x)]
bpy.ops.object.mode_set(mode="OBJECT")
groups_by_name = {g.name: g for g in body.vertex_groups}
extensor = {}                                   # (joint, side) -> {vertex: extensor share}, for the shapes
for x in SIDES:
    for h, (up, low, reach, _, pieces) in HELPERS.items():
        bu, bl = arm_data.bones[sided(up, x)], arm_data.bones[sided(low, x)]
        joint_p, up_dir, ext, top, _ = hinges[h, x]
        low_dir = (bl.tail_local - bl.head_local).normalized()
        gu, gl = groups_by_name[sided(up, x)], groups_by_name[sided(low, x)]
        helper = body.vertex_groups.new(name=f"{h}.{x}")
        ext_side = extensor[h, x] = {}
        for vert in me.vertices:
            p = body.matrix_world @ vert.co - joint_p
            t_up = p.dot(up_dir)
            axis = up_dir if t_up < 0 else low_dir
            t = p.dot(axis)
            r = p - axis * t
            if abs(t) >= reach or r.length > HELPER_RADIAL:
                continue
            ws = {e.group: e.weight for e in vert.groups}
            share = ws.get(gu.index, 0.0) + ws.get(gl.index, 0.0)
            if share < 0.01:
                continue
            k = 0.5 * (1 + math.cos(math.pi * abs(t) / reach)) * own_side(p + joint_p, joint_p) if RING[h] else 0.0
            e = 1 - smooth(*EXT_CONE, math.degrees(r.angle(ext, math.pi))) if pieces else 0.0
            ext_side[vert.index] = e
            m = e * (1 - smooth(0.7 * reach, reach, abs(t)))
            below = smooth(top - POINT_BLEND, top, t_up)    # 1 from the top of the bony point down
            wu = (1 - m) * ws.get(gu.index, 0.0) * (1 - k) + m * share * (1 - below)
            wl = (1 - m) * ws.get(gl.index, 0.0) * (1 - k) + m * share * below
            for g, w in ((gu, wu), (gl, wl)):
                if w > 0 or g.index in ws:
                    g.add([vert.index], w, "REPLACE")
            helper.add([vert.index], (1 - m) * share * k, "REPLACE")

# --- corrective shapes per bend: linear skinning pinches the flexor side into a notch and loses its
# volume. The target is the skinned skin relaxed on the flexor side by Blender's Corrective Smooth (it
# keeps the rest pose's edge lengths, so the skin stretches as one sheet instead of tucking a flap into
# the crease) and blown up along its normals until the joint holds its rest volume. The extensor side
# keeps the skinned result, its skin drawn onto the bony point. That is for a joint with the helper's
# ring (the knee); without it (the elbow) the skinned crease is kept as it is and only the flattened
# sides are rounded (round_sides).
# Each target is taken back through the vertex's own skinning, sum(w_i M_i)^-1, into a shape key
# "elbow.L-090" (bend in degrees between the two bones); pianist_pose.py and the game blend the keys
# by the bend angle, starting from the rest pose's bend.
BEND_KEYS = (45, 90, 135)
KEY_REACH = {"elbow": 0.12, "knee": 0.15, "hip": 0.15}     # along the limb from the joint
KEY_RADIAL = {"elbow": 0.09, "knee": 0.12, "hip": 0.15}
POINT_SKIN = {"elbow": 0.004, "knee": 0.009}    # skin over the bent joint's bony point (the hip has none)
POINT_R = {"elbow": 0.035, "knee": 0.06}        # how far round the point the skin is drawn onto it
RELAX = (0.5, 20)                               # Corrective Smooth: factor, iterations
VOLUME_REACH = {"elbow": (0.04, 0.10), "knee": (0.05, 0.12), "hip": (0.05, 0.12)}  # lost volume spread evenly to the 1st, fading out by the 2nd
ROUND_SMOOTH = 4                                # passes over the rounding push, so it has no ridges


def round_sides(co, region, j, up_dir, ext, turn, up_group):
    """For a joint without the helper's ring: the skin on its sides (a quarter turn round the limb from
    the bony point) carried round the joint on an arc, turned by its own share of the lower bone's turn. Skinning
    blends the upper bone's place and the lower bone's into a straight chord, which flattens the side
    of the bend; the crease and the bony point keep the skinned shape. The upper bone stays at rest."""
    push = {}
    for i, (_, fade, _, _) in region.items():
        p0 = rest_co[i] - j
        weights = skin_weights[i]
        s = 1 - sum(w for g, w in weights if g == up_group) / sum(w for _, w in weights)
        arc = j + Quaternion().slerp(turn, s) @ p0
        around = (p0 - up_dir * p0.dot(up_dir)).angle(ext, 0.0)
        push[i] = (arc - co[i]) * (math.sin(around) ** 2 * fade)
    links = {i: [k for k in vert_links[i] if k in push] for i in push}
    for _ in range(ROUND_SMOOTH):
        push = {i: (d + sum((push[k] for k in links[i]), Vector()) / len(links[i])) / 2 if links[i] else d
                for i, d in push.items()}
    for i, d in push.items():
        co[i] = co[i] + d
    return max((d.length for d in push.values()), default=0.0)


def skinning(pose_mats, i):
    m, total = Matrix(((0,) * 4,) * 4), 0.0
    for g, w in skin_weights[i]:
        mat = pose_mats.get(g)
        if mat is not None:
            m += mat * w
            total += w
    return m * (1 / total) if total > 0 else Matrix.Identity(4)


def face_normal(co, poly):
    """Newell's normal of a polygon, its length twice the area."""
    n = Vector()
    for a, b in zip(poly, poly[1:] + poly[:1]):
        pa, pb = co[a], co[b]
        n += Vector(((pa.y - pb.y) * (pa.z + pb.z), (pa.z - pb.z) * (pa.x + pb.x), (pa.x - pb.x) * (pa.y + pb.y)))
    return n


def volume(co, faces, origin):
    """Signed volume of the cone from `origin` over the faces."""
    v = 0.0
    for poly in faces:
        a = co[poly[0]] - origin
        for b, c in zip(poly[1:-1], poly[2:]):
            v += a.dot((co[b] - origin).cross(co[c] - origin)) / 6
    return v


# weights, rest positions and faces read once: mesh vertex references do not survive adding shape keys
skin_weights = [[(e.group, e.weight) for e in vert.groups if e.weight > 0] for vert in me.vertices]
rest_co = [rig.matrix_world.inverted() @ body.matrix_world @ vert.co for vert in me.vertices]
polys = [tuple(poly.vertices) for poly in me.polygons]
vert_faces = [[] for _ in me.vertices]
for f, poly in enumerate(polys):
    for vi in poly:
        vert_faces[vi].append(f)
vert_links = [set() for _ in me.vertices]
for poly in polys:
    for a, b in zip(poly, poly[1:] + poly[:1]):
        vert_links[a].add(b)
        vert_links[b].add(a)
WINDING = 1 if face_normal(rest_co, polys[0]).dot(me.polygons[0].normal) > 0 else -1
me.shape_keys or body.shape_key_add(name="Basis", from_mix=False)
groups_by_name = {g.name: g for g in body.vertex_groups}
to_body = body.matrix_world.inverted() @ rig.matrix_world
key_error, volume_report, round_report = {}, {}, {}
for x in SIDES:
    for h, (up, low, _, _, pieces) in HELPERS.items():
        j, up_dir, ext, _, tip = hinges[h, x]
        hinge = arm_data.bones[f"{h}.{x}"].matrix_local.to_3x3().col[0].normalized()
        bl = arm_data.bones[sided(low, x)]
        low_rest = (bl.tail_local - bl.head_local).normalized()
        n0 = (up_dir + low_rest).normalized()
        ext_side = extensor[h, x]
        region = {}                                     # vertex: (lower limb, fade, flexor share, nearness)
        for i, p in enumerate(rest_co):
            lower = (p - j).dot(n0) >= 0
            axis = low_rest if lower else up_dir
            t = (p - j).dot(axis)
            if abs(t) < KEY_REACH[h] and ((p - j) - axis * t).length < KEY_RADIAL[h]:
                e = ext_side.get(i, 1 - smooth(*EXT_CONE, math.degrees(
                    ((p - j) - up_dir * (p - j).dot(up_dir)).angle(ext, math.pi)))) if pieces else 0.0
                fade = (1 - smooth(0.7 * KEY_REACH[h], KEY_REACH[h], abs(t))) * own_side(p, j)
                if fade <= 0:
                    continue
                region[i] = (lower, fade, (1 - e) * fade, 1 - smooth(*VOLUME_REACH[h], abs(t)))
        faces = [poly for poly in polys if all(vi in region for vi in poly)]
        rest_volume = volume(rest_co, faces, j)
        if RING[h]:
            relax_group = body.vertex_groups.new(name="relax")
            for i, (_, _, flex, _) in region.items():
                if flex > 0:
                    relax_group.add([i], flex, "REPLACE")
            relax = body.modifiers.new("relax", "CORRECTIVE_SMOOTH")
            relax.factor, relax.iterations = RELAX
            relax.smooth_type, relax.rest_source = "LENGTH_WEIGHTED", "ORCO"
            relax.vertex_group = relax_group.name
        for deg in BEND_KEYS:
            for pb in rig.pose.bones:
                pb.matrix_basis = Matrix.Identity(4)
            view.update()
            low_dir = Matrix.Rotation(math.radians(deg), 3, -hinge) @ up_dir
            pl = rig.pose.bones[sided(low, x)]
            turn_low = Matrix.Translation(j) @ low_rest.rotation_difference(low_dir).to_matrix().to_4x4() \
                @ Matrix.Translation(-j)
            pl.matrix = turn_low @ pl.matrix
            ph = rig.pose.bones[f"{h}.{x}"]
            ph.matrix = Matrix.Translation(j) @ Matrix.Rotation(math.radians(deg) / 2, 4, -hinge) \
                @ Matrix.Translation(-j) @ ph.matrix
            view.update()
            pose_mats = {groups_by_name[b.name].index: b.matrix @ b.bone.matrix_local.inverted()
                         for b in rig.pose.bones if b.name in groups_by_name}
            ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
            ev_me = ev.to_mesh()
            co = [rig.matrix_world.inverted() @ body.matrix_world @ vert.co for vert in ev_me.vertices]
            ev.to_mesh_clear()
            lost = rest_volume - volume(co, faces, j)
            if not RING[h]:
                turned = round_sides(co, region, j, up_dir, ext, low_rest.rotation_difference(low_dir),
                                     groups_by_name[sided(up, x)].index)
                round_report[f"{h}.{x}-{deg:03d}"] = round(1000 * turned, 1)
            # the lost volume back, along the normals, where the skin is relaxed and near the joint
            push = {i: flex * near * RING[h] for i, (_, _, flex, near) in region.items()}
            for _ in range(3):
                gap = rest_volume - volume(co, faces, j)
                normals, areas = {}, {}
                for i in region:
                    n = sum((face_normal(co, polys[f]) for f in vert_faces[i]), Vector()) * WINDING
                    areas[i] = n.length / 2 / len(vert_faces[i])
                    normals[i] = n.normalized()
                grow = sum(push[i] * areas[i] for i in region)
                if gap <= 0 or grow <= 0:
                    break
                step = gap / grow
                for i in region:
                    co[i] = co[i] + normals[i] * (step * push[i])
            point, out = turn_low @ tip, turn_low.to_3x3() @ ext
            key = body.shape_key_add(name=f"{h}.{x}-{deg:03d}", from_mix=False)
            targets = {}
            for i, (_, fade, flex, _) in region.items():
                target = co[i]
                over = (target - point).dot(out)            # skin over the bony point, drawn down onto it
                spread = ((target - point) - out * over).length
                if RING[h] and h in POINT_SKIN and over > POINT_SKIN[h]:
                    target = target - out * ((over - POINT_SKIN[h]) * (fade - flex)
                                             * (1 - smooth(0, POINT_R[h], spread)) * min(deg / 90, 1))
                targets[i] = target
                key.data[i].co = to_body @ (skinning(pose_mats, i).inverted() @ target)
            volume_report[key.name] = (round(lost * 1e6), round((rest_volume - volume(co, faces, j)) * 1e6))
            key.value = 1
            mods = [m for m in body.modifiers if m.type != "ARMATURE"]
            for m in mods:
                m.show_viewport = False
            view.update()
            ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
            ev_me = ev.to_mesh()
            key_error[key.name] = round(1000 * max(
                ((rig.matrix_world.inverted() @ body.matrix_world @ ev_me.vertices[i].co) - t).length
                for i, t in targets.items()), 2)
            ev.to_mesh_clear()
            for m in mods:
                m.show_viewport = True
            key.value = 0
        if RING[h]:
            body.modifiers.remove(relax)
            body.vertex_groups.remove(relax_group)
for pb in rig.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
view.update()
print("shape key error mm (bake pose, key on)", key_error)
print("joint volume lost by skinning -> left, cm3", volume_report)
print("sides rounded out, max mm", round_report)

groups = {g.index: g.name for g in body.vertex_groups}
used = {groups[x.group] for vert in me.vertices for x in vert.groups if x.weight > 0.01}
unweighted = sum(1 for vert in me.vertices if not any(x.weight > 0.01 for x in vert.groups))
sub = body.modifiers.new("smooth", "SUBSURF")
sub.levels = sub.render_levels = 1
print("scale", round(s, 3), "bones", len(arm_data.bones), "body verts", len(me.vertices),
      "unweighted verts", unweighted, "bones without skin", sorted(set(arm_data.bones.keys()) - used),
      "unmapped pieces", unmapped)
