"""
Carrosseries des voitures, modélisées dans Blender (surfaces subdivisées) pour
ressembler aux voitures « jouet » arrondies de la vidéo de référence :
  - mini  : citadine façon Mini (voitures qui roulent, couleur d'accent, toit blanc)
  - sedan : berline ancienne bombée (blanche, garée)
  - hatch : petite citadine ronde (blanche, garée)

Les voitures exportées depuis le site gardent leurs roues, leurs plaques et leur
animation ; seule la carrosserie (enfants du nœud « body ») est remplacée.
Repère local Blender d'une voiture : avant = -Y, haut = +Z, largeur = X, sol à z = 0.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

# --------------------------------------------------------------------------
# formes : sections successives de l'avant (y négatif) vers l'arrière
# zb/zt : bas/haut de la section ; wb/wm/wt : demi-largeurs bas/flanc/haut ;
# zl/zh : bas et haut du flanc vertical
# --------------------------------------------------------------------------
STYLES = {
    "mini": {
        "wheels": (0.53, 0.37),  # y des essieux, voie
        "arch": 0.2,
        "keys": [
            # y      zb    zt     wb    wm     wt     zl     zh    dip
            (-0.866, 0.21, 0.40, 0.33, 0.37, 0.30, 0.25, 0.37, 0.0),
            (-0.850, 0.18, 0.45, 0.39, 0.425, 0.36, 0.22, 0.42, 0.0),
            (-0.800, 0.165, 0.475, 0.405, 0.448, 0.38, 0.21, 0.45, 0.0),
            (-0.600, 0.165, 0.50, 0.41, 0.455, 0.39, 0.21, 0.47, 0.012),
            (-0.380, 0.165, 0.52, 0.41, 0.455, 0.39, 0.21, 0.48, 0.008),
            (-0.290, 0.165, 0.64, 0.41, 0.455, 0.37, 0.21, 0.485, 0.0),
            (-0.200, 0.165, 0.82, 0.41, 0.455, 0.345, 0.21, 0.485, 0.0),
            (0.250, 0.165, 0.84, 0.41, 0.455, 0.345, 0.21, 0.485, 0.0),
            (0.700, 0.165, 0.835, 0.41, 0.455, 0.345, 0.21, 0.485, 0.0),
            (0.800, 0.165, 0.81, 0.405, 0.45, 0.34, 0.21, 0.48, 0.0),
            (0.852, 0.18, 0.75, 0.39, 0.43, 0.33, 0.22, 0.47, 0.0),
            (0.870, 0.21, 0.66, 0.34, 0.38, 0.29, 0.26, 0.45, 0.0),
        ],
        "cabin": (-0.33, 0.83),  # vitres : y début/fin
        "belt": 0.49,
        "roof_line": 0.80,
        "b_pillar": (0.22, 0.31),
        "lamps": {"y": -0.80, "x": 0.27, "z": 0.405, "r": 0.066},
        "tails": {"x": 0.335, "z": (0.40, 0.31), "w": 0.05, "h": 0.07},
        "plate": {"front": 0.26, "rear": 0.32},
        "bumper": 0.195,
        "handle": (0.13, 0.465),
        "mirror": (-0.25, 0.495),
        "grille": None,
        "scoop": False,
    },
    "sedan": {
        "wheels": (0.60, 0.38),
        "arch": 0.215,
        "keys": [
            (-0.956, 0.22, 0.36, 0.30, 0.34, 0.27, 0.26, 0.33, 0.0),
            (-0.935, 0.19, 0.42, 0.37, 0.41, 0.34, 0.23, 0.39, 0.025),
            (-0.870, 0.175, 0.46, 0.41, 0.45, 0.39, 0.21, 0.42, 0.05),
            (-0.700, 0.175, 0.48, 0.43, 0.468, 0.42, 0.21, 0.44, 0.065),
            (-0.470, 0.175, 0.485, 0.43, 0.468, 0.42, 0.21, 0.45, 0.055),
            (-0.360, 0.175, 0.53, 0.43, 0.468, 0.40, 0.21, 0.455, 0.0),
            (-0.200, 0.175, 0.745, 0.43, 0.468, 0.36, 0.21, 0.46, 0.0),
            (0.000, 0.175, 0.775, 0.43, 0.468, 0.355, 0.21, 0.46, 0.0),
            (0.200, 0.175, 0.75, 0.43, 0.468, 0.36, 0.21, 0.46, 0.0),
            (0.340, 0.175, 0.66, 0.43, 0.468, 0.375, 0.21, 0.46, 0.0),
            (0.480, 0.175, 0.53, 0.43, 0.468, 0.395, 0.21, 0.455, 0.0),
            (0.700, 0.175, 0.50, 0.425, 0.465, 0.40, 0.21, 0.45, 0.012),
            (0.880, 0.19, 0.46, 0.40, 0.44, 0.37, 0.23, 0.42, 0.0),
            (0.956, 0.22, 0.40, 0.33, 0.37, 0.30, 0.26, 0.37, 0.0),
        ],
        "cabin": (-0.33, 0.47),
        "belt": 0.46,
        "roof_line": None,
        "b_pillar": (0.02, 0.10),
        "lamps": {"y": -0.86, "x": 0.31, "z": 0.415, "r": 0.062},
        "tails": {"x": 0.345, "z": (0.39, 0.33), "w": 0.045, "h": 0.05},
        "plate": {"front": 0.235, "rear": 0.30},
        "bumper": 0.2,
        "handle": (-0.03, 0.44),
        "mirror": (-0.22, 0.455),
        "grille": {"z": 0.34, "w": 0.13, "h": 0.06, "chrome": True},
        "scoop": False,
    },
    "hatch": {
        "wheels": (0.55, 0.38),
        "arch": 0.205,
        "keys": [
            (-0.886, 0.22, 0.37, 0.31, 0.35, 0.28, 0.26, 0.34, 0.0),
            (-0.866, 0.19, 0.43, 0.37, 0.41, 0.34, 0.23, 0.40, 0.0),
            (-0.800, 0.175, 0.47, 0.405, 0.448, 0.38, 0.21, 0.435, 0.012),
            (-0.600, 0.175, 0.495, 0.42, 0.462, 0.39, 0.21, 0.46, 0.022),
            (-0.400, 0.175, 0.515, 0.42, 0.462, 0.39, 0.21, 0.47, 0.012),
            (-0.330, 0.175, 0.58, 0.42, 0.462, 0.375, 0.21, 0.475, 0.0),
            (-0.100, 0.175, 0.785, 0.42, 0.462, 0.34, 0.21, 0.478, 0.0),
            (0.200, 0.175, 0.81, 0.42, 0.462, 0.335, 0.21, 0.478, 0.0),
            (0.500, 0.175, 0.795, 0.42, 0.462, 0.34, 0.21, 0.478, 0.0),
            (0.700, 0.175, 0.74, 0.42, 0.46, 0.345, 0.21, 0.475, 0.0),
            (0.830, 0.18, 0.62, 0.40, 0.445, 0.34, 0.22, 0.47, 0.0),
            (0.886, 0.22, 0.49, 0.34, 0.38, 0.30, 0.26, 0.44, 0.0),
        ],
        "cabin": (-0.30, 0.76),
        "belt": 0.478,
        "roof_line": None,
        "b_pillar": (0.20, 0.28),
        "lamps": {"y": -0.82, "x": 0.275, "z": 0.415, "r": 0.07},
        "tails": {"x": 0.345, "z": (0.41, 0.34), "w": 0.045, "h": 0.06},
        "plate": {"front": 0.235, "rear": 0.32},
        "bumper": 0.2,
        "handle": (0.10, 0.455),
        "mirror": (-0.19, 0.485),
        "grille": {"z": 0.335, "w": 0.12, "h": 0.05},
        "scoop": True,
    },
}

FIELDS = ("y", "zb", "zt", "wb", "wm", "wt", "zl", "zh", "dip")


def _section(keys, y):
    """Paramètres de section interpolés à la position y."""
    ks = [dict(zip(FIELDS, k)) for k in keys]
    if y <= ks[0]["y"]:
        return dict(ks[0])
    for a, b in zip(ks, ks[1:]):
        if a["y"] <= y <= b["y"]:
            t = (y - a["y"]) / (b["y"] - a["y"])
            t = t * t * (3 - 2 * t)  # transitions douces entre sections
            return {f: a[f] + (b[f] - a[f]) * t for f in FIELDS}
    return dict(ks[-1])


def _arch_bottom(spec, y, zb):
    """Bas de caisse relevé en arc au-dessus des roues (passages de roue)."""
    wy, _ = spec["wheels"]
    R = spec["arch"]
    for c in (-wy, wy):
        d = abs(y - c)
        if d < R:
            zb = max(zb, 0.145 + math.sqrt(R * R - d * d) * 0.98)
    return zb


def _ring(p):
    """Section (x, z) : bas de caisse, flanc, ligne de caisse marquée, épaulement,
    vitrage presque vertical et bord de toit net (points doublés = arêtes tenues
    après subdivision). « dip » creuse le centre du capot entre les ailes."""
    zb, zt, wb, wm, wt, zl, zh, dip = (p[k] for k in ("zb", "zt", "wb", "wm", "wt", "zl", "zh", "dip"))
    zl = max(zl, zb + 0.03)
    zh = max(zh, zl + 0.03)
    zh = min(zh, zt - 0.015)
    g = zt - zh  # hauteur du vitrage (nulle sur le capot)
    ws = wt + (wm - wt) * 0.35  # pied du vitrage (épaulement)
    right = [
        (wb * 0.5, zb),
        (wb * 0.9, zb),
        (wb, zb + 0.016),
        (wm * 0.99, zl - 0.008),
        (wm, zl),
        (wm, zl + (zh - zl) * 0.5),
        (wm, zh - 0.012),
        (wm * 0.985, zh),
        (ws, zh + min(0.02, g * 0.25)),
        (wt + (ws - wt) * 0.25, zt - g * 0.22),
        (wt, zt - min(0.018, g * 0.1)),
        (wt * 0.9, zt - dip * 0.15),
        (wt * 0.6, zt - dip * 0.8),
        (wt * 0.25, zt - dip),
    ]
    left = [(-x, z) for (x, z) in reversed(right)]
    return [(0.0, zb)] + right + [(0.0, zt - dip)] + left


def _loft(name, spec, n_stations=46):
    keys = spec["keys"]
    y0, y1 = keys[0][0], keys[-1][0]
    ys = [y0 + (y1 - y0) * i / (n_stations - 1) for i in range(n_stations)]
    # sections plus serrées autour des roues : passages de roue nets
    wy, _ = spec["wheels"]
    extra = []
    for c in (-wy, wy):
        for d in (-0.19, -0.14, -0.09, -0.045, 0.0, 0.045, 0.09, 0.14, 0.19):
            extra.append(c + d)
    ys = sorted(set([round(y, 4) for y in ys + extra if y0 < y < y1] + [y0, y1]))

    bm = bmesh.new()
    rings = []
    for y in ys:
        p = _section(keys, y)
        p["zb"] = _arch_bottom(spec, y, p["zb"])
        rings.append([bm.verts.new((x, y, z)) for (x, z) in _ring(p)])
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    # extrémités arrondies : éventail vers un point central légèrement en saillie
    for ring, sgn in ((rings[0], -1), (rings[-1], 1)):
        c = sum((v.co for v in ring), Vector()) / n
        tip = bm.verts.new((0.0, c.y + sgn * 0.006, c.z))
        for i in range(n):
            j = (i + 1) % n
            vs = (ring[i], ring[j], tip) if sgn > 0 else (ring[j], ring[i], tip)
            bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _apply_subsurf(ob, levels=3):
    mod = ob.modifiers.new("subsurf", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in ob.data.polygons:
        poly.use_smooth = True


def _box(name, x0, x1, y0, y1, z0, z1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x0 if v.co.x < 0 else x1
        v.co.y = y0 if v.co.y < 0 else y1
        v.co.z = z0 if v.co.z < 0 else z1
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _shell_part(body, name, cutters, offset):
    """Morceau de carrosserie gonflée (offset) contenu dans les volumes « cutters » :
    vitres, toit… épousent exactement la surface avec un petit rebord."""
    part = body.copy()
    part.data = body.data.copy()
    part.name = name
    bpy.context.scene.collection.objects.link(part)
    disp = part.modifiers.new("gonfle", "DISPLACE")
    disp.strength = offset
    disp.mid_level = 0.0
    with bpy.context.temp_override(object=part, active_object=part, selected_objects=[part]):
        bpy.ops.object.modifier_apply(modifier=disp.name)
    # union des volumes de découpe
    cut = cutters[0]
    for extra in cutters[1:]:
        m = cut.modifiers.new("union", "BOOLEAN")
        m.operation = "UNION"
        m.solver = "EXACT"
        m.object = extra
        with bpy.context.temp_override(object=cut, active_object=cut, selected_objects=[cut]):
            bpy.ops.object.modifier_apply(modifier=m.name)
    m = part.modifiers.new("garde", "BOOLEAN")
    m.operation = "INTERSECT"
    m.solver = "EXACT"
    m.object = cut
    with bpy.context.temp_override(object=part, active_object=part, selected_objects=[part]):
        bpy.ops.object.modifier_apply(modifier=m.name)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    for poly in part.data.polygons:
        poly.use_smooth = True
    return part


def _primitive(kind, name, **kw):
    if kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=kw.get("r", 0.05))
    elif kind == "torus":
        bpy.ops.mesh.primitive_torus_add(major_segments=40, minor_segments=12, major_radius=kw["R"], minor_radius=kw["r"])
    elif kind == "cyl":
        bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=kw["r"], depth=kw["d"])
    ob = bpy.context.active_object
    ob.name = name
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def _rounded_box(name, sx, sy, sz, bevel):
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (sx, sy, sz)
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    m = ob.modifiers.new("arrondi", "BEVEL")
    m.width = bevel
    m.segments = 5
    m.limit_method = "NONE"
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=m.name)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    return ob


def _orient(ob, point, normal, up=Vector((0, 0, 1))):
    """Place ob sur la surface : son axe local +Z suit la normale."""
    z = normal.normalized()
    x = up.cross(z)
    if x.length < 1e-6:
        x = Vector((1, 0, 0))
    x.normalize()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = point
    ob.matrix_world = m


def _hit(bvh, origin, direction):
    loc, nor, _, _ = bvh.ray_cast(Vector(origin), Vector(direction).normalized(), 5.0)
    return loc, nor


def build(style, mats, tag):
    """Construit la carrosserie d'un style. mats : dict rôle -> matériau.
    Renvoie la liste des objets (repère voiture, avant = -Y)."""
    spec = STYLES[style]
    objs = []

    body = _loft(f"{tag}_body", spec)
    _apply_subsurf(body, 3)
    body.data.materials.append(mats["paint"])
    objs.append(body)

    # BVH de la carrosserie : pour poser les détails sur la surface
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(body, depsgraph)

    # ---- vitres : bande entre la ligne de caisse et le toit, sauf montants milieu
    c0, c1 = spec["cabin"]
    top = max(k[2] for k in spec["keys"])
    roof_line = spec["roof_line"] or (top - 0.04)
    glass_cut = _box(f"{tag}_gc", -1, 1, c0, c1, spec["belt"] + 0.012, roof_line - 0.012)
    b0, b1 = spec["b_pillar"]
    pillars = [_box(f"{tag}_bp{i}", min(sx * 0.25, sx * 1.2), max(sx * 0.25, sx * 1.2), b0, b1, 0, 2) for i, sx in enumerate((1, -1))]
    for pb in pillars:
        # le montant milieu (côtés) reste couleur carrosserie
        m = glass_cut.modifiers.new("montant", "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.solver = "EXACT"
        m.object = pb
        with bpy.context.temp_override(object=glass_cut, active_object=glass_cut, selected_objects=[glass_cut]):
            bpy.ops.object.modifier_apply(modifier=m.name)
        bpy.data.objects.remove(pb, do_unlink=True)
    glass = _shell_part(body, f"{tag}_glass", [glass_cut], 0.004)
    glass.data.materials.clear()
    glass.data.materials.append(mats["glass"])
    objs.append(glass)

    # ---- toit blanc (citadine)
    if spec["roof_line"]:
        roof_cut = _box(f"{tag}_rc", -1, 1, -2, 2, spec["roof_line"], 2)
        roof = _shell_part(body, f"{tag}_roof", [roof_cut], 0.012)
        roof.data.materials.clear()
        roof.data.materials.append(mats["roof"])
        objs.append(roof)

    # ---- phares ronds (lentille + enjoliveur chromé)
    L = spec["lamps"]
    for sx in (1, -1):
        loc, nor = _hit(bvh, (sx * L["x"], -2.0, L["z"]), (0, 1, 0))
        if loc is None:
            continue
        nor = (nor + Vector((0, -1, 0))).normalized()
        ring = _primitive("torus", f"{tag}_lampring{sx}", R=L["r"], r=L["r"] * 0.22)
        _orient(ring, loc + nor * 0.004, nor)
        ring.data.materials.append(mats["chrome"])
        lens = _primitive("sphere", f"{tag}_lamp{sx}", r=L["r"] * 0.92)
        lens.scale = (1, 1, 0.42)
        _orient(lens, loc + nor * 0.006, nor)
        lens.scale = (1, 1, 0.42)
        lens.data.materials.append(mats["lamp"])
        objs += [ring, lens]

    # ---- feux arrière verticaux (deux pavés rouges de chaque côté)
    T = spec["tails"]
    for sx in (1, -1):
        for i, z in enumerate(T["z"]):
            loc, nor = _hit(bvh, (sx * T["x"], 2.0, z), (0, -1, 0))
            if loc is None:
                continue
            tl = _rounded_box(f"{tag}_tail{sx}{i}", T["w"], T["h"], 0.02, 0.008)
            _orient(tl, loc + nor * 0.004, nor)
            tl.data.materials.append(mats["tail"])
            objs.append(tl)

    # ---- pare-chocs chromés avant / arrière
    for side, sgn in (("front", -1), ("rear", 1)):
        loc, nor = _hit(bvh, (0, sgn * 2.0, spec["bumper"]), (0, -sgn, 0))
        if loc is None:
            continue
        bp = _rounded_box(f"{tag}_bumper_{side}", 0.78, 0.035, 0.045, 0.015)
        bp.location = (0, loc.y + sgn * 0.012, spec["bumper"])
        bp.data.materials.append(mats["chrome"])
        objs.append(bp)

    # ---- calandre sombre (berline, citadine ronde)
    G = spec["grille"]
    if G:
        loc, nor = _hit(bvh, (0, -2.0, G["z"]), (0, 1, 0))
        if loc is not None:
            gr = _rounded_box(f"{tag}_grille", G["w"] * 2, G["h"], 0.02, 0.012)
            _orient(gr, loc + nor * 0.002, nor)
            gr.data.materials.append(mats["chrome"] if G.get("chrome") else mats["dark"])
            objs.append(gr)

    # ---- prise d'air sur le capot (citadine ronde)
    if spec["scoop"]:
        loc, nor = _hit(bvh, (0, -0.55, 2.0), (0, 0, -1))
        if loc is not None:
            sc = _rounded_box(f"{tag}_scoop", 0.16, 0.12, 0.03, 0.012)
            _orient(sc, loc + nor * 0.004, nor, up=Vector((0, -1, 0)))
            sc.data.materials.append(mats["paint"])
            objs.append(sc)

    # ---- poignées de porte et rétroviseurs
    hy, hz = spec["handle"]
    my, mz = spec["mirror"]
    for sx in (1, -1):
        loc, nor = _hit(bvh, (sx * 2.0, hy, hz), (-sx, 0, 0))
        if loc is not None:
            h = _rounded_box(f"{tag}_handle{sx}", 0.012, 0.075, 0.02, 0.008)
            h.location = loc + nor * 0.006
            h.data.materials.append(mats["chrome"])
            objs.append(h)
        loc, nor = _hit(bvh, (sx * 2.0, my, mz), (-sx, 0, 0))
        if loc is not None:
            mi = _rounded_box(f"{tag}_mirror{sx}", 0.05, 0.03, 0.035, 0.012)
            mi.location = loc + Vector((sx * 0.022, 0, 0.022))
            mi.data.materials.append(mats["paint"])
            objs.append(mi)

    return objs, bvh


def plate_spot(style, bvh, rear):
    """Position et normale d'une plaque (avant ou arrière) sur la carrosserie."""
    spec = STYLES[style]
    z = spec["plate"]["rear" if rear else "front"]
    sgn = 1 if rear else -1
    loc, nor = _hit(bvh, (0, sgn * 2.0, z), (0, -sgn, 0))
    return loc, nor
