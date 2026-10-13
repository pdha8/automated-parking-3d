"""
Position de la bulle du robot, image par image, calculée avec la caméra du
rendu Blender (même cadrage que la vidéo du hero).

Lit blender/work/hero/ (scène exportée + bubble.json pour le contenu de la
bulle) et écrit src/data/hero-bubble.json pour le site.

  blender -b --factory-startup -P blender/bubble.py
"""

import json
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render  # noqa: E402  (fonctions communes, sans lancer de rendu)

# ancre de la bulle : enfant du robot, (0.42, 0.42, 0) en coordonnées three.js (Y vers le haut)
ANCHOR = Vector((0.42, 0.0, 0.42))


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    folder = os.path.join(render.WORK, "hero")
    meta = json.load(open(os.path.join(folder, "meta.json")))
    fr = meta["frame"]
    scene.render.fps = meta["fps"]
    scene.render.resolution_x = fr["w"]
    scene.render.resolution_y = fr["h"]
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
    bpy.ops.import_scene.gltf(filepath=os.path.join(folder, "hero.glb"))
    cam = render.setup_camera(scene, meta, "cam_hero")
    robot = bpy.data.objects["robot"]
    for c in robot.children:
        print("CHILD", c.name, c.type, tuple(round(v, 3) for v in c.location))

    data = json.load(open(os.path.join(folder, "bubble.json")))
    for f, entry in enumerate(data):
        scene.frame_set(f)
        p = world_to_camera_view(scene, cam, robot.matrix_world @ ANCHOR)
        # cadre (origine en bas à gauche) -> scène de la maquette (origine en haut à gauche)
        entry["x"] = round((p.x * fr["w"] - fr["marginX"]) / fr["stageW"], 5)
        entry["y"] = round(((1 - p.y) * fr["h"] - fr["marginY"]) / fr["stageH"], 5)
        if f % 45 == 0:
            print("BUBBLE", f, entry["x"], entry["y"])

    out = os.path.join(render.ROOT, "src", "data", "hero-bubble.json")
    with open(out, "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print("WROTE", out, len(data))


main()
