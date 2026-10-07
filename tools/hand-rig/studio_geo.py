"""Geometry probes for the Blender Studio hand: horizontal cross-sections of the mesh."""
import bpy, bmesh
from mathutils import Vector

SRC = globals().get("SRC", "Hand  - Realistic.001")


def load_bm(name=SRC):
    o = bpy.data.objects[name]
    dg = bpy.context.evaluated_depsgraph_get()
    me = o.evaluated_get(dg).to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(o.matrix_world)
    o.evaluated_get(dg).to_mesh_clear()
    return bm


def section(bm, point, normal):
    """Loops where the plane (point, normal) cuts the mesh: [(centroid, points)], connected by faces."""
    pts = {}
    for e in bm.edges:
        a, b = e.verts[0].co, e.verts[1].co
        da, db = (a - point).dot(normal), (b - point).dot(normal)
        if da * db < 0:
            pts[e.index] = a.lerp(b, da / (da - db))
    parent = {k: k for k in pts}

    def find(k):
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    for e in bm.edges:
        if e.index not in pts:
            continue
        for f in e.link_faces:
            for e2 in f.edges:
                if e2.index in pts and e2.index != e.index:
                    parent[find(e.index)] = find(e2.index)
    groups = {}
    for k, p in pts.items():
        groups.setdefault(find(k), []).append(p)
    return [(sum(g, Vector()) / len(g), g) for g in groups.values()]
