"""Refresh the explicit publication inventory; never removes local drafts."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[4]

FILES = [
    "README.md", "manifest-v2.json", "provenance.json", "publication-files.json",
    "normalize_teacher.py", "inspect_teacher.py", "validate_publication.py", "refresh_publication.py",
    "sources/teacher-do-insert-source.png", "sources/teacher-do-hand-insert.png",
    "sources/teacher-edit-master.png", "sources/teacher-mi-clean-source.png",
    "sources/teacher-mi-geometry-reference.png", "sources/teacher-mi-style-reference.png",
    "sources/teacher-re-extracted-source.png", "sources/teacher-re-extraction-input.png",
    "do-press-v2.png", "do-press-v2.webp", "re-press-v2.png", "re-press-v2.webp", "mi-press-v2.png", "mi-press-v2.webp",
    "sheets/do-press-frame.webp", "sheets/re-press-frame.webp", "sheets/mi-press-frame.webp", "sheets/teacher-cde.webp",
    "previews/teacher-cde.png", "previews/teacher-cde.webp",
    "qa/normalization-report.json", "qa/animation-report.json",
    "qa/teacher-cde-dark.jpg", "qa/teacher-cde-light.jpg",
    "qa/normalized-v2/do-press-v2-contact-light.png", "qa/normalized-v2/re-press-v2-contact-light.png", "qa/normalized-v2/mi-press-v2-contact-light.png",
]


def reason(path):
    if "__pycache__" in path:
        return "Python bytecode cache"
    if path == "local-prompt-history.json":
        return "Local historical teacher prompt archive; final exact prompts are in provenance.json"
    if path.startswith("sources/teacher-re-insert") or path == "sources/teacher-re-hand-insert.png":
        return "Rejected D insertion experiment; not used by accepted extraction"
    if path.startswith(("qa/legacy-inspection/", "qa/insert-generation/", "qa/re-extraction/")):
        return "Historical or duplicate inspection artifact"
    if path.startswith("qa/normalized-v2/"):
        return "Redundant individual preview or machine inspection report; selected contacts and compact reports retained"
    if "accepted-do-mi" in path:
        return "Superseded two-pose comparison"
    if path.startswith("qa/") or path == "alpha-normalization-report.json":
        return "Superseded QA output"
    return "Historical display draft or duplicate original; exact necessary inputs retained once under sources/"


def refresh():
    selected = set(FILES)
    excluded = [{"path": path.relative_to(ROOT).as_posix(), "reason": reason(path.relative_to(ROOT).as_posix())}
                for path in sorted(ROOT.rglob("*")) if path.is_file() and path.relative_to(ROOT).as_posix() not in selected]
    prefix = ROOT.relative_to(REPO).as_posix() + "/"
    shared = (ROOT.parent / "prompts.json").relative_to(REPO).as_posix()
    include = [prefix + path for path in FILES] + [shared]
    inventory = {
        "schemaVersion": 1,
        "scope": "Static teacher prototypes only; no game integration",
        "includeRepoRelativeFiles": include,
        "excludedLocalTeacherFiles": excluded,
        "exclusionPolicy": "Everything in teacher/ absent from the explicit include list remains local. Never stage teacher/ recursively. Personal original photographs are forbidden and absent.",
        "sharedPromptsNote": "Shared notes sections are outside teacher ownership; only teacherFinalV2 pointers were curated here.",
        "generationReferenceBoundary": "Frozen generated-art inputs are included solely to repeat exact final prompts; their historical ancestors and private photos are not required for normalization.",
        "teacherFileCount": len(FILES),
        "fileCountIncludingSharedPrompts": len(include),
        "teacherBytes": 0,
        "totalBytesIncludingSharedPrompts": 0,
    }
    target = ROOT / "publication-files.json"
    # Inventory contains its own size; converge after digit-width changes.
    for _ in range(8):
        encoded = json.dumps(inventory, ensure_ascii=False, indent=2) + "\n"
        target.write_text(encoded, encoding="utf-8", newline="\n")
        teacher_bytes = sum((ROOT / path).stat().st_size for path in FILES)
        total = teacher_bytes + (ROOT.parent / "prompts.json").stat().st_size
        if inventory["teacherBytes"] == teacher_bytes and inventory["totalBytesIncludingSharedPrompts"] == total:
            break
        inventory["teacherBytes"] = teacher_bytes
        inventory["totalBytesIncludingSharedPrompts"] = total
    else:
        raise AssertionError("Inventory size did not converge")
    print(json.dumps({key:inventory[key] for key in ("teacherFileCount", "fileCountIncludingSharedPrompts", "teacherBytes", "totalBytesIncludingSharedPrompts")}, indent=2))


if __name__ == "__main__":
    refresh()
