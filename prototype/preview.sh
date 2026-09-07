#!/bin/sh
# Regeneruje galerię podglądu w prototype/preview/ (katalog jest gitignorowany).
# Użycie:  sh prototype/preview.sh  &&  open prototype/preview/index.html
set -e
cd "$(dirname "$0")/.."
G=prototype/preview
mkdir -p "$G"
N="node prototype/carve.mjs"
A="--warns=4 --wshort=0.62 --wmid=0.23"

# A. rozkład długości
$N --svg=$G/a1-krotkie.svg  --size=25 --cell=20 --warns=4 --wshort=0.85 --wmid=0.14
$N --svg=$G/a2-przyjete.svg --size=25 --cell=20 $A
$N --svg=$G/a3-srednie.svg  --size=25 --cell=20 --warns=4 --wshort=0.30 --wmid=0.55
$N --svg=$G/a4-dlugie.svg   --size=25 --cell=20 --warns=4 --wshort=0.10 --wmid=0.70

# B. grubość linii (to samo ziarno, żeby porównanie było uczciwe)
for st in 0.35 0.45 0.55 0.65; do
  $N --svg=$G/b-stroke-$st.svg --size=25 --cell=20 $A --stroke=$st --seed=7
done

# C. siła Warnsdorffa
for w in 0 2 4 8; do
  $N --svg=$G/c-warns-$w.svg --size=25 --cell=20 --warns=$w --wshort=0.62 --wmid=0.23
done

# D. poziomy trudności
$N --svg=$G/d1-50.svg  --size=50  --cell=16 $A
$N --svg=$G/d2-75.svg  --size=75  --cell=13 $A
$N --svg=$G/d3-100.svg --size=100 --cell=11 $A

# E. tryb diagnostyczny
$N --svg=$G/e-kolor.svg --size=25 --cell=20 $A --colored

echo
echo "Gotowe.  open $(pwd)/$G/index.html"
