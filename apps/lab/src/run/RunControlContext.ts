import { createContext } from 'react'
import type { RunControl } from './useRun'

/** The lab's run, for what renders outside the workspace and still starts one: the Docs boards' Open in lab. */
export const RunControlContext = createContext<RunControl | null>(null)
