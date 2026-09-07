# Arrowz — projekt gry logicznej ze strzałkami

Data: 2026-09-07
Status: zatwierdzony do planowania implementacji

## 1. Cel i zakres

Przeglądarkowy klon gry logicznej, w której na siatce leżą poplątane, wielokomórkowe
strzałki. Kliknięcie strzałki próbuje wyprowadzić ją poza planszę w kierunku grotu.
Kolizja z inną strzałką kosztuje życie. Cel: opróżnić planszę, nie tracąc trzech żyć.

### Zakres MVP

W zakresie:

- generowana proceduralnie plansza z gwarancją rozwiązywalności,
- klikanie elementów, walidacja ruchu, trzy życia,
- cztery poziomy trudności (Easy 25×25, Medium 50×50, Hard 75×75, Nightmare 100×100),
- **konfigurator plansz jako tryb zaawansowany**: gracz sam ustawia rozmiar planszy,
  liczbę linii, stopień połamania i długość maksymalną,
- **zoom i przesuwanie planszy** — 100×100 to 10 000 komórek, nie mieści się czytelnie
  na żadnym ekranie,
- stoper, licznik serii bezbłędnych ruchów oraz punktacja przyznawana za ukończoną
  planszę, liczona ze złożoności planszy, zachowanych żyć i czasu,
- dwa warianty rozgrywki: klasyczny i na czas (czas premiuje, nigdy nie ogranicza),
- ekrany wygranej i przegranej, przycisk nowej gry,
- grafika placeholder (czytelna, ale bez dopracowanego stylu),
- PWA: manifest i service worker, gra działa offline.

Poza zakresem MVP (patrz §13):

- cofanie ruchu (undo), podpowiedzi (hint),
- dopracowana warstwa wizualna i animacje,
- progresja poziomów, zapis postępu, tabele wyników, dźwięk.

## 2. Reguły gry

Plansza to prostokątna siatka `W × H` komórek. Leży na niej `N` **elementów**.

Element to **samounikająca się polilinia**: spójna ścieżka po komórkach siatki,
poruszająca się wyłącznie ortogonalnie, nieodwiedzająca żadnej komórki dwukrotnie.
Długość waha się od 2 komórek do kilkuset — najdłuższe elementy przecinają planszę na
wskroś wielokrotnie, w tę i z powrotem. **Minimum to 2 komórki**: element jednokomórkowy
nie miałby ostatniego segmentu, więc nie miałby skąd wziąć kierunku grotu — byłby
punktem, nie wektorem.

**Elementy pokrywają planszę w całości.** Każda komórka siatki należy do dokładnie
jednego elementu — nie ma pustych pól. Wbrew intuicji nie odbiera to możliwości ruchu:
region zamiatania wyklucza komórki własne, więc element, który sam pokrywa całą swoją
drogę do krawędzi, jest wolny nawet na planszy zapełnionej po brzegi. Rozkład długości jest **ciężkoogonowy**: dominują
krótkie kształty, ale mniejszość bardzo długich, wijących się linii nadaje planszy jej
charakter. Model rozkładu opisuje §7. Na jednym końcu ścieżki znajduje się grot.

**Kierunek wyjścia** elementu to kierunek ostatniego segmentu ścieżki po stronie grotu.
Strzałka jedzie tam, gdzie pokazuje.

Ruch gracza to kliknięcie elementu. Element próbuje przesunąć się **sztywno**
(translacja, bez rotacji) w kierunku wyjścia, aż całkowicie opuści planszę.

- **Region zamiatania** (`swept`) elementu = suma wszystkich komórek, przez które
  przejdzie dowolna komórka elementu w trakcie tej translacji, aż poza krawędź,
  pomniejszona o komórki własne elementu.
- Jeśli region zamiatania nie zawiera komórki zajętej przez inny element, element
  opuszcza planszę. Nazywamy taki element **wolnym**.
- W przeciwnym razie ruch jest nielegalny: element **odbija się** — wyjeżdża aż do
  kontaktu z blokerem i wraca na pozycję wyjściową — a gracz traci życie. Stan końcowy
  jest identyczny jak przed kliknięciem, więc logika gry pozostaje niezmieniona; różnica
  jest wyłącznie w animacji.

  Odbicie **pokazuje graczowi, gdzie leży bloker**. Błąd przestaje być czystą karą,
  a staje się informacją — przy planszy o 920 elementach to konieczne, inaczej gracz
  traci życie, nie wiedząc dlaczego. Ceną jest lekkie obniżenie trudności percepcyjnej,
  bo animacja ujawnia to, czego gracz nie doczytał z ekranu. Kompromis świadomy,
  na rzecz czytelności.

Gra kończy się wygraną, gdy plansza jest pusta, i przegraną, gdy życia spadną do zera.

### Konsekwencja kluczowa

Ruch nigdy nie zatrzymuje się na przeszkodzie — element albo wyjeżdża w całości, albo
nie rusza się wcale. Dlatego `swept(E)` **nie zależy od stanu planszy**; jest stałą
własnością pary (kształt, kierunek). Cały §6–§9 wynika z tej jednej obserwacji.

## 3. Wybór technologii

**TypeScript + Vite**, render w SVG, testy w Vitest, deploy jako statyczne pliki
(Cloudflare Pages lub GitHub Pages), warstwa PWA przez `vite-plugin-pwa`.

Uzasadnienie: gra nie ma fizyki, sceny ani animacji szkieletowych — jej rdzeń to
kombinatoryka na siatce liczb całkowitych. Największe ryzyko projektu (poprawność
generatora) jest w 100% logiczne, więc decydującym kryterium jest **testowalność
rdzenia bez przeglądarki** — możliwość wygenerowania dziesiątek tysięcy plansz w pętli
w Node i sprawdzenia niezmienników.

Odrzucone warianty:

- **Godot 4 → WebAssembly**: eksport ~25–40 MB, wolny pierwszy load, uciążliwe testy
  jednostkowe logiki, a żadna z możliwości silnika 2D nie jest tu potrzebna. Sensowny
  dopiero, gdyby celem był eksport natywny do sklepów.
- **Vanilla JS w jednym pliku HTML**: najszybszy prototyp, ale bez typów i runnera
  testów subtelne błędy generatora byłyby łapane ręcznie w przeglądarce.

SVG zamiast Canvas: przy siatce trafienie w element to `piksel → komórka → id`, więc
żadna technologia nie ma przewagi w hit-testingu, a SVG daje darmowe animacje CSS przy
wyjeżdżaniu elementu oraz zoom i przesuwanie przez samą zmianę `viewBox`, bez
przerysowywania. Przy ~1 000 ścieżkach Nightmare to wciąż rozsądny wybór, ale margines
jest już cienki, więc §11 definiuje budżet wydajności, a renderer stoi za interfejsem —
wymiana na Canvas nie dotyka rdzenia.

## 4. Architektura

