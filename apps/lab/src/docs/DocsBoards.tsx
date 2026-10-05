import {
  createContext,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createDocsQueue, type DocsQueue } from './docsQueue'

interface DocsBoardsValue {
  readonly queue: DocsQueue
  /** The box that scrolls, which `useNear` measures against; the viewport when null. */
  readonly root: RefObject<HTMLElement | null> | null
}

const DocsBoardsContext = createContext<DocsBoardsValue | null>(null)

const makeWorker = () => new Worker(new URL('../worker/generate.worker.ts', import.meta.url), { type: 'module' })

/**
 * The Docs pages' boards: one queue and its worker for as long as the Docs
 * tab is open, terminated when it closes. `queue` is a seam for the tests.
 */
export function DocsBoardsProvider({
  root,
  queue,
  children,
}: {
  root: RefObject<HTMLElement | null> | null
  queue?: DocsQueue
  children: ReactNode
}): ReactElement {
  const [own] = useState(() => queue ?? createDocsQueue(makeWorker))
  useEffect(() => () => own.dispose(), [own])
  const value = useMemo(() => ({ queue: own, root }), [own, root])
  return <DocsBoardsContext value={value}>{children}</DocsBoardsContext>
}

export function useDocsBoards(): DocsBoardsValue {
  const value = useContext(DocsBoardsContext)
  if (value === null) throw new Error('a docs board needs a DocsBoardsProvider above it')
  return value
}
