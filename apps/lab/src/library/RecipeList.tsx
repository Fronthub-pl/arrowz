import type { BoardMeta } from '@arrowz/engine'
import { boardId } from '@arrowz/engine/command'
import { genSeconds } from '@arrowz/engine/report'
import { type ReactElement, useId } from 'react'
import { useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import { CommandFigure } from '../run/CommandFigure'
import type { RunControl } from '../run/useRun'
import { loadIntoLab } from './loadIntoLab'

/**
 * Every recipe of a stored layout, when it has more than one: with one, the
 * column's own command is that recipe. Numbered, because a layout's recipes
 * usually share a seed. The latest is the one the meta's top-level fields copy.
 */
export function RecipeList({ meta, control }: { meta: BoardMeta; control: RunControl }): ReactElement | null {
  const dict = useDictionary()
  const navigate = useNavigate()
  const titleId = useId()
  if (meta.sources.length < 2) return null
  const latest = boardId(meta.params)
  return (
    <section className="fw-recipes" aria-labelledby={titleId}>
      <p id={titleId} className="caps">
        {dict.t('recipesTitle', meta.sources.length)}
      </p>
      <ol>
        {meta.sources.map((recipe, at) => {
          const n = at + 1
          const head = [
            dict.t('recipeName', n),
            boardId(recipe.params) === latest ? dict.t('recipeLatest') : '',
            recipe.aborted ? dict.t('recipeStopped') : '',
          ]
          const date = recipe.updatedAt ? new Date(recipe.updatedAt).toLocaleString(dict.locale) : ''
          const facts = [
            `${dict.t('factSeed')} ${recipe.params.seed}`,
            recipe.source,
            date,
            `${genSeconds(recipe, '—', dict)} s`,
          ]
          return (
            <li key={recipe.id} className="fw-recipe">
              <p className="fw-rhead">{head.filter((part) => part !== '').join(' · ')}</p>
              <p className="fw-rfacts">{facts.filter((part) => part !== '').join(' · ')}</p>
              <CommandFigure
                label={dict.t('recipeCommand', n)}
                caption={dict.t('recipeCaption')}
                command={recipe.command}
              />
              <div className="fw-alt">
                <button
                  type="button"
                  aria-label={dict.t('recipeLoad', n)}
                  onClick={() => loadIntoLab(recipe, control, (path) => void navigate(path), meta.id)}
                >
                  {dict.t('loadIntoLab')}
                </button>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
