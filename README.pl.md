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
  <img src="docs/images/tiny-colorized.png" alt="Mała plansza z sześcioma strzałkami w różnych kolorach" width="360">
</p>

Sześć strzałek, sześć grotów. Zielona jest zgięta w haczyk, czerwona zgina się
dwa razy, fioletowa ma raptem dwa kwadraty. Strzałka może mieć od dwóch do
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
| **To samo zamówienie daje tę samą planszę** | Poproś dwa razy o te same ustawienia i to samo ziarno, a dostaniesz identyczny obrazek, co do kwadratu. |

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
deno task carve --width=25 --height=25
```

Za pierwszym razem Deno poświęci kilka sekund na ściągnięcie dwóch małych
bibliotek pomocniczych, których potrzebuje. Potem plansza 25×25 powstaje grubo
poniżej sekundy.

Plansza ląduje w `prototype/boards/25x25/` jako dwa pliki — obrazek i mały plik
tekstowy, który go opisuje. Obrazek otworzy dowolna przeglądarka.

### Pięć rzeczy do wypróbowania

Skopiuj którąkolwiek z nich. Każda zapisuje obrazek w `prototype/boards/`;
dopisz `--dry-run`, żeby zobaczyć same liczby, bez tworzenia pliku.

```sh
# na tyle mała, że da się prześledzić okiem każdą strzałkę
deno task carve --width=12 --height=12 --colorized

# gęste pole malutkich strzałek
deno task carve --width=40 --height=40 --length=0 --colorized

# zamiast tego kilka długich węży
deno task carve --width=40 --height=40 --length=1 --straight=1 --colorized

# długie autostrady przez całą planszę
deno task carve --width=80 --height=80 --skeleton --colorized

# plansza pionowa, trudniejsza w grze od kwadratowej
deno task carve --width=40 --height=80
```

### Sprawdzenie, czy wszystko działa

```sh
deno task test
```

Uruchamia własny zestaw sprawdzeń projektu — 124 z nich, w tym dziewięć plansz
wzorcowych, które muszą wyjść co do piksela tak samo za każdym razem. Zajmuje
jakieś pół minuty. Nie musisz tego uruchamiać, żeby korzystać z narzędzia; jest
po to, żeby mieć pewność, że nic się nie zepsuło.

### Samodzielny program

Jeśli wolisz mieć jeden plik, który uruchamiasz bez każdorazowego udziału Deno:

```sh
deno task compile
```

To zapisuje samodzielny program w `prototype/dist/carve`. Przyjmuje dokładnie
te same opcje co `deno task carve`, tylko krócej się go pisze:

```sh
./prototype/dist/carve --width=25 --height=25 --dry-run
```

Jest jeden haczyk. Samodzielny program nie wie, gdzie leży repozytorium, więc
nie umie ustalić, gdzie odkładać plansze. Zanim poprosisz go o zapisanie
czegokolwiek, powiedz mu, gdzie ma to odkładać:

```sh
export ARROWZ_BOARDS_DIR=~/arrowz-boards
./prototype/dist/carve --width=25 --height=25
```

Bez tego zapis kończy się błędem o katalogu, którego nie da się utworzyć.
Poproszenie go o opisanie planszy zamiast zapisania (`--dry-run`, niżej) działa
tak czy inaczej.

---

## Polecenia

Wszystko dzieje się przez jedno polecenie, `deno task carve`, które ma dwa
tryby. **Zwykły** obejmuje codzienne opcje i to jego używasz na co dzień.
**Zaawansowany**, włączany przez `--advanced`, odsłania wszystkie trzydzieści
kilka wewnętrznych pokręteł.

Oba wypisują własną instrukcję:

```sh
deno task carve --help              # codzienne opcje
deno task carve --advanced --help   # wszystkie pokrętła, jakie są
```

### Jedna plansza

```sh
deno task carve --width=40 --height=40 --seed=7
```

Zapisuje dwa pliki w `prototype/boards/40x40/`:

* `seed7-7636b469.svg` — obrazek.
* `seed7-7636b469.json` — mały plik tekstowy z zapisem tego, o co poproszono.

Nazwa to numer ziarna plus krótki kod wyliczony z ustawień. Dwie plansze
zrobione przy różnych ustawieniach nigdy się więc nawzajem nie nadpiszą.

### Zapis planszy w konkretnym miejscu

```sh
deno task carve --width=40 --height=40 --svg=moja-plansza.svg
```

To samo co wyżej, a dodatkowo kopia w `moja-plansza.svg`.

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
  "simpleCommand": "deno task carve --width=30 --height=30 --seed=7"
}
```

