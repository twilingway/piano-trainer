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
from mathutils import Matrix, Quaternion, Vector

ROOT = globals().get("ROOT", r"E:/MySource/ReactJS/piano-trainer")
LIB = os.path.join(ROOT, "blender/assets/human-base-meshes/bundle/human-base-meshes-bundle-v1.4.1/"
                         "human_base_meshes_bundle.blend")
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


def far_end(piece, start):
    """The point of a piece's mesh farthest from `start`: the tip of a distal phalanx or a toe."""
    o = skel[piece]
    return max((o.matrix_world @ v.co for v in o.data.vertices), key=lambda p: (p - start).length)


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
    # The palm: from the index to the little finger's base, and from the wrist down the middle finger.
    across = joint(f"metacarpal.index.{x}") - joint(f"metacarpal.little.{x}")
    along = joint(f"proximal.middle.{x}") - wrist
    palm = across.cross(along).normalized()
    if palm.x * (1 if x == "L" else -1) > 0:
        palm = -palm                       # the A pose's palm faces the thigh
    bone(f"wrist.{x}", wrist, joint(f"metacarpal.middle.{x}"), f"lowerarm02.{x}", roll_to=palm, connect=True)
    for f, n in FINGERS.items():
        mc = f"metacarpal{f - 1}.{x}"
        bone(mc, joint(f"metacarpal.{n}.{x}"), joint(f"proximal.{n}.{x}"), f"wrist.{x}", roll_to=palm)
        chain = [joint(f"proximal.{n}.{x}"), joint(f"middle.{n}.{x}"), joint(f"distal.{n}.{x}")]
        chain.append(far_end(f"distal.{n}.{x}", chain[-1]))
        for j in (1, 2, 3):
            bone(f"finger{f}-{j}.{x}", chain[j - 1], chain[j], mc if j == 1 else f"finger{f}-{j - 1}.{x}",
                 roll_to=palm, connect=j > 1)
    thumb = [joint(f"metacarpal.thumb.{x}"), joint(f"proximal.thumb.{x}"), joint(f"distal.thumb.{x}")]
    thumb.append(far_end(f"distal.thumb.{x}", thumb[-1]))
    for j in (1, 2, 3):
        bone(f"finger1-{j}.{x}", thumb[j - 1], thumb[j], f"wrist.{x}" if j == 1 else f"finger1-{j - 1}.{x}",
             roll_to=palm, connect=j > 1)

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

# --- joint helpers: a bone at each elbow and knee that turns half the bend (pianist_pose.py and the
# game set it). The skin ring around the joint follows it, so under linear skinning the bend keeps
# its volume instead of collapsing like a let-down balloon. Only on the flexor side, though: on the
# extensor side a bony point shows through the skin (the olecranon behind the elbow, the patella in
# front of the knee), and the skin over it rides the lower bone rigidly so the bent joint is pointed.
# The helper's X axis is the joint's hinge: bending turns the lower bone about -X, towards the flexors.
# The bundle names the forearm bones the other way round (its "arm_radius" carries the olecranon), so
# the point is found as the extensor-most vertex of the pieces listed, whatever their names.
HELPERS = {"elbow": ("upperarm01", "lowerarm01", 0.05, -FORWARD, ("arm_radius", "arm_ulna")),
           "knee": ("upperleg01", "lowerleg01", 0.06, FORWARD, ("leg_patella", "leg_tibula"))}
HELPER_RADIAL = 0.09    # only skin this close to the limb's axis: not the trunk next to the elbow
POINT_BLEND = 0.03      # above the bony point the extensor skin passes from the upper bone to the lower
EXT_CONE = (60, 100)    # degrees round the limb from the bony point: extensor treatment -> flexor
RING = {"elbow": False, "knee": True}  # the helper carries a skin ring; at the elbow that ring rose as a
                                       # lump where the forearm's muscles press into the biceps


def smooth(a, b, x):
    u = min(max((x - a) / (b - a), 0.0), 1.0)
    return u * u * (3 - 2 * u)


hinges = {}
for x in SIDES:
    for h, (up, low, reach, ext_hint, pieces) in HELPERS.items():
        bu = arm_data.bones[f"{up}.{x}"]
        j, up_dir = bu.tail_local.copy(), (bu.tail_local - bu.head_local).normalized()
        radial = lambda p: (p - j) - up_dir * (p - j).dot(up_dir)
        near = [skel[f"{n}.{x}"].matrix_world @ vert.co for n in pieces for vert in skel[f"{n}.{x}"].data.vertices]
        near = [p for p in near if abs((p - j).dot(up_dir)) < reach]
        hint = (ext_hint - up_dir * ext_hint.dot(up_dir)).normalized()
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
        u = eb[f"{up}.{x}"]
        b = eb.new(f"{h}.{x}")
        b.head = u.tail.copy()
        b.tail = u.tail + (u.tail - u.head).normalized() * 0.05
        b.align_roll(hinges[h, x][2])          # Z to the bony point, so X = Y x Z is the hinge
        b.parent = u
bpy.ops.object.mode_set(mode="OBJECT")
groups_by_name = {g.name: g for g in body.vertex_groups}
extensor = {}                                   # (joint, side) -> {vertex: extensor share}, for the shapes
for x in SIDES:
    for h, (up, low, reach, _, _) in HELPERS.items():
        bu, bl = arm_data.bones[f"{up}.{x}"], arm_data.bones[f"{low}.{x}"]
        joint_p, up_dir, ext, top, _ = hinges[h, x]
        low_dir = (bl.tail_local - bl.head_local).normalized()
        gu, gl = groups_by_name[f"{up}.{x}"], groups_by_name[f"{low}.{x}"]
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
            k = 0.5 * (1 + math.cos(math.pi * abs(t) / reach)) if RING[h] else 0.0
            e = 1 - smooth(*EXT_CONE, math.degrees(r.angle(ext, math.pi)))
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
KEY_REACH = {"elbow": 0.12, "knee": 0.15}       # along the limb from the joint
KEY_RADIAL = {"elbow": 0.09, "knee": 0.12}
POINT_SKIN = {"elbow": 0.004, "knee": 0.009}    # skin over the bent joint's bony point
POINT_R = {"elbow": 0.035, "knee": 0.06}        # how far round the point the skin is drawn onto it
RELAX = (0.5, 20)                               # Corrective Smooth: factor, iterations
VOLUME_REACH = {"elbow": (0.04, 0.10), "knee": (0.05, 0.12)}  # lost volume spread evenly to the 1st, fading out by the 2nd
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
    for h, (up, low, *_) in HELPERS.items():
        j, up_dir, ext, _, tip = hinges[h, x]
        hinge = arm_data.bones[f"{h}.{x}"].matrix_local.to_3x3().col[0].normalized()
        bl = arm_data.bones[f"{low}.{x}"]
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
                    ((p - j) - up_dir * (p - j).dot(up_dir)).angle(ext, math.pi))))
                fade = 1 - smooth(0.7 * KEY_REACH[h], KEY_REACH[h], abs(t))
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
            pl = rig.pose.bones[f"{low}.{x}"]
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
                                     groups_by_name[f"{up}.{x}"].index)
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
                if RING[h] and over > POINT_SKIN[h]:
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
