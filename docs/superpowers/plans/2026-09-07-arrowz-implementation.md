# Arrowz — mapa wdrożenia

> **Dla wykonawców agentowych:** WYMAGANA PODUMIEJĘTNOŚĆ: użyj
> `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`, żeby wykonać plany slice po slicie.
> Kroki mają składnię checkboxów (`- [ ]`) do odhaczania.

**Cel:** Doprowadzić Arrowz od repozytorium zawierającego wyłącznie specyfikację
i wyrzucalny prototyp do grywalnej gry PWA w Angular 22, z opcjonalną
synchronizacją profilu i wyników przez Firebase.

**Architektura:** Rdzeń (`core/`, `game/`) to czysty TypeScript bez DOM, bez
frameworka i bez globalnej losowości — testowany w Node i przenośny do Web
Workera. Warstwa widoku (`render/`) stoi za interfejsem, żeby wymiana SVG na
Canvas nie dotykała rdzenia. Powłoka (`ui/`) to Angular 22 w trybie zoneless,
budowany jako statyczny prerender. Firebase (`data/`) jest warstwą **nakładaną
na gotową grę**, nigdy warunkiem jej uruchomienia.

**Stack:** TypeScript 5.9+ (strict), Angular 22 (standalone, zoneless, signals,
signal forms), Vitest (domyślny runner Angular CLI), SVG, `@angular/pwa`,
Firebase (Auth, Firestore, Functions v2, Hosting, App Check).

**Spec:** `docs/superpowers/specs/2026-09-07-arrowz-design.md`

**Decyzje podjęte przed planem** (potwierdzone z użytkownikiem 2026-09-07):

| Pytanie | Rozstrzygnięcie |
|---|---|
| SSR? | **Nie.** Statyczny prerender (`outputMode: "static"`), trasa gry `RenderMode.Client`. Deploy to pliki statyczne, PWA offline bez kombinowania. |
| Hosting | **Cloudflare Workers** ze Static Assets. Worker nie ma logiki serwerowej — serwuje wyłącznie zbudowane pliki. |
| Zakres Firebase w MVP | **Ostatni slice.** Slice'y 0–9 dają grę w pełni grywalną offline, z wynikami w `localStorage`. Slice 10 nakłada konto i synchronizację. |
| Podział ról Cloudflare / Firebase | Worker = hosting statyczny. Firebase = Auth, Firestore i Cloud Function `verifyRun`, wołane wprost z klienta. |
| Integracja Firebase | **Modularny SDK** (`firebase/app`, `firebase/auth`, `firebase/firestore`) opakowany we własne serwisy sygnałowe. Bez `@angular/fire`. |

---

## Global Constraints

Poniższe obowiązuje **w każdym zadaniu każdego slice'a**. Nie powtarzamy tego
w treści zadań.

- **Izolacja rdzenia.** Pliki w `src/core/` i `src/game/` nie importują niczego
  z `src/render/`, `src/ui/`, `src/data/` ani z `@angular/*`. Nie dotykają
  `document`, `window`, `Math.random()` ani `Date.now()`. Egzekwowane regułą
  ESLint `no-restricted-imports` (Slice 0, Zadanie 4).
- **Determinizm.** Jedyne źródło losowości to `mulberry32(seed)` przekazywany
  jawnie. To samo ziarno musi dawać bitowo tę samą planszę.
- **TypeScript strict.** `strict: true`, `noUncheckedIndexedAccess: true`,
  zero `any` w `core/` i `game/`.
- **Minimalna długość elementu: 2 komórki.** Pokrycie planszy: **dokładnie
  100%** — każda komórka należy do dokładnie jednego elementu.
- **`occupancy` to `Int32Array`**, wartość `-1` oznacza komórkę pustą.
  `Int8Array` przepełniłby się przy ~2 300 elementach Nightmare.
