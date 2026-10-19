import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { Engine } from '../../../src/core/engine/engine.ts';
import { exampleProjects } from '../../../src/core/examples/index.ts';
import { createDemoProject } from '../../../src/core/project/index.ts';
import { diffProject } from '../../../src/core/sync/index.ts';
const rate=48000, quantum=128, trials=5;
const left=new Float32Array(quantum),right=new Float32Array(quantum);
function render(e) { for(let i=0;i<rate;i+=quantum)e.render(left,right); }
function setup(p,scene){const e=new Engine(rate);for(const c of diffProject(null,p))e.apply(c);e.apply({type:'scene/launch',scene});return e;}
function inventory(p,e){
 const tracks=[...e.tracks.values()];
 const instruments=tracks.filter(t=>t.instrument);
 const stages=[e.master.stage,...tracks.map(t=>t.fx.stage),...instruments.flatMap(t=>[t.instrument.global,t.instrument.shared,...t.instrument.pool.voices.map(v=>v.stage)])];
 return {tracks:p.tracks.length,instruments:instruments.length,returns:p.tracks.filter(t=>t.kind==='return').length,voiceSlots:instruments.reduce((n,t)=>n+t.instrument.pool.voices.length,0),compiledDspNodeInstances:stages.reduce((n,s)=>n+s.nodes.length,0)};
}
console.log(JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--short'],{encoding:'utf8'}).trim(),node:process.version,cpu:os.cpus()[0]?.model,platform:os.platform(),arch:os.arch(),rate,quantum,trials,warmSeconds:2,scope:'unmodified scenes; offline engine render only; no status or message transport'}));
const projects=[{id:'starter',create:createDemoProject},...exampleProjects];
for(const item of projects){
 const p=item.create();
 for(let scene=0;scene<(item.id==='starter'?1:p.sceneCount);scene++){
  const e=setup(p,scene);render(e);render(e);
  const ms=[];
  for(let i=0;i<trials;i++){const start=performance.now();render(e);ms.push(performance.now()-start);}
  console.log(JSON.stringify({id:item.id,scene:scene+1,name:p.sceneNames?.[scene],...inventory(p,e),ms,median:[...ms].sort((a,b)=>a-b)[2],activeVoicesAtEnd:[...e.tracks.values()].reduce((n,t)=>n+(t.instrument?.activeVoiceCount??0),0)}));
 }
}
