"""Rig the Blender Studio hand ("Hand  - Realistic") with MPFB bone names and automatic weights.

Run inside Blender (blender MCP): exec(open(".../studio_rig.py").read()).
The mesh hangs down -Z, palm towards +Y, thumb on +X (a right hand). Joints come from horizontal
cross-sections of the fingers (studio_geo.section) plus phalanx ratios; the thumb from its free part.
Creates collection "studio": "HandMesh" (Multires baked) parented to "HandRig".
"""
import bpy, math, os
from mathutils import Vector

# The repository on the machine that runs Blender; pass {"ROOT": ...} to exec to override.
ROOT = globals().get("ROOT", r"E:/MySource/ReactJS/piano-trainer")
exec(open(os.path.join(ROOT, "tools/hand-rig/studio_geo.py"), encoding="utf-8").read())

SRC = "Hand  - Realistic.001"
scene = bpy.context.scene
src = bpy.data.objects[SRC]

coll = bpy.data.collections.get("studio")
if coll:
    for o in list(coll.objects):
        bpy.data.objects.remove(o)
else:
    coll = bpy.data.collections.new("studio")
    scene.collection.children.link(coll)
src.hide_set(True)
src.hide_render = True

bm = load_bm(SRC)
zmin = min(v.co.z for v in bm.verts)
Z = Vector((0, 0, 1))
PALM = Vector((0, 1, 0))

# --- fingers 2..5: x guesses at mid-finger, web height (mm above the middle fingertip)
GUESS_X = {2: 1.452, 3: 1.420, 4: 1.392, 5: 1.358}
WEB = {2: 0.084, 3: 0.080, 4: 0.080, 5: 0.092}
MCP_ABOVE_WEB = 0.024
RATIOS = {2: (0.47, 0.28, 0.25), 3: (0.47, 0.29, 0.24), 4: (0.47, 0.28, 0.25), 5: (0.45, 0.28, 0.27)}
TIP_IN = 0.005                      # distal tail this far inside the fingertip

