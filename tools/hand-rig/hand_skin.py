"""Skin, nails and fine detail for the Studio hand, so it reads as a person's hand, not a mannequin's.

Run inside Blender after studio_rig.py: exec(open(".../hand_skin.py").read(), {}).

- Nails: object "HandNails" in collection "studio", one curved plate per finger on the distal
  phalanx: raised over the dorsal skin, sunk into the folds at its base and sides, with a free edge
  past the tip. Skinned to finger<f>-3.R alone; lunula, nail bed and free edge are a colour
  attribute ("nail"), so the glTF needs no texture for them.
- Skin maps in HandMesh's UVs, computed per texel from its rest position against the rig's bones:
  colour (flush over knuckles and tips, veins, fine hair), roughness, and a height map of knuckle
  wrinkles, palmar creases, nail folds, veins, pores and hair. Cycles bakes the height into a
  tangent-space normal map; material "skin" then uses the three maps, as three.js does.

Maps go to blender/exports/hand-skin/ (git-ignored): skin-color.png, skin-rough.png, skin-normal.png.
Lengths below are millimetres unless named otherwise; the mesh itself is in metres.
"""
import bpy, math, os, time
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = globals().get("ROOT", r"E:/MySource/ReactJS/piano-trainer")
OUT = globals().get("OUT", os.path.join(ROOT, "blender/exports/hand-skin"))
SIZE = globals().get("SIZE", 1024)          # the maps' side
SS = 2                                      # maps are computed at SIZE * SS, then averaged down
SEED = 7

started = time.time()
rig = bpy.data.objects["HandRig"]
hand = bpy.data.objects["HandMesh"]
scene = bpy.context.scene
os.makedirs(OUT, exist_ok=True)

# --- palette, linear RGB
def lin(*srgb):
    c = np.array(srgb, np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)


SKIN = lin(0.86, 0.68, 0.58)        # back of the hand
PALM = lin(0.90, 0.68, 0.60)        # palm and finger pads, pinker
FLUSH = lin(0.84, 0.52, 0.46)       # knuckles and fingertips
ARM = lin(0.87, 0.71, 0.61)         # forearm, a little lighter
VEIN = lin(0.58, 0.54, 0.64)
HAIR = lin(0.52, 0.40, 0.31)
CREASE = lin(0.62, 0.40, 0.34)
NAIL_BED = lin(0.88, 0.62, 0.58)
NAIL_MOON = lin(0.95, 0.86, 0.82)
NAIL_FREE = lin(0.96, 0.93, 0.86)


# --- rest pose: the evaluated mesh (subdivided, as rendered and exported) without the pose
def rest_mesh():
    pose = rig.data.pose_position
    rig.data.pose_position = "REST"
    bpy.context.view_layer.update()
    ev = hand.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    me.calc_loop_triangles()
    nt, nv = len(me.loop_triangles), len(me.vertices)
    tv = np.empty(nt * 3, np.int32)
    me.loop_triangles.foreach_get("vertices", tv)
    tl = np.empty(nt * 3, np.int32)
    me.loop_triangles.foreach_get("loops", tl)
    co = np.empty(nv * 3, np.float32)
    me.vertices.foreach_get("co", co)
    nr = np.empty(nv * 3, np.float32)
    me.vertex_normals.foreach_get("vector", nr)
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers.active.data.foreach_get("uv", uv)
    polys = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    rig.data.pose_position = pose
    bpy.context.view_layer.update()
    co = co.reshape(-1, 3) * 1000
    return dict(tv=tv.reshape(-1, 3), tl=tl.reshape(-1, 3), co=co, nr=nr.reshape(-1, 3),
                uv=uv.reshape(-1, 2), polys=polys)


def bones_mm():
    """Every bone's head, length and axes in HandMesh's local space, millimetres."""
    rel = hand.matrix_world.inverted() @ rig.matrix_world
    out = {}
    for b in rig.data.bones:
        ml = rel @ b.matrix_local
        out[b.name] = dict(head=np.array(ml.translation, np.float32) * 1000, length=b.length * 1000,
                           x=np.array(ml.col[0].xyz.normalized(), np.float32),
                           y=np.array(ml.col[1].xyz.normalized(), np.float32),
                           z=np.array(ml.col[2].xyz.normalized(), np.float32))
    return out


