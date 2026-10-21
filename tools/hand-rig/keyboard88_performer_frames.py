"""Pure frozen metadata normalization shared by export and verification."""

import json


def source_frames(source):
    rows = json.loads((source / "frame-index.json").read_text("utf8"))
    for row in json.loads((source / "c4-poses.json").read_text("utf8"))["poses"]:
        frame = row["blender_frame"]
        rows.append({**row, "blender_frame": frame + 793 if frame <= 51 else frame,
                     "start": "C4", "family": "white" if frame <= 32 else "black",
                     "source_r12_frame": frame, "predicted_class": "INHERITED_R12"})
    selected = sorted((row for row in rows if 308 <= row["blender_frame"] <= 1522),
                      key=lambda row: row["blender_frame"])
    assert [row["blender_frame"] for row in selected] == list(range(308, 1523))
    result = []
    for row in selected:
        frame = row["blender_frame"]
        audit_path = source / "audit" / f"frame-{frame}.json"
        audit = {"class": "INHERITED_R12" if row["start"] == "C4" else "NO_AUDIT"}
        if audit_path.exists():
            record = json.loads(audit_path.read_text("utf8"))
            assert record["blender_frame"] == frame and record["case_id"] == row["case_id"]
            audit = {key: record.get(key) for key in ("class", "status", "predicted_class")}
        mask = sum(1 << (finger - 1) for finger in row["pressed_fingers"])
        assert sorted(row["assignment_midis"][i] for i in range(5) if mask & (1 << i)) == sorted(row["pressed_midis"])
        result.append({"id": frame, "assignment": row["assignment_midis"], "pressedMask": mask,
                       "caseId": row["case_id"], "family": row["family"], "start": row["start"],
                       "sourceR12Frame": row.get("source_r12_frame"),
                       "predictedClass": row.get("predicted_class"), "audit": audit})
    return result

