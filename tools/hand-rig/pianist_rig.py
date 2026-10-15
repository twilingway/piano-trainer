"""Rig the Blender Studio male body and its skeleton on one armature built from the skeleton's joints.

Run inside Blender (blender MCP): exec(open(".../pianist_rig.py").read()).
Appends "Body Male - Realistic" and "Skeleton - Realistic" from the Human Base Meshes bundle into
scene "pianist" (fresh copies on every run). Every skeleton piece pivots at its joint, so the pieces'
origins are the joints. The skeleton is scaled into the skin, then each limb segment is turned about
its joint onto the body's centre line. The armature "PianistRig" takes its joints from the fitted
skeleton (bone names after MPFB, as in HandRig); the skeleton pieces ride on their bones rigidly and
the body ("PianistBody", base level of the Multires) gets automatic weights. The body faces -Y.
"""
import bpy, os
from mathutils import Matrix, Vector

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
groups = {g.index: g.name for g in body.vertex_groups}
used = {groups[x.group] for vert in me.vertices for x in vert.groups if x.weight > 0.01}
unweighted = sum(1 for vert in me.vertices if not any(x.weight > 0.01 for x in vert.groups))
sub = body.modifiers.new("smooth", "SUBSURF")
sub.levels = sub.render_levels = 1
print("scale", round(s, 3), "bones", len(arm_data.bones), "body verts", len(me.vertices),
      "unweighted verts", unweighted, "bones without skin", sorted(set(arm_data.bones.keys()) - used),
      "unmapped pieces", unmapped)
