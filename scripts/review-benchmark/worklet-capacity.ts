/** Opt-in production-bundle trace. Run with the TS loader, against a built preview on :4173. */
import { chromium } from '@playwright/test'
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import os from 'node:os'
import { engineNoteGraph, noteGraphFrom } from '../../src/core/patch/index.ts'
import { execFileSync } from 'node:child_process'
import { exampleProjects } from '../../src/core/examples/index.ts'
import { serializeProject } from '../../src/core/persistence/index.ts'

const seconds = Number(process.env.CAPACITY_SECONDS ?? 60)
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 1800) throw Error('Capture duration must be 1–1800 seconds')
const initialLoad = os.loadavg()
const harnessSHA256 = createHash('sha256').update(readFileSync(import.meta.filename)).digest('hex')
const activity = process.env.CAPACITY_ACTIVITY ?? 'interactive'
const diagnostics = process.env.CAPACITY_DIAGNOSTICS === '1'
// Diagnostic A/B only: avoid changing the actual Engine instance shape with an own render hook.
const prototypeHook = process.env.CAPACITY_PROTOTYPE_HOOK === '1'
if (!['interactive', 'steady', 'arrangement'].includes(activity)) throw Error('Unknown activity mode')
const scenario = process.env.CAPACITY_SCENARIO ?? 'low-notes'
const output = process.env.CAPACITY_OUTPUT ?? 'docs/measurements/f1-fix/worklet'
mkdirSync(output, { recursive: true })
let project = exampleProjects[scenario.startsWith('glass') ? 1 : 0]!.create()
if (scenario.includes('notes')) {
  const track = project.tracks.find(t => t.id === 'stab')!
  if (track.kind !== 'instrument') throw Error('missing stab')
  const continuous = scenario.includes('continuous')
  const outputNode = track.noteGraph.nodes.find(node => node.type === 'noteOut')!
  const velocity = noteGraphFrom([{ id: 'capacity_velocity', type: 'velocity' }], []).nodes[0]!
  const noteGraph = !continuous ? track.noteGraph : { ...track.noteGraph, nodes: [...track.noteGraph.nodes, velocity], connections: [
    ...track.noteGraph.connections.map(wire => wire.to.node === outputNode.id ? { ...wire, to: { node: velocity.id, port: 'in' } } : wire),
    { id: 'capacity_velocity_out', from: { node: velocity.id, port: 'out' }, to: { node: outputNode.id, port: 'in' } },
  ] }
  const target = { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: track.id }, domain: 'notes' as const, path: [], nodeId: continuous ? velocity.id : 'ng_key', nodeType: continuous ? 'velocity' : 'scaleLock', paramId: continuous ? 'scale' : 'root' }
  project = { ...project, tracks: project.tracks.map(t => t !== track ? t : { ...track, noteGraph, clips: track.clips.map(c => c && ({ ...c, automation: [{ id: 'capacity', enabled: true, target, points: continuous ? Array.from({ length: 5 }, (_,i)=>({ id: `p${i}`, beat: c.lengthBeats * i / 4, value: i % 2 ? 0 : .5, interpolation: 'linear' as const })) : [{ id: 'a', beat: 0, value: 9 / 11, interpolation: 'linear' as const }, ...(scenario.includes('moving') ? [{ id: 'b', beat: 4, value: 0, interpolation: 'linear' as const }] : [])] }] })) }) }
}
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const bundlePath = 'dist/assets/' + readdirSync('dist/assets').find(n => /^engine-processor.*\.js$/.test(n))!
const originalBundle = readFileSync(bundlePath, 'utf8')
try {
  const page = await browser.newPage()
  const bundles: Record<string, string> = {}
  // The probe is confined to this capture. Original production bytes are hashed before injection.
  {
    const body = originalBundle
    bundles[bundlePath] = createHash('sha256').update(body).digest('hex')
    const shim = `const nativeRegister=globalThis.registerProcessor;
      globalThis.registerProcessor=(name,Processor)=>nativeRegister(name,class extends Processor {
        constructor(...args){super(...args);this.frames=0;this.firstState=null;this.quanta=new Set();this.nonfinite=0;this.peak=0;this.jump=0;this.previous=[0,0];
          this.port.postMessage({kind:'capacity-probe',rate:sampleRate,performance:typeof performance,preparation:typeof this.prepare==='function'});
          if(${diagnostics}){const status=this.engine.status.bind(this.engine);this.engine.status=()=>{console.timeStamp('F1:status:start');const result=status();console.timeStamp('F1:status:end');return result}} 
          if(typeof this.prepare==='function'){const prepare=this.prepare.bind(this);this.prepare=()=>{const before={audioTime:currentTime,noteBeat:this.engine.noteBeat,transportBeat:this.engine.transport.positionBeats,renderedFrames:this.frames};console.timeStamp('F1:prepare:start');prepare();console.timeStamp('F1:prepare:end');this.port.postMessage({kind:'capacity-prepared',before,after:{audioTime:currentTime,noteBeat:this.engine.noteBeat,transportBeat:this.engine.transport.positionBeats,renderedFrames:this.frames},prepared:this.prepared})}}
          this.port.addEventListener('message',({data})=>{if(data.kind==='capacity-report')this.port.postMessage({kind:'capacity-report',firstState:this.firstState,frames:this.frames,quanta:[...this.quanta],nonfinite:this.nonfinite,peak:this.peak,jump:this.jump,rate:sampleRate})});this.port.start();
          const render=this.engine.render.bind(this.engine);const measuredRender=(l,r)=>{if(!this.firstState){this.firstState={tracks:this.engine.tracks.size,playing:this.engine.transport.playing,automation:this.engine.automation.configured};
              if(${diagnostics}){const wrap=(object,key,label)=>{const fn=object[key].bind(object);object[key]=(...args)=>{if(this.frames)return fn(...args);console.timeStamp('F1:detail:'+label+':start');const value=fn(...args);console.timeStamp('F1:detail:'+label+':end');return value}};
                for(const key of ['collectEvents','planNoteComponents','mixSegment','processMaster','mixTracks','scheduleTracks'])wrap(this.engine,key,key);
                for(const [id,track] of this.engine.tracks)for(const key of ['schedule','mixInto'])wrap(track,key,id+':'+key);
              }}console.timeStamp('F1:engine:start');render(l,r);console.timeStamp('F1:engine:end');this.frames+=l.length;this.quanta.add(l.length);
            for(let channel=0;channel<2;channel++){const signal=channel?r:l;for(let i=0;i<signal.length;i++){const value=signal[i];if(!Number.isFinite(value))this.nonfinite++;this.peak=Math.max(this.peak,Math.abs(value));this.jump=Math.max(this.jump,Math.abs(value-this.previous[channel]));this.previous[channel]=value}}};
          if(${prototypeHook}){const actual=this.engine;const prototype=Object.getPrototypeOf(actual);const original=prototype.render;prototype.render=function(l,r){return this===actual?measuredRender(l,r):original.call(this,l,r)}}else this.engine.render=measuredRender;
          if(${diagnostics}){const apply=this.engine.apply.bind(this.engine);this.engine.apply=(command)=>{console.timeStamp('F1:command:'+command.type);apply(command)}}
          for(let i=0;i<1000;i++){console.timeStamp('F1:overhead:start');console.timeStamp('F1:overhead:end')}
        }
        process(i,o){console.timeStamp('F1:callback:start');const result=super.process(i,o);console.timeStamp('F1:callback:end');return result}
      });\n`
    writeFileSync(bundlePath, shim + body)
  }
  await page.addInitScript(saved => {
    localStorage.setItem('sfxlab:project', saved)
    const Native = AudioWorkletNode
    ;(window as any).__capacity = { statuses: 0, clockAnchors: 0, probes: [], report: null, latestStatus: null, preparation: [], readyAfterNodeMs: null, firstStatusAfterNodeMs: null }
    window.AudioWorkletNode = class extends Native {
      constructor(c: BaseAudioContext, n: string, o?: AudioWorkletNodeOptions) {
        super(c, n, o)
        const createdAt = performance.now()
        ;(window as any).__capacityReport = () => this.port.postMessage({ kind: 'capacity-report' })
        ;(window as any).__capacityCommand = (command: unknown) => this.port.postMessage({ kind: 'command', command })
        this.port.addEventListener('message', ({ data }) => {
          if (data.kind === 'status') { (window as any).__capacity.firstStatusAfterNodeMs ??= performance.now() - createdAt; (window as any).__capacity.statuses++; (window as any).__capacity.latestStatus = data.status }
          if (data.kind === 'clock') (window as any).__capacity.clockAnchors++
          if (data.kind === 'ready') (window as any).__capacity.readyAfterNodeMs = performance.now() - createdAt
          if (data.kind === 'capacity-prepared') (window as any).__capacity.preparation.push(data)
          if (data.kind === 'capacity-report') (window as any).__capacity.report = data
          if (data.kind === 'capacity-probe') (window as any).__capacity.probes.push(data)
        })
        this.port.start()
      }
    }
  }, serializeProject(project))
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink.console,disabled-by-default-audio' + (diagnostics ? ',v8,disabled-by-default-v8.compile' : ''), transferMode: 'ReturnAsStream' })
  await page.goto('http://127.0.0.1:4173')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(() => (window as any).__capacity.probes.length > 0, undefined, { timeout: 10000 })
  await page.evaluate(scene => (window as any).__capacityCommand({ type: 'scene/launch', scene }), activity === 'arrangement' ? 0 : scenario.startsWith('glass') ? 4 : 6)
  const editedTrack = project.tracks.find(t => t.kind === 'instrument')!
  if (editedTrack.kind !== 'instrument') throw Error('missing instrument')
  const graphEdit = { type: 'track/setNoteGraph', trackId: editedTrack.id, graph: engineNoteGraph(editedTrack.noteGraph, project.modules) }
  // Status traffic stays active. Exercise launches/stops, tempo, scalar edits and graph updates.
  const sceneCount = project.tracks.reduce((n,t) => Math.max(n,t.kind === 'return' ? 0 : t.clips.length),0)
  const sceneBeats = Array.from({ length: sceneCount }, (_, scene) => Math.max(4, ...project.tracks.map(t => t.kind === 'return' ? 0 : t.clips[scene]?.lengthBeats ?? 0)))
  const scenes: { scene: number; requestedBeat: number; minimumPatternBeats: number }[] = [{ scene: activity === 'arrangement' ? 0 : scenario.startsWith('glass') ? 4 : 6, requestedBeat: 0, minimumPatternBeats: sceneBeats[activity === 'arrangement' ? 0 : scenario.startsWith('glass') ? 4 : 6]! }]
  const start = Date.now()
  let nextSceneBeat = sceneBeats[0]! + 4, scene = 0, edits = 0, lastEdit = start, tails = false
  while (Date.now() - start < seconds * 1000) {
    await page.waitForTimeout(Math.max(0, Math.min(activity === 'arrangement' ? 1000 : 5000, seconds * 1000 - (Date.now() - start))))
    if (activity === 'steady') continue
    if (activity === 'arrangement') {
      const beat = await page.evaluate(() => (window as any).__capacity.latestStatus?.beat ?? 0)
      if (!tails && seconds >= 90 && Date.now() - start >= (seconds - 10) * 1000) {
        await page.evaluate(scene => (window as any).__capacityCommand({ type: 'scene/launch', scene }), sceneCount)
        tails = true
        scenes.push({ scene: sceneCount, requestedBeat: beat, minimumPatternBeats: 0 })
      } else if (!tails && beat >= nextSceneBeat) {
        scene = (scene + 1) % sceneCount
        await page.evaluate(scene => (window as any).__capacityCommand({ type: 'scene/launch', scene }), scene)
        scenes.push({ scene, requestedBeat: beat, minimumPatternBeats: sceneBeats[scene]! })
        nextSceneBeat = Math.ceil(beat / 4) * 4 + Math.ceil(sceneBeats[scene]! / 4) * 4 + 4
      }
      if (Date.now() - lastEdit < 5000) continue
      lastEdit = Date.now()
      await page.evaluate(({ graphEdit, index }) => {
        const send = (window as any).__capacityCommand
        send(graphEdit); send({ type: 'master/setVolume', volume: .8 + (index % 2) * .1 })
      }, { graphEdit, index: edits++ })
      continue
    }
    await page.evaluate(({ index, graphEdit, sceneCount }) => {
      const send = (window as any).__capacityCommand
      send({ type: 'transport/setTempo', bpm: [120, 240, 40][index % 3] })
      send({ type: 'master/setVolume', volume: 0.8 + (index % 2) * 0.1 })
      send(graphEdit)
      if (index % 3 === 1) send({ type: 'track/stop', trackId: graphEdit.trackId })
      if (index % 3 === 2) send({ type: 'scene/launch', scene: Math.floor(index / 3) % sceneCount })
    }, { index: edits++, graphEdit, sceneCount: sceneCount })
  }
  await page.evaluate(() => (window as any).__capacityReport())
  await page.waitForFunction(() => (window as any).__capacity.report !== null, undefined, { timeout: 10000 })
  const traffic = await page.evaluate(() => (window as any).__capacity)
  if (!traffic.report?.frames || !traffic.report.quanta.length) throw Error('Empty worklet capture')
  const complete = new Promise<any>(resolve => cdp.once('Tracing.tracingComplete', resolve))
  await cdp.send('Tracing.end')
  const { stream, dataLossOccurred } = await complete
  let trace = ''
  for (;;) { const part = await cdp.send('IO.read', { handle: stream }); trace += part.data; if (part.eof) break }
  await cdp.send('IO.close', { handle: stream })
  writeFileSync(`${output}/trace.json.gz`, gzipSync(trace))
  const events = JSON.parse(trace).traceEvents
  const durations = (label: string) => {
    const starts = new Map<string, number>()
    const intervals: { start: number; end: number; ms: number; pid: number; tid: number }[] = []
    for (const e of events) {
      const message = e.args?.data?.message
      const key = `${e.pid}:${e.tid}`
      if (message === `F1:${label}:start`) starts.set(key, e.ts)
      if (message === `F1:${label}:end` && starts.has(key)) {
        const start = starts.get(key)!
        intervals.push({ start, end: e.ts, ms: (e.ts - start) / 1000, pid: e.pid, tid: e.tid }); starts.delete(key)
      }
    }
    const budget = Math.min(...traffic.report.quanta) / traffic.report.rate * 1000
    const summary = (values: number[]) => {
      values.sort((a,b)=>a-b)
      return { count: values.length, p50: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)], p99: values[Math.floor(values.length * .99)], max: values.at(-1), overQuantum: values.filter(v=>v>budget).length }
    }
    const first = intervals[0]?.start ?? 0
    const overruns = intervals.filter(i => i.ms > budget).map(i => ({
      relativeSeconds: (i.start - first) / 1e6, ms: i.ms,
      overlappingGC: events.filter((e: any) => e.pid === i.pid && e.tid === i.tid && ['MinorGC', 'MajorGC'].includes(e.name) && e.ts < i.end && e.ts + (e.dur ?? 0) > i.start).map((e: any) => ({ name: e.name, ms: e.dur / 1000 })),
    }))
    return { ...summary(intervals.map(i=>i.ms)), first: intervals[0]?.ms, afterFirstTwoSeconds: summary(intervals.filter(i=>i.start-first>=2e6).map(i=>i.ms)), overruns }
  }
  const report = { scenario, seconds, activity, diagnostics, hookMode: prototypeHook ? 'prototype' : 'instance', scenes, harnessSHA256, renderedAudioSeconds: traffic.report.frames / traffic.report.rate, initialLoad, finalLoad: os.loadavg(), dataLossOccurred, cpu: os.cpus()[0]?.model, elapsed: (Date.now()-start)/1000, browser: browser.version(), commit: process.env.CAPACITY_REVISION ?? execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), bundles, traffic, edits, preparation: { ...durations('prepare'), audioDeadlineApplies: false }, engine: durations('engine'), callback: durations('callback'), overhead: durations('overhead'), eventNames: [...new Set(events.map((e:any)=>e.name))] }
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally { writeFileSync(bundlePath, originalBundle); await browser.close() }
