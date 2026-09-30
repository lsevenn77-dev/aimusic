import {VocalProcessor} from './vocal-effects.js';
class AifectVocal extends AudioWorkletProcessor {
 constructor(options){super();this.fx=new VocalProcessor(sampleRate,options.processorOptions?.mix);this.port.onmessage=e=>this.fx.update(e.data);}
 process(inputs,outputs){const input=inputs[0]?.[0],out=outputs[0]?.[0];if(out)for(let i=0;i<out.length;i++)out[i]=this.fx.process(input?.[i]||0);return true;}
}
registerProcessor('aifect-vocal',AifectVocal);
