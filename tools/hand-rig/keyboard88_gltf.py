"""Deterministic, dependency-free GLB/PNG writer for the keyboard88 export."""

import json
import math
import struct
import zlib


def png_rgb(width, height, pixels):
    """Encode top-first RGB8 rows without timestamps or encoder metadata."""
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    rows = b"".join(b"\0" + pixels[y * width * 3:(y + 1) * width * 3] for y in range(height))
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")


def solid_png(linear):
    def srgb(value):
        value = max(0.0, min(1.0, value))
        encoded = 12.92 * value if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055
        return round(encoded * 255)

    return png_rgb(1, 1, bytes(srgb(v) for v in linear[:3]))


class Glb:
    def __init__(self):
        self.binary = bytearray()
        self.data = {
            "asset": {"version": "2.0", "generator": "Twiling Keys keyboard88 exporter 1"},
            "scene": 0,
            "scenes": [{"name": "keyboard88", "nodes": []}],
            "nodes": [], "meshes": [], "materials": [], "textures": [], "images": [],
            "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
            "accessors": [], "bufferViews": [], "buffers": [],
            "extensionsUsed": ["KHR_materials_clearcoat", "KHR_materials_sheen"],
            "extras": {"units": "metres", "keyRange": [21, 108], "dipM": 0.008,
                       "sourceAxes": "Blender XYZ to glTF XZ-Y", "paintUv": "TEXCOORD_1: left0/right1/front0/back1"},
        }

    def view(self, raw, target=None):
        self.binary.extend(b"\0" * (-len(self.binary) % 4))
        item = {"buffer": 0, "byteOffset": len(self.binary), "byteLength": len(raw)}
        if target is not None:
            item["target"] = target
        self.binary.extend(raw)
        self.data["bufferViews"].append(item)
        return len(self.data["bufferViews"]) - 1

    def attribute(self, values, size, component=5126, bounds=False):
        flat = [v for row in values for v in row]
        if not all(math.isfinite(v) for v in flat):
            raise ValueError("Non-finite geometry")
        code = "f" if component == 5126 else "H"
        raw = struct.pack("<" + code * len(flat), *flat)
        accessor = {"bufferView": self.view(raw, 34962 if component == 5126 else 34963),
                    "componentType": component, "count": len(values), "type": {1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4"}[size]}
        if bounds:
            accessor["min"] = [min(v[i] for v in values) for i in range(size)]
            accessor["max"] = [max(v[i] for v in values) for i in range(size)]
        self.data["accessors"].append(accessor)
        return len(self.data["accessors"]) - 1

    def texture(self, name, png):
        index = len(self.data["images"])
        self.data["images"].append({"name": name, "mimeType": "image/png", "bufferView": self.view(png)})
        self.data["textures"].append({"sampler": 0, "source": index})
        return index

    def material(self, name, role, color, roughness, coat=0.0, normal=None, black=False):
        material = {"name": name, "extras": {"role": role}, "pbrMetallicRoughness": {
            "baseColorTexture": {"index": color}, "metallicFactor": 0, "roughnessFactor": roughness}}
        if normal is not None:
            material["normalTexture"] = {"index": normal}
        extensions = {}
        if coat:
            extensions["KHR_materials_clearcoat"] = {"clearcoatFactor": coat, "clearcoatRoughnessFactor": 0.03}
        if black:
            extensions["KHR_materials_sheen"] = {"sheenColorFactor": [0.096, 0.087, 0.081], "sheenRoughnessFactor": 0.45}
        if extensions:
            material["extensions"] = extensions
        self.data["materials"].append(material)
        return len(self.data["materials"]) - 1

    def mesh(self, name, groups):
        primitives = []
        for role, material, vertices, indices in groups:
            attributes = {}
            for semantic, start, end in [("POSITION", 0, 3), ("NORMAL", 3, 6), ("TANGENT", 6, 10),
                                          ("TEXCOORD_0", 10, 12), ("TEXCOORD_1", 12, 14)]:
                attributes[semantic] = self.attribute([v[start:end] for v in vertices], end - start, bounds=semantic == "POSITION")
            primitives.append({"attributes": attributes, "indices": self.attribute([(i,) for i in indices], 1, 5123),
                               "material": material, "extras": {"role": role}})
        self.data["meshes"].append({"name": name, "primitives": primitives})
        return len(self.data["meshes"]) - 1

    def node(self, name, mesh, translation, extras):
        index = len(self.data["nodes"])
        self.data["nodes"].append({"name": name, "mesh": mesh, "translation": [round(v, 9) for v in translation], "extras": extras})
        self.data["scenes"][0]["nodes"].append(index)

    def write(self, path):
        self.data["buffers"] = [{"byteLength": len(self.binary)}]
        encoded = json.dumps(self.data, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf8")
        encoded += b" " * (-len(encoded) % 4)
        self.binary.extend(b"\0" * (-len(self.binary) % 4))
        total = 12 + 8 + len(encoded) + 8 + len(self.binary)
        result = struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(encoded), b"JSON") + encoded
        result += struct.pack("<I4s", len(self.binary), b"BIN\0") + self.binary
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(result)
