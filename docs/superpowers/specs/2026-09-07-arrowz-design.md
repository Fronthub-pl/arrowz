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
- cztery poziomy trudności (Easy / Medium / Hard / Nightmare),
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
Długość waha się od 2 komórek do kilkudziesięciu — najdłuższe elementy przecinają
niemal całą planszę na wskroś. Rozkład długości jest **ciężkoogonowy**: dominują
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
- W przeciwnym razie ruch jest nielegalny: element **zostaje na miejscu**, a gracz
  traci życie.

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
żadna technologia nie ma przewagi w hit-testingu, a SVG daje darmowe animacje CSS
przy wyjeżdżaniu elementu. Renderer jest jednak za interfejsem, więc wymiana na Canvas
nie dotyka rdzenia.

## 4. Architektura

```
src/
  core/            czysta logika: zero DOM, zero globalnej losowości
    types.ts         Coord, Dir, Piece, Board, Difficulty
    rng.ts           deterministyczny PRNG z ziarnem
    board.ts         siatka zajętości, sweptRegion(), isFree(), removePiece()
    shapes.ts        losowanie kształtu przez wzrost wstecz w obszarze dopuszczalnym
    generator.ts     generacja wsteczna, korki, parametry trudności
    solver.ts        graf blokowania + sortowanie topologiczne (Kahn)
    metrics.ts       metryki trudności liczone na wygenerowanej planszy
  game/
    session.ts       czysty reduktor stanu gry: życia, status, obsługa kliknięcia
  render/
    renderer.ts      interfejs renderera
    svgRenderer.ts   implementacja SVG + mapowanie kliknięcia na id elementu
  ui/
    app.ts           powłoka: wybór trudności, serca, ekrany końcowe
  main.ts            spięcie
```

Zasada nadrzędna: `core/` i `game/` nie importują niczego z `render/` ani `ui/` i nie
dotykają DOM. Dzięki temu cała logika i generator uruchamiają się w Node.

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
Nightmare może mieć więcej niż 127 elementów.

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

```
isFree(board, piece):
  dla każdej linii L dotkniętej przez piece:
    c = komórka piece na L najdalsza od krawędzi wyjścia
    przejdź od c do krawędzi w kierunku piece.dir:
      jeśli occupancy(komórka) ∉ {-1, piece.id} → false
  return true
```

Koszt: `O(liczba linii × długość planszy)`, czyli kilkadziesiąt kroków. Wystarczająco.

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
`Lmax = round(κ · max(W, H))`, gdzie `κ` rośnie z trudnością (1.0–1.5); element może
być dłuższy niż bok planszy, bo się wije. Długość losujemy z **rozkładu mieszanego**
o trzech koszykach, których wagi są parametrem trudności:

| Koszyk | Długość | Rola |
|---|---|---|
| krótkie | 2–6 | wypełniacz, domyka gęstość |
| średnie | 7–15 | typowe zawijasy, główna masa planszy |
| długie | 16–`Lmax` | szkielet planszy, przecinają ją na wskroś |

Bias prostoliniowy `p_s ≈ 0.75` daje charakterystyczny wygląd: długie proste odcinki
przerywane skrętami o 90°, a nie gęsty zygzak.

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

1. **Korki.** Utrzymuj `cover[c]` = liczba **aktualnie wolnych** elementów, których
   korytarz zawiera `c`. Waga `1 + α·cover[c]` kieruje nowe elementy w korytarze
   wolnych elementów. Nowy element jest wolny (`+1`), ale unieruchamia `m` przeciętych
   (`−m`). Bilans `1 − m`: przy `m ≥ 2` liczba wolnych ruchów spada, przy `m = 1`
   powstaje łańcuch wymuszony. Jest to zwykłe ostatnie wstawienie, więc gwarancja
   rozwiązywalności pozostaje nienaruszona. Daje to pętlę post-processingu:
   `dopóki f0 > cel: wstaw korek maksymalizujący m`.
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

