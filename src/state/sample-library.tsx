import type { SampleEdit } from '@core'
import { createContext, useContext } from 'react'

/** Importing and auditioning samples. Implemented in `app/`, consumed by `ui/`. */
export interface SampleLibrary {
  importFiles(files: readonly File[]): Promise<void>
  /** Adds a few synthesised one-shots (kick, snare, hat, pluck) so the sampler can be tried instantly. */
  addDemoSamples(): Promise<void>
  preview(sampleId: string): void
  stopPreview(): void
  /**
   * Applies `edit` to a sample. With `asCopy` (the only way in 11a) the result is a new library sample, "name (suffix)",
   * and the original stays untouched; the copy is a normal library sample (undoable with the project). Everything that
   * edits a sample calls this, never the steps inside it.
   */
  editSample(sampleId: string, edit: SampleEdit, options: SampleEditOptions): Promise<void>
}

/** How an edit lands. 11b adds editing in place (`asCopy: false`) behind the same call. */
export interface SampleEditOptions {
  readonly asCopy: true
}

const SampleLibraryContext = createContext<SampleLibrary | null>(null)

export const SampleLibraryProvider = SampleLibraryContext.Provider

export const useSampleLibrary = (): SampleLibrary => {
  const library = useContext(SampleLibraryContext)
  if (!library) throw new Error('useSampleLibrary must be used inside SampleLibraryProvider')
  return library
}
