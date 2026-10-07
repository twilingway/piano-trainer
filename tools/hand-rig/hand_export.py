"""Export the live hand for three.js: rig, skinned skin and nails, skin maps as WebP.

Run in Blender after studio_rig.py and hand_skin.py:
    exec(open(r"<repo>/tools/hand-rig/hand_export.py").read())
Writes public/models/hand.glb. Bones keep Blender's bone axes, so a pose's matrix_basis
(tools/hand-rig/poses/*.json) applies in three as bone.quaternion = rest × basis.
"""

import os

import bpy

REPO = os.environ.get("PIANO_TRAINER", r"E:/MySource/ReactJS/piano-trainer")
OUT = os.path.join(REPO, "public", "models", "hand.glb")

rig = bpy.data.objects["HandRig"]
parts = [rig, bpy.data.objects["HandMesh"], bpy.data.objects["HandNails"]]

if bpy.context.object and bpy.context.object.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT")
for part in parts:
    # A rerun of hand_skin.py can leave the nails out of every collection.
    if not part.users_collection:
        rig.users_collection[0].objects.link(part)
    part.hide_set(False)
    part.select_set(True)
bpy.context.view_layer.objects.active = rig

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_skins=True,
    export_def_bones=True,
    export_animations=False,
    export_morph=False,
    export_image_format="WEBP",
    export_image_quality=85,
    export_vertex_color="MATERIAL",
    export_yup=True,
)
print("hand.glb", os.path.getsize(OUT) // 1024, "KB")
