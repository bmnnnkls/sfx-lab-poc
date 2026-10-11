import { describe, expect, it } from 'vitest'
import { addNode, connect, createNode, flattenPatch, groupIntoModule, noteGraphFrom, setNodeName, setNodeParam } from '../patch'
import { type InstrumentTrack, createDemoProject, editPatchAt, groupNodesAsModule, setTrackPatch } from '../project'
import { diffProject } from './diff-project'

const project = createDemoProject()
const track = project.tracks[0] as InstrumentTrack
const filter = track.patch.nodes.find((node) => node.type === 'filter')!

/** The demo track with a Control wired into the filter's resonance socket. */
const withControl = () => {
  const control = { ...createNode('control', 0, 0), id: 'knob' }
  let patch = addNode(track.patch, control)
  patch = connect(patch, { node: control.id, port: 'out' }, { node: filter.id, port: 'param:resonance' })
  return { control, project: setTrackPatch(project, track.id, patch) }
}

describe('control nodes and the engine commands', () => {
  it('wiring a control into a socket changes the structure: the patch is rebuilt once', () => {
    const { project: next } = withControl()
    expect(diffProject(project, next).map((command) => command.type)).toEqual(['track/setPatch'])
  })

  it('turning the knob afterwards is one track/setParam on the control node and nothing else', () => {
    const { control, project: wired } = withControl()
    const track2 = wired.tracks[0] as InstrumentTrack
    const turned = setTrackPatch(wired, track.id, setNodeParam(track2.patch, control.id, 'value', 0.9))
    expect(diffProject(wired, turned)).toEqual([
      { type: 'track/setParam', trackId: track.id, nodeId: control.id, paramId: 'value', value: 0.9 },
    ])
  })

  it('editing the stored value of the driven parameter is still just a setParam (the engine ignores it while the wire is there)', () => {
    const { project: wired } = withControl()
    const track2 = wired.tracks[0] as InstrumentTrack
    const edited = setTrackPatch(wired, track.id, setNodeParam(track2.patch, filter.id, 'resonance', 5))
    expect(diffProject(wired, edited)).toEqual([
      { type: 'track/setParam', trackId: track.id, nodeId: filter.id, paramId: 'resonance', value: 5 },
    ])
  })

  it('a node name is not sound: renaming sends nothing', () => {
    const named = setTrackPatch(project, track.id, setNodeName(track.patch, filter.id, 'Bright'))
    expect(named).not.toBe(project)
    expect(diffProject(project, named)).toEqual([])
  })

  it('a control in the master graph and in an insert graph turns into master/setParam and track/setParam', () => {
    const fxNode = { ...createNode('control', 0, 0), id: 'k' }
    const inFx = editPatchAt(project, { trackId: track.id, graph: 'fx' }, (fx) => addNode(fx, fxNode))
    const onMaster = editPatchAt(project, { master: true }, (fx) => addNode(fx, fxNode))
    const turnFx = editPatchAt(inFx, { trackId: track.id, graph: 'fx' }, (fx) => setNodeParam(fx, 'k', 'value', 0.2))
    const turnMaster = editPatchAt(onMaster, { master: true }, (fx) => setNodeParam(fx, 'k', 'value', 0.2))
    expect(diffProject(inFx, turnFx)).toEqual([{ type: 'track/setParam', trackId: track.id, nodeId: 'k', paramId: 'value', value: 0.2 }])
    expect(diffProject(onMaster, turnMaster)).toEqual([{ type: 'master/setParam', nodeId: 'k', paramId: 'value', value: 0.2 }])
  })
})

describe('sockets and modules', () => {
  const graph = noteGraphFrom(
    [{ id: 'in', type: 'trackIn' }, { id: 'k', type: 'control', params: { value: 0.3 } }, { id: 'g', type: 'gain' }, { id: 'out', type: 'trackOut' }],
    ['in.out>g.in', 'k.out>g.param:gain', 'g.out>out.in'],
  )

  it('a control and the socket it drives can be grouped into a module; the wire between them stays inside', () => {
    const result = groupIntoModule(graph, ['k', 'g'], 'Level', [])!
    expect(result.module.patch.connections.map((c) => `${c.from.port}>${c.to.port}`).sort()).toEqual(['out>param:gain'])
    expect(result.module.inputs).toHaveLength(1)
    expect(result.module.outputs).toHaveLength(1)
  })

  it('flattening keeps the socket wire, with the inner ids <use>/<inner>', () => {
    const { patch, module, use } = groupIntoModule(graph, ['k', 'g'], 'Level', [])!
    const flat = flattenPatch(patch, [module])
    const socketWire = flat.connections.find((c) => c.to.port === 'param:gain')!
    expect(socketWire.from.node.startsWith(`${use.id}/`)).toBe(true)
    expect(socketWire.to.node.startsWith(`${use.id}/`)).toBe(true)
  })

  it('a knob turned on a control inside a module use reaches the engine as a setParam on the flattened id', () => {
    const asProject = editPatchAt(project, { master: true }, () => graph)
    const grouped = groupNodesAsModule(asProject, { master: true }, ['k', 'g'], 'Level')
    const use = grouped.master.fx.nodes.find((node) => node.type === 'module')!
    const module = grouped.modules[0]!
    const turned = { ...grouped, modules: [{ ...module, patch: setNodeParam(module.patch, module.patch.nodes.find((n) => n.type === 'control')!.id, 'value', 0.8) }] }
    const commands = diffProject(grouped, turned)
    expect(commands).toHaveLength(1)
    expect(commands[0]).toMatchObject({ type: 'master/setParam', paramId: 'value', value: 0.8 })
    expect((commands[0] as { nodeId: string }).nodeId.startsWith(`${use.id}/`)).toBe(true)
  })
})
