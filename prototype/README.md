# Prototyp — kod wyrzucalny

## Laboratorium (interaktywnie)

```sh
sh prototype/lab.sh          # http://localhost:8777/lab.html
```

Wszystkie pokrętła generatora w panelu bocznym, plansza rysowana od razu.
Do tego przełączniki podglądu: **kolorowanie strzałek** (każdy element innym
kolorem — tryb diagnostyczny) oraz **wyróżnianie N najdłuższych elementów**
(różowo, z tabelą ich długości, zasięgu, gęstości i zwinięcia).

Konfiguracja zapisuje się w adresie, więc da się wrócić do ustawienia albo
podesłać je komuś linkiem. Pod planszą pojawia się gotowe polecenie CLI
odtwarzające dokładnie ten sam przebieg.

Silnik siedzi w `engine.mjs` i jest wspólny dla laboratorium i dla `carve.mjs` —
nie ma dwóch kopii algorytmu, które mogłyby się rozjechać.

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

## Runda 2 — wygląd planszy

Pytanie: dlaczego plansze wychodzą w pasy z prostych linii i czy da się to naprawić.

**Odpowiedź: przy obecnych regułach nie da się.** Element musi na każdej dotkniętej
linii zajmować ciągły odcinek zaczynający się dokładnie na frontierze, więc skręt jest
możliwy tylko wtedy, gdy głębokość elementu zrówna się co do komórki z frontierem
sąsiedniej linii. Warunek dotyczy **każdej poprawnej planszy**, nie tylko tego
generatora. Do tego kształt i trudność ciągną w przeciwne strony:

| wariant | skrętów/elem | wieloliniowych | f0 |
|---|---|---|---|
| tunelowanie (najgłębsza linia) | 0.15 | 6% | 0.20 |
| warstwy (najpłytsza linia) | 0.72 | 29% | 0.42 |

**Reguła B — element jedzie po własnym torze.** Korytarz to pojedynczy promień z głowy
do krawędzi, a nie cień całego kształtu; ciało sunie po śladzie głowy. Kształt przestaje
być ograniczony. Cała matematyka przeżywa: promień z głowy jest tak samo statyczny, więc
graf blokowania pozostaje statyczny, a rozwiązywalność nadal równa się acykliczności.

Do domknięcia planszy przy regule B konieczna okazała się **reguła Warnsdorffa** przy
wzroście ścieżki (idź tam, gdzie zostaje najmniej wolnych wyjść) — bez niej swobodnie
wijące się ciało fragmentuje resztę i plansza 100x100 się nie domyka.

Nightmare 100x100, reguła B + Warnsdorff: 100% pokrycia, rozwiązywalna, 2041 elementów,
najdłuższy 74, f0 = 0.061, **1.87 skrętu na element, 69% wieloliniowych**, 0 nawrotów,
34 ms generacji.

```
node prototype/carve.mjs --only=Easy --ruleb --warns=4 --lateral=3 --show
```

## Runda 3 — kalibracja

Pytania: jaki jest ogon czasu generacji i czy rozkład długości da się skalibrować.

**Dłuższe elementy poprawiają wszystko naraz.** Wbrew intuicji mniej elementów to mniej
decyzji, a każda decyzja jest okazją do pofragmentowania reszty planszy. Nightmare przy
wagach `0.10/0.70/0.20` wobec `0.70/0.285/0.015`: p99 czasu 442 ms zamiast 979,
6 restartów na 30 zamiast 23, 4.48 skrętu na element zamiast 1.84, średnia długość 9.6
zamiast 4.8. Wcześniejsza obserwacja o utykaniu ścieżek była artefaktem sztywnej
translacji.

**Reguła Warnsdorffa pozostaje wymagana** — bez niej 1 plansza na 30 nie generuje się
wcale. Steruje jednak jednocześnie skrętami i zwijaniem ścieżek w kłębki (20% zwinięcia
przy sile 0, 39% przy 8).

**Rozkład czasu jest skrajnie ciężkoogonowy.** Mediana jest nieinformatywna:
Nightmare p50 = 17 ms, p99 = 442 ms. Zero porażek na 30–100 ziaren przy pięciu
dopuszczonych restartach.

Konfiguracja przyjęta jako domyślna:

```
node prototype/carve.mjs --ruleb --warns=4 --wshort=0.10 --wmid=0.70 --lateral=3
node prototype/carve.mjs --bench=30 --ruleb --only=Nightmare --wshort=0.10 --wmid=0.70
```

