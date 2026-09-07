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

## Runda 8 — hardening domykania (plansze do 200×200)

Pytanie: dlaczego plansza 200×200 często się nie domyka (1 porażka na 10 ziaren,
połowa przebiegów z restartem) i czemu linie są krótkie i przylegają do siebie.

```
node --test prototype/                     # testy odporności (decomposable, wada lokalna, wchłanianie, domykanie)
node prototype/carve.mjs --only=Extreme    # 200×200
```

**Przyczyna 1 — błędny test rozkładalności resztki.** `decomposable` rozwijał
ścieżkę wyłącznie od pierwszej komórki zbioru, więc ta komórka musiała być
końcem ścieżki. L-tromino z iteracją od narożnika i prosta trójka od środka
wychodziły „nierozkładalne", a wynik zależał od kolejności komórek w zbiorze.
Generator w końcówce odrzucał poprawne ścieżki i ogłaszał zaklinowanie, którego
nie było; ślepy nawrót niczego nie zmieniał, bo po ponownym wycięciu ten sam
test odrzucał to samo. Stąd też dawna rada „limit testu powyżej 8 pogarsza".
Nowa wersja: pokrycie dominami i trominami-ścieżkami po maskach bitowych
(każda ścieżka ≥ 2 rozpada się na odcinki po 2 i 3 — Akiyama–Avis–Era), dokładne
do 30 komórek. Sama ta poprawka: 200×200 z 1/10 porażek do 0/20, czas 1,4 s → 0,2 s.

**Przyczyna 2 — pętla skracania „uciekała" przed testem.** Fragment powyżej limitu
przechodził bez sprawdzenia. Skracanie ścieżki oddaje komórki sąsiedniemu
fragmentowi po jednej, a wada typu „krzyż z trzema liśćmi" jest lokalna i nie
znika od dokładania komórek gdzie indziej — więc pętla produkowała nierozkładalny
fragment o rozmiarze dokładnie limit+1 (9–10 przy limicie 8, 25 przy 24).
Podnoszenie limitu z definicji nic nie daje. Naprawa: (a) test wady lokalnej
niezależny od limitu — warunek Tutte'a dla |S| ≤ 2 sprawdzany w promieniu 2 od
ścieżki, bo tylko tam po wycięciu zmieniają się stopnie; (b) fragment, który
oblał dokładny test, jest pamiętany i po urośnięciu ponad limit odrzucany.

**Przyczyna 3 — ślepy nawrót.** Przy 5000 elementów ostatnie k wycięć leży
w losowym rejonie planszy. Nawrót cofa teraz do najnowszego elementu stykającego
się z resztką (co najmniej 1 + log₂ nawrotów), a budżet spadł z 3000 do 200, bo
restart jest tańszy niż głębokie cofanie.

**Siatka bezpieczeństwa — wchłanianie resztek.** Gdy żadna głowa nie daje
legalnej ścieżki, końcówka sąsiedniego elementu (od komórki styku do ogona) plus
fragment układane są w nową ścieżkę Hamiltona. Zawsze legalne: głowa, szyja
i promień bez zmian, komórki zostają przy tym samym indeksie, a żaden promień
nie przechodzi przez wolną komórkę — graf blokowania jest identyczny. Test
`absorbLeftover` sprawdza to przez `analyse().solvable`.

| konfiguracja (200×200, bez restartów) | przed | po |
|---|---|---|
| domyślna, 100 ziaren | 1/10 porażek, 1,4 s | **0/100**, 0,2 s, 0 nawrotów |
| kara 6 + wagi 0,2/0,08, 30 ziaren | 4/20 z restartem | **0/30**, 0,4 s |
| szkielet 4 × 30 boków, 15 ziaren | 1/10 z restartem | **0/15**, 0,4 s |
| bez Warnsdorffa / same krótkie / tunele | 1/15 każda | **0/15** każda |
| dziewięć rozmiarów od 10×10 do 200×200 | — | **0/30** każdy |

**Linie za krótkie — przyczyna zmierzona, nie usunięta.** 48–84% ścieżek utyka
przed zamówioną długością; ogon ginie średnio po 10 komórkach, otoczony ~2,3
cudzymi elementami, czyli w zakamarku frontiera, do którego ciągnie go
Warnsdorff (zakamarek o jednym wyjściu ma wagę 16 wobec 1 dla otwartej
przestrzeni). Sprawdzone i odrzucone: nawrót wewnątrz ścieżki (utyka nadal
77–84%), odwrócony Warnsdorff (linie krótsze), premia w bok 0,5–1 (bez zmian).
Potwierdza to rundę 7: losowy wzrost ma sufit, długie linie daje tylko szkielet.

Co się zmieniło w domyślnych: `Lmax` = 0 oznacza 2,5 × bok (stałe 125 obcinało
koszyk długi na 200×200), kara za zwijanie 6, wagi 0,20/0,08, prostość 0,85.
Na 200×200: średnia długość 8,7 → 11,0, zwinięcie 41% → 28%; na 25×50 zasięg
górnych 10% elementów 37% → 48%. Laboratorium pokazuje nowy wiersz „utyka przed
celem" i liczbę wchłoniętych resztek.
