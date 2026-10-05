# Laboratorium

W laboratorium powstają plansze. Wybierasz ustawienia, laboratorium generuje planszę, a Ty widzisz naraz trzy rzeczy: planszę, jej pomiary i polecenie, które zrobi tę samą planszę jeszcze raz. Ma trzy karty, **Laboratorium**, **Zapisane plansze** i **Dokumentacja**, a każdy ekran ma własny adres, więc działają przycisk Wstecz i zakładki przeglądarki.

## Magazyn plansz {#store}

Zapisane plansze trzyma magazyn plansz: mały program, który przechowuje je na dysku, w katalogu, do którego pisze wiersz poleceń. Plansza zapisana w laboratorium jest dostępna dla wiersza poleceń, a plansza zrobiona w wierszu poleceń pojawia się w **Zapisanych planszach**.

Magazyn startuje razem z laboratorium. Jeśli **Zapisane plansze** są puste albo zapis zostaje odrzucony, magazyn nie działa: uruchom go obok laboratorium poleceniem `deno task store`. Cała reszta laboratorium działa bez niego.

## Prosty i zaawansowany {#views}

Widok **Prosty** to ten, w którym laboratorium się otwiera: rozmiar planszy, dwa suwaki (długość strzałek i krętość), przełącznik szkieletu i ziarno. To te same wybory, które daje zwykły wiersz poleceń. Pod nimi są ustawienia podglądu: grubość linii, rozmiar grotu, kolory i motyw.

Widok **Zaawansowany** pokazuje każde ustawienie generatora, w grupach, każde z pomocą, i listę presetów od Łatwy 25×25 do Obłęd 1000×1000. Przełącznik między widokami jest na górnym pasku, obok języka.

W obu widokach laboratorium pokazuje dokładne polecenie, które robi planszę z ekranu, gotowe do skopiowania. Polecenie zostaje na ekranie nawet wtedy, gdy ustawienia są odrzucone, więc nadal można je skopiować.

## Gdy ustawienie łamie regułę {#rules}

Każde ustawienie ma bezpieczny zakres, a o niektórych połączeniach wiadomo, że generator na nich utyka. Ustawienie spoza zakresu albo takie połączenie barwi swoje wiersze na czerwono i pokazuje obok powód. Jego grupa jest oznaczona na liście, a każda złamana reguła jest wypisana na dole ekranu. Laboratorium nie generuje, dopóki tego nie poprawisz.

Zakresy i reguły między ustawieniami są wypisane na [stronie wiersza poleceń](docs:cli#knobs).

## Generowanie i zapisywanie {#generating}

**Generuj** (`G`) robi planszę z ustawień na ekranie. **Nowe ziarno** losuje ziarno i generuje; `[` i `]` zamiast tego przesuwają ziarno o jeden w tył albo naprzód. **Domyślne** przywraca każde ustawienie i generuje. **Przerwij** zatrzymuje generowanie i zostawia planszę ułożoną do tej pory.

Plansza nie trafia do magazynu, dopóki nie użyjesz **Zapisz planszę** (`⌘S`) albo **Generuj i zapisz** (`⌘G`). Z włączonym przełącznikiem _zapisuj każdą planszę_ każde zakończone generowanie jest zapisywane.

W widoku zaawansowanym _generuj od razu po zmianie_ uruchamia generowanie przy każdej zmianie ustawienia, a **Sprawdź ziarna** uruchamia bieżące ustawienia na wielu ziarnach i podaje, ile plansz wyszło pełnych.

**Pobierz SVG** i **Pobierz plik planszy** eksportują planszę z ekranu.

## Raport {#report}

Szuflada raportu po prawej (`R`) wypisuje pomiary: strzałki i ich długości, jak trudno gra się na planszy, jak daleko sięgają strzałki i jaki mają kształt. Przy każdym jest `?`, który go objaśnia, a każda zmiana ma kolor względem poprzedniej planszy.

Szuflada ustawień po lewej pojawia się i znika pod `S`. `F` chowa obie i oddaje planszy cały panel laboratorium.

## Zapisane plansze i pliki {#saved}

**Zapisane plansze** pokazują magazyn według rozmiaru. Zapisana plansza pokazuje swoje polecenie, ziarno i czas generowania. **Wczytaj do laboratorium** przywraca jej ustawienia, a **Usuń z dysku** ją kasuje.

**Otwórz plik…** otwiera `.board.json` z dysku, razem z plikiem meta, jeśli wybierzesz oba. Laboratorium pokazuje tę planszę, nie zapisując jej.

## Plansza {#board}

Pod planszą **Widok** służy do oglądania: przeciągnij, żeby przesunąć, a powiększaj przyciskami albo kółkiem. **Inspekcja** opisuje wskazaną strzałkę. **Gra** rozgrywa planszę według [jej jednej reguły](docs:arrowz#rule): wolna strzałka odjeżdża, zablokowana się odbija.

## Klawisze {#keys}

Pojedyncze klawisze działają na kartach **Laboratorium** i **Zapisane plansze**, ale nie podczas pisania w polu. Klawisze, które uruchamiają laboratorium, wciśnięte na Zapisanych planszach najpierw je przywołują. Na Windowsie i Linuksie `⌘` to Ctrl.

::table{of="keys"}

## Paleta poleceń {#palette}

`⌘K` otwiera wyszukiwanie wśród wszystkiego, co potrafi laboratorium. Jej wiersze są w sekcjach: _generowanie_ i _przejdź do_, wypisane niżej, a potem wiersz dla każdego ustawienia generatora, każdego ustawienia podglądu i każdego presetu. Wpisanie nazwy ustawienia albo jego flagi z wiersza poleceń (`--seed`) przenosi do niego. Wiersz, którego teraz nie da się uruchomić, zostaje na liście, z powodem w miejscu klawisza.

::table{of="palette"}

## Linki {#links}

Adres laboratorium niesie jego ustawienia, więc link otwiera tę samą planszę i ją generuje. Po `#` jest JSON, zakodowany procentowo: każde ustawienie generatora pod nazwą z silnika na najwyższym poziomie (`W`, `H`, `seed`, `wShort`…), a podgląd pod `__view`:

```json
{ "W": 40, "H": 40, "seed": 7, "__view": { "colored": true, "lang": "pl" } }
```

Pominięte pole przyjmuje wartość domyślną, a wartość, której laboratorium nie umie odczytać, jest pomijana.

::table{of="link-fields"}
