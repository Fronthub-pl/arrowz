# Wiersz poleceń

Wiersz poleceń robi plansze: `arrowz carve` układa planszę i ją zapisuje. To pakiet npm `@fronthub/arrowz-cli`. W klonie repozytorium ten sam program działa jako `deno task carve`, a `deno task report` mierzy generator na wielu planszach.

Plansze na tej stronie powstają w Twojej przeglądarce, tym samym generatorem, którego używa polecenie, z polecenia wypisanego pod każdą z nich. **Otwórz w laboratorium** otwiera to polecenie w laboratorium.

## Pierwsze kroki {#start}

Polecenie potrzebuje [Node.js](https://nodejs.org/) w wersji 22.12 lub nowszej. Zainstaluj je i zrób pierwszą planszę:

```sh
npm install -g @fronthub/arrowz-cli
arrowz carve --width=25 --height=25 --svg
```

Żeby spróbować raz, bez instalowania czegokolwiek, wpisz `npx @fronthub/arrowz-cli carve` zamiast `arrowz carve`. `arrowz` to nazwa polecenia, nie pakietu: `npx arrowz` pobrałby jakiś inny pakiet o tej nazwie, a to nie jest ten.

Plansza trafia do `boards/25x25/` w katalogu, z którego uruchomiono polecenie: plik planszy, który czyta gra (`.board.json`), notatka o tym, jak powstała (`.json`), a dzięki `--svg` także obrazek do otwarcia w przeglądarce.

## Robienie plansz {#making}

Wszystko robi zadanie `carve`. Flagi na co dzień i pokrętła podajesz razem, w jednym poleceniu, a żadna flaga nie zmienia znaczenia innej. Polecenie wypisuje własną instrukcję. Obie jej postaci są na końcu tej strony, w sekcji [Co wypisuje `--help`](docs:cli#help).

```sh
arrowz carve --help          # krótka postać: flagi na co dzień, wyjście, obrazek (także -h)
arrowz carve --help=knobs    # pełna tabela: każde pokrętło, jego zakres i wartość domyślna
```

### Plansza

```sh
arrowz carve --width=40 --height=40 --seed=7
```

Polecenie zapisuje dwa pliki w `boards/40x40/`. Nazwy obu, `sha256-…`, pochodzą od strzałek na planszy:

- `….board.json` — plansza: każda strzałka, komórka po komórce, ciasno spakowana. Ten plik wczytuje gra.
- `….json` — mały plik tekstowy z zapisem, jak plansza powstała.

Nazwa pochodzi od strzałek, nie od ustawień. Inne ziarno albo inne ustawienia, które przypadkiem ułożą dokładnie te same strzałki, trafiają do tych samych plików, a mały plik wymienia każde polecenie, które je zrobiło. Dlatego „czy ta plansza już powstała?” to to samo pytanie co „czy jej plik już jest?”.

### Także obrazek

```sh
arrowz carve --width=40 --height=40 --svg
arrowz carve --width=40 --height=40 --svg=my-board.svg
```

`--svg` dokłada obrazek, `….svg`, obok pliku planszy. `--svg=my-board.svg` robi to samo i dodatkowo kładzie kopię w `my-board.svg`. Względna ścieżka zaczyna się w katalogu, z którego uruchomiono polecenie.

### Pięć rzeczy do wypróbowania

Skopiuj dowolne z nich. Każde zapisuje planszę w `boards/`. Dodaj `--svg`, żeby dostać też obrazek, albo `--dry-run`, żeby zobaczyć liczby bez zapisywania pliku. Każda flaga stąd jest objaśniona w sekcji [Ustawienia na co dzień](docs:cli#everyday).

```sh
# na tyle mała, żeby prześledzić wzrokiem każdą strzałkę
arrowz carve --width=12 --height=12 --colored

# gęste pole drobnych strzałek
arrowz carve --width=40 --height=40 --length=0 --colored

# zamiast tego kilka długich węży
arrowz carve --width=40 --height=40 --length=1 --winding=0 --colored

# szkielet bardzo długich strzałek przez całą planszę
arrowz carve --width=80 --height=80 --skeleton --colored

# wysoka plansza
arrowz carve --width=40 --height=80
```

### Wiele plansz naraz

```sh
arrowz carve --width=100 --height=200 --seed=1 --count=50
```

To robi 50 różnych plansz, na ziarnach 1, 2, 3 i tak dalej. Ziarno, którego plansza nie jest pełna, jest pomijane i nic z niego nie trafia na dysk. Ziarno, które układa planszę już obecną w magazynie, też jest pomijane, ale jego polecenie zostaje dopisane do pliku `.json` tamtej planszy. W obu przypadkach polecenie bierze następne ziarno, aż zbierze 50 plansz. Gdy wypróbuje dwa razy więcej ziaren, niż ma zrobić plansz, poddaje się, a `--max-seeds=200` przesuwa tę granicę. Ostatni wiersz mówi, ile plansz zapisano, które ziarna pominięto i dlaczego. Bez `--randomized` każde ziarno zawsze układa tę samą planszę, więc to samo polecenie uruchomione na pustym magazynie robi te same plansze.

### Opis planszy bez zapisywania

```sh
arrowz carve --width=30 --height=30 --seed=7 --dry-run
```

To buduje planszę, niczego nie zapisuje i wypisuje jeden wiersz z jej opisem, w formacie dla programów, nie dla ludzi. Oto on, skrócony do najciekawszych pól:

```json
{
  "W": 30,
  "H": 30,
  "seed": 7,
  "ok": true,
  "pieces": 87,
  "avgLen": 10.34,
  "maxLen": 44,
  "solvable": true,
  "genMs": 11,
  "pinned": [],
  "command": "arrowz carve --width=30 --height=30 --seed=7"
}
```

Czytaj go tak: `ok` mówi, że plansza jest pełna, `pieces` to liczba jej strzałek, `avgLen` i `maxLen` to średnia i najdłuższa strzałka w komórkach, `solvable` mówi, że łamigłówka ma rozwiązanie, a `genMs` to liczba milisekund, które to zajęło. `command` robi tę samą planszę jeszcze raz. `pinned` wymienia pokrętła podane wprost w poleceniu — tu żadnych; zobacz [Wszystkie pokrętła](docs:cli#knobs). Oto ta plansza, zmierzona przed chwilą:

::board[Plansza, którą opisuje to polecenie]{cmd="--width=30 --height=30 --seed=7" stats="pieces avgLen longest time"}

To najszybszy sposób, żeby wypróbować ustawienie: widzisz, ile strzałek dostajesz i ile to trwało, bez ani jednego pliku na dysku.

### Plansza, która nie jest pełna

Rzadko, przy dużych rozmiarach, generator poddaje się, zanim wypełni wszystkie komórki. Plansza i tak zostaje zapisana, opis mówi `"ok": false`, a polecenie kończy się kodem wyjścia 1, żeby skrypt to zauważył. Dodaj `--svg`, a obrazek pokaże puste komórki zabarwione na różowo. Zbyt długie generowanie można przerwać:

```sh
CARVE_TIMEOUT_S=60 arrowz carve --width=1000 --height=1000
```

To zatrzymuje generator po minucie i zapisuje to, co zdążył ułożyć, z oznaczeniem `"aborted": true`.

### Raport pomiarów

```sh
deno task report --only=easy --square --runs=1
```

`deno task report` buduje plansze na swoich stałych poziomach trudności, od 25×25 do 1000×1000, i wypisuje o nich stronę pomiarów. To narzędzie do strojenia generatora. Do robienia plansz nie jest potrzebne. To zadanie repozytorium (zobacz [W klonie repozytorium](docs:cli#clone)); zainstalowane polecenie go nie ma. Dla każdego poziomu wypisuje taki blok:

```text
--- Easy 25x25 (1 runs) ---
  coverage      100.00%   solvable: YES
  pieces        72   length 2..42
  length dist.  2-6: 63%  7-15: 22%  16-49: 15%  50+: 0.0%
  ...
  time          generation 22 ms, metrics 2 ms
```

Warto znać dwa wiersze: `coverage 100.00%` znaczy, że żadna komórka nie została pusta, a `solvable: YES`, że łamigłówkę da się skończyć.

Bez `--only` raport przechodzi po kolei przez każdy poziom trudności, aż do 1000×1000, co trwa długo. Przyjmuje te same pokrętła co `carve` i te własne flagi:

| Flaga         | Co robi                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--only=NAME` | tylko jeden poziom, po nazwie, jaką wypisuje raport (`easy·sq`, `hard·pt`, …)                                                                                                        |
| `--square`    | tylko plansze kwadratowe; `easy` oznacza wtedy kwadratową                                                                                                                            |
| `--portrait`  | tylko plansze pionowe, o wysokości dwa razy większej niż szerokość                                                                                                                   |
| `--mid=N`     | dodaje poziom o boku N po stałych, jako N×N i N×2N albo w jednym kształcie wybranym przez `--square` lub `--portrait`; żeby znaleźć, od jakiego rozmiaru plansze przestają być pełne |
| `--runs=N`    | ile plansz na poziom, domyślnie 3                                                                                                                                                    |
| `--show`      | wypisuje jako tekst pierwszą planszę każdego poziomu o szerokości najwyżej 40 komórek                                                                                                |
| `--bench=N`   | zamiast tego mierzy szybkość: N przebiegów na poziom, ze statystyką czasów                                                                                                           |

### Prośba o coś niemożliwego

Generator odrzuca ustawienia, o których wie, że nie zadziałają. Robi to, zanim zacznie, a nie po dziesięciu minutach prób:

```sh
arrowz carve --width=30 --height=30 --pstraight=0.2 --svg=/tmp/x.svg
```

```text
invalid arguments:
  - --pstraight=0.2 is outside 0.6..1
see --help
```

Polecenie kończy się kodem wyjścia 2. Kod wyjścia to liczba, którą program zostawia po zakończeniu. Skrypty czytają ją, żeby wiedzieć, jak poszło: 0 znaczy, że wszystko się udało, 1, że generator się poddał, a 2, że polecenie odrzuciło to, o co poproszono.

## Ustawienia na co dzień {#everyday}

Flagi na co dzień to te, po które sięgasz najpierw: rozmiar, ziarno i cztery, które zmieniają łamigłówkę. Flagi obrazka, opisane po nich, niczego w łamigłówce nie zmieniają, tylko sposób jej rysowania.

### Rozmiar — `--width` i `--height`

Ile komórek w poziomie i w pionie. Obie flagi są wymagane, każda od 4 do 1000. Plansza 400×400 jest gotowa w niecałe dwie sekundy, a 1000×1000 w około dziesięć.

:::compare
::board[`--width=20 --height=40`]{cmd="--width=20 --height=40 --seed=7"}
::board[`--width=100 --height=100`]{cmd="--width=100 --height=100 --seed=7"}
:::

### Jak duża może być plansza

Górna granica to 1000×1000, milion komórek. Powyżej mniej więcej dwustu komórek na bok strzałek nie widać już w tej skali pojedynczo, a plansza zamienia się w tkaninę. Powiększ ją — kółkiem z wciśniętym ⌘ albo Ctrl, albo przyciskami w jej rogu — albo otwórz ją w laboratorium, a łamigłówka jest taka sama jak na małej planszy. Plansza z milionem komórek powstaje przez około dziesięć sekund, więc czeka na swój przycisk.

:::compare{stats="pieces avgLen longest time"}
::board[200×200]{cmd="--width=200 --height=200 --seed=7"}
::board[500×500]{cmd="--width=500 --height=500 --seed=7"}
::board[1000×1000]{cmd="--width=1000 --height=1000 --seed=7" manual about="10"}
:::

Średnia strzałka prawie nie rośnie razem z planszą, więc większa plansza daje więcej strzałek, a nie dłuższe. Rośnie za to najdłuższa strzałka.

### Ziarno — `--seed`

Liczba od 0 do 4294967295, która wybiera, jaką planszę dostajesz. Gdy reszta się nie zmienia, to samo ziarno zawsze daje tę samą planszę, a inne ziarno inną planszę o tym samym charakterze. Domyślnie: 7.

:::compare
::board[`--seed=7`]{cmd="--width=20 --height=20 --seed=7"}
::board[`--seed=42`]{cmd="--width=20 --height=20 --seed=42"}
:::

### Długość strzałek — `--length`

Wartość od 0 do 1. Domyślnie: `0.75`. **Zmniejsz** ją, a plansza wypełni się krótkimi strzałkami. Jest ich dużo, każda ma własny grot i stoją ciasno jak pole małych haczyków. **Zwiększ** ją, a plansza złoży się z kilku długich węży, z rzadko rozsianymi grotami. Na planszy 30×30 z ziarnem 7:

:::compare{stats="pieces avgLen"}
::board[`--length=0`]{cmd="--width=30 --height=30 --seed=7 --length=0 --colored"}
::board[domyślnie (`0.75`)]{cmd="--width=30 --height=30 --seed=7 --colored"}
::board[`--length=1`]{cmd="--width=30 --height=30 --seed=7 --length=1 --colored"}
:::

Więcej strzałek nie znaczy od razu trudniej. To inny rodzaj trudności. Przy krótkich strzałkach jest wiele rzeczy do obejrzenia. Długich jest mniej, ale każda sięga dalej i więcej blokuje.

### Krętość — `--winding`

Wartość od 0 do 1. Domyślnie: `0.5`. Ustala, jak chętnie strzałka jedzie dalej prosto zamiast skręcać: `0` daje najprostszą planszę, `1` najbardziej krętą. **Zmniejsz** ją, a strzałki biegną długimi prostymi odcinkami. **Zwiększ**, a wiją się, skręcają co kilka komórek i wciskają w małe zakamarki.

:::compare{stats="pieces bends"}
::board[`--winding=0`]{cmd="--width=30 --height=30 --seed=7 --winding=0 --colored"}
::board[domyślnie (`0.5`)]{cmd="--width=30 --height=30 --seed=7 --colored"}
::board[`--winding=1`]{cmd="--width=30 --height=30 --seed=7 --winding=1 --colored"}
:::

Oba końce skali dają _mniej_ strzałek niż środek. Proste strzałki biegną dalej, zanim się zatrzymają, a kręte zajmują więcej komórek, gdy wypełniają kąty. Najgęstsze plansze są pośrodku.

### Szkielet — `--skeleton`

Przełącznik, domyślnie wyłączony. Gdy jest włączony, generator najpierw układa szkielet: kilka bardzo długich strzałek, które wiją się tam i z powrotem przez całą planszę. Potem wypełnia kanały między nimi zwykłymi strzałkami. To jedyny sposób na naprawdę długie strzałki: zostawiony sam sobie, generator rzadko robi strzałkę, która przechodzi przez całą planszę.

:::compare{stats="pieces longest"}
::board[bez szkieletu]{cmd="--width=60 --height=60 --seed=7 --colored"}
::board[`--skeleton`]{cmd="--width=60 --height=60 --seed=7 --skeleton --colored"}
:::

### Za każdym razem nowe losowanie — `--randomized`

Zwykle wartość `--length` albo `--winding` oznacza jeden dokładny zestaw pokręteł. Z `--randomized` każda wartość oznacza zakres, a generator przy każdym uruchomieniu losuje z niego nowy zestaw. Dlatego to samo ziarno daje za każdym razem inną planszę: o tym dodatkowym rzucie kością ziarno nie decyduje. Nic nie ginie. Wylosowane ustawienia trafiają do pliku `.json` planszy jako pełne polecenie, więc każdą planszę, która Ci się spodoba, da się zrobić jeszcze raz, dokładnie taką samą.

```sh
arrowz carve --width=40 --height=40 --randomized
```

Podanie pokrętła obok `--randomized` przypina tylko to jedno pokrętło, a reszta dalej jest losowana; zobacz [Wszystkie pokrętła](docs:cli#knobs).

### Jak rysowany jest obrazek

Te flagi niczego w łamigłówce nie zmieniają, tylko jej wygląd. Plansze na tej stronie rysują je tak jak wiersz poleceń, z wyjątkiem `--cell`: plansza tutaj mieści się w swojej ramce i daje się powiększać.

**`--colored`** daje każdej strzałce własny kolor. W grze to nie pomaga, ale bardzo pomaga zrozumieć planszę. Większość porównań na tej stronie go używa.

:::compare
::board[zwykła]{cmd="--width=20 --height=20 --seed=7"}
::board[`--colored`]{cmd="--width=20 --height=20 --seed=7 --colored"}
:::

**`--line`** to grubość linii jako część komórki. Domyślnie `0.5`: linia wypełnia połowę swojej komórki.

:::compare
::board[`--line=0.2`]{cmd="--width=20 --height=20 --seed=7 --line=0.2"}
::board[`--line=0.9`]{cmd="--width=20 --height=20 --seed=7 --line=0.9"}
:::

Spójrz na groty. Na cienkiej linii grot jest porządnym trójkątem, szerszym od linii. Gdy linia jest gruba, na szerszy trójkąt nie ma miejsca, więc grot staje się zaostrzonym czubkiem.

**`--arrow-width`** i **`--arrow-height`** ustalają rozmiar grotów ręcznie, w komórkach, i działają inaczej. `--arrow-width` ma domyślnie `auto`, czyli szerokość wyliczoną z grubości linii, a liczba to szerokość w komórkach. `--arrow-height` nie ma trybu automatycznego: zawsze działa tak, jak ją zapiszesz, a domyślnie wynosi `1`, całą komórkę. `--arrow-height=0` daje grot bez żadnej wysokości.

:::compare
::board[`--arrow-width=0.6 --arrow-height=0.6`]{cmd="--width=20 --height=20 --seed=7 --arrow-width=0.6 --arrow-height=0.6"}
::board[`--arrow-width=0.9 --arrow-height=1.2`]{cmd="--width=20 --height=20 --seed=7 --arrow-width=0.9 --arrow-height=1.2"}
:::

**`--sharp`** zdejmuje zaokrąglenia: linia skręca pod kątem zamiast łukiem, a jej tępy koniec jest kwadratowy zamiast zaokrąglonego.

**`--theme`** maluje planszę jednym z dwunastu motywów kolorów laboratorium (`--theme=gruvbox-dark`, `--theme=catppuccin-latte`, …). Nieznana nazwa jest odrzucana razem z listą motywów. **`--paper`**, **`--ink`** i **`--highlight-color`** ustawiają po jednym kolorze jako `#rrggbb`: tło, strzałki i strzałki zaznaczone przez `--top`. Mają pierwszeństwo przed kolorami motywu. **`--palette`** podaje kolory strzałek dla `--colored`, najwyżej osiem, rozdzielone przecinkami.

**`--pad`** to margines wokół planszy, w komórkach, od 0 do 16 (domyślnie 4, tak jak rysuje go laboratorium). **`--points`** stawia kropkę na środku każdej komórki, jak siatka kropek w laboratorium. **`--point-color`** i **`--point-radius`** (w komórkach, najwyżej 0,5) zmieniają kropkę.

**`--cell`** to rozmiar jednej komórki na obrazku, w pikselach, od 1 do 200. Pominięty wynosi 1600 podzielone przez dłuższy bok, ale nigdy więcej niż 18. **`--top`** zaznacza N najdłuższych strzałek (najwyżej 1000) kolorem wyróżnienia, a przy zapisie planszy wypisuje ich pomiary nad wierszem podsumowania.

Bieżące polecenie laboratorium niesie wszystkie te flagi, więc skopiowane robi ten sam obrazek, który eksportuje laboratorium.

## Wszystkie pokrętła {#knobs}

Flagi na co dzień to skróty. Za każdą z nich stoi kilka pokręteł, a każde pokrętło możesz ustawić wprost, w tym samym poleceniu co flagi na co dzień. Na przykład zmniejszenie `--length` od wartości domyślnej naprawdę znaczy „zwiększ udział krótkich strzałek, a razem z nim udział średnich”: dwa pokrętła naraz.

Ta sekcja nie jest potrzebna, żeby używać wiersza poleceń. Jest tu, bo pytanie „co właściwie robi to pokrętło?” zasługuje na odpowiedź.

```sh
arrowz carve --width=40 --height=40 --seed=7 --pstraight=0.95 --svg
```

Pokrętło podane wprost ma pierwszeństwo przed flagą na co dzień, która inaczej by je ustawiła.

### Gdy pokrętło spotyka flagę na co dzień

Flaga na co dzień nie ustawia jednego pokrętła, tylko cały ich zestaw:

| Flaga na co dzień           | Pokrętła, które ustawia                                     |
| --------------------------- | ----------------------------------------------------------- |
| `--length`                  | `wshort`, `wmid`                                            |
| `--winding`                 | `pstraight`, `wlateral`, `warns`, `anticoil`                |
| `--skeleton`                | `giants`, `giantspan`, `giantstep`, `giantjitter`, `wgiant` |
| _(zawsze: bazowa trudność)_ | połowę `--start`, `probe`, `probelen`                       |

`--start` to mały przypadek tej samej reguły: jedna jego połowa należy do bazowej trudności z tabeli wyżej, a druga ustawia mieszankę warstw i tuneli, której nie ustawia nic innego. Dziesięć pokręteł nie należy do żadnego zestawu, więc podanie któregoś z nich nigdy nie jest niejednoznaczne: `lmax`, `backbite`, `trapbias`, `giantstraight`, `giantanticoil`, `giantspacing`, `headtries`, `absorblimit`, `maxback`, `restarts`.

**Pokrętło zapisane w poleceniu wygrywa i przypina tylko siebie.** Bez `--randomized` flaga na co dzień wybiera jedną wartość dla każdego pokrętła ze swojego zestawu. Podane pokrętło zastępuje tę jedną wartość, a resztę zestawu zostawia tak, jak ustawiła ją flaga. Z `--randomized` flagi na co dzień przy każdym uruchomieniu losują swoje zestawy ze zmierzonych bezpiecznych zakresów. Podane pokrętło jest wtedy przypięte, a nie losowane, a reszta jego zestawu dalej jest losowana wokół niego, ziarno po ziarnie.

Wiersz poleceń mówi o tym, gdy to się dzieje, raz na uruchomienie, na stderr. Ten sam fakt dopisuje do wiersza `--dry-run`, żeby skrypt widział go bez czytania stderr:

```sh
arrowz carve --width=30 --height=30 --randomized --winding=0.5 --pstraight=0.9 --dry-run
```

```text
note: --pstraight=0.9 is pinned; --winding still sets wLateral, anticoil, warns
```

```json
{ "...": "...", "pinned": ["pStraight"], "...": "..." }
```

Przypiąć można też pokrętło, które przy reszcie ustawień niczego nie zmienia: pokrętło szkieletu bez szkieletu albo zadaną długość, gdy „ile zadanych” wynosi 0. Laboratorium przyciemnia takie pokrętło. Wiersz poleceń wypisuje to w osobnej linijce, z tym samym powodem, tylko po angielsku:

```sh
arrowz carve --width=30 --height=30 --probelen=30 --dry-run
```

```text
note: --probelen=30 is pinned; the difficulty baseline still sets headBias, probe
note: --probelen=30 has no effect here: no arrow gets a target length while target share is 0
```

Tego drugiego wiersza nie ma w serii `--count` losowanej z `--randomized`. Tam każda plansza dostaje własne pokrętła, wylosowane na nowo, a nie z ziarna, więc jedna uwaga na całe uruchomienie nie mówiłaby prawdy o wszystkich.

Gdy losowanie musi przesunąć własną wartość, żeby zachować regułę, mówi, którą i dokąd. Podaj udział większy niż to, co zostało pod limitem, a ustąpi udział ustawiony przez flagę na co dzień:

```sh
arrowz carve --width=30 --height=30 --length=0 --wmid=0.5 --dry-run
```

```text
note: --wmid=0.5 is pinned; --length still sets wShort
note: --wshort moved from 0.75 to 0.4: short and medium shares add up to more than 0.9 (90%); at least a tenth of the arrows must stay long
```

Ile kosztuje przypinanie: bezpieczne zakresy w tabeli niżej zmierzono dla całych zestawów. Częściowo przypięty zestaw zostaje w nich, ale nie obejmuje go już obietnica, że _każde_ połączenie flag na co dzień wypełnia planszę. Ostatnie słowo nadal mają zakresy: przypięta wartość spoza własnego zakresu albo połączenie, które łamie regułę, jest odrzucane dokładnie tak samo jak bez przypinania.

### Pokrętła

Wszystkie, w grupach takich jak w `arrowz carve --help=knobs`. **Krok** to odległość między wartościami, które przyjmuje pokrętło. Wartość między dwoma krokami jest odrzucana, tak jak wartość spoza zakresu, bo ani suwak laboratorium, ani wypisane polecenie nie mogłyby do niej wrócić. Tabela pochodzi z kodu wiersza poleceń, więc mówi to, co polecenie przyjmuje.

::table{of="knobs"}

### Jak wyglądają niektóre z nich

Cztery pokrętła obok siebie, każde na planszy 30×30 z ziarnem 7. Trzy z nich zmieniają obrazek, a czwarte zmienia coś, czego nie widać.

**`--warns` — najpierw wypełnia trudne kąty**

:::compare{stats="pieces bends"}
::board[`--warns=2`]{cmd="--width=30 --height=30 --seed=7 --warns=2 --colored"}
::board[`--warns=16`]{cmd="--width=30 --height=30 --seed=7 --warns=16 --colored"}
:::

**`--wlateral` — skręca w bok, zamiast pchać się naprzód**

:::compare{stats="pieces avgLen"}
::board[`--wlateral=0`]{cmd="--width=30 --height=30 --seed=7 --wlateral=0 --colored"}
::board[`--wlateral=20`]{cmd="--width=30 --height=30 --seed=7 --wlateral=20 --colored"}
:::

**`--probe` — jedna zadana długość dla każdej strzałki**

:::compare{stats="pieces longest"}
::board[`--probe=1 --probelen=4`]{cmd="--width=30 --height=30 --seed=7 --probe=1 --probelen=4 --colored"}
::board[`--probe=1 --probelen=200`]{cmd="--width=30 --height=30 --seed=7 --probe=1 --probelen=200 --colored"}
:::

**`--start` — pokrętło, którego nie widać**

:::compare{stats="pieces f0"}
::board[`--start=layers`]{cmd="--width=30 --height=30 --seed=7 --start=layers --colored"}
::board[`--start=tunnels`]{cmd="--width=30 --height=30 --seed=7 --start=tunnels --colored"}
:::

Dwie plansze `--start` wyglądają bardzo podobnie i właśnie o to chodzi: to pokrętło prawie nie zmienia rysunku. Zmienia to, ile strzałek jest wolnych w każdej chwili, a od tego zależy, czy plansza jest łatwa, czy trudna. Domyślne `--start=random` leży między nimi. Liczba od 0,3 do 0,7 nie wybiera jednego z nich, tylko miesza `layers` i `tunnels`: to udział strzałek, które startują jako tunele.

### Odrzucane połączenia

Niektórych reguł nie da się zapisać jako zakresu od jednej wartości do drugiej, więc są sprawdzane osobno:

::table{of="rules"}

Złam regułę, ustaw pokrętło poza zakresem albo między dwoma jego krokami, a generator odmówi, zanim cokolwiek ułoży. Powie, która wartość była zła, i zakończy się kodem wyjścia 2. Nigdy nie poprawia liczby po cichu: `--maxback=75` jest odrzucane, a nie przesuwane do 50 albo 100. Wartość, do której nie dojdzie żaden suwak ani żadne wypisane polecenie, nie pozwoliłaby zrobić tej planszy jeszcze raz.

Flagi na co dzień nie mogą złamać tych reguł. Każda wartość każdej flagi na co dzień, przy każdym rozmiarze planszy, daje poprawne połączenie, o ile pokrętła z jej zestawu zostawisz tej fladze. Ile kosztuje przypięcie jednego z nich, jest opisane wyżej.

## Gdzie zapisują się plansze {#saved}

Domyślnie plansze trafiają do `boards/` w katalogu, z którego uruchamiasz polecenie, do osobnego katalogu dla każdego rozmiaru:

```text
boards/
  25x25/
    sha256-0dc74eef….board.json   the board
    sha256-0dc74eef….json         what it was made from
    sha256-0dc74eef….svg          the picture, only with --svg
  40x40/
    ...
```

Nazwa pliku pochodzi od strzałek na planszy. Te same strzałki z innego ziarna albo z innych ustawień dzielą jeden komplet plików, a plik `.json` wymienia każde polecenie, które je zrobiło. Kolory i grubość linii nie wchodzą do nazwy, więc zmiana tylko ich zapisuje pod tą samą nazwą i podmienia obrazek.

Inne miejsce wskażesz zmienną `ARROWZ_BOARDS_DIR`; względna ścieżka w niej też zaczyna się w katalogu, z którego uruchamiasz polecenie:

```sh
export ARROWZ_BOARDS_DIR=~/arrowz-boards
arrowz carve --width=25 --height=25
```

Plik `.json` obok każdej planszy trzyma każde użyte ustawienie, czas powstania planszy, czas generowania i liczbę strzałek. Trzyma też wiersz `command`, który robi dokładnie tę samą planszę jeszcze raz. Jeśli masz zachować z planszy jedną rzecz, zachowaj ten wiersz.

> Uwaga na rozmiar: plik planszy 1000×1000 ma około megabajta, a jej obrazek dziesiątki megabajtów.

## Zmienne środowiskowe {#env}

`carve` i `report` czytają te zmienne i nic więcej ze środowiska:

::table{of="env"}

## W klonie repozytorium {#clone}

Repozytorium uruchamia ten sam program prosto ze źródeł, pod [Deno](https://deno.com/) w wersji 2.9 lub nowszej i bez budowania czegokolwiek:

```sh
git clone https://github.com/Fronthub-pl/arrowz.git
cd arrowz
deno task carve --width=25 --height=25 --svg
```

Wpisuj `deno task carve` wszędzie tam, gdzie ta strona pisze `arrowz carve`. Zadanie działa w katalogu `packages/cli/`, więc tam plansze trafiają do `packages/cli/boards/`, czyli do magazynu, który czyta to laboratorium, a względna ścieżka, na przykład `--svg=my-board.svg`, zaczyna się w tym katalogu. Ten katalog jest celowo wyłączony z repozytorium.

`deno task report` to zadanie tylko repozytorium: zainstalowane polecenie go nie ma.

## Gdy coś idzie nie tak {#trouble}

**`arrowz: command not found`** — pakiet nie jest zainstalowany dla całego komputera. Zainstaluj go poleceniem `npm install -g @fronthub/arrowz-cli` albo uruchom raz przez `npx @fronthub/arrowz-cli carve …`.

**`deno task` mówi, że nie może znaleźć `deno.json`** — w klonie jesteś poza katalogiem projektu. Przejdź (`cd`) do katalogu `arrowz` i spróbuj jeszcze raz.

**`Requires env access`** — w klonie uruchomiono `deno run packages/cli/arrowz.ts` bezpośrednio. Deno nie pozwala programowi czytać Twoich plików ani ustawień bez wyraźnej zgody. Użyj zadania `carve`, które daje dokładnie to, czego potrzeba.

**`unknown flag …`** — polecenie w ogóle nie zna tej flagi. Sprawdź pisownię w `--help` albo `--help=knobs`.

**`--straight is gone: use --winding=R …`** (albo `--advanced`, `--board`, `--w`/`--h`, `--colorized`, `--stroke`/`--lineweight`, `--headwidth`/`--arrowwidth`, `--headheight`/`--arrowheight`, `--lateral`, `--absorb`, `--giantspacepen`, `--headbias`, `--mix`) — stara pisownia. Komunikat mówi, co wpisać zamiast niej, albo że flagę można po prostu pominąć.

**`invalid arguments: --pstraight=0.2 is outside 0.6..1`** — wartość jest poza zakresem, między dwoma krokami pokrętła albo łamie regułę. Każdy wiersz zaczyna się od flagi do zmiany, a złamana reguła wymienia każdą flagę, której dotyczy. Nic nie zostało wygenerowane ani zapisane.

**`failed to close board …`** — generator próbował, cofał strzałki, zaczynał od nowa i mimo to nie wypełnił planszy. Prawie zawsze winne jest pokrętło ustawione daleko od wartości domyślnej. [Tabela pokręteł](docs:cli#knobs) mówi, co robi każde z nich. Przesuń je z powrotem w stronę wartości domyślnej albo spróbuj innego ziarna. Plansza i tak jest zapisana. Dodaj `--svg`, a obrazek pokaże puste komórki zabarwione na różowo, więc zobaczysz, gdzie generator utknął.

**`failed to close board …: covered, but the rays make a cycle`** — każda komórka jest zajęta, a mimo to żadna strzałka nigdy nie odjedzie: dwie strzałki wskazują na siebie nawzajem albo robi to dłuższy pierścień strzałek. To błąd generatora, a nie skutek wybranych ustawień. Żadne polecenie go nie wywoła, bo generator daje każdej strzałce drogę do krawędzi, zanim cokolwiek na niej stanie. Jeśli kiedyś zobaczysz ten wiersz, plansza i tak jest zapisana. Zachowaj ją i zgłoś, bo to plansza, która nie powinna istnieć.

**Jedna plansza generuje się w nieskończoność** — ustaw `CARVE_TIMEOUT_S` na liczbę sekund, a generator zatrzyma się po tym czasie i zapisze to, co zdążył ułożyć:

```sh
CARVE_TIMEOUT_S=60 arrowz carve --width=1000 --height=1000
```

**Raport trwa w nieskończoność** — `deno task report` bez niczego więcej przechodzi przez każdy poziom trudności aż do 1000×1000, po trzy razy. Dodaj `--only=easy --square --runs=1`. Samo `--only=easy` nie pasuje do niczego: potrzebuje obok `--square` albo `--portrait`.

**Chcesz wiedzieć, co robi** — ustaw `CARVE_TRACE=1`, a polecenie będzie na bieżąco wypisywać postęp:

```sh
CARVE_TRACE=1 arrowz carve --width=200 --height=200
```

```text
    [trace] pieces 7000, remaining 2516, backtracks 0, 252 ms
```

## Słowa {#words}

Słowa samej łamigłówki — strzałka, grot, droga do krawędzi, wolna, ziarno — są na [stronie łamigłówki](docs:arrowz#words). Te należą do generatora:

- **szkielet** — kilka bardzo długich strzałek układanych najpierw, które wiją się przez całą planszę. W kodzie: `giants`.
- **warstwy / tunele** — dwa sposoby wyboru miejsca, w którym startuje następna strzałka. Warstwy obierają planszę od zewnątrz i robią ją łatwą. Tunele kopią w głąb i robią ją trudną.
- **utknąć** — generator podczas budowania zapędził się w kozi róg i nie może dodać żadnej strzałki. Cofa wtedy część strzałek albo zaczyna od nowa.
- **pełna** — plansza, w której każdą komórkę zajmuje strzałka. Plansza, która nie jest pełna, i tak zostaje zapisana, z oznaczeniem `"ok": false`.
- **pułapka** — strzałka zablokowana przez dokładnie jedną inną, więc wygląda na wolną, choć nie jest. `--trapbias` prosi o więcej albo mniej pułapek.
- **zadana długość** — długość, wokół której losowane są niektóre strzałki, zamiast zwykłej mieszanki krótkich, średnich i długich. W kodzie: `probe`.
- **bezpieczny zakres** — zmierzone granice każdego ustawienia. Poza nimi plansze przestają wychodzić, a polecenie odmawia, zamiast pozwolić Ci przekonać się o tym powoli.

## Co wypisuje `--help` {#help}

Pomoc samego polecenia, w obu postaciach, wypisana przez tę samą funkcję, którą woła terminal, więc strona i terminal nie mogą się rozjechać. Zostaje po angielsku, tak jak wypisuje ją terminal.

### `--help`

::help{form="short"}

### `--help=knobs`

::help{form="knobs"}
