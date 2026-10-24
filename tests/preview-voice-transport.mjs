// Isolated browser WebRTC regression. Synthetic sound only; no account, SFU,
// microphone permission, external provider or production database is used.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const source=readFileSync('dist/voice-rooms.js','utf8');
const before=execFileSync('git',['show','96a1a106ea79a600f61c837a44431d293603fbec:dist/voice-rooms.js'],{encoding:'utf8'});
const browser=readFileSync('tests/voice-transport-qa-browser.js','utf8');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>토킹룸 네트워크 회귀 검증</title><body style="background:#131b26;color:#f5f5fc;font:16px sans-serif;max-width:900px;margin:32px auto;padding:20px"><h1>토킹룸 네트워크 회귀 검증</h1><p>로컬 WebRTC · 합성 오디오만 사용 · Cloudflare SFU/실기기 검증은 별도</p><p>응답하지 않는 STUN 서버를 지정해 후보 수집 지연을 재현합니다.</p><button id="before">기존 방식 재현</button> <button id="before-playback">기존 수신 무음 재현</button> <button id="after">수정 방식 양방향 검사</button> <button id="stop">테스트 종료</button><pre id="result" style="white-space:pre-wrap;line-height:1.7">준비</pre><script src="/before.js"></script><script src="/after.js"></script><script src="/qa.js"></script></body></html>`;
const server=createServer((req,res)=>{
 const js=req.url==='/before.js'?`(()=>{${before}\nwindow.VoiceClientBefore=VoiceRoomClient;})();`:req.url==='/after.js'?`(()=>{${source}\nwindow.VoiceClientAfter=VoiceRoomClient;})();`:req.url==='/qa.js'?browser:null;
 res.writeHead(200,{'content-type':js?'text/javascript':'text/html;charset=utf-8'});res.end(js||html);
});
server.listen(4212,'127.0.0.1',()=>console.log('Voice transport QA: http://127.0.0.1:4212/'));
