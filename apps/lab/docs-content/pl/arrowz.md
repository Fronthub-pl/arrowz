# Arrowz

Arrowz to łamigłówka. Dostajesz prostokąt wypełniony strzałkami i usuwasz je po jednej, we właściwej kolejności. W laboratorium powstają jej plansze: wybierasz ustawienia, generator układa planszę, a Ty oglądasz, co z tego wyszło.

> Arrowz jest w wersji alfa: generator plansz jest gotowy, a sama gra — życia i wynik — jest zaprojektowana, ale jeszcze nie zbudowana. Małe plansze na tej stronie już grają według jej reguły.

## Łamigłówka {#puzzle}

Plansza to siatka komórek, a każdą komórkę zajmuje strzałka. Strzałka to linia, która idzie od komórki do komórki — w górę, w dół, w lewo albo w prawo, nigdy nie przecinając samej siebie — z grotem na jednym końcu, który mówi, w którą stronę jedzie. Strzałki mają od dwóch do kilkuset komórek.

Prawdziwa plansza rysuje wszystkie strzałki jednym kolorem, bo rozróżnianie ich na oko to właśnie gra. Małe plansze niżej dają każdej strzałce własny kolor, żeby łatwo było ją śledzić.

Wygrywasz, gdy plansza jest pusta, a przegrywasz, gdy skończą Ci się życia. Nigdy nie utkniesz: dopóki zostały strzałki, co najmniej jedna z nich jest wolna, więc cała trudność polega na tym, żeby _zobaczyć_ którą.

## Jedna reguła {#rule}

Stukasz w strzałkę, a ona próbuje wyjechać prosto z planszy w stronę, w którą wskazuje jej grot. Liczy się tylko **droga do krawędzi**: prosty pas komórek od grotu do krawędzi planszy.

**Jeśli droga jest wolna, strzałka odjeżdża.** Spróbuj na planszy niżej. Podpowiedź na planszy mówi, jak zagrać strzałką: kliknięcie z wciśniętym ⌘ (Ctrl w Windows i Linuksie) albo stuknięcie, chyba że plansza jest przełączona na zwykłe kliknięcia.

::play{board="rule-free"}

Jeśli coś stoi na drodze, strzałka w to uderza, cofa się, a Ty tracisz życie. Tu w poprzek drogi stoi druga strzałka. Usuń ją najpierw, a strzałka za nią też odjedzie.

::play{board="rule-blocked"}

Kształt strzałki nie ma znaczenia. Strzałka jedzie po własnym ciele: każda komórka przesuwa się na miejsce tej przed nią, więc podkowa z inną strzałką w zagięciu też jest wolna, gdy jej droga jest wolna.

::play{board="rule-shape"}

## Co obiecuje generator {#promises}

Każda plansza, którą oddaje generator, została sprawdzona:

- **Nic nie zostaje.** Każda komórka należy do dokładnie jednej strzałki: bez dziur i bez nakładania się.
- **Żadna strzałka nie ma jednej komórki.** Najkrótsza strzałka ma dwie komórki, bo pojedyncza komórka nie miałaby kierunku.
- **Planszę zawsze da się wyczyścić.** Zanim odda planszę, generator ustala, która strzałka blokuje którą, i dowodzi, że łamigłówka ma rozwiązanie.
- **Zna co najmniej jedno rozwiązanie.** Kolejność, w jakiej generator układał strzałki, sama jest wygrywającą kolejnością.
- **Nie zapędzisz się w kozi róg.** Każdy ciąg dozwolonych ruchów w końcu opróżnia planszę.
- **To samo żądanie daje tę samą planszę.** Te same ustawienia z tym samym ziarnem dają identyczną planszę, co do komórki.

Generator nie obiecuje natomiast, że każde żądanie się uda. Przy trudnych ustawieniach może utknąć w trakcie układania. Wtedy cofa część strzałek i próbuje jeszcze raz, a jeśli i to zawiedzie, zaczyna od nowa od nowego ziarna wyliczonego z Twojego. Gdy zawiodą wszystkie próby, mówi o tym — plansza wraca oznaczona jako niepełna — zamiast podawać zepsutą planszę jako dobrą.

Ustawienia, które sterują generatorem, i bezpieczny zakres każdego z nich są na stronie [Wiersz poleceń](docs:cli#knobs).

## Słowniczek {#words}

- **strzałka** — jedna linia na planszy, od dwóch do kilkuset komórek, z grotem na jednym końcu. W kodzie: `piece`.
- **grot** — ostry koniec strzałki; pokazuje, w którą stronę strzałka jedzie. W kodzie: `head`.
- **droga do krawędzi** — prosty pas komórek od grotu do krawędzi planszy. Gdy jest wolny, strzałka może odjechać. W kodzie: `corridor`.
- **wolna** — strzałka, której droga do krawędzi jest wolna, więc może odjechać od razu.
- **pełna** — plansza, w której każdą komórkę zajmuje strzałka.
- **ziarno** — liczba, która decyduje, jaką planszę dostajesz. To samo ziarno przy tych samych ustawieniach daje tę samą planszę.