```
src/
  core/            czysta logika: zero DOM, zero globalnej losowości
    types.ts         Coord, Dir, Piece, Board, Difficulty
    rng.ts           deterministyczny PRNG z ziarnem
    board.ts         siatka zajętości, sweptRegion(), probeMove(), removePiece()
    shapes.ts        losowanie kształtu przez wzrost wstecz w obszarze dopuszczalnym
    generator.ts     wycinanie z pełnej planszy, parametry trudności
    solver.ts        graf blokowania + sortowanie topologiczne (Kahn)
    metrics.ts       metryki trudności liczone na wygenerowanej planszy
  game/
    session.ts       czysty reduktor stanu gry: życia, status, obsługa kliknięcia
  render/
    renderer.ts      interfejs renderera
    svgRenderer.ts   implementacja SVG + mapowanie kliknięcia na id elementu
    viewport.ts      zoom i przesuwanie: transformacja ekran ↔ komórka
  ui/
    app.ts           powłoka: wybór poziomu, serca, ekrany końcowe
    configurator.ts  tryb zaawansowany: edycja parametrów generatora
  workers/
    generate.worker.ts  generacja poza głównym wątkiem
  main.ts            spięcie
```

Zasada nadrzędna: `core/` i `game/` nie importują niczego z `render/` ani `ui/` i nie
dotykają DOM. Dzięki temu cała logika i generator uruchamiają się w Node — a także,
bez żadnej zmiany, w Web Workerze. Przy planszy 100×100 generacja z pętlą odrzucania
po metrykach potrwa zauważalnie długo, więc musi iść poza główny wątek, żeby interfejs
nie zamarzał. Czysty rdzeń daje to za darmo; gdyby rdzeń dotykał DOM, byłoby to
przepisywanie modułu.

## 5. Model danych

```ts
type Dir = 0 | 1 | 2 | 3            // 0=góra, 1=prawo, 2=dół, 3=lewo
type Coord = { x: number; y: number }

type Piece = {
  id: number
  cells: Coord[]    // cells[0] to komórka z grotem; ścieżka w kolejności od grotu
  dir: Dir          // kierunek z cells[1] do cells[0]
}

type Board = {
  width: number
  height: number
  occupancy: Int32Array   // długość width*height, -1 = puste, inaczej id elementu
  pieces: Map<number, Piece>
  metrics: BoardMetrics   // f0, T2, Tconc, D, meanCorridorLen, N — patrz §9
}
```

Uwaga implementacyjna: `occupancy` jest `Int32Array`, nie `Int8Array` — plansza
Nightmare ma ~1 000 elementów, więc `Int8Array` przepełniłby się ośmiokrotnie.
Przy 10 000 komórek zajmuje 40 kB, co jest bez znaczenia.

Parametry generatora są **jedną strukturą**, wspólną dla presetów i konfiguratora:

```ts
type GeneratorParams = {
  width: number
  height: number
  pieceCount: number      // ile linii; średnia długość = width*height/pieceCount
  maxLength: number       // Lmax
  straightBias: number    // p_s ∈ [0,1]; „stopień połamania" w UI to 1 - p_s
  bucketWeights: [short: number, medium: number, long: number]
  seed: number
}

type GenerationReport = {          // co faktycznie osiągnięto
  params: GeneratorParams
  actualPieceCount: number
  backtracks: number         // ile razy generator musiał się cofnąć
  restarts: number           // ile razy zaczynał od nowa z innym ziarnem
  lengthHistogram: number[]
  longAreaShare: number
  attemptsUsed: number
}
```

Presety Easy–Nightmare to nazwane instancje `GeneratorParams`, nie osobna gałąź kodu.
`GenerationReport` istnieje, bo geometria potrafi odmówić i różnica między zamówieniem
a wykonaniem musi być widoczna, a nie ukryta (§11).

Ciało elementu leży **za** grotem: dla grotu w `(5,3)` i `dir = prawo` kolejna komórka
ścieżki to `(4,3)`, nie `(6,3)`. To najczęstszy błąd znaku w tym module.

## 6. Silnik: region zamiatania i legalność ruchu

`sweptRegion(piece)` to suma promieni `ray_dir(c)` po wszystkich komórkach `c` elementu,
gdzie `ray_dir(c)` to komórki ściśle przed `c` w kierunku `dir`, aż do krawędzi.

**Optymalizacja per linia.** Dla ustalonego kierunku (powiedzmy: w górę) i kolumny `x`,
suma promieni ze wszystkich komórek elementu w tej kolumnie równa się promieniowi
z komórki o **maksymalnym `y`**, czyli **najdalszej od krawędzi wyjścia** (tylnej).

To musi być tylna, nie przednia komórka. Dla kształtu **U** promień z tylnego ramienia
przechodzi przez wnętrze łuku, więc obcy element uwięziony we wklęsłości **blokuje**
ruch. Optymalizacja liczona od przedniej komórki tego nie wykryje i jest błędna.

Komórki własne elementu w promieniu są ignorowane — element nie blokuje sam siebie.
Dotyczy to w szczególności elementu prostego ułożonego wzdłuż własnego kierunku, gdzie
promień z ogona przechodzi przez cały element.

Animacja odbicia (§2) potrzebuje wiedzieć nie tylko *czy* ruch jest nielegalny, ale
**po ilu komórkach nastąpił kontakt i z czym**. Ten sam przebieg po liniach daje obie
informacje, więc zamiast `isFree` zwracającego `boolean` silnik wystawia jedną funkcję:

```
probeMove(board, piece) -> { free: true } | { free: false, distance, blockerId }

  best = ∞
  dla każdej linii L dotkniętej przez piece:
    idź wzdłuż L od komórki piece najdalszej od krawędzi wyjścia w stronę krawędzi,
    pamiętając pozycję ostatnio minionej komórki własnej (lastOwn):
      jeśli occupancy(k) == piece.id  → lastOwn = pozycja k
      jeśli occupancy(k) ∉ {-1, piece.id} → best = min(best, lastOwn - pozycja k)
  free  ⟺  best = ∞
  distance = best        # o tyle komórek element przesunie się przed zderzeniem
```

Śledzenie `lastOwn` jest konieczne, bo obcy element może leżeć **między** komórkami
własnymi na tej samej linii — dokładnie przypadek elementu wklęsłego (kształt U), gdzie
bloker siedzi w łuku. Odległość liczymy wtedy od tej komórki własnej, która faktycznie
w niego uderzy, a nie od najdalszej.

Koszt: `O(liczba linii × długość planszy)`, jeden przebieg dla obu wyników.

## 7. Generator: wycinanie z pełnej planszy

### Zasada

Plansza jest **wypełniona w 100%**: każda komórka należy do dokładnie jednego elementu.
Generujemy więc nie przez wstawianie elementów na pustą planszę, lecz przez
**wycinanie ich z planszy pełnej, w kolejności usuwania**.

Na starcie wszystkie komórki są *nieprzypisane*; oznaczmy ten zbiór `R`. Wycinamy
kolejno elementy `q_1, q_2, …, q_N`, gdzie `q_1` to element, który gracz zdejmie jako
pierwszy. Warunek wycięcia elementu `q_j` z kierunkiem `d`:

```
swept_d(q_j) ∩ (R \ cells(q_j)) = ∅
```

czyli: cała droga elementu do krawędzi wyjścia prowadzi przez komórki **już przypisane**
(wcześniej wyciętym elementom) albo przez komórki **własne**. Kończymy, gdy `R = ∅`.

### Twierdzenie o poprawności

Kolejność wycinania `q_1, …, q_N` jest poprawną kolejnością rozwiązania.

Dowód: w chwili, gdy gracz zdejmuje `q_j`, na planszy leżą dokładnie `q_j, …, q_N` —
bo `q_1..q_{j-1}` już zeszły. Zbiór `R` w momencie wycinania `q_j` to właśnie
`{q_j, …, q_N}`. Warunek wycięcia mówi, że `swept(q_j)` nie zawiera komórek
`q_{j+1}, …, q_N`, a `swept` jest stały (§2). Ruch jest więc legalny. ∎