Czyta się to tak: plansza powstała bez problemu, ma 87 strzałek, średnia
strzałka mierzy 10,3 kwadratu, najdłuższa 44, łamigłówka ma rozwiązanie, a
całość zajęła 11 milisekund. `simpleCommand` to polecenie, które ją odtworzy.

To najszybszy sposób na wypróbowanie ustawienia: widzisz, ile strzałek wychodzi
i ile to trwało, bez ani jednego pliku na dysku.

### Raport z pomiarów

```sh
deno task carve --advanced --only=easy --square --runs=1
```

Buduje plansze w wybranym rozmiarze i wypisuje stronę pomiarów na ich temat. To
narzędzie diagnostyczne dla osób strojących generator, nie coś, co musisz
czytać. Prawdziwy wynik:

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
deno task carve --advanced --pstraight=0.2 --svg=/tmp/x.svg
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

Jedenaście flag w czterech grupach: dwie na rozmiar, jedna na szczęście, cztery
zmieniające łamigłówkę i cztery zmieniające tylko wygląd obrazka.

### Rozmiar — `--width` i `--height`

Ile kwadratów w poziomie i w pionie. Oba są wymagane. Od 4 do 1000.

Plansza 400×400 jest gotowa poniżej dwóch sekund; 1000×1000 zajmuje około
dziesięciu. Na planszy pionowej gra się trudniej niż na kwadratowej o tej samej
liczbie kwadratów, bo strzałki mają dalej do przejechania.

| `--width=20 --height=40` | `--width=100 --height=100` |
|---|---|
| <img src="docs/images/portrait.png" width="200"> | <img src="docs/images/big.png" width="330"> |

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

### Kształt linii — `--straight`

Pokrętło od 0 do 1. Domyślnie `0.5`. Steruje tym, jak chętnie linia idzie
prosto, zamiast skręcać.

**Zwiększ**, a strzałki będą biec długimi prostymi pociągnięciami.
**Zmniejsz**, a zaczną się wić, skręcać co kilka kwadratów i wciskać w małe
zakamarki.

| `--straight=0` (najbardziej pokręcone) | domyślnie (`0.5`) | `--straight=1` (najprostsze) |
|---|---|---|
| <img src="docs/images/straight-winding.png" width="250"> | <img src="docs/images/default-30.png" width="250"> | <img src="docs/images/straight-straight.png" width="250"> |
| 66 strzałek, średnio 5,5 zakrętu | 87 strzałek, średnio 3,2 zakrętu | 49 strzałek, średnio 2,1 zakrętu |

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

### Jak rysowany jest obrazek

Te cztery nie zmieniają w łamigłówce nic — tylko to, jak wygląda na ekranie.

**`--colorized`** daje każdej strzałce własny kolor. Bezużyteczne do gry,
znakomite do zrozumienia. Wszystkie porównawcze obrazki na tej stronie z tego
korzystają.

| zwykłe | `--colorized` |
|---|---|
| <img src="docs/images/seed-7.png" width="260"> | <img src="docs/images/colorized.png" width="260"> |

**`--lineweight`** to grubość linii jako ułamek jednego kwadratu. Domyślnie
`0.5`, czyli linia wypełnia połowę swojego kwadratu.

| `--lineweight=0.2` | `--lineweight=0.9` |
|---|---|
| <img src="docs/images/weight-thin.png" width="260"> | <img src="docs/images/weight-thick.png" width="260"> |

