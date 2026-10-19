const nativeRegister=globalThis.registerProcessor;
      globalThis.registerProcessor=(name,Processor)=>nativeRegister(name,class extends Processor {
        constructor(...args){super(...args);this.port.postMessage({kind:'capacity-probe',rate:sampleRate,performance:typeof performance});
          const render=this.engine.render.bind(this.engine);this.engine.render=(l,r)=>{console.timeStamp('F1:engine:start');render(l,r);console.timeStamp('F1:engine:end')};
          for(let i=0;i<1000;i++){console.timeStamp('F1:overhead:start');console.timeStamp('F1:overhead:end')}
        }
        process(i,o){console.timeStamp('F1:callback:start');const result=super.process(i,o);console.timeStamp('F1:callback:end');return result}
      });
