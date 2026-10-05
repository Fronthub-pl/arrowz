# \<arrowz-board>

Widok planszy Arrowz jako komponent webowy. Rysuje planszę, powiększa ją i przesuwa, animuje ruchy w grze i zgłasza kliknięcia w strzałki. Działa w czystym HTML, w Reakcie, Angularze, Svelte i Vue.

Plansze na tej stronie to sam `<arrowz-board>`, narysowany z polecenia wypisanego pod każdą z nich. Flagi obrazka z polecenia to właściwości komponentu pod innymi nazwami: `--pad` to `pad`, `--points` to `showPoints`, `--theme` to `theme`.

## Jak użyć {#example}

Zaimportuj pakiet raz, a import zarejestruje znacznik. Potem nadaj komponentowi rozmiar i daj mu planszę:

```html
<arrowz-board id="board" interactive lang="pl" style="width: 100%; height: 80vh"></arrowz-board>
<script type="module">
  import '@arrowz/board-element'
  import { defaultParams, generate } from '@arrowz/engine'
  const el = document.getElementById('board')
  el.board = generate({ ...defaultParams(), W: 50, H: 50, seed: 7 }).board
  el.addEventListener('piece-click', (e) => console.log('piece', e.detail.pieceId))
</script>
```

W Angularze dodaj `CUSTOM_ELEMENTS_SCHEMA` do swojego komponentu i powiąż `[board]`. W Reakcie opakuj `<arrowz-board>` funkcją `createComponent` z `@lit/react`.

## Właściwości {#props}

::table{of="element-props"}

Komponent podaje też tło, które naprawdę namalował, jako zmienną CSS `--arrowz-paper` ustawioną na nim samym. Odczytasz ją przez `getComputedStyle(board).getPropertyValue('--arrowz-paper')` albo użyjesz jej w treści wewnątrz komponentu. Ponieważ jest ustawiona bezpośrednio na komponencie, nie da się nią ostylować komponentu z zewnątrz, a nadpisać ją można tylko deklaracją z `!important`.

## Metody i gettery {#members}

::table{of="element-members"}

## Zdarzenia {#events}

::table{of="element-events"}

## Sterowanie {#controls}

### Mysz i pióro

Zwykłe przeciągnięcie przesuwa planszę. Kliknięcie z ⌘ (Ctrl na Windowsie i Linuksie) wykonuje ruch strzałką pod kursorem. Zwykłe kliknięcie nic nie robi, więc drgnięcie ręki przy przesuwaniu nigdy nie kosztuje życia.

Z `interactive` i bez `play` to kliknięcie nie wykonuje ruchu: komponent zgłasza strzałkę jako `piece-click`, a Twoja strona decyduje, co pokazać.

Plansza, która przyjmuje kliknięcia — `play` albo `interactive` — ma w rogu przełącznik ☝. Wciśnięty zamienia jedno z drugim: zwykłe kliknięcie wykonuje ruch, a przeciągnięcie z ⌘ albo Ctrl przesuwa. Wybór należy do gracza. Przeglądarka pamięta go do następnej wizyty, każda plansza odczytuje go, gdy trafia na stronę, a `gestureMode` mówi, która reguła obowiązuje. Nie ma do tego atrybutu. Plansza, którą można tylko przesuwać, nie ma przełącznika i zawsze przesuwa się zwykłym przeciągnięciem.

Kursor pokazuje, co zrobi następne kliknięcie. Domyślnie nad planszą widać dłoń do chwytania, a wskazujący palec nad strzałką pojawia się tylko wtedy, gdy trzymasz ⌘ albo Ctrl, bo tylko wtedy kliknięcie wykonuje ruch. Z wciśniętym przełącznikiem jest odwrotnie: to klawisz modyfikujący zmienia kursor nad planszą w dłoń do chwytania. Na Macu kliknięcie z Ctrl to kliknięcie prawym przyciskiem; na planszy, która przyjmuje kliknięcia, w trybie domyślnym komponent nie otwiera wtedy menu kontekstowego.

### Dotyk

Dotyk działa tak samo w obu trybach: jeden palec przesuwa, dwa palce powiększają szczypnięciem, a stuknięcie wykonuje ruch.

### Klawisze i kółko

Kółko powiększa w stronę kursora. `+` (albo `=`) i `-` powiększają i pomniejszają, `0` dopasowuje planszę, i to samo robią przyciski w rogu. Gdy trzymasz ⌘, Ctrl albo Alt, plansza zostawia te klawisze przeglądarce: z ⌘ albo Ctrl to jej własne powiększenie strony. Klawisze działają, gdy fokus ma plansza albo jedna z jej kontrolek, a nie pole tekstowe czy zagnieżdżona w niej plansza.

