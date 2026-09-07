# Prototyp — kod wyrzucalny

Sonda do specyfikacji, **nie kod produkcyjny**. Powstała, żeby rozstrzygnąć trzy
otwarte pytania, zanim powstał plan implementacji. Nie ma testów, typów ani warstwy
widoku i nie należy jej rozwijać — implementacja startuje od zera, w TypeScript.

```
node prototype/carve.mjs                      # wszystkie cztery poziomy
node prototype/carve.mjs --only=Easy --show   # z podglądem ASCII
node prototype/carve.mjs --headbias=1         # tunelowanie (najgłębsza linia)
node prototype/carve.mjs --headbias=-1        # warstwy (najpłytsza linia)
node prototype/carve.mjs --lateral=6 --straight=0.6 --runs=3
```

## Co rozstrzygnęła

1. **Wycinanie z pełnej planszy przy minimalnej długości 2 działa.** 100% pokrycia
   i rozwiązywalność na wszystkich czterech rozmiarach, średnio 0–0,5 nawrotu na
   planszę, zero restartów.
2. **Wydajność nie jest problemem.** Nightmare 100×100: 27 ms generacji, 14 ms metryk.
   Web Worker, bitboardy i indeks odwrotny wykreślone ze specyfikacji.
3. **Preferencja najgłębszej linii to działający regulator trudności.** Połowi `f0`
   i podwaja głębokość grafu blokowania.

## Co wykazała jako problem

4. **Metryka `T_k` przy pełnym zapełnieniu zawsze wynosi zero** — zastąpiona metryką
   `almost1` (elementy zablokowane przez dokładnie jeden obcy element).
5. **Skręt jest legalny wyłącznie na wysokości frontiera sąsiedniej linii**, więc bez
   przeciwdziałania plansze wychodzą w pasy, z prostych linii. Największe otwarte
   pytanie projektu.
6. **Rozkład długości nie realizuje zamówienia** — 28–47% ścieżek utyka, średnia
   osiągana jest o ~30% niższa od zamawianej.

Szczegóły i wnioski naniesione w `docs/superpowers/specs/2026-09-07-arrowz-design.md`
(§7, §9, §11, §13, §14).
