"""Freeze mutable read-only lab metadata next to an existing atlas scene snapshot.

This deliberately never refreshes atlas.blend: another job may be writing the lab.
Each copied source is checked for size/mtime stability around its read.
"""

import argparse
import hashlib
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lab", default="E:/MySource/ReactJS/piano-trainer/blender/labs/mano-reference-20261018")
    parser.add_argument("--snapshot", default=".scratch/atlas.blend")
    parser.add_argument("--output", default=".scratch/performer-source")
    args = parser.parse_args()
    lab, snapshot, output = Path(args.lab), Path(args.snapshot), Path(args.output)
    assert "labs" not in output.resolve().parts, "The lab is read-only"
    atlas, skin = lab / "black-key-atlas-20261018/keyboard88-20261019", lab / "hand-texture-20261019"
    pairs = [(atlas / "frame-index.json", "frame-index.json"),
             (atlas / "smplh-black-key-atlas.json", "c4-poses.json"),
             (skin / "arm-uv.json", "arm-uv.json"),
             (skin / "bake/albedo-4096.png", "albedo-4096.png"),
             (skin / "README-RU.md", "README-RU.md")]
    pairs += [(path, "audit/" + path.name) for path in sorted((atlas / "audit").glob("frame-*.json"))]
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for path, name in pairs:
        before = path.stat()
        data = path.read_bytes()
        after = path.stat()
        assert (before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns), str(path)
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        records.append({"source": path.as_posix(), "copy": "performer-source/" + name,
                        "bytes": len(data), "mtimeNs": before.st_mtime_ns,
                        "sha256": hashlib.sha256(data).hexdigest()})
    records.insert(0, {"source": "existing .scratch/atlas.blend snapshot; not refreshed", "copy": "atlas.blend",
                       "bytes": snapshot.stat().st_size, "mtimeNs": snapshot.stat().st_mtime_ns,
                       "sha256": hashlib.sha256(snapshot.read_bytes()).hexdigest()})
    (output / "frozen-sources.json").write_text(json.dumps(records, indent=2), "utf8")
    print("FROZEN", len(records), "files", sum(record["bytes"] for record in records), "bytes")


if __name__ == "__main__":
    main()