- **Kierunki:** `0 = góra, 1 = prawo, 2 = dół, 3 = lewo`. Wektory:
  `[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]`. `cells[0]` to komórka z grotem,
  `dir` to kierunek z `cells[1]` do `cells[0]`. Ciało leży **za** grotem.
- **Parametry generatora domyślne** (zmierzone, §7 spec): wagi koszyków długości
  `0.50 / 0.20 / 0.30`, siła Warnsdorffa `4`, `pStraight = 0.6`,
  `wLateral = 3`, `Lmax = round(2.5 · max(W, H))`, budżet nawrotów `3000`,
  budżet restartów `5`.
- **Parametry rysowania** (zweryfikowane wzrokowo, §11 spec): jedna
  `<polyline>` przez środki komórek, grubość `0.5` podziałki (zakres
  konfiguratora `0.35–0.65`), `stroke-linecap` i `stroke-linejoin` = `round`,
  grot jako wypełniony trójkąt ~`0.6` podziałki, kolory `#232447` na `#f6f6fa`.
  Monochromatyczność jest **wymogiem rozgrywki**, nie oszczędnością.
- **Trzy życia.** Punkty wyłącznie za ukończoną planszę; przegrana = 0.
- **Commity:** po każdym zadaniu, komunikat po polsku w trybie rozkazującym,
  zgodnie z historią repozytorium (`Dodaj…`, `Wprowadź…`, `Popraw…`).
  Bez wzmianek o narzędziach AI i bez linii atrybucji.
- **Język:** kod i identyfikatory po angielsku, komentarze i dokumentacja po
  polsku — jak w istniejącym repozytorium.

---

## Uzupełnienia specyfikacji przyjęte w tym planie

Trzy miejsca, w których plan **świadomie wykracza poza** specyfikację. Każde ma
uzasadnienie i test.

### 1. Punktacja: mnożniki ważone różnorodnością planszy

Formuła z §10 specyfikacji, zaimplementowana wprost, **oblewa własny test 26e**.
Policzone na planszy 100×100 złożonej z samych pionowych domin:

| Metryka | Domina 100×100 | Nightmare 100×100 |
|---|---|---|
| `f0` | 0.020 | 0.059 |
| `almost1 / N` | ~0.98 | 0.07 |
| `D` | 49 | 32 |
| **wynik wg §10** | **~764** | **~274** |