Zwróć uwagę, co dzieje się z grotami. Na cienkiej linii grot jest porządnym
trójkątem, szerszym od linii. Gdy linia robi się gruba, na szerszy trójkąt nie
ma już miejsca, więc grot zmienia się w zaostrzony czubek.

**`--arrowwidth`** i **`--arrowheight`** ustawiają rozmiar grotów ręcznie, w
kwadratach. Oba domyślnie 0, co znaczy „wylicz z grubości linii”.

| `--arrowwidth=0.6 --arrowheight=0.6` | `--arrowwidth=2 --arrowheight=2` |
|---|---|
| <img src="docs/images/head-small.png" width="260"> | <img src="docs/images/head-big.png" width="260"> |

---

## Pełny zestaw ustawień

Jedenaście codziennych flag to skróty. Za każdą z nich stoi kilka
wewnętrznych pokręteł, a `--advanced` pozwala sięgnąć do nich wprost.
Zmniejszenie `--length` naprawdę znaczy „podnieś udział krótkich strzałek i
obniż udział średnich” — dwa pokrętła naraz.

Nie potrzebujesz tej sekcji, żeby używać narzędzia. Jest tu, bo pytanie „co to
pokrętło właściwie robi” zasługuje na odpowiedź.

```sh
deno task carve --advanced --w=40 --h=40 --seed=7 --pstraight=0.95 --svg
```

W trybie zaawansowanym zmieniają się dwie rzeczy. Szerokość i wysokość stają
się `--w` i `--h`. I znikają codzienne opcje — ustawiasz sam pokrętła, które za
nimi stoją.

Wszystkie trzydzieści jeden pokręteł jest niżej, w grupach takich, jakich
używa generator. Kliknij grupę, żeby ją rozwinąć.

### Jak to wygląda

Cztery pokrętła, których efekt widać, wszystkie na planszy 30×30 z ziarnem 7.

**`--warns` — wypełnianie niewygodnych zakamarków**

| `--warns=2` | `--warns=16` |
|---|---|
| <img src="docs/images/adv-warns-low.png" width="300"> | <img src="docs/images/adv-warns-high.png" width="300"> |
| 98 strzałek, średnio 2,4 zakrętu | 70 strzałek, średnio 3,8 zakrętu |

**`--wlateral` — skręcanie w bok zamiast parcia naprzód**

| `--wlateral=0` | `--wlateral=20` |
|---|---|
| <img src="docs/images/adv-lateral-0.png" width="300"> | <img src="docs/images/adv-lateral-20.png" width="300"> |
| 49 strzałek, średnio 18,4 kwadratu | 96 strzałek, średnio 9,4 kwadratu |

**`--probe` — jedna docelowa długość dla prawie wszystkich strzałek**

| `--probe=1 --probelen=2` | `--probe=1 --probelen=200` |
|---|---|
| <img src="docs/images/adv-probe-short.png" width="300"> | <img src="docs/images/adv-probe-long.png" width="300"> |
| 253 strzałki, żadna dłuższa niż 4 kwadraty | 61 strzałek, najdłuższa 92 kwadraty |

**`--headbias` — pokrętło, którego nie widać**

| `--headbias=-1` (warstwy) | `--headbias=1` (tunele) |
|---|---|
| <img src="docs/images/adv-layers.png" width="300"> | <img src="docs/images/adv-tunnels.png" width="300"> |
| 83 strzałki, **34%** z nich wolnych na starcie | 90 strzałek, wolnych tylko **6,7%** |

Dwa ostatnie obrazki są do siebie bardzo podobne i o to właśnie chodzi. To
pokrętło ledwo dotyka rysunku; decyduje o tym, ile strzałek wolno ci w danej
chwili stuknąć, a to właśnie czyni planszę łatwą albo trudną. Zostawione samo
sobie (`--headbias=0`) daje wynik pośredni, 13%.

<details>
<summary><b>Plansza</b> — 3 pokręteł</summary>

