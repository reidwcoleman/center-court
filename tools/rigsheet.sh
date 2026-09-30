#!/bin/bash
# contact sheet of stroke phases: tools/rigsheet.sh "fh bh serve" "0 0.2 0.36 0.47 0.55 0.7 1" [cam]
KINDS=${1:-"fh bh serve"}
PHASES=${2:-"0 0.2 0.36 0.47 0.55 0.7 1"}
CAM=${3:-"__cam(3.2,1.7,9.6,0,1.15,12.5,30)"}
ARGS=(--w 900 --h 900 --pump 4 --eval "$CAM" --out shots/rs_base.png)
FILES=()
for k in $KINDS; do for p in $PHASES; do
  cy=0.95; [ "$k" = "serve" ] && cy=2.72; [ "$k" = "smash" ] && cy=2.65
  cx=0.8; [ "$k" = "bh" -o "$k" = "bhSlice" -o "$k" = "bhVolley" ] && cx=-0.72; [ "$k" = "serve" -o "$k" = "smash" ] && cx=0.28
  ARGS+=(--eval "__pose('$k',$p,$cx,$cy,12.6-0.45);1" --out shots/rs_${k}_${p}.png)
  FILES+=(shots/rs_${k}_${p}.png)
done; done
node tools/shot.mjs "${ARGS[@]}" 2>&1 | grep -E "error|Error" | head -5
python3 - "${FILES[@]}" <<'PY'
import sys
from PIL import Image
fs=sys.argv[1:]
kinds=sorted(set(f.split('_')[1] for f in fs), key=lambda k: fs.index(next(x for x in fs if x.split('_')[1]==k)))
phases=[f for f in fs if f.split('_')[1]==kinds[0]]
W,H=260,330
out=Image.new('RGB',(W*len(phases),H*len(kinds)))
for r,k in enumerate(kinds):
  for c,f in enumerate([x for x in fs if x.split('_')[1]==k]):
    im=Image.open(f).crop((200,80,700,715)).resize((W,H))
    out.paste(im,(c*W,r*H))
out.save('shots/rigsheet.jpg',quality=88)
PY
