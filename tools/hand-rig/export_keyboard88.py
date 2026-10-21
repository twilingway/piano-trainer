"""Export the actual atlas keyboard, rest keys and eight case parts, without saving the blend.

Background CPU Blender only; the source must be a copy inside this worktree's .scratch:
  blender --factory-startup -b -t 2 --python tools/hand-rig/export_keyboard88.py -- \
    --source .scratch/atlas.blend --output public/models/keyboard88.glb

Cycles bakes the source ivory color and black procedural bump. Constant shader colors become
exact 1x1 maps. Evaluated bevel geometry, smooth normals, roughness and clearcoat are retained.
The two key primitives are top then body. UV0 addresses baked maps; UV1 paints the key tops.
Canonical JSON, ordered arrays and timestamp-free RGB8 PNGs make repeated exports byte-identical.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True
from keyboard88_gltf import Glb, png_rgb, solid_png

ROOT = Path(__file__).resolve().parents[2]
CASE = ["slip.001", "board.001", "felt.001", "table.001", "cheek-left", "cheek-right", "panel-left", "panel-right"]


def xyz(value):
    return (value[0], value[2], -value[1])


def image_png(image):
    # Cycles' byte-backed image exposes encoded sRGB pixels for EMIT, raw pixels for NORMAL.
    # Copy those bytes directly; converting to sRGB again would brighten the ivory twice.
    width, height = image.size
    pixels = list(image.pixels)
    result = bytearray()
    for y in reversed(range(height)):
        for x in range(width):
            start = (y * width + x) * 4
            result.extend(round(max(0, min(1, v)) * 255) for v in pixels[start:start + 3])
    return png_rgb(width, height, bytes(result))


def bake(obj, kind, size):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    image = bpy.data.images.new(f"keyboard88-{obj.data.name}-{kind}", width=size, height=size, alpha=False, float_buffer=False)
    image.colorspace_settings.name = "sRGB" if kind == "EMIT" else "Non-Color"
    material = obj.data.materials[0]
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    output = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")
    target = nodes.new("ShaderNodeTexImage")
    target.image = image
    nodes.active = target
    emission = None
    if kind == "EMIT":
        emission = nodes.new("ShaderNodeEmission")
        source = shader.inputs["Base Color"]
        if source.is_linked:
            links.new(source.links[0].from_socket, emission.inputs["Color"])
        else:
            emission.inputs["Color"].default_value = source.default_value
        links.new(emission.outputs[0], output.inputs["Surface"])
    bpy.ops.object.bake(type=kind)
    result = image_png(image)
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    if emission:
        nodes.remove(emission)
    nodes.remove(target)
    bpy.data.images.remove(image)
    return result


def prepare_mesh(obj):
    bpy.ops.object.select_all(action="DESELECT")
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(evaluated)
    obj.modifiers.clear()
    linear = obj.matrix_world.to_3x3().to_4x4()
    mesh.transform(linear)
    edit_mesh = bmesh.new()
    edit_mesh.from_mesh(mesh)
    bmesh.ops.triangulate(edit_mesh, faces=[face for face in edit_mesh.faces if len(face.verts) > 4])
    edit_mesh.to_mesh(mesh)
    edit_mesh.free()
    obj.data = mesh
    obj.rotation_euler = (0, 0, 0)
    obj.scale = (1, 1, 1)
    mesh.materials[0] = mesh.materials[0].copy()
    obj.hide_viewport = obj.hide_render = False
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.025)
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh.update()
    mesh.calc_loop_triangles()
    mesh.calc_tangents(uvmap=mesh.uv_layers.active.name)
    return mesh


def geometry(mesh, key, black):
    roles = ["top", "body"] if key else ["case"]
    groups = {role: ([], [], {}) for role in roles}
    minimum = [min(v.co[i] for v in mesh.vertices) for i in range(3)]
    maximum = [max(v.co[i] for v in mesh.vertices) for i in range(3)]
    uv = mesh.uv_layers.active.data
    for triangle in mesh.loop_triangles:
        polygon = mesh.polygons[triangle.polygon_index]
        top = polygon.normal.z > 0.1 and polygon.center.z > (0.008 if black else -0.0036)
        role = ("top" if top else "body") if key else "case"
        vertices, indices, lookup = groups[role]
        for loop_id in triangle.loops:
            loop = mesh.loops[loop_id]
            position = mesh.vertices[loop.vertex_index].co
            paint = ((position.x - minimum[0]) / (maximum[0] - minimum[0]),
                     (position.y - minimum[1]) / (maximum[1] - minimum[1]))
            row = (*xyz(position), *xyz(mesh.corner_normals[loop_id].vector), *xyz(loop.tangent),
                   -loop.bitangent_sign, uv[loop_id].uv.x, 1 - uv[loop_id].uv.y, *paint)
            if row not in lookup:
                lookup[row] = len(vertices)
                vertices.append(row)
            indices.append(lookup[row])
    return [(role, vertices, indices) for role, (vertices, indices, _) in groups.items()]


def run(args):
    source = Path(args.source).resolve()
    if not source.is_relative_to(ROOT / ".scratch") or source.suffix != ".blend":
        raise ValueError("Source must be a .blend copy in this worktree's .scratch; labs are read-only")
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    names = [f"key-{m}" for m in range(21, 109)] + CASE
    if any(name not in bpy.data.objects for name in names):
        raise ValueError("Missing keyboard88 source objects")
    for obj in list(bpy.data.objects):
        if obj.name not in names:
            bpy.data.objects.remove(obj, do_unlink=True)
    for name in names:
        obj = bpy.data.objects[name]
        obj.animation_data_clear()
        if name.startswith("key-"):
            obj.location.z = 0.74
            if any(abs(value - 1) > 1e-6 for value in obj.scale):
                raise ValueError("Keys must have unit source scale")
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    scene.render.bake.margin = 8
    scene.render.bake.use_clear = True
    bpy.context.view_layer.update()
    glb, meshes, constants, rows, maps = Glb(), {}, {}, [], []
    bake_dir = ROOT / ".scratch/keyboard88-bake"
    bake_dir.mkdir(parents=True, exist_ok=True)

    def texture(name, data):
        (bake_dir / f"{name}.png").write_bytes(data)
        maps.append({"name": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        return glb.texture(name, data)

    for name in names:
        obj = bpy.data.objects[name]
        key = name.startswith("key-")
        midi = int(name[4:]) if key else None
        black = key and midi % 12 in (1, 3, 6, 8, 10)
        origin = tuple(obj.matrix_world.translation)
        shape = obj.data.name
        cache = (shape, tuple(round(v, 9) for row in obj.matrix_world.to_3x3() for v in row))
        if cache not in meshes:
            mesh = prepare_mesh(obj)
            material = mesh.materials[0]
            shader = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
            roughness = float(shader.inputs["Roughness"].default_value)
            coat = float(shader.inputs["Coat Weight"].default_value)
            normal = texture("black-normal", bake(obj, "NORMAL", args.resolution)) if black else None
            if shader.inputs["Base Color"].is_linked:
                color = texture(shape + "-albedo", bake(obj, "EMIT", args.resolution))
            else:
                family = material.name.split(".")[0]
                if family not in constants:
                    constants[family] = texture(family + "-albedo", solid_png(shader.inputs["Base Color"].default_value))
                color = constants[family]
            groups = []
            for role, vertices, indices in geometry(mesh, key, black):
                suffix = "black" if black else "white"
                mat_name = f"keyboard-{role}-{suffix}-{shape}" if key else f"keyboard-case-{shape}"
                mat_id = glb.material(mat_name, role, color, roughness, coat, normal, black)
                groups.append((role, mat_id, vertices, indices))
            meshes[cache] = glb.mesh(shape, groups)
        extras = {"role": "key" if key else "case", "sourceObject": name}
        if key:
            extras.update({"midi": midi, "keyColor": "black" if black else "white", "dipM": 0.008,
                           "restTopM": 0.752 if black else 0.74})
        glb.node(name, meshes[cache], xyz(origin), extras)
        rows.append({"name": name, "mesh": meshes[cache], "originM": xyz(origin), "midi": midi})
        print("KEYBOARD88_OBJECT", name, flush=True)
    output = Path(args.output).resolve()
    glb.write(output)
    report = {"sourceCopy": str(source.relative_to(ROOT)), "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
              "output": str(output.relative_to(ROOT)), "bytes": output.stat().st_size,
              "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "keys": 88, "caseObjects": CASE,
              "uniqueMeshes": len(meshes), "maps": maps, "nodes": rows,
              "vertices": sum(a["count"] for a in glb.data["accessors"] if a["type"] == "VEC3") // 2,
              "triangles": sum(a["count"] for a in glb.data["accessors"] if a["type"] == "SCALAR") // 3}
    Path(args.report).write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print("KEYBOARD88_DONE", report["bytes"], report["sha256"], flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=str(ROOT / ".scratch/atlas.blend"))
    parser.add_argument("--output", default=str(ROOT / "public/models/keyboard88.glb"))
    parser.add_argument("--report", default=str(ROOT / ".scratch/keyboard88-export.json"))
    parser.add_argument("--resolution", type=int, default=512)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []))
