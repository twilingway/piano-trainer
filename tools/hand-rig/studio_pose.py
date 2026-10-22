"""Pose the rigged Blender Studio hand (studio_rig.py) over a real-size keyboard; render the player's view.

Run inside Blender with globals POSE, OUT: exec(open(".../studio_pose.py").read(), {"POSE": "five", "OUT": ...}).
The solver is hand_solver.py (shared with the seated pianist, pianist_pose.py); here the MPFB arm
is gone: the forearm stub is aimed and stretched to bring the wrist where the solver wants it.
"""
import bpy, math, json, os
from mathutils import Vector, Matrix

ROOT = globals().get("ROOT", r"E:/MySource/ReactJS/piano-trainer")
exec(open(os.path.join(ROOT, "tools/hand-rig/hand_keys.py"), encoding="utf-8").read())

POSE = globals().get("POSE", "sixth")
OUT = globals().get("OUT", ".")
RENDER = globals().get("RENDER", True)
scene = bpy.context.scene
vl = bpy.context.view_layer
rig = bpy.data.objects["HandRig"]
mesh = bpy.data.objects["HandMesh"]
P = rig.pose.bones

# --- pose geometry
FOREARM = Vector((-0.22, 1, -0.10)).normalized()   # elbow -> wrist
HAND_FWD = Vector((-0.06, 1, -0.06)).normalized()  # wrist -> knuckle 3
FOREARM_STRETCH = 3.0                # the stub is 78 mm; stretched it leaves the photo frame
ROLL = math.radians(globals().get("ROLL_DEG", 2))   # pinky side lower: barely, the thumb must reach its key

POSES = {
    "five":  {1: 0, 2: 2, 3: 4, 4: 5, 5: 7},
    "sixth": {1: 0, 5: 9},
    "triad": {1: 0, 3: 4, 5: 7},
}
# A study pose (hand-study.html): pressed finger -> semitone from C4, and optionally free fingers
# that anchor the hand over a key ("over": the middle finger of a relaxed hand, the fingers a
# tucked thumb passes under). Every other free finger takes its natural pose.
SPEC = globals().get("SPEC")
MODE = globals().get("MODE", "photo")      # "photo": player's eye with keys; "top": ortho, hand only


if SPEC:
    POSE = SPEC["id"]
    pose = {int(f): s for f, s in SPEC["down"].items()}
    hover_x = {int(f): key_of(s)[0] for f, s in SPEC.get("over", {}).items()}
else:
    pose, hover_x = POSES[POSE], {}


def collection(name):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects):
            bpy.data.objects.remove(o)
    else:
        c = bpy.data.collections.new(name)
        scene.collection.children.link(c)
    return c


keyboard = collection("keyboard")
fx = collection("studio_fx")


def link(o, coll):
    for c in o.users_collection:
        c.objects.unlink(o)
    coll.objects.link(o)
    return o


KEYS = {}                              # by plain name: other scenes in this file own "white0" etc.


def box(name, x, y0, length, width, z_top, height, color):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = link(bpy.context.active_object, keyboard)
    o.name = "kb-" + name
    KEYS[name] = o
    o.scale = (width * 0.96, length, height)
    o.location = (x, y0 + length / 2, z_top - height / 2)
    o.color = color
    return o


def build_keyboard(octaves=3):
    for i in range(-7, octaves * 7 + 1):        # one octave below C4 too
        box(f"white{i}", white_x(i), KEY_FRONT, WHITE_L, WHITE_W, KEY_TOP, WHITE_H, (0.95, 0.95, 0.93, 1))
    for o in range(-1, octaves):
        for pc in (1, 3, 6, 8, 10):
            x, _ = key_of(o * 12 + pc)
            box(f"black{o}_{pc}", x, KEY_FRONT + WHITE_L - BLACK_L, BLACK_L, BLACK_W, KEY_TOP + BLACK_H, BLACK_H + 0.01, (0.08, 0.08, 0.1, 1))


build_keyboard()

# Pressed keys pivot round an axis hidden in the case; the front edge drops KEY_DIP.
def key_object(semitone):
    octave, pc = divmod(semitone, 12)
    if pc in WHITE_PCS:
        return KEYS[f"white{octave * 7 + WHITE_PCS.index(pc)}"]
    return KEYS[f"black{octave}_{pc}"]


for semi in pose.values():
    _, black = key_of(semi)
    o = key_object(semi)
    pivot = Vector((0, PIVOT_Y, KEY_TOP + (BLACK_H if black else 0)))
    o.matrix_world = (Matrix.Translation(pivot) @ Matrix.Rotation(angle_of(black), 4, "X")
                      @ Matrix.Translation(-pivot) @ o.matrix_world)
    o.color = (0.75, 0.86, 1.0, 1) if not black else (0.15, 0.22, 0.35, 1)


