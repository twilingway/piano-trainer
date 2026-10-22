"""Export the frozen keyboard88 armature and base SMPL-H skin, never the live lab.

Blender --factory-startup --disable-autoexec -b -t 2 --python this.py -- --source .scratch/atlas.blend
Requires frozen index/C4/audit/UV/albedo/source provenance in .scratch/performer-source.
The separate pack script writes lossless WebP and verifies its decoded pixels.
"""

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))
from keyboard88_performer_gltf import PerformerGlb
from keyboard88_performer_frames import source_frames
from keyboard88_performer_topology import mirrored_topology

CONVERT = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))


def compact(path, value):
    path.write_text(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False), "utf8")


def descriptor(path):
    raw = path.read_bytes()
    return {"url": path.name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def transform(matrix):
    translation, rotation, scale = matrix.decompose()
    return {"translation": list(translation), "rotation": [rotation.x, rotation.y, rotation.z, rotation.w],
            "scale": list(scale)}


def geometry(body, rig, bones, source, glb):
    mesh = body.data
    coordinates = [vertex.co.copy() for vertex in mesh.shape_keys.key_blocks["Basis"].data]
    assert len(coordinates) == 6890 and len(mesh.polygons) == 13776
    right_uv = {int(key): value for key, value in json.loads((source / "arm-uv.json").read_text("utf8"))["faces"].items()}
    vertex_map, face_map, symmetry = mirrored_topology(mesh, coordinates, right_uv)
    left_uv = {}
    for face, uv in right_uv.items():
        target = face_map[face]
        mapped = {vertex_map[vertex]: corner for vertex, corner in zip(mesh.polygons[face].vertices, uv)}
        left_uv[target] = [mapped[vertex] for vertex in mesh.polygons[target].vertices]
    assert not set(right_uv).intersection(left_uv)
    names = {bone.name: index for index, bone in enumerate(bones)}
    groups = {group.index: names[group.name] for group in body.vertex_groups if group.name in names}
    weights = []
    discarded = []
    for vertex in mesh.vertices:
        influences = sorted(((groups[g.group], g.weight) for g in vertex.groups
                             if g.group in groups and g.weight > 0), key=lambda item: (-item[1], item[0]))
        retained = influences[:4]
        total = sum(value for _, value in retained)
        assert total > 0
        discarded.append(sum(value for _, value in influences[4:]))
        retained += [(0, 0)] * (4 - len(retained))
        weights.append(([index for index, _ in retained], [value / total for _, value in retained]))
    normals = [vertex.normal for vertex in mesh.vertices]
    # Each role has its own primitive so hands/body visibility never hides another role.
    masks = {"body": [], "rightHand": sorted(right_uv), "leftHand": sorted(left_uv), "nails": []}
    masks["body"] = sorted(set(range(len(mesh.polygons))) - set(right_uv) - set(left_uv))
    primitives = []
    for role in ("body", "rightHand", "leftHand"):
        vertices, indices, lookup = [], [], {}
        uv_map = right_uv if role == "rightHand" else left_uv if role == "leftHand" else {}
        for face_id in masks[role]:
            face = mesh.polygons[face_id]
            for corner, vertex_id in enumerate(face.vertices):
                uv = uv_map.get(face_id, ((0, 0),) * 3)[corner]
                key = (vertex_id, *uv)
                if key not in lookup:
                    lookup[key] = len(vertices)
                    joints, values = weights[vertex_id]
                    vertices.append([*coordinates[vertex_id], *normals[vertex_id], uv[0], 1 - uv[1], *joints, *values])
                indices.append(lookup[key])
        primitives.append(glb.primitive(role, vertices, indices, masks[role]))
    glb.data["meshes"] = [{"name": "SMPLH Pilot Skin", "primitives": primitives,
                            "extras": {"sourceVertexCount": 6890, "sourceFaceCount": 13776, "nails": []}}]
    return masks, symmetry, {"maxDiscardedWeight": max(discarded),
                              "meanDiscardedWeight": sum(discarded) / len(discarded),
                              "policy": "four largest normalized SMPL-H influences per source vertex"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=".scratch/atlas.blend")
    parser.add_argument("--frozen", default=".scratch/performer-source")
    parser.add_argument("--output", default="public/models")
    parser.add_argument("--references", default=".scratch/keyboard88-blender-reference.json")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    source_path, frozen, output = Path(args.source).resolve(), Path(args.frozen).resolve(), Path(args.output).resolve()
    assert "labs" not in source_path.parts and source_path.name == "atlas.blend", "Use the frozen scratch scene"
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    sources = json.loads((frozen / "frozen-sources.json").read_text("utf8"))
    assert source_hash == sources[0]["sha256"], "Scene differs from frozen provenance"
    bpy.ops.wm.open_mainfile(filepath=str(source_path), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    scene.cycles.device = "CPU"
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 2
    rig, body = scene.objects["SMPLH Pilot Rig"], scene.objects["SMPLH Pilot Skin"]
    assert max(abs(rig.matrix_world[i][j] - body.matrix_world[i][j]) for i in range(4) for j in range(4)) < 1e-7
    bones = list(rig.data.bones)
    assert len(bones) == 52
    order = {bone.name: index for index, bone in enumerate(bones)}
    rest = []
    glb = PerformerGlb()
    root = transform(CONVERT @ rig.matrix_world)
    glb.data["nodes"].append({"name": "keyboard88-performer", **root, "children": [1, 53]})
    for bone in bones:
        local = bone.parent.matrix_local.inverted() @ bone.matrix_local if bone.parent else bone.matrix_local
        record = {"name": bone.name, "parent": order[bone.parent.name] if bone.parent else -1,
                  **transform(local), "tail": [0, bone.length, 0]}
        rest.append(record)
        children = [order[child.name] + 1 for child in bone.children]
        glb.data["nodes"].append({"name": bone.name, **transform(local), "children": children,
                                  "extras": {"boneIndex": order[bone.name]}})
    masks, symmetry, weight_info = geometry(body, rig, bones, frozen, glb)
    glb.data["nodes"].append({"name": "SMPLH Pilot Skin", "mesh": 0, "skin": 0,
                              "extras": {"roles": ["body", "rightHand", "leftHand"], "nails": []}})
    matrices = [[value for column in bone.matrix_local.inverted().transposed() for value in column] for bone in bones]
    glb.data["skins"] = [{"name": "SMPLH52", "inverseBindMatrices": glb.accessor(matrices, 16, matrix=True),
                          "joints": list(range(1, 53)), "skeleton": 1}]
    output.mkdir(parents=True, exist_ok=True)
    glb_path = output / "keyboard88-performer.glb"
    glb.write(glb_path)
    frames = source_frames(frozen)
    # Disable surface work: this export samples armature transforms, not evaluated skin/GN.
    for obj in scene.objects:
        if obj.type == "MESH":
            for modifier in obj.modifiers:
                modifier.show_viewport = False
    rotations, references = [], []
    max_translation_drift = max_scale_drift = max_root_drift = 0.0
    previous = None
    anchors = [order["m_avg_r" + finger + "2"] for finger in ("thumb", "index", "middle", "ring", "pinky")]
    fixed_world = rig.matrix_world.copy()
    for frame in frames:
        scene.frame_set(frame["id"])
        values = []
        for index, bone in enumerate(bones):
            pose = rig.pose.bones[bone.name]
            local = pose.parent.matrix.inverted() @ pose.matrix if pose.parent else pose.matrix
            translation, rotation, scale = local.decompose()
            rotation.normalize()
            quaternion = [rotation.x, rotation.y, rotation.z, rotation.w]
            if previous and sum(a * b for a, b in zip(quaternion, previous[index])) < 0:
                quaternion = [-value for value in quaternion]
            values.append(quaternion)
            max_translation_drift = max(max_translation_drift, max(abs(translation[i] - rest[index]["translation"][i]) for i in range(3)))
            max_scale_drift = max(max_scale_drift, max(abs(scale[i] - rest[index]["scale"][i]) for i in range(3)))
        max_root_drift = max(max_root_drift, max(abs(rig.matrix_world[i][j] - fixed_world[i][j]) for i in range(4) for j in range(4)))
        rotations.extend(component for quaternion in values for component in quaternion)
        previous = values
        references.append({"id": frame["id"], "tails": [list(CONVERT @ rig.matrix_world @ rig.pose.bones[bones[i].name].tail) for i in anchors]})
        if (frame["id"] - 307) % 243 == 0:
            print("EXPORTED_FRAMES", frame["id"] - 307, flush=True)
    assert max_translation_drift < 1e-5 and max_scale_drift < 1e-5 and max_root_drift == 0
    pose_path = output / "keyboard88-poses.bin"
    pose_path.write_bytes(struct.pack("<" + "f" * len(rotations), *rotations))
    pose_descriptor = {**descriptor(pose_path), "encoding": "float32-le", "order": "frame,bone,xyzw"}
    atlas = {"version": 1, "frameCount": len(frames), "boneCount": 52, "boneNames": [bone.name for bone in bones],
             "bones": rest, "root": root, "frames": frames, "rotations": pose_descriptor,
             "sourceSceneSha256": source_hash}
    index_path = output / "keyboard88-atlas.json"
    compact(index_path, atlas)
    compact(Path(args.references), {"version": 1, "units": "metres", "axes": "glTF Y-up absolute atlas world",
                                    "anchors": anchors, "frames": references, "bones": rest, "root": root})
    fixture = Path(__file__).resolve().parent / "fixtures" / "keyboard88-bone-tips.bin"
    fixture.parent.mkdir(parents=True, exist_ok=True)
    tips = [value for frame in references for point in frame["tails"] for value in point]
    fixture.write_bytes(struct.pack("<" + "f" * len(tips), *tips))
    frozen_audits = [entry for entry in sources if "/audit/" in entry["copy"]]
    audit_digest = hashlib.sha256("\n".join(entry["copy"] + ":" + entry["sha256"] for entry in frozen_audits).encode()).hexdigest()
    manifest = {"version": 1, "frameCount": len(frames), "boneNames": atlas["boneNames"],
                "files": {"body": descriptor(glb_path), "index": descriptor(index_path), "rotations": pose_descriptor},
                "masks": masks, "sourceSceneSha256": source_hash,
                "sourceFiles": [entry for entry in sources if "/audit/" not in entry["copy"]],
                "auditSnapshot": {"files": len(frozen_audits), "sha256": audit_digest},
                "leftSkin": "mirrored", "leftCorrespondence": symmetry, "skinWeights": weight_info,
                "rigValidation": {"maxLocalTranslationDriftM": max_translation_drift,
                                  "maxLocalScaleDrift": max_scale_drift, "maxRootDrift": max_root_drift},
                "excluded": ["Pilot nail 1-5", "corrective shapes", "subdivision", "GN PAD/SIDE", "local-models"]}
    # Stable provenance uses source SHA/size/mtime only; no export clock or workstation-specific output path.
    compact(output / "keyboard88-performer.json", manifest)
    assert pose_path.stat().st_size + index_path.stat().st_size <= 2 * 1024 * 1024
    assert glb_path.stat().st_size <= 15 * 1024 * 1024
    print("PERFORMER_EXPORTED", json.dumps({"body": descriptor(glb_path), "index": descriptor(index_path),
          "poses": pose_descriptor, "leftSkin": symmetry, "weights": weight_info}), flush=True)


if __name__ == "__main__":
    main()
