#!/bin/sh
# Regenerates the preview gallery in prototype/preview/ (the SVG files are gitignored).
# Usage:  sh prototype/preview.sh  &&  open prototype/preview/index.html
set -e
cd "$(dirname "$0")/.."
G=prototype/preview
mkdir -p "$G"
N="node prototype/carve.mjs"
D="--warns=4 --wshort=0.50 --wmid=0.20"     # default settings

# A. length distribution — on the target 1:2 format
$N --svg=$G/a1-dl00.svg --w=25 --h=50 --cell=18 --warns=4 --wshort=0.85 --wmid=0.14
$N --svg=$G/a2-dl15.svg --w=25 --h=50 --cell=18 --warns=4 --wshort=0.62 --wmid=0.23
$N --svg=$G/a3-dl30.svg --w=25 --h=50 --cell=18 $D
$N --svg=$G/a4-dl45.svg --w=25 --h=50 --cell=18 --warns=4 --wshort=0.40 --wmid=0.15

# B. line thickness — the same seed, so the comparison is fair
for st in 0.35 0.45 0.55 0.65; do
  $N --svg=$G/b-stroke-$st.svg --w=25 --h=50 --cell=18 $D --stroke=$st --seed=7
done

# C. Warnsdorff strength
for w in 0 2 4 8; do
  $N --svg=$G/c-warns-$w.svg --w=25 --h=50 --cell=18 --warns=$w --wshort=0.50 --wmid=0.20
done

# D. formats and difficulty levels — square and portrait side by side
$N --svg=$G/d1-25x25.svg   --w=25  --h=25  --cell=18 $D
$N --svg=$G/d2-25x50.svg   --w=25  --h=50  --cell=18 $D
$N --svg=$G/d3-100x100.svg --w=100 --h=100 --cell=9  $D
$N --svg=$G/d4-100x200.svg --w=100 --h=200 --cell=8  $D
$N --svg=$G/d5-200x200.svg --w=200 --h=200 --cell=6  $D

# E. diagnostic mode
$N --svg=$G/e-kolor.svg --w=25 --h=50 --cell=18 $D --colored

# F. coiling versus wrapping (probe 2026-09-07)
# Each variant has its bucket shares tuned so that the mean piece length
# stays the same (~8.9) — the coiling penalty shortens pieces, so without this
# the comparison would show shorter lines rather than less coiled ones.
$N --svg=$G/f1-baseline.svg  --w=25 --h=50 --cell=18 --warns=4 --wshort=0.40 --wmid=0.16 --seed=7
$N --svg=$G/f2-anticoil3.svg --w=25 --h=50 --cell=18 --warns=4 --wshort=0.30 --wmid=0.12 --seed=7 --anticoil=3
$N --svg=$G/f3-anticoil4.svg --w=25 --h=50 --cell=18 --warns=4 --wshort=0.25 --wmid=0.10 --seed=7 --anticoil=4
$N --svg=$G/f4-anticoil6.svg --w=25 --h=50 --cell=18 --warns=4 --wshort=0.20 --wmid=0.08 --seed=7 --anticoil=6
$N --svg=$G/f5-sondy.svg     --w=25 --h=50 --cell=18 --warns=4 --wshort=0.25 --wmid=0.10 --seed=7 --anticoil=4 --probe=0.15 --probelen=24
$N --svg=$G/f1-kolor.svg     --w=25 --h=50 --cell=18 --warns=4 --wshort=0.40 --wmid=0.16 --seed=7 --colored
$N --svg=$G/f4-kolor.svg     --w=25 --h=50 --cell=18 --warns=4 --wshort=0.20 --wmid=0.08 --seed=7 --anticoil=6 --colored
$N --svg=$G/f7-nightmare.svg --w=100 --h=200 --cell=8 --warns=4 --wshort=0.20 --wmid=0.08 --seed=7 --anticoil=6

# G. longest lines on large boards (probe 2026-09-07)
# --top=5 draws the five longest pieces in pink and prints their reach.
$N --svg=$G/g1-base-100x100.svg --w=100 --h=100 --cell=6 --warns=4 --wshort=0.40 --wmid=0.16 --seed=7 --top=5
$N --svg=$G/g1-ac6-100x100.svg  --w=100 --h=100 --cell=6 --warns=4 --wshort=0.20 --wmid=0.08 --seed=7 --anticoil=6 --top=5
$N --svg=$G/g2-base-100x200.svg --w=100 --h=200 --cell=5 --warns=4 --wshort=0.40 --wmid=0.16 --seed=7 --top=5
$N --svg=$G/g2-ac3-100x200.svg  --w=100 --h=200 --cell=5 --warns=4 --wshort=0.30 --wmid=0.12 --seed=7 --anticoil=3 --top=5
$N --svg=$G/g2-ac6-100x200.svg  --w=100 --h=200 --cell=5 --warns=4 --wshort=0.20 --wmid=0.08 --seed=7 --anticoil=6 --top=5
$N --svg=$G/g3-base-200x200.svg --w=200 --h=200 --cell=4 --warns=4 --wshort=0.40 --wmid=0.16 --seed=7 --top=5
$N --svg=$G/g3-ac6-200x200.svg  --w=200 --h=200 --cell=4 --warns=4 --wshort=0.20 --wmid=0.08 --seed=7 --anticoil=6 --top=5

echo
echo "Done.  open $(pwd)/$G/index.html"
