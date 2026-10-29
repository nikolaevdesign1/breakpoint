#!/bin/sh
# Round 6 (rows 62–71) + row 80 (footpaths): rebuild everything procedural, re-pack lightmap UVs, rebake, export, optimise.
#   sh scripts/lookdev/build_round6.sh            (all steps)
#   SKIP_BAKE=1 sh scripts/lookdev/build_round6.sh (geometry only, keeps the old lightmaps)
set -e
cd "$(dirname "$0")/../.."
B=/Applications/Blender.app/Contents/MacOS/Blender
F=blender/clay_courts.blend
for s in courts_round6 footpaths cars clubhouse_detail decor rest_zone garden dome_rolls lightmap_uvs; do
  echo "== $s"; $B -b --factory-startup $F --python scripts/lookdev/$s.py 2>&1 | grep -E "done|tris|Error|Traceback|lightmap|WARNING|ON PATH" || true
done
[ -n "$SKIP_BAKE" ] || $B -b --factory-startup $F --python scripts/lookdev/bake_lightmaps.py 2>&1 | grep -E "lightmap|device|done|Error"
$B -b --factory-startup $F --python scripts/lookdev/export_glb.py 2>&1 | grep -E "exported|Error"
npm run model
