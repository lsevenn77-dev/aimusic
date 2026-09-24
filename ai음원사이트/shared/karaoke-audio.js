// Pure pieces of the singing screen, bundled for the browser as AifectKaraoke.

// Singing, preview and the uploaded mix all run at 32 kHz: it keeps phone memory low and a 10-minute
// stereo 16-bit WAV (about 77 MB) under the 80 MB upload limit.
export const MIX_RATE=32000;

// The line and word sounding at `t` seconds, and how far through that word the singer is (0..1).
export function wordAt(lines,t){
 let line=-1;
 for(let i=0;i<lines.length;i++){if(lines[i].s<=t)line=i;else break;}
 if(line<0)return {line:-1,word:-1,progress:0};
 const words=lines[line].w;let word=-1;
 for(let j=0;j<words.length;j++){if(words[j].s<=t)word=j;else break;}
 const w=words[word];
 return {line,word,progress:w?Math.max(0,Math.min(1,(t-w.s)/Math.max(.05,w.e-w.s))):0};
}

// Recorder chunks carry the audio-clock time of their first sample; the song starts at t0 on that clock.
// Anything captured before t0 is dropped and nothing runs past the song's length.
export function placeChunks(chunks,t0,sampleRate,length){
 const out=new Float32Array(length);
 for(const c of chunks){
  let start=Math.round((c.t-t0)*sampleRate),from=0;
  if(start<0){from=-start;start=0;}
  const n=Math.min(c.d.length-from,length-start);
  if(n>0)out.set(c.d.subarray(from,from+n),start);
 }
 return out;
}

export function peak(channels){let max=0;for(const ch of channels)for(let i=0;i<ch.length;i++){const a=Math.abs(ch[i]);if(a>max)max=a;}return max;}

// 16-bit PCM WAV, interleaved.
export function encodeWav(channels,sampleRate){
 const frames=channels[0].length,count=channels.length,size=44+frames*count*2,buffer=new ArrayBuffer(size),v=new DataView(buffer);
 const text=(offset,s)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));};
 text(0,'RIFF');v.setUint32(4,size-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,count,true);
 v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*count*2,true);v.setUint16(32,count*2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,frames*count*2,true);
 let o=44;
 for(let i=0;i<frames;i++)for(let c=0;c<count;c++){const s=Math.max(-1,Math.min(1,channels[c][i]));v.setInt16(o,s<0?s*0x8000:s*0x7fff,true);o+=2;}
 return new Uint8Array(buffer);
}