| Opcja | Zakres | Domyślnie | Co robi |
|---|---|---|---|
| `--w` | 4–1000 | 25 | Kolumny. Poniżej dwóch sekund do 400×400; około dziesięciu przy 1000×1000. |
| `--h` | 4–1000 | 50 | Wiersze. Plansza pionowa jest trudniejsza w grze od kwadratowej o tej samej liczbie kwadratów. |
| `--seed` | 0–999999 | 7 | Wybiera planszę. To samo ziarno i te same pokrętła, ta sama plansza. |

</details>

<details>
<summary><b>Jak długie są strzałki</b> — 3 pokręteł</summary>

Przed narysowaniem każdej strzałki generator rzuca trójścienną kostką, żeby
wybrać docelową długość: krótka (2–6 kwadratów), średnia (7–15) albo długa (16
wzwyż). Te pokrętła obciążają kostkę. Długie dostają to, co zostanie.

| Opcja | Zakres | Domyślnie | Co robi |
|---|---|---|---|
| `--wshort` | 0–1 | 0.2 | Udział krótkich strzałek. Im wyżej, tym więcej strzałek i grotów, ale plansza zmienia się w sieczkę z haczyków. |
| `--wmid` | 0–1 | 0.08 | Udział średnich strzałek. |
| `--lmax` | 0–5000 | 0 | Najdłuższa strzałka, o jaką generator będzie się starał. 0 znaczy „dwa i pół długości dłuższego boku”. **Uwaga:** wartości od 1 do 5 tną planszę na okruchy i generator się zacina — utyka, bo nie zostaje mu ani jedna dozwolona strzałka do narysowania. Używaj 0 albo 6 wzwyż. |

</details>

<details>
<summary><b>Jak błądzą linie</b> — 6 pokręteł</summary>

Za każdym razem, gdy linia rośnie o jeden kwadrat, te pokrętła rywalizują o to,
który sąsiedni kwadrat weźmie. Ich wartości są mnożone przez siebie, więc jedna
skrajna wartość zagłusza resztę.

| Opcja | Zakres | Domyślnie | Co robi |
|---|---|---|---|
| `--pstraight` | 0.6–1 | 0.85 | Jak chętnie linia idzie dalej prosto. Im wyżej, tym dłuższe proste odcinki. **Uwaga:** to jedyne pokrętło, które samo potrafi wszystko zepsuć. Poniżej 0,6 duże plansze przestają działać; dokładnie przy 0,6 plansze powyżej 500×500 czasem się zacinają. 0,65 jest bezpieczne. |
| `--wlateral` | 0–20 | 3 | O ile chętniej linia skręca w bok, niż wciska się w głąb wolnej przestrzeni. 0 daje długie proste pchnięcia i od czasu do czasu ogromne spirale. |
| `--warns` | 2–16 | 4 | Jak chętnie linia wypełnia niewygodne zakamarki, zanim zamienią się w ślepe uliczki. Im wyżej, tym mniej strzałek, za to dłuższych i bardziej zwiniętych. **Uwaga:** poniżej 2 reguła się wyłącza i plansze się zacinają. |
| `--anticoil` | 1–10 | 6 | Jak mocno linia stara się nie dotykać samej siebie. 1 wyłącza tę zasadę; im wyżej, tym mniej spirali i nieco krótsze strzałki. **Uwaga:** przy 10 i `--pstraight` na poziomie 0,45 lub niżej generator zacina się cztery razy na pięć. |
| `--hug` | 1–20 | 1 | Premia za prowadzenie linii wzdłuż już narysowanych strzałek. Ledwo widoczna; zostawiona do eksperymentów. |
| `--edgehug` | 0–4 | 0 | Czy krawędź planszy liczy się do tej premii jak sąsiad. Nic nie robi, dopóki `--hug` nie przekracza 1. |

</details>

<details>
<summary><b>Jak trudna jest łamigłówka</b> — 4 pokręteł</summary>

Te zmieniają to, kto kogo blokuje — czyli trudność — nie zmieniając zbytnio
tego, jak plansza wygląda.