# --- rasterize the UV layout: every covered texel's rest position and normal
def rasterize(m, R):
    uv = m["uv"][m["tl"]] * R - 0.5                         # (nt, 3, 2), texel centres at integers
    lo = np.floor(uv.min(1)).astype(np.int32)
    hi = np.ceil(uv.max(1)).astype(np.int32)
    P = np.zeros((R * R, 3), np.float32)
    N = np.zeros((R * R, 3), np.float32)
    cov = np.zeros(R * R, bool)
    K = 16
    small = np.flatnonzero(((hi - lo) < K).all(1))
    large = np.flatnonzero(~((hi - lo) < K).all(1))

    def fill(tris, ox, oy, w, h):
        a = uv[tris]                                        # (n, 3, 2)
        xs = ox[:, None, None] + np.arange(w)[None, None, :]
        ys = oy[:, None, None] + np.arange(h)[None, :, None]
        x1, y1 = a[:, 0, 0, None, None], a[:, 0, 1, None, None]
        x2, y2 = a[:, 1, 0, None, None], a[:, 1, 1, None, None]
        x3, y3 = a[:, 2, 0, None, None], a[:, 2, 1, None, None]
        det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
        det = np.where(np.abs(det) < 1e-9, 1e-9, det)
        l1 = ((y2 - y3) * (xs - x3) + (x3 - x2) * (ys - y3)) / det
        l2 = ((y3 - y1) * (xs - x3) + (x1 - x3) * (ys - y3)) / det
        l3 = 1 - l1 - l2
        inside = (l1 >= -1e-3) & (l2 >= -1e-3) & (l3 >= -1e-3) & (xs >= 0) & (ys >= 0) & (xs < R) & (ys < R)
        t, iy, ix = np.nonzero(inside)
        X, Y = xs[t, 0, ix], ys[t, iy, 0]
        bar = np.stack([l1[t, iy, ix], l2[t, iy, ix], l3[t, iy, ix]], 1)
        v = m["tv"][tris[t]]
        idx = Y * R + X
        P[idx] = (m["co"][v] * bar[:, :, None]).sum(1)
        N[idx] = (m["nr"][v] * bar[:, :, None]).sum(1)
        cov[idx] = True

    for start in range(0, len(small), 4000):
        tris = small[start:start + 4000]
        fill(tris, lo[tris, 0], lo[tris, 1], K, K)
    for t in large:
        w, h = hi[t] - lo[t] + 1
        fill(np.array([t]), lo[t:t + 1, 0], lo[t:t + 1, 1], int(w), int(h))
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    return P, N, cov


# --- noise
def hash3(ix, iy, iz, seed):
    h = (ix.astype(np.uint64) * np.uint64(73856093)) ^ (iy.astype(np.uint64) * np.uint64(19349663)) \
        ^ (iz.astype(np.uint64) * np.uint64(83492791)) ^ np.uint64(seed * 2654435761 % 2 ** 32)
    h ^= h >> np.uint64(13)
    h *= np.uint64(1274126177)
    h ^= h >> np.uint64(16)
    return (h & np.uint64(0xFFFFFF)).astype(np.float32) / np.float32(0xFFFFFF)


