# SFX Lab (POC)

A browser-based music and sound-design sandbox: an Ableton-style **session view** (clip launcher and piano roll) and
**arrangement**, on top of a Max-style **patcher** (node graph) for building instruments, effects and note
processors, in a dockable VS Code-style workbench. Everything runs client-side on the Web Audio API, with a custom DSP
engine inside an `AudioWorklet`.

This is an experimental proof of concept. Dense projects can exceed the audio callback budget, muting a track doesn't
suspend its DSP, and physical MIDI hardware and browsers other than desktop Chromium are not qualified. Where things
stand is in [docs/STATUS.md](docs/STATUS.md).

## Run it

```bash
npm ci        # Node 22.12+
npm run dev   # http://localhost:5173, opens on the Low Light example; click a scene to start audio
npm test      # unit and architecture tests
```

Browser tests, profiling and everything else for developers: [docs/dev/setup.md](docs/dev/setup.md).

`main` deploys to GitHub Pages on every push, after the checks pass
([setup](docs/dev/setup.md#deploying-to-github-pages)). Use a Chromium-based browser or Firefox. Audio starts on
your first click (browser autoplay policy).

## Two examples to play with

A first visit opens on **Low Light**, and **File → Examples** loads either example, or the plain three-track *Starter*:

* **Low Light**: minimal tech house, 125 BPM, eight scenes. There are no samples: the kick is an impulse ringing a
  resonant filter, and the bass, stab, arp, drone and echo **duck under the real sound of the kick** (a sidechain made
  of nodes). Every track has a **Panel** to play while it runs. The master's panel is a DJ filter with a **Cut**
  button.
* **Glass Rain**: self-composing ambient, 92 BPM, six scenes. Nobody typed the melodies: a Perlin wander, a clock and
  a die pick notes of a scale. Drag the XY pads, or press **Randomize** on Bells or Drops to compose something else.

[The examples guide](docs/guide/examples.md) shows what is in them and what to try. [The tour](docs/guide/tour.md)
walks through the whole app.

## Documentation

| | |
|---|---|
| [docs/README.md](docs/README.md) | Map of all the docs |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it is built, one subsystem per file |
| [docs/STATUS.md](docs/STATUS.md) | Where the project stands, and what's next |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Open work |
| [docs/dev/common-changes.md](docs/dev/common-changes.md) | Recipes: add a node, a command, a view, a project field |
