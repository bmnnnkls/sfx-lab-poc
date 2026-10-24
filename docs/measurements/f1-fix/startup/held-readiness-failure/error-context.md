# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: held-notes.audio.spec.ts >> stopped worklet holds notes, sustains, runs note effects and cancels owned generated events
- Location: tests/browser/held-notes.audio.spec.ts:21:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0.05
Received:   0
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - strong [ref=e5]: SFX Lab
    - button "Play" [ref=e6] [cursor=pointer]: ▶
    - button "Stop" [active] [ref=e7] [cursor=pointer]: ■
    - button "Arm Touch automation" [ref=e8] [cursor=pointer]: ● Touch
    - generic [ref=e9]:
      - text: BPM
      - spinbutton "BPM" [ref=e10]: "110"
    - generic [ref=e11]: "1.1"
    - generic "Output level" [ref=e12]
    - button "Undo" [disabled] [ref=e13]: ↶
    - button "Redo" [disabled] [ref=e14]: ↷
    - generic [ref=e15]:
      - textbox "Project name" [ref=e16]: Demo project
      - generic [ref=e17]: Saved
      - group [ref=e18]:
        - generic "File" [ref=e19] [cursor=pointer]
    - button "MIDI" [ref=e20] [cursor=pointer]
    - button "Panic" [ref=e21] [cursor=pointer]
  - main [ref=e22]:
    - generic [ref=e23]:
      - generic [ref=e24]:
        - button "Bass" [ref=e25] [cursor=pointer]
        - slider "Bass volume" [ref=e26]: "0.8"
        - button "Stop Bass" [ref=e27] [cursor=pointer]: ■
        - button "Remove Bass" [ref=e28] [cursor=pointer]: ×
      - generic [ref=e29]:
        - button "Lead" [ref=e30] [cursor=pointer]
        - slider "Lead volume" [ref=e31]: "0.8"
        - button "Stop Lead" [ref=e32] [cursor=pointer]: ■
        - button "Remove Lead" [ref=e33] [cursor=pointer]: ×
      - generic [ref=e34]:
        - button "Pad" [ref=e35] [cursor=pointer]
        - slider "Pad volume" [ref=e36]: "0.8"
        - button "Stop Pad" [ref=e37] [cursor=pointer]: ■
        - button "Remove Pad" [ref=e38] [cursor=pointer]: ×
      - button "Master" [ref=e40] [cursor=pointer]
      - button "Add track" [ref=e41] [cursor=pointer]: +
      - generic [ref=e42]:
        - button "▶ Root" [ref=e43] [cursor=pointer]
        - button "Edit Root" [ref=e44] [cursor=pointer]: ✎
        - button "Delete Root" [ref=e45] [cursor=pointer]: ×
      - generic [ref=e46]:
        - button "▶ Arp" [ref=e47] [cursor=pointer]
        - button "Edit Arp" [ref=e48] [cursor=pointer]: ✎
        - button "Delete Arp" [ref=e49] [cursor=pointer]: ×
      - generic [ref=e50]:
        - button "▶ Cm" [ref=e51] [cursor=pointer]
        - button "Edit Cm" [ref=e52] [cursor=pointer]: ✎
        - button "Delete Cm" [ref=e53] [cursor=pointer]: ×
      - generic [ref=e54]:
        - button "Stop Master automation scene 1" [ref=e55] [cursor=pointer]: ■
        - button "Create Master automation scene 1" [ref=e56] [cursor=pointer]: +
      - button "Launch scene 1" [ref=e57] [cursor=pointer]:
        - generic [ref=e58]: ▶ 1
      - generic [ref=e59]:
        - button "▶ Walk" [ref=e60] [cursor=pointer]
        - button "Edit Walk" [ref=e61] [cursor=pointer]: ✎
        - button "Delete Walk" [ref=e62] [cursor=pointer]: ×
      - button "Create clip" [ref=e64] [cursor=pointer]: +
      - generic [ref=e65]:
        - button "▶ Ab" [ref=e66] [cursor=pointer]
        - button "Edit Ab" [ref=e67] [cursor=pointer]: ✎
        - button "Delete Ab" [ref=e68] [cursor=pointer]: ×
      - generic [ref=e69]:
        - button "Stop Master automation scene 2" [ref=e70] [cursor=pointer]: ■
        - button "Create Master automation scene 2" [ref=e71] [cursor=pointer]: +
      - button "Launch scene 2" [ref=e72] [cursor=pointer]:
        - generic [ref=e73]: ▶ 2
      - button "Create clip" [ref=e75] [cursor=pointer]: +
      - generic [ref=e76]:
        - button "▶ Hook" [ref=e77] [cursor=pointer]
        - button "Edit Hook" [ref=e78] [cursor=pointer]: ✎
        - button "Delete Hook" [ref=e79] [cursor=pointer]: ×
      - button "Create clip" [ref=e81] [cursor=pointer]: +
      - generic [ref=e82]:
        - button "Stop Master automation scene 3" [ref=e83] [cursor=pointer]: ■
        - button "Create Master automation scene 3" [ref=e84] [cursor=pointer]: +
      - button "Launch scene 3" [ref=e85] [cursor=pointer]:
        - generic [ref=e86]: ▶ 3
      - button "Create clip" [ref=e88] [cursor=pointer]: +
      - button "Create clip" [ref=e90] [cursor=pointer]: +
      - button "Create clip" [ref=e92] [cursor=pointer]: +
      - generic [ref=e93]:
        - button "Stop Master automation scene 4" [ref=e94] [cursor=pointer]: ■
        - button "Create Master automation scene 4" [ref=e95] [cursor=pointer]: +
      - button "Launch scene 4" [ref=e96] [cursor=pointer]:
        - generic [ref=e97]: ▶ 4
  - separator "Resize editor" [ref=e98]
  - generic [ref=e100]:
    - navigation [ref=e101]:
      - button "Instrument" [ref=e102] [cursor=pointer]
      - button "Effects" [ref=e103] [cursor=pointer]
      - button "Notes" [ref=e104] [cursor=pointer]
      - button "Clip" [ref=e105] [cursor=pointer]
      - button "Mixer" [ref=e106] [cursor=pointer]
      - button "Samples" [ref=e107] [cursor=pointer]
      - button "Sounds" [ref=e108] [cursor=pointer]
      - button "Library" [ref=e109] [cursor=pointer]
    - generic [ref=e111]:
      - generic [ref=e113]:
        - strong [ref=e114]: Bass
        - generic "Maximum simultaneous notes for this instrument" [ref=e115]:
          - text: Voices
          - combobox "Voices" [ref=e116]:
            - option "1"
            - option "2"
            - option "3"
            - option "4"
            - option "6"
            - option "8" [selected]
            - option "12"
            - option "16"
        - group "View" [ref=e117]:
          - button "Graph" [pressed] [ref=e118] [cursor=pointer]
          - button "Panel" [ref=e119] [cursor=pointer]
        - button "Add" [ref=e120] [cursor=pointer]
        - generic "Show a socket for every parameter, so a wire can drive it (the wire replaces the parameter's value)" [ref=e121]:
          - checkbox "Sockets" [ref=e122]
          - text: Sockets
        - button "Group into module" [disabled] [ref=e123] [cursor=pointer]
        - group "Randomize" [ref=e124]:
          - button "Randomize" [ref=e125] [cursor=pointer]
          - button "Mutate" [ref=e126] [cursor=pointer]
          - combobox "Mutate by" [ref=e127]:
            - option "a touch"
            - option "some" [selected]
            - option "a lot"
          - generic [ref=e128]:
            - text: Seed
            - spinbutton "Seed" [ref=e129]: "7287"
      - generic [ref=e130]:
        - generic [ref=e132]:
          - img:
            - generic "Click to disconnect" [ref=e133] [cursor=pointer]
            - generic "Click to disconnect" [ref=e134] [cursor=pointer]
            - generic:
              - generic "Click to disconnect"
            - generic "Click to disconnect" [ref=e135] [cursor=pointer]
            - generic "Click to disconnect" [ref=e136] [cursor=pointer]
            - generic:
              - generic "Click to disconnect"
            - generic "Click to disconnect" [ref=e137] [cursor=pointer]
          - generic [ref=e138]:
            - generic [ref=e139]:
              - generic [ref=e140]: Note
              - button "Remove Note" [ref=e141] [cursor=pointer]: ×
            - generic [ref=e142]:
              - generic [ref=e143]: Freq
              - generic [ref=e146]: Gate
              - generic [ref=e149]: Vel
          - generic [ref=e152]:
            - generic [ref=e153]:
              - generic [ref=e154]: Oscillator
              - button "Remove Oscillator" [ref=e155] [cursor=pointer]: ×
            - generic [ref=e156]:
              - generic [ref=e157]:
                - generic [ref=e158]: Freq
                - generic [ref=e160]: Out
              - generic [ref=e162]: Pitch
            - img "What this node does with its settings" [ref=e166]
          - generic [ref=e168]:
            - generic [ref=e169]:
              - generic [ref=e170]: Filter
              - button "Remove Filter" [ref=e171] [cursor=pointer]: ×
            - generic [ref=e172]:
              - generic [ref=e173]:
                - generic [ref=e174]: In
                - generic [ref=e176]: Out
              - generic [ref=e178]: Cutoff
            - img "What this node does with its settings" [ref=e182]
          - generic [ref=e184]:
            - generic [ref=e185]:
              - generic [ref=e186]: Envelope
              - button "Remove Envelope" [ref=e187] [cursor=pointer]: ×
            - generic [ref=e189]:
              - generic [ref=e190]: Gate
              - generic [ref=e192]: Out
            - img "What this node does with its settings" [ref=e195]
          - generic [ref=e197]:
            - generic [ref=e198]:
              - generic [ref=e199]: Gain
              - button "Remove Gain" [ref=e200] [cursor=pointer]: ×
            - generic [ref=e201]:
              - generic [ref=e202]:
                - generic [ref=e203]: In
                - generic [ref=e205]: Out
              - generic [ref=e207]: CV
            - img "What this node does with its settings" [ref=e211]
          - generic [ref=e214]:
            - generic [ref=e215]:
              - generic [ref=e216]:
                - text: Delay
                - emphasis [ref=e217]: shared
              - button "Remove Delay" [ref=e218] [cursor=pointer]: ×
            - generic [ref=e220]:
              - generic [ref=e221]: In
              - generic [ref=e223]: Out
            - img "What this node does with its settings" [ref=e226]
          - generic [ref=e227]:
            - generic [ref=e228]:
              - generic [ref=e229]:
                - text: Output
                - emphasis [ref=e230]: shared
              - button "Remove Output" [ref=e231] [cursor=pointer]: ×
            - generic [ref=e232]: In
        - complementary "Properties" [ref=e236]:
          - paragraph [ref=e237]: Select a node to see and change its settings.