def flat_material(name, color):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = color
    b.inputs["Roughness"].default_value = 0.35
    return m


for o in keyboard.objects:
    o.data.materials.clear()
    o.data.materials.append(flat_material("key-" + "-".join(f"{c:.2f}" for c in o.color), tuple(o.color)))


# The solver's step 3: place the hand by the arm's bones; the rig object stays put. The forearm bone comes in along
# FOREARM turned by part of the hand's yaw (the whole arm slides along the keyboard with the
# wrist), stretched, and twists about its own axis with the palm (pronation/supination); the wrist
# bone takes the rest, flexion and deviation.
FOREARM_FOLLOW = 0.6                   # the forearm follows this much of the hand's turn


def place_arm(wrist_at, frame, yaw):
    fy = Matrix.Rotation(FOREARM_FOLLOW * (yaw - YAW0), 3, "Z") @ FOREARM
    fz = -frame.col[2]
    fz = (fz - fy * fz.dot(fy)).normalized()
    rot = Matrix((fy.cross(fz), fy, fz)).transposed().to_4x4()
    L = rig.data.bones["lowerarm02.R"].length
    wrist = (frame @ HAND_IN_WRIST.inverted()).to_4x4()
    wrist.translation = wrist_at
    twist = 0.0
    for _ in range(3):                 # the wrist does not twist: hand its twist over to the forearm
        fore = (Matrix.Translation(wrist_at - fy * L * FOREARM_STRETCH) @ rot @ Matrix.Rotation(twist, 4, "Y")
                @ Matrix.Diagonal((1, FOREARM_STRETCH, 1, 1)))
        P["lowerarm02.R"].matrix = rig.matrix_world.inverted() @ fore
        vl.update()
        P["wrist.R"].matrix = rig.matrix_world.inverted() @ wrist
        vl.update()
        q = P["wrist.R"].matrix_basis.to_quaternion()
        twist += 2 * math.atan2(q.y, q.w)


for pb in P:                           # the stub's stretch and the last pose off
    pb.matrix_basis = Matrix.Identity(4)
rig.data.bones["wrist.R"].inherit_scale = "NONE"
SIDE = "R"
exec(open(os.path.join(ROOT, "tools/hand-rig/hand_solver.py"), encoding="utf-8").read())


def circumcenter(a, b, c):
    ab, ac = b - a, c - a
    n = ab.cross(ac)
    return a + (n.cross(ab) * ac.length_squared + ac.cross(n) * ab.length_squared) / (2 * n.length_squared)


# The apple, made visible: the circle through the middle finger's knuckle, middle joint and tip,
# shrunk by half a finger's thickness to the skin. Viewport only.
FINGER_HALF = 0.009
a3, b3, c3 = world("finger3-1.R"), world("finger3-3.R"), world("finger3-3.R", "tail")
apple_c = circumcenter(a3, b3, c3)
apple_r = (a3 - apple_c).length - FINGER_HALF
bpy.ops.mesh.primitive_uv_sphere_add(radius=apple_r, location=apple_c, segments=24, ring_count=12)
apple = link(bpy.context.active_object, fx)
apple.name = "apple"
apple.display_type = "WIRE"
apple.hide_render = True

# Real contact: the lowest deformed skin point near each pressed tip, against its key surface.
dg = bpy.context.evaluated_depsgraph_get()
ev = mesh.evaluated_get(dg)
skin = [ev.matrix_world @ v.co for v in ev.data.vertices]
pad_gap = {}
for f, semi in pose.items():
    tail = world(f"finger{f}-3.R", "tail")
    near = [p for p in skin if (p - tail).length < 0.014]
    low = min(near, key=lambda p: p.z - pressed_top(key_of(semi)[1], p.y))
    pad_gap[f] = round((low.z - pressed_top(key_of(semi)[1], low.y)) * 1000, 1)

