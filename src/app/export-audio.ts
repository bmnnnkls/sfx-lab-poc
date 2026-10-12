import { decodeAudio } from '@audio'
import { Bounce, type BounceOptions, type Project, type SampleData, encodeBounce, usedSampleIds } from '@core'
import { type SampleStorage, downloadFile, fileStem } from '@storage'

/** How long to render before giving the page back to the browser: well under a frame, so the dialog stays responsive. */
const SLICE_MS = 12

const nextTask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

export interface AudioExportResult {
  readonly fileName: string
  readonly seconds: number
  /** Names of samples the project plays whose audio this browser does not have; they are silent in the file. */
  readonly missing: readonly string[]
}

/**
 * Renders the project with the core bounce and saves it as a WAV. The work is the core's (`Bounce`); this only fetches and decodes
 * the samples the project plays (the live engine holds its copies in the audio thread), runs the steps in slices with a pause between,
 * and hands the bytes to the browser. Resolves with null if `signal` aborted.
 */
export const exportAudioFile = async (
  project: Project,
  sampleStorage: SampleStorage,
  options: BounceOptions,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<AudioExportResult | null> => {
  const samples: SampleData[] = []
  const missing: string[] = []
  for (const id of usedSampleIds(project)) {
    const bytes = await sampleStorage.get(id)
    if (!bytes) {
      missing.push(project.samples.find((sample) => sample.id === id)?.name ?? id)
      continue
    }
    const decoded = await decodeAudio(bytes)
    samples.push({ id, sampleRate: decoded.sampleRate, data: decoded.mono })
    if (signal?.aborted) return null
  }

  const bounce = new Bounce(project, samples, options)
  while (!bounce.done) {
    const sliceEnd = performance.now() + SLICE_MS
    while (!bounce.done && performance.now() < sliceEnd) bounce.step()
    onProgress(bounce.progress)
    await nextTask()
    if (signal?.aborted) return null
  }

  const result = bounce.result()
  const fileName = `${fileStem(project.name)}.wav`
  downloadFile(fileName, 'audio/wav', encodeBounce(result))
  return { fileName, seconds: result.left.length / result.sampleRate, missing }
}
