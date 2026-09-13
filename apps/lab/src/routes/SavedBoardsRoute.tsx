import { useDictionary } from '../i18n'

export function SavedBoardsRoute() {
  const dict = useDictionary()
  return (
    <main>
      <section
        id="boards-panel"
        role="tabpanel"
        aria-labelledby="tab-boards-panel"
        aria-label={dict.t('tabLibrary')}
        tabIndex={0}
      >
        <h2>{dict.t('tabLibrary')}</h2>
        {/* PR 5 fills this: list, size chips, detail, load into lab, delete. */}
      </section>
    </main>
  )
}
