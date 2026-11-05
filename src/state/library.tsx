import { createContext, useContext } from 'react'
import type { FactoryLibrary, LibraryCatalog, LibraryItem, SnapshotScope, AssetDestination, LibraryBundleSelection, LibraryBundleStage } from '@core'
export interface PersonalLibrary {
  read(): Promise<LibraryCatalog>
  update(edit: (catalog: LibraryCatalog) => LibraryCatalog): Promise<LibraryCatalog>
  saveAsset(scope: SnapshotScope, name: string, folderId: string | null): Promise<LibraryCatalog>
  saveClip(trackId: string, clipId: string, name: string, folderId: string | null): Promise<LibraryCatalog>
  saveSample(sampleId: string, name: string, folderId: string | null): Promise<LibraryCatalog>
  /** A project preset on its own: a new sound from the preset's own revision, holding only that preset. */
  savePreset(presetId: string, folderId: string | null): Promise<LibraryCatalog>
  /** A project preset of a linked sound, added as a new preset of the library sound it came from (`presetToLibrary`). */
  addPresetToSound(presetId: string): Promise<LibraryCatalog>
  /**
   * Copies an item into the project. `from` is a catalog to read the item from instead of storage: a throwaway capture
   * of a graph of the project (*Copy to new track*, a graph dropped on another owner), or Factory's.
   */
  insert(item: LibraryItem, destination: AssetDestination, scene?: number, replaceClip?: boolean, from?: LibraryCatalog): Promise<string>
  /**
   * Plays an item in an isolated engine, read from storage or from `from`; `onStop` is called once it stops, by ending
   * or by `stopPreview`.
   */
  preview(item: LibraryItem, onStop?: () => void, from?: LibraryCatalog): Promise<'started' | 'cancelled'>
  stageBundle(bytes: Uint8Array): Promise<LibraryBundleStage>
  importBundle(stage: LibraryBundleStage): Promise<LibraryCatalog>
  /** Stages an export for review. `extra`: another catalog the selection may reach into (the Factory's), read beside storage's. */
  prepareBundle(selection: LibraryBundleSelection, name: string, extra?: LibraryCatalog): Promise<LibraryBundleStage>
  exportBundle(stage: LibraryBundleStage, allowPartial: boolean): Promise<string>
  stopPreview(): void
  /** The read-only Factory: its code loads on the first call, and its catalog is built then. */
  factory(): Promise<FactoryLibrary>
}
const Context = createContext<PersonalLibrary | null>(null)
export const PersonalLibraryProvider = Context.Provider
export const usePersonalLibrary = () => {
  const library = useContext(Context)
  if (!library) throw new Error('Personal library provider is missing')
  return library
}