def vnoise(p, seed=0):
    """Value noise 0..1 with unit cells, smooth."""
    i = np.floor(p).astype(np.int64)
    f = (p - i).astype(np.float32)
    u = f * f * (3 - 2 * f)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (u[:, 0] if dx else 1 - u[:, 0]) * (u[:, 1] if dy else 1 - u[:, 1]) \
                    * (u[:, 2] if dz else 1 - u[:, 2])
                out = out + w * hash3(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out


def fbm(p, octaves, seed=0):
    out, amp, total = 0, 1.0, 0.0
    for o in range(octaves):
        out = out + amp * vnoise(p * (2 ** o), seed + o * 17)
        total += amp
        amp *= 0.5
    return out / total


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# --- nails: one plate per finger on the distal phalanx
NAIL_W = 0.70           # nail half-width over the half-width of the phalanx section
NAIL_LEN = 0.5          # nail length over the distal bone's head-to-tip distance
FREE = 0.4              # the free edge reaches this far past the tip along the bone
THICK = 0.5
RISE = 0.45             # the plate's top above the skin in the middle
SINK = 0.25             # how deep the base and the sides sink into the folds
BASE_ROUND = 2.0        # mm the base's corners curve back: a quarter ellipse into the sides
END_ROUND = 2.6         # the same for the free edge's corners
BULGE = 0.45            # the rim's half-round reaches this far past the outline, over THICK


def corner(u):
    """0 in the middle, 1 at the sides: a quarter ellipse, so the outline meets the sides tangentially."""
    return 1 - np.sqrt(np.clip(1 - np.square(u), 0, 1))


def nail_frame(bvh, B, f):
    """The distal phalanx: axis through the middle of its sections, the dorsal direction along the
    sections' short axis (the bone's -Z is off by 33 degrees on the thumb), tip distance."""
    b = B[f"finger{f}-3.R"]
    H, x, y, dorsal = b["head"], b["x"], b["y"], -b["z"]

    def ray(o, d, far=30):
        hit = bvh.ray_cast(Vector(o), Vector(d), far)
        return np.array(hit[0]) if hit[0] else None

    tip = bvh.ray_cast(Vector(H), Vector(y), 60)[3]
    pts = []
    for s in (0.45, 0.55, 0.65):
        c = H + y * s * tip
        for a in np.radians(np.arange(0, 360, 10)):
            hit = ray(c, dorsal * math.cos(a) + x * math.sin(a))
            if hit is not None:
                pts.append(((hit - c) @ x, (hit - c) @ dorsal))
    pts = np.array(pts)
    centre = pts.mean(0)
    w, v = np.linalg.eigh(np.cov((pts - centre).T))
    minor = v[:, 0] if v[1, 0] > 0 else -v[:, 0]
    d = x * minor[0] + dorsal * minor[1]
    side = x * minor[1] - dorsal * minor[0]
    H = H + x * centre[0] + dorsal * centre[1]
    return dict(H=H, x=side, y=y, d=d, tip=tip, half=float(np.sqrt(w[1]) * 1.41))


def nail_shape(fr):
    tip = fr["tip"]
    s1 = tip + FREE
    s0 = tip - NAIL_LEN * tip
    drop = tip - 3.5                     # past this the skin curves down to the tip
    w = NAIL_W * fr["half"]
    return dict(s0=s0, s1=s1, drop=drop, w=w,
                base=lambda u: s0 + BASE_ROUND * corner(u),
                end=lambda u: s1 - END_ROUND * corner(u),
                width=lambda v: w * (0.88 + 0.12 * np.sqrt(np.clip(v, 0, 1))))


def nail_mesh(bvh, fr, sh, nu=19, bed=14, free=4):
    """Top and bottom surface grids (nu across, rows along) and the colour of each top vertex. Two
    rows 0.08 mm apart run along the smile line, so the white free edge starts on a clean curve.
    Columns crowd towards the sides, where the rounded corners turn."""
    H, x, y, d = fr["H"], fr["x"], fr["y"], fr["d"]
    top, bottom, colour = [], [], []
    nv = bed + 1 + free
    cols = []
    for i in range(nu):
        u = -math.cos(math.pi * i / (nu - 1))
        s_a, s_b = sh["base"](u), sh["end"](u)
        smile = min(sh["drop"] - 0.6 + 1.4 * u * u, s_b - 0.3)
        ss = np.concatenate([np.linspace(s_a, smile, bed), np.linspace(smile + 0.08, s_b, free + 1)])
        height = []
        for s in ss:
            l = u * sh["width"]((s - sh["s0"]) / (sh["s1"] - sh["s0"]))
            o = H + y * s + x * l + d * 25
            hit = bvh.ray_cast(Vector(o), Vector(-d), 40) if s <= sh["drop"] else (None,)
            height.append(25 - hit[3] if hit[0] else None)
        known = [(s, h) for s, h in zip(ss, height) if h is not None]
        (sa, ha), (sb, hb) = known[max(0, len(known) - 4)], known[-1]
        cols.append((u, s_a, ss, height, sb, hb, (hb - ha) / (sb - sa) if sb > sa else 0))
    # Past the drop the plate keeps the line of the skin it lay on, curving down a little; every
    # column at the middle's slope: a side column alone follows the finger's flank down into a flap.
    slope = float(np.median([c[6] for c in cols if abs(c[0]) < 0.5]))
    for u, s_a, ss, height, sb, hb, _ in cols:
        for j, s in enumerate(ss):
            h = height[j] if height[j] is not None else hb + slope * (s - sb) - 0.06 * (s - sb) ** 2
            edge = min(1.0, (1 - abs(u)) * 3, (s - s_a) / 1.2)   # 0 at the folds, 1 inside
            lift = -SINK + (RISE + SINK) * edge * (1 - 0.35 * u * u)
            l = u * sh["width"]((s - sh["s0"]) / (sh["s1"] - sh["s0"]))
            p = H + y * s + x * l + d * (h + lift)
            top.append(p)
            bottom.append(p - d * THICK)
            # Colour: the lunula at the base, the pink bed, the white free edge past the smile line.
            moon = float(smooth(1.2, 0.8, ((s - sh["s0"]) / 2.6) ** 2 + (u / 0.62) ** 2))
            bed_colour = NAIL_BED * (1 - 0.12 * u * u)
            colour.append(NAIL_FREE if j > bed - 1 else bed_colour + (NAIL_MOON - bed_colour) * moon)
    return np.array(top), np.array(bottom), np.array(colour), nu, nv


def build_nails(m, B):
    bvh = BVHTree.FromPolygons([Vector(c) for c in m["co"]], m["polys"])
    old = bpy.data.objects.get("HandNails")
    if old:
        bpy.data.objects.remove(old)
    verts, faces, colours, groups, info = [], [], [], [], {}
    for f in range(1, 6):
        fr = nail_frame(bvh, B, f)
        sh = nail_shape(fr)
        info[f] = (fr, sh)
        top, bottom, colour, nu, nv = nail_mesh(bvh, fr, sh)
        o = len(verts)
        n = nu * nv
        verts += [tuple(p / 1000) for p in top] + [tuple(p / 1000) for p in bottom]
        at = lambda i, j: i * nv + j
        for i in range(nu - 1):
            for j in range(nv - 1):
                q = (at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1))
                faces.append(tuple(o + k for k in q))
                faces.append(tuple(o + n + k for k in reversed(q)))
        # The rim: base, sides and free edge joined top to bottom over a half-round, no sharp edge.
        ring = [at(i, 0) for i in range(nu)] + [at(nu - 1, j) for j in range(1, nv)] \
            + [at(i, nv - 1) for i in range(nu - 2, -1, -1)] + [at(0, j) for j in range(nv - 2, 0, -1)]
        centre = top.mean(0)
        mid = []
        for k, a in enumerate(ring):
            tangent = top[ring[(k + 1) % len(ring)]] - top[ring[k - 1]]
            out = np.cross(tangent, fr["d"])
            out /= max(np.linalg.norm(out), 1e-9)
            if out @ (top[a] - centre) < 0:
                out = -out
            mid.append((top[a] + bottom[a]) / 2 + out * BULGE * THICK)
        verts += [tuple(p / 1000) for p in mid]
        colours += list(colour) + [NAIL_FREE * 0.97] * n + [colour[a] for a in ring]
        groups += [f] * (2 * n + len(ring))
        m0 = o + 2 * n
        for k, (a, b) in enumerate(zip(ring, ring[1:] + ring[:1])):
            ma, mb = m0 + k, m0 + (k + 1) % len(ring)
            faces.append((o + b, o + a, ma, mb))
            faces.append((mb, ma, o + n + a, o + n + b))
    me = bpy.data.meshes.new("HandNails")
    me.from_pydata(verts, [], faces)
    me.validate()
    for p in me.polygons:
        p.use_smooth = True
    attr = me.color_attributes.new("nail", "FLOAT_COLOR", "POINT")
    attr.data.foreach_set("color", np.concatenate([np.c_[np.array(colours), np.ones(len(colours))]]).ravel())
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = me.color_attributes.find("nail")
    nails = bpy.data.objects.new("HandNails", me)
    hand.users_collection[0].objects.link(nails)
    nails.parent = rig
    nails.matrix_parent_inverse = hand.matrix_parent_inverse.copy()
    nails.matrix_basis = hand.matrix_basis.copy()
    for f in range(1, 6):
        g = nails.vertex_groups.new(name=f"finger{f}-3.R")
        g.add([i for i, k in enumerate(groups) if k == f], 1.0, "REPLACE")
    mod = nails.modifiers.new("rig", "ARMATURE")
    mod.object = rig
    nails.data.materials.append(nail_material())
    return info


