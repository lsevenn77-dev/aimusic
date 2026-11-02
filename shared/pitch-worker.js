import {shiftBacking} from './pitch-shift.js';
import {renderBackingKeys} from './backing-pitch.js';
self.onmessage=({data})=>{
 try{const report=progress=>self.postMessage({progress});const channels=data.events?.length?renderBackingKeys(data.channels,data.sampleRate,data.events,report):shiftBacking(data.channels,data.sampleRate,data.semitones,report);self.postMessage({channels},channels.map(c=>c.buffer));}
 catch(error){self.postMessage({error:error.message||'반주 키 변환에 실패했습니다.'});}
};
