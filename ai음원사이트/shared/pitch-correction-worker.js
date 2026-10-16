import {correctVocalPitch} from './pitch-correction.js';
self.onmessage=({data})=>{
 try{const result=correctVocalPitch(data.samples,data.sampleRate,data.level,progress=>self.postMessage({progress}));self.postMessage(result,[result.samples.buffer]);}
 catch{self.postMessage({error:'음정 보정을 완료하지 못했어요. 원음은 그대로 보관됩니다.'});}
};
