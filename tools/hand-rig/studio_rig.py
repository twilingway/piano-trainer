"""Rig the Blender Studio hand ("Hand  - Realistic") with MPFB bone names and automatic weights.

Run inside Blender (blender MCP): exec(open(".../studio_rig.py").read()).
The mesh hangs down -Z, palm towards +Y, thumb on +X (a right hand). Joints come from horizontal
cross-sections of the fingers (studio_geo.section) plus phalanx ratios; the thumb from its free part.
Creates collection "studio": "HandMesh" (Multires baked) parented to "HandRig".
"""
import bpy, math, os
from mathutils import Matrix, Vector

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


# --- forearm: the studio mesh stops 8 cm above the wrist. Its skin is kept up to CUT; from the
# cut's own loop new rings run to the elbow, each vertex out from the forearm axis to the skin of the
# MPFB "Human" (its rest pose, aligned by the hand and scaled by the hand's length). Over BLEND the
# studio's section turns into the Human's, so the seam has neither a step nor a topology change.
HUMAN, HUMAN_RIG = "Human", "Human.rig"
CUT = 0.035             # metres above the wrist, along the forearm
BLEND = 0.05
RING = 0.007            # ring spacing
CAP = 3                 # rings that round the end off at the elbow
TOP = 0.88              # of the forearm's length: the Human's section is taken up to here
UV_SCALE = 0.85         # the hand's islands shrink into the corner; the forearm takes the top strip
UV_BAND = (0.745, 0.985)


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def hand_frame(wrist, elbow, index, pinky):
    """Columns: X across the hand, Y out of the back or palm, Z from the wrist to the elbow."""
    z = (elbow - wrist).normalized()
    n = (index - wrist).cross(pinky - wrist)
    y = (n - z * n.dot(z)).normalized()
    return Matrix((y.cross(z), y, z)).transposed()