| Opcja | Zakres | Domyślnie | Co robi |
|---|---|---|---|
| `--headbias` | `-1`, `0` albo `1` | 0 | Gdzie zaczyna się każda nowa strzałka. `-1` obiera planszę warstwami od zewnątrz (łatwo: wiele strzałek wolnych naraz). 0 zaczyna gdziekolwiek. 1 drąży tunele w głąb od najgłębszego punktu (trudno: mało wolnych strzałek naraz). **Uwaga:** tryb warstw jest wolny — 400×400 zajęło dwie i pół minuty, a 1000×1000 przerwano po dziesięciu. |
| `--mix` | `-1`, albo 0.3–0.7 | -1 | Miesza oba powyższe style. Wartość to udział strzałek zaczynanych jako tunele; reszta zaczyna się jako warstwy. `-1` wyłącza mieszanie. **Uwaga:** wartości spoza 0,3–0,7 zostawiają plansze niedokończone. |
| `--probe` | 0–1 | 0 | Udział strzałek, których długość losuje się wokół jednej ustalonej wartości zamiast ze zwykłej kostki. |
| `--probelen` | 2–200 | 12 | Ta ustalona wartość, plus minus połowa. 2 potraja liczbę strzałek; 200 daje kilka bardzo długich. Nic nie robi, dopóki `--probe` wynosi 0. |

</details>

<details>
<summary><b>Szkielet</b> — 10 pokręteł</summary>

Włączany przez `--skeleton` w trybie zwykłym. Pierwsze kilka strzałek jest
rysowanych jako długie zygzakujące autostrady przez całą planszę, a reszta
wypełnia się wokół nich.

| Opcja | Zakres | Domyślnie | Co robi |
|---|---|---|---|
| `--giants` | 0–40 | 0 | Ile pierwszych strzałek to autostrady. 0 znaczy żadna; 4 to dobry start. Prośba o dużo więcej nie szkodzi, ale nic nie daje: po pierwszych dwóch–trzech kolejne autostrady nie mają się już gdzie zmieścić. |
| `--giantspan` | 0–200 | 30 | Jak długa ma być jedna autostrada, liczone w długościach dłuższego boku planszy. Kończy wcześniej, gdy zabraknie miejsca. |
| `--giantstep` | 0–40 | 14 | Odstęp między równoległymi odcinkami autostrady. Mały daje równe pasy jak w zeszycie w linie, duży — kilka szerokich autostrad, a 0 pozwala jej błądzić swobodnie. |
| `--giantjitter` | 0–1 | 0.6 | Jak często odcinek urywa się przed przeszkodą, zamiast dojść do samej przeszkody. 0 daje idealnie proste, regularne brzegi. |
| `--wgiant` | 0–0.2 | 0 | Szansa, że strzałka rysowana później też będzie autostradą. **Uwaga:** powyżej 0,2 plansze robią się wolne i przestają się kończyć przy 1000×1000. |
| `--giantstraight` | 0.3–1 | 0.94 | Jak prosto biegnie autostrada tam, gdzie ma wolne miejsce. **Uwaga:** poniżej 0,3 plansze przestają się kończyć. |
| `--giantwarns` | 0–16 | 0 | Reguła wypełniania zakamarków, tylko dla autostrad. Zostaw 0 — zwija je, a autostrada ma jechać daleko. |
| `--giantanticoil` | 1–20 | 6 | Kara za dotykanie samej siebie, tylko dla autostrad. Obowiązuje wyższa z dwóch wartości: tej albo ogólnej. |
| `--giantspacing` | 1–3 | 2 | Ile kwadratów autostrada trzyma między własnymi równoległymi odcinkami. Powyżej 3 tylko kosztuje czas. |
| `--giantspacepenalty` | 1–40 | 8 | Jak mocno autostrada jest odpychana od samej siebie. Kara, nie zakaz, więc może zawracać. |

</details>

<details>
<summary><b>Wychodzenie z zacięcia</b> — 5 pokręteł</summary>

