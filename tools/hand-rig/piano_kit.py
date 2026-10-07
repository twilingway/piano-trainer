"""A piano built from a kit of parts, for three.js to lay out any key range.

Run inside Blender: exec(open(".../piano_kit.py").read(), {"LOW": 36, "HIGH": 84, "EXPORT": True}).
Builds collection "piano_kit": one mesh per part at the origin (hidden), and collection "piano":
the parts laid out from MIDI LOW to HIGH (C2..C6 by default) in the hand solver's coordinates
(studio_pose.py: C4's centre at x=X0, the keys' front edge at y=KEY_FRONT, white tops at KEY_TOP),
so solved hand poses land on these keys. EXPORT writes the kit (parts only) as glTF binary.

Every part's origin sits on the white keys' front top edge: x at the key slot's centre (the
centre of the range for the rails), y=0 at the white keys' front, z=0 at the white tops. Keys run
towards +Y. The rails are 1 m long along X: scale them to the range's width.
"""
import bpy, bmesh, math, os
from mathutils import Vector

ROOT = globals().get("ROOT", r"E:/MySource/ReactJS/piano-trainer")
LOW = globals().get("LOW", 36)
HIGH = globals().get("HIGH", 84)
EXPORT = globals().get("EXPORT", False)
OUT = globals().get("OUT", os.path.join(ROOT, "blender/exports/piano-kit.glb"))

# --- the solver's keyboard (studio_pose.py), metres
WHITE_W, WHITE_L, WHITE_H = 0.0235, 0.150, 0.022
BLACK_W, BLACK_L, BLACK_H = 0.0137, 0.095, 0.012
KEY_TOP, KEY_FRONT, X0 = 0.74, 0.30, 0.36
WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]

# --- the kit's own shapes
GAP = 0.001                 # between neighbouring white keys
CLEAR = 0.0008              # between a white key's cut and the black key in it
CAP = 0.0035              # the white key's top cap, whose front overhangs the key front
LIP = 0.0016              # how far the cap overhangs
BLACK_TOP_W = 0.0098        # black keys narrow towards the top...
BLACK_SLOPE = 0.013         # ...and slope at the front: the top starts this far behind the base
BLACK_DEPTH = 0.010         # how far a black key reaches below the white tops
CHEEK_W, CHEEK_R = 0.034, 0.028
SLIP = (-0.016, -0.001, -0.046, -0.010)     # front rail: y0, y1, z0, z1
TABLE = (-0.110, 0.260, -0.076, -0.046)     # the table top under it all
BOARD = (0.1515, 0.185, -0.046, 0.028)      # the name board behind the keys
FELT = (0.1500, 0.1530, 0.0, 0.007)         # red felt along the name board's foot
CHEEK_Y = (-0.034, 0.200)
CHEEK_Z = (-0.076, 0.034)


def material(name, color, roughness, coat=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
    m.diffuse_color = (*color, 1)
    return m


def noise(m, scale, stretch=(1, 1, 1)):
    """A noise texture in object space, `stretch` scaling it per axis (grain along the key: small Y)."""
    nodes, links = m.node_tree.nodes, m.node_tree.links
    for n in [n for n in nodes if n.type in ("TEX_NOISE", "MAPPING", "TEX_COORD", "VALTORGB", "BUMP")]:
        nodes.remove(n)
    coord, mapping, tex = nodes.new("ShaderNodeTexCoord"), nodes.new("ShaderNodeMapping"), nodes.new("ShaderNodeTexNoise")
    mapping.inputs["Scale"].default_value = stretch
    tex.inputs["Scale"].default_value = scale
    tex.inputs["Detail"].default_value = 8
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    return tex


def ivory(name):
    """Warm ivory with faint grain lines running along the key, slightly translucent."""
    m = material(name, (0.86, 0.80, 0.66), 0.36, 0.2)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    tex = noise(m, 6, (60, 1.5, 60))
    ramp = m.node_tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.76, 0.64, 0.44, 1)
    ramp.color_ramp.elements[1].color = (0.86, 0.77, 0.58, 1)
    m.node_tree.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    m.node_tree.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Subsurface Weight"].default_value = 0.08
    return m


def velvet(name):
    """Matte black with a soft sheen at grazing angles and a fine velvety grain."""
    m = material(name, (0.010, 0.008, 0.007), 0.78)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Specular IOR Level"].default_value = 0.15   # velvet barely mirrors the light
    b.inputs["Sheen Weight"].default_value = 0.3
    b.inputs["Sheen Roughness"].default_value = 0.45
    b.inputs["Sheen Tint"].default_value = (0.32, 0.29, 0.27, 1)
    tex = noise(m, 2500)
    bump = m.node_tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.0002
    m.node_tree.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    m.node_tree.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


