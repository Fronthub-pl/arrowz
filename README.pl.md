# Arrowz

[English](README.md) · **Polski**

Arrowz to łamigłówka. Masz przed sobą prostokąt wypełniony strzałkami i trzeba
go opróżnić — po jednej strzałce, we właściwej kolejności. W tym repozytorium
znajduje się ta część, która te łamigłówki wytwarza: **generator plansz**,
narzędzie wiersza poleceń i mała strona internetowa do sterowania nim.

Ta strona jest napisana dla kogoś, kto widzi projekt pierwszy raz. Nie zakłada
żadnej wiedzy programistycznej. Jeśli jakieś słowo wymaga wyjaśnienia, jest
wyjaśnione tam, gdzie pojawia się po raz pierwszy.

<p align="center">
  <img src="docs/images/hero.png" alt="Plansza Arrowz 40 na 40" width="560">
</p>

---

## Spis treści

1. [Łamigłówka w minutę](#łamigłówka-w-minutę)
2. [Co generator obiecuje](#co-generator-obiecuje)
3. [Uruchomienie narzędzia](#uruchomienie-narzędzia)
4. [Polecenia](#polecenia)
5. [Ustawienia na co dzień](#ustawienia-na-co-dzień)
6. [Pełny zestaw ustawień](#pełny-zestaw-ustawień)
7. [Strona internetowa](#strona-internetowa)
8. [Gdzie lądują plansze](#gdzie-lądują-plansze)
9. [Kiedy coś nie działa](#kiedy-coś-nie-działa)
10. [Słowniczek](#słowniczek)
11. [Gdzie co leży](#gdzie-co-leży)

---

## Łamigłówka w minutę

### Co widzisz

Plansza to siatka małych kwadratów. Każdy kwadrat jest zajęty przez strzałkę i
żaden nie zostaje pusty. Strzałka to linia, która wędruje z kwadratu na kwadrat
— tylko w górę, w dół, w lewo albo w prawo, nigdy na ukos i nigdy przez samą
siebie. Jeden koniec linii ma ostry grot. Grot to przód strzałki; pokazuje, w
którą stronę strzałka chce jechać.

Oto plansza osiem na osiem, każda strzałka w innym kolorze, żeby dało się je
odróżnić:

<p align="center">
  <img src="docs/images/tiny-colorized.png" alt="Mała plansza z siedmioma strzałkami w różnych kolorach" width="360">
</p>

Siedem strzałek, siedem grotów. Zielona jest zgięta w haczyk, czerwona zgina
się dwa razy, fioletowa ma raptem dwa kwadraty. Strzałka może mieć od dwóch do
kilkuset kwadratów długości.

Prawdziwe plansze są jednokolorowe, bo odróżnianie strzałek okiem to właśnie
sedno gry:

<p align="center">
  <img src="docs/images/tiny.png" alt="Ta sama mała plansza w jednym kolorze" width="360">
</p>

### Jedyna reguła

Stukasz w strzałkę. Ona próbuje wyjechać prosto poza planszę, w stronę, w którą
wskazuje jej grot.

Wyobraź sobie wąski pas, który zaczyna się tuż przed grotem i biegnie prosto do
krawędzi planszy. Tylko ten pas się liczy.

**Jeśli pas jest wolny, strzałka wyjeżdża i znika.**

<p align="center">
  <img src="docs/images/rule-free.png" alt="Strzałka z wolnym pasem przed grotem" width="440">
</p>

Granatowa strzałka wskazuje w prawo. Pas przed nią, zaznaczony przerywaną
linią, jest wolny, więc strzałka opuszcza planszę. Szara strzałka niżej nie ma
tu nic do rzeczy — nie stoi na pasie.

**Jeśli cokolwiek stoi na pasie, ruch jest niedozwolony.** Strzałka szarpie do
przodu, uderza w to, co jej zawadza, wraca na swoje miejsce, a ty tracisz
życie. To uderzenie jest celowe: pokazuje ci, co cię zablokowało.

<p align="center">
  <img src="docs/images/rule-blocked.png" alt="Strzałka z inną strzałką stojącą na jej pasie" width="440">
</p>

Tutaj czerwona strzałka stoi w poprzek pasa, więc granatowa nie ruszy się z
miejsca.

To, na czym potyka się każdy: **kształt strzałki nie ma znaczenia, liczy się
tylko jej pas.** Strzałka zgięta w podkowę, z obcą strzałką siedzącą w środku
zgięcia, nadal może swobodnie wyjechać — ta obca nie stoi na pasie.

<p align="center">
  <img src="docs/images/rule-shape.png" alt="Strzałka zgięta w podkowę z inną strzałką w środku zgięcia, mimo to wolna" width="440">
</p>

Granatowa strzałka owija się wokół szarej, ale jej pas, zaznaczony przerywaną
linią, jest wolny. Stuknij, a pojedzie.

Działa to dlatego, że strzałka jedzie po własnym torze. Grot przesuwa się o
jeden kwadrat do przodu, a każdy kwadrat za nim przesuwa się w miejsce, które
się właśnie zwolniło. Strzałka nigdy nie wjeżdża na kwadrat, którego sama nie
zajmuje. Dlatego jej zakręty i haczyki nie mają żadnego wpływu na to, czy może
się ruszyć.

### Wygrana i przegrana

Wygrywasz, gdy plansza jest pusta. Przegrywasz, gdy skończą ci się życia —
projekt daje graczowi trzy.

Nie da się utknąć. Dopóki na planszy są strzałki, zawsze co najmniej jedna jest
wolna, a zdjęcie wolnej strzałki nigdy nie zapędza reszty w kozi róg. Cała
trudność polega na *dostrzeżeniu*, która strzałka jest wolna. Życia tracisz
tylko przez stukanie na oślep.

> **Uwaga.** Sama gra — stukanie, życia, punkty — jest zaprojektowana, ale
> jeszcze nie zbudowana. W tym repozytorium mieszka maszyna produkująca
> plansze i narzędzia do oglądania tego, co wyprodukuje.

---

## Co generator obiecuje

Każda plansza, którą generator oddaje, jest wcześniej sprawdzona. Gwarantuje:

| Obietnica | Co to dla ciebie znaczy |
|---|---|
| **Nic nie zostaje luzem** | Każdy kwadrat należy dokładnie do jednej strzałki. Żadnych dziur, nic się nie nakłada. |
| **Żadna strzałka nie jest jednym kwadratem** | Najkrótsza ma dwa, bo pojedynczy kwadrat nie miałby w którą stronę wskazywać. |
| **Planszę zawsze da się opróżnić** | Zanim odda planszę, generator wylicza, kto kogo blokuje, i dowodzi, że rozwiązanie istnieje. |
| **Zna co najmniej jedno rozwiązanie** | Kolejność, w jakiej sam budował strzałki, jest zwycięską kolejnością. |
| **Nie da się zapędzić w ślepy zaułek** | Dowolny ciąg dozwolonych ruchów prędzej czy później opróżnia planszę. |
| **To samo zamówienie daje tę samą planszę** | Poproś dwa razy o te same ustawienia i to samo ziarno, a dostaniesz identyczną planszę, co do kwadratu. |

Jednej rzeczy **nie** obiecuje: że każde zamówienie się uda. Przy trudnych
ustawieniach generator potrafi się w trakcie budowania zapędzić w kozi róg.
Wtedy cofa część pracy i próbuje inaczej, a jeśli to nie pomoże, zaczyna kilka
razy od zera. Gdy wszystkie próby zawiodą, mówi to wprost, zamiast podsunąć ci
zepsutą planszę.

---

## Uruchomienie narzędzia

### Instalacja Deno

**[Deno](https://deno.com/) w wersji 2.9 lub nowszej.** To cała lista. Deno to
jeden program, który uruchamia kod z tego repozytorium; nie ma nic więcej do
instalowania i nie ma osobnego pobierania.

Na macOS albo Linuksie:

```sh
curl -fsSL https://deno.land/install.sh | sh
```

Na Windowsie (PowerShell):

```powershell
irm https://deno.land/install.ps1 | iex
```

Sprawdź, czy się udało:

```sh
deno --version
```

### Pobranie kodu

```sh
git clone https://github.com/Fronthub-pl/arrowz.git
cd arrowz
```

Każde polecenie z tej strony uruchamiasz z katalogu `arrowz`.

### Pierwsza plansza

```sh
deno task carve --width=25 --height=25 --svg
```

Za pierwszym razem Deno poświęci kilka sekund na ściągnięcie dwóch małych
bibliotek pomocniczych, których potrzebuje. Potem plansza 25×25 powstaje grubo
poniżej sekundy.

Plansza ląduje w `packages/cli/boards/25x25/` jako trzy pliki: sama plansza
(`.board.json`, plik, który czyta gra), mały plik tekstowy, który ją opisuje
(`.json`), i — dzięki `--svg` — obrazek (`.svg`). Obrazek otworzy dowolna
przeglądarka.

### Pięć rzeczy do wypróbowania

Skopiuj dowolne z tych poleceń. Każde zapisuje planszę w `packages/cli/boards/`;
dopisz `--svg`, żeby dostać też jej obrazek, albo `--dry-run` (opisane niżej),
żeby zobaczyć same liczby bez tworzenia pliku. Każdą użytą tu flagę objaśnia
sekcja [Ustawienia na co dzień](#ustawienia-na-co-dzień).

```sh
# na tyle mała, że da się prześledzić okiem każdą strzałkę
deno task carve --width=12 --height=12 --colored

# gęste pole malutkich strzałek
deno task carve --width=40 --height=40 --length=0 --colored

# zamiast tego kilka długich węży
deno task carve --width=40 --height=40 --length=1 --winding=0 --colored

# długie autostrady przez całą planszę
deno task carve --width=80 --height=80 --skeleton --colored

# plansza pionowa, trudniejsza w grze od kwadratowej
deno task carve --width=40 --height=80
```

### Sprawdzenie, czy wszystko działa

```sh
deno task test
```

Uruchamia własny zestaw sprawdzeń projektu, w tym dziewięć plansz wzorcowych,
które muszą wyjść co do piksela tak samo za każdym razem. Zajmuje jakieś pół
minuty. Nie musisz tego uruchamiać, żeby korzystać z narzędzia; jest po to,
żeby mieć pewność, że nic się nie zepsuło.

### Samodzielny program

Jeśli wolisz mieć jeden plik, który uruchamiasz bez każdorazowego udziału Deno:

```sh
deno task compile
```

To zapisuje samodzielny program w `packages/cli/dist/carve`. Przyjmuje dokładnie
te same opcje co zadanie `carve`, tylko krócej się go pisze:

```sh
./packages/cli/dist/carve --width=25 --height=25 --dry-run
```

Jest jeden haczyk. Samodzielny program nie wie, gdzie leży repozytorium, więc
nie umie ustalić, gdzie odkładać plansze. Zanim poprosisz go o zapisanie
czegokolwiek, powiedz mu, gdzie ma to odkładać:

```sh
export ARROWZ_BOARDS_DIR=~/arrowz-boards
./packages/cli/dist/carve --width=25 --height=25
```

Bez tego zapis kończy się błędem o katalogu, którego nie da się utworzyć.
Poproszenie go o opisanie planszy zamiast zapisania (`--dry-run`, niżej) działa
tak czy inaczej.

---

## Polecenia

Wszystko dzieje się przez zadanie `carve`, jeden dialekt: codzienne flagi i
pokrętła silnika stoją obok siebie w tym samym poleceniu. Nie ma przełącznika,
który zmieniałby znaczenie flagi.

Wypisuje własną instrukcję:

```sh
deno task carve --help          # krótka forma: codzienne flagi, wynik, obrazek
deno task carve --help=knobs    # pełna tabela: każde pokrętło, jego zakres i wartość domyślna
```

### Jedna plansza

```sh
deno task carve --width=40 --height=40 --seed=7
```

Zapisuje dwa pliki w `packages/cli/boards/40x40/`:

* `seed7-f48ddb0f.board.json` — plansza: każda strzałka, komórka po komórce,
  ciasno spakowana. Ten plik wczytuje gra.
* `seed7-f48ddb0f.json` — mały plik tekstowy z zapisem tego, o co poproszono.

Nazwa to numer ziarna plus krótki kod wyliczony z ustawień. Dwie plansze
zrobione przy różnych ustawieniach nigdy się więc nawzajem nie nadpiszą.

### Obrazek w dodatku

```sh
deno task carve --width=40 --height=40 --svg
deno task carve --width=40 --height=40 --svg=moja-plansza.svg
```

`--svg` dokłada `seed7-f48ddb0f.svg` obok planszy. `--svg=moja-plansza.svg`
robi to samo i dodatkowo zostawia kopię w `moja-plansza.svg`.

### Wiele plansz naraz

```sh
deno task carve --width=100 --height=200 --seed=1 --count=50
```

Robi 50 plansz na ziarnach 1, 2, 3 i dalej. Ziarno, którego plansza się nie
domyka, jest pomijane (i nie zapisywane), a próbowane jest następne, aż będzie
50. Po dwa razy większej liczbie ziaren niż plansz poddaje się; `--max-seeds=200`
przesuwa tę granicę. Ostatnia linia mówi, ile plansz zapisano i które ziarna
pominięto. To samo polecenie zawsze robi te same plansze.

### Podgląd bez zapisywania

```sh
deno task carve --width=30 --height=30 --seed=7 --dry-run
```

Buduje planszę, nic nie zapisuje i wypisuje jedną linię tekstu w formacie
przeznaczonym dla programów, nie dla ludzi. Skrócone do tego, co ciekawe:

```json
{
  "W": 30, "H": 30, "seed": 7,
  "ok": true,
  "pieces": 87,
  "avgLen": 10.34,
  "maxLen": 44,
  "solvable": true,
  "genMs": 11,
  "pinned": [],
  "command": "deno task carve --width=30 --height=30 --seed=7"
}
```

Czyta się to tak: plansza powstała bez problemu, ma 87 strzałek, średnia
strzałka mierzy 10,3 kwadratu, najdłuższa 44, łamigłówka ma rozwiązanie, a
całość zajęła 11 milisekund. `command` to polecenie, które ją odtworzy.
`pinned` wymienia pokrętła, które nazwałeś sam w poleceniu — tutaj puste, bo
ten bieg użył tylko codziennych flag; zobacz [„Gdy pokrętło spotka codzienną
flagę”](#gdy-pokrętło-spotka-codzienną-flagę) niżej.

To najszybszy sposób na wypróbowanie ustawienia: widzisz, ile strzałek wychodzi
i ile to trwało, bez ani jednego pliku na dysku.

### Gdy plansza się nie domyka

Rzadko, przy dużych rozmiarach, generator poddaje się, zanim pokryje każdy
kwadrat. Plansza i tak zostaje zapisana, opis mówi `"ok": false`, a polecenie
kończy się kodem 1, żeby skrypty to zauważyły. Dopisz `--svg`, a obrazek
pokaże niepokryte kwadraty na różowo. Bieg, który trwa za długo, można
przerwać:

```sh
CARVE_TIMEOUT_S=60 deno task carve --width=1000 --height=1000
```

To zatrzymuje się po minucie i zapisuje to, co do tej pory narysowano,
z oznaczeniem `"aborted": true`.

### Raport z pomiarów

```sh
deno task report --only=easy --square --runs=1
```

Osobne polecenie, `deno task report`, buduje plansze w wybranym rozmiarze i
wypisuje stronę pomiarów na ich temat. To narzędzie diagnostyczne dla osób
strojących generator, nie coś, co musisz czytać. Prawdziwy wynik:

```
--- Easy 25x25 (1 runs) ---
  coverage      100.00%   solvable: YES
  pieces        72   length 2..42
  length dist.  2-6: 63%  7-15: 22%  16-49: 15%  50+: 0.0%
  ...
  time          generation 22 ms, metrics 2 ms
```

Dwie linie, które warto znać: `coverage 100.00%` znaczy, że żaden kwadrat nie
został pusty, a `solvable: YES`, że łamigłówkę da się skończyć.

Bez `--only` przechodzi kolejno przez wszystkie poziomy trudności, aż do
1000×1000, co zajmuje sporo czasu. `--bench=N` mierzy zamiast tego szybkość, po
N przebiegów na poziom.

### Prośba o coś niemożliwego

Generator odrzuca ustawienia, o których wie, że nie zadziałają, zanim cokolwiek
zacznie liczyć — nie po dziesięciu minutach mielenia:

```sh
deno task carve --width=30 --height=30 --pstraight=0.2 --svg=/tmp/x.svg
```

```
invalid parameters:
  - straightness bias: 0.2 is outside 0.6..1
see --help for the allowed ranges
```

Polecenie kończy się kodem 2. Kod wyjścia to liczba, którą program zostawia po
sobie na koniec; skrypty czytają ją, żeby wiedzieć, jak poszło: 0 znaczy, że
wszystko się udało, 1 — że generator się poddał, a 2 — że poprosiłeś o coś
spoza zakresu.

---

## Ustawienia na co dzień

Dwanaście flag w czterech grupach: dwie na rozmiar, jedna na szczęście, cztery
zmieniające łamigłówkę i pięć zmieniających tylko wygląd obrazka.

### Rozmiar — `--width` i `--height`

Ile kwadratów w poziomie i w pionie. Oba są wymagane. Od 4 do 1000.

Plansza 400×400 jest gotowa poniżej dwóch sekund; 1000×1000 zajmuje około
dziesięciu. Na planszy pionowej gra się trudniej niż na kwadratowej o tej samej
liczbie kwadratów, bo strzałki mają dalej do przejechania.

| `--width=20 --height=40` | `--width=100 --height=100` |
|---|---|
| <img src="docs/images/portrait.png" width="200"> | <img src="docs/images/big.png" width="330"> |

### Jak duża może być plansza

Sufit to 1000×1000 — milion kwadratów. Powyżej mniej więcej dwustu kwadratów
na bok pojedyncze strzałki przestają być na ekranie widoczne, a plansza
zamienia się w tkaninę. Wszystkie trzy poniżej pokazane są tutaj w tej samej
szerokości; różni je tylko prawdziwy rozmiar.

| 200×200 | 500×500 | 1000×1000 |
|---|---|---|
| <img src="docs/images/scale-200.png" width="250"> | <img src="docs/images/scale-500.png" width="250"> | <img src="docs/images/scale-1000.png" width="250"> |
| **3619 strzałek**, 0,2 s | **21 771 strzałek**, 1,4 s | **85 809 strzałek**, 9,6 s |

W samej łamigłówce nic się przy tym rozmiarze nie zmienia. Oto okno trzydzieści
na trzydzieści w planszę o milionie kwadratów, narysowane w tym samym
powiększeniu co plansze 30×30 z porównań niżej — ten sam obrazek, tyle że
wycinek dużo większego:

<p align="center">
  <img src="docs/images/scale-1000-detail.png" alt="Okno trzydzieści na trzydzieści w planszę 1000 na 1000" width="440">
</p>

W liczbach warto zauważyć dwie rzeczy. Średnia strzałka prawie nie rośnie wraz
z planszą — 11,1 kwadratu przy 200×200 wobec 11,7 przy 1000×1000 — więc
większa plansza daje więcej strzałek, a nie dłuższe. Rośnie za to najdłuższa
pojedyncza strzałka: 213 kwadratów, potem 278, potem 354.

W odróżnieniu od mniejszych przykładów te trzy nie leżą tu jako rysunki do
pobrania. Ich pliki mają 0,9 MB, 7 MB i 22 MB, czyli więcej, niż powinno leżeć
w repozytorium. Zrób własne jednym poleceniem:

```sh
deno task carve --width=1000 --height=1000 --seed=7 --svg=huge.svg
```

### Ziarno — `--seed`

Liczba od 0 do 999999, która wybiera, jaką planszę dostaniesz. Przy reszcie
ustawień bez zmian to samo ziarno zawsze daje tę samą planszę. Inne ziarno daje
inną planszę o tym samym charakterze. Domyślnie 7.

| `--seed=7` | `--seed=42` |
|---|---|
| <img src="docs/images/seed-7.png" width="260"> | <img src="docs/images/seed-42.png" width="260"> |

### Długość strzałek — `--length`

Pokrętło od 0 do 1. Domyślnie `0.75`.

**Zmniejsz** je, a plansza zapełni się krótkimi strzałkami: jest ich dużo,
każda z własnym grotem, stłoczone jak pole małych haczyków. **Zwiększ**, a
plansza będzie się składać z kilku długich węży, a groty będą rzadkością.

Pomiary na planszy 30×30 z ziarnem 7:

| `--length=0` | domyślnie (`0.75`) | `--length=1` |
|---|---|---|
| <img src="docs/images/length-short.png" width="250"> | <img src="docs/images/default-30.png" width="250"> | <img src="docs/images/length-long.png" width="250"> |
| **176 strzałek**, średnio 5,1 kwadratu | **87 strzałek**, średnio 10,3 kwadratu | **65 strzałek**, średnio 13,9 kwadratu |

Więcej strzałek to nie automatycznie trudniej — to inny rodzaj trudności. Przy
krótkich strzałkach jest dużo do oglądania; długich jest mniej, ale każda sięga
dalej i blokuje więcej.

### Kształt linii — `--winding`

Pokrętło od 0 do 1. Domyślnie `0.5`. Steruje tym, jak chętnie linia idzie
prosto, zamiast skręcać: `0` to najprostsza plansza, `1` — najbardziej
pokręcona.

**Zmniejsz**, a strzałki będą biec długimi prostymi pociągnięciami.
**Zwiększ**, a zaczną się wić, skręcać co kilka kwadratów i wciskać w małe
zakamarki.

| `--winding=0` (najprostsze) | domyślnie (`0.5`) | `--winding=1` (najbardziej pokręcone) |
|---|---|---|
| <img src="docs/images/straight-straight.png" width="250"> | <img src="docs/images/default-30.png" width="250"> | <img src="docs/images/straight-winding.png" width="250"> |
| 49 strzałek, średnio 2,1 zakrętu | 87 strzałek, średnio 3,2 zakrętu | 66 strzałek, średnio 5,5 zakrętu |

Warto zauważyć: przekręcenie tego pokrętła do końca w którąkolwiek stronę daje
*mniej* strzałek niż środek. Proste linie biegną dalej, zanim się skończą;
pokręcone połykają więcej kwadratów na strzałkę, wypełniając rogi. Najgęstsze
plansze są gdzieś pośrodku.

### Szkielet — `--skeleton`

Przełącznik, domyślnie wyłączony. Włącz go, a generator najpierw kładzie kilka
bardzo długich linii — autostrad zygzakujących przez całą planszę — a potem
wypełnia kanały między nimi zwykłymi strzałkami.

| bez szkieletu | `--skeleton` |
|---|---|
| <img src="docs/images/skeleton-off.png" width="290"> | <img src="docs/images/skeleton-on.png" width="290"> |
| 337 strzałek, najdłuższa 103 kwadraty | 291 strzałek, najdłuższa **168** kwadratów |

To jedyny sposób na naprawdę długie strzałki. Zostawiony sam sobie generator
rzadko produkuje taką, która przecina całą planszę.

### Świeże losowanie za każdym razem — `--randomized`

Normalnie pozycja pokrętła to jedna konkretna receptura. Przy `--randomized`
każda pozycja jest traktowana jako *zakres*, a generator losuje z niego świeżą
wartość przy każdym uruchomieniu.

Praktyczny skutek: z tym przełącznikiem to samo ziarno daje za każdym razem
inną planszę. Na ten dodatkowy rzut kostką ziarno nie ma wpływu.

Nic nie ginie. Wylosowane ustawienia trafiają do pliku tekstowego planszy jako
pełne polecenie, więc każdą planszę, która ci się spodoba, da się odtworzyć co
do kwadratu.

```sh
deno task carve --width=40 --height=40 --randomized
```

Nazwanie jednego z wewnętrznych pokręteł (niżej) obok `--randomized` przypina
to jedno pokrętło, a resztę zostawia nadal losowaną — zobacz [„Gdy pokrętło
spotka codzienną flagę”](#gdy-pokrętło-spotka-codzienną-flagę).

### Jak rysowany jest obrazek

Te pięć nie zmienia w łamigłówce nic — tylko to, jak wygląda na ekranie.

**`--colored`** daje każdej strzałce własny kolor. Bezużyteczne do gry,
znakomite do zrozumienia. Wszystkie porównawcze obrazki na tej stronie z tego
korzystają.

| zwykłe | `--colored` |
|---|---|
| <img src="docs/images/seed-7.png" width="260"> | <img src="docs/images/colorized.png" width="260"> |

**`--line`** to grubość linii jako ułamek jednego kwadratu. Domyślnie `0.5`,
czyli linia wypełnia połowę swojego kwadratu.

| `--line=0.2` | `--line=0.9` |
|---|---|
| <img src="docs/images/weight-thin.png" width="260"> | <img src="docs/images/weight-thick.png" width="260"> |

Zwróć uwagę, co dzieje się z grotami. Na cienkiej linii grot jest porządnym
trójkątem, szerszym od linii. Gdy linia robi się gruba, na szerszy trójkąt nie
ma już miejsca, więc grot zmienia się w zaostrzony czubek.

**`--arrow-width`** i **`--arrow-height`** ustawiają rozmiar grotów ręcznie, w
kwadratach. Działają różnie. `--arrow-width` domyślnie ma wartość `auto`, co
znaczy „wylicz z grubości linii”; podana liczba to szerokość w kwadratach.
`--arrow-height` nie ma takiego trybu automatycznego — jest brany dosłownie i
domyślnie wynosi `1`, czyli cały kwadrat. Po `--arrow-height=0` grot nie ma
żadnej wysokości.

| `--arrow-width=0.6 --arrow-height=0.6` | `--arrow-width=2 --arrow-height=2` |
|---|---|
| <img src="docs/images/head-small.png" width="260"> | <img src="docs/images/head-big.png" width="260"> |

**`--sharp`** zdejmuje zaokrąglenia. Normalnie linia skręca łagodnym łukiem, a
jej tępy koniec jest zaokrąglony; z `--sharp` zakręty są kanciaste, a tępy
koniec jest kwadratem.

---

## Pełny zestaw ustawień

Dwanaście codziennych flag to skróty. Za każdą z nich stoi kilka wewnętrznych
pokręteł, do których możesz sięgnąć wprost, w tym samym poleceniu co codzienne
flagi — nie ma osobnego trybu, do którego trzeba by przełączyć. Zmniejszenie
`--length` naprawdę znaczy „podnieś udział krótkich strzałek i obniż udział
średnich” — dwa pokrętła naraz.

Nie potrzebujesz tej sekcji, żeby używać narzędzia. Jest tu, bo pytanie „co to
pokrętło właściwie robi” zasługuje na odpowiedź. Te codzienne nazywam na tej
stronie opcjami, a te wewnętrzne, które za nimi stoją — pokrętłami.

```sh
deno task carve --width=40 --height=40 --seed=7 --pstraight=0.95 --svg
```

To wszystko: nazwij pokrętło, a przejmie ono kontrolę nad tym, co inaczej
ustawiłaby codzienna flaga. Następna sekcja mówi dokładnie, co znaczy
„przejmuje kontrolę”, gdy więcej niż jedno pokrętło dzieli codzienną flagę.

### Gdy pokrętło spotka codzienną flagę

Codzienna flaga to nie skrót do jednego pokrętła — ustawia cały *zestaw*:

| Codzienna flaga | Pokrętła, które ustawia |
|---|---|
| `--length` | `wshort`, `wmid` |
| `--winding` | `pstraight`, `wlateral`, `warns`, `anticoil` |
| `--skeleton` | `giants`, `giantspan`, `giantstep`, `giantjitter`, `wgiant` |
| *(zawsze, podstawa trudności)* | połowa `--start`, `probe`, `probelen` |

`--start` to własny, mały przypadek tej samej reguły: ustawia powyższą podstawę
trudności, a do tego mieszankę warstw i tuneli, której nic innego nie ustawia.
Osiem pokręteł — `lmax`, `giantstraight`, `giantanticoil`, `giantspacing`,
`headtries`, `absorblimit`, `maxback`, `restarts` — nie należy do żadnego
zestawu, więc nazwanie któregoś z nich nigdy nie było niejednoznaczne.

**Pokrętło nazwane w poleceniu wygrywa i przypina tylko samo siebie.** Bez
`--randomized` codzienna flaga wybiera jedną wartość dla każdego pokrętła w
swoim zestawie; nazwanie pokrętła samodzielnie zastępuje tę jedną wartość,
zostawiając resztę zestawu dokładnie taką, jaką ustawiłaby codzienna flaga.
Z `--randomized` codzienne flagi losują swoje zestawy z bezpiecznych,
zmierzonych zakresów przy każdym biegu; nazwane przez ciebie pokrętło jest
**przypięte** zamiast losowane, a reszta jego zestawu jest losowana nadal,
ziarno po ziarnie.

CLI mówi o tym raz na bieg, na stderr, i dopisuje ten sam fakt do JSON-a z
`--dry-run`, więc skrypt widzi to bez parsowania stderr:

```sh
deno task carve --width=30 --height=30 --randomized --pstraight=0.9 --dry-run
```

```
note: --pstraight=0.9 is pinned; --winding still sets wLateral, anticoil, warns
```

```json
{ "...": "...", "pinned": ["pStraight"], "...": "..." }
```

Co tracisz, przypinając: bezpieczne zakresy w tabeli niżej zmierzono jako całe
zestawy, więc na wpół przypięty zestaw wciąż mieści się w kopercie
bezpieczeństwa, ale nie jest już objęty obietnicą, że *każda* codzienna
kombinacja się domyka. Koperta ma i tak ostatnie słowo — przypięta wartość
poza własnym zakresem, albo kombinacja łamiąca regułę, jest odrzucana
dokładnie tak samo jak zawsze.

### Pokrętła

Wszystkie 25, w grupach takich, jak grupuje je `deno task carve --help=knobs`.
Zakresy zapisują swoje słowne formy tam, gdzie istnieją; `auto`, `random` i
`off` są objaśnione tam, gdzie się pojawiają.

| Grupa | Flaga | Zakres | Domyślnie | Co robi |
|---|---|---|---|---|
| Plansza | `--width` | 4–1000 | 25 | Kolumny. Poniżej dwóch sekund do 400×400; około dziesięciu sekund przy 1000×1000. |
| Plansza | `--height` | 4–1000 | 50 | Wiersze. Plansza pionowa jest trudniejsza w grze od kwadratowej o tej samej liczbie kwadratów. |
| Plansza | `--seed` | 0–999999 | 7 | Wybiera planszę. To samo ziarno i te same pokrętła, ta sama plansza. |
| Długości | `--wshort` | 0–1 | 0.2 | Udział krótkich strzałek (2–6 kwadratów). Im wyżej, tym więcej strzałek i grotów, ale plansza zmienia się w sieczkę z haczyków. Krótkie plus średnie razem nie mogą przekroczyć 0,9. |
| Długości | `--wmid` | 0–1 | 0.08 | Udział średnich strzałek (7–15 kwadratów). Co zostanie, trafia do długich. Krótkie plus średnie razem nie mogą przekroczyć 0,9. |
| Długości | `--lmax` | `auto`\|6–5000 | `auto` | Najdłuższa strzałka, o jaką generator będzie się starał. `auto` znaczy „dwa i pół długości dłuższego boku”. **Uwaga:** wartości od 1 do 5 tną planszę na okruchy i generator się zacina. Używaj `auto` albo 6 wzwyż. |
| Kształt | `--pstraight` | 0.6–1 | 0.85 | Jak chętnie linia idzie dalej prosto. Im wyżej, tym dłuższe proste odcinki. **Uwaga:** to jedyne pokrętło, które samo potrafi wszystko zepsuć. Poniżej 0,6 duże plansze przestają się domykać; dokładnie przy 0,6 plansze powyżej 500×500 czasem się zacinają. 0,65 jest bezpieczne. |
| Kształt | `--wlateral` | 0–20 | 3 | O ile chętniej linia skręca w bok, niż wciska się w głąb wolnej przestrzeni. 0 daje długie proste pchnięcia i od czasu do czasu ogromne spirale. |
| Kształt | `--warns` | 2–16 | 4 | Jak chętnie linia wypełnia niewygodne zakamarki, zanim zamienią się w ślepe uliczki. Im wyżej, tym mniej strzałek, za to dłuższych i bardziej zwiniętych. **Uwaga:** poniżej 2 reguła się wyłącza i plansze się zacinają. |
| Kształt | `--anticoil` | 1–10 | 6 | Jak mocno linia stara się nie dotykać samej siebie. 1 wyłącza tę zasadę; im wyżej, tym mniej spirali i nieco krótsze strzałki. **Uwaga:** powyżej 10 zacina się łatwiej przy niskiej prostości. |
| Trudność | `--start` | `layers`\|`random`\|`tunnels`\|0.3–0.7 | `random` | Gdzie zaczyna się kolejna strzałka: najpłytsza linia (`layers`, łatwo: wiele strzałek wolnych naraz), gdziekolwiek (`random`) albo najgłębsza (`tunnels`, trudno: mało wolnych strzałek naraz). Liczba w 0.3–0.7 miesza oba style zamiast wybierać jeden — to udział strzałek zaczynających się jako tunele. |
| Trudność | `--probe` | 0–1 | 0 | Udział strzałek, których długość losuje się wokół jednej ustalonej wartości zamiast zwykłego podziału na trzy. |
| Trudność | `--probelen` | 2–200 | 12 | Ta ustalona wartość, plus minus połowa. 2 potraja liczbę strzałek; 200 daje kilka bardzo długich. Nic nie robi, dopóki `--probe` wynosi 0. |
| Szkielet | `--giants` | 0–40 | 0 | Ile pierwszych strzałek to autostrady. 0 znaczy żadna; 4 to dobry start. Prośba o dużo więcej nie szkodzi, ale nic nie daje: po pierwszych dwóch–trzech kolejne autostrady nie mają się już gdzie zmieścić. |
| Szkielet | `--giantspan` | 1–200 | 30 | Jak długa ma być jedna autostrada, liczone w długościach dłuższego boku planszy. Kończy wcześniej, gdy zabraknie miejsca. |
| Szkielet | `--giantstep` | `random`\|1–40 | 14 | Odstęp między równoległymi odcinkami autostrady. Mały daje równe pasy jak w zeszycie w linie, duży — kilka szerokich autostrad; `random` pozwala jej błądzić swobodnie zamiast rosnąć wężykiem. |
| Szkielet | `--giantjitter` | 0–1 | 0.6 | Jak często odcinek urywa się przed przeszkodą, zamiast dojść do samej przeszkody. 0 daje idealnie proste, regularne brzegi. |
| Szkielet | `--wgiant` | 0–0.2 | 0 | Szansa, że strzałka rysowana później też będzie autostradą. **Uwaga:** powyżej 0,2 plansze robią się wolne i przestają się domykać przy 1000×1000. |
| Szkielet | `--giantstraight` | 0.3–1 | 0.94 | Jak prosto biegnie autostrada tam, gdzie ma wolne miejsce. **Uwaga:** poniżej 0,3 plansze przestają się domykać. |
| Szkielet | `--giantanticoil` | 1–20 | 6 | Kara za dotykanie samej siebie, tylko dla autostrad. Obowiązuje wyższa z dwóch wartości: tej albo ogólnego `--anticoil`. |
| Szkielet | `--giantspacing` | `off`\|2\|3 | 2 | Ile kwadratów autostrada trzyma między własnymi równoległymi odcinkami. `off` wyłącza regułę; powyżej 3 tylko kosztuje czas. |
| Zamykanie | `--headtries` | 2–16 | 4 | Ile miejsc startu wypróbować, zanim odpuści dany kierunek. **Uwaga:** przy 1 poszukiwanie jest za płytkie na trudne ustawienia. Przy 8 i więcej zwykle wychodzi ta sama plansza co przy 4. |
| Zamykanie | `--absorblimit` | 12–64 | 24 | Resztka do tego rozmiaru, w którą żadna strzałka nie wchodzi, jest doklejana do sąsiedniej strzałki. **Uwaga:** blisko dolnego krańca zakresu resztki się piętrzą i plansze psują się dużo częściej. |
| Zamykanie | `--maxback` | `auto`\|0–1000, co 50 | `auto` | Ile narysowanych strzałek wolno cofnąć w jednej próbie, zanim zacznie się od nowa. `auto` znaczy 200, co wystarcza; więcej rzadko cokolwiek ratuje — tylko odwleka złą wiadomość. |
| Zamykanie | `--restarts` | 0–5 | 3 | Ile świeżych prób, każda z lekko zmienionym ziarnem, po niepowodzeniu. 0 pokazuje surową skuteczność twoich ustawień. |

Pięć pokręteł z wcześniejszej wersji tego narzędzia — `hug`, `edgehug`,
`strandlimit`, `giantwarns` i `giantspacepenalty` — zniknęło. Każde nic nie
robiło przy swojej wartości domyślnej, więc ich usunięcie nie zmienia żadnej
planszy; każde żyje teraz w silniku jako stała, a nie flaga.

### Jak wygląda kilka z nich

Cztery pokrętła obok siebie, wszystkie na planszy 30×30 z ziarnem 7. Trzy z
nich zmieniają obrazek; czwarte zmienia coś, czego nie widać.

**`--warns` — najpierw niewygodne zakamarki**

| `--warns=2` | `--warns=16` |
|---|---|
| <img src="docs/images/adv-warns-low.png" width="300"> | <img src="docs/images/adv-warns-high.png" width="300"> |
| 98 strzałek, średnio 2,4 zakrętu | 70 strzałek, średnio 3,8 zakrętu |

**`--wlateral` — skręcanie w bok zamiast parcia naprzód**

| `--wlateral=0` | `--wlateral=20` |
|---|---|
| <img src="docs/images/adv-lateral-0.png" width="300"> | <img src="docs/images/adv-lateral-20.png" width="300"> |
| 49 strzałek, średnio 18,4 kwadratu | 96 strzałek, średnio 9,4 kwadratu |

**`--probe` — jedna docelowa długość dla wszystkich strzałek**

| `--probe=1 --probelen=2` | `--probe=1 --probelen=200` |
|---|---|
| <img src="docs/images/adv-probe-short.png" width="300"> | <img src="docs/images/adv-probe-long.png" width="300"> |
| 253 strzałki, żadna dłuższa niż 4 kwadraty | 61 strzałek, najdłuższa 92 kwadraty |

**`--start` — pokrętło, którego nie widać**

| `--start=layers` | `--start=tunnels` |
|---|---|
| <img src="docs/images/adv-layers.png" width="300"> | <img src="docs/images/adv-tunnels.png" width="300"> |
| 83 strzałki, **34%** z nich wolnych na starcie | 90 strzałek, na starcie wolnych tylko **6,7%** |

Dwa ostatnie obrazki są do siebie bardzo podobne i o to właśnie chodzi. To
pokrętło ledwo dotyka rysunku. Zmienia za to, ile strzałek jest wolnych w
danej chwili, a to decyduje, czy plansza jest łatwa, czy trudna. Przy
ustawieniu domyślnym (`--start=random`) plansza ląduje pośrodku: 13% wolnych.
Liczba w 0,3–0,7 (`--start=0.3`…`--start=0.7`) miesza `layers` i `tunnels`
zamiast wybierać jeden styl: liczba to udział strzałek zaczynających się jako
tunele.

### Kombinacje, które są odrzucane

Czterech reguł nie da się zapisać jako zwykły zakres „od–do”, więc sprawdza się
je osobno:

| Reguła | Po ludzku |
|---|---|
| Udział krótkich plus średnich | Razem nie mogą przekroczyć 0,9, żeby co najmniej dziesiąta część strzałek była długa. |
| Długość maksymalna | `--lmax` musi być `auto` albo co najmniej 6. |
| Liczby całkowite | `--width`, `--height` i `--seed` przyjmują tylko liczby całkowite. |
| Start i mieszanie | `--start` przyjmuje słowo (`layers`, `random`, `tunnels`) albo udział w 0,3–0,7 i nic poza tym: zapisana plansza, w której start i mieszanie tworzą parę nie do zapisania przez `--start`, jest odrzucana, bo jej polecenie odtworzyłoby inną planszę. |

Złam regułę albo wyjdź którymkolwiek pokrętłem poza zakres, a generator odmówi,
zanim cokolwiek narysuje, powie ci, która wartość była zła, i zakończy się
kodem 2. Nigdy po cichu nie zaokrągli twojej liczby do zakresu.

Codzienne opcje nie potrafią złamać tych reguł. Zbudowano je tak, żeby każda
wartość każdej codziennej opcji, przy każdym rozmiarze planszy, dawała poprawną
kombinację — o ile zostawisz każde pokrętło w jego zestawie do ustawienia przez
codzienną flagę; co kosztuje przypięcie jednego, mówi wyżej sekcja [„Gdy
pokrętło spotka codzienną flagę”](#gdy-pokrętło-spotka-codzienną-flagę).

---

## Strona internetowa

Jest mała strona do zabawy ustawieniami i natychmiastowego oglądania wyniku.
Strona rysuje planszę elementem planszy, który potrzebuje Lit: przed pierwszym
uruchomieniem wpisz raz `corepack enable pnpm && pnpm install` w głównym
katalogu repozytorium. Potem:

```sh
sh packages/cli/lab.sh
```

Polecenie buduje stronę, otwiera `http://localhost:8777/lab.html`
i przebudowuje ją za każdym razem, gdy zmieni się plik źródłowy. Zatrzymasz je
klawiszami Ctrl+C.
Jeśli port 8777 jest już zajęty na twoim komputerze, dopisz inny numer: `sh
packages/cli/lab.sh 9000`.

Strona ma dwa tryby i przełącznik polski/angielski.

**Prosty** jest domyślny: rozmiar planszy, dwa suwaki (długość strzałek,
kształt linii), przełącznik szkieletu i ziarno — te same wybory, co w zwykłym
trybie wiersza poleceń. **Zaawansowany** pokazuje wszystkie pokrętła z
poprzedniej sekcji, z opisem każdego i listą gotowych ustawień, od poziomu
„Łatwy 25×25” po „Obłęd 1000×1000”.

Dwie rzeczy, które strona robi, a wiersz poleceń nie. Pokazuje dokładne
polecenie odtwarzające to, na co właśnie patrzysz, więc możesz je skopiować. I
przechowuje zapisane plansze, więc możesz jedną odłożyć i wrócić do niej
później.

Jeśli ustawisz pokrętło poza bezpiecznym zakresem, ten wiersz tabeli robi się
czerwony, obok pojawia się powód, a przycisk generowania przestaje działać,
dopóki tego nie poprawisz. Polecenie zostaje na ekranie, więc odrzucone
ustawienia i tak możesz skopiować.

---

## Gdzie lądują plansze

Domyślnie plansze trafiają do `packages/cli/boards/`, po jednym katalogu na każdy
rozmiar:

```
packages/cli/boards/
  25x25/
    seed7-8796a4f9.board.json   plansza
    seed7-8796a4f9.json         z czego powstała
    seed7-8796a4f9.svg          obrazek, tylko z --svg
  40x40/
    ...
```

Nazwa pliku to ziarno, a po nim krótki kod wyliczony z ustawień. Zmień
ustawienie, a dostaniesz inny kod, więc nic nie nadpisze się przypadkiem.
(Kolory i grubość linii nie wchodzą do kodu, więc zmiana tylko ich zapisuje pod
tą samą nazwą i zastępuje poprzednie pliki.)

Wskaż inne miejsce zmienną `ARROWZ_BOARDS_DIR`:

```sh
export ARROWZ_BOARDS_DIR=~/arrowz-boards
deno task carve --width=25 --height=25
```

Plik `.json` obok każdej planszy trzyma wszystkie użyte ustawienia, datę
powstania, czas liczenia i liczbę strzałek. Trzyma też linię `command`, która
robi tę samą planszę jeszcze raz, dokładnie. Jeśli masz zachować z planszy
jedną rzecz, zachowaj tę linię.

> Plansze nie trafiają do repozytorium. `packages/cli/boards/` jest celowo
> wykluczone: plik planszy 1000×1000 waży około megabajta, a jej obrazek
> dziesiątki megabajtów.

---

## Kiedy coś nie działa

**`deno task couldn't find deno.json`** — jesteś poza katalogiem projektu.
Wejdź do katalogu `arrowz` i spróbuj jeszcze raz.

**`Requires env access`** — to znaczy, że `deno run packages/cli/carve.ts` zostało
uruchomione bezpośrednio. Deno nie pozwala programowi tknąć twoich plików ani
ustawień bez wyraźnej zgody. Używaj zadania `carve`, które nadaje dokładnie
tyle uprawnień, ile trzeba.

**`unknown flag --foo; see --help`** — CLI w ogóle nie rozpoznaje tej flagi.
Sprawdź pisownię w `--help` albo `--help=knobs`.

**`--straight is gone: use --winding=R …`** (albo `--advanced`, `--board`,
`--w`/`--h`, `--colorized`, `--lineweight`, `--headwidth`/`--arrowwidth`,
`--headheight`/`--arrowheight`, `--lateral`, `--absorb`, `--headbias`,
`--mix`) — stara pisownia sprzed czasów, gdy to narzędzie miało jeden tryb.
Komunikat nazywa zastępstwo — użyj go zamiast tego.

**`invalid parameters: … is outside …`** — któraś wartość jest poza zakresem.
Komunikat podaje nazwę ustawienia i dozwolony zakres. Nic się nie policzyło i
nic się nie zapisało.

**`failed to close board …`** — generator próbował, cofał się, zaczynał od nowa
i mimo to nie zdołał wypełnić planszy. Prawie zawsze chodzi o ustawienie
oznaczone wyżej jako **Uwaga:**. Cofnij je w stronę wartości domyślnej albo
zmień ziarno. Plansza mimo to jest w `packages/cli/boards/`; dopisz `--svg`, a
obrazek pokaże niepokryte kwadraty na różowo, więc widać, gdzie generator
utknął.

**Jedna plansza trwa wieczność** — ustaw `CARVE_TIMEOUT_S` na liczbę sekund,
a po ich upływie generator przerwie i zapisze to, co zdążył narysować:

```sh
CARVE_TIMEOUT_S=60 deno task carve --width=1000 --height=1000
```

**Raport trwa wieczność** — `deno task report` bez niczego więcej przechodzi
przez wszystkie poziomy trudności do 1000×1000, po trzy razy każdy. Dodaj
`--only=easy --square --runs=1`. Uwaga: samo `--only=easy` nie pasuje do
niczego — potrzebuje obok `--square` albo `--portrait`.

**Strona nic nie pokazuje** — stronę trzeba najpierw zbudować. `sh
packages/cli/lab.sh` robi to za ciebie; otwarcie `lab.html` prosto z menedżera
plików nie zadziała.

**Ciekawi cię, co się dzieje** — ustaw `CARVE_TRACE=1`, a będzie meldować
postępy na bieżąco:

```sh
CARVE_TRACE=1 deno task carve --width=200 --height=200
```

```
    [trace] pieces 7000, remaining 2516, backtracks 0, 252 ms
```

---

## Słowniczek

| Słowo używane tutaj | Co znaczy |
|---|---|
| **strzałka** | Jedna linia na planszy, długa od dwóch do kilkuset kwadratów, z ostrym grotem na jednym końcu. W kodzie i na angielskiej stronie nazywa się *piece*; polska strona mówi „element”. |
| **grot** | Ostry koniec strzałki. Pokazuje, w którą stronę strzałka jedzie. W kodzie *head*. |
| **pas** | Prosty pasek kwadratów od grotu strzałki do krawędzi planszy. Jeśli jest wolny, strzałka może wyjechać. W kodzie *corridor*, korytarz. |
| **wolna** | Strzałka z wolnym pasem, którą można zdjąć od razu. |
| **ziarno** | Liczba, która decyduje, jaką planszę otrzymasz. To samo ziarno i te same ustawienia, ta sama plansza. |
| **szkielet** | Kilka bardzo długich strzałek narysowanych na początku, przecinających całą planszę. W kodzie *giants* albo *skeleton*. |
| **warstwy / tunele** | Dwa sposoby wyznaczania miejsca startu kolejnej strzałki. Warstwy obierają planszę od zewnątrz i ułatwiają grę; tunele drążą w głąb i utrudniają. |
| **zacięcie** | Zapędzenie się generatora w kozi róg podczas budowania, tak że nie da się dołożyć żadnej dozwolonej strzałki. |
| **bezpieczny zakres** | Zmierzone granice każdego ustawienia. Poza nimi plansze przestają działać; narzędzie woli odmówić, niż pozwolić, żebyś przekonał się o tym po długim czekaniu. |

---

## Gdzie co leży

| Ścieżka | Co to |
|---|---|
| `packages/engine/engine.ts` | Sam generator. Nie wie nic o plikach ani o stronach internetowych. |
| `packages/cli/carve.ts` | Narzędzie wiersza poleceń. |
| `packages/cli/lab.html`, `lab-page.ts` | Strona internetowa. |
| `packages/*/*.test.ts` | Testy. |
| `docs/images/manifest.json` | Komenda, która stworzyła każdy obrazek na tej stronie; `deno task docs` rysuje je wszystkie od nowa. |
| `packages/engine/HISTORY.md` | Dziennik inżynierski: każdy pomiar, każda ślepa uliczka, każda decyzja, ze szczegółami. |
| `docs/superpowers/specs/` | Dokumenty projektowe, w tym pełne reguły gry. |
| `packages/engine/` | Pakiet silnika (`@arrowz/engine`): generator, parametry, parser komendy, presety, słowniki. |
| `packages/cli/` | Narzędzie wiersza poleceń, magazyn plansz i strona laboratorium. |

Otwarcie repozytorium w Claude Code uruchamia `jbcontext index --silent` przez hooki w
`.claude/settings.json` (na początku i na końcu sesji), a `.mcp.json`
uruchamia `jbcontext mcp`. Oba wywołują program zainstalowany na Twoim
komputerze, więc przejrzyj je, zanim zaufasz temu katalogowi.

Kod w `packages/` zaczynał jako prototyp do wyrzucenia, napisany po to, żeby
rozstrzygnąć, co czyni planszę dobrą. Rozstrzygnął, więc stał się silnikiem, na
którym powstaje gra; tag `v1.0.0-alpha.1` wyznacza ten moment. Sama gra, wielokrotnego
użytku komponent planszy i nowe laboratorium powstają obok, w tym samym repozytorium
(patrz `docs/superpowers/specs/2026-09-09-monorepo-design.md`).
