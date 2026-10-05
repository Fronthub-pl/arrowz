# \<arrowz-board>

Widok planszy Arrowz jako komponent webowy. Rysuje planszę, obsługuje powiększanie i przesuwanie, animuje dwa efekty reduktora gry i zgłasza kliknięcia w strzałki. Działa w czystym HTML, w Reakcie, Angularze, Svelte i Vue.

> Długie objaśnienia — powiększanie i przesuwanie, siatka kropek, jazda po torze, rozgrywka — są w pliku README pakietu.

## Jak użyć {#example}

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

## Właściwości {#props}

::table{of="element-props"}

## Metody i gettery {#members}

::table{of="element-members"}

## Zdarzenia {#events}

::table{of="element-events"}

## Sloty {#slots}

Dziecko z `slot` ustawionym na jedną z tych nazw zastępuje domyślną zawartość; pusty slot ją zachowuje. `data-board-action` na dziecku — `zoom-in`, `zoom-out`, `fit`, `colors` albo `gestures` — sprawia, że kliknięcie robi to samo co ten przycisk.

::table{of="element-slots"}
