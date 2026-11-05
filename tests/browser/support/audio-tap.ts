import type { EngineCommand } from '../../../src/core'
import type { Page } from '@playwright/test'

interface AudioWindow {
  frames: number
  peak: number[]
  diffPeak: number
}

declare global {
  interface Window {
    __sendEngineCommand(command: EngineCommand): void
    __audioTap: { reset(): void; read(): AudioWindow }
  }
}

/** Derived from docs/browser-checks/audio-tap.mjs: compare channels in the same sample window. */
export const installAudioTap = (page: Page) => page.addInitScript(() => {
  const Original = window.AudioWorkletNode
  window.AudioWorkletNode = class extends Original {
    constructor(context: BaseAudioContext, name: string, options?: AudioWorkletNodeOptions) {
      super(context, name, options)
      // Raw fixture commands bypass AudioHost's startup queue. Expose them only after its queued
      // play/stop commands have drained and the first real quantum has reported, rather than at construction.
      this.port.addEventListener('message', ({ data }) => {
        if (data.kind === 'status' && context.state === 'running') {
          window.__sendEngineCommand = (command) => this.port.postMessage({ kind: 'command', command })
        }
      })
      this.port.start()
      const tap = context.createScriptProcessor(1024, 2, 1)
      tap.channelCount = 2
      tap.channelCountMode = 'explicit'
      const mute = context.createGain()
      mute.gain.value = 0
      this.connect(tap)
      tap.connect(mute)
      mute.connect(context.destination)
      let frames = 0
      let peak = [0, 0]
      let diffPeak = 0
      tap.onaudioprocess = ({ inputBuffer }) => {
        const left = inputBuffer.getChannelData(0)
        const right = inputBuffer.getChannelData(1)
        for (let i = 0; i < left.length; i++) {
          peak[0] = Math.max(peak[0]!, Math.abs(left[i]!))
          peak[1] = Math.max(peak[1]!, Math.abs(right[i]!))
          diffPeak = Math.max(diffPeak, Math.abs(left[i]! - right[i]!))
        }
        frames += left.length
      }
      window.__audioTap = {
        reset: () => { frames = 0; peak = [0, 0]; diffPeak = 0 },
        read: () => ({ frames, peak: [...peak], diffPeak }),
      }
    }
  }
})

/** A full bar at 120 BPM plus margin, so short silent gaps cannot pass as mute. */
export const listen = async (page: Page): Promise<AudioWindow> => {
  await page.waitForFunction(() => !!window.__audioTap)
  await page.evaluate(() => window.__audioTap.reset())
  await page.waitForTimeout(2600)
  const heard = await page.evaluate(() => window.__audioTap.read())
  if (heard.frames === 0) throw new Error('Audio tap received no frames; silence cannot prove mute')
  return heard
}
