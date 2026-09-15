import {readFile,writeFile} from 'node:fs/promises';
let s=await readFile('dist/index.html','utf8');
const player=`  <section class="player" aria-label="음악 플레이어">
<div class="now-playing" id="now-playing"><div class="mini-cover cover cover-lime">A</div><div><strong>새로운 음악을 만나보세요</strong><span>곡을 선택하면 재생됩니다</span></div></div>
<div class="player-center"><div class="player-buttons"><button class="icon-button" id="shuffle" aria-label="셔플" aria-pressed="false"><i data-icon="shuffle"></i></button><button class="icon-button" id="previous" aria-label="이전 곡"><i data-icon="previous"></i></button><button class="play-button" id="play-toggle" aria-label="재생"><i data-icon="play"></i></button><button class="icon-button" id="next" aria-label="다음 곡"><i data-icon="next"></i></button><button class="icon-button" id="repeat" aria-label="반복 끔" aria-pressed="false"><i data-icon="repeat"></i></button></div><div class="timeline"><span id="elapsed">0:00</span><input id="seek" type="range" min="0" max="0" step="0.1" value="0" aria-label="재생 위치"><span id="duration">0:00</span></div></div>
<div class="player-right"><span class="free-listen" id="listen-mode">회원은 전체곡 무료</span><i data-icon="volume"></i><input id="volume" type="range" min="0" max="1" value="0.75" step="0.01" aria-label="음량"><button class="icon-button" id="queue-toggle" aria-label="재생 목록"><i data-icon="list"></i></button></div></section>
`;
const a=s.indexOf('  <section class="player"'),b=s.indexOf('  <div class="toast"');
s=s.slice(0,a)+player+s.slice(b);
s=s.replace('<script src="app.js"></script>','<dialog id="dialog" aria-label="AIFECT"><div id="dialog-content"></div><button class="dialog-close" aria-label="닫기" id="dialog-close">×</button></dialog>\n<script src="icons.js"></script><script src="app.js"></script><script src="views.js"></script><script src="actions.js"></script>');
await writeFile('dist/index.html',s);