```

# Test source

```ts
  1  | import { createDefaultFxGraph, createDefaultNoteGraph, noteGraphFrom, type EngineCommand, type Patch } from '../../src/core'
  2  | import { test, expect } from './fixtures'
  3  | import { installAudioTap, listen } from './audio-tap'
  4  | 
  5  | const patch: Patch = {
  6  |   nodes: [
  7  |     { id: 'note', type: 'note', x: 0, y: 0, params: {} },
  8  |     { id: 'osc', type: 'oscillator', x: 0, y: 0, params: { waveform: 0 } },
  9  |     { id: 'gain', type: 'gain', x: 0, y: 0, params: { gain: 0.2 } },
  10 |     { id: 'out', type: 'output', x: 0, y: 0, params: {} },
  11 |   ],
  12 |   connections: [
  13 |     { id: 'pitch', from: { node: 'note', port: 'frequency' }, to: { node: 'osc', port: 'frequency' } },
  14 |     { id: 'gate', from: { node: 'note', port: 'gate' }, to: { node: 'gain', port: 'cv' } },
  15 |     { id: 'sound', from: { node: 'osc', port: 'out' }, to: { node: 'gain', port: 'in' } },
  16 |     { id: 'out', from: { node: 'gain', port: 'out' }, to: { node: 'out', port: 'in' } },
  17 |   ],
  18 | }
  19 | 
  20 | // Portable simulated input at the real worklet's public, serializable command boundary. No browser MIDI API.
  21 | test('stopped worklet holds notes, sustains, runs note effects and cancels owned generated events', async ({ page }) => {
  22 |   await installAudioTap(page)
  23 |   await page.goto('/?starter')
  24 |   await page.getByRole('button', { name: 'Play', exact: true }).click()
  25 |   await page.getByRole('button', { name: 'Stop', exact: true }).click()
  26 |   await page.waitForFunction(() => !!window.__sendEngineCommand)
  27 |   const send = async (commands: EngineCommand[]) => page.evaluate((commands) => {
  28 |     for (const command of commands) window.__sendEngineCommand(command)
  29 |   }, commands)
  30 |   await send([{ type: 'track/add', kind: 'instrument', trackId: 'held', patch, noteGraph: createDefaultNoteGraph(), fx: createDefaultFxGraph(), clips: [], volume: 1, voices: 8 }])
  31 |   const a = { sourceId: 'keyboard', channel: 0, noteId: 'a' }
  32 |   const b = { sourceId: 'other', channel: 0, noteId: 'a' }
  33 |   await send([
  34 |     { type: 'track/noteOn', trackId: 'held', note: a, pitch: 60, velocity: 1 },
  35 |     { type: 'track/noteOn', trackId: 'held', note: b, pitch: 60, velocity: 1 },
  36 |   ])
  37 |   await page.waitForTimeout(1000) // Discard starter release tails; held input must outlast the 0.3-second audition.
> 38 |   expect(Math.max(...(await listen(page)).peak)).toBeGreaterThan(0.05)
     |                                                  ^ Error: expect(received).toBeGreaterThan(expected)
  39 |   await send([
  40 |     { type: 'notes/sustain', sourceId: 'keyboard', channel: 0, down: true },
  41 |     { type: 'track/noteOff', trackId: 'held', note: a },
  42 |     { type: 'track/noteOff', trackId: 'held', note: b },
  43 |   ])
  44 |   await page.waitForTimeout(300)
  45 |   expect(Math.max(...(await listen(page)).peak)).toBeGreaterThan(0.05)
  46 |   await send([{ type: 'notes/releaseSource', sourceId: 'keyboard' }])
  47 |   await page.waitForTimeout(300)
  48 |   expect(Math.max(...(await listen(page)).peak)).toBeLessThan(0.0001)
  49 | 
  50 |   const graph = noteGraphFrom([
  51 |     { id: 'c', type: 'clipNotes' },
  52 |     { id: 't', type: 'transpose', params: { semitones: 12 } },
  53 |     { id: 'a', type: 'arpeggiator' },
  54 |     { id: 'e', type: 'echo' },
  55 |     { id: 'o', type: 'noteOut' },
  56 |   ], ['c.out>t.in', 't.out>a.in', 'a.out>e.in', 'e.out>o.in'])
  57 |   await send([
  58 |     { type: 'track/setNoteGraph', trackId: 'held', graph },
  59 |     { type: 'track/noteOn', trackId: 'held', note: { ...a, noteId: 'chord-c' }, pitch: 60, velocity: 1 },
  60 |     { type: 'track/noteOn', trackId: 'held', note: { ...a, noteId: 'chord-e' }, pitch: 64, velocity: 1 },
  61 |   ])
  62 |   expect(Math.max(...(await listen(page)).peak)).toBeGreaterThan(0.05)
  63 |   await send([{ type: 'notes/panic' }])
  64 |   await page.waitForTimeout(300)
  65 |   expect(Math.max(...(await listen(page)).peak)).toBeLessThan(0.0001)
  66 |   await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  67 | })
  68 | 
```