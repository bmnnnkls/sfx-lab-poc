import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { Engine } from '../../src/core/engine/engine.ts';
import { exampleProjects } from '../../src/core/examples/index.ts';
import { diffProject } from '../../src/core/sync/index.ts';
import { createEmptyProject, createClip, createNote, createReturnTrack } from '../../src/core/project/index.ts';
import { noteGraphFrom } from '../../src/core/patch/index.ts';
import { execFileSync } from 'node:child_process';
const RATE=Number(process.env.BENCH_RATE ?? 48000), QUANTUM=128;
console.log(JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--short'],{encoding:'utf8'}).trim(),node:process.version,cpu:os.cpus()[0]?.model,platform:os.platform(),arch:os.arch(),rate:RATE,quantum:QUANTUM,warmSeconds:1,trials:5}));
function synthetic(n) {
 const p=createEmptyProject(), base=p.tracks[0];
 const patch=noteGraphFrom([{id:'note',type:'note'},{id:'osc',type:'oscillator'},{id:'out',type:'output'}],['note.frequency>osc.freq','osc.out>out.in']);
 const noteGraph=noteGraphFrom([{id:'in',type:'clipNotes'},{id:'tr',type:'transpose',params:{semitones:0}},{id:'out',type:'noteOut'}],['in.out>tr.in','tr.out>out.in']);
 return {...p,tracks:Array.from({length:n},(_,i)=>({...base,id:`t${i}`,voices:4,patch,noteGraph,clips:[{...createClip('held',100,[createNote(60,0,100,0.5)]),id:`c${i}`}]}))};
}
function variant(p,mode,kind='simple') {
 const id=kind==='low'?'stab':'t0', track=p.tracks.find(t=>t.id===id);
 const target=mode==='mixer'?{kind:'mixer',owner:{kind:'track',trackId:id},control:'volume'}:{kind:'graph',owner:{kind:'track',trackId:id},domain:'notes',path:[],nodeId:kind==='low'?'ng_key':'tr',nodeType:kind==='low'?'scaleLock':'transpose',paramId:kind==='low'?'root':'semitones'};
 const value=mode==='mixer'?track.volume:kind==='low'?9/11:0.5;
 const lane={id:'bench',enabled:mode!=='disabled',target,points:mode==='empty'?[]:[{id:'p',beat:0,value,interpolation:'hold'}]};
 if(mode==='base')return p;
 return {...p,tracks:p.tracks.map(t=>t.id!==id?t:{...t,clips:t.clips.map(c=>c&&({...c,automation:[lane]}))})};
}
function setup(p,scene=0){const e=new Engine(RATE);diffProject(null,p).forEach(c=>e.apply(c));e.apply({type:'scene/launch',scene});return e;}
function render(e,frames){const l=new Float32Array(QUANTUM),r=new Float32Array(QUANTUM); for(let f=0;f<frames;f+=QUANTUM)e.render(l,r);}
function counts(mode){let project=variant(synthetic(4),mode==='send'?'base':mode==='notes-send'?'notes':mode);
 if(mode==='send'||mode==='notes-send')project={...project,tracks:[{...createReturnTrack('Return'),id:'r'},...project.tracks.map((t,i)=>i?t:{...t,clips:t.clips.map(c=>c&&({...c,automation:[...(c.automation??[]),{id:'send',enabled:true,target:{kind:'mixer',owner:{kind:'track',trackId:t.id},control:'send',returnId:'r'},points:[{id:'p',beat:0,value:0,interpolation:'linear'},{id:'q',beat:1,value:1,interpolation:'linear'}]}]}))})]};
 const e=setup(project); render(e,256); const c={};
 const wrap=(o,key,label)=>{const orig=o[key];o[key]=function(...args){c[label]=(c[label]??0)+1;return orig.apply(this,args)}};
 for(const key of ['renderBlock','collectEvents','processMaster'])wrap(e,key,key);
 for (const key of ['invalidateOrder','updateMixState','sorted'])wrap(e,key,key);
 wrap(e.automation,'tick','tick');const getter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e.automation),'noteLanes').get;Object.defineProperty(e.automation,'noteLanes',{get(){c.noteLanes=(c.noteLanes??0)+1;return getter.call(this)}});
 for(const t of e.tracks.values())for(const key of ['schedule','clearAutomation','mixInto'])wrap(t,key,key);
 const NativeMap=globalThis.Map,NativeF64=globalThis.Float64Array;
 globalThis.Map=class extends NativeMap {constructor(...args){super(...args);c.maps=(c.maps??0)+1}};
 globalThis.Float64Array=class extends NativeF64 {constructor(...args){super(...args);c.f64=(c.f64??0)+1}};
 try{render(e,128)}finally{globalThis.Map=NativeMap;globalThis.Float64Array=NativeF64}
 return c;
}
if(process.argv.includes('--counts')){
 console.log(JSON.stringify({node:process.version,cpu:os.cpus()[0]?.model,baseline:counts('base'),mixer:counts('mixer'),notes:counts('notes'),disabled:counts('disabled'),empty:counts('empty'),send:counts('send'),'notes-send':counts('notes-send')},null,2));
 // Active/queued rather than arbitrary stored clips.
 const e=setup(variant(synthetic(1),'notes'));render(e,128);e.apply({type:'transport/stop'});e.apply({type:'transport/play'});console.log('configured idle noteLanes',e.automation.noteLanes);render(e,128); e.apply({type:'clip/launch',trackId:'t0',clipId:'c0'});console.log('queued prelaunch',e.automation.noteLanes,e.status().tracks.t0);render(e,128);console.log('queued remains',e.status().tracks.t0);
}else{
 const results=[];
 for(const [label,p,scene] of [['simple1',synthetic(1),0],['simple4',synthetic(4),0],['simple8',synthetic(8),0],['simple16',synthetic(16),0],['LowLightDrop',exampleProjects[0].create(),6]]){
  const engines=Object.fromEntries(['base','mixer','notes'].map(mode=>[mode,setup(variant(p,mode,label==='LowLightDrop'?'low':'simple'),scene)]));
  for(const e of Object.values(engines))render(e,RATE);
  const times={base:[],mixer:[],notes:[]};
  for(let trial=0;trial<5;trial++)for(const mode of (trial%2?['notes','mixer','base']:['base','mixer','notes'])){const t=performance.now();render(engines[mode],RATE);times[mode].push(performance.now()-t)}
  const median=a=>[...a].sort((a,b)=>a-b)[2];
  results.push({label,tracks:p.tracks.length,voices:p.tracks.reduce((s,t)=>s+(t.voices??0),0),ms:times,median:Object.fromEntries(Object.entries(times).map(([k,v])=>[k,median(v)])),automation:engines.notes.status().automation});
  console.log(JSON.stringify(results.at(-1)));
 }
 console.log(JSON.stringify({node:process.version,cpu:os.cpus()[0]?.model,rate:RATE,quantum:QUANTUM,warmSeconds:1,trials:5,results},null,2));
}
