"""Check the public keyboard88 performer against its frozen source provenance."""

import argparse
import hashlib
import json
import math
import struct
import subprocess
from pathlib import Path


def load(path):
    return json.loads(path.read_text("utf8"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all-frames", action="store_true")
    parser.add_argument("--output", default="public/models")
    parser.add_argument("--frozen", default=".scratch/performer-source")
    args = parser.parse_args()
    output, frozen = Path(args.output), Path(args.frozen)
    manifest_path = output / "keyboard88-performer.json"
    manifest = load(manifest_path)
    atlas = load(output / "keyboard88-atlas.json")
    assert manifest["version"] == atlas["version"] == 1
    assert manifest["frameCount"] == atlas["frameCount"] == 1215
    assert len(set(atlas["boneNames"])) == len(atlas["boneNames"]) == 52
    assert atlas["boneNames"] == manifest["boneNames"] == [bone["name"] for bone in atlas["bones"]]
    assert all(-1 <= bone["parent"] < index for index, bone in enumerate(atlas["bones"]))
    assert [frame["id"] for frame in atlas["frames"]] == list(range(308, 1523))
    for role, item in manifest["files"].items():
        data = (output / Path(item["url"]).name).read_bytes()
        assert len(data) == item["bytes"], role + " byte count"
        assert hashlib.sha256(data).hexdigest() == item["sha256"], role + " hash"
    pose = (output / "keyboard88-poses.bin").read_bytes()
    assert len(pose) == 1215 * 52 * 4 * 4
    values = struct.unpack("<" + "f" * (len(pose) // 4), pose)
    assert all(math.isfinite(value) for value in values)
    max_length_error = max(abs(sum(value * value for value in values[index:index + 4]) - 1)
                           for index in range(0, len(values), 4))
    assert max_length_error < 2e-6
    masks = manifest["masks"]
    assert masks["nails"] == []
    covered = masks["body"] + masks["rightHand"] + masks["leftHand"]
    assert len(covered) == len(set(covered)) == 13776 and set(covered) == set(range(13776))
    assert len(masks["rightHand"]) == len(masks["leftHand"]) == 1977
    assert manifest["leftSkin"] == "mirrored"
    symmetry = manifest["leftCorrespondence"]
    assert symmetry["vertices"] == 6890 and symmetry["faces"] == 13776
    assert symmetry["conflicts"] == 0 and symmetry["bijection"] and symmetry["involution"]
    glb = (output / "keyboard88-performer.glb").read_bytes()
    magic, version, size, json_size = struct.unpack_from("<4sIII", glb)
    assert magic == b"glTF" and version == 2 and size == len(glb)
    document = json.loads(glb[20:20 + json_size])
    assert len(document["meshes"]) == len(document["skins"]) == 1
    assert len(document["skins"][0]["joints"]) == 52
    assert [document["nodes"][index]["name"] for index in document["skins"][0]["joints"]] == atlas["boneNames"]
    assert not document.get("images") and not document.get("animations")
    assert all("nail" not in node["name"].lower() for node in document["nodes"])
    assert not any("targets" in primitive for mesh in document["meshes"] for primitive in mesh["primitives"])
    for primitive in document["meshes"][0]["primitives"]:
        role = primitive["extras"]["role"]
        assert primitive["extras"]["sourceFaceIds"] == masks[role]
        assert document["materials"][primitive["material"]]["extras"]["role"] == role
    total_metadata = len(pose) + (output / "keyboard88-atlas.json").stat().st_size + manifest_path.stat().st_size
    assert total_metadata <= 2 * 1024 * 1024 and len(glb) <= 15 * 1024 * 1024
    from PIL import Image
    source_image, decoded = Image.open(frozen / "albedo-4096.png").convert("RGB"), Image.open(output / "keyboard88-skin.webp").convert("RGB")
    assert source_image.size == decoded.size == (4096, 4096) and source_image.tobytes() == decoded.tobytes()
    if args.all_frames:
        from keyboard88_performer_frames import source_frames
        assert atlas["frames"] == source_frames(frozen)
        for item in load(frozen / "frozen-sources.json"):
            path = frozen.parent / item["copy"]
            data = path.read_bytes()
            assert len(data) == item["bytes"] and hashlib.sha256(data).hexdigest() == item["sha256"], str(path)
        runner = Path("src/checkTools/keyboard88Verify.ts")
        assert runner.exists(), "The all-frame three.js fingertip verifier is missing"
        subprocess.run(["node", "--experimental-strip-types", str(runner)], check=True)
    print("KEYBOARD88_VERIFIED", json.dumps({"frames": 1215, "bones": 52, "baseVertices": 6890,
          "sourceFaces": 13776, "nailMeshes": 0, "quaternionLengthError": max_length_error,
          "poseAndMetadataBytes": total_metadata, "decodedTextureEqual": True, "allFrames": args.all_frames}))


if __name__ == "__main__":
    main()
