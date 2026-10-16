import {shiftBacking} from './pitch-shift.js';
self.onmessage=({data})=>{
 try{const channels=shiftBacking(data.channels,data.sampleRate,data.semitones,progress=>self.postMessage({progress}));self.postMessage({channels},channels.map(c=>c.buffer));}
 catch(error){self.postMessage({error:error.message||'반주 키 변환에 실패했습니다.'});}
};
