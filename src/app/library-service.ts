import type { PersonalLibrary } from '@state'
import type { LibraryStorage, SampleStorage } from '@storage'

/** Load catalog workflows only when the Library is opened; cancellation also covers the pending module load. */
export const createDeferredPersonalLibrary = (storage: LibraryStorage, samples: SampleStorage): PersonalLibrary => {
  let service: PersonalLibrary | undefined, pending: Promise<PersonalLibrary> | undefined, generation = 0
  const load = () => pending ??= import('./library').then(module => service = module.createPersonalLibrary(storage, samples))
  return {
    read: async () => (await load()).read(),
    update: async edit => (await load()).update(edit),
    saveAsset: async (...args) => (await load()).saveAsset(...args),
    saveClip: async (...args) => (await load()).saveClip(...args),
    saveSample: async (...args) => (await load()).saveSample(...args),
    savePreset: async (...args) => (await load()).savePreset(...args),
    addPresetToSound: async (presetId) => (await load()).addPresetToSound(presetId),
    stageBundle: async bytes => (await load()).stageBundle(bytes),
    importBundle: async stage => (await load()).importBundle(stage),
    prepareBundle: async (...args) => (await load()).prepareBundle(...args),
    exportBundle: async (...args) => (await load()).exportBundle(...args),
    insert: async (...args) => (await load()).insert(...args),
    preview: async (item, onStop, from) => {
      const token = ++generation, ready = await load()
      if (token === generation) return ready.preview(item, onStop, from)
      onStop?.()
      return 'cancelled'
    },
    stopPreview: () => { generation++; service?.stopPreview() },
  }
}
