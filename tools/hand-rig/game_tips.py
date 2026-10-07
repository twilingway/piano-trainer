"""Fingertip pads of every solved pose, in the pixels of the 1024 px top render (camera camtop).

Run inside Blender with HandRig and HandMesh built (studio_rig.py): exec(open(".../game_tips.py").read(), {}).
Each poses/<id>.json is put on the rig, the mesh is evaluated as rendered (Armature + SUBSURF), and a
finger's pad is the mean of the lowest PAD_BAND of its distal phalanx, seen from straight above. The
rig's own pose is restored afterwards. Writes poses/tips.json; export.py turns it into the game catalog.
"""
import bpy, json, os
from mathutils import Matrix

ROOT = globals().get("ROOT", r"E:/MySource/ReactJS/piano-trainer")
POSES = os.path.join(ROOT, "tools/hand-rig/poses")
# studio_pose.py: keyboard and the top camera's fixed frame
WHITE_W, X0, KEY_TOP = 0.0235, 0.36, 0.74
WHITE_PCS = (0, 2, 4, 5, 7, 9, 11)
CX, CY, ORTHO, SIZE = X0 + 2.5 * WHITE_W, 0.27, 0.30, 1024
PAD_BAND = 0.0015


def key_x(semi):
    o, pc = divmod(semi, 12)
    if pc in WHITE_PCS:
        return X0 + (o * 7 + WHITE_PCS.index(pc)) * WHITE_W
    return X0 + (o * 7 + WHITE_PCS.index(pc - 1)) * WHITE_W + WHITE_W / 2


def pixel(x, y):
    return (x - CX) / ORTHO * SIZE + SIZE / 2, SIZE / 2 - (y - CY) / ORTHO * SIZE


rig, mesh = bpy.data.objects["HandRig"], bpy.data.objects["HandMesh"]
saved = {b.name: (b.rotation_mode, b.location.copy(), b.rotation_quaternion.copy(), b.scale.copy())
         for b in rig.pose.bones}
saved_world = rig.matrix_world.copy()
distal = {mesh.vertex_groups[f"finger{f}-3.R"].index: f for f in range(1, 6)}
out = {}
try:
    for name in sorted(os.listdir(POSES)):
        if not name.endswith(".json") or name in ("report.json", "tips.json"):
            continue
        pose = json.load(open(os.path.join(POSES, name), encoding="utf-8"))
        rig.matrix_world = Matrix(pose["rig_matrix_world"])
        for b in rig.pose.bones:
            b.rotation_mode = "QUATERNION"
            b.location, b.rotation_quaternion, b.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)
        for bone, t in pose["bones"].items():
            b = rig.pose.bones[bone]
            b.location, b.rotation_quaternion, b.scale = t["location"], t["rotation_quaternion"], t["scale"]
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        me = mesh.evaluated_get(dg).to_mesh()   # as rendered: armature + SUBSURF keep the groups
        own = {}
        for v in me.vertices:
            if v.groups:
                g = max(v.groups, key=lambda g: g.weight)
                if g.group in distal and g.weight > 0.5:
                    own.setdefault(distal[g.group], []).append(v.index)
        W = mesh.matrix_world
        tips, miss = {}, {}
        for f in sorted(own):
            pts = [W @ me.vertices[i].co for i in own[f]]
            low = min(p.z for p in pts)
            pad = [p for p in pts if p.z <= low + PAD_BAND]
            x = sum(p.x for p in pad) / len(pad)
            y = sum(p.y for p in pad) / len(pad)
            u, v = pixel(x, y)
            tips[f] = {"x": round(u, 1), "y": round(v, 1)}
            semi = pose["down"].get(str(f))
            if semi is not None:
                miss[f] = round((x - key_x(semi)) * 1000, 1)
        mesh.evaluated_get(dg).to_mesh_clear()
        out[pose["id"]] = {"tips": tips, "down": sorted(int(f) for f in pose["down"]), "x_miss_mm": miss}
finally:
    rig.matrix_world = saved_world
    for b in rig.pose.bones:
        m, l, q, s = saved[b.name]
        b.rotation_mode, b.location, b.rotation_quaternion, b.scale = m, l, q, s
    bpy.context.view_layer.update()
with open(os.path.join(POSES, "tips.json"), "w", encoding="utf-8") as fh:
    json.dump({"size": SIZE, "pixelsPerKey": round(WHITE_W / ORTHO * SIZE, 4), "poses": out}, fh, indent=1)
    print(file=fh)
worst = max(((abs(e), p, f) for p, r in out.items() for f, e in r["x_miss_mm"].items()), default=None)
print(len(out), "poses; worst pressed pad off its key centre (mm, pose, finger):", worst)
