"""Validate the curated teacher package without modifying its files."""
import ast
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[4]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate():
    publication = json.loads((ROOT / "publication-files.json").read_text(encoding="utf-8"))
    paths = publication["includeRepoRelativeFiles"]
    if len(paths) != len(set(paths)):
        raise AssertionError("Duplicate publication entry")
    allowed = {(REPO / path).resolve() for path in paths}
    for path in paths:
        if Path(path).is_absolute() or ".." in Path(path).parts or not (REPO / path).is_file():
            raise AssertionError("Unsafe or missing publication path: " + path)

    def reference(relative):
        path = (ROOT / relative).resolve()
        if Path(relative).is_absolute() or ".." in Path(relative).parts or path not in allowed:
            raise AssertionError("Reference outside curated set: " + relative)
        return path

    manifest = json.loads((ROOT / "manifest-v2.json").read_text(encoding="utf-8"))
    provenance = json.loads((ROOT / "provenance.json").read_text(encoding="utf-8"))
    master = provenance["referenceMaster"]
    if digest(reference(master["file"])) != master["sha256"]:
        raise AssertionError("Master SHA changed")
    for note in ["do", "re", "mi"]:
        pose = manifest["poses"][note]
        record = provenance[note]
        for key, sha_key in (("source", "sourceSha256"), ("png", "pngSha256"), ("webp", "webpSha256")):
            if digest(reference(pose[key])) != pose[sha_key]:
                raise AssertionError("Manifest SHA changed: " + note + "/" + key)
        reference(pose["frame"])
        if digest(reference(record["source"])) != record["sourceSha256"]:
            raise AssertionError("Provenance source SHA changed")
        if hashlib.sha256(record["prompt"].encode("utf-8")).hexdigest() != record["promptUtf8Sha256"]:
            raise AssertionError("Exact prompt changed")
        for path in record["references"]:
            if digest(reference(path)) != record["referenceSha256s"][path]:
                raise AssertionError("Prompt reference SHA changed")
    for path in provenance["referenceOnlyInputs"]:
        reference(path)
    reference(provenance["mechanicalNormalization"]["script"])
    shared = json.loads((ROOT.parent / "prompts.json").read_text(encoding="utf-8"))
    for key in ("provenance", "manifest", "publication"):
        relative = shared["teacherFinalV2"][key]
        target = (ROOT.parent / relative).resolve()
        if target not in allowed or Path(relative).is_absolute() or ".." in Path(relative).parts:
            raise AssertionError("Shared teacher prompt pointer escapes curated set")
    for path in ROOT.glob("*.py"):
        if path.resolve() in allowed:
            ast.parse(path.read_text(encoding="utf-8"), filename=path.name)
    for filename in ("manifest-v2.json", "provenance.json"):
        text = (ROOT / filename).read_text(encoding="utf-8")
        if ":\\" in text or "file://" in text:
            raise AssertionError("Absolute local path in public metadata")
    actual_bytes = sum(path.stat().st_size for path in allowed)
    if actual_bytes != publication["totalBytesIncludingSharedPrompts"]:
        raise AssertionError("Publication weight changed; refresh list after formatting")
    return {"status": "passed", "files": len(paths), "bytes": actual_bytes, "MiB": round(actual_bytes / 1048576, 2), "checks": ["curated reference closure", "source/output/reference SHA256", "exact UTF8 prompt SHA256", "Python syntax", "relative metadata paths", "publication weight"]}


if __name__ == "__main__":
    print(json.dumps(validate(), indent=2))
