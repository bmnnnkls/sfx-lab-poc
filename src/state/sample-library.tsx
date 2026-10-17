import { createContext, useContext } from 'react'

/** Importing and auditioning samples. Implemented in `app/`, consumed by `ui/`. */
export interface SampleLibrary {
  importFiles(files: readonly File[]): Promise<void>
  /** Adds a few synthesised one-shots (kick, snare, hat, pluck) so the sampler can be tried instantly. */
  addDemoSamples(): Promise<void>
  preview(sampleId: string): void
  stopPreview(): void
  /**
   * Adds a derived copy of a sample ("name (suffix)") built by `transform` on its decoded mono data:
   * normalize, reverse, trim and similar edits. The original stays untouched; the copy is a normal
   * library sample (undoable with the project).
   */
  deriveSample(sampleId: string, suffix: string, transform: (mono: Float32Array) => Float32Array): Promise<void>
}

const SampleLibraryContext = createContext<SampleLibrary | null>(null)

export const SampleLibraryProvider = SampleLibraryContext.Provider

export const useSampleLibrary = (): SampleLibrary => {
  const library = useContext(SampleLibraryContext)
  if (!library) throw new Error('useSampleLibrary must be used inside SampleLibraryProvider')
  return library
}