k3 = world("finger3-1.R")
# forearm twist from palm-down about its own axis (+: thumb side down), wrist angles in its bone
fore_y = (world("lowerarm02.R", "tail") - world("lowerarm02.R")).normalized()
fore_z = (rig.matrix_world @ P["lowerarm02.R"].matrix).col[2].to_3d().normalized()
palm_down = Vector((0, 0, -1)) - fore_y * -fore_y.z
twist = math.degrees(math.atan2(fore_y.dot(palm_down.cross(fore_z)), palm_down.normalized().dot(fore_z)))
cap_keys, cap_fingers = collision_report()
skin_keys, skin_fingers = mesh_check()
report = {"forearm_twist_deg": round(twist), "wrist_xyz_deg": [round(math.degrees(a)) for a in P["wrist.R"].matrix_basis.to_euler()],
          "capsule_key_mm": cap_keys, "capsule_finger_mm": {k: v for k, v in cap_fingers.items() if v > 0},
          "skin_key_mm": skin_keys, "skin_finger_mm": skin_fingers, "pose": POSE, "fit_residual_mm": round(math.sqrt(residual) * 1000, 1),
          "yaw_pitch_roll_deg": [round(math.degrees(a)) for a in turn[3:6]], "spread": round(SPREAD_FIT, 2),
          "curl_deg": {f: [round(r[0][1]) for r in CURL[f]] for f in (2, 3, 4, 5)},
          "knuckle3_above_keys_mm": round((k3.z - KEY_TOP) * 1000),
          "neutral_deg": {f: round(d) for f, d in NEUTRAL.items()}, "rigid_miss_mm": before,
          "curl_scale": {f: round(v, 2) for f, v in CURL_SCALE.items()},
          "palm_arch_deg": {f: round(v, 1) for f, v in PALM_ARCH.items()},
          "apple_bends_deg": {f: [round(r[0][1]) for r in CURL[f]] for f in (2, 3, 4, 5)}, "press_adjust": adjust,
          "apple_r_mm": round(apple_r * 1000), "apple_bottom_above_keys_mm": round((apple_c.z - apple_r - KEY_TOP) * 1000), "thumb_home_miss_mm": thumb_home_miss, "pole_angle": POLE_ANGLE,
          "miss_mm": {f: round((world(f"finger{f}-3.R", "tail").xy - targets[f].xy).length * 1000, 1) for f in pose},
          "pad_gap_mm": pad_gap, "pad_fix_mm": {f: round(d * 1000, 1) for f, d in PAD_FIX.items()},
          "hover_x_mm": {f: round((world(f"finger{f}-3.R", "tail").x - hx) * 1000, 1) for f, hx in hover_x.items()},
          "hover_above_keys_mm": {f: round((world(f"finger{f}-3.R", "tail").z - KEY_TOP) * 1000) for f in range(1, 6) if f not in pose}}

# --- render: player's eye from above, like a photo over the shoulder
mat = bpy.data.materials.get("skin") or bpy.data.materials.new("skin")
mat.use_nodes = True
bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Base Color"].default_value = (0.80, 0.58, 0.47, 1)
bsdf.inputs["Roughness"].default_value = 0.5
bsdf.inputs["Subsurface Weight"].default_value = 0.25
bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
bsdf.inputs["Subsurface Scale"].default_value = 0.005
mesh.data.materials.clear()
mesh.data.materials.append(mat)

hand = k3


def light(name, energy, offset, size):
    o = bpy.data.objects.new(name, bpy.data.lights.new(name, "AREA"))
    fx.objects.link(o)
    o.data.energy = energy
    o.data.size = size
    o.location = hand + offset
    o.rotation_euler = (hand - o.location).to_track_quat("-Z", "Y").to_euler()
    return o


lights = [light("key", 6, Vector((-0.4, -0.3, 0.8)), 0.4),
          light("fill", 2, Vector((0.5, -0.2, 0.4)), 0.6),
          light("rim", 3, Vector((0.1, 0.6, 0.3)), 0.3)]
photo = bpy.data.objects.new("camphoto", bpy.data.cameras.new("camphoto"))
fx.objects.link(photo)
photo.data.lens = 35
photo.location = Vector((hand.x + 0.03, hand.y - 0.22, KEY_TOP + 0.55))
photo.rotation_euler = (Vector((hand.x + 0.03, hand.y + 0.02, KEY_TOP)) - photo.location).to_track_quat("-Z", "Y").to_euler()

# Straight down, one fixed frame for every pose: the keys stay in the scene (they placed and
# pressed the fingers) but are not rendered; transparent background.
TOP_CENTER, TOP_ORTHO, TOP_SIZE = Vector((X0 + 2.5 * WHITE_W, 0.27)), 0.30, 1024
top = bpy.data.objects.new("camtop", bpy.data.cameras.new("camtop"))
fx.objects.link(top)
top.data.type = "ORTHO"
top.data.ortho_scale = TOP_ORTHO
top.location = (TOP_CENTER.x, TOP_CENTER.y, KEY_TOP + 1.0)
if MODE == "top":
    camera, visible = top, {mesh, top, *lights}
    size, transparent, path = (TOP_SIZE, TOP_SIZE), True, f"{POSE}.png"
else:
    camera, visible = photo, {mesh, photo, *lights, *keyboard.objects}
    size, transparent, path = (1500, 1000), False, f"studio-{POSE}-photo.png"
for o in scene.objects:
    o.hide_render = o not in visible
scene.camera = camera
try:
    scene.render.engine = "BLENDER_EEVEE"
except TypeError as e:
    print("engine:", e)
scene.view_settings.view_transform = "AgX"
scene.render.resolution_x, scene.render.resolution_y = size
scene.render.resolution_percentage = 100
scene.render.film_transparent = transparent
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = os.path.join(OUT, path)
if RENDER:
    bpy.ops.render.render(write_still=True)
print(json.dumps(report))
