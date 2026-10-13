#!/bin/bash
# Rend toutes les versions des scènes 3D avec Blender puis les encode en MP4
# pour le site (public/video/). Usage : bash blender/render_all.sh [liste de variantes]
#   variantes : hero_teal gate_teal hero_teal_dark gate_teal_dark hero_blue gate_blue hero_green gate_green
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BLENDER="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
SAMPLES="${SAMPLES:-48}"
OUTDIR="$ROOT/public/video"
mkdir -p "$OUTDIR"
VARIANTS="${*:-hero_teal gate_teal hero_teal_dark gate_teal_dark hero_blue gate_blue hero_green gate_green}"

for v in $VARIANTS; do
  scene="${v%%_*}"; rest="${v#*_}"; accent="${rest%%_*}"
  dark=""; [[ "$v" == *_dark ]] && dark="--dark"
  frames="$ROOT/blender/work/render/$v"
  echo "=== $v : rendu ($(date +%H:%M:%S))"
  rm -rf "$frames"
  "$BLENDER" -b --factory-startup -P "$ROOT/blender/render.py" -- --scene "$scene" --accent "$accent" $dark --samples "$SAMPLES" --out "$frames" > "$ROOT/blender/work/render_$v.log" 2>&1
  n=$(ls "$frames"/*.png 2>/dev/null | wc -l)
  if [ "$n" -lt 270 ]; then echo "!!! $v : seulement $n images, voir blender/work/render_$v.log"; continue; fi
  echo "=== $v : encodage ($(date +%H:%M:%S))"
  if [ -n "$dark" ]; then
    ffmpeg -v error -y -framerate 30 -start_number 0 -i "$frames/%04d.png" \
      -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
      -c:v libx264 -preset slow -crf 20 -profile:v high -g 30 -bf 2 \
      -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
      -movflags +faststart -an "$OUTDIR/$v.mp4"
  else
    ffmpeg -v error -y -framerate 30 -start_number 0 -i "$frames/%04d.png" \
      -f lavfi -i "color=c=0xd6d4d2:s=2100x1284:r=30" \
      -filter_complex "[1][0]overlay=shortest=1:format=auto,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
      -c:v libx264 -preset slow -crf 20 -profile:v high -g 30 -bf 2 \
      -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
      -movflags +faststart -an "$OUTDIR/$v.mp4"
  fi
  ls -la "$OUTDIR/$v.mp4"
  rm -rf "$frames"
done
# images fixes (si la lecture automatique est bloquée)
bash "$ROOT/blender/posters.sh" > /dev/null
echo "=== TERMINE ($(date +%H:%M:%S))"
