import { type SpectrumMessage, type SpectrumReply, replyTo } from './spectrum-protocol'

// The project's types are the window's (`DOM`); a worker's scope is typed here, as much as it uses.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SpectrumMessage>) => void) | null
  postMessage(message: SpectrumReply, transfer: Transferable[]): void
}

/** The spectrum worker: answers each request (`replyTo`), handing the bytes or frames back without copying. */
scope.onmessage = (event) => {
  const { reply, transfer } = replyTo(event.data)
  scope.postMessage(reply, transfer)
}