Co generator robi, gdy nie umie już znaleźć dozwolonej strzałki do narysowania.
Ustawienia domyślne radzą sobie z planszami do 400×400; te pokrętła są do
eksperymentów.

| Opcja | Zakres | Domyślnie | Co robi |
|---|---|---|---|
| `--headtries` | 2–16 | 4 | Ile miejsc startu wypróbować, zanim odpuści dany kierunek. **Uwaga:** przy 1 poszukiwanie jest za płytkie na trudne ustawienia. Przy 8 i więcej zwykle wychodzi ta sama plansza co przy 4. |
| `--strandlimit` | 10–30 | 30 | Największa resztka, którą jeszcze porządnie się sprawdza pod kątem tego, czy zmieści się w niej strzałka. **Uwaga:** poniżej 10 na dużych planszach prześlizgują się dziury po dziesięć kwadratów. |
| `--absorblimit` | 12–64 | 24 | Resztka do tego rozmiaru, w którą żadna strzałka nie wchodzi, jest doklejana do sąsiedniej strzałki. **Uwaga:** przy dolnym krańcu zakresu, poniżej 13, resztki się piętrzą i plansze psują się dużo częściej. |
| `--maxback` | 0–1000, co 50 | 0 (= 200) | Ile narysowanych strzałek wolno cofnąć w jednej próbie, zanim zacznie się od nowa. Więcej rzadko cokolwiek ratuje; tylko odwleka złą wiadomość. |
| `--restarts` | 0–5 | 3 | Ile świeżych prób, każda z lekko zmienionym ziarnem, po niepowodzeniu. 0 pokazuje surową skuteczność twoich ustawień. |

</details>

### Kombinacje, które są odrzucane

Trzech reguł nie da się zapisać jako zwykły zakres „od–do”, więc sprawdza się
je osobno:

| Reguła | Po ludzku |
|---|---|
| Udział krótkich plus średnich | Razem nie mogą przekroczyć 0,9, żeby co najmniej dziesiąta część strzałek była długa. |
| Długość maksymalna | `--lmax` musi być 0 (automatycznie) albo co najmniej 6. |
| Mieszanie warstw i tuneli | `--mix` musi być `-1` (wyłączone) albo między 0,3 a 0,7. |

Złam regułę albo wyjdź którymkolwiek pokrętłem poza zakres, a generator odmówi,
zanim cokolwiek narysuje, powie ci, która wartość była zła, i zakończy się
kodem 2. Nigdy po cichu nie zaokrągli twojej liczby do zakresu.

Codzienne opcje nie potrafią złamać tych reguł. Zbudowano je tak, żeby każda
wartość każdej codziennej opcji, przy każdym rozmiarze planszy, dawała poprawną
kombinację.

---

## Strona internetowa

Jest mała strona do zabawy ustawieniami i natychmiastowego oglądania wyniku.

```sh
sh prototype/lab.sh
```

Buduje stronę, otwiera `http://localhost:8777/lab.html` i przebudowuje ją za
każdym razem, gdy zmieni się plik źródłowy. Zatrzymasz ją klawiszami Ctrl+C.
Jeśli port 8777 jest już zajęty na twoim komputerze, dopisz inny numer: `sh
prototype/lab.sh 9000`.

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

Domyślnie plansze trafiają do `prototype/boards/`, po jednym katalogu na każdy
rozmiar:

```
prototype/boards/
  25x25/
    seed7-7d303227.svg     obrazek
    seed7-7d303227.json    z czego powstał
  40x40/
    ...
```

Nazwa pliku to ziarno, a po nim krótki kod wyliczony z ustawień. Zmień
ustawienie, a dostaniesz inny kod, więc nic nie nadpisze się przypadkiem.
(Kolory i grubość linii nie wchodzą do kodu, więc zmiana tylko ich zapisuje pod
tą samą nazwą i zastępuje poprzedni obrazek.)

Wskaż inne miejsce zmienną `ARROWZ_BOARDS_DIR`:

```sh
export ARROWZ_BOARDS_DIR=~/arrowz-boards
deno task carve --width=25 --height=25
```