**Otwarte:** ostatecznej kalibracji wyglądu nie da się zrobić na podglądzie ASCII —
znaki ramek nie przedstawiają ścieżki dotykającej samej siebie, a to co trzecia komórka.
Strojenie `warns` i wag długości musi się odbyć na docelowym rendererze SVG.

## Runda 4 — renderer SVG i kalibracja wzrokowa

```
node prototype/carve.mjs --svg=plansza.svg --size=50 --cell=14 --warns=4 --wshort=0.62 --wmid=0.23
node prototype/carve.mjs --svg=debug.svg --colored     # kolor per element, tryb diagnostyczny
rsvg-convert -w 900 plansza.svg -o plansza.png
```

Render obalił kalibrację z rundy 3. Wagi dobrane pod ogon czasu generacji
(`0.10/0.70/0.20`) dają planszę **rozwleczoną** — kilkadziesiąt długich meandrów
i rzadko rozsiane groty. Referencja ma rozkład o ciężkim ogonie: gęste groty **plus**
kilka bardzo długich linii.

| wagi | elem. (25×25) | śr. dł. | wygląd |
|---|---|---|---|
| 0.70 / 0.285 / 0.015 | 134 | 4.7 | gęste groty, same krótkie haczyki |
| **0.62 / 0.23 / 0.15** | **97** | **6.4** | **jak w oryginale** |
| 0.10 / 0.70 / 0.20 | 62 | 10.1 | rozwleczone, groty rzadkie |

Cena przyjętych wag: p99 czasu na Nightmare rośnie z 442 do 658 ms, restarty z 6 do 15
na 30 przebiegów, porażek nadal zero.

Parametry rysowania dające wygląd referencyjny: grubość linii 50% podziałki siatki,
`stroke-linecap` i `stroke-linejoin` ustawione na `round`, grot jako wypełniony trójkąt
o boku ~0.6 podziałki, kolory `#232447` na `#f6f6fa`.

## Runda 5 — zwijanie kontra opakowywanie

Pytanie z przeglądu: dlaczego długie linie łamią się głównie **same przy sobie**, leżąc
zwinięte w kłębek, zamiast owijać się wokół innych elementów.

**Przyczyna: reguła Warnsdorffa nagradza zwijanie.** Heurystyka idzie tam, gdzie zostaje
najmniej wolnych wyjść, a własna świeżo położona komórka obniża stopień swobody sąsiadów —
więc sama ciąga linię z powrotem do siebie. Nic nie premiowało przylegania do cudzych
elementów.

Dodane pokrętła i metryki:

```
--anticoil=N   kara za dotykanie własnej ścieżki (poza komórką, z której przychodzimy)
--hug=N        premia za sąsiedztwo z elementami już wyciętymi
--edgehug=N    czy krawędź planszy liczy się jak element obcy
```

Nowe metryki w raporcie: `zwinięcie` (było), `wspólna granica` (jaką część swojej długości
element dzieli z pojedynczym obcym elementem), `sąsiadów obcych/elem`, `skrętów/kom`.

Pomiar na czterech planszach, 10 ziaren na wariant, z **wyrównaną średnią długością**
elementu (kara skraca elementy, więc każdemu wariantowi dobrano wagi koszyków):

| wariant | zwinięcie | wspólna granica | skrętów/elem |
|---|---|---|---|
| bazowy | 44% | 41% | 4,21 |
| anticoil 3 | 34% | 46% | 3,59 |
| anticoil 4 | 31% | 50% | 3,69 |
| **anticoil 6** | **27%** | **50%** | 3,32 |
| anticoil 4 + sondy 15% | 30% | 48% | 3,51 |

**Odrzucone:** `hug` dokłada 1–2 punkty ponad samą karę, sondy w głąb (`--probe`, długie
proste wbicia mające tworzyć półwyspy do owijania) nie dokładają nic. Cała poprawa pochodzi
z **odjęcia zachęty do zwijania**, nie z dodania zachęty do owijania.

**Cena:** skrętów na element jest mniej (4,21 → 3,32), bo część dawnych skrętów brała się
właśnie ze zwijania. Obie wielkości są sprzężone.

**Odporność bez zmian:** pokrycie 100%, plansze rozwiązywalne, Nightmare pionowy 100×200
w 64 ms, restartów najwyżej 0,5 na przebieg.

```
node prototype/carve.mjs --svg=p.svg --w=25 --h=50 --anticoil=6 --wshort=0.20 --wmid=0.08
sh prototype/preview.sh && open prototype/preview/index.html   # sekcja F
```
