import {dubbingTimeline} from './dubbing.js';
export const DUBBING_RECORD_RATE=48000;
export function dubbingRecordingWindows(script){
 const timeline=dubbingTimeline(script);
 return {...timeline,lines:timeline.lines.map((line,i)=>({...line,recordEnd:Math.min(timeline.lines[i+1]?.start??timeline.duration,line.end+Math.min(1,script.lines[i].gapSeconds-.1))}))};
}
// Accept a bounded canonical mono PCM file, not metadata supplied by a browser.
export function validateDubbingTake(bytes,maxDuration){
 if(!(bytes instanceof Uint8Array)||bytes.length<44+9600||bytes.length>44+48*48000*2)throw Error('녹음 파일 크기를 확인해주세요.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text=(at,n)=>String.fromCharCode(...bytes.subarray(at,at+n));
 if(text(0,4)!=='RIFF'||text(8,4)!=='WAVE'||text(12,4)!=='fmt '||text(36,4)!=='data'||v.getUint32(4,true)!==bytes.length-8||v.getUint32(16,true)!==16||v.getUint16(20,true)!==1||v.getUint16(22,true)!==1||v.getUint32(24,true)!==48000||v.getUint32(28,true)!==96000||v.getUint16(32,true)!==2||v.getUint16(34,true)!==16||v.getUint32(40,true)!==bytes.length-44||(bytes.length-44)%2)throw Error('48kHz 모노 PCM 녹음 파일이 필요합니다.');
 const duration=(bytes.length-44)/96000;
 if(duration>maxDuration+1/48000)throw Error('녹음이 다음 대사 구간을 넘었어요. 이 대사를 다시 녹음해주세요.');
 return {duration,bytes:bytes.length};
}