Zauważ, że kolejność wycinania jest **wprost** kolejnością rozwiązania — nie trzeba jej
odwracać.

### Równoważność z generacją wsteczną

Ten warunek jest **matematycznie identyczny** z wcześniejszym sformułowaniem
„wstawiaj elementy, wjeżdżając nimi z zewnątrz, i odwróć kolejność". Trasa wjazdu
elementu z zewnątrz to dokładnie ten sam zbiór komórek co jego region zamiatania przy
ucieczce — ta sama translacja przebiegnięta wstecz. Generator i silnik gry dzielą więc
jedną definicję korytarza; dwie osobne implementacje mogłyby się rozjechać.

Zmienia się wyłącznie to, **względem czego** liczymy test: zamiast „elementów już
położonych" mamy „komórek jeszcze nieprzypisanych". A skoro `R` kurczy się do zera,
pokrycie planszy jest pełne. Poprzednia wersja tego projektu zatrzymywała się na progu
wypełnienia i pozostawiała dziury; ta kończy dopiero, gdy nie zostanie żadna komórka.

### Minimalna długość 2 i problem osierocenia

**Element ma co najmniej 2 komórki.** Element jednokomórkowy nie jest wektorem, tylko
punktem — nie ma ostatniego segmentu, więc nie ma z czego odczytać kierunku grotu.
Długość 1 jest zatem zakazana, nie tylko niepożądana.

#### Para jest darmowa przy właściwym wyborze głowy

Jeśli komórka `h` jest dopuszczalna dla kierunku `d`, a komórka `h − d` (tuż za nią,
licząc od krawędzi wyjścia) jest jeszcze nieprzypisana, to element `[h, h − d]` jest
legalny **automatycznie**: droga `h − d` do krawędzi prowadzi przez `h`, czyli przez
komórkę własną, a dalej przez komórki, które i tak były już przypisane, bo `h` jest
dopuszczalna. Nie wymaga to żadnego dodatkowego sprawdzenia.

Generator wybiera więc głowę wyłącznie spośród **głów parowalnych** — dopuszczalnych
komórek, których komórka „za" jest nieprzypisana. Długość ≥ 2 jest wtedy zapewniona
z konstrukcji dla wycinanego właśnie elementu.

#### Czego to nie załatwia

Powyższe gwarantuje długość elementu, który właśnie wycinamy, ale nie gwarantuje, że
w `R` nie powstanie fragment, którego już nie da się rozłożyć na ścieżki o długości ≥ 2.

Nie wystarczy przy tym pilnować, żeby żadna komórka nie została bez sąsiadów.
Kontrprzykład: **pentomino w kształcie plusa** — pięć nieprzypisanych komórek (środek
i cztery ramiona), wszystkie spójne, żadna nieizolowana. Rozkłady na ścieżki ≥ 2
musiałyby mieć długości `2+3` albo `5`. Ścieżka przez środek ma najwyżej 3 komórki
(po wyjściu na ramię nie ma dokąd iść), a dwa pozostałe ramiona nie sąsiadują ze sobą,
więc nie tworzą pary. Rozkład nie istnieje, choć naiwny test izolacji niczego nie
zgłosi.

#### Rozwiązanie: konstrukcja + weryfikacja + ograniczony nawrót

Pełnego pokrycia przy minimalnej długości 2 **nie gwarantujemy dowodem** — wymuszamy je
trzema warstwami:

1. **Głowy parowalne** (wyżej) — każdy wycięty element ma długość ≥ 2.
2. **Test kształtu resztki.** Po wybraniu kandydata na element sprawdzamy lokalnie, czy
   `R` bez niego nie zawiera fragmentu nierozkładalnego. Tanie przybliżenie: żadna
   komórka bez nieprzypisanego sąsiada oraz żaden spójny fragment o rozmiarze ≤ 5
   pasujący do wzorca plusa. Sprawdzenie ogranicza się do otoczenia kandydata, więc
   koszt jest rzędu obwodu elementu.
3. **Ograniczony nawrót.** Jeśli mimo to generator dojdzie do stanu, w którym `R ≠ ∅`
   i nie istnieje legalny element o długości ≥ 2, cofa `k` ostatnich wycięć i próbuje
   innych wyborów. Dopiero wyczerpanie budżetu nawrotów powoduje restart z nowym
   ziarnem.

Nad wszystkim stoi **niezależny solver z §8**: jest liniowy i całkowicie odseparowany od
generatora, więc każda wygenerowana plansza jest weryfikowana, a nie zakładana. To jest
właściwy podział ról — konstrukcja ma trafiać często, weryfikator ma być pewny.

Że przestrzeń poprawnych plansz jest niepusta, widać z konstrukcji trywialnej: kolumny
wypełnione pionowymi dominami skierowanymi w górę, zdejmowanymi od góry. Jest nudna
i nigdy jej nie użyjemy, ale dowodzi, że generator ma czego szukać.

**Do zmierzenia benchmarkiem:** częstość nawrotów i restartów. Jeżeli okaże się wysoka,
przechodzimy na wariant dwufazowy — najpierw podział prostokąta na ścieżki (na pełnym
prostokącie zawsze wykonalny: domina plus jedno tromino przy nieparzystej powierzchni),
potem dobór kierunków i kolejności. Wariant ten jest droższy i mniej elastyczny, więc
zostaje jako plan awaryjny, nie domyślny.

### Obszar dopuszczalny: skyline

Niech `depth_d[L]` = liczba kolejnych **przypisanych** komórek na linii `L`, licząc od
krawędzi w kierunku `d` do wewnątrz. Niech `dist_d(c)` = liczba komórek ściśle między
`c` a krawędzią w kierunku `d`. Wtedy:

```
c może należeć do wycinanego elementu o kierunku d  ⟺  dist_d(c) ≤ depth_d[line_d(c)]
```

Test jest **`O(1)` na komórkę**. Element jest legalny wtedy i tylko wtedy, gdy
**wszystkie** jego komórki spełniają ten warunek — jest to równoważne pełnemu testowi
korytarza, bo suma promieni jest wolna od nieprzypisanych komórek dokładnie wtedy, gdy
każdy promień z osobna jest wolny. Ścieżka rosnąca „w głąb" wzdłuż linii korzysta z
tego, że jej własne komórki też liczą się jako przypisane.

Utrzymujemy cztery tablice `depth_d[·]`, po jednej na kierunek, aktualizowane
przyrostowo po każdym wycięciu kosztem `O(4·ℓ)`.

### Procedura wycinania

Ścieżkę **hodujemy wyłącznie wewnątrz obszaru dopuszczalnego**, więc odrzuceń nie ma.

