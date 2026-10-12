import type { BounceOptions } from '@core'
import { createContext, useContext } from 'react'

/** File-level operations on the whole project. Implemented in `app/`, consumed by `ui/`. */
export interface ProjectFiles {
  exportProject(): Promise<void>
  importProject(): Promise<void>
  newProject(): void
  loadDemo(): void
  /** Replaces the project with one of the shipped examples (`exampleProjects`) and says how to start. */
  loadExample(id: string): void
  /** Swaps back to the project most recently replaced by import / new / demo / restore. */
  restorePrevious(): void
  /**
   * Renders the open project offline to a stereo WAV and downloads it, named after the project. `onProgress` gets 0..1 as it goes (the
   * work is cut into slices so the page stays usable); aborting `signal` stops it. Resolves when the file is saved, or the render
   * was cancelled or failed (the user is told either way).
   */
  exportAudio(options: BounceOptions, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<void>
}

const ProjectFilesContext = createContext<ProjectFiles | null>(null)

export const ProjectFilesProvider = ProjectFilesContext.Provider

export const useProjectFiles = (): ProjectFiles => {
  const files = useContext(ProjectFilesContext)
  if (!files) throw new Error('useProjectFiles must be used inside ProjectFilesProvider')
  return files
}
