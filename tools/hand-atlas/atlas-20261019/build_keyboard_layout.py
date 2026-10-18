"""Build a public keyboard-only scene from our own layout JSON."""
from pathlib import Path
import sys,json,bpy
from mathutils import Matrix,Quaternion,Vector
folder=Path(sys.argv[sys.argv.index('--')+1])
data=json.loads((folder/'keyboard-layout.json').read_text(encoding='utf-8'))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.name='Piano Atlas Keyboard Layout'
scene.unit_settings.system='METRIC';scene.render.engine='BLENDER_WORKBENCH'
for key in data['keys']:
    mesh=bpy.data.meshes.new(key['name']);mesh.from_pydata(key['vertices_local'],[],key['faces']);mesh.update()
    obj=bpy.data.objects.new(key['name'],mesh);scene.collection.objects.link(obj)
    obj.matrix_world=Matrix(key['matrix_world_rest']);obj['midi']=key['midi']
    material=bpy.data.materials.new(key['name']+' material');material.diffuse_color=key['color'];mesh.materials.append(material)
    for original in key['bevel']:
        modifier=obj.modifiers.new('Key bevel','BEVEL');modifier.width=original['width_m'];modifier.segments=original['segments'];modifier.affect=original['affect']
    rest=obj.location.z
    obj.location.z=rest;obj.keyframe_insert(data_path='location',index=2,frame=1)
    obj.location.z=rest-data['key_down_m'];obj.keyframe_insert(data_path='location',index=2,frame=2)
scene.frame_start=1;scene.frame_end=2;scene.frame_set(1)
scene['description']='Own keyboard layout only. Hand model is separately obtained and is not embedded.'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_location=Vector((.445,.345,.75))
            area.spaces.active.region_3d.view_distance=.65
            area.spaces.active.region_3d.view_rotation=Quaternion((1,0,0,0))
            area.spaces.active.region_3d.view_perspective='ORTHO'
assert len(bpy.data.objects)==61 and all(o.name.startswith('key-') for o in bpy.data.objects)
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'keyboard-layout.blend'))
print('Saved keyboard-only scene with 61 keys, frames 1 rest / 2 down. No hand or external libraries.')