```
carve(rng, params):
  dla kierunków d w losowej kolejności, ważonej rozmiarem obszaru dopuszczalnego:
    Heads = komórki dopuszczalne dla d, których komórka „za" (h - d) jest nieprzypisana
    jeśli Heads puste: następny kierunek
    h = losuj z Heads
    path = [h, h - d]                       # długość 2 legalna z konstrukcji
    docelowa długość ℓ* ~ rozkład mieszany (patrz niżej)
    dopóki |path| < ℓ*:
      cand = { sąsiedzi ogona, nieprzypisani, dopuszczalni dla d przy tym path }
      odfiltruj kandydatów zostawiających w R fragment nierozkładalny
      jeśli cand puste: przerwij            # akceptujemy krótszy element
      wybierz t z cand (bias: prosto z prawdopodobieństwem p_s ≈ 0.75, skręt resztą)
      path.push(t)
    zatwierdź(path, d); zaktualizuj depth_*
    return OK
  cofnij k ostatnich wycięć i spróbuj ponownie; po wyczerpaniu budżetu — restart
```

Wzrost to samounikająca się ścieżka: nie odwiedza komórki dwukrotnie, ale **może**
dotykać samej siebie bokiem (spirala). Korytarz liczymy po zbiorze komórek, nie po
kolejności ścieżki.

### Rozkład długości

Przy pełnym wypełnieniu **liczba linii i średnia długość to jedna i ta sama wielkość**:

```
średnia długość = W · H / liczba linii
```

Nie są to więc dwa niezależne pokrętła. Konfigurator wystawia liczbę linii, a średnią
długość pokazuje jako wielkość pochodną.

`Lmax = round(κ · max(W, H))`, gdzie `κ ≈ 2–3`; element może być wielokrotnie dłuższy
niż bok planszy, bo się wije. Długość losujemy z **rozkładu mieszanego** o trzech
koszykach, których wagi dobieramy tak, by średnia wyszła na zamówioną:

| Koszyk | Długość | Rozkład | Rola |
|---|---|---|---|
| krótkie | 2–6 | jednostajny | wypełniacz, domyka szczeliny |
| średnie | 7–15 | jednostajny | typowe zawijasy, główna masa planszy |
| długie | 16–`Lmax` | **log-jednostajny** | szkielet planszy, przecinają ją na wskroś |

W koszyku długim rozkład jest log-jednostajny, a nie jednostajny: przy `Lmax = 300`
jednostajny dawałby średnią 158 komórek, czyli same potwory. Log-jednostajny daje
średnią ~97 i rozkłada masę równomiernie po rzędach wielkości, więc powstają zarówno
elementy 20-komórkowe, jak i 250-komórkowe.

**Ograniczenie: `Lmax` i waga koszyka długiego nie są niezależne.** Iloczyn wagi
i średniej długości koszyka, podzielony przez średnią ogólną, to udział powierzchni
planszy zajęty przez długie elementy. Przy `Lmax = 300` i wadze 8% kilkanaście węży
zajęłoby większość planszy. Przy dużym `Lmax` waga musi spaść poniżej ~1.5%.
Konfigurator liczy ten udział na żywo i ostrzega po przekroczeniu ~25%.

**Długie elementy udają się późno, nie wcześnie.** Na starcie `R` to cała plansza,
więc dopuszczalne są wyłącznie komórki przyklejone do krawędzi — pierwsze wycięcia są
z konieczności krótkie. Obszar dopuszczalny **rośnie** w miarę wycinania, bo za
frontierem zostaje coraz więcej komórek przypisanych. Górna granica losowanej długości
musi więc **rosnąć** z postępem generacji.

Warto zauważyć, że to odwrotność sytuacji z poprzedniej wersji projektu, gdzie elementy
wstawiano na pustą planszę i pojemność malała. Kierunek zależności się odwrócił razem
ze zmianą warunku stopu — i to jest miejsce, w którym najłatwiej przenieść stary
odruch do nowego kodu.

**Połamanie steruje rozmiarem korytarza, nie tylko wyglądem.** Korytarz zależy od liczby
linii, które element przecina w poprzek, a nie od jego długości. Wąż o 300 komórkach
zwinięty w ciasną spiralę przecina może 20 kolumn i wycina się łatwo; ten sam wąż
poprowadzony prosto przecina 100 kolumn i wymaga, by cała plansza nad nim była już
przypisana. W konfiguratorze te dwa suwaki oddziałują więc na siebie: mocno połamane
i długie jest łatwe, proste i długie bywa niewykonalne. Interfejs musi pokazywać, co
generator faktycznie osiągnął, a nie tylko, o co go poproszono.

### Sterowanie trudnością zamiast korków

Wcześniejsza wersja projektu sterowała trudnością przez **korki**: elementy dokładane
w korytarze wolnych elementów, żeby je unieruchomić. Przy pełnym wypełnieniu ten
mechanizm **przestaje istnieć** — nie ma wolnych komórek, w które można cokolwiek
dołożyć. Zastępujemy go dwoma innymi:

1. **Bias kształtu frontiera.** Liczba elementów wolnych na starcie (`f0`) to liczba
   elementów, które mogłyby zostać wycięte jako pierwsze — czyli szerokość „powierzchni"
   wycinania w chwili startu. Wycinanie warstwami równomiernie po całym obwodzie daje
   szeroki frontier i wysokie `f0`; wycinanie wąskimi tunelami w głąb daje frontier
   poszarpany i `f0` niskie. Sterujemy tym, preferując kontynuację w tym samym rejonie
   i kierunku zamiast losowego skakania po planszy.
2. **Generuj–zmierz–odrzuć.** Po wygenerowaniu liczymy metryki z §9; jeśli wypadają poza
   pasmem trudności, powtarzamy z innym ziarnem lub skorygowanymi parametrami. Budżet
   prób jest ograniczony; po jego wyczerpaniu oddajemy najlepszy wynik, żeby gra nigdy
   nie zawiesiła się przy starcie poziomu.

Skuteczność biasu z punktu 1 jest **hipotezą do potwierdzenia benchmarkiem**. Gdyby
okazała się słaba, pozostaje samo generuj–zmierz–odrzuć, które działa zawsze, tylko
drożej.
## 8. Solver i weryfikacja

### Graf blokowania

Ponieważ `swept(E)` jest stały (§2), relacja „`F` blokuje `E`", zdefiniowana jako
`cells(F) ∩ swept(E) ≠ ∅`, jest **statycznym grafem skierowanym** na elementach,
policzalnym raz.

`E` jest wolny wtedy i tylko wtedy, gdy żaden pozostały na planszy `F` go nie blokuje.
Zatem poprawna kolejność usuwania to porządek topologiczny tego grafu, a stąd:

> **plansza jest rozwiązywalna ⟺ graf blokowania jest acykliczny**

Jedyny sposób, w jaki plansza może być nierozwiązywalna, to cykl — na przykład dwa
elementy na jednej linii skierowane na siebie.

### Konfluencja

Bycie wolnym jest **monotoniczne względem usuwania**: jeśli `E` jest wolny w stanie `S`
i `S' ⊆ S`, to `E` jest wolny w `S'`. Usuwanie tylko zmniejsza zajętość, a wolny
korytarz pozostaje wolny.

Stąd: gdyby zachłanne usuwanie utknęło w niepustym `S` bez wolnych elementów, a plansza
miała rozwiązanie `σ`, to biorąc `E` = pierwszy element `σ` należący do `S`, w chwili
gdy `σ` usuwało `E`, stan `T` zawierał `S`. `E` wolny w `T` implikuje wolny w `S` —
sprzeczność.

**Każda kolejność usuwania wolnych elementów prowadzi do rozwiązania.** Gracz nie może
zablokować się legalnym ruchem; przegrywa wyłącznie przez błędne kliknięcia.

### Implementacja solvera

