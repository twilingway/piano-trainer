"""Subdivided hand with the arm UV, as arrays for bake_views.py (Blender -b --factory-startup).

Same surface as the view renders (flat-hand.obj + Subdivision level 2). UVs are interpolated
linearly inside each base face (uv_smooth NONE), so a texel keeps its base SMPL-H face no
matter how the final skin is subdivided. Output: subdiv-hand.npz with triangles of
positions, smooth vertex normals, UVs and the base SMPL-H face id of each triangle.
"""
from pathlib import Path
import json, os
import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
NAME = 'spread-hand' if os.environ.get('HAND_POSE') == 'spread' else 'flat-hand'
NPZ = 'subdiv-spread.npz' if NAME == 'spread-hand' else 'subdiv-hand.npz'
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj)
info = json.loads((HERE/f'{NAME}.json').read_text(encoding='utf-8'))
uvs = json.loads((HERE/'arm-uv.json').read_text(encoding='utf-8'))['faces']
verts, faces = [], []
for line in (HERE/f'{NAME}.obj').read_text(encoding='utf-8').splitlines():
    if line.startswith('v '):
        verts.append(tuple(float(x) for x in line.split()[1:]))
    elif line.startswith('f '):
        faces.append(tuple(int(x)-1 for x in line.split()[1:]))
mesh = bpy.data.meshes.new('flat-hand')
mesh.from_pydata(verts, [], faces)
mesh.update()
for p in mesh.polygons:
    p.use_smooth = True
layer = mesh.uv_layers.new(name='skin')
for poly, smplh_face in zip(mesh.polygons, info['smplh_face_ids']):
    for loop, uv in zip(poly.loop_indices, uvs[str(smplh_face)]):
        layer.data[loop].uv = uv
# Base face id as an integer face attribute, carried through subdivision.
attr = mesh.attributes.new('smplh_face', 'INT', 'FACE')
attr.data.foreach_set('value', info['smplh_face_ids'])
hand = bpy.data.objects.new('flat-hand', mesh)
bpy.context.scene.collection.objects.link(hand)
sub = hand.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 2
sub.uv_smooth = 'NONE'

dg = bpy.context.evaluated_depsgraph_get()
ev = hand.evaluated_get(dg).to_mesh()
ev.calc_loop_triangles()
n_tri = len(ev.loop_triangles)
tri_loops = np.empty(n_tri*3, np.int32)
ev.loop_triangles.foreach_get('loops', tri_loops)
tri_poly = np.empty(n_tri, np.int32)
ev.loop_triangles.foreach_get('polygon_index', tri_poly)
loop_vert = np.empty(len(ev.loops), np.int32)
ev.loops.foreach_get('vertex_index', loop_vert)
co = np.empty(len(ev.vertices)*3, np.float32)
ev.vertices.foreach_get('co', co)
nrm = np.empty(len(ev.vertices)*3, np.float32)
ev.vertices.foreach_get('normal', nrm)
luv = np.empty(len(ev.loops)*2, np.float32)
ev.uv_layers['skin'].data.foreach_get('uv', luv)
pface = np.empty(len(ev.polygons), np.int32)
ev.attributes['smplh_face'].data.foreach_get('value', pface)
tri_loops = tri_loops.reshape(-1, 3)
np.savez_compressed(
    HERE/NPZ,
    positions=co.reshape(-1, 3)[loop_vert[tri_loops]],
    normals=nrm.reshape(-1, 3)[loop_vert[tri_loops]],
    uvs=luv.reshape(-1, 2)[tri_loops],
    smplh_face=pface[tri_poly],
)
print('SUBDIV DONE triangles', n_tri, 'vertices', len(ev.vertices))