Plansza zdegenerowana wygrywa, bo wszystkie trzy metryki „trudności" wychodzą na
niej **lepiej** niż na prawdziwej planszy. Przyczyna jest pojęciowa: `almost1`
mierzy pokusę do błędu przy założeniu, że gracz nie widzi wzoru. Na planszy
domin wzór jest oczywisty („bierz najwyższe"), więc pokusa jest pozorna.

**Poprawka:** mnożniki `f0`, `almost1` i `D` są ważone współczynnikiem
`variety ∈ [0,1]`, liczonym z entropii rozkładu kierunków i rozkładu długości.
Plansza jednorodna ma `variety = 0` i traci wszystkie trzy mnożniki. Wymaga to
dwóch nowych pól w `BoardMetrics`: `dirEntropy` i `lenEntropy`.
Szczegóły i kalibracja: **Slice 5, Zadanie 3**.

### 2. Rejestr ruchów w sesji

`Session` niesie `moves: number[]` — kolejne kliknięte `pieceId`. Specyfikacja
tego nie wymaga, ale bez tego Cloud Function ze Slice'a 10 nie ma czego
odtwarzać, a wynik zapisany na serwerze jest niewery­fikowalny. Koszt: jedna
tablica liczb. Zysk poboczny: undo (§13) staje się trywialne.

### 3. `Board` jest niemutowalny

`removePiece` zwraca **nowy** `Board` z kopią `occupancy`, zamiast mutować
istniejący. Kopia 20 000 komórek to 80 kB i ~10 µs — bez znaczenia przy jednym
kliknięciu, a reduktor pozostaje czysty bez wyjątków i zastrzeżeń.

---

## Slice'y

Każdy slice ma własny plik planu i kończy się **działającym, testowalnym
przyrostem**. Kolejność jest zależnością, nie preferencją: slice N zakłada
odebrany slice N−1.

| # | Slice | Plik | Co daje na koniec |
|---|---|---|---|
| 0 | Szkielet aplikacji | [slice-00-szkielet.md](2026-09-07-arrowz/slice-00-szkielet.md) | `ng test` i `ng build` przechodzą, struktura katalogów i bariera architektoniczna działają |
| 1 | Rdzeń geometrii | [slice-01-rdzen-geometrii.md](2026-09-07-arrowz/slice-01-rdzen-geometrii.md) | `probeMove` i `removePiece` z kompletem testów §12.1–8, 24, 25 |
| 2 | Generator | [slice-02-generator.md](2026-09-07-arrowz/slice-02-generator.md) | `generate(params)` domyka planszę w 100% na wszystkich rozmiarach |
| 3 | Solver i metryki | [slice-03-solver-metryki.md](2026-09-07-arrowz/slice-03-solver-metryki.md) | Każda plansza weryfikowana niezależnie; testy własnościowe na setkach ziaren |
| 4 | Benchmark i presety | [slice-04-benchmark-presety.md](2026-09-07-arrowz/slice-04-benchmark-presety.md) | Raport z pomiarów, presety Easy–Nightmare w obu formatach, progi akceptacji |
| 5 | Sesja i punktacja | [slice-05-sesja-punktacja.md](2026-09-07-arrowz/slice-05-sesja-punktacja.md) | Kompletna gra jako czysty reduktor — grywalna z poziomu testu |
| 6 | Renderer i widok | [slice-06-renderer-viewport.md](2026-09-07-arrowz/slice-06-renderer-viewport.md) | Plansza rysuje się w SVG, zoom i przesuwanie działają, budżet wydajności zmierzony |
| 7 | Powłoka Angular | [slice-07-powloka-angular.md](2026-09-07-arrowz/slice-07-powloka-angular.md) | **Pierwsza grywalna wersja**: ekran startowy, HUD, ekrany końcowe, sterowanie |
| 8 | Konfigurator | [slice-08-konfigurator.md](2026-09-07-arrowz/slice-08-konfigurator.md) | Tryb zaawansowany na signal forms, z ostrzeżeniem o 25% i raportem z generacji |
| 9 | PWA, wyniki lokalne i deploy | [slice-09-pwa-i-deploy.md](2026-09-07-arrowz/slice-09-pwa-i-deploy.md) | Gra działa offline, wyniki przeżywają zamknięcie karty, deploy na Cloudflare Workers |
| 10 | Firebase | [slice-10-firebase.md](2026-09-07-arrowz/slice-10-firebase.md) | Konto (anonimowe → trwałe), synchronizacja, wynik weryfikowany serwerowo z ziarna |

### Ścieżka krytyczna

```
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 → 10
                          ↘ 8 ↗
```

Slice 8 (konfigurator) zależy od 7, ale nie blokuje 9 — można je wykonać
równolegle, jeśli plan wykonuje więcej niż jedna osoba lub agent.

### Kamienie milowe

- **Po slice 4:** rdzeń jest zmierzony i skalibrowany. Wszystkie liczby z §9
  specyfikacji są albo potwierdzone, albo zastąpione zmierzonymi.
- **Po slice 7:** gra jest grywalna. Wszystko dalej to warstwy nakładane.
- **Po slice 9:** MVP kompletne w rozumieniu §1 specyfikacji.

### Czego ten plan świadomie nie robi

Zgodnie z §13 specyfikacji poza zakresem zostają: undo, podpowiedzi, progresja
poziomów, tabele wyników, dźwięk, dopracowana warstwa wizualna i animacje ponad
minimum. `prototype/` nie jest rozwijany ani portowany — implementacja startuje
od zera, a prototyp zostaje jako punkt odniesienia dla pomiarów.
