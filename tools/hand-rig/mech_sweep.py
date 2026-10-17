"""Squeeze sweep of the mechanical hand (hand_mech.py) on the pianist rig, both hands, with skeleton renders.

    blender -b <pianist .blend> --python tools/hand-rig/mech_sweep.py -- <out dir> [R,R,...]

Writes <out dir>/mech-report.json (the rest geometry of both hands in the hand frame, which hand_shape.py
reads, and per hand and ball radius: angles, joints held at a limit, joints past a
wall - must be none - and the thumb-to-little gap) and, for the listed radii (default 400,110,60,33,21), the
right hand's skeleton from the side, front and top into <out dir>/mech-R<r>-<view>.png. The scene's own
objects are hidden from the render, not changed; the file is not saved.
"""
import bpy, bmesh, json, math, os, sys
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "hand_mech.py"), encoding="utf-8").read())

args = sys.argv[sys.argv.index("--") + 1:]
OUT = args[0]
SHOW = [float(r) for r in (args[1] if len(args) > 1 else "400,110,60,33,21").split(",")]
SWEEP = [400, 200, 150, 120, 110, 100, 90, 80, 70, 60, 50, 45, 40, 36, 33, 30, 27, 24, 21, 18]
os.makedirs(OUT, exist_ok=True)

rig = next(o for o in bpy.data.objects if o.type == "ARMATURE" and "finger3-1.R" in o.data.bones)
rests = {s: rest_from_rig(rig, s) for s in ("L", "R")}
report = {"rig": rig.name, "len": {s: {f: [round(x, 1) for x in r["len"][f]] for f in r["len"]} for s, r in rests.items()},
          "rest": {s: {k: {f: [round(c, 2) for c in r[k][f]] for f in r[k]} for k in ("mcp", "tip")}
                   for s, r in rests.items()},
          "sweep": {}}
for s, rest in rests.items():
    report["sweep"][s] = []
    for R in SWEEP:
        g = grasp(rest, R)
        report["sweep"][s].append({"R": R, "angles": g["angles"], "squeezed": g["squeezed"],
                                   "past_wall": violations(g), "thumb_little_mm": g["thumb_little_mm"],
                                   "palm_over_low_mm": g["palm_over_low_mm"]})
json.dump(report, open(os.path.join(OUT, "mech-report.json"), "w"), indent=1)

# --- skeleton renders of the right hand: rods and joint balls, the ball as a wire, a table under the lowest point
sc = bpy.context.scene
for o in sc.objects:
    o.hide_render = True
col = bpy.data.collections.new("mech_sweep")
sc.collection.children.link(col)


def mat(name, rgba):
    m = bpy.data.materials.new(name)
    m.diffuse_color = rgba
    return m


STEEL, JOINT, PALM, BALL, TABLE = (mat("mech_steel", (0.72, 0.74, 0.78, 1)), mat("mech_joint", (0.95, 0.55, 0.15, 1)),
                                   mat("mech_palm", (0.45, 0.5, 0.58, 1)), mat("mech_ball", (0.75, 0.85, 0.2, 1)),
                                   mat("mech_table", (0.25, 0.25, 0.27, 1)))


def add(bm, m):
    me = bpy.data.meshes.new("mech")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("mech", me)
    o.data.materials.append(m)
    col.objects.link(o)
    return o


def rod(a, b, r):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=r * 0.92, radius2=r * 0.92, depth=(b - a).length)
    q = Vector((0, 0, 1)).rotation_difference(b - a)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4(), verts=bm.verts)
    return add(bm, STEEL)


def sphere(c, r, m, segs=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=r)
    bmesh.ops.translate(bm, vec=c, verts=bm.verts)
    return add(bm, m)


def palm_plate(rest):
    mcp = rest["mcp"]
    outline = [Vector((26, 4, 0)), mcp[2] + Vector((6, 2, 0)), mcp[3] + Vector((0, 4, 0)), mcp[4] + Vector((0, 3, 0)),
               mcp[5] + Vector((-5, 0, 0)), Vector((-32, 6, 0))]
    bm = bmesh.new()
    vs = [bm.verts.new((p.x, p.y, z)) for z in (-PALM_HALF * 2 + 4, 4) for p in outline]
    bmesh.ops.convex_hull(bm, input=vs)
    return add(bm, PALM)


sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light = "STUDIO"
sc.display.shading.color_type = "MATERIAL"
sc.display.shading.show_shadows = True
sc.display.shading.show_cavity = True
sc.render.resolution_x, sc.render.resolution_y = 640, 520
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = "PNG"
cam = bpy.data.objects.new("mech_cam", bpy.data.cameras.new("mech_cam"))
col.objects.link(cam)
cam.data.type = "ORTHO"
cam.data.clip_end = 5000
sc.camera = cam
rest = rests["R"]
for R in SHOW:
    g = grasp(rest, R)
    objs = [palm_plate(rest)]
    for f, ch in g["chains"].items():
        objs += [rod(a, b, R_FINGER[f]) for a, b in zip(ch, ch[1:])]
        objs += [sphere(p, R_FINGER[f] * 1.02, JOINT) for p in ch]
    bo = sphere(g["C"], g["R"], BALL, 32)
    bo.modifiers.new("wire", "WIREFRAME").thickness = 0.8
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=400)
    bmesh.ops.translate(bm, vec=Vector((0, 80, g["low_z"])), verts=bm.verts)
    objs += [bo, add(bm, TABLE)]
    at = Vector((0, 90, g["low_z"] + 40))
    views = {"side": at + Vector((600, 0, 0)), "front": at + Vector((0, 600, 80)), "top": at + Vector((0, -1, 600))}
    for name, eye in views.items():
        cam.location = eye
        cam.rotation_euler = (at - eye).to_track_quat("-Z", "Y").to_euler()
        cam.data.ortho_scale = 320
        sc.render.filepath = os.path.join(OUT, f"mech-R{int(R)}-{name}.png")
        bpy.ops.render.render(write_still=True)
    for o in objs:
        bpy.data.objects.remove(o)
print("MECH SWEEP DONE", OUT)
