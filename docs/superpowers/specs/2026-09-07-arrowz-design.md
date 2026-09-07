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
- stoper, licznik serii bezbłędnych ruchów i punktacja z mnożnikiem,
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
wskroś wielokrotnie, w tę i z powrotem. Rozkład długości jest **ciężkoogonowy**: dominują
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
przerysowywania. Przy ~920 ścieżkach Nightmare to wciąż rozsądny wybór, ale margines
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
    generator.ts     generacja wsteczna, korki, parametry trudności
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
}
```

Uwaga implementacyjna: `occupancy` jest `Int32Array`, nie `Int8Array` — plansza
Nightmare ma ~920 elementów, więc `Int8Array` przepełniłby się siedmiokrotnie.
Przy 10 000 komórek zajmuje 40 kB, co jest bez znaczenia.

Parametry generatora są **jedną strukturą**, wspólną dla presetów i konfiguratora:

```ts
type GeneratorParams = {
  width: number
  height: number
  pieceCount: number      // ile linii; wypełnienie wynika z niego i z długości
  maxLength: number       // Lmax
  straightBias: number    // p_s ∈ [0,1]; „stopień połamania" w UI to 1 - p_s
  bucketWeights: [short: number, medium: number, long: number]
  seed: number
}

type GenerationReport = {          // co faktycznie osiągnięto
  params: GeneratorParams
  actualPieceCount: number
  actualFill: number
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

## 7. Generator: generacja wsteczna

### Zasada

Budujemy planszę, wstawiając elementy jeden po drugim: element „wjeżdża" z zewnątrz
planszy w kierunku przeciwnym do swojego grotu i zatrzymuje się na pozycji docelowej.
Trasa wjazdu to **dokładnie ten sam zbiór komórek** co region zamiatania przy ucieczce
— ta sama translacja, przebiegnięta wstecz. Generator i silnik gry dzielą więc jedną
definicję korytarza; dwie osobne implementacje mogłyby się rozjechać.

### Twierdzenie o poprawności

Jeżeli przy wstawianiu `E_k` (k = 1..N) zachodzi
`swept(E_k) ∩ cells({E_1..E_{k-1}}) = ∅` oraz komórki `E_k` są puste,
to kolejność `E_N, E_{N-1}, …, E_1` jest poprawnym rozwiązaniem.

Dowód: w chwili usuwania `E_k` na planszy są dokładnie `E_1..E_k`. `swept(E_k)` jest
stały; przy wstawianiu nie zawierał komórek `E_1..E_{k-1}`, a `E_{k+1}..E_N` już nie ma.
Ruch jest legalny. Indukcja po malejącym `k`.

Warunek musi obejmować **cały korytarz**, nie tylko komórki docelowe, i musi być
sprawdzany **wyłącznie względem elementów już wstawionych**. Elementy wstawione
później mogą leżeć w korytarzu `E_k` — to nie usterka, tylko cel: one blokują `E_k`
na starcie i tworzą zaplątanie, a znikną przed nim.

Generator jest **zupełny**: każda rozwiązywalna plansza jest osiągalna tą procedurą
(weź dowolne rozwiązanie i odwróć je).

### Obszar dopuszczalny: skyline

Niech `depth_d[L]` = liczba kolejnych pustych komórek na linii `L`, licząc od krawędzi
w kierunku `d` do wewnątrz, względem elementów już wstawionych. Niech `dist_d(c)` =
liczba komórek ściśle między `c` a krawędzią w kierunku `d`. Wtedy:

```
c może należeć do elementu wychodzącego w kierunku d  ⟺  dist_d(c) < depth_d[line_d(c)]
```

Zbiór takich komórek oznaczamy `S_d`. Test jest **`O(1)` na komórkę**.

Element jest legalny wtedy i tylko wtedy, gdy **wszystkie** jego komórki należą do `S_d`.
Jest to równoważne pełnemu testowi korytarza: suma promieni jest wolna od obcych komórek
dokładnie wtedy, gdy każdy promień z osobna jest wolny.

Utrzymujemy cztery tablice `depth_d[·]`, po jednej na kierunek. Po wstawieniu elementu
aktualizacja to `depth_d[line_d(c)] = min(depth_d[·], dist_d(c))` dla każdej komórki `c`
elementu i każdego z czterech kierunków — koszt `O(4·ℓ)`, bez przeliczania planszy.

### Procedura wstawiania

Zamiast losować kształt i pozycję, a potem odrzucać, **hodujemy ścieżkę wyłącznie
wewnątrz `S_d`**. Każdy tak zbudowany element ma z definicji wolny korytarz, więc
akceptowalność pozostaje bliska 100% także przy dużym zagęszczeniu.

```
insert(rng, params):
  dla kierunków d w losowej kolejności, ważonej |S_d|:
    Heads = { c ∈ S_d : c - d ∈ S_d }          # zapewnia długość ≥ 2
    jeśli Heads puste: następny kierunek
    h = losuj z Heads z wagą w(c) = depth^β · (1 + α·cover[c])
    path = [h, h - d]
    docelowa długość ℓ* ~ rozkład mieszany (patrz niżej), malejący z postępem
    dopóki |path| < ℓ*:
      cand = { sąsiedzi ogona ∈ S_d, spoza path }
      jeśli cand puste: przerwij            # akceptujemy krótszy element, min. 2
      wybierz t z cand (bias: prosto z prawdopodobieństwem p_s ≈ 0.75, skręt resztą)
      path.push(t)
    zatwierdź(path, d); zaktualizuj depth_*; zaktualizuj cover
    return OK
  return SATURATED
```

Wzrost to samounikająca się ścieżka: nie odwiedza komórki dwukrotnie, ale **może**
dotykać samej siebie bokiem (spirala). Korytarz liczymy po zbiorze komórek, nie po
kolejności ścieżki.

### Rozkład długości i kolejność wstawiania

Długość jest głównym parametrem charakteru planszy, więc opisujemy ją wprost.
`Lmax = round(κ · max(W, H))`, gdzie `κ ≈ 2–3`; element może być wielokrotnie dłuższy
niż bok planszy, bo się wije. Długość losujemy z **rozkładu mieszanego** o trzech
koszykach, których wagi są parametrem trudności:

| Koszyk | Długość | Rozkład | Rola |
|---|---|---|---|
| krótkie | 2–6 | jednostajny | wypełniacz, domyka gęstość |
| średnie | 7–15 | jednostajny | typowe zawijasy, główna masa planszy |
| długie | 16–`Lmax` | **log-jednostajny** | szkielet planszy, przecinają ją na wskroś |

W koszyku długim rozkład jest log-jednostajny, a nie jednostajny: przy `Lmax = 300`
jednostajny dawałby średnią 158 komórek, czyli same potwory. Log-jednostajny daje
średnią ~97 i rozkłada masę równomiernie po rzędach wielkości, więc powstają zarówno
elementy 20-komórkowe, jak i 250-komórkowe.

**Ograniczenie, o którym łatwo zapomnieć: `Lmax` i waga koszyka długiego nie są
niezależne.** Iloczyn `waga · średnia długość / średnia długość ogółem` to udział
powierzchni planszy zajęty przez długie elementy. Przy `Lmax = 300` i wadze 8% czternaście
węży zajęłoby **60% wypełnienia** — plansza byłaby kilkoma spiralami, a nie polem
strzałek. Dlatego przy dużym `Lmax` waga musi spaść do 0.5–1.5%. Konfigurator (§11)
liczy ten udział na żywo i ostrzega, gdy przekroczy ~25%.

Bias prostoliniowy `p_s ≈ 0.75` (w konfiguratorze: „stopień połamania" = `1 − p_s`)
daje charakterystyczny wygląd: długie proste odcinki przerywane skrętami o 90°, a nie
gęsty zygzak.

**Połamanie steruje rozmiarem korytarza, nie tylko wyglądem.** Korytarz zależy od liczby
linii, które element przecina w poprzek, a nie od jego długości. Wąż o 300 komórkach
zwinięty w ciasną spiralę przecina może 20 kolumn i wchodzi łatwo; ten sam wąż
poprowadzony prosto przecina 100 kolumn i wymaga, by cała plansza nad nim była pusta.
W konfiguratorze te dwa suwaki oddziałują więc na siebie: mocno połamane i długie jest
łatwe do wygenerowania, proste i długie bywa niewykonalne. Interfejs musi pokazywać, co
generator faktycznie osiągnął, a nie tylko, o co go poproszono.

**Długie elementy muszą wchodzić wcześnie.** Element wchodzi tylko wtedy, gdy
wszystkie jego komórki leżą w `S_d`, a `S_d` kurczy się monotonicznie z każdym
wstawieniem. Zdolność planszy do przyjęcia długiego kształtu maleje więc z czasem.
Implementujemy to, **obniżając górną granicę losowanej długości wraz z postępem
wypełnienia** — początkowe wstawienia losują z pełnego rozkładu, końcowe wyłącznie
z koszyka krótkiego.

Procedura wzrostu obsługuje to zresztą łagodnie sama z siebie: gdy zabraknie kandydatów,
akceptujemy element krótszy od zamierzonego. Sterowanie górną granicą tylko zwiększa
szansę, że długie kształty w ogóle powstaną, zamiast być po cichu obcinane.

Konsekwencja, o której trzeba pamiętać przy strojeniu: element rozpięty na wielu liniach
wymaga, by **wszystkie** te linie były nad nim puste, a po wstawieniu obcina im
`depth_d`. Jedna długa linia zjada dużą część pojemności swojego kierunku, więc liczba
bardzo długich elementów jest ograniczona geometrią, nie tylko wagą w rozkładzie.
Generator nie może obiecać `n` długich elementów — może o nie próbować i zaraportować,
ile się udało.

Efekt uboczny jest pożądany: skoro wstawiamy od tyłu, elementy wstawione najwcześniej
są usuwane najpóźniej. Długie linie stają się naturalnym szkieletem łamigłówki —
zablokowanym przez resztę i zdejmowanym na końcu. Ich długie korytarze podnoszą też
metrykę `T_k` (§9), więc są **głównym źródłem trudności percepcyjnej**, a nie detalem
wizualnym.

### Przeciwdziałanie degeneracji

Wstawianie wymaga wolnego korytarza od krawędzi, więc późne elementy lądują blisko
obwodu. Naiwna generacja do nasycenia daje **cebulę**: wierzchnią warstwę drobnych
elementów przy krawędziach, wszystkie wolne, zdejmowaną warstwa po warstwie. Nudne.

Trzy mechanizmy, wszystkie mieszczące się w powyższej procedurze:

1. **Korki — jako osobna faza po generacji, nie jako waga w pętli.** Niech `cover[c]` =
   liczba **aktualnie wolnych** elementów, których korytarz zawiera `c`. Korek to
   element wstawiony celowo w korytarze wolnych elementów: sam jest wolny (`+1`), ale
   unieruchamia `m` przeciętych (`−m`). Bilans `1 − m`: przy `m ≥ 2` liczba wolnych
   ruchów spada, przy `m = 1` powstaje łańcuch wymuszony. Korek to zwykłe ostatnie
   wstawienie, więc gwarancja rozwiązywalności pozostaje nienaruszona.

   Pierwotnie projektowaliśmy to jako wagę `1 + α·cover[c]` przy każdym wstawieniu.
   Przy planszy 100×100 i ~920 elementach o korytarzach po ~150 komórek utrzymywanie
   `cover` na bieżąco to rząd 10⁸ operacji — nie do przyjęcia. Dlatego `cover` liczymy
   **raz, po zakończeniu głównej generacji**, i uruchamiamy pętlę
   `dopóki f0 > cel: wstaw korek maksymalizujący m`, aktualizując `cover` tylko lokalnie
   wokół wstawionego korka. Efekt na trudność jest ten sam, koszt nieporównywalnie
   niższy.
2. **Głębokie groty wcześnie** (`w ∝ depth^β`, β ≈ 1–2 w pierwszej połowie wstawień):
   długie korytarze dają więcej okazji, by ktoś je później przeciął.
3. **Krzyżowanie kierunków.** Równoległe korytarze na sąsiednich liniach się nie
   blokują, prostopadłe — tak. Wymuszamy balans czterech kierunków zamiast czystego
   losowania.
4. **Nie generuj do nasycenia.** Zatrzymujemy się na docelowym wypełnieniu z §9, nigdy
   na `SATURATED`. Warstwa dokładana tuż przed nasyceniem jest najbardziej
   zdegenerowana — to z niej powstaje cebula.

Dodatkowo: **usunięcie dowolnego elementu zachowuje rozwiązywalność** (mniej komórek =
mniej blokad, ta sama kolejność nadal działa), więc gęstość wolno stroić po fakcie
w obie strony.

**Sufit zagęszczenia.** Proces nasyca się, gdy dla każdego kierunku żadna linia nie ma
`depth ≥ 2`; wnętrze zostaje z martwymi dziurami odciętymi ze wszystkich czterech stron.
Roboczy zakres docelowy to **45–70% zajętych komórek**, ale konkretne wartości ustalamy
**benchmarkiem** (§12), a nie założeniem: pierwszym krokiem implementacji generatora
jest test wypisujący osiągane zajęcie dla zestawu parametrów.

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
**percepcyjna**: jak trudno znaleźć wolny element i jak wiele elementów *wygląda* na
wolne, choć nie są. Metryki mierzą właśnie to.

| Metryka | Definicja |
|---|---|
| `f0` | udział elementów wolnych na starcie (ujścia grafu blokowania) |
| `T_k` | elementy zablokowane, których korytarz jest pusty przez pierwsze `k` komórek — blokada leży daleko, poza polem widzenia gracza |
| `T_conc` | elementy zablokowane we własnej wklęsłości (kształty U, S) |
| `D` | głębokość grafu blokowania (najdłuższa ścieżka) |
| `minFree` | minimalna liczba wolnych elementów w trakcie losowych playoutów zachłannych |

`T_k` jest najważniejsza: mierzy liczbę okazji do błędnego kliknięcia, czyli to, co
faktycznie odbiera życia.

Wszystkie metryki są tanie; jedyna stochastyczna to `minFree`. W MVP `minFree` jest
metryką **diagnostyczną** — raportowaną w benchmarku, ale niewchodzącą do progów
akceptacji, bo jej kalibracja wymaga playtestu.

Wstępne progi, **do kalibracji playtestem** (`k = 2`):

Parametrem generatora jest **docelowe wypełnienie**, nie liczba elementów — liczba
elementów wynika z niego i ze średniej długości kształtu, więc obie wartości nie mogą
się rozjechać. Kolumna „~elem." jest orientacyjna, wyliczona jako
`wypełnienie · W · H / średnia długość`.

| Poziom | rozmiar | wypeł. | `Lmax` | wagi kr./śr./dł. | śr. dł. | ~elem. | ~długich | pow. w dł. | `f0` | `T_2` |
|---|---|---|---|---|---|---|---|---|---|---|
| Easy | 25×25 | 45% | 50 | 0.800 / 0.195 / 0.005 | 5.5 | ~51 | ~0 | 3% | ≥ 0.35 | ≤ 1 |
| Medium | 50×50 | 55% | 125 | 0.750 / 0.240 / 0.010 | 6.2 | ~223 | ~2 | 9% | 0.20–0.35 | 2–6 |
| Hard | 75×75 | 62% | 188 | 0.720 / 0.267 / 0.013 | 6.7 | ~519 | ~7 | 13% | 0.08–0.20 | 6–15 |
| Nightmare | 100×100 | 68% | 300 | 0.700 / 0.285 / 0.015 | 7.4 | ~920 | ~14 | 20% | ≤ 0.03 | ≥ 15 |

Kolumna „pow. w dł." to udział wypełnienia zajęty przez koszyk długi — wielkość, którą
konfigurator pokazuje na żywo (§7). Powyżej ~25% plansza przestaje wyglądać jak pole
strzałek i zamienia się w kilka spiral.

Rozkład jest **ciężkoogonowy, a nie przesunięty**: nawet na Nightmare 70% elementów
jest krótkich, bo plansza ma być gęsto usiana grotami. Długie linie to wyrazista
mniejszość — kilkanaście sztuk na planszę — i to one dają wrażenie splątania oraz
podnoszą `T_k`, bo tylko ich korytarza nie da się ogarnąć wzrokiem.

Progi `T_2` i `D` skalują się z liczbą elementów, więc podane wartości są orientacyjne
i wymagają kalibracji benchmarkiem — przy ~920 elementach bezwzględne liczby z małej
planszy nie mają sensu.

Pętla generacji: wygeneruj → policz metryki → jeśli poza pasmem, dołóż korki (obniża
`f0`) albo usuń elementy (podnosi `f0`) → ponów. Budżet prób jest ograniczony; po jego
wyczerpaniu oddajemy najlepszy uzyskany wynik, żeby gra nigdy nie zawiesiła się przy
starcie poziomu.

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
  streak: number         // seria kolejnych bezbłędnych ruchów
  bestStreak: number
  score: number
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

Kliknięcie elementu wolnego usuwa go z planszy, zwiększa `streak` i dolicza punkty; gdy
plansza jest pusta, `status` staje się `won`. Kliknięcie elementu zablokowanego zostawia
go na miejscu, zeruje `streak` i zmniejsza `lives`; przy zerze `status` staje się
`lost`. Reduktor zwraca `effect` — gotowe polecenie dla renderera, z odległością
odbicia włącznie, żeby warstwa wizualna nie musiała niczego wnioskować sama.

Wielokrotne kliknięcie tego samego zablokowanego elementu odejmuje życie za każdym
razem. Decyzja świadoma i pokryta testem.

### Czas i punktacja

**Czas nie jest odczytywany wewnątrz reduktora.** Znacznik `at` wchodzi jako pole akcji,
a `elapsedMs` jest z niego wyliczane. Gdyby reduktor sięgał po zegar sam, przestałby być
czysty, a testy przestałyby być deterministyczne — dlatego istnieje osobna akcja `tick`,
którą warstwa UI wysyła w rytmie odświeżania stopera.

Punktacja premiuje serie bezbłędnych ruchów:

```
mnożnik = min(1 + floor(streak / 10), 5)
punkty za usunięcie elementu = 10 × mnożnik
błędne kliknięcie: streak = 0, mnożnik wraca do 1
```

Mnożnik rośnie co dziesięć czystych ruchów i jest ograniczony piątką, żeby przy ~920
elementach wynik nie eksplodował. Stałe `10`, `10` i `5` są parametrami do strojenia —
formuła jest w jednym miejscu i pokryta testem.

## 11. Renderowanie i UI

`render/renderer.ts` definiuje interfejs (`draw(board)`, `animateExit(piece)`,
`shake(piece)`, `onPieceClick(cb)`); `svgRenderer.ts` go implementuje. Element rysowany
jest jako `<path>` z grubą linią, zaokrąglonymi łączeniami i grotem na końcu.
Trafienie: współrzędne wskaźnika → komórka → `occupancy` → id elementu, więc obsługa
myszy i dotyku jest wspólna.

Grafika MVP jest **placeholderem**: czytelna, monochromatyczna, bez dopracowanej palety
i typografii. Główny ekran to wybór jednego z czterech poziomów. Nad planszą pasek
stanu: trzy serca, stoper, aktualna seria z mnożnikiem i wynik; obok przycisk nowej gry.
Mnożnik jest wyróżniony przy zmianie, bo to jedyny sygnał, że seria coś daje.

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
uzyskane wypełnienie, liczbę elementów i rozkład długości. Jest to konieczne, bo
geometria potrafi odmówić — proste i bardzo długie elementy często nie mieszczą się,
a generator nie może obiecać liczby, której nie da się zrealizować.

### Budżet wydajności

Punkt odniesienia to Nightmare: 10 000 komórek, ~920 elementów, ~920 ścieżek SVG.

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
    kończy się przy nasyceniu i limicie prób, nigdy się nie zapętla.
12. Aktualizacja `depth_d` po wstawieniu: komórka przy krawędzi zeruje `depth` linii,
    komórka w głębi tylko ją obcina.
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
    zapamiętuje maksimum. Mnożnik przeskakuje dokładnie na 10., 20., 30. i 40. ruchu
    serii i zatrzymuje się na 5.
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

**Benchmark (nie test, ale krok implementacji):** raport osiąganego zajęcia planszy
i wartości metryk trudności dla zestawu parametrów — podstawa do kalibracji progów z §9.

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
| Wygenerowane plansze są nudne mimo poprawności (cebula) | Metryki `f0` i `T_k` liczone przy generacji, korki jako mechanizm korekcyjny, pętla generuj-zmierz-odrzuć |
| Progi trudności trafione na oślep | Benchmark przed kalibracją; progi z §9 są jawnie wstępne |
| Generacja zawiesza się przy trudnych parametrach | Twardy limit prób; po jego wyczerpaniu oddajemy najlepszy wynik |
| Długie elementy po cichu nie powstają (wzrost zawsze utyka, plansza wygląda jak sieczka z drobiazgu) | Malejąca górna granica długości wraz z postępem, plus test 9b raportujący faktyczny rozkład długości |
| Jedna długa linia wyczerpuje pojemność swojego kierunku i blokuje dalsze wstawienia | Balans czterech kierunków; górna granica liczby długich elementów na kierunek, kalibrowana benchmarkiem |
| Kilkanaście długich elementów zajmuje większość powierzchni i plansza wygląda jak zbiór spiral zamiast pola strzałek | Udział powierzchni koszyka długiego liczony jawnie (§7), pokazywany w konfiguratorze, ostrzeżenie powyżej 25%, test 23 |
| Generacja 100×100 zamraża interfejs na sekundy | Rdzeń bez DOM jest z założenia przenośny do Web Workera (§4); budżet i wskaźnik postępu w §11 |
| SVG nie wyrabia przy ~920 ścieżkach lub zoom klatkuje | Budżet wydajności §11 mierzony wcześnie; renderer za interfejsem, wymiana na Canvas nie dotyka rdzenia |
| Gracz traci życie, próbując przesunąć planszę | Kliknięcie odróżniane od przeciągnięcia progiem odległości (§11); pokryte testem interakcji |
| Konfigurator obiecuje parametry, których geometria nie dopuszcza | Generator raportuje osiągnięte wartości obok zamówionych (§11); test 21 na parametrach niewykonalnych |
