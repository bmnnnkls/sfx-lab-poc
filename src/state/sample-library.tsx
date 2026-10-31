import type { PreviewRange, SampleEdit } from '@core'
import { createContext, useContext } from 'react'

/** Importing and auditioning samples. Implemented in `app/`, consumed by `ui/`. */
export interface SampleLibrary {
  importFiles(files: readonly File[]): Promise<void>
  /** Adds a few synthesised one-shots (kick, snare, hat, pluck) so the sampler can be tried instantly. */
  addDemoSamples(): Promise<void>
  /** Auditions a sample: the whole of it, or frames `from` up to `to`, once or looping. */
  preview(sampleId: string, range?: PreviewRange): void
  stopPreview(): void
  /**
   * Applies `edit` to a sample. In place (`asCopy: false`), the result is a new file and every use of the sample moves
   * onto it in one undo step; with `asCopy`, it is a new library sample, "name (suffix)", and the original stays as it
   * was. One edit runs at a time (`useWaveAudioStore.editing`). Everything that edits a sample calls this, never the
   * steps inside it.
   */
  editSample(sampleId: string, edit: SampleEdit, options: SampleEditOptions): Promise<void>
  /**
   * *Revert to original*: every use of an edited sample points at its first version again, in one undo step, with clips'
   * trims, markers, regions and the loop moved back to where they were in it (`revertRemap`). It runs as an edit does
   * (one at a time) and refuses, with a toast, when the original's bytes are gone.
   */
  revertSample(sampleId: string): Promise<void>
}

/** How an edit lands: in place, or as a new library sample (the editor's *Edits make copies*). */
export interface SampleEditOptions {
  readonly asCopy: boolean
}

const SampleLibraryContext = createContext<SampleLibrary | null>(null)

export const SampleLibraryProvider = SampleLibraryContext.Provider

export const useSampleLibrary = (): SampleLibrary => {
  const library = useContext(SampleLibraryContext)
  if (!library) throw new Error('useSampleLibrary must be used inside SampleLibraryProvider')
  return library
}
