/** Check suspended-context MessagePort delivery before choosing the startup handshake. */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
try {
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:4173')
  const result = await page.evaluate(async () => {
    const context = new AudioContext()
    await context.suspend()
    const source = `class Probe extends AudioWorkletProcessor {
      constructor(){super();this.calls=0;this.port.onmessage=({data})=>this.port.postMessage({reply:data,calls:this.calls,time:currentTime});this.port.postMessage({constructed:true,time:currentTime})}
      process(){this.calls++;return true}
    };registerProcessor('startup-probe',Probe)`
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    await context.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    const node = new AudioWorkletNode(context, 'startup-probe')
    const messages: unknown[] = []
    node.port.onmessage = ({ data }) => messages.push(data)
    const observations = []
    for (const step of ['suspended', 'running-unconnected', 'running-connected']) {
      if (step === 'running-unconnected') await context.resume()
      if (step === 'running-connected') node.connect(context.destination)
      node.port.postMessage(step)
      await new Promise(resolve => setTimeout(resolve, 500))
      observations.push({ step, state: context.state, currentTime: context.currentTime, messages: [...messages] })
    }
    node.disconnect(); await context.close()
    return { rate: context.sampleRate, observations }
  })
  const output = { browser: browser.version(), ...result }
  writeFileSync(process.argv[2] ?? '/private/tmp/sfx-startup-probe.json', JSON.stringify(output, null, 2) + '\n')
  console.log(JSON.stringify(output, null, 2))
} finally { await browser.close() }