MAT = {
    "white": ivory("piano-white"),
    "black": velvet("piano-black"),
    "case": material("piano-case", (0.018, 0.018, 0.024), 0.28, 0.6),
    "table": material("piano-table", (0.035, 0.030, 0.034), 0.45),
    "felt": material("piano-felt", (0.30, 0.015, 0.025), 0.95),
}


def collection(name, hidden=False):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects):
            bpy.data.objects.remove(o)
    else:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    c.hide_viewport = hidden
    c.hide_render = hidden
    return c


def prism(bm, outline, z0, z1):
    """Extrudes a counter-clockwise outline (x, y) from z0 up to z1."""
    bottom = [bm.verts.new((x, y, z0)) for x, y in outline]
    top = [bm.verts.new((x, y, z1)) for x, y in outline]
    bm.faces.new(list(reversed(bottom)))
    bm.faces.new(top)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bottom[i], bottom[j], top[j], top[i]))


def profile_x(bm, profile, x0, x1):
    """Extrudes a (y, z) profile, counter-clockwise seen from +X, from x0 to x1."""
    left = [bm.verts.new((x0, y, z)) for y, z in profile]
    right = [bm.verts.new((x1, y, z)) for y, z in profile]
    bm.faces.new(list(reversed(left)))
    bm.faces.new(right)
    n = len(profile)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((left[i], left[j], right[j], right[i]))


def part(name, build, mat, bevel=0.0, segments=3, coll=None):
    me = bpy.data.meshes.get(name)
    if me:
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    if bevel:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = segments
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(40)
        b.harden_normals = True
    return o


def white_outline(cut_left, cut_right, front=0.0):
    """A white key from above: full width at the front, cut at the back beside black keys."""
    xl, xr = -WHITE_W / 2 + GAP / 2, WHITE_W / 2 - GAP / 2
    cut = BLACK_W / 2 + CLEAR
    yc = WHITE_L - BLACK_L - CLEAR
    pts = [(xl, front), (xr, front)]
    if cut_right:
        pts += [(xr, yc), (WHITE_W / 2 - cut, yc), (WHITE_W / 2 - cut, WHITE_L)]
    else:
        pts += [(xr, WHITE_L)]
    if cut_left:
        pts += [(-WHITE_W / 2 + cut, WHITE_L), (-WHITE_W / 2 + cut, yc), (xl, yc)]
    else:
        pts += [(xl, WHITE_L)]
    return pts


def white_key(cut_left, cut_right):
    """One solid: the sides run flush from the top down, only the front shows the cap's lip."""
    def build(bm):
        prism(bm, white_outline(cut_left, cut_right), -WHITE_H, 0.0)
        for z in (-CAP, -CAP - 0.0002):
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1))
        for v in bm.verts:
            if abs(v.co.y) < 1e-6 and v.co.z < -CAP - 0.0001:
                v.co.y = LIP
    return build


