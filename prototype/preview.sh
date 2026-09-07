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

# F. zwijanie kontra opakowywanie (sonda 2026-09-07)
# Każdy wariant ma dobrany udział koszyków tak, żeby średnia długość elementu
# została ta sama (~8,9) — kara za zwijanie skraca elementy, więc bez tego
# porównanie pokazywałoby krótsze linie, a nie mniej zwinięte.
$N --svg=$G/f1-baseline.svg  --w=25 --h=50 --cell=18 --warns=4 --wshort=0.40 --wmid=0.16 --seed=7
$N --svg=$G/f2-anticoil3.svg --w=25 --h=50 --cell=18 --warns=4 --wshort=0.30 --wmid=0.12 --seed=7 --anticoil=3
$N --svg=$G/f3-anticoil4.svg --w=25 --h=50 --cell=18 --warns=4 --wshort=0.25 --wmid=0.10 --seed=7 --anticoil=4
$N --svg=$G/f4-anticoil6.svg --w=25 --h=50 --cell=18 --warns=4 --wshort=0.20 --wmid=0.08 --seed=7 --anticoil=6
$N --svg=$G/f5-sondy.svg     --w=25 --h=50 --cell=18 --warns=4 --wshort=0.25 --wmid=0.10 --seed=7 --anticoil=4 --probe=0.15 --probelen=24
$N --svg=$G/f1-kolor.svg     --w=25 --h=50 --cell=18 --warns=4 --wshort=0.40 --wmid=0.16 --seed=7 --colored
$N --svg=$G/f4-kolor.svg     --w=25 --h=50 --cell=18 --warns=4 --wshort=0.20 --wmid=0.08 --seed=7 --anticoil=6 --colored
$N --svg=$G/f7-nightmare.svg --w=100 --h=200 --cell=8 --warns=4 --wshort=0.20 --wmid=0.08 --seed=7 --anticoil=6

# G. najdłuższe linie na dużych planszach (sonda 2026-09-07)
# --top=5 rysuje pięć najdłuższych elementów na różowo i wypisuje ich zasięg.
$N --svg=$G/g1-base-100x100.svg --w=100 --h=100 --cell=6 --warns=4 --wshort=0.40 --wmid=0.16 --seed=7 --top=5
$N --svg=$G/g1-ac6-100x100.svg  --w=100 --h=100 --cell=6 --warns=4 --wshort=0.20 --wmid=0.08 --seed=7 --anticoil=6 --top=5
$N --svg=$G/g2-base-100x200.svg --w=100 --h=200 --cell=5 --warns=4 --wshort=0.40 --wmid=0.16 --seed=7 --top=5
$N --svg=$G/g2-ac3-100x200.svg  --w=100 --h=200 --cell=5 --warns=4 --wshort=0.30 --wmid=0.12 --seed=7 --anticoil=3 --top=5
$N --svg=$G/g2-ac6-100x200.svg  --w=100 --h=200 --cell=5 --warns=4 --wshort=0.20 --wmid=0.08 --seed=7 --anticoil=6 --top=5
$N --svg=$G/g3-base-200x200.svg --w=200 --h=200 --cell=4 --warns=4 --wshort=0.40 --wmid=0.16 --seed=7 --top=5
$N --svg=$G/g3-ac6-200x200.svg  --w=200 --h=200 --cell=4 --warns=4 --wshort=0.20 --wmid=0.08 --seed=7 --anticoil=6 --top=5

echo
echo "Gotowe.  open $(pwd)/$G/index.html"
