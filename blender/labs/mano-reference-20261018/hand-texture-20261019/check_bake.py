"""Render the baked albedo on the hand (Blender -b --factory-startup).

Same mesh/UV as export_subdiv.py, material = bake/albedo-4096.png. Renders the five view
cameras (flat light: should match generated-aligned/) and two oblique studio-lit views into
bake/check-<name>.png, plus bake/check-sheet.png; saves hand-textured.blend.
"""
from pathlib import Path
import json, math, os
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
OUT = HERE/os.environ.get('BAKE_DIR', 'bake')
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj)
info = json.loads((HERE/'flat-hand.json').read_text(encoding='utf-8'))
uvs = json.loads((HERE/'arm-uv.json').read_text(encoding='utf-8'))['faces']
verts, faces = [], []
for line in (HERE/'flat-hand.obj').read_text(encoding='utf-8').splitlines():
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
hand = bpy.data.objects.new('flat-hand', mesh)
bpy.context.scene.collection.objects.link(hand)
sub = hand.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 2
sub.uv_smooth = 'NONE'

img = bpy.data.images.load(str(OUT/'albedo-4096.png'))
mat = bpy.data.materials.new('skin')
mat.use_nodes = True
tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = img
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
mat.node_tree.links.new(tex.outputs[0], bsdf.inputs[0])
mesh.materials.append(mat)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = scene.render.resolution_y = 1024
scene.render.image_settings.file_format = 'PNG'
shading = scene.display.shading
shading.color_type = 'TEXTURE'
if scene.world is None:
    scene.world = bpy.data.worlds.new('World')
scene.world.color = (1., 1., 1.)
try:
    scene.view_settings.view_transform = 'Standard'
except TypeError:
    pass

cams = json.loads((HERE/'views/cameras.json').read_text(encoding='utf-8'))
center = Vector(cams['center'])
shots = []
for name, view in cams['views'].items():
    shots.append((name, Matrix(view['matrix_world']), 'FLAT'))
# Oblique: from above-front of the back of the hand, and from below the palm, thumb side.
for name, direction, up in (('oblique-dorsal', Vector((-.5, 1., .7)), Vector((0, 1, 0))),
                            ('oblique-palmar', Vector((-.4, -1., .8)), Vector((0, -1, 0))),
                            # Along the fingers into the gaps: the finger sides facing each other.
                            ('between-palmar', Vector((-1., -.6, .25)), Vector((0, -1, 0))),
                            ('between-dorsal', Vector((-1., .6, -.25)), Vector((0, 1, 0))),
                            # 45° around the fingers: the sides of each finger, as in the user's
                            # screenshots of the streaks.
                            ('side-palmar-thumb', Vector((-.3, -.7, .7)), Vector((0, -1, 0))),
                            ('side-palmar-little', Vector((-.3, -.7, -.7)), Vector((0, -1, 0))),
                            ('side-dorsal-thumb', Vector((-.3, .7, .7)), Vector((0, 1, 0))),
                            ('side-dorsal-little', Vector((-.3, .7, -.7)), Vector((0, 1, 0)))):
    direction = direction.normalized()
    eye = center+direction
    forward = -direction
    right = forward.cross(up).normalized()
    true_up = right.cross(forward)
    shots.append((name, Matrix(((right.x, true_up.x, -forward.x, eye.x),
                                (right.y, true_up.y, -forward.y, eye.y),
                                (right.z, true_up.z, -forward.z, eye.z),
                                (0, 0, 0, 1))), 'STUDIO'))
# Close-ups of the thumb (6 cm frame): the nail from above-outside, the underside seam.
tip = Vector(max(verts, key=lambda v: v[2]))
focus = tip+(center-tip).normalized()*.015
zoom = {}
for name, direction, up in (('zoom-thumb-nail', Vector((-.2, .7, .7)), Vector((0, 1, 0))),
                            ('zoom-thumb-under', Vector((-.2, -.7, .7)), Vector((0, -1, 0)))):
    direction = direction.normalized()
    eye = focus+direction
    forward = -direction
    right = forward.cross(up).normalized()
    true_up = right.cross(forward)
    shots.append((name, Matrix(((right.x, true_up.x, -forward.x, eye.x),
                                (right.y, true_up.y, -forward.y, eye.y),
                                (right.z, true_up.z, -forward.z, eye.z),
                                (0, 0, 0, 1))), 'STUDIO'))
    zoom[name] = .06
for name, matrix, light in shots:
    data = bpy.data.cameras.new(name)
    data.type, data.ortho_scale = 'ORTHO', zoom.get(name, cams['ortho_scale_m'])
    data.clip_start, data.clip_end = .001, 10.
    cam = bpy.data.objects.new(name, data)
    scene.collection.objects.link(cam)
    cam.matrix_world = matrix
    scene.camera = cam
    shading.light = light
    scene.render.filepath = str(OUT/f'check-{name}.png')
    bpy.ops.render.render(write_still=True)
shading.light = 'STUDIO'
scene.camera = bpy.data.objects['oblique-dorsal']
for screen in bpy.data.screens:  # open the file looking at the textured hand
    for area in screen.areas:
        if area.type != 'VIEW_3D':
            continue
        space = area.spaces.active
        space.shading.type = 'SOLID'
        space.shading.color_type = 'TEXTURE'
        space.overlay.show_floor = space.overlay.show_axis_x = space.overlay.show_axis_y = False
        space.clip_start = .001
        r3d = space.region_3d
        r3d.view_location = center
        r3d.view_distance = .45
        r3d.view_rotation = next(m for nm, m, _ in shots if nm == 'oblique-dorsal').to_quaternion()
img.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/f"hand-textured{os.environ.get('BAKE_DIR', 'bake')[4:]}.blend"))
print('CHECK DONE', len(shots))
