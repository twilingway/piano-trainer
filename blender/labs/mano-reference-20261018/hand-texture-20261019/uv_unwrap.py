"""UV layout for the right arm up to the elbow (Blender --background --factory-startup).

Seam: the side line between the back (face normal +Y in the zero pose: back of the hand and
forearm) and the front (palm side), along the fingers, the hand edges and the forearm, plus
the open elbow cut. Two main islands, unwrapped by minimum stretch and packed.
Output: arm-uv.json (SMPL-H face id -> three UV corners, corner order of model 'f'),
uv-layout.png, uv-check-<view>.png (UV grid seen from the dorsal and palmar cameras),
flat-arm-uv.blend.
"""
from pathlib import Path
import json
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = Path(__file__).resolve().parent
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj)
info = json.loads((HERE/'flat-arm.json').read_text(encoding='utf-8'))
verts, faces = [], []
for line in (HERE/'flat-arm.obj').read_text(encoding='utf-8').splitlines():
    if line.startswith('v '):
        verts.append(tuple(float(x) for x in line.split()[1:]))
    elif line.startswith('f '):
        faces.append(tuple(int(x)-1 for x in line.split()[1:]))
mesh = bpy.data.meshes.new('flat-arm')
mesh.from_pydata(verts, [], faces)
mesh.update()
for p in mesh.polygons:
    p.use_smooth = True
arm = bpy.data.objects.new('flat-arm', mesh)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
mesh.uv_layers.new(name='skin')

bm = bmesh.new()
bm.from_mesh(mesh)
bm.faces.ensure_lookup_table()
back = {f.index: f.normal.y > 0 for f in bm.faces}
# Smooth the label once by neighbour majority so the seam does not zigzag.
for _ in range(2):
    new = {}
    for f in bm.faces:
        votes = [back[g.index] for e in f.edges for g in e.link_faces if g is not f]+[back[f.index]]*2
        new[f.index] = sum(votes)*2 > len(votes)
    back = new
seams = 0
for e in bm.edges:
    linked = e.link_faces
    e.seam = len(linked) == 2 and back[linked[0].index] != back[linked[1].index]
    seams += e.seam
bm.to_mesh(mesh)
bm.free()

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
methods = [i.identifier for i in bpy.ops.uv.unwrap.get_rna_type().properties['method'].enum_items]
bpy.ops.uv.unwrap(method='MINIMUM_STRETCH' if 'MINIMUM_STRETCH' in methods else 'ANGLE_BASED', margin=.02)
bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.pack_islands(margin=.02)
bpy.ops.object.mode_set(mode='OBJECT')

uv = mesh.uv_layers['skin'].data
result = {}
for poly, smplh_face in zip(mesh.polygons, info['smplh_face_ids']):
    result[str(smplh_face)] = [list(uv[i].uv) for i in poly.loop_indices]
(HERE/'arm-uv.json').write_text(json.dumps({'faces': result, 'seam_edges': seams}), encoding='utf-8')

# UV layout image
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.select_all(action='SELECT')
try:
    bpy.ops.uv.export_layout(filepath=str(HERE/'uv-layout.png'), size=(1024, 1024), opacity=.25, export_all=True)
except Exception as failure:
    print('layout export failed', failure)
bpy.ops.object.mode_set(mode='OBJECT')

# UV grid check from the dorsal/palmar cameras of views-arm
grid = bpy.data.images.new('grid', 1024, 1024)
grid.generated_type = 'COLOR_GRID'
mat = bpy.data.materials.new('grid')
mat.use_nodes = True
tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = grid
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
mat.node_tree.links.new(tex.outputs[0], bsdf.inputs[0])
arm.data.materials.append(mat)
sub = arm.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 2
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'FLAT'
scene.display.shading.color_type = 'TEXTURE'
scene.render.resolution_x = scene.render.resolution_y = 1024
if scene.world is None:
    scene.world = bpy.data.worlds.new('World')
scene.world.color = (1., 1., 1.)
cams = json.loads((HERE/'views-arm/cameras.json').read_text(encoding='utf-8'))
for name in ('dorsal', 'palmar', 'thumb-side', 'little-side'):
    data = bpy.data.cameras.new(name)
    data.type, data.ortho_scale = 'ORTHO', cams['ortho_scale_m']
    cam = bpy.data.objects.new(name, data)
    scene.collection.objects.link(cam)
    cam.matrix_world = Matrix(cams['views'][name]['matrix_world'])
    scene.camera = cam
    scene.render.filepath = str(HERE/f'uv-check-{name}.png')
    bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'flat-arm-uv.blend'))
print('UV DONE seams', seams, 'faces', len(result))
