/**
 * Temporary assessment reproductions for implementation c52a08c (handoff e3cf83d).
 * Run from the repository root:
 *   npx vitest run --config docs/archive/2026-10-perf-library/diagnostics/claims.vitest.config.mts
 * These assertions record observed behavior, including defects; they are not
 * desired-behavior regression tests. Promote useful cases when addressing findings.
 * F2 deliberately inspects private runtime methods; F5 restores its collation patch.
 */
import { it, expect } from 'vitest'
import { createEmptyProject, createClip, groupNodesAsModule } from '../../../../src/core/project/index.ts'
import { createNode, noteGraphFrom } from '../../../../src/core/patch/index.ts'
import { captureSnapshot, putSnapshot, recallSnapshot, assetSignature, saveProjectPreset, editSampleBinding, enumerateSampleTargets } from '../../../../src/core/preset/index.ts'
import { parseProject, serializeProject } from '../../../../src/core/persistence/index.ts'
import { compileAutomation } from '../../../../src/core/automation/index.ts'
import { Engine } from '../../../../src/core/engine/engine.ts'
import { diffProject } from '../../../../src/core/sync/index.ts'
import { NoteControlGraph } from '../../../../src/core/instrument/note-control-graph.ts'
import { createMemoryLibraryStorage } from '../../../../src/storage/library-storage.ts'
import { createMidiControls } from '../../../../src/app/midi-controls.ts'
import { useProjectStore, useControlStore, useMidiStore } from '../../../../src/state/index.ts'
import { validateLibraryCatalog } from '../../../../src/core/library/bundle.ts'
const log = (...args) => console.log(...args)
const pt = { id: 'p', beat: 0, value: 0.5, interpolation: 'hold' }
const lane = target => ({ id:'lane', target, enabled:true, points:[pt] })
const setup = () => { const p = createEmptyProject(); const t = {...p.tracks[0], id:'a'}; return {...p, tracks:[t]} }
it('F2 counts invalidation calls rather than benchmarking F1', () => {
  for (const notes of [false,true]) {
    let p = setup(); const t = p.tracks[0]; const send = {kind:'mixer',owner:{kind:'track',trackId:'a'},control:'send',returnId:'r'};
    const target = {kind:'graph',owner:send.owner,domain:'notes',path:[],nodeId:'k',nodeType:'control',paramId:'value'};
    const graph = noteGraphFrom([{id:'k',type:'control'}],[])
    p = {...p,tracks:[{...t,noteGraph:graph,clips:[{...createClip('C',4,[]),id:'c',automation:[lane(send),...(notes?[{...lane(target),id:'notes'}]:[])]}]},{kind:'return',id:'r',name:'R',volume:1,fx:{nodes:[],connections:[]}}]}
    const e:any = new Engine(48000); diffProject(null,p).forEach(c=>e.apply(c));e.apply({type:'clip/launch',trackId:'a',clipId:'c'});
    let invalid=0,mix=0,schedule=0; for(const [name,inc] of [['invalidateOrder',()=>invalid++],['mixTracks',()=>mix++],['scheduleTracks',()=>schedule++]] as const){const old=e[name].bind(e);e[name]=(...args)=>{inc();return old(...args)}}
    e.render(new Float32Array(128),new Float32Array(128));log('F2', {notes,invalid,mix,schedule});expect(invalid).toBe(notes?256:1)
  }
})
it('F3 helper slew advances one 48000th per call',()=>{
  const g=noteGraphFrom([{id:'k',type:'control',params:{value:0}},{id:'s',type:'smooth',params:{mode:1,rate:1}},{id:'t',type:'transpose'}],['k.out>s.in','s.out>t.param:semitones']);
  for (const calls of [375,48000]) {const helper=new NoteControlGraph(g);let value=0;helper.process((n,p,v)=>value=v);helper.setParam('k','value',1);for(let i=0;i<calls;i++)helper.process((n,p,v)=>value=v);log('F3',{calls,value});expect(value).toBeCloseTo(calls/48000,5)}
})
it('F5 same payload produces different signatures under en versus sv collation',()=>{
 const payload:any={kind:'audio-effect',graph:{nodes:['ä','z'].map(id=>({...createNode('control',0,0),id})),connections:[]},modules:[],sampleIds:[]};const original=String.prototype.localeCompare;let a,b;try{String.prototype.localeCompare=function(other){return original.call(this,other,'en')};a=assetSignature(payload);String.prototype.localeCompare=function(other){return original.call(this,other,'sv')};b=assetSignature(payload)}finally{String.prototype.localeCompare=original}expect(a).not.toBe(b);console.log('F5 signatures differ',a!==b)
})
it('F10 grouping leaves snapshot target unavailable',()=>{
 let p=setup();const t=p.tracks[0];p={...p,tracks:[{...t,patch:{nodes:[{...createNode('control',0,0),id:'k'}],connections:[]}}]};const scope={owner:{kind:'track',trackId:'a'},domain:'patch'};p=putSnapshot(p,captureSnapshot(p,scope,'S'));const grouped=groupNodesAsModule(p,{trackId:'a'},['k']);const result=recallSnapshot(grouped,grouped.snapshots[0]);expect(result.issues.length).toBeGreaterThan(0);console.log('F10',result.issues.map(x=>x.reason))
})
it('F11 cross-owner lane survives serialization but compilation drops it',()=>{
 let p=setup();const t=p.tracks[0];p={...p,tracks:[{...t,clips:[{...createClip('C',4,[]),automation:[lane({kind:'mixer',owner:{kind:'master'},control:'volume'})]}]}]};const parsed=parseProject(serializeProject(p));expect(parsed.ok).toBe(true);if(!parsed.ok)return;expect(parsed.project.tracks[0].clips[0].automation).toHaveLength(1);expect(compileAutomation(parsed.project).flatMap(t=>t.clips).filter(Boolean)).toHaveLength(0)
})
it('F12 duplicate tracks get fresh IDs with control remaining on first and no warning',()=>{
 let p=setup();const t={...p.tracks[0],patch:{nodes:[{...createNode('control',0,0),id:'k'}],connections:[]}};p={...p,tracks:[t,{...t,name:'duplicate'}],controlValues:[{target:{kind:'graph',domain:'patch',path:[],nodeId:'k',nodeType:'control',paramId:'value',owner:{kind:'track',trackId:'a'}},value:.123}]};const parsed=parseProject(serializeProject(p));expect(parsed.ok).toBe(true);if(!parsed.ok)return;expect(parsed.project.tracks[1].id).not.toBe('a');expect(parsed.warnings).toEqual([]);expect(parsed.project.controlValues[0].target.owner.trackId).toBe('a')
})
it('F13 structural revision dedup keeps old closure but preset records new sample',()=>{
 let p=setup();const t=p.tracks[0];const a='a'.repeat(64),b='b'.repeat(64);p={...p,samples:[a,b].map(id=>({id,name:id[0],extension:'wav',sampleRate:8000,channels:1,bytes:16000,durationSeconds:1})),tracks:[{...t,patch:{nodes:[{...createNode('sampler',0,0),id:'s',sampleId:a}],connections:[]}}]};const scope={owner:{kind:'track',trackId:'a'},domain:'patch'};p=saveProjectPreset(p,scope,'A');p=editSampleBinding(p,{target:enumerateSampleTargets(p)[0],sampleId:b});p=saveProjectPreset(p,scope,'B');expect(p.assetRevisions).toHaveLength(1);expect(p.assetRevisions[0].payload.sampleIds).not.toContain(b);expect(p.presets[1].samples[0].sampleId).toBe(b)
})
it('F15 memory accepts unsupported version returned by an edit',async()=>{const s=createMemoryLibraryStorage();await s.update(c=>({...c,version:2}));expect((await s.read()).version).toBe(2)})
it('F4 ordinary momentary release holds a zero Read override as specified',()=>{
 let p=setup();p={...p,tracks:[{...p.tracks[0],patch:{nodes:[{...createNode('switch',0,0),id:'s',params:{on:0,mode:1}}],connections:[]}}]};const target={kind:'graph',owner:{kind:'track',trackId:'a'},domain:'patch',path:[],nodeId:'s',nodeType:'switch',paramId:'on'};
 p={...p,midiMappings:[{id:'m',deviceId:'d',deviceName:'D',channel:0,cc:21,target,pickup:false}]};useProjectStore.getState().resetProject(p);useControlStore.setState({playback:[{target,value:1}],overrides:[]});useMidiStore.setState({learning:undefined,conflict:undefined});const c=createMidiControls();c.receive('d','D',{kind:'cc',channel:1,cc:21,value:127});c.receive('d','D',{kind:'cc',channel:1,cc:21,value:0});expect(useControlStore.getState().overrides).toEqual([{target,value:0}]);c.reset()
})
it('F14 measures budget-legal folder ancestry validation',()=>{
 for(const n of [128,512,1024]) { const folders=Array.from({length:n},(_,i)=>({id:'f'+i,name:'Folder',parentId:i?'f'+(i-1):null}));const c={version:1,folders,items:[],revisions:[],samples:[]};const start=performance.now();validateLibraryCatalog(c);log('F14',{folders:n,ms:performance.now()-start}) }
})