Plik `.json` obok każdego obrazka trzyma wszystkie użyte ustawienia, datę
powstania, czas liczenia i liczbę strzałek. Trzyma też linię `command`, która
odtwarza obrazek dokładnie, bajt w bajt. Jeśli masz zachować z planszy jedną
rzecz, zachowaj tę linię.

> Plansze nie trafiają do repozytorium. `prototype/boards/` jest celowo
> wykluczone, bo duże plansze ważą dziesiątki megabajtów.

---

## Kiedy coś nie działa

**`deno task couldn't find deno.json`** — jesteś poza katalogiem projektu.
Wejdź do katalogu `arrowz` i spróbuj jeszcze raz.

**`Requires env access`** — to znaczy, że `deno run prototype/carve.ts` zostało
uruchomione bezpośrednio. Deno nie pozwala programowi tknąć twoich plików ani
ustawień bez wyraźnej zgody. Używaj `deno task carve`, które nadaje dokładnie
tyle uprawnień, ile trzeba.

**`unknown flag --pstraight`** — to pokrętło istnieje tylko w trybie
zaawansowanym. Dodaj `--advanced` i pamiętaj, że szerokość i wysokość stają się
tam `--w` i `--h`.

**`invalid parameters: … is outside …`** — któraś wartość jest poza zakresem.
Komunikat podaje nazwę ustawienia i dozwolony zakres. Nic się nie policzyło i
nic się nie zapisało.

**`failed to close board …`** — generator próbował, cofał się, zaczynał od nowa
i mimo to nie zdołał wypełnić planszy. Prawie zawsze chodzi o ustawienie
oznaczone wyżej jako **Uwaga:**. Cofnij je w stronę wartości domyślnej albo
zmień ziarno.

**Raport trwa wieczność** — `deno task carve --advanced` bez niczego więcej
przechodzi przez wszystkie poziomy trudności do 1000×1000, po trzy razy każdy.
Dodaj `--only=easy --square --runs=1`. Uwaga: samo `--only=easy` nie pasuje do
niczego — potrzebuje obok `--square` albo `--portrait`.

**Strona nic nie pokazuje** — stronę trzeba najpierw zbudować. `sh
prototype/lab.sh` robi to za ciebie; otwarcie `lab.html` prosto z menedżera
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
| **ziarno** | Liczba, która decyduje, jaką planszę dostajesz. To samo ziarno i te same ustawienia, ta sama plansza. |
| **szkielet** | Kilka bardzo długich strzałek narysowanych na początku, przecinających całą planszę. W kodzie *giants* albo *skeleton*. |
| **warstwy / tunele** | Dwa sposoby wyznaczania miejsca startu kolejnej strzałki. Warstwy obierają planszę od zewnątrz i ułatwiają grę; tunele drążą w głąb i utrudniają. |
| **zacięcie** | Zapędzenie się generatora w kozi róg podczas budowania, tak że nie da się dołożyć żadnej dozwolonej strzałki. |
| **bezpieczny zakres** | Zmierzone granice każdego ustawienia. Poza nimi plansze przestają działać; narzędzie woli odmówić, niż pozwolić, żebyś przekonał się o tym po długim czekaniu. |

---

## Gdzie co leży

| Ścieżka | Co to |
|---|---|
| `prototype/engine.ts` | Sam generator. Nie wie nic o plikach ani o stronach internetowych. |
| `prototype/carve.ts` | Narzędzie wiersza poleceń. |
| `prototype/lab.html`, `lab-page.ts` | Strona internetowa. |
| `prototype/*.test.ts` | Testy. |
| `prototype/README.md` | Dziennik inżynierski: każdy pomiar, każda ślepa uliczka, każda decyzja, ze szczegółami. |
| `docs/superpowers/specs/` | Dokumenty projektowe, w tym pełne reguły gry. |

Kod w `prototype/` jest prototypem w uczciwym sensie tego słowa: istnieje po
to, żeby rozstrzygnąć pytania o to, co sprawia, że plansza jest dobra, a
właściwa gra powstanie osobno.