def graft_forearm(mesh, rig):
    import bmesh
    from mathutils.bvhtree import BVHTree

    human, hrig = bpy.data.objects[HUMAN], bpy.data.objects[HUMAN_RIG]
    hb = lambda n: hrig.matrix_world @ hrig.data.bones[n].head_local
    sb = rig.data.bones
    S = hand_frame(sb["wrist.R"].head_local, sb["lowerarm02.R"].head_local,
                   sb["finger2-1.R"].head_local, sb["finger5-1.R"].head_local)
    H = hand_frame(hb("wrist.R"), hb("lowerarm01.R"), hb("finger2-1.R"), hb("finger5-1.R"))
    k = sb["finger3-3.R"].tail_local.length / \
        (hrig.matrix_world @ hrig.data.bones["finger3-3.R"].tail_local - hb("wrist.R")).length
    to_rig = (S @ H.transposed() * k).to_4x4() @ Matrix.Translation(-hb("wrist.R"))
    L = k * (hb("lowerarm01.R") - hb("wrist.R")).length
    ex, ey, ez = S.col[0], S.col[1], S.col[2]

    # The rest mesh: the basis plus MPFB's body shape keys; only the skin, not the helper geometry.
    keys = human.data.shape_keys.key_blocks if human.data.shape_keys else []
    co = [v.co.copy() for v in human.data.vertices]
    for key in keys[1:]:
        if key.mute or key.value == 0:
            continue
        rel_key = key.relative_key.data
        for i, d in enumerate(key.data):
            co[i] += (d.co - rel_key[i].co) * key.value
    body = human.vertex_groups["body"].index
    skin = {v.index for v in human.data.vertices if any(g.group == body and g.weight > 0 for g in v.groups)}
    m = to_rig @ human.matrix_world
    bvh = BVHTree.FromPolygons([m @ c for c in co],
                               [tuple(p.vertices) for p in human.data.polygons if skin.issuperset(p.vertices)])

    def human_r(z, a):
        # Past TOP the rays reach the upper arm of the A pose: the elbow keeps the forearm's section.
        hit = bvh.ray_cast(ez * min(z, TOP * L), ex * math.cos(a) + ey * math.sin(a), 0.1)
        return hit[3] if hit[0] else None

    rel = rig.matrix_world.inverted() @ mesh.matrix_world
    back = rel.inverted()
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    z_of = lambda v: (rel @ v.co).dot(ez)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(z_of(v) > CUT for v in f.verts)], context="FACES")
    edges = [e for e in bm.edges if e.is_boundary]
    # The cut's loop in the direction its faces run, so the new faces wind the other way round.
    l0 = edges[0].link_loops[0]
    loop, nxt = [l0.vert], {}
    for e in edges:
        l = e.link_loops[0]
        nxt[l.vert] = l.link_loop_next.vert
    while nxt[loop[-1]] is not loop[0]:
        loop.append(nxt[loop[-1]])
    assert len(loop) == len(edges), (len(loop), len(edges))

    n = len(loop)
    seam = []
    for v in loop:
        p = rel @ v.co
        z = p.dot(ez)
        q = p - ez * z
        a = math.atan2(q.dot(ey), q.dot(ex))
        seam.append((z, a, q.length, human_r(z, a)))
    rings = [loop]
    steps = math.ceil((L - CUT) / RING)
    last = [s[3] for s in seam]
    for j in range(1, steps + 1):
        ring = []
        for i, (z0, a, r0, h0) in enumerate(seam):
            z = z0 + (L - z0) * j / steps
            h = human_r(z, a) or last[i]
            last[i] = h
            w = smoothstep(CUT, CUT + BLEND, z)
            r = (1 - w) * r0 * h / h0 + w * h
            ring.append(bm.verts.new(back @ (ez * z + (ex * math.cos(a) + ey * math.sin(a)) * r)))
        rings.append(ring)
    end = [rel @ v.co for v in rings[-1]]
    mean_r = sum((p - ez * p.dot(ez)).length for p in end) / n
    for c in range(1, CAP + 1):
        phi = c * math.pi / 2 / (CAP + 1)
        rings.append([bm.verts.new(back @ (ez * (L + 0.5 * mean_r * math.sin(phi))
                                           + (p - ez * p.dot(ez)) * math.cos(phi))) for p in end])
    centre = bm.verts.new(back @ (ez * (L + 0.5 * mean_r)))

    # UVs: the hand's islands shrink; the forearm is two half-tubes side by side in the top band,
    # the cap a disc in the free right strip.
    uvl = bm.loops.layers.uv.active
    for f in bm.faces:
        for l in f.loops:
            l[uvl].uv *= UV_SCALE
    arc = [0.0]
    for a, b in zip(loop, loop[1:] + loop[:1]):
        arc.append(arc[-1] + (a.co - b.co).length)
    arc = [x / arc[-1] for x in arc]
    z_lo = min(s[0] for s in seam)
    v0, v1 = UV_BAND

    def tube_uv(j, i, half):
        z = seam[i % n][0] + (L - seam[i % n][0]) * j / steps
        u = (0.005 if half == 0 else 0.505) + 0.49 * (z - z_lo) / (L - z_lo)
        return (u, v0 + (v1 - v0) * (arc[i] - 0.5 * half) / 0.5)

    def cap_uv(j, i):
        a, phi = seam[i % n][1], (j - steps) * math.pi / 2 / (CAP + 1)
        return (0.92 + 0.055 * math.cos(phi) * math.cos(a), 0.66 + 0.055 * math.cos(phi) * math.sin(a))

    dl = bm.verts.layers.deform.verify()
    arm = mesh.vertex_groups["lowerarm02.R"].index
    new_faces = []
    for j in range(len(rings) - 1):
        for i in range(n):
            a, b = rings[j][i], rings[j][(i + 1) % n]
            a2, b2 = rings[j + 1][i], rings[j + 1][(i + 1) % n]
            f = bm.faces.new((b, a, a2, b2))
            half = 0 if arc[i] < 0.5 else 1
            corners = ((j, i + 1), (j, i), (j + 1, i), (j + 1, i + 1))
            for l, (jj, ii) in zip(f.loops, corners):
                l[uvl].uv = tube_uv(jj, ii, half) if jj <= steps and j < steps else cap_uv(jj, ii)
            new_faces.append(f)
    for i in range(n):
        f = bm.faces.new((rings[-1][(i + 1) % n], rings[-1][i], centre))
        for l, uv in zip(f.loops, (cap_uv(len(rings) - 1, i + 1), cap_uv(len(rings) - 1, i), (0.92, 0.66))):
            l[uvl].uv = uv
        new_faces.append(f)
    for f in new_faces:
        f.smooth = True
        for v in f.verts:
            if v not in loop:
                v[dl].clear()
                v[dl][arm] = 1.0

    # The wrist's blend runs further up the forearm: a short one folds the skin when the wrist bends.
    for v in bm.verts:
        z = z_of(v)
        if not -0.02 < z < 0.05 or arm not in v[dl]:
            continue
        a = smoothstep(-0.02, 0.05, z)
        others = {g: w for g, w in v[dl].items() if g != arm}
        total = sum(others.values())
        if total <= 1e-6:
            continue
        for g, w in others.items():
            v[dl][g] = w / total * (1 - a)
        v[dl][arm] = a
    bm.to_mesh(mesh.data)
    bm.free()
    mesh.data.update()
    print("forearm", round(L * 1000), "mm, scale", round(k, 3), "rings", len(rings), "loop", n)


if bpy.data.objects.get(HUMAN):
    graft_forearm(mesh, rig)
s = mesh.modifiers.new("smooth", "SUBSURF")
s.levels = s.render_levels = 1

empty_groups = [g.name for g in mesh.vertex_groups
                if not any(g.index in [x.group for x in v.groups if x.weight > 0.01] for v in me.vertices)]
print("bones", len(arm_data.bones), "verts", len(me.vertices), "groups", len(mesh.vertex_groups), "empty", empty_groups)
for f in range(1, 6):
    j = joints[f]
    print(f, [tuple(round(c * 1000) for c in (p.x, p.y, (p.z - zmin))) for p in j],
          "len_mm", [round((b - a).length * 1000) for a, b in zip(j, j[1:])])