Powtórne naciśnięcie — podwójne kliknięcie, podwójne stuknięcie — nie robi nic. Komponent traktuje drugie jako omsknięcie palca, a nie polecenie.

## Powiększanie i przesuwanie {#zoom}

Przy powiększaniu kółko trzyma punkt pod kursorem w miejscu: to, co jest pod wskaźnikiem, gdy kółko się obraca, zostaje pod nim także potem, na każdym kroku i w każdym miejscu planszy. Przy pomniejszaniu też, chyba że widok już dotarł do krawędzi planszy: wtedy zatrzymuje się na marginesie, a punkt może odjechać spod kursora.

Powiększanie jest dokładne, bo widok trzyma się tylko jednej reguły: jego środek zostaje na planszy albo na jej marginesie. Nie wymaga, żeby plansza wypełniała widok: przy krawędzi wypełnienie widoku oznaczałoby wyciąganie planszy spod kursora.

Dlatego obok planszy możesz zobaczyć puste tło, a plansza mniejsza niż komponent nie jest już trzymana pośrodku. Przywracają ją `fit()`, klawisz `0` i przycisk w rogu. `zoomBy()` powiększa wokół środka komponentu, bo przycisk nie ma kursora, w którego stronę mógłby powiększać. Powiększenie mieści się między dopasowaną planszą a `MAX_CELL_PX` pikseli na komórkę.

## Rozmiar i wartości, których plansza nie narysuje {#size}

Komponent, tak jak `<div>`, nie ma własnego rozmiaru: nadaj mu szerokość i wysokość albo umieść go w rodzicu, który je ma. Rysunek wypełnia komponent i nie bierze udziału w jego układzie.

Liczbę albo kolor, których plansza nie narysuje, zastępuje się po cichu i tylko w rysunku: właściwość czy atrybut zachowuje Twoją wartość. Dotyczy to zarówno atrybutów, jak i `view`.

- Wartość, która nie jest skończoną liczbą, staje się wartością domyślną.
- `stroke` ma najwyżej jedną komórkę, a zero lub mniej staje się wartością domyślną.
- Rozmiary grotu nigdy nie są ujemne.
- `top` jest nieujemną liczbą całkowitą.
- `pad` mieści się w `PAD_RANGE`, a `point-radius` w `POINT_RADIUS_RANGE`: powyżej pół komórki kropki nachodziłyby na siebie.
- Kolor, którego przeglądarka nie odczyta, staje się domyślnym kolorem swojego pola; z `palette` po prostu wypada.

`zoomBy()` pomija krotność, która nie jest skończoną liczbą dodatnią, i zostawia widok bez zmian.

## Margines {#margin}

Plansza ma z każdej strony margines szerokości `pad` komórek, więc grot w komórce przy krawędzi nie kończy się równo z krawędzią tła. Margines należy do tego, co jest dopasowywane do komponentu, a wyjeżdżająca strzałka jest do niego przycięta: znika na zewnętrznej krawędzi marginesu, zamiast jechać dalej po pustym tle. Zmiana `pad` dopasowuje planszę od nowa.

:::compare
::board[`--pad=0`]{cmd="--width=12 --height=12 --seed=7 --pad=0"}
::board[domyślnie]{cmd="--width=12 --height=12 --seed=7"}
::board[`--pad=16`]{cmd="--width=12 --height=12 --seed=7 --pad=16"}
:::

Margines liczony w komórkach maleje razem z nimi: na dużej planszy w małym komponencie wyszedłby na piksel czy dwa. Dlatego jest poszerzany, aż na ekranie ma `MIN_PAD_PX` pikseli. `pad` równe `0` zostaje `0`: prośba o brak marginesu to nie prośba o mały margines.

## Siatka kropek {#dots}

Z `showPoints` plansza rysuje pod strzałkami po jednej kropce na komórkę, jak na stronie zeszytu w kropki. Linie strzałek biegną od środka do środka komórki, a kropki to po prostu te środki, tyle że widoczne. Siatka pokrywa same komórki, bez marginesu, który zostaje gładkim tłem. Wygląd kropek ustawiają `pointColor` i `pointRadius` (w komórkach). Siatka jest rysowana jednym przebiegiem przez całą planszę, więc kosztuje tyle samo na planszy 10×10, co na 1000×1000.

Pełna plansza nie pokazuje żadnej kropki: strzałki zajmują każdą komórkę, a każda kropka leży pod linią i z zapasem mieści się w jej grubości. Kropki pojawiają się komórka po komórce, w miarę jak strzałki wyjeżdżają, albo tam, gdzie generator zostawił komórkę pustą. Jeśli wydaje się, że siatki brak, najpierw poszukaj strzałki, która zakrywa komórkę. Przy cienkich liniach i większych kropkach te prześwitują:

