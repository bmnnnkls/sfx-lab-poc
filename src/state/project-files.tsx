import { createContext, useContext } from 'react'

/** File-level operations on the whole project. Implemented in `app/`, consumed by `ui/`. */
export interface ProjectFiles {
  exportProject(): void
  importProject(): Promise<void>
  newProject(): void
  loadDemo(): void
  /** Swaps back to the project most recently replaced by import / new / demo / restore. */
  restorePrevious(): void
}

const ProjectFilesContext = createContext<ProjectFiles | null>(null)

export const ProjectFilesProvider = ProjectFilesContext.Provider

export const useProjectFiles = (): ProjectFiles => {
  const files = useContext(ProjectFilesContext)
  if (!files) throw new Error('useProjectFiles must be used inside ProjectFilesProvider')
  return files
}
