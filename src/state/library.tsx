import { createContext, useContext } from 'react'
import type { LibraryCatalog, LibraryItem, SnapshotScope, AssetDestination, LibraryBundleSelection, LibraryBundleStage } from '@core'
export interface PersonalLibrary {
  read(): Promise<LibraryCatalog>
  update(edit: (catalog: LibraryCatalog) => LibraryCatalog): Promise<LibraryCatalog>
  saveAsset(scope: SnapshotScope, name: string, folderId: string | null): Promise<LibraryCatalog>
  saveClip(trackId: string, clipId: string, name: string, folderId: string | null): Promise<LibraryCatalog>
  saveSample(sampleId: string, name: string, folderId: string | null): Promise<LibraryCatalog>
  insert(item: LibraryItem, destination: AssetDestination, scene?: number, replaceClip?: boolean): Promise<string>
  preview(item: LibraryItem): Promise<void>
  stageBundle(bytes: Uint8Array): Promise<LibraryBundleStage>
  importBundle(stage: LibraryBundleStage): Promise<LibraryCatalog>
  prepareBundle(selection: LibraryBundleSelection, name: string): Promise<LibraryBundleStage>
  exportBundle(stage: LibraryBundleStage, allowPartial: boolean): Promise<string>
  stopPreview(): void
}
const Context = createContext<PersonalLibrary | null>(null)
export const PersonalLibraryProvider = Context.Provider
export const usePersonalLibrary = () => {
  const library = useContext(Context)
  if (!library) throw new Error('Personal library provider is missing')
  return library
}