def black_key(bm):
    y0, y1 = WHITE_L - BLACK_L, WHITE_L
    b, t = BLACK_W / 2, BLACK_TOP_W / 2
    zb, zt = -BLACK_DEPTH, BLACK_H
    v = [bm.verts.new(p) for p in (
        (-b, y0, zb), (b, y0, zb), (b, y1, zb), (-b, y1, zb),
        (-t, y0 + BLACK_SLOPE, zt), (t, y0 + BLACK_SLOPE, zt), (t, y1 - 0.002, zt), (-t, y1 - 0.002, zt))]
    for f in ((3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([v[i] for i in f])


def box_x(y0, y1, z0, z1):
    return lambda bm: profile_x(bm, [(y0, z0), (y1, z0), (y1, z1), (y0, z1)], -0.5, 0.5)


def cheek(bm):
    y0, y1 = CHEEK_Y
    z0, z1 = CHEEK_Z
    arc = [(y0 + CHEEK_R - CHEEK_R * math.cos(a), z1 - CHEEK_R + CHEEK_R * math.sin(a))
           for a in (math.radians(d) for d in range(0, 91, 10))]
    profile_x(bm, [(y0, z0), (y1, z0), (y1, z1)] + list(reversed(arc)), -CHEEK_W / 2, CHEEK_W / 2)


def build_kit():
    kit = collection("piano_kit", hidden=True)
    parts = {
        "white-cut-right": part("white-cut-right", white_key(False, True), MAT["white"], 0.0012, coll=kit),
        "white-cut-both": part("white-cut-both", white_key(True, True), MAT["white"], 0.0012, coll=kit),
        "white-cut-left": part("white-cut-left", white_key(True, False), MAT["white"], 0.0012, coll=kit),
        "white-full": part("white-full", white_key(False, False), MAT["white"], 0.0012, coll=kit),
        "black": part("black", black_key, MAT["black"], 0.0022, 5, coll=kit),
        "slip": part("slip", box_x(*SLIP), MAT["case"], 0.003, coll=kit),
        "table": part("table", box_x(*TABLE), MAT["table"], 0.008, 4, coll=kit),
        "board": part("board", box_x(*BOARD), MAT["case"], 0.004, coll=kit),
        "felt": part("felt", box_x(*FELT), MAT["felt"], coll=kit),
        "cheek": part("cheek", cheek, MAT["case"], 0.004, coll=kit),
    }
    return parts


def is_black(midi):
    return midi % 12 not in WHITE_PCS


def slot_x(midi):
    """The key's centre across the keyboard, as studio_pose.key_of puts it."""
    octave, pc = divmod(midi - 60, 12)
    if pc in WHITE_PCS:
        return X0 + (octave * 7 + WHITE_PCS.index(pc)) * WHITE_W
    return X0 + (octave * 7 + WHITE_PCS.index(pc - 1)) * WHITE_W + WHITE_W / 2


def white_shape(midi, low, high):
    left = midi - 1 >= low and is_black(midi - 1)
    right = midi + 1 <= high and is_black(midi + 1)
    return {(False, True): "white-cut-right", (True, True): "white-cut-both",
            (True, False): "white-cut-left", (False, False): "white-full"}[(left, right)]


def place(kit_obj, name, coll, x, scale_x=1.0):
    o = kit_obj.copy()            # shares the mesh: a linked duplicate, as three.js will instance it
    o.name = name
    o.location = (x, KEY_FRONT, KEY_TOP)
    o.scale.x = scale_x
    coll.objects.link(o)
    return o


def assemble(parts, low, high):
    piano = collection("piano")
    for midi in range(low, high + 1):
        shape = "black" if is_black(midi) else white_shape(midi, low, high)
        place(parts[shape], f"key-{midi}", piano, slot_x(midi))
    left = slot_x(low) - WHITE_W / 2
    right = slot_x(high) + WHITE_W / 2
    centre, width = (left + right) / 2, right - left
    for name in ("slip", "board", "felt"):
        place(parts[name], name, piano, centre, width)
    place(parts["table"], "table", piano, centre, width + 2 * CHEEK_W + 0.12)
    place(parts["cheek"], "cheek-left", piano, left - GAP - CHEEK_W / 2)
    place(parts["cheek"], "cheek-right", piano, right + GAP + CHEEK_W / 2)
    return piano


def export(parts, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kit = bpy.data.collections["piano_kit"]
    kit.hide_viewport = False
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in parts.values():
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True, export_cameras=False,
                              export_lights=False)
    kit.hide_viewport = True


def view():
    """The concept's frame: low and close over the keys, the keyboard running off both edges, the
    keys along the bottom; a warm key light and two dim coloured rims on a night-blue world."""
    scene = bpy.context.scene
    c = collection("piano_view")
    cam = bpy.data.objects.new("concept-cam", bpy.data.cameras.get("concept-cam") or bpy.data.cameras.new("concept-cam"))
    c.objects.link(cam)
    cam.data.lens, cam.data.sensor_fit, cam.data.sensor_width = 28, "HORIZONTAL", 36
    cam.data.clip_start, cam.data.shift_y = 0.005, 0.075
    target = Vector((X0, KEY_FRONT + 0.10, KEY_TOP))
    elevation, distance = math.radians(22), 0.47
    cam.location = target + Vector((0, -distance * math.cos(elevation), distance * math.sin(elevation)))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = 1920, 812
    for name, loc, energy, color, size in (("pv-key", (0.2, -0.3, 1.6), 14, (1, 0.92, 0.80), 0.8),
                                           ("pv-rim-l", (-0.3, 0.7, 1.0), 6, (0.55, 0.35, 1.0), 0.4),
                                           ("pv-rim-r", (1.05, 0.7, 1.0), 6, (0.2, 0.6, 1.0), 0.4)):
        light = bpy.data.lights.get(name) or bpy.data.lights.new(name, "AREA")
        light.energy, light.color, light.size = energy, color, size
        o = bpy.data.objects.new(name, light)
        c.objects.link(o)
        o.location = loc
        o.rotation_euler = (target - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    world = scene.world
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    background.inputs[0].default_value = (0.008, 0.01, 0.03, 1)


parts = build_kit()
if globals().get("VIEW", True):
    view()
assemble(parts, LOW, HIGH)
if EXPORT:
    export(parts, OUT)
print("kit", sorted(parts), "keys", HIGH - LOW + 1)
