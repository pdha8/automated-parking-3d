#!/bin/bash
# Rend toutes les versions des scènes 3D avec Blender puis les encode en MP4
# pour le site (public/video/). Usage : bash blender/render_all.sh [liste de variantes]
#   variantes : hero_teal gate_teal hero_teal_dark gate_teal_dark hero_blue gate_blue hero_green gate_green
# La cadence et le nombre d'images viennent de l'export (blender/work/<scène>/meta.json).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BLENDER="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
SAMPLES="${SAMPLES:-40}"
OUTDIR="$ROOT/public/video"
mkdir -p "$OUTDIR"
VARIANTS="${*:-hero_teal gate_teal hero_teal_dark gate_teal_dark hero_blue gate_blue hero_green gate_green}"

meta() { # meta <scène> <clé>
  node -e "process.stdout.write(String(require(process.argv[1])[process.argv[2]]))" "$(cygpath -w "$ROOT/blender/work/$1/meta.json")" "$2"
}

for v in $VARIANTS; do
  scene="${v%%_*}"; rest="${v#*_}"; accent="${rest%%_*}"
  dark=""; [[ "$v" == *_dark ]] && dark="--dark"
  fps=$(meta "$scene" fps); count=$(meta "$scene" frames)
  frames="$ROOT/blender/work/render/$v"
  echo "=== $v : rendu de $count images à $fps i/s ($(date +%H:%M:%S))"
  rm -rf "$frames"
  "$BLENDER" -b --factory-startup -P "$ROOT/blender/render.py" -- --scene "$scene" --accent "$accent" $dark --samples "$SAMPLES" --out "$frames" > "$ROOT/blender/work/render_$v.log" 2>&1
  n=$(ls "$frames"/*.png 2>/dev/null | wc -l)
  if [ "$n" -lt "$count" ]; then echo "!!! $v : seulement $n images sur $count, voir blender/work/render_$v.log"; continue; fi
  echo "=== $v : encodage ($(date +%H:%M:%S))"
  size=$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=s=x:p=0 "$frames/0000.png")
  common=(-c:v libx264 -preset slow -crf 20 -profile:v high -g "$fps" -bf 2
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv
    -movflags +faststart -an "$OUTDIR/$v.mp4")
  if [ -n "$dark" ]; then
    ffmpeg -v error -y -framerate "$fps" -start_number 0 -i "$frames/%04d.png" \
      -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv" \
      "${common[@]}"
  else
    # jour : images transparentes posées sur la couleur de fond de la page
    ffmpeg -v error -y -framerate "$fps" -start_number 0 -i "$frames/%04d.png" \
      -f lavfi -i "color=c=0xd6d4d2:s=$size:r=$fps" \
      -filter_complex "[1][0]overlay=shortest=1:format=auto,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv" \
      "${common[@]}"
  fi
  ls -la "$OUTDIR/$v.mp4"
  rm -rf "$frames"
done
# images fixes (si la lecture automatique est bloquée)
bash "$ROOT/blender/posters.sh" > /dev/null
echo "=== TERMINE ($(date +%H:%M:%S))"