```
zbuduj graf: dla każdego E, dla każdej obcej komórki w swept(E) → krawędź E → owner(c)
Kahn: kolejka = elementy bez pozostałych blokerów; zdejmuj, dekrementuj liczniki
rozwiązywalna ⟺ zdjęto wszystkie N elementów
pozostałość = elementy leżące w cyklach (diagnostyka)
```

Koszt budowy grafu `O(N · ℓ · max(W,H))`, sortowania `O(N + E)`. Solver jest niezależny
od generatora i służy do weryfikacji w testach — nie do rozgrywki.

## 9. Trudność

Gra nie ma ślepych zaułków (§8), więc nie wymaga planowania. Trudność jest
**percepcyjna**: jak trudno znaleźć element, który ma wolną drogę, i jak wiele elementów
*wygląda* na wolne, choć nie są.

Przy pełnym wypełnieniu warunek „wolny" brzmi: **w każdej linii, którą element przecina,
pokrywa on cały odcinek od siebie do krawędzi wyjścia**. Nie „ma przed sobą pustkę",
lecz „przed nim jest już tylko on sam". To jest dokładnie ta rzecz, której gracz nie
potrafi szybko odczytać z ekranu — i stąd bierze się cała trudność gry.

| Metryka | Definicja |
|---|---|
| `f0` | udział elementów wolnych na starcie (ujścia grafu blokowania) |
| `T_k` | elementy zablokowane, których korytarz jest „czysty" przez pierwsze `k` komórek — bloker leży daleko, poza polem widzenia gracza |
| `T_conc` | elementy zablokowane we własnej wklęsłości (kształty U, S) |
| `D` | głębokość grafu blokowania (najdłuższa ścieżka) |
| `meanCorridorLen` | średnia długość korytarza — jak daleko trzeba wodzić wzrokiem, by ocenić jeden ruch |
| `minFree` | minimalna liczba wolnych elementów w trakcie losowych playoutów zachłannych |

`T_k` jest najważniejsza: mierzy liczbę okazji do błędnego kliknięcia, czyli to, co
faktycznie odbiera życia. `minFree` jest w MVP metryką **diagnostyczną** — raportowaną
w benchmarku, ale niewchodzącą do progów akceptacji, bo jej kalibracja wymaga playtestu.

Wszystkie metryki są tanie; jedyna stochastyczna to `minFree`.

`meanCorridorLen` **nie jest progiem trudności** — do tego jest słaba, bo mierzy długość,
a nie zwodniczość. Wchodzi natomiast do formuły punktacji (§10) jako miara wysiłku.

**Metryki podróżują razem z planszą.** Nie są danymi wyłącznie benchmarkowymi: `Board`
niesie swój `BoardMetrics`, bo punktacja (§10) liczy się ze złożoności konkretnej
wygenerowanej planszy, a nie z etykiety poziomu.

### Parametry poziomów

Wypełnienie **nie jest parametrem** — jest zawsze 100%. Każda komórka siatki należy do
dokładnie jednego elementu; suma długości elementów równa się `W · H`. W konsekwencji
liczba linii i średnia długość to jedna wielkość, związana zależnością
`średnia długość = W · H / liczba linii`.

| Poziom | plansza | komórek | linii | śr. dł. | `Lmax` | `f0` | `T_2` |
|---|---|---|---|---|---|---|---|
| Easy | 25×25 | 625 | ~80 | ~7.8 | 50 | ≥ 0.35 | ≤ 2 |
| Medium | 50×50 | 2 500 | ~250 | ~10 | 125 | 0.20–0.35 | 3–8 |
| Hard | 75×75 | 5 625 | ~560 | ~10 | 188 | 0.08–0.20 | 8–20 |
| Nightmare | 100×100 | 10 000 | ~1 000 | ~10 | 300 | ≤ 0.03 | ≥ 20 |

Wszystkie wartości są **punktem wyjścia do kalibracji benchmarkiem**, a nie ustaleniem.
Progi `T_2` i `D` skalują się z liczbą elementów, więc bezwzględne liczby z małej
planszy nie przenoszą się na dużą. Pierwszym krokiem implementacji generatora jest
raport z faktycznie osiąganego rozkładu długości, wartości metryk, liczby elementów
jednokomórkowych i czasu generacji.

Pętla generacji: wygeneruj → policz metryki → jeśli poza pasmem, powtórz z innym
ziarnem lub skorygowanymi parametrami (§7) → po wyczerpaniu budżetu oddaj najlepszy
wynik.
## 10. Pętla gry

`game/session.ts` to **czysty reduktor**, bez DOM i bez efektów ubocznych:

```ts
type Status = 'playing' | 'won' | 'lost'

type Session = {
  board: Board
  lives: number
  status: Status
  removed: number
  startedAt: number      // znacznik czasu przekazany z zewnątrz
  elapsedMs: number
  mode: 'classic' | 'timed'
  streak: number         // seria kolejnych bezbłędnych ruchów; informacja, nie punkty
  bestStreak: number
  score: number          // 0 przez całą rozgrywkę; wyliczany raz, przy przejściu na 'won'
}

type Action =
  | { type: 'click'; pieceId: number; at: number }
  | { type: 'tick'; at: number }
  | { type: 'restart'; seed: number; at: number }

type Effect =
  | { kind: 'exit'; pieceId: number; dir: Dir }
  | { kind: 'bounce'; pieceId: number; distance: number; blockerId: number }
  | { kind: 'none' }

reduce(session: Session, action: Action): { next: Session; effect: Effect }
```

Kliknięcie elementu wolnego usuwa go z planszy i zwiększa `streak`; **punktów nie
dolicza**. Gdy plansza jest pusta, `status` staje się `won` i dopiero wtedy reduktor
wylicza `score` z formuły poniżej. Kliknięcie elementu zablokowanego zostawia
go na miejscu, zeruje `streak` i zmniejsza `lives`; przy zerze `status` staje się
`lost`. Reduktor zwraca `effect` — gotowe polecenie dla renderera, z odległością
odbicia włącznie, żeby warstwa wizualna nie musiała niczego wnioskować sama.

Wielokrotne kliknięcie tego samego zablokowanego elementu odejmuje życie za każdym
razem. Decyzja świadoma i pokryta testem.

### Czas

**Czas nie jest odczytywany wewnątrz reduktora.** Znacznik `at` wchodzi jako pole akcji,
a `elapsedMs` jest z niego wyliczane. Gdyby reduktor sięgał po zegar sam, przestałby być
czysty, a testy przestałyby być deterministyczne — dlatego istnieje osobna akcja `tick`,
którą warstwa UI wysyła w rytmie odświeżania stopera.

Wariant na czas **nie narzuca graczowi limitu**. Stoper wyłącznie mierzy; wpływa na
premię w wyniku końcowym, nigdy na przegraną.

### Punktacja

**Punkty przyznawane są wyłącznie za ukończoną planszę.** Usunięcie pojedynczego
elementu nie daje nic; wynik pojawia się na koncie gracza dopiero po wyczyszczeniu
planszy. Przegrana to zero punktów, niezależnie od tego, ile elementów zdjęto.

Wynik zależy od czterech rzeczy: złożoności planszy, zachowanych żyć, a w wariancie na
czas także czasu ukończenia. Poziom trudności nie jest osobnym czynnikiem — jest
**pochodną złożoności**, bo trudniejszy poziom generuje planszę o wyższych metrykach.

