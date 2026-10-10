// Local smoke test. Reads a key file outside the repository; never prints the key.
import {readFile} from 'node:fs/promises';
import {analyzeMusic} from '../server/music-classification.js';
const key=await readFile(process.argv[2],'utf8');
const catalogue=await (await fetch('https://aifect.co.kr/api/catalog?limit=1')).json();
const track=catalogue.tracks[0];
const audio=await fetch(`https://aifect.co.kr/media/${track.id}/preview`);
if(!audio.ok)throw Error('Preview unavailable');
console.log(JSON.stringify({title:track.title,...await analyzeMusic({GEMINI_API_KEY:key.trim()},new Uint8Array(await audio.arrayBuffer()),{sample:true})}));