| Poziom | rozmiar | wypeł. | `Lmax` | wagi kr./śr./dł. | śr. dł. | ~elem. | ~długich | `f0` | `T_2` | `D` |
|---|---|---|---|---|---|---|---|---|---|---|
| Easy | 10×12 | 45% | 12 | 0.85 / 0.15 / 0 | 5.0 | ~11 | 0 | ≥ 0.35 | ≤ 1 | ≤ 3 |
| Medium | 14×18 | 55% | 20 | 0.78 / 0.19 / 0.03 | 5.8 | ~24 | ~1 | 0.20–0.35 | 2–4 | 3–5 |
| Hard | 18×24 | 62% | 31 | 0.74 / 0.21 / 0.05 | 6.4 | ~42 | ~2 | 0.08–0.20 | 4–8 | 5–8 |
| Nightmare | 26×36 | 68% | 54 | 0.70 / 0.22 / 0.08 | 8.0 | ~79 | ~6 | `F0 ≤ 3` | ≥ 8, w tym `T_conc ≥ 2` | ≥ 8 |

Rozkład jest **ciężkoogonowy, a nie przesunięty**: nawet na Nightmare 70% elementów
jest krótkich, bo plansza ma być gęsto usiana grotami. Długie linie to wyrazista
mniejszość — kilka sztuk na planszę — i to one dają wrażenie splątania.

Pętla generacji: wygeneruj → policz metryki → jeśli poza pasmem, dołóż korki (obniża
`f0`) albo usuń elementy (podnosi `f0`) → ponów. Budżet prób jest ograniczony; po jego
wyczerpaniu oddajemy najlepszy uzyskany wynik, żeby gra nigdy nie zawiesiła się przy
starcie poziomu.

## 10. Pętla gry

`game/session.ts` to **czysty reduktor**, bez DOM i bez efektów ubocznych:

```ts
type Status = 'playing' | 'won' | 'lost'
type Session = { board: Board; lives: number; status: Status; removed: number }
type Action = { type: 'click'; pieceId: number } | { type: 'restart'; seed: number }

reduce(session: Session, action: Action): { next: Session; effect: Effect }
```

Kliknięcie elementu wolnego usuwa go z planszy; gdy plansza jest pusta, `status` staje
się `won`. Kliknięcie elementu zablokowanego zostawia go na miejscu i zmniejsza `lives`;
przy zerze `status` staje się `lost`. Reduktor zwraca też `effect` — sygnał dla
renderera („wyjedź w kierunku d" albo „potrząśnij"), żeby warstwa wizualna nie musiała
sama wnioskować, co się stało.

Wielokrotne kliknięcie tego samego zablokowanego elementu odejmuje życie za każdym
razem. Decyzja świadoma i pokryta testem.

## 11. Renderowanie i UI

`render/renderer.ts` definiuje interfejs (`draw(board)`, `animateExit(piece)`,
`shake(piece)`, `onPieceClick(cb)`); `svgRenderer.ts` go implementuje. Element rysowany
jest jako `<path>` z grubą linią, zaokrąglonymi łączeniami i grotem na końcu.
Trafienie: współrzędne wskaźnika → komórka → `occupancy` → id elementu, więc obsługa
myszy i dotyku jest wspólna.

Grafika MVP jest **placeholderem**: czytelna, monochromatyczna, bez dopracowanej palety
i typografii. UI to pasek z sercami, wybór trudności i przycisk nowej gry.

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
18. **Test różnicowy:** funkcja `isFree` z silnika gry i test przynależności do `S_d`
    z generatora muszą zgadzać się co do bitu na losowych stanach. Rozjazd między nimi
    to dokładnie ten błąd, który produkuje nierozwiązywalne plansze.
19. Solver wykrywa ręcznie skonstruowane cykle (dwuelementowy `A → ← B` oraz trzy- i
    więcej-elementowy) i wskazuje elementy cyklu.

**Benchmark (nie test, ale krok implementacji):** raport osiąganego zajęcia planszy
i wartości metryk trudności dla zestawu parametrów — podstawa do kalibracji progów z §9.

Reduktor sesji jest testowany osobno: legalne i nielegalne kliknięcie, utrata żyć,
przejścia do `won` i `lost`.

## 13. Poza zakresem MVP

**Świadomie odłożone funkcje:** undo (wymaga historii ruchów — tanie, jeśli reduktor
jest czysty od początku, i taki jest), podpowiedzi, progresja poziomów, zapis postępu,
dźwięk, dopracowana warstwa wizualna i animacje.

**Udokumentowana ścieżka optymalizacji**, do włączenia dopiero gdy benchmark pokaże
problem — przy planszy Hard (18×24, ~54 elementy) zwykłe pętle wykonują się
w mikrosekundach, więc na starcie byłaby to przedwczesna optymalizacja:

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