#### Dlaczego złożoność, a nie etykieta poziomu

Konfigurator (§11) pozwala graczowi ustawić własne parametry, więc etykieta „Nightmare"
przestaje cokolwiek gwarantować. Punktacja oparta na nazwie poziomu byłaby trywialna do
obejścia: wystarczyłoby ustawić planszę 5×5 i zbierać punkty za „Nightmare". Dlatego
podstawą jest **złożoność zmierzona na konkretnej wygenerowanej planszy**.

Wymaga to, by metryki z §9 przestały być danymi wyłącznie benchmarkowymi i podróżowały
razem z planszą do rozgrywki — `Board` niesie swój `BoardMetrics`, a sesja korzysta
z nich przy liczeniu wyniku.

#### Formuła

```
complexity =
    (W · H) / 100                                  // rozmiar zadania
  × (1 + w_f · (1 − f0))                           // ciasnota startu
  × (1 + w_t · T₂ / N)                             // gęstość pułapek
  × (1 + w_c · meanCorridorLen / max(W, H))        // jak daleko trzeba wodzić wzrokiem
  × (1 + w_d · D / sqrt(W · H))                    // głębokość zaplątania

livesBonus = 1 + 0.25 · livesLeft                  // 1.00 … 1.75
timeBonus  = clamp(refTime / elapsed, 0.6, 1.6)    // tylko w wariancie na czas
refTime    = N · t_piece

score = round(complexity × livesBonus × timeBonus)
```

Podstawa skaluje się z **powierzchnią planszy**, a nie z liczbą elementów. To celowe:
gdyby punkty rosły z liczbą kliknięć, plansza 100×100 złożona z samych elementów
jednokomórkowych — nużąca, ale banalna — punktowałaby najwyżej ze wszystkich.
Powierzchnia jest tym, czego gracz nie zawyży bez podjęcia realnie większego zadania,
a mnożniki mierzą **trudność na klik**.

Każdy mnożnik jest ograniczony z góry, więc żaden pojedynczy parametr nie rozsadza
wyniku. Wagi `w_f`, `w_t`, `w_c`, `w_d` oraz `t_piece` są **kalibrowane benchmarkiem**
tak, by cztery presety układały się w rosnący ciąg, a plansze zdegenerowane wypadały
wyraźnie niżej. Formuła mieszka w jednym module i jest pokryta testami (§12).

`meanCorridorLen` wraca tu jako metryka po tym, jak §9 odrzuciło ją jako **próg
trudności**. Do progów była słaba, bo mierzyła długość, a nie zwodniczość. Jako miara
**wysiłku** jest jednak trafna: mówi, jak daleko gracz musi prowadzić wzrok, żeby ocenić
jeden ruch.

#### Seria bezbłędnych ruchów

`streak` i `bestStreak` pozostają w sesji i na pasku stanu jako **informacja zwrotna na
żywo**, ale nie wchodzą do wyniku — liczba błędów jest już reprezentowana przez
`livesLeft`, a dokładanie drugiego czynnika za to samo podwójnie karałoby pomyłki.

## 11. Renderowanie i UI

`render/renderer.ts` definiuje interfejs (`draw(board)`, `animateExit(piece)`,
`shake(piece)`, `onPieceClick(cb)`); `svgRenderer.ts` go implementuje. Element rysowany
jest jako `<path>` z grubą linią, zaokrąglonymi łączeniami i grotem na końcu.
Trafienie: współrzędne wskaźnika → komórka → `occupancy` → id elementu, więc obsługa
myszy i dotyku jest wspólna.

Grafika MVP jest **placeholderem**: czytelna, monochromatyczna, bez dopracowanej palety
i typografii. Główny ekran to wybór jednego z czterech poziomów oraz wariantu
(klasyczny albo na czas). Nad planszą pasek stanu: trzy serca, stoper i aktualna seria
bezbłędnych ruchów; obok przycisk nowej gry.

**Wyniku nie ma na pasku podczas gry** — punkty przyznaje się dopiero za ukończoną
planszę (§10). Ekran wygranej pokazuje rozbicie: złożoność planszy, premię za zachowane
życia i, w wariancie na czas, premię czasową. Rozbicie jest ważniejsze niż sama liczba:
bez niego gracz nie ma jak zrozumieć, dlaczego dostał tyle, a nie inaczej.

### Widok: zoom i przesuwanie

Nightmare ma 10 000 komórek; przy 8 px na komórkę plansza zajmuje 800×800 px, czego
żaden telefon nie pokaże czytelnie. `render/viewport.ts` utrzymuje skalę i przesunięcie
oraz przelicza współrzędne ekranu na komórki.

W SVG zoom i przesuwanie to zmiana atrybutu `viewBox` — jedna operacja, bez
przerysowywania ścieżek, składana przez GPU. To główny powód, dla którego SVG broni się
mimo skali. Sterowanie: kółko myszy i szczypanie do skali, przeciąganie do przesuwania,
podwójne kliknięcie do dopasowania całości. Kliknięcie odróżniamy od przeciągnięcia
progiem odległości, żeby przesuwanie planszy nie kosztowało życia.

### Konfigurator (tryb zaawansowany)

Wejście z głównego ekranu, za przyciskiem. Cztery parametry odpowiadają wprost polom
`GeneratorParams`: rozmiar planszy, liczba linii, stopień połamania (`1 − p_s`)
i długość maksymalna (`Lmax`). Presety Easy–Nightmare to **zapisane instancje tej samej
struktury**, nie osobna ścieżka kodu — jedno źródło prawdy dla generatora.

Konfigurator liczy na żywo udział powierzchni zajęty przez długie elementy (§7)
i ostrzega po przekroczeniu ~25%. Po generacji pokazuje **co faktycznie osiągnięto**:
liczbę elementów, rozkład długości oraz liczbę nawrotów i restartów generatora.
Wypełnienia nie raportuje, bo jest zawsze pełne. Jest to konieczne, bo
geometria potrafi odmówić — proste i bardzo długie elementy często nie mieszczą się,
a generator nie może obiecać liczby, której nie da się zrealizować.

### Budżet wydajności

Punkt odniesienia to Nightmare: 10 000 komórek, ~1 000 elementów, ~1 000 ścieżek SVG.

| Operacja | Budżet |
|---|---|
| generacja planszy (z pętlą odrzucania po metrykach) | poza głównym wątkiem, w Web Workerze; wskaźnik postępu po 300 ms |
| pierwsze narysowanie planszy | < 300 ms |
| zoom i przesuwanie | 60 fps (sama zmiana `viewBox`) |
| reakcja na kliknięcie (test wolności jednego elementu) | < 16 ms |

Przekroczenie budżetu uruchamia ścieżkę optymalizacji z §13. Gdyby SVG nie wyrobiło się
w pierwszym narysowaniu, wymieniamy implementację renderera na Canvas — interfejs
`Renderer` istnieje właśnie po to.

PWA: manifest, ikony i service worker cache-first (`vite-plugin-pwa`). Gra jest w pełni
klientowa, więc offline działa bez dodatkowej logiki.

## 12. Testy

Rdzeń jest testowany jednostkowo w Vitest, bez przeglądarki. Trzy warstwy:

**Testy jednostkowe regionu zamiatania i legalności ruchu:**

1. Kształt U lub S: obcy element we wklęsłości blokuje. Korytarz liczony od komórki
   najdalszej od krawędzi wyjścia, nie od najbliższej i nie tylko od grotu.
