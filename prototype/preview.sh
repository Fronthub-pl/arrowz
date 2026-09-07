#!/bin/sh
# Regeneruje galerię podglądu w prototype/preview/ (pliki SVG są gitignorowane).
# Użycie:  sh prototype/preview.sh  &&  open prototype/preview/index.html
set -e
cd "$(dirname "$0")/.."
G=prototype/preview
mkdir -p "$G"
N="node prototype/carve.mjs"
D="--warns=4 --wshort=0.50 --wmid=0.20"     # ustawienia domyślne

# A. rozkład długości — na formacie docelowym 1:2
$N --svg=$G/a1-dl00.svg --w=25 --h=50 --cell=18 --warns=4 --wshort=0.85 --wmid=0.14
$N --svg=$G/a2-dl15.svg --w=25 --h=50 --cell=18 --warns=4 --wshort=0.62 --wmid=0.23
$N --svg=$G/a3-dl30.svg --w=25 --h=50 --cell=18 $D
$N --svg=$G/a4-dl45.svg --w=25 --h=50 --cell=18 --warns=4 --wshort=0.40 --wmid=0.15

# B. grubość linii — to samo ziarno, żeby porównanie było uczciwe
for st in 0.35 0.45 0.55 0.65; do
  $N --svg=$G/b-stroke-$st.svg --w=25 --h=50 --cell=18 $D --stroke=$st --seed=7
done

# C. siła Warnsdorffa
for w in 0 2 4 8; do
  $N --svg=$G/c-warns-$w.svg --w=25 --h=50 --cell=18 --warns=$w --wshort=0.50 --wmid=0.20
done

# D. formaty i poziomy trudności — kwadratowe i pionowe obok siebie
$N --svg=$G/d1-25x25.svg   --w=25  --h=25  --cell=18 $D
$N --svg=$G/d2-25x50.svg   --w=25  --h=50  --cell=18 $D
$N --svg=$G/d3-100x100.svg --w=100 --h=100 --cell=9  $D
$N --svg=$G/d4-100x200.svg --w=100 --h=200 --cell=8  $D
$N --svg=$G/d5-200x200.svg --w=200 --h=200 --cell=6  $D

# E. tryb diagnostyczny
$N --svg=$G/e-kolor.svg --w=25 --h=50 --cell=18 $D --colored

echo
echo "Gotowe.  open $(pwd)/$G/index.html"
