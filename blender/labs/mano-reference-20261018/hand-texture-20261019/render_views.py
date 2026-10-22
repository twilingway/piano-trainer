"""Five orthographic views of flat-hand.obj (or flat-arm.obj with env HAND_PIECE=arm) (Blender --background --factory-startup).

Source coordinates are kept (the OBJ is read by hand, no axis conversion): +Y up, +Z body
front, fingers toward -X. Views: dorsal (from +Y), palmar (from -Y), thumb side (from +Z),
little-finger side (from -Z), fingertips (from -X). One ortho scale for all views, so the
pixel size in mm is the same everywhere. Per view: views/<name>.png (clay, white background),
views/<name>-mask.png (alpha silhouette) and views/cameras.json (for projecting textures back).
"""
from pathlib import Path
import json, math, os
import bpy
from mathutils import Vector, Matrix

HERE = Path(__file__).resolve().parent
NAME = {'hand': 'flat-hand', 'arm': 'flat-arm'}[os.environ.get('HAND_PIECE', 'hand')]
OUT = HERE/('views' if NAME == 'flat-hand' else 'views-arm')
if os.environ.get('HAND_POSE') == 'spread':  # spread fingers, oblique cameras (export_flat_hand.py)
    NAME, OUT = 'spread-hand', HERE/'views-spread'
OUT.mkdir(exist_ok=True)
SIZE = 1024

for obj in list(bpy.data.objects):  # the factory startup cube, light and camera
    bpy.data.objects.remove(obj)
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
hand = bpy.data.objects.new('flat-hand', mesh)
bpy.context.scene.collection.objects.link(hand)
sub = hand.modifiers.new('Subdivision', 'SUBSURF')
sub.levels = sub.render_levels = 2

lo = Vector(tuple(min(v[i] for v in verts) for i in range(3)))
hi = Vector(tuple(max(v[i] for v in verts) for i in range(3)))
center = (lo+hi)/2
extent = max(hi-lo)
ortho = extent*1.08

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
shading = scene.display.shading
shading.light = 'STUDIO'
shading.color_type = 'SINGLE'
shading.single_color = (0.78, 0.66, 0.58)
shading.show_cavity = True
if scene.world is None:
    scene.world = bpy.data.worlds.new('World')
scene.world.color = (1., 1., 1.)
try:
    scene.view_settings.view_transform = 'Standard'
except TypeError:
    pass

VIEWS = {  # name: (direction from center toward the eye, camera up)
    'dorsal': (Vector((0, 1, 0)), Vector((0, 0, 1))),
    'palmar': (Vector((0, -1, 0)), Vector((0, 0, 1))),
    'thumb-side': (Vector((0, 0, 1)), Vector((0, 1, 0))),
    'little-side': (Vector((0, 0, -1)), Vector((0, 1, 0))),
    'fingertips': (Vector((-1, 0, 0)), Vector((0, 1, 0))),
}
if NAME == 'spread-hand':  # 45° between back/palm and each side: the sides between fingers
    VIEWS = {
        'dorsal-thumb': (Vector((0, 1, 1)).normalized(), Vector((0, 0, 1))),
        'dorsal-little': (Vector((0, 1, -1)).normalized(), Vector((0, 0, 1))),
        'palmar-thumb': (Vector((0, -1, 1)).normalized(), Vector((0, 0, 1))),
        'palmar-little': (Vector((0, -1, -1)).normalized(), Vector((0, 0, 1))),
    }
cameras = {'ortho_scale_m': ortho, 'pixels': SIZE, 'mm_per_pixel': ortho*1000/SIZE, 'center': list(center), 'views': {}}
for name, (direction, up) in VIEWS.items():
    data = bpy.data.cameras.new(name)
    data.type = 'ORTHO'
    data.ortho_scale = ortho
    data.clip_start, data.clip_end = .001, 10.
    cam = bpy.data.objects.new(name, data)
    scene.collection.objects.link(cam)
    eye = center+direction*1.
    forward = (center-eye).normalized()
    right = forward.cross(up).normalized()
    true_up = right.cross(forward)
    cam.matrix_world = Matrix((
        (right.x, true_up.x, -forward.x, eye.x),
        (right.y, true_up.y, -forward.y, eye.y),
        (right.z, true_up.z, -forward.z, eye.z),
        (0, 0, 0, 1)))
    scene.camera = cam
    scene.render.film_transparent = False
    scene.render.filepath = str(OUT/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    scene.render.film_transparent = True
    shading.light, shading.show_cavity = 'FLAT', False
    shading.single_color = (1., 1., 1.)
    scene.render.filepath = str(OUT/f'{name}-mask.png')
    bpy.ops.render.render(write_still=True)
    shading.light, shading.show_cavity = 'STUDIO', True
    shading.single_color = (0.78, 0.66, 0.58)
    cameras['views'][name] = {'matrix_world': [list(r) for r in cam.matrix_world], 'eye_direction': list(direction),
                              'up': list(true_up)}
(OUT/'cameras.json').write_text(json.dumps(cameras, indent=1)+'\n', encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/f'{NAME}.blend'))
print('VIEWS DONE', round(cameras['mm_per_pixel'], 3), 'mm/px')