2. Element prosty ułożony wzdłuż własnego kierunku: promień z ogona przechodzi przez
   komórki własne i nie może zablokować elementu.
3. Grot przy krawędzi (korytarz na linii grotu pusty), ale drugie ramię L ma bloker →
   element zablokowany.
4. Element leżący wzdłuż krawędzi, prostopadle do swojego kierunku → zawsze wolny.
5. Bloker w ostatniej komórce przy krawędzi (pętla inkluzywna) i bloker tuż przed
   elementem.
6. Dwa równoległe elementy o tym samym kierunku obok siebie → oba wolne; jeden za
   drugim na tej samej linii → tylny zablokowany, przedni wolny.
7. Ten sam bloker w trzech komórkach korytarza: po jego usunięciu element staje się
   wolny dokładnie raz (spójność liczników).
8. Znak kierunku: grot w `(5,3)` z `dir = prawo` → ciało w `(4,3)`. Grot skierowany
   w głąb planszy (korytarz przez całą planszę) jest legalny.

**Testy kształtów i generatora:**

9. Długości skrajne `ℓ = 2` i `ℓ = Lmax`; wzrost, który utknął, akceptuje krótszy
   element, nigdy o długości 1.
9a. Element bardzo długi, wijący się przez większość planszy: region zamiatania liczony
   poprawnie po wszystkich dotkniętych liniach; element dotykający tej samej linii
   w kilku miejscach używa na niej komórki najdalszej od krawędzi wyjścia.
9b. Rozkład długości: przy zadanych wagach koszyków generator faktycznie produkuje
   elementy długie (raport z benchmarku), a nie po cichu obcina wszystko do krótkich.
10. Samounikanie: ścieżka nie odwiedza komórki dwukrotnie, ale wolno jej dotykać siebie
    bokiem.
11. Element dłuższy niż wymiar planszy; plansze zdegenerowane `1×N` i `2×2`; generator
    zawsze kończy pracę z pełnym pokryciem, nigdy się nie zapętla.
12. Aktualizacja `depth_d` po wycięciu elementu: komórka przy krawędzi zwiększa `depth`
    linii, komórka w głębi nie (dopóki nie domknie się ciągłość od krawędzi).
12a. **Pełne pokrycie:** po zakończeniu generacji każda komórka siatki należy do
    dokładnie jednego elementu — żadna nie zostaje nieprzypisana i żadne dwa elementy
    się nie nakładają. Suma długości elementów równa się `W · H`. To najważniejszy
    niezmiennik generatora; sprawdzany na wielu ziarnach i wszystkich rozmiarach.
12b. **Każdy element ma co najmniej 2 komórki.** Niezmiennik sprawdzany na wszystkich
    wygenerowanych planszach; naruszenie oznacza, że reguła głów parowalnych została
    obejta.
12c. Test kształtu resztki wykrywa **pentomino w kształcie plusa** jako fragment
    nierozkładalny. To jest przypadek, którego naiwny test izolacji nie łapie, więc musi
    mieć własny test — z jawnie skonstruowanym stanem `R`.
12d. Generator wychodzi z zaklinowania: dla wrogiego stanu `R`, w którym nie ma legalnego
    elementu długości ≥ 2, cofa wycięcia i kończy pracę z pełnym pokryciem albo
    restartuje — nigdy nie zwraca planszy z nieprzypisanymi komórkami i nigdy się nie
    zapętla.
12e. Nieparzysta powierzchnia planszy (np. 25×25 = 625) jest obsłużona: co najmniej jeden
    element ma nieparzystą długość, a pokrycie pozostaje pełne.
13. Determinizm: to samo ziarno daje tę samą planszę.

**Testy własnościowe (setki–tysiące ziaren):**

14. Każda wygenerowana plansza przechodzi solver: rozwiązywalna.
15. Odwrócona kolejność wstawiania jest poprawnym rozwiązaniem — każdy ruch legalny.
16. Konfluencja: losowe playouty zachłanne nigdy nie osiągają stanu bez wolnego elementu
    przy niepustej planszy.
17. Usunięcie dowolnego elementu z rozwiązywalnej planszy pozostawia ją rozwiązywalną.
18. **Test różnicowy:** pole `free` z `probeMove` w silniku gry i test przynależności do `S_d`
    z generatora muszą zgadzać się co do bitu na losowych stanach. Rozjazd między nimi
    to dokładnie ten błąd, który produkuje nierozwiązywalne plansze.
19. Solver wykrywa ręcznie skonstruowane cykle (dwuelementowy `A → ← B` oraz trzy- i
    więcej-elementowy) i wskazuje elementy cyklu.

**Testy odległości odbicia, serii i punktacji:**

24. `probeMove` zwraca poprawną `distance` i `blockerId`: bloker tuż przed elementem
    (`distance = 1`), bloker daleko, oraz bloker **we wklęsłości kształtu U** — tu
    odległość liczy się od tej komórki własnej, która w niego uderzy, a nie od
    najdalszej. Ten przypadek najpewniej wyłapie błąd w śledzeniu `lastOwn`.
25. Gdy blokerów jest kilka, `distance` odpowiada **najbliższemu**, a `blockerId`
    wskazuje właśnie ten element.
26. Seria: rośnie przy kolejnych trafnych ruchach, zeruje się przy błędzie, `bestStreak`
    zapamiętuje maksimum. Nie wpływa na `score`.
26a. **`score` pozostaje zerem przez całą rozgrywkę** i zmienia się dokładnie raz, przy
    przejściu na `won`. Usunięcie elementu nie zmienia wyniku.
26b. **Przegrana daje zero punktów**, choćby gracz zdjął wszystkie elementy poza jednym.
26c. Monotoniczność: ta sama plansza ukończona z większą liczbą żyć daje wynik nie
    mniejszy; w wariancie na czas ukończona szybciej — nie mniejszy.
26d. Premia czasowa jest ograniczona z obu stron: bardzo szybkie i bardzo wolne
    ukończenie dają wartości na krańcach przedziału, nie poza nim. W wariancie
    klasycznym czas nie wpływa na wynik w ogóle.
26e. **Test antyeksploatacyjny:** plansza 100×100 złożona z samych elementów
    jednokomórkowych punktuje wyraźnie niżej niż plansza Nightmare o tym samym
    rozmiarze. To jest test, który pilnuje, żeby punktacja mierzyła trudność, a nie
    liczbę kliknięć — i który wypadnie oblać przy każdej nieostrożnej zmianie wag.
26f. Wynik jest funkcją czystą: te same metryki planszy, te same życia i ten sam czas
    dają ten sam wynik, niezależnie od przebiegu rozgrywki.
27. Reduktor jest deterministyczny względem czasu: ta sama sekwencja akcji z tymi samymi
    znacznikami `at` daje identyczny `elapsedMs` i wynik, niezależnie od zegara
    systemowego. Test nie może potrzebować atrap zegara — jeśli potrzebuje, reduktor
    przestał być czysty.
28. Akcja `tick` aktualizuje `elapsedMs`, ale nie zmienia planszy, żyć ani serii.

**Testy skali i parametrów (Nightmare 100×100):**

20. Generacja planszy 100×100 kończy się i przechodzi solver — na wielu ziarnach.
    To jest test, który najpewniej wyłapie błędy wydajnościowe i przepełnienia.
