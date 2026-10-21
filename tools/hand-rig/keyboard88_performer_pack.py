"""Encode only the frozen albedo; add its deterministic verified descriptor."""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, __version__ as pillow_version


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=".scratch/performer-source/albedo-4096.png")
    parser.add_argument("--output", default="public/models")
    args = parser.parse_args()
    output = Path(args.output)
    source = Image.open(args.source).convert("RGB")
    target = output / "keyboard88-skin.webp"
    source.save(target, "WEBP", lossless=True, method=4, exact=True)
    decoded = Image.open(target).convert("RGB")
    assert source.size == decoded.size == (4096, 4096)
    assert source.tobytes() == decoded.tobytes(), "Lossless skin pixel mismatch"
    manifest_path = output / "keyboard88-performer.json"
    manifest = json.loads(manifest_path.read_text("utf8"))
    # Relative filenames also support deployments below a non-root BASE_URL.
    for item in manifest["files"].values():
        item["url"] = Path(item["url"]).name
    index_path = output / "keyboard88-atlas.json"
    index = json.loads(index_path.read_text("utf8"))
    index["rotations"]["url"] = Path(index["rotations"]["url"]).name
    index_path.write_text(json.dumps(index, sort_keys=True, separators=(",", ":"), allow_nan=False), "utf8")
    index_raw = index_path.read_bytes()
    manifest["files"]["index"] = {"url": index_path.name, "bytes": len(index_raw),
                                    "sha256": hashlib.sha256(index_raw).hexdigest()}
    raw = target.read_bytes()
    manifest["files"]["skin"] = {"url": target.name, "bytes": len(raw),
                                  "sha256": hashlib.sha256(raw).hexdigest()}
    manifest["texture"] = {"width": 4096, "height": 4096, "colorSpace": "sRGB", "flipY": False,
                           "lossless": True, "decodedPixelsEqual": True,
                           "encoder": "Pillow " + pillow_version + "; WebP lossless method=4 exact=True"}
    manifest_path.write_text(json.dumps(manifest, sort_keys=True, separators=(",", ":"), allow_nan=False), "utf8")
    total = sum(manifest["files"][role]["bytes"] for role in ("index", "rotations")) + manifest_path.stat().st_size
    assert total <= 2 * 1024 * 1024, "All pose/index/manifest metadata exceeds 2 MiB"
    print("SKIN_PACKED", json.dumps(manifest["files"]["skin"]), "POSE_METADATA_BYTES", total)


if __name__ == "__main__":
    main()
