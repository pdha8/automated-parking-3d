"""
Rendu Blender (Cycles / GPU) des scènes du site "Automated Parking".

Les scènes sont exportées depuis le site (http://localhost:5173/?export) dans
blender/work/<scene>/ : géométrie + animation (glTF), séquences d'images des
écrans et de la visière du robot, paramètres de caméra.

Exemples :
  blender -b --factory-startup -P blender/render.py -- --scene hero --accent teal
  blender -b --factory-startup -P blender/render.py -- --scene hero --accent blue --dark
  blender -b --factory-startup -P blender/render.py -- --scene gate --accent teal --frames 1-270
  blender -b --factory-startup -P blender/render.py -- --scene loader
"""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORK = os.path.join(HERE, "work")

ACCENTS = {"teal": "#29bbba", "blue": "#277bc5", "green": "#27b938"}

# zones utiles du cadre (x0, x1, y0, y1 ; origine en bas à gauche)
BORDERS = {"hero": (0.42, 1.0, 0.0, 1.0), "gate": (0.0, 1.0, 0.05, 0.88)}


# --------------------------------------------------------------------------
# utilitaires
# --------------------------------------------------------------------------
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_lin(h, a=1.0):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4)) + (a,)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--scene", default="hero", choices=["hero", "gate", "loader"])
    p.add_argument("--accent", default="teal", choices=list(ACCENTS))
    p.add_argument("--dark", action="store_true")
    p.add_argument("--frames", default="0-269")
    p.add_argument("--samples", type=int, default=96)
    p.add_argument("--scale", type=float, default=1.5, help="pixels par unité de maquette")
    p.add_argument("--out", default=None)
    p.add_argument("--still", action="store_true", help="une seule image (aperçu)")
    p.add_argument("--save-blend", action="store_true")
    return p.parse_args(argv)


def principled(mat):
    if not mat or not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            return n
    return None


def set_input(node, names, value):
    for name in names if isinstance(names, (list, tuple)) else [names]:
        if name in node.inputs:
            node.inputs[name].default_value = value
            return True
    return False


# --------------------------------------------------------------------------
# rendu
# --------------------------------------------------------------------------
def setup_render(scene, args, meta, transparent):
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type in ("OPTIX",)
    scene.cycles.device = "GPU"
    scene.cycles.samples = args.samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.02
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPTIX"
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 3
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.cycles.blur_glossy = 1.0

    fr = meta["frame"]
    scene.render.resolution_x = int(round(fr["w"] * args.scale / 2) * 2)
    scene.render.resolution_y = int(round(fr["h"] * args.scale / 2) * 2)
    scene.render.resolution_percentage = 100
    scene.render.fps = meta.get("fps", 30)
    scene.render.film_transparent = transparent
    scene.render.use_motion_blur = not args.still
    scene.render.motion_blur_shutter = 0.35

    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = -0.12
    scene.view_settings.gamma = 1.0

    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15


def setup_camera(scene, meta, name):
    cam = bpy.data.objects.get(name)
    if cam is None:
        cams = [o for o in bpy.data.objects if o.type == "CAMERA"]
        cam = cams[0]
    scene.camera = cam
    cd = cam.data
    cd.sensor_fit = "VERTICAL"
    cd.angle_y = math.radians(meta["cameraFrameFov"])
    # three.js : setViewOffset décale la fenêtre ; Blender : shift_x déplace la vue (signe opposé)
    # avec sensor_fit VERTICAL, le décalage est exprimé en hauteurs d'image
    ratio = meta["frame"]["w"] / meta["frame"]["h"]
    cd.shift_x = -meta.get("shiftX", 0.0) * ratio
    cd.shift_y = meta.get("shiftY", 0.0) * ratio
    cd.clip_start = 0.1
    cd.clip_end = 5000
    return cam