21. Rozmiary skrajne konfiguratora: plansza minimalna (np. 5×5), maksymalna, oraz
    parametry **niewykonalne** (1000 linii o długości 300 na planszy 25×25). Generator
    kończy pracę w skończonym czasie, oddaje najlepszy wynik i raportuje rozbieżność
    między zamówieniem a wykonaniem — nigdy się nie zapętla i nie rzuca wyjątkiem.
22. Stopień połamania na krańcach: `p_s = 1` (elementy idealnie proste, muszą skręcić
    tylko na krawędzi) i `p_s = 0` (maksymalnie kręte). W obu przypadkach generator
    produkuje poprawne, rozwiązywalne plansze.
23. Udział powierzchni koszyka długiego zgadza się z wartością wyliczaną przez
    konfigurator z parametrów — inaczej ostrzeżenie o 25% wprowadza w błąd.

**Benchmark (nie test, ale krok implementacji):** raport z faktycznie osiąganego
rozkładu długości, wartości metryk trudności, liczby elementów jednokomórkowych oraz
czasu generacji dla zestawu parametrów — podstawa do kalibracji progów z §9 i do
decyzji o ścieżce optymalizacji z §13.

Reduktor sesji jest testowany osobno: legalne i nielegalne kliknięcie, utrata żyć,
przejścia do `won` i `lost`.

## 13. Poza zakresem MVP

**Świadomie odłożone funkcje:** undo (wymaga historii ruchów — tanie, jeśli reduktor
jest czysty od początku, i taki jest), podpowiedzi, progresja poziomów, zapis postępu
i tabele wyników, dźwięk, dopracowana warstwa wizualna. Stoper, seria i punktacja
**wchodzą** do MVP (§10); poza zakresem zostaje trwałe przechowywanie wyników.

**Ścieżka optymalizacji.** Wcześniejsza wersja tego projektu zakładała plansze rzędu
20×25 i ~50 elementów, przy których zwykłe pętle wykonują się w mikrosekundach,
a optymalizacja byłaby przedwczesna. Po powiększeniu Nightmare do 100×100 i ~920
elementów **przestało to być oczywiste**: pełny skan wolności to rząd 10⁶–10⁷ operacji,
a budowa grafu blokowania podobnie. Dlatego benchmark z §12 jest **krokiem
obowiązkowym i wczesnym**, a nie opcjonalnym; poniższe struktury wdrażamy, gdy
przekroczy budżet z §11, i tylko wtedy:

- maski korytarza jako bitboardy wierszowe (`uint64` na wiersz, przy `W ≤ 64`); test
  wolności staje się `∀r: occ[r] & corr[r] == 0`,
- odwrotny indeks `coverIndex[c] → lista id, których korytarz zawiera c` oraz licznik
  `blockedCells[E]`; usunięcie elementu aktualizuje zbiór wolnych elementów
  inkrementalnie, bez skanowania. Ta struktura obsłuży też przyszłe podpowiedzi.

**Zmiana reguł zmieniająca charakter gry.** Obecne reguły nie dają głębi planistycznej.
Gdyby kiedyś była pożądana, trzeba zmienić reguły — na przykład „element zatrzymuje się
na przeszkodzie zamiast pozostać w miejscu" albo limit ruchów. Wtedy jednak korytarz
przestaje być stały, graf blokowania przestaje być statyczny, rozwiązywalność przestaje
być problemem acykliczności, a solver wymaga przeszukiwania z nawrotami. Cała elegancja
z §6–§8 znika. Decyzja świadoma, nie do odkrycia w połowie implementacji.

## 14. Ryzyka

| Ryzyko | Przeciwdziałanie |
|---|---|
| Rozjazd między definicją korytarza w silniku i w generatorze produkuje nierozwiązywalne plansze | Wspólna definicja korytarza plus test różnicowy (§12.18) i solver na tysiącach ziaren (§12.14) |
| Błąd „przednia zamiast tylnej komórki" w optymalizacji per linia — niewykrywalny bez kształtów wklęsłych | Testy 1 i 3 z §12 są obowiązkowe przed jakąkolwiek optymalizacją |
| Wygenerowane plansze są nudne mimo poprawności (frontier wycinania zbyt równy, dużo wolnych elementów na starcie) | Bias preferujący wycinanie tunelami zamiast warstwami (§7), metryki `f0` i `T_k` przy generacji, pętla generuj-zmierz-odrzuć |
| Bias frontiera okazuje się nieskuteczny i `f0` pozostaje wysokie | Pętla generuj-zmierz-odrzuć działa niezależnie od biasu, tylko drożej; benchmark rozstrzyga, czy bias w ogóle zostaje w kodzie |
| Generator zakleszcza się przy minimalnej długości 2 i często restartuje, wydłużając ładowanie | Głowy parowalne, test kształtu resztki i ograniczony nawrót (§7); częstość nawrotów mierzona benchmarkiem; plan awaryjny to wariant dwufazowy z gwarantowanym podziałem |
| Test kształtu resztki przepuszcza fragment nierozkładalny inny niż plus | Solver z §8 weryfikuje każdą planszę niezależnie od generatora; nawrót uruchamia się na podstawie faktycznego zaklinowania, a nie tylko przewidywania |
| Progi trudności trafione na oślep | Benchmark przed kalibracją; progi z §9 są jawnie wstępne |
| Gracz farmi punkty planszą zdegenerowaną z konfiguratora (ogromna, ale banalna) | Podstawa punktacji skaluje się z powierzchnią, nie z liczbą kliknięć; mnożniki mierzą trudność na klik; test antyeksploatacyjny 26e |
| Wagi punktacji dobrane tak, że presety nie układają się w rosnący ciąg | Kalibracja benchmarkiem na wszystkich czterech presetach; formuła w jednym module |
| Generacja zawiesza się przy trudnych parametrach | Twardy limit prób; po jego wyczerpaniu oddajemy najlepszy wynik |
| Długie elementy po cichu nie powstają (wzrost zawsze utyka, plansza wygląda jak sieczka z drobiazgu) | Malejąca górna granica długości wraz z postępem, plus test 9b raportujący faktyczny rozkład długości |
| Jedna długa linia wyczerpuje pojemność swojego kierunku i blokuje dalsze wstawienia | Balans czterech kierunków; górna granica liczby długich elementów na kierunek, kalibrowana benchmarkiem |
| Kilkanaście długich elementów zajmuje większość powierzchni i plansza wygląda jak zbiór spiral zamiast pola strzałek | Udział powierzchni koszyka długiego liczony jawnie (§7), pokazywany w konfiguratorze, ostrzeżenie powyżej 25%, test 23 |
| Generacja 100×100 zamraża interfejs na sekundy | Rdzeń bez DOM jest z założenia przenośny do Web Workera (§4); budżet i wskaźnik postępu w §11 |
| SVG nie wyrabia przy ~1 000 ścieżkach lub zoom klatkuje | Budżet wydajności §11 mierzony wcześnie; renderer za interfejsem, wymiana na Canvas nie dotyka rdzenia |
| Gracz traci życie, próbując przesunąć planszę | Kliknięcie odróżniane od przeciągnięcia progiem odległości (§11); pokryte testem interakcji |
| Konfigurator obiecuje parametry, których geometria nie dopuszcza | Generator raportuje osiągnięte wartości obok zamówionych (§11); test 21 na parametrach niewykonalnych |
