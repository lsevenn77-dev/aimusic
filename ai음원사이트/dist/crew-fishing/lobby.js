import {FISH} from './catalog.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n??0).toLocaleString('ko-KR');
const icon=name=>`<svg class="fl-icon" aria-hidden="true" focusable="false"><use href="./art/lobby-icons.svg#${name}"/></svg>`;
const title=(symbol,label)=>`<h2>${icon(symbol)}${label}</h2>`;
const stat=(symbol,label,value)=>`<div><dt>${icon(symbol)}${label}</dt><dd>${value}</dd></div>`;

export function fishingLobby(lobby,cast){
 const practice=Boolean(lobby.practice),official='./?crew='+encodeURIComponent(lobby.crew)+'&amp;from=crew';
 const disabled=!practice&&(!lobby.open||(!cast&&!lobby.remaining));
 const start=!practice&&!lobby.open?'이번 주 낚시 마감':cast?'낚시 이어하기':disabled?'오늘 낚시 기회 소진':practice?'연습 낚시 시작':'낚시 시작';
 return `<div class="fl-layout">
 <section class="fl-hero fl-card"><div class="fl-intro"><small>AIFECT <b>CREW GAMES</b></small><h1>별물결 낚시터</h1><p>${escape(lobby.name)}의 공동 낚시터</p></div>
 <div class="fl-launch"><button class="fl-cta" data-act="start" ${disabled?'disabled':''}>${icon('hook')}${start}</button>
 <span>${practice?'연습 · 횟수 제한 없음':`오늘 남은 낚시 <strong>${number(lobby.remaining)} / ${number(lobby.dailyLimit??10)}</strong>`}</span></div></section>
 ${practice?`<section class="fl-card fl-practice">${title('target','연습 낚시터')}<p>횟수 제한 없이 릴 타이밍을 익혀 보세요. 연습 어획액은 공식 순위에 반영되지 않으며 새로고침하면 연습 기록이 초기화됩니다.</p><a class="fl-secondary" href="${official}">공식 낚시터로</a></section>`:'<section id="fishingRankings" class="crew-game-board" aria-label="주간 게임 순위"></section>'}
 <section class="fl-card fl-records">${title('chart',practice?'내 연습 기록':'이번 주 낚시 기록')}
 <dl>${stat('fish',practice?'내 연습 어획액':'내 주간 어획액',number(lobby.mine)+'원')}${practice?stat('book','발견한 어종',number(lobby.discovered)+' / '+FISH.length):stat('crew','크루 주간 어획액',number(lobby.ours)+'원')+stat('ticket','주간 횟수 제한','없음')}</dl></section>
 <section class="fl-card fl-sea"><div class="fl-sea-main">${title('waves',practice?'나의 연습 바다':'우리 크루의 바다')}
 <p>낚은 물고기와 어종별 최고 기록을 모아 보세요.</p><div class="fl-sea-actions"><button class="fl-cta" data-act="aquarium">${icon('fish')}${practice?'연습 수족관':'크루 수족관'}</button><button class="fl-secondary" data-act="book">${icon('book')}물고기 도감</button></div></div>
 <div class="fl-sea-links"><a href="./design.html" data-fishing-catalog>${icon('book')}공식 어종 ${FISH.length}종 보기 ↗</a>${practice?'':`<a href="${official}&amp;mode=practice">${icon('target')}연습하기</a>`}</div></section>
 <section class="fl-card fl-guide"><div class="fl-guide-title">${title('game','조작 안내')}<button data-act="rules">게임 규칙</button></div>
 <p>찌가 <em>민트색 성공 구간</em>에 들어오면 낚시 화면을 터치하세요.</p>
 <ol><li><span class="fl-scene fl-bob" aria-hidden="true"><i></i></span><b>① 입질 대기</b></li><li><span class="fl-scene fl-meter" aria-hidden="true"><i></i></span><b>② 타이밍 맞춰 터치</b></li><li><span class="fl-scene fl-catch" aria-hidden="true"><img src="./art/sky-flyer.webp" alt=""></span><b>③ 물고기 획득!</b></li></ol>
 <p>PC에서는 클릭 또는 스페이스바로 당길 수 있습니다.<br>입질까지 1~15초, 입질 후 3초 안에 터치하세요.</p></section>
 <p class="fl-card fl-calendar">${icon('calendar')}${practice?'연습 기록은 공식 순위에 반영되지 않습니다.':'주말에도 낚시할 수 있습니다. 주간 어획액은 한국시간 월요일 0시부터 새로 집계합니다.'}</p></div>`;
}
