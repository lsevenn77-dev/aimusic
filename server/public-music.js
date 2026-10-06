import {trackList,VISIBLE} from './catalog.js';
import {publicPageRoute} from './public-pages.js';
import {escapeHTML as esc,businessFooterHTML} from '../shared/site-info.js';

const guides={
 '/guide/listening':{title:'음악을 듣고 내 플레이리스트에 담기',body:'<h2>원곡과 커버를 함께 발견하세요</h2><p>AIFECT의 듣기 화면에서 제작곡을, 커뮤니티의 커버 탭에서 회원이 직접 부른 음악을 찾을 수 있습니다. 곡을 선택하면 제목과 활동명, 곡 소개를 확인하고 재생할 수 있어요. AI 가수를 선택한 제작곡은 AI 가수 이름으로, 선택하지 않은 곡과 회원의 커버는 올린 사람의 활동명으로 표시됩니다.</p><h2>좋아하는 커버도 음악으로 보관하세요</h2><p>곡 화면의 담기 버튼에서 플레이리스트를 선택하세요. 제작곡과 커버곡을 같은 플레이리스트에 담을 수 있습니다. 내 보관함에서 플레이리스트와 최근 감상, 좋아요를 다시 찾을 수 있어요. 재생과 개인 보관 기능에는 로그인이 필요합니다.</p><h2>공개 범위가 바뀐 음악</h2><p>올린 사람이 비공개로 바꾸거나 운영자가 제거한 곡은 목록과 재생에서 제외됩니다. 원곡이 비공개가 되면 연결된 커버도 감상할 수 없으므로, 저장한 곡의 이용 가능 여부가 달라질 수 있습니다.</p>'},
 '/guide/recording':{title:'솔로와 듀엣 녹음 시작하기',body:'<h2>부를 수 있는 곡을 선택하세요</h2><p>부르기 화면에는 제작자가 노래방 이용을 허용하고 반주와 가사 준비가 완료된 곡이 표시됩니다. 곡 안에서 솔로 또는 듀엣을 선택합니다. 듀엣 파트는 성별이 아닌 내 파트와 파트너 파트로 구분합니다.</p><h2>가사와 모니터링</h2><p>녹음 화면에서 현재 가사와 다음 가사를 확인하세요. 이어폰 모니터링을 켜면 내 목소리를 들을 수 있습니다. 스피커로 모니터링하면 울림이 생길 수 있어 이어폰 사용을 권장합니다. 기기에 따라 지연이 달라지며 Bluetooth 이어폰은 추가 지연이 생길 수 있습니다.</p><h2>녹음 후 확인할 순서</h2><p>먼저 녹음 미리듣기로 목소리와 반주의 싱크를 확인하고, 필요한 경우 싱크를 조정하세요. 다음으로 목소리와 반주 볼륨을 맞추고 원음·노래방·스튜디오·홀 중 효과를 선택하세요. 사용자 설정에서는 룸 크기, 에코 크기와 효과 강도를 직접 조절할 수 있습니다.</p><h2>공개 전에는 초안으로</h2><p>바로 게시하지 않을 녹음은 임시 저장하고 마이의 녹음 초안에서 다시 확인하세요. 초안은 저장한 기기에 남으므로 앱 삭제나 기기 저장소 초기화 전에 필요한 녹음을 확인해야 합니다. 완성된 커버는 공개한 뒤 다른 회원이 감상하고 플레이리스트에 담을 수 있습니다.</p>'},
 '/guide/community':{title:'음악으로 연결되는 커뮤니티와 크루',body:'<h2>음악에서 사람을 만나세요</h2><p>커뮤니티에서 커버와 듀엣을 듣고, 활동명을 눌러 그 사람의 프로필과 공개 음악을 확인하세요. 마음에 드는 곡은 플레이리스트에 담고, 창작자를 팔로우하면 다시 찾기 쉬워집니다. 메시지는 상대의 프로필에서 시작할 수 있습니다.</p><h2>크루에서는 함께 듣고 대화하세요</h2><p>크루에 가입하지 않았다면 크루 둘러보기에서 검색할 수 있습니다. 가입한 뒤에는 내 크루에서 크루 채팅과 멤버, 크루의 음악을 확인하세요. 가입 전 대화는 새 멤버에게 제공되지 않습니다.</p><h2>음질 문제는 신고하고 운영자가 검토합니다</h2><p>곡 화면의 음질 문제 신고에서 심한 잡음, 녹음 끊김이나 듣기 어려운 소리 등 구체적인 상황을 알려주세요. 동일 회원의 중복 신고는 한 번만 집계합니다. 서로 다른 회원 3명 이상의 신고 또는 60일간 유효 재생이 없는 곡은 운영자 검토 대상입니다. 신고나 미재생만으로 자동 삭제하지 않습니다.</p><h2>권리와 개인정보를 지켜주세요</h2><p>직접 만들었거나 게시할 권한이 있는 음악과 이미지만 올려주세요. 타인의 개인정보나 원치 않는 메시지를 공개하지 마세요. 저작권·이용 관련 문의는 고객센터에서 접수할 수 있습니다.</p><p><a href="/contact">고객센터</a> · <a href="/terms">이용약관</a></p>'}
};
function card(t){return `<article class="music-card"><h2><a href="/music/${encodeURIComponent(t.id)}">${esc(t.title)}</a></h2><p>${esc(t.artist)} · ${t.kind==='cover'?'커버곡':'제작곡'} · ${esc(t.genre||'장르 미등록')}</p>${t.description?`<p>${esc(t.description)}</p>`:''}<a href="/#song/${encodeURIComponent(t.id)}">곡 열기 · 듣기</a></article>`;}
function nav(){return '<nav aria-label="음악과 이용 안내"><a href="/music">공개 음악</a> · <a href="/guide/listening">감상·플레이리스트</a> · <a href="/guide/recording">녹음 안내</a> · <a href="/guide/community">커뮤니티·크루</a></nav>';}
function document(title,body,path){return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | AIFECT</title><meta name="description" content="${esc(title)}. AIFECT의 공개 음악과 참여형 음악 커뮤니티."><link rel="canonical" href="https://aifect.co.kr${esc(path)}"><link rel="stylesheet" href="/policies.css"><link rel="stylesheet" href="/brand.css"></head><body class="legal-site"><header class="legal-header"><a class="legal-brand" href="/">AIFECT</a><a href="/#home">음악 앱 열기</a></header><main class="legal-content">${nav()}<h1>${esc(title)}</h1>${body}</main><footer class="page-footer">${businessFooterHTML()}</footer></body></html>`;}
function response(req,html,status=200){return new Response(req.method==='HEAD'?null:html,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
export async function publicMusicRoute(req,env,path){
 if(!['GET','HEAD'].includes(req.method))return null;
 if(guides[path])return response(req,document(guides[path].title,guides[path].body,path));
 const single=path.match(/^\/music\/([\w-]+)$/);
 if(!['/','/index.html','/music','/sitemap.xml'].includes(path)&&!single)return null;
 const tracks=await trackList(env,single?`${VISIBLE()} AND t.id=?`:VISIBLE(),single?[single[1]]:[],'t.created DESC',single?1:path==='/sitemap.xml'?1000:path==='/music'?100:12);
 if(path==='/sitemap.xml'){
  const original=await publicPageRoute(req,path),xml=await original.text();
  const links=['/music',...Object.keys(guides),...tracks.map(t=>'/music/'+t.id)];
  return new Response(req.method==='HEAD'?null:xml.replace('</urlset>',links.map(p=>`<url><loc>https://aifect.co.kr${esc(p)}</loc></url>`).join('')+'</urlset>'),{headers:{'content-type':'application/xml; charset=utf-8','cache-control':'no-store'}});
 }
 if(single){
  const t=tracks[0];if(!t)return response(req,document('공개된 음악을 찾을 수 없습니다','<p>비공개 또는 제거된 음악입니다.</p><a href="/music">공개 음악 둘러보기</a>',path),404);
  const related=await trackList(env,`${VISIBLE()} AND t.producer_id=? AND t.id!=?`,[t.producer_id,t.id],'t.created DESC',6);
  const body=`${card(t)}<h2>곡 정보</h2><dl><dt>올린 사람</dt><dd>${esc(t.producer)}</dd><dt>공개일</dt><dd>${new Date(t.created*1000).toISOString().slice(0,10)}</dd><dt>길이</dt><dd>${Math.floor(t.duration/60)}분 ${Math.floor(t.duration%60)}초</dd></dl><p><a href="/#producer/${encodeURIComponent(t.producer_id)}">${esc(t.producer)}의 프로필</a></p>${t.original_id?`<p>커버 원곡: <a href="/music/${encodeURIComponent(t.original_id)}">${esc(t.original_title)}</a></p>`:''}${t.accepts_covers?'<p>이 곡은 제작자가 커버 참여를 허용한 곡입니다. <a href="/#karaoke">부르기에서 반주 준비 여부 확인하기</a></p>':''}${related.length?'<h2>같은 창작자의 다른 음악</h2>'+related.map(card).join(''):''}`;
  return response(req,document(t.title+' · '+t.artist,body,path));
 }
 const content=`<section><h1>음악을 듣고, 직접 참여하는 AIFECT</h1><p>창작자가 공개한 제작곡과 회원이 직접 부른 커버를 발견하세요. 좋은 커버도 플레이리스트에 담고, 같은 곡을 부르거나 듀엣으로 참여할 수 있습니다.</p>${nav()}<h2>새로 공개된 음악</h2>${tracks.length?tracks.map(card).join(''):'<p>아직 공개된 음악이 없습니다.</p>'}</section>`;
 if(path==='/music')return response(req,document('공개 음악',content.replace('<h1>음악을 듣고, 직접 참여하는 AIFECT</h1>',''),path));
 const asset=await env.ASSETS.fetch(req),html=await asset.text();
 return response(req,html.replace(/<main id="main"[^>]*>[\s\S]*?<\/main>/,`<main id="main" tabindex="-1">${content}</main>`),asset.status);
}
