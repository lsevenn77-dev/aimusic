// Served only by the disposable local SQLite preview; never in the app bundle.
// Exercise the real recorder/worklet with synthesized input, never a device mic.
if(new URLSearchParams(location.search).has('recordingQA')){
 const panel=document.createElement('details');panel.id='recording-qa';panel.style='position:fixed;right:0;bottom:0;z-index:99999;max-width:100%;max-height:45vh;overflow:auto;background:#fff;color:#111;font:12px monospace;padding:4px';
 panel.innerHTML='<summary>로컬 QA · 합성 입력</summary><button id="qa-regression">녹음 회귀 검사</button><pre id="qa-results">대기</pre>';document.body.append(panel);
 const output=panel.querySelector('pre'),results=[],samples=[];let failure='',mode='normal',requests=0,streams=[];
 const report=(name,pass,detail='')=>{results.push({name,pass,detail});output.textContent=JSON.stringify({results,samples},null,2);};
 for(const event of ['error','unhandledrejection'])addEventListener(event,e=>{failure=e.message||e.reason?.message||String(e.reason);});
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const until=async(test,ms=15000)=>{const end=performance.now()+ms;while(!test()){if(performance.now()>end)throw Error('상태 대기 시간 초과');await delay(30);}};
 navigator.mediaDevices.getUserMedia=async()=>{
  requests++;if(mode!=='normal')throw new DOMException('local fixture',mode);
  const ctx=new AudioContext({sampleRate:32000}),osc=ctx.createOscillator(),gain=ctx.createGain(),dest=ctx.createMediaStreamDestination();gain.gain.value=.05;osc.connect(gain).connect(dest);osc.start();await ctx.resume();
  const track=dest.stream.getAudioTracks()[0],stop=track.stop.bind(track);track.stop=()=>{if(track.readyState==='ended')return;stop();osc.stop();void ctx.close();};streams.push(dest.stream);return dest.stream;
 };
 panel.querySelector('button').onclick=async()=>{
  const button=panel.querySelector('button');button.disabled=true;results.length=0;samples.length=0;failure='';
  try{
   const s=sing;if(!s)throw Error('녹음 화면에서 실행하세요.');const words=JSON.stringify(s.data.words),partSnapshot=()=>JSON.stringify({mode:s.duetGuide?.mode,lines:s.duetGuide?.lines}),parts=partSnapshot();
   for(const error of ['NotAllowedError','NotFoundError']){mode=error;await startSinging();await delay(50);report(error,!singLive(s)&&!document.querySelector('[data-record-mic]').classList.contains('is-connected'),document.querySelector('[data-record-mic]').textContent);}
   mode='normal';s.cursor=0;s.shownLine=-1;drawLyrics(0);
   const prior=requests;await Promise.all([startSinging(),startSinging()]);report('중복 시작 방지',requests===prior+1);await delay(50);
   report('마이크 연결 표시',document.querySelector('[data-record-mic]').textContent==='마이크 연결됨');
   const wheelY=document.querySelector('#sing-wheel').getBoundingClientRect().y;let last='',moved=false;
   const sample=()=>{const dots=document.querySelector('[data-punch-countdown]'),bits=[...dots.children].map(d=>d.classList.contains('is-visible')?'1':'0').join('');if(bits!==last){last=bits;samples.push({bits,clock:s.ctx.currentTime,recordClock:s.run?.recordClock});}moved ||= Math.abs(document.querySelector('#sing-wheel').getBoundingClientRect().y-wheelY)>.5;};
   const timer=setInterval(sample,10);sample();try{await until(()=>s.state==='singing');await delay(250);sample();}finally{clearInterval(timer);}
   report('오디오 시계의 오른쪽→왼쪽 소등',samples.map(x=>x.bits).filter(x=>x!=='000').join(',')==='111,110,100');
   await until(()=>getComputedStyle(document.querySelector('.sing-countdown')).visibility==='hidden',3000);
   report('카운트 종료 숨김',true);report('카운트 레이아웃 이동 없음',!moved);
   await until(()=>s.cursor>7.5);report('가사 자동 싱크',document.querySelector('.sing-wheel .current')?.dataset.singLine==='1');
   s.editingRecording=true;await finishSinging();report('녹음 중지 및 PCM 보존',!singLive(s)&&s.voice?.length>0);
   await startSinging();report('재시작',singLive(s));await finishSinging();await delay(200);report('카운트 취소',document.querySelector('[data-punch-countdown]').dataset.count==='0');
   await startSinging();const track=s.run.stream.getAudioTracks()[0];track.stop();track.dispatchEvent(new Event('ended'));await until(()=>!singLive(s)&&s.state!=='stopping');await delay(50);report('연결 해제 표시',!document.querySelector('[data-record-mic]').classList.contains('is-connected'));
   report('가사 내용·타이밍·파트 보존',JSON.stringify(s.data.words)===words&&partSnapshot()===parts);
   await startSinging();const context=s.ctx;cleanupSing();await delay(100);report('화면 이탈 정리',sing===null&&context.state==='closed'&&streams.every(stream=>stream.getTracks().every(t=>t.readyState==='ended')));
   report('브라우저 런타임 오류 없음',!failure,failure);
  }catch(e){report('회귀 검사 완료',false,e.stack||e.message);}finally{button.disabled=false;}
 };
}
