"""Close-ups of the textured hand for Codex touch-ups (Blender -b hand-textured.blend).

Flat light, so the picture is the current albedo; 6 cm frame, 1024 px. Output in views-fix/:
fix-thumb-nail.png, fix-thumb-nail-mask.png (silhouette) and cameras.json in the same format
as views/, so bake_views.py can project the edited picture back.
Env FIX_SET=targets: the spot close-ups of fix-targets.json; FIX_SET=seams: the wide seam views
of seam-targets.json (seam_targets.py), 13 cm frame, into views-seam/.
"""
from pathlib import Path
import json, os
import bpy
from mathutils import Matrix, Vector

HERE = Path(bpy.data.filepath).resolve().parent
SEAMS = os.environ.get('FIX_SET') == 'seams'
OUT = HERE/('views-seam' if SEAMS else 'views-fix')
OUT.mkdir(exist_ok=True)
SCALE = .13 if SEAMS else .06  # one frame size per set: cameras.json holds a single ortho scale

hand = bpy.data.objects['flat-hand']
verts = [hand.matrix_world @ v.co for v in hand.data.vertices]
if os.environ.get('FIX_SET') in ('targets', 'seams'):
    targets = json.loads((HERE/f"{'seam' if SEAMS else 'fix'}-targets.json").read_text(encoding='utf-8'))
    shots = {name: (Vector(t['focus']), Vector(t['direction']), Vector((0, 0, 1)))
             for name, t in targets.items()}
else:
    lo = Vector([min(v[i] for v in verts) for i in range(3)])
    hi = Vector([max(v[i] for v in verts) for i in range(3)])
    center = (lo+hi)/2
    tip = max(verts, key=lambda v: v.z)
    shots = {'fix-thumb-nail': (tip+(center-tip).normalized()*.015,
                                Vector((-.2, .7, .7)).normalized(), Vector((0, 1, 0)))}

scene = bpy.context.scene
scene.render.resolution_x = scene.render.resolution_y = 1024
shading = scene.display.shading
path = OUT/'cameras.json'
cams = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {
    'ortho_scale_m': SCALE, 'pixels': 1024, 'mm_per_pixel': SCALE*1000/1024, 'views': {}}
for name, (focus, direction, up) in shots.items():
    direction = direction.normalized()
    eye = focus+direction
    forward = -direction
    right = forward.cross(up).normalized()
    true_up = right.cross(forward)
    matrix = Matrix(((right.x, true_up.x, -forward.x, eye.x),
                     (right.y, true_up.y, -forward.y, eye.y),
                     (right.z, true_up.z, -forward.z, eye.z),
                     (0, 0, 0, 1)))
    data = bpy.data.cameras.new(name)
    data.type, data.ortho_scale = 'ORTHO', SCALE
    data.clip_start, data.clip_end = .001, 10.
    cam = bpy.data.objects.new(name, data)
    scene.collection.objects.link(cam)
    cam.matrix_world = matrix
    scene.camera = cam
    shading.light, shading.color_type = 'FLAT', 'TEXTURE'
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.filepath = str(OUT/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    scene.render.film_transparent = True
    shading.color_type, shading.single_color = 'SINGLE', (1., 1., 1.)
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = str(OUT/f'{name}-mask.png')
    bpy.ops.render.render(write_still=True)
    cams['views'][name] = {'matrix_world': [list(r) for r in matrix],
                           'eye_direction': list(direction), 'up': list(true_up)}
path.write_text(json.dumps(cams, indent=1)+'\n', encoding='utf-8')
print('FIX VIEW DONE', list(shots))
