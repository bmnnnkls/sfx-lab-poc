import { type SpectrumAnswer, type SpectrumRequest, answerSpectrum } from './spectrum-protocol'

// The project's types are the window's (`DOM`); a worker's scope is typed here, as much as it uses.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SpectrumRequest>) => void) | null
  postMessage(message: SpectrumAnswer, transfer: Transferable[]): void
}

/** The spectrum worker: answers each request (`answerSpectrum`), handing the bytes back without copying. */
scope.onmessage = (event) => {
  const answer = answerSpectrum(event.data)
  scope.postMessage(answer, answer.bytes.map((bytes) => bytes.buffer as ArrayBuffer))
}
