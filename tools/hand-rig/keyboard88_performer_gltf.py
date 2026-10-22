"""Deterministic GLB writer for a single conventional four-weight skinned mesh."""

import json
import math
import struct


class PerformerGlb:
    def __init__(self):
        self.binary = bytearray()
        self.data = {"asset": {"version": "2.0", "generator": "Twiling Keys keyboard88 performer 1"},
                     "scene": 0, "scenes": [{"name": "keyboard88-performer", "nodes": [0]}],
                     "nodes": [], "meshes": [], "skins": [], "materials": [],
                     "accessors": [], "bufferViews": [], "buffers": [],
                     "extras": {"units": "metres", "sourceAxes": "Blender XYZ to glTF XZ-Y",
                                "surface": "base6890, linear blend skinning, no corrective shapes",
                                "nails": "painted texture only; no nail meshes or bindings"}}

    def accessor(self, rows, size, component=5126, bounds=False, matrix=False):
        values = [value for row in rows for value in row]
        assert all(math.isfinite(value) for value in values)
        self.binary.extend(b"\0" * (-len(self.binary) % 4))
        raw = struct.pack("<" + ("f" if component == 5126 else "H") * len(values), *values)
        view = len(self.data["bufferViews"])
        self.data["bufferViews"].append({"buffer": 0, "byteOffset": len(self.binary),
                                        "byteLength": len(raw)})
        self.binary.extend(raw)
        item = {"bufferView": view, "componentType": component, "count": len(rows),
                "type": "MAT4" if matrix else {1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4"}[size]}
        if bounds:
            item["min"] = [min(row[i] for row in rows) for i in range(size)]
            item["max"] = [max(row[i] for row in rows) for i in range(size)]
        self.data["accessors"].append(item)
        return len(self.data["accessors"]) - 1

    def material(self, role):
        hand = role != "body"
        self.data["materials"].append({"name": "keyboard88-" + role, "extras": {"role": role},
            "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1] if hand else [0.075, 0.09, 0.12, 1],
                                     "metallicFactor": 0, "roughnessFactor": 0.58 if hand else 0.92},
            "doubleSided": False})
        return len(self.data["materials"]) - 1

    def primitive(self, role, vertices, indices, source_faces):
        attributes = {}
        for semantic, begin, end, component in [("POSITION", 0, 3, 5126), ("NORMAL", 3, 6, 5126),
                ("TEXCOORD_0", 6, 8, 5126), ("JOINTS_0", 8, 12, 5123), ("WEIGHTS_0", 12, 16, 5126)]:
            attributes[semantic] = self.accessor([v[begin:end] for v in vertices], end - begin,
                                                  component, semantic == "POSITION")
        return {"attributes": attributes, "indices": self.accessor([(i,) for i in indices], 1, 5123),
                "material": self.material(role), "extras": {"role": role, "sourceFaceIds": source_faces}}

    def write(self, path):
        self.data["buffers"] = [{"byteLength": len(self.binary)}]
        document = json.dumps(self.data, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf8")
        document += b" " * (-len(document) % 4)
        self.binary.extend(b"\0" * (-len(self.binary) % 4))
        result = struct.pack("<4sII", b"glTF", 2, 28 + len(document) + len(self.binary))
        result += struct.pack("<I4s", len(document), b"JSON") + document
        result += struct.pack("<I4s", len(self.binary), b"BIN\0") + self.binary
        path.write_bytes(result)