joints = {}
for f, gx in GUESS_X.items():
    pts = [v.co for v in bm.verts if abs(v.co.x - gx) < 0.012 and v.co.z < zmin + WEB[f]]
    tip = min(pts, key=lambda p: p.z)
    line = []
    k = tip.z + 0.004
    while k < zmin + WEB[f] - 0.002:
        loops = [(c, g) for c, g in section(bm, Vector((0, 0, k)), Z)
                 if max(p.x for p in g) - min(p.x for p in g) < 0.026]
        if loops:
            c, _ = min(loops, key=lambda r: abs(r[0].x - gx))
            if abs(c.x - gx) < 0.015:
                line.append(c)
        k += 0.003
    # proximal half of the visible finger gives the direction to extrapolate up to the knuckle
    prox = line[len(line) // 2:]
    d = (prox[-1] - prox[0]).normalized()
    mcp = prox[-1] + d * ((zmin + WEB[f] + MCP_ABOVE_WEB - prox[-1].z) / d.z)
    end = tip + (line[0] - tip).normalized() * TIP_IN
    poly = [mcp] + list(reversed(line)) + [end]
    lens = [(b - a).length for a, b in zip(poly, poly[1:])]
    total = sum(lens)

    def at(s):
        for a, b, l in zip(poly, poly[1:], lens):
            if s <= l:
                return a.lerp(b, s / l)
            s -= l
        return poly[-1]

    r1, r2, _ = RATIOS[f]
    joints[f] = [mcp, at(total * r1), at(total * (r1 + r2)), end]

# --- thumb: the free part's centre line, then back into the thenar
th_tip = min((v.co for v in bm.verts if v.co.x > 1.476), key=lambda p: p.z)
th_free = [Vector((1.467, 0.030, zmin + 0.137)), Vector((1.490, 0.036, zmin + 0.099))]
th_dir = (th_free[1] - th_free[0]).normalized()
th_end = th_tip - th_dir * TIP_IN
th_ip = th_end - th_dir * 0.027
th_mcp = th_ip - th_dir * 0.031
th_cmc = Vector((1.436, 0.016, zmin + 0.178))
joints[1] = [th_cmc, th_mcp, th_ip, th_end]

# --- wrist and forearm stub
WRIST = Vector((1.406, 0.010, zmin + 0.200))
ELBOW_END = Vector((1.409, 0.004, zmin + 0.278))
CARPUS = 0.022                         # wrist bone length; metacarpals start past it

arm_data = bpy.data.armatures.new("HandRig")
rig = bpy.data.objects.new("HandRig", arm_data)
coll.objects.link(rig)
rig.location = WRIST
rig.show_in_front = True
arm_data.display_type = "STICK"
bpy.context.view_layer.objects.active = rig
for o in bpy.context.view_layer.objects:
    o.select_set(False)
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
inv = rig.matrix_world.inverted()


# Fingers flex in their own plane: the flex axis (bone X) runs along the knuckle line
# (index -> pinky side), not along a guessed palm normal (that tilted it ~14 deg and curled
# fingers drifted sideways into each other).
KNUCKLE_SIDE = (joints[2][0] - joints[5][0]).normalized()


def bone(name, head, tail, parent=None, roll_to=PALM, connect=False, flex_axis=None):
    b = eb.new(name)
    b.head, b.tail = inv @ head, inv @ tail
    if flex_axis is not None:
        y = (tail - head).normalized()
        x = (flex_axis - y * flex_axis.dot(y)).normalized()
        z = x.cross(y)
        roll_to = z if z.dot(PALM) > 0 else -z
    b.align_roll(roll_to)
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    return b


bone("lowerarm02.R", ELBOW_END, WRIST)
wrist_tail = WRIST + (joints[3][0] - WRIST).normalized() * CARPUS
bone("wrist.R", WRIST, wrist_tail, "lowerarm02.R", connect=True)
for f in (2, 3, 4, 5):
    mc = f"metacarpal{f - 1}.R"
    base = WRIST.lerp(joints[f][0], 0.28)
    bone(mc, base, joints[f][0], "wrist.R", flex_axis=KNUCKLE_SIDE)
    for j in (1, 2, 3):
        bone(f"finger{f}-{j}.R", joints[f][j - 1], joints[f][j], mc if j == 1 else f"finger{f}-{j - 1}.R",
             connect=j > 1, flex_axis=KNUCKLE_SIDE)
THUMB_PALM = Vector((-0.6, 0.8, 0))     # thumb pad faces the palm and the index finger
for j in (1, 2, 3):
    bone(f"finger1-{j}.R", joints[1][j - 1], joints[1][j], "wrist.R" if j == 1 else f"finger1-{j - 1}.R",
         roll_to=THUMB_PALM, connect=j > 1)
bpy.ops.object.mode_set(mode="OBJECT")

# --- mesh with Multires baked, automatic weights
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(src.evaluated_get(dg))
me.name = "HandMesh"
mesh = bpy.data.objects.new("HandMesh", me)
coll.objects.link(mesh)
mesh.matrix_world = src.matrix_world
for p in me.polygons:
    p.use_smooth = True
for o in bpy.context.view_layer.objects:
    o.select_set(False)
mesh.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
s = mesh.modifiers.new("smooth", "SUBSURF")
s.levels = s.render_levels = 1

empty_groups = [g.name for g in mesh.vertex_groups
                if not any(g.index in [x.group for x in v.groups if x.weight > 0.01] for v in me.vertices)]
print("bones", len(arm_data.bones), "verts", len(me.vertices), "groups", len(mesh.vertex_groups), "empty", empty_groups)
for f in range(1, 6):
    j = joints[f]
    print(f, [tuple(round(c * 1000) for c in (p.x, p.y, (p.z - zmin))) for p in j],
          "len_mm", [round((b - a).length * 1000) for a, b in zip(j, j[1:])])