:::compare
::board[`--points`]{cmd="--width=12 --height=12 --seed=7 --points"}
::board[`--points --line=0.2 --point-radius=0.15`]{cmd="--width=12 --height=12 --seed=7 --points --line=0.2 --point-radius=0.15"}
:::

Poniżej `MIN_POINT_CELL_PX` pikseli na komórkę siatka sama się chowa, a `showPoints` pozostaje bez zmian: tak gęsto upakowane kropki tworzyłyby efekt mory, zamiast układać się w siatkę. Gdy znów powiększysz, siatka wraca.

## Jazda po torze {#track}

Strzałka nigdy nie zsuwa się bokiem ze swojego kształtu. Wyjeżdża po własnym torze: grot jedzie prosto w swoim kierunku, a każda inna komórka przechodzi przez miejsce tej przed nią, więc zgięta strzałka wyjeżdża, wyginając się po drodze, zamiast przesuwać się jako sztywny kształt. Linia, ogon i grot są rysowane od nowa w każdej klatce według jednego zegara, więc nigdy się nie rozjeżdżają.

Strzałka wyjeżdża z prędkością `EXIT_SPEED` komórek na sekundę, więc długi przejazd trwa dłużej niż krótki, w dwóch granicach: żaden przejazd nie jest krótszy niż `EXIT_MIN_MS` milisekund, żeby strzałkę przy krawędzi było jeszcze widać w ruchu, i żaden nie jest dłuższy niż `EXIT_MAX_MS`, żeby strzałka z drugiego końca dużej planszy nie kazała na siebie czekać. Przejazd, który wypadłby poza te granice, zostaje zwolniony albo przyspieszony, żeby się w nich zmieścić. Odbicie zablokowanej strzałki trwa `SHAKE_MS`. Przy ustawionym `prefers-reduced-motion` żaden przejazd ani żadne odbicie nie trwa wcale.

## Sloty {#slots}

Podpowiedź i przyciski w rogu to domyślna zawartość slotów: dziecko z `slot` ustawionym na jedną z tych nazw zastępuje tę zawartość, a pusty slot ją zachowuje.

::table{of="element-slots"}

```html
<arrowz-board play>
  <button slot="fit" data-board-action="fit" aria-label="Show everything">Fit</button>
</arrowz-board>
```

`data-board-action` mówi, co robi kliknięcie w dziecko albo w cokolwiek w jego wnętrzu: `zoom-in`, `zoom-out`, `fit`, `colors` (jak `toggleColors()`) albo `gestures` (jak `toggleGestures()`). Działa w każdym slocie, na dowolnej głębokości we własnym pasku w `controls`; każda inna wartość nic nie robi. Ustaw ten atrybut w znaczniku zapisanym w kodzie samej strony, nie w shadow root innego komponentu: komponent szuka tych kontrolek wśród własnych dzieci.

### Pasek

Domyślny pasek trzyma się 8 px od krawędzi planszy, po jej wewnętrznej stronie. Gdy to, co w nim jest — jego własne kontrolki albo Twoje — nie mieści się w jednym rzędzie, pasek zawija się w górę: w dolnym rzędzie zostaje to, co jest pierwsze — podpowiedź i za nią przyciski powiększania — a reszta przechodzi wyżej. Podpowiedź szersza niż rząd zajmuje dolny rząd sama.

Własny pasek w slocie `controls` zastępuje domyślny razem z jego położeniem. Pozostałe sloty są wewnątrz domyślnego paska, więc dziecko z `slot="fit"` obok własnego paska nie jest rysowane. Komponent ma `position: relative`, więc pasek z `absolute` układa się względem planszy; pasek bez pozycjonowania zostaje w normalnym przepływie, u góry planszy, narysowany na niej.

### Czego komponent pilnuje

Na podstawionych kontrolkach `colors` i `gestures` komponent sam ustawia dwa atrybuty i sam nimi zarządza: `aria-pressed` oraz `hidden`, dopóki akcja jest niedostępna (bez `enableColors`; na planszy, która nie jest ani `interactive`, ani `play`). `hidden` ukrywa przez wbudowane w przeglądarkę `display: none`, więc zadbaj, żeby `[hidden] { display: none }` wygrywało z Twoimi regułami `display` na tych kontrolkach. Przy grubym wskaźniku sloty `hint` i `gestures` nie są rysowane, razem z podstawioną treścią; we własnym pasku w `controls` tej reguły musisz pilnować samodzielnie.

Komponent nie nadaje podstawionym kontrolkom roli ani nazwy: podstaw `<button>` z własną nazwą dostępną. Kontrolka, która nie jest przyciskiem, też wykona swoją akcję po kliknięciu, ale nic poza tym.