def nail_material():
    mat = bpy.data.materials.get("nail") or bpy.data.materials.new("nail")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    for n in [n for n in nodes if n.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL")]:
        nodes.remove(n)
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    col = nodes.new("ShaderNodeVertexColor")
    col.layer_name = "nail"
    links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.28
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.35
        bsdf.inputs["Coat Roughness"].default_value = 0.15
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = 0.1
    mat.diffuse_color = (*NAIL_BED, 1)
    return mat


# --- the skin maps
def skin_fields(P, N, B, nails):
    """Colour (linear), roughness and height (mm) of every covered texel."""
    M = len(P)
    names = list(B)
    best = np.full(M, np.inf, np.float32)
    bid = np.zeros(M, np.int32)
    for k, name in enumerate(names):
        b = B[name]
        d = P - b["head"]
        t = np.clip(d @ b["y"] / b["length"], 0, 1)
        dist = np.linalg.norm(d - np.outer(t * b["length"], b["y"]), axis=1)
        closer = dist < best
        best[closer], bid[closer] = dist[closer], k
    on = lambda *bs: np.isin(bid, [names.index(n) for n in bs])
    dn = np.zeros(M, np.float32)            # +1 on the back of the hand, -1 on the palm side
    for k, name in enumerate(names):
        sel = bid == k
        dn[sel] = -(N[sel] @ B[name]["z"])
    back, palm = smooth(0.1, 0.5, dn), smooth(0.15, 0.55, -dn)

    rough = np.full(M, 0.5, np.float32)
    height = np.zeros(M, np.float32)
    colour = np.tile(SKIN, (M, 1))
    # The forearm is a little lighter; the change fades in over the wrist, not at a bone's border.
    arm = smooth(8, -12, (P - B["wrist.R"]["head"]) @ B["wrist.R"]["y"])
    colour += (ARM - SKIN) * arm[:, None]
    colour += (PALM - SKIN) * palm[:, None]
    flush = np.zeros(M, np.float32)
    crease = np.zeros(M, np.float32)
    jitter = (vnoise(P / 1.6, SEED) - 0.5) * 0.7

    def joint(prox, dist_bone, J=None):
        a, b = B[prox], B[dist_bone]
        J = b["head"] if J is None else J
        axis = a["y"] + b["y"]
        axis /= np.linalg.norm(axis)
        sel = on(prox, dist_bone)
        s = (P - J) @ axis
        l = (P - J) @ b["x"]
        return sel, s, l

    def broken(seed, scale=2.2):
        return smooth(0.3, 0.55, vnoise(P / scale, seed))

    rng = np.random.default_rng(SEED + 1)
    warp = (vnoise(P / 3.0, SEED + 2) - 0.5) * 0.6

    def wrinkles(s, l, count, spacing, half, width, arch):
        """Transverse lines across the back of a joint: arched, uneven, each fading out before the
        sides at its own width; the middle lines deepest."""
        out = np.zeros_like(s)
        for k in range(count):
            at = (k - (count - 1) / 2) * spacing + rng.normal(0, 0.18 * spacing)
            reach = half * rng.uniform(0.55, 0.95)
            bow = arch * rng.uniform(0.5, 1.4)
            line = s - at - bow * (l / half) ** 2 + warp
            ends = smooth(reach, reach * 0.6, np.abs(l + rng.normal(0, 0.15 * half)))
            amp = 1 - 0.5 * abs(k - (count - 1) / 2) / max(1, count / 2)
            out = np.maximum(out, amp * ends * np.exp(-(line / width) ** 2))
        return out

    # Knuckle wrinkles on the back, creases on the palm side.
    for f in range(1, 6):
        fingers = [f"finger{f}-{j}.R" for j in (1, 2, 3)]
        joints = [("pip", fingers[0], fingers[1]), ("dip", fingers[1], fingers[2])]
        if f > 1:
            joints.append(("mcp", f"metacarpal{f - 1}.R", fingers[0]))
        for kind, a, b in joints:
            if f == 1 and kind == "pip":
                kind = "thumb-mcp"
            if f == 1 and kind == "dip":
                kind = "thumb-ip"
            sel, s, l = joint(a, b)
            ring = np.sqrt(s ** 2 + (0.42 * l) ** 2) + jitter
            # count, spacing, half-width, line width, arch (mm), depth
            # Lines narrower than about two texels of the 1K maps break into dashes: keep them wide.
            spec = {"pip": (4, 1.4, 7.0, 0.36, 0.9, 0.2), "dip": (3, 1.2, 6.0, 0.34, 0.6, 0.15),
                    "mcp": (3, 2.0, 8.0, 0.4, 1.4, 0.07), "thumb-mcp": (3, 1.4, 8.0, 0.36, 0.9, 0.17),
                    "thumb-ip": (3, 1.3, 7.5, 0.36, 0.8, 0.18)}[kind]
            count, sp, half, width, arch, depth = spec
            wr = wrinkles(s - 0.6, l, count, sp, half, width, arch) * (0.4 + 0.6 * broken(SEED + f * 10 + len(kind), 4.5))
            wr *= back * sel
            crease = np.maximum(crease, 0.8 * wr)
            height -= depth * wr
            flush = np.maximum(flush, sel * back * np.exp(-(ring / (7 if kind == "mcp" else 5)) ** 2) * 0.7)
            # Palmar flexion creases: straight across, a touch curved, at the joint.
            if kind != "mcp":
                bend = s + 0.035 * l * l
                at = {"pip": (-1.0, 0.7), "dip": (-0.8,), "thumb-mcp": (-0.5, 1.0), "thumb-ip": (-0.6, 0.6)}[kind]
                pc = sum(np.exp(-((bend - c + jitter * 0.6) / 0.4) ** 2) for c in at)
                pc = np.clip(pc, 0, 1) * palm * sel
                crease = np.maximum(crease, pc)
                height -= 0.32 * pc
        # The palmar digital crease at the finger's base, about at the web.
        if f > 1:
            sel, s, l = joint(f"metacarpal{f - 1}.R", fingers[0])
            pc = np.exp(-((s - 21 + 0.04 * l * l + jitter) / 0.45) ** 2) * palm * sel
            crease = np.maximum(crease, pc)
            height -= 0.3 * pc
        # Fingertips: pink, the pads a touch glossier.
        b = B[fingers[2]]
        t = ((P - b["head"]) @ b["y"]) / b["length"]
        tipm = on(fingers[2]) * smooth(0.3, 0.9, t)
        flush = np.maximum(flush, tipm * (0.45 + 0.4 * palm))
        rough -= 0.06 * tipm * palm

    # Nail folds: the groove where the plate enters the skin, the darker eponychium behind it.
    for f, (fr, sh) in nails.items():
        sel = on(f"finger{f}-3.R")
        s = (P - fr["H"]) @ fr["y"]
        l = (P - fr["H"]) @ fr["x"]
        u = l / sh["w"]
        base = sh["s0"] + BASE_ROUND * corner(u)
        inside = smooth(1.25, 1.0, np.abs(u)) * back * sel
        groove = np.exp(-((s - base + 0.2) / 0.38) ** 2) * inside
        side = np.exp(-((np.abs(u) - 1.04) / 0.07) ** 2) * (s > base) * (s < sh["drop"]) * back * sel
        band = smooth(-2.2, -0.3, s - base) * smooth(0.2, -0.2, s - base) * inside
        height -= 0.35 * np.maximum(groove, side)
        crease = np.maximum(crease, 0.8 * np.maximum(groove, side))
        flush = np.maximum(flush, 0.55 * band)
        rough -= 0.1 * band

    # Veins on the back of the hand: between the metacarpals, joined near the wrist.
    w = B["wrist.R"]
    O, X = w["head"], B["metacarpal2.R"]["x"]
    Y = sum(B[f"metacarpal{k}.R"]["y"] for k in (1, 2, 3, 4))
    Y = Y / np.linalg.norm(Y)
    q = np.stack([(P - O) @ X, (P - O) @ Y], 1)
    heads = {k: np.array([(B[f"metacarpal{k}.R"]["head"] + B[f"metacarpal{k}.R"]["y"] * B[f"metacarpal{k}.R"]["length"] - O) @ v
                          for v in (X, Y)]) for k in (1, 2, 3, 4)}
    paths = []
    for a, b2 in ((1, 2), (2, 3), (3, 4)):
        end = (heads[a] + heads[b2]) / 2
        start = np.array([end[0] * 0.55, 30.0])
        paths.append([start, start + (end - start) * 0.5 + np.array([1.5, 0]), end - np.array([0, 6])])
    arch = [np.array([heads[1][0] * 0.65, 36.0]), np.array([0.0, 32.0]), np.array([heads[4][0] * 0.6, 38.0])]
    paths.append(arch)
    vein = np.zeros(M, np.float32)
    # Veins meander: the texel is pushed sideways by slow noise before measuring the distance.
    q = q + np.stack([vnoise(P / 9.0, SEED + 3) - 0.5, vnoise(P / 9.0, SEED + 13) - 0.5], 1) * 7.0
    wob = (vnoise(P / 4.0, SEED + 23) - 0.5) * 0.5
    for path in paths:
        for a, b2 in zip(path, path[1:]):
            ab = b2 - a
            t = np.clip(((q - a) @ ab) / (ab @ ab), 0, 1)
            dist = np.linalg.norm(q - (a + t[:, None] * ab), axis=1) + wob
            # A soft, wide bulge: a rounded profile with a hard edge read as a scar.
            vein = np.maximum(vein, np.exp(-(np.maximum(dist, 0) / 1.5) ** 2))
    # Fading out towards the knuckles and, well before it, the wrist: veins that stop at the wrist
    # read as a cut. Here and there along the way, too.
    knuckles = float(np.mean([h[1] for h in heads.values()]))
    vein *= back * smooth(knuckles - 2, knuckles - 16, q[:, 1]) * smooth(24, 36, q[:, 1])
    vein *= 0.45 + 0.55 * vnoise(P / 12.0, SEED + 4)
    height += 0.22 * vein
    colour += (VEIN - colour) * (0.12 * vein)[:, None]

    # Pores and the skin's mottle.
    pores = vnoise(P / 0.45, SEED + 5)
    height += 0.025 * (pores - 0.5) + 0.04 * (fbm(P / 1.2, 3, SEED + 6) - 0.5)
    mottle = fbm(P / 7.0, 3, SEED + 7) - 0.5
    colour *= (1 + 0.10 * mottle)[:, None]
    colour[:, 0] *= 1 + 0.05 * (fbm(P / 15.0, 2, SEED + 8) - 0.5)
    rough += 0.08 * (fbm(P / 3.0, 2, SEED + 9) - 0.5)

    colour += (FLUSH - colour) * (0.55 * flush)[:, None]
    colour += (CREASE - colour) * (0.45 * crease)[:, None]
    rough += 0.12 * crease
    rough -= 0.06 * palm

    hair = hair_alpha(P, N, B, bid, names, back, on)
    colour += (HAIR - colour) * hair[:, None]
    height += 0.012 * hair
    return colour, np.clip(rough, 0.25, 0.8), height, hair


def hair_alpha(P, N, B, bid, names, back, on):
    """Fine body hair: follicles by region, each hair a short curved strand along the surface."""
    rng = np.random.default_rng(SEED)
    M = len(P)
    density = np.zeros(M, np.float32)           # hairs per mm²
    direction = np.zeros((M, 3), np.float32)
    length = np.zeros(M, np.float32)
    fore = B["lowerarm02.R"]
    sel = on("lowerarm02.R")
    # From the hand's own density at the wrist, not a step at the bones' border.
    up = (P[sel] - B["wrist.R"]["head"]) @ -fore["y"]
    density[sel] = back[sel] * (0.03 + 0.07 * smooth(10, 45, up))
    direction[sel] = fore["y"] + fore["x"] * 0.3            # the bone runs elbow to wrist
    length[sel] = 7
    sel = on("wrist.R", "metacarpal1.R", "metacarpal2.R", "metacarpal3.R", "metacarpal4.R")
    wy = B["metacarpal2.R"]["y"]
    toward = (P[sel] - B["wrist.R"]["head"]) @ wy
    density[sel] = back[sel] * np.interp(toward, [0, 30, 70], [0.03, 0.012, 0.002])
    direction[sel] = wy - B["metacarpal2.R"]["x"] * 0.35
    length[sel] = 4.5
    for f in (2, 3, 4, 5):
        b = B[f"finger{f}-1.R"]
        sel = on(f"finger{f}-1.R")
        t = ((P[sel] - b["head"]) @ b["y"]) / b["length"]
        density[sel] = back[sel] * 0.035 * smooth(0.25, 0.4, t) * smooth(0.85, 0.65, t)
        direction[sel] = b["y"] - b["x"] * 0.15
        length[sel] = 3.2
    b = B["finger1-2.R"]
    sel = on("finger1-2.R")
    density[sel] = back[sel] * 0.015
    direction[sel] = b["y"]
    length[sel] = 3
    # Texel area: the covered texels share the mesh's area.
    texel_area = float(MESH_AREA_MM2) / M
    roots = np.flatnonzero(rng.random(M) < density * texel_area)
    # Spatial hash of texel positions, 2 mm cells.
    cell = 2.0
    key3 = np.floor(P / cell).astype(np.int64) + 1000
    keys = (key3[:, 0] * 4000 + key3[:, 1]) * 4000 + key3[:, 2]
    order = np.argsort(keys)
    skeys = keys[order]
    alpha = np.zeros(M, np.float32)
    for r in roots:
        n = N[r]
        d = direction[r] - n * (direction[r] @ n)
        d /= max(np.linalg.norm(d), 1e-6)
        side = np.cross(n, d)
        turn = rng.normal(0, 0.35)
        d = d * math.cos(turn) + side * math.sin(turn)
        side = np.cross(n, d)
        L = length[r] * rng.uniform(0.6, 1.2)
        bend = rng.normal(0, 0.12) * L
        p0 = P[r]
        pts = [p0, p0 + d * L * 0.5 + side * bend * 0.25, p0 + d * L + side * bend]
        lo = np.floor((np.min(pts, 0) - 0.3) / cell).astype(np.int64) + 1000
        hi = np.floor((np.max(pts, 0) + 0.3) / cell).astype(np.int64) + 1000
        cx, cy, cz = np.meshgrid(*[np.arange(lo[k], hi[k] + 1) for k in range(3)], indexing="ij")
        ck = ((cx * 4000 + cy) * 4000 + cz).ravel()
        a, b2 = np.searchsorted(skeys, ck, "left"), np.searchsorted(skeys, ck, "right")
        idx = np.concatenate([order[i:j] for i, j in zip(a, b2) if j > i] or [np.array([], np.int64)])
        if not len(idx):
            continue
        q = P[idx]
        dist = np.full(len(idx), np.inf, np.float32)
        along = np.zeros(len(idx), np.float32)
        for k, (s0, s1) in enumerate(zip(pts, pts[1:])):
            ab = s1 - s0
            t = np.clip(((q - s0) @ ab) / (ab @ ab), 0, 1)
            dd = np.linalg.norm(q - (s0 + t[:, None] * ab), axis=1)
            better = dd < dist
            dist[better], along[better] = dd[better], (k + t[better]) / 2
        # A strand thinner than a texel: faint, fading towards its tip.
        a_ = 0.32 * np.exp(-(dist / 0.05) ** 2) * (1 - 0.6 * along)
        alpha[idx] = np.maximum(alpha[idx], a_)
    print("hairs", len(roots))
    return alpha


def dilate(img, cov, steps):
    """Spreads covered texels into the uncovered margin, so filtering never reads the background."""
    R = math.isqrt(cov.size)
    img = img.reshape(R, R, -1).copy()
    c = cov.reshape(R, R).astype(np.float32)
    for _ in range(steps):
        acc = np.zeros_like(img)
        n = np.zeros_like(c)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(np.roll(img * c[..., None], dy, 0), dx, 1)
            n += np.roll(np.roll(c, dy, 0), dx, 1)
        grow = (c == 0) & (n > 0)
        img[grow] = acc[grow] / n[grow, None]
        c = np.where(grow, 1.0, c)
    mean = img[c > 0].mean(0)
    img[c == 0] = mean
    return img


def down(img, factor):
    R = img.shape[0] // factor
    return img.reshape(R, factor, R, factor, -1).mean((1, 3))


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def image(name, rgb, R, path=None, colour=True, float_buffer=False):
    img = bpy.data.images.get(name)
    if img and (img.size[0] != R or img.is_float != float_buffer):
        bpy.data.images.remove(img)
        img = None
    if not img:
        img = bpy.data.images.new(name, R, R, alpha=False, float_buffer=float_buffer)
    img.colorspace_settings.name = "sRGB" if colour else "Non-Color"
    px = np.ones((R, R, 4), np.float32)
    px[..., :3] = rgb.reshape(R, R, -1)[..., :3] if rgb.shape[-1] >= 3 else rgb.reshape(R, R, 1)
    img.pixels.foreach_set(px.ravel())
    if path:
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
    return img


# --- materials
def skin_material(color, rough, normal):
    mat = bpy.data.materials.get("skin") or bpy.data.materials.new("skin")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    for n in [n for n in nodes if n.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL")]:
        nodes.remove(n)
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    for inp in ("Base Color", "Roughness", "Normal"):
        for link in list(bsdf.inputs[inp].links):
            links.remove(link)

    def tex(img, y):
        n = nodes.new("ShaderNodeTexImage")
        n.image = img
        n.location = (-700, y)
        return n

    links.new(tex(color, 300).outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex(rough, 0).outputs["Color"], bsdf.inputs["Roughness"])
    nm = nodes.new("ShaderNodeNormalMap")
    nm.location = (-300, -300)
    links.new(tex(normal, -300).outputs["Color"], nm.inputs["Color"])
    links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = 0.2
        bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
        bsdf.inputs["Subsurface Scale"].default_value = 0.004
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.45
    mat.diffuse_color = (*SKIN, 1)
    hand.data.materials.clear()
    hand.data.materials.append(mat)
    return mat


def bake_normal(height_img, R, size):
    """Cycles turns the height map (mm) into a tangent-space normal map in the mesh's UVs, at the
    height's own resolution `R`; the normals are then averaged down to `size`."""
    bake = bpy.data.materials.get("skin-bake") or bpy.data.materials.new("skin-bake")
    bake.use_nodes = True
    nodes, links = bake.node_tree.nodes, bake.node_tree.links
    for n in [n for n in nodes if n.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL")]:
        nodes.remove(n)
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    h = nodes.new("ShaderNodeTexImage")
    h.image = height_img
    h.interpolation = "Cubic"
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Distance"].default_value = 0.001          # the height is in millimetres
    bump.inputs["Strength"].default_value = 1.0
    links.new(h.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    target = bpy.data.images.get("skin-normal-bake")
    if target and target.size[0] != R:
        bpy.data.images.remove(target)
        target = None
    target = target or bpy.data.images.new("skin-normal-bake", R, R, alpha=False, float_buffer=True)
    target.colorspace_settings.name = "Non-Color"
    t = nodes.new("ShaderNodeTexImage")
    t.image = target
    nodes.active = t
    keep = list(hand.data.materials)
    hand.data.materials.clear()
    hand.data.materials.append(bake)
    engine = scene.render.engine
    try:
        scene.render.engine = "CYCLES"
    except TypeError as e:
        raise RuntimeError(f"no Cycles: {e}")
    scene.cycles.samples = 4
    # The GPU when the preferences have one (OptiX on this machine); the CPU bakes it too, slower.
    scene.cycles.device = "GPU" if bpy.context.preferences.addons["cycles"].preferences.has_active_device() else "CPU"
    pose = rig.data.pose_position
    rig.data.pose_position = "REST"
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    hand.hide_set(False)
    hand.select_set(True)
    bpy.context.view_layer.objects.active = hand
    try:
        bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", margin=12, use_clear=True)
    finally:
        rig.data.pose_position = pose
        scene.render.engine = engine
        hand.data.materials.clear()
        for m_ in keep:
            hand.data.materials.append(m_)
    px = np.empty(R * R * 4, np.float32)
    target.pixels.foreach_get(px)
    n = down(px.reshape(R, R, 4)[..., :3] * 2 - 1, R // size)
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    return image("skin-normal", n * 0.5 + 0.5, size, os.path.join(OUT, "skin-normal.png"), colour=False)


# --- run
m = rest_mesh()
B = bones_mm()
tri = m["co"][m["tv"]]
MESH_AREA_MM2 = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1).sum()
nails = build_nails(m, B)
print("nails", round(time.time() - started, 1), "s")
R = SIZE * SS
P, N, cov = rasterize(m, R)
print("texels", int(cov.sum()), round(time.time() - started, 1), "s")
idx = np.flatnonzero(cov)
colour, rough, height, hair = skin_fields(P[idx], N[idx], B, nails)
print("fields", round(time.time() - started, 1), "s")


def full(values):
    out = np.zeros((R * R, values.shape[1] if values.ndim > 1 else 1), np.float32)
    out[idx] = values.reshape(len(idx), -1)
    return dilate(out, cov, 24)


colour_img = image("skin-color", to_srgb(down(full(colour), SS)), SIZE, os.path.join(OUT, "skin-color.png"))
rough_img = image("skin-rough", np.repeat(down(full(rough), SS), 3, -1), SIZE, os.path.join(OUT, "skin-rough.png"),
                  colour=False)
height_img = image("skin-height", np.repeat(full(height), 3, -1), R, colour=False, float_buffer=True)
normal_img = bake_normal(height_img, R, SIZE)
skin_material(colour_img, rough_img, normal_img)
print("done", round(time.time() - started, 1), "s; height mm", round(float(height.min()), 2), round(float(height.max()), 2))
