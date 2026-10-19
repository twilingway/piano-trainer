"""Render a touch-up camera with another texture on the hand (Blender -b hand-textured.blend).

Env: DIAG_TEX (image path, relative to this folder), DIAG_VIEWS (comma list of names from
<DIAG_DIR, default views-fix>/cameras.json), DIAG_TAG (output suffix), DIAG_OUT (folder,
default bake). Output: <DIAG_OUT>/diag-<view>-<tag>.png, flat light.
DIAG_LOOK=name:fx,fy,fz:dx,dy,dz:scale adds an ad-hoc ortho camera (focus, direction to the
eye, frame size in metres; up = +Z) under that name.
"""
from pathlib import Path
import json, os
import bpy
from mathutils import Matrix, Vector

HERE = Path(bpy.data.filepath).resolve().parent
tex = next(n for n in bpy.data.materials['skin'].node_tree.nodes if n.type == 'TEX_IMAGE')
tex.image = bpy.data.images.load(str(HERE/os.environ['DIAG_TEX']))
cams = json.loads((HERE/os.environ.get('DIAG_DIR', 'views-fix')/'cameras.json').read_text(encoding='utf-8'))
looks = {}
if os.environ.get('DIAG_LOOK'):
    name, f, d, size = os.environ['DIAG_LOOK'].split(':')
    focus, back = Vector(map(float, f.split(','))), Vector(map(float, d.split(','))).normalized()
    right = (-back).cross(Vector((0, 0, 1))).normalized()
    up = right.cross(-back)
    eye = focus+back
    looks[name] = (Matrix(((right.x, up.x, back.x, eye.x), (right.y, up.y, back.y, eye.y),
                           (right.z, up.z, back.z, eye.z), (0, 0, 0, 1))), float(size))
scene = bpy.context.scene
scene.render.resolution_x = scene.render.resolution_y = 1024
scene.display.shading.light, scene.display.shading.color_type = 'FLAT', 'TEXTURE'
for name in os.environ['DIAG_VIEWS'].split(','):
    data = bpy.data.cameras.new(name)
    matrix, scale = looks.get(name) or (Matrix(cams['views'][name]['matrix_world']), cams['ortho_scale_m'])
    data.type, data.ortho_scale = 'ORTHO', scale
    data.clip_start, data.clip_end = .001, 10.
    cam = bpy.data.objects.new(name, data)
    scene.collection.objects.link(cam)
    cam.matrix_world = matrix
    scene.camera = cam
    scene.render.filepath = str(HERE/os.environ.get('DIAG_OUT', 'bake')/f"diag-{name}-{os.environ.get('DIAG_TAG', 'x')}.png")
    bpy.ops.render.render(write_still=True)
print('DIAG VIEW DONE')