## Rozgrywka {#play}

Z `play` komponent sam rozstrzyga ruch: wolna strzałka wyjeżdża, zablokowana odbija się od strzałki, która ją zatrzymuje. Komponent nie liczy żyć. Zgłasza `life-lost`; Twoja strona decyduje, ile to kosztuje, i kończy grę, zdejmując `play`. `saveState()` oddaje grę jako małą wartość — usunięte strzałki, odcisk planszy i wybór koloru — a gdzie ją przechowasz, zależy od Ciebie.

Kolory są wyłączone, dopóki nie ustawisz `enableColors`: gra w jednym kolorze to część łamigłówki, bo zadanie polega właśnie na odróżnianiu strzałek bez koloru. Z tym pozwoleniem na planszy pojawia się przycisk ◑ (albo Twój własny, zobacz [sloty](docs:element#slots)), a plansza może przyjść już kolorowa przez `view.colored` albo z wczytanej gry. Przed działaniem przycisk wysyła anulowalne `colored-change`. Strona, która nic z nim nie robi, zostawia decyzję przyciskowi; strona, która wywoła `preventDefault()`, czyści wybór samego przycisku — także ten zrobiony wcześniej, kliknięciem albo przez `loadState()` — więc od tego kliknięcia decyduje `view.colored`.

Przypisanie nowej planszy do `board` zawsze zaczyna nową grę i rysuje planszę od nowa w całości. Dlatego strona, która prowadzi grę, nigdy nie wyjmuje strzałek z planszy, żeby oddać ją z powrotem: zostawia prowadzenie gry `play` i ze zdarzeń odczytuje, co się stało.

## Motywy {#themes}

`theme` wybiera jeden z wbudowanych motywów z tabeli niżej. Każdy przynosi tło, kolor strzałek, kolor wyróżnienia i paletę dla kolorowych strzałek. Pole podane w `view` zawsze wygrywa z polem motywu, a motyw wygrywa z ustawieniem domyślnym komponentu. Motyw maluje tło, strzałki i wyróżnienie z `enableColors` i bez; tylko paleta potrzebuje tego pozwolenia, bo koloruje każdą strzałkę osobno.

:::compare
::board[`gruvbox-dark`]{cmd="--width=12 --height=12 --seed=7 --theme=gruvbox-dark --colored"}
::board[`catppuccin-latte`]{cmd="--width=12 --height=12 --seed=7 --theme=catppuccin-latte --colored"}
::board[`rose-pine-moon`]{cmd="--width=12 --height=12 --seed=7 --theme=rose-pine-moon --colored"}
:::

Motywy to jasne i ciemne wersje otwartoźródłowych motywów edytorów kodu, a informacja, skąd każdy pochodzi i na jakiej licencji, idzie razem z nimi:

::table{of="themes"}

## Kontekst WebGL {#webgl}

Plansza bierze kontekst WebGL, gdy trafia na stronę, a nie gdy powstaje, i oddaje go, gdy zostaje usunięta. Strona dostaje mniej więcej szesnaście kontekstów. Jeśli przeglądarka któryś odbierze, plansza prosi o niego z powrotem, gdy tylko znów jest na ekranie. Gdy na ekranie jest naraz więcej niż mniej więcej szesnaście plansz, zabierają sobie konteksty nawzajem, po kolei.

Plansze na tej stronie żyją według tej reguły: każda istnieje tylko wtedy, gdy jest blisko widoku.

## Eksporty {#exports}

Wszystko, co eksportuje `@arrowz/board-element`, według rodzaju. Import pakietu rejestruje `<arrowz-board>`. Typ, który w kolumnie Skąd ma `@arrowz/engine`, jest eksportowany dalej, więc nie potrzebujesz dla niego drugiego importu.

### Typy

::table{of="element-types"}

### Funkcje

::table{of="element-functions"}

### Stałe

::table{of="element-constants"}

### Klasy

::table{of="element-classes"}

`GameHost` prowadzi grę na dowolnym `GameTarget` — komponent jest jednym z nich — więc ruchy można wykonywać i animować poza `<arrowz-board>`. `board` to plansza bieżącej gry albo null, a `goneIds` to strzałki, które już wyjechały. `setBoard()` zaczyna nową grę (albo ją kończy, gdy dostanie null); `click()` wykonuje ruch strzałką, a jego obietnica spełnia się, gdy przejazd albo odbicie dobiegnie końca; `save()` zwraca `SessionSnapshot` albo null, gdy nie ma planszy; `load()` przywraca zapis i rzuca wyjątkiem, gdy należy on do innej planszy albo gdy planszy nie ma.