def setup_world(scene, strength, rotation_deg=0.0, tint=(1, 1, 1, 1), hdri=False, camera_color=None):
    if not hdri:
        world = bpy.data.worlds.new("sky")
        scene.world = world
        world.use_nodes = True
        nt = world.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputWorld")
        bg = nt.nodes.new("ShaderNodeBackground")
        bg.inputs["Color"].default_value = tint
        bg.inputs["Strength"].default_value = strength
        if camera_color is None:
            nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
            return world
        # le ciel éclaire la scène, mais la caméra voit un fond de la couleur du sol au loin
        seen = nt.nodes.new("ShaderNodeBackground")
        seen.inputs["Color"].default_value = camera_color
        seen.inputs["Strength"].default_value = 1.0
        path = nt.nodes.new("ShaderNodeLightPath")
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(path.outputs["Is Camera Ray"], mix.inputs["Fac"])
        nt.links.new(bg.outputs["Background"], mix.inputs[1])
        nt.links.new(seen.outputs["Background"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
        return world
    world = bpy.data.worlds.new("studio")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    mapping = nt.nodes.new("ShaderNodeMapping")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = tint
    path = os.path.join(os.path.dirname(bpy.app.binary_path), bpy.app.version_string[:3], "datafiles", "studiolights", "world", "studio.exr")
    env.image = bpy.data.images.load(path)
    mapping.inputs["Rotation"].default_value[2] = math.radians(rotation_deg)
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], mix.inputs["A"])
    nt.links.new(mix.outputs["Result"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return world


def three_to_blender(v):
    """Repère three.js (Y en haut) -> Blender (Z en haut)."""
    return Vector((v[0], -v[2], v[1]))


# direction d'où vient la lumière (repère Blender : la caméra est du côté -Y)
KEY_FROM = Vector((-0.6, -0.42, 0.68)).normalized()


def add_key_light(meta, energy, size, color=(1, 1, 1), source=None):
    direction = -(source or KEY_FROM)
    light = bpy.data.lights.new("key", "SUN")
    light.energy = energy
    light.angle = math.radians(size)
    light.color = color
    obj = bpy.data.objects.new("key", light)
    bpy.context.scene.collection.objects.link(obj)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def add_floor(shadow_catcher, color_lin):
    # très grand : le bord du sol ne doit jamais entrer dans le cadre (caméra de la borne rasante)
    bpy.ops.mesh.primitive_plane_add(size=4000, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = "floor"
    mat = bpy.data.materials.new("floor")
    mat.use_nodes = True
    bsdf = principled(mat)
    set_input(bsdf, "Base Color", color_lin)
    set_input(bsdf, "Roughness", 0.95)
    set_input(bsdf, ["Specular IOR Level", "Specular"], 0.15)
    floor.data.materials.append(mat)
    floor.is_shadow_catcher = shadow_catcher
    return floor


# --------------------------------------------------------------------------
# matériaux
# --------------------------------------------------------------------------
def tune_materials(accent_hex, dark):
    acc = hex_lin(accent_hex)
    for mat in bpy.data.materials:
        b = principled(mat)
        if not b:
            continue
        name = mat.name.split(".")[0]
        if name in ("paint", "accent"):
            set_input(b, "Base Color", acc)
            set_input(b, "Roughness", 0.3 if name == "paint" else 0.38)
            set_input(b, ["Coat Weight", "Coat"], 0.6 if name == "paint" else 0.12)
            set_input(b, "Coat Roughness", 0.12)
        elif name in ("whitePaint", "roof", "white", "robot", "robotDetail"):
            set_input(b, ["Coat Weight", "Coat"], 0.6)
            set_input(b, "Coat Roughness", 0.1)
        elif name == "glass":
            set_input(b, "Roughness", 0.06)
            set_input(b, ["Coat Weight", "Coat"], 1.0)
        elif name in ("lamp",):
            set_input(b, ["Emission Color", "Emission"], hex_lin("#fff1d6"))
            set_input(b, "Emission Strength", 18.0 if dark else 0.0)
        elif name in ("tail",):
            set_input(b, ["Emission Color", "Emission"], hex_lin("#ff2a2a"))
            set_input(b, "Emission Strength", 6.0 if dark else 0.6)


def flip_uv(nt, tex):
    """Les images du canvas ne sont pas retournées comme celles du glTF : on inverse V."""
    uv = nt.nodes.new("ShaderNodeUVMap")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value[1] = -1.0
    mp.inputs["Location"].default_value[1] = 1.0
    nt.links.new(uv.outputs["UV"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])


def no_shadow(root_names):
    """Le robot flotte : il ne projette pas d'ombre (comme dans la vidéo)."""
    for name in root_names:
        root = bpy.data.objects.get(name)
        if not root:
            continue
        for o in [root, *root.children_recursive]:
            o.visible_shadow = False


def image_sequence(path_first, frames):
    img = bpy.data.images.load(path_first)
    img.source = "SEQUENCE"
    return img


def sequence_material(obj, folder, frames, emission, alpha=False, coat=0.0, roughness=0.3):
    """Matériau dont la texture est une séquence d'images (écrans, visière)."""
    first = os.path.join(folder, "0001.png")
    mat = bpy.data.materials.new(f"seq_{obj.name}")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = principled(mat)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image_sequence(first, frames)
    tex.image_user.frame_duration = frames
    tex.image_user.frame_start = 0  # image n°1 = image 0 de la scène
    tex.image_user.frame_offset = 0
    tex.image_user.use_cyclic = True
    tex.image_user.use_auto_refresh = True
    tex.interpolation = "Cubic"
    flip_uv(nt, tex)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    emi = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
    nt.links.new(tex.outputs["Color"], bsdf.inputs[emi])
    set_input(bsdf, "Emission Strength", emission)
    set_input(bsdf, "Roughness", roughness)
    set_input(bsdf, ["Coat Weight", "Coat"], coat)
    set_input(bsdf, "Coat Roughness", 0.05)
    if alpha:
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "DITHERED"
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


def still_material(obj, image_path, emission, alpha=False, coat=0.0, roughness=0.3):
    mat = bpy.data.materials.new(f"img_{obj.name}")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = principled(mat)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(image_path)
    flip_uv(nt, tex)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    emi = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
    nt.links.new(tex.outputs["Color"], bsdf.inputs[emi])
    set_input(bsdf, "Emission Strength", emission)
    set_input(bsdf, "Roughness", roughness)
    set_input(bsdf, ["Coat Weight", "Coat"], coat)
    if alpha:
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def find_mesh(name):
    o = bpy.data.objects.get(name)
    if o and o.type == "MESH":
        return o
    # le nœud nommé peut être un parent vide : on prend le premier maillage enfant
    if o:
        for c in o.children_recursive:
            if c.type == "MESH":
                return c
    return None


# --------------------------------------------------------------------------
# phares (mode nuit)
# --------------------------------------------------------------------------
def beam_material():
    mat = bpy.data.materials.get("beam")
    if mat:
        return mat
    mat = bpy.data.materials.new("beam")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix = nt.nodes.new("ShaderNodeMixShader")
    transp = nt.nodes.new("ShaderNodeBsdfTransparent")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = hex_lin("#fff4e2")
    emit.inputs["Strength"].default_value = 1.1
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    # le cône est orienté selon -Z local : 0 au phare, 1 au bout
    fall = nt.nodes.new("ShaderNodeMapRange")
    fall.inputs["From Min"].default_value = 0.0
    fall.inputs["From Max"].default_value = -2.0
    fall.inputs["To Min"].default_value = 1.0
    fall.inputs["To Max"].default_value = 0.0
    power = nt.nodes.new("ShaderNodeMath")
    power.operation = "POWER"
    power.inputs[1].default_value = 2.2
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.5
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    soft = nt.nodes.new("ShaderNodeMath")
    soft.operation = "POWER"
    soft.inputs[1].default_value = 2.5
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul2 = nt.nodes.new("ShaderNodeMath")
    mul2.operation = "MULTIPLY"
    mul2.inputs[1].default_value = 0.42
    nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], fall.inputs["Value"])
    nt.links.new(fall.outputs["Result"], power.inputs[0])
    nt.links.new(lw.outputs["Facing"], inv.inputs[1])
    nt.links.new(power.outputs["Value"], mul.inputs[0])
    nt.links.new(inv.outputs["Value"], soft.inputs[0])
    nt.links.new(soft.outputs["Value"], mul.inputs[1])
    nt.links.new(mul.outputs["Value"], mul2.inputs[0])
    nt.links.new(mul2.outputs["Value"], mix.inputs["Fac"])
    nt.links.new(transp.outputs["BSDF"], mix.inputs[1])
    nt.links.new(emit.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    return mat


def add_headlights(body_names):
    """Spots + faisceaux visibles devant chaque voiture animée."""
    count = 0
    for bname in body_names:
        body = bpy.data.objects.get(bname)
        if not body:
            continue
        lenses = [c for c in body.children_recursive if c.type == "MESH" and any(m and m.name.split(".")[0] == "lamp" for m in c.data.materials)]
        if not lenses:
            continue
        # direction "avant" de la voiture dans le repère monde (+Z three -> -Y local Blender après import)
        mw = body.matrix_world
        fwd = (mw.to_3x3() @ Vector((0, -1, 0))).normalized()
        for lens in lenses:
            spot = bpy.data.lights.new(f"spot_{lens.name}", "SPOT")
            spot.energy = 90
            spot.spot_size = math.radians(48)
            spot.spot_blend = 0.85
            spot.shadow_soft_size = 0.05
            spot.color = (1.0, 0.95, 0.86)
            so = bpy.data.objects.new(spot.name, spot)
            bpy.context.scene.collection.objects.link(so)
            so.parent = body
            so.matrix_parent_inverse = body.matrix_world.inverted()
            so.location = lens.matrix_world.translation + fwd * 0.03
            down = Vector((fwd.x, fwd.y, -0.18)).normalized()
            so.rotation_euler = down.to_track_quat("-Z", "Z").to_euler()
            # faisceau
            bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=0.0, radius2=0.62, depth=2.0, end_fill_type="NOTHING")
            cone = bpy.context.active_object
            cone.name = f"beam_{lens.name}"
            for poly in cone.data.polygons:
                poly.use_smooth = True
            # pointe au phare, ouverture vers -Z local
            for v in cone.data.vertices:
                v.co.z -= 1.0
            cone.data.materials.append(beam_material())
            cone.parent = so
            cone.matrix_parent_inverse.identity()
            cone.location = (0, 0, 0)
            cone.rotation_euler = (math.radians(9), 0, 0)
            cone.visible_shadow = False
            count += 1
    return count


def add_area_glow(scene_name):
    """Grande lumière douce au-dessus de la zone 3D (sol plus clair au centre, la nuit)."""
    center = Vector((2.6, -4.0, 0.0)) if scene_name == "hero" else Vector((0.4, -0.6, 0.0))
    size = 9.0 if scene_name == "hero" else 5.0
    light = bpy.data.lights.new("glow", "AREA")
    light.shape = "DISK"
    light.size = size
    light.energy = 520 if scene_name == "hero" else 200
    light.color = (0.95, 0.96, 1.0)
    obj = bpy.data.objects.new("glow", light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = center + Vector((0, 0, 7.0))
    return obj


# --------------------------------------------------------------------------
# scènes
# --------------------------------------------------------------------------
def build_scene(args):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    folder = os.path.join(WORK, args.scene)
    meta = json.load(open(os.path.join(folder, "meta.json")))
    scene.render.fps = meta["fps"]
    scene.frame_start = 0
    scene.frame_end = meta["frames"] - 1
    bpy.ops.import_scene.gltf(filepath=os.path.join(folder, f"{args.scene}.glb"))
    for o in bpy.data.objects:
        o.select_set(False)

    dark = args.dark
    transparent = not dark
    setup_render(scene, args, meta, transparent)
    # en mode jour, seule la zone qui contient la 3D est calculée (le reste est transparent)
    border = None if dark else BORDERS.get(args.scene)
    if border:
        scene.render.use_border = True
        scene.render.use_crop_to_border = False
        scene.render.border_min_x, scene.render.border_max_x, scene.render.border_min_y, scene.render.border_max_y = border
    setup_camera(scene, meta, "cam_hero" if args.scene == "hero" else "cam_gate")
    tune_materials(ACCENTS[args.accent], dark)

    if dark:
        setup_world(scene, 0.16, tint=hex_lin("#cdd2da"), camera_color=hex_lin("#1a1a1b"))
        add_key_light(meta, energy=0.7, size=10, color=(0.86, 0.9, 1.0))
        add_floor(False, hex_lin("#2b2b2b"))
        add_area_glow(args.scene)
        n = add_headlights(["car0_body", "car1_body"] if args.scene == "hero" else ["gcar_body"])
        print("HEADLIGHTS", n)
    else:
        setup_world(scene, 0.45)
        add_key_light(meta, energy=2.9, size=11)
        add_floor(True, hex_lin("#d6d4d2"))
        no_shadow(["robot", "grobot"])

    # écrans et visière : séquences d'images exportées depuis le site
    frames = meta["frames"]
    screen = find_mesh("exit_screen" if args.scene == "hero" else "gate_screen")
    if screen:
        sequence_material(screen, os.path.join(folder, "screen"), frames, emission=0.35, roughness=0.32)
    visor = find_mesh("robot_visor" if args.scene == "hero" else "grobot_visor")
    if visor:
        sequence_material(visor, os.path.join(folder, "visor"), frames, emission=1.2, alpha=True, coat=1.0, roughness=0.1)
    return scene, meta


def build_loader(args):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    folder = os.path.join(WORK, "loader")
    meta = {"frame": {"w": 380, "h": 240}, "fps": 30, "cameraFrameFov": 22.0}
    bpy.ops.import_scene.gltf(filepath=os.path.join(folder, "loader.glb"))
    setup_render(scene, args, meta, True)
    scene.render.use_motion_blur = False
    setup_camera(scene, meta, "cam_loader")
    tune_materials(ACCENTS["teal"], False)
    # même éclairage que les scènes (ciel doux + soleil avant-gauche)
    setup_world(scene, 0.45)
    add_key_light(meta, energy=2.9, size=11)
    visor = find_mesh("lrobot_visor")
    if visor:
        still_material(visor, os.path.join(folder, "visor.png"), emission=1.0, alpha=True, coat=0.7, roughness=0.12)
    return scene


def main():
    args = parse_args()
    if args.scene == "loader":
        scene = build_loader(args)
        out = args.out or os.path.join(WORK, "render", "loader")
        os.makedirs(out, exist_ok=True)
        scene.render.filepath = os.path.join(out, "robot.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", scene.render.filepath)
        return

    scene, meta = build_scene(args)
    name = f"{args.scene}_{args.accent}{'_dark' if args.dark else ''}"
    out = args.out or os.path.join(WORK, "render", name)
    os.makedirs(out, exist_ok=True)
    if args.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f"{name}.blend"))
    a, b = (int(x) for x in args.frames.split("-")) if "-" in args.frames else (int(args.frames), int(args.frames))
    if args.still:
        scene.frame_set(a)
        scene.render.filepath = os.path.join(out, f"still_{a:04d}.png")
        bpy.ops.render.render(write_still=True)
        print("RENDERED", scene.render.filepath)
        return
    scene.frame_start = a
    scene.frame_end = b
    scene.render.filepath = os.path.join(out, "")
    scene.render.use_file_extension = True
    bpy.ops.render.render(animation=True)
    print("RENDERED", out, a, b)


if __name__ == "__main__":
    main()
