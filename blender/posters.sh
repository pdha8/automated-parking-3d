#!/bin/bash
# Image fixe (première image) de chaque vidéo, affichée si la lecture automatique
# est bloquée (iPhone en mode économie d'énergie). Usage : bash blender/posters.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for f in "$ROOT"/public/video/*.mp4; do
  ffmpeg -v error -y -i "$f" -frames:v 1 -q:v 3 "${f%.mp4}.jpg"
  ls -la "${f%.mp4}.jpg"
done
