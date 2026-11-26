import {stickers,token} from './chat-sticker-body.js';
import {PREMIUM_OPEN_NOTICE} from './premium-open-notice.js';

export const noticeFormat=1;
export const noticeJsonLimit=1024*1024;
export const noticeContentLimit=256*1024;
export const noticeImageLimit=10;
export const noticeImageBounds=Object.freeze({width:1200,height:2400,quality:0.85,targetBytes:500*1024});
export const legacyNoticeImage='premium-open-event-banner';
export const noticeLinks=Object.freeze({
 '#home':'홈','#play':'플레이','#karaoke':'노래방','#live?mode=karaoke':'라이브 노래방',
 '#voice?mode=talk':'토킹룸','#community/crews':'크루','#karaoke/duets':'듀엣',
 '#karaoke/dubbing?tab=join':'더빙','#artists':'AI 아티스트','#upload':'업로드',
 '#membership':'프리미엄','#shop':'상점','#dm':'메시지','#inventory':'인벤토리'
});
export const noticeAssetId=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const detailLink=/^#song\/([\w-]{1,100})(?:\?comments=1)?$/;
const alignments=['left','center','right'];
const legacyColors=['mint','purple'];
export const noticePalette=Object.freeze({
 brand:[['민트','#8EDDD2'],['보라','#D3BAFF'],['핑크','#F4A8CE']],
 basic:[['흰색','#F5F5FC'],['회색','#A9B0C1'],['빨강','#FFA3A7'],['주황','#FFC184'],['노랑','#F2D97C'],
  ['초록','#9DDFAC'],['하늘색','#A2DFFF'],['파랑','#AEC6FF'],['보라','#D4BCEB']]
});
export function noticeColor(value){
 if(legacyColors.includes(value))return value;
 if(typeof value!=='string')return null;
 const hex=value.trim().toUpperCase();
 if(/^#[0-9A-F]{6}$/.test(hex))return hex;
 if(/^#[0-9A-F]{3}$/.test(hex))return '#'+[...hex.slice(1)].map(char=>char.repeat(2)).join('');
 return null;
}
const blockTypes=['p','h2','h3','li'];
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const invalid=()=>{throw new Error('공지 본문 또는 서식을 확인해 주세요.');};
const bytes=value=>new TextEncoder().encode(value).length;

export function noticeHref(value){
 if(typeof value!=='string'||!value.trim()||value.length>2048||/[\u0000-\u0020\\\u007f]/.test(value))return null;
 if(Object.hasOwn(noticeLinks,value)||detailLink.test(value))return value;
 let url;
 try{url=new URL(value);}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password)return null;
 if(['aifect.co.kr','www.aifect.co.kr'].includes(url.hostname.toLowerCase())){
  return url.pathname==='/'&&!url.search&&(Object.hasOwn(noticeLinks,url.hash)||detailLink.test(url.hash))?url.hash:null;
 }
 return url.href;
}

function checkedHref(value){
 if(value==null||value==='')return undefined;
 const href=noticeHref(value);
 if(!href)throw new Error('등록된 아이팩트 경로나 HTTPS 링크를 입력해 주세요.');
 return href;
}

function safeRun(run){
 if(!run||typeof run!=='object'||Array.isArray(run))invalid();
 if(Object.hasOwn(run,'sticker')){
  if(!stickers.has(run.sticker))throw new Error('등록된 이모티콘을 선택해 주세요.');
  return {sticker:run.sticker};
 }
 if(typeof run.text!=='string')invalid();
 const text=run.text.replace(/\r\n?/g,'\n').replace(/\u0000/g,'');
 if(!text)return null;
 const color=noticeColor(run.color);
 return {text,...(run.bold===true?{bold:true}:{}),...(run.italic===true?{italic:true}:{}),
  ...(run.underline===true?{underline:true}:{}),...(run.strike===true?{strike:true}:{}),
  ...(color?{color}:{}),...(run.href?{href:checkedHref(run.href)}:{})};
}

export function cleanNoticeContent(value,{required=false}={}){
 if(!value||value.format!==noticeFormat||typeof value.title!=='string'||!Array.isArray(value.blocks))invalid();
 if(value.blocks.length>4096)invalid();
 const title=value.title.replace(/[\r\n\t]/g,' ').replace(/\u0000/g,'').trim();
 let imageCount=0;
 const blocks=value.blocks.map(block=>{
  if(!block||typeof block!=='object'||Array.isArray(block))invalid();
  const {type}=block,align=alignments.includes(block.align)?block.align:'left';
  if(type==='hr')return {type};
  if(type==='image'){
   if(++imageCount>noticeImageLimit)throw new Error('이미지는 최대 '+noticeImageLimit+'장까지 첨부할 수 있습니다.');
   if(typeof block.asset!=='string'||!(noticeAssetId.test(block.asset)||block.asset===legacyNoticeImage))invalid();
   const width=Number(block.width??100);
   if(!Number.isInteger(width)||width<10||width>100)invalid();
   const href=checkedHref(block.href);
   return {type,asset:block.asset,alt:typeof block.alt==='string'?block.alt.slice(0,300):'',align,width,...(href?{href}:{})};
  }
  if(!blockTypes.includes(type)||!Array.isArray(block.runs))invalid();
  const runs=block.runs.map(safeRun).filter(Boolean);
  if(type==='li'&&!['ol','ul'].includes(block.list))invalid();
  return {type,align,...(type==='li'?{list:block.list}:{}),runs};
 });
 if(required&&(!title||!blocks.some(b=>b.type==='image'||b.runs?.some(x=>x.sticker||x.text.trim())))){
  throw new Error('제목과 본문을 입력해 주세요.');
 }
 const data={format:noticeFormat,title,blocks};
 if(bytes(JSON.stringify(data))>noticeContentLimit)throw new Error('공지 본문 용량을 줄여 주세요.');
 return data;
}

export const noticeAssetsIn=content=>[...new Set(content.blocks.filter(b=>b.type==='image'&&b.asset!==legacyNoticeImage).map(b=>b.asset))];
export const noticeSongsIn=content=>[...new Set(content.blocks.flatMap(b=>[b.href,...(b.runs??[]).map(r=>r.href)])
 .map(href=>typeof href==='string'?detailLink.exec(href)?.[1]:null).filter(Boolean))];
export const noticeLength=content=>Array.from(content.blocks.flatMap(b=>b.runs??[]).map(r=>r.text??'').join('')).length;

export function noticePlainText(content,{links=true}={}){
 return content.blocks.map(b=>{
  if(b.type==='hr')return '──────────';
  if(b.type==='image')return [b.alt,b.href].filter(Boolean).join(' ');
  return b.runs.map(r=>r.sticker?stickers.get(r.sticker)?.label??'':r.text+(links&&r.href?' ('+r.href+')':'')).join('');
 }).join('\n');
}

export function noticeForMember(content,name){
 if(!name)return content;
 return {...content,title:content.title.replaceAll('{닉네임}',()=>name),blocks:content.blocks.map(b=>b.runs?
  {...b,runs:b.runs.map(r=>r.text?{...r,text:r.text.replaceAll('{닉네임}',()=>name)}:r)}:b)};
}

export function legacyNoticeContent(legacy,{welcome=false}={}){
 const para=(text,extras={})=>({type:'p',align:'left',runs:[{text,...extras}]});
 if(welcome){
  return {format:noticeFormat,title:legacy.greeting,blocks:[
   ...legacy.intro.map(text=>para(text)),
   ...legacy.sections.flatMap(s=>[
    {type:'hr'},{type:'h3',align:'left',runs:[{text:s.title}]},para(s.body),
    ...(noticeHref(s.href)&&s.label?[para(s.label,{href:s.href,bold:true,color:'mint'})]:[])
   ]),{type:'hr'},...legacy.closing.map(text=>para(text))
  ]};
 }
 return {format:noticeFormat,title:legacy.title,blocks:[
  ...(legacy.banner===PREMIUM_OPEN_NOTICE.banner?[{type:'image',asset:legacyNoticeImage,alt:'AIFECT 프리미엄 오픈 이벤트',align:'left',width:100}]:[]),
  ...legacy.body.split('\n\n').map(text=>para(text))
 ]};
}

export const noticeAssetURL=(asset,campaignId)=>'/api/notices/official/'+encodeURIComponent(campaignId)+'/images/'+encodeURIComponent(asset);
export const adminNoticeAssetURL=asset=>asset===legacyNoticeImage?PREMIUM_OPEN_NOTICE.banner:'/api/admin/notices/images/'+encodeURIComponent(asset);
export function giftThumbnail(value){
 return typeof value==='string'&&/^\/(?:assets|api\/product-assets)\/[\w./-]+\.(?:webp|png|jpe?g)$/i.test(value)&&
  !value.includes('..')?value:'';
}

function linkHTML(href,body){
 const safe=noticeHref(href);
 return safe?'<a class="text-link welcome-guide-link" href="'+escapeHTML(safe)+'"'+(safe.startsWith('#')?'':' target="_blank" rel="noopener noreferrer"')+'>'+body+'</a>':body;
}
function renderRun(run,renderStickers,editing){
 if(run.sticker){
  if(!stickers.has(run.sticker))return '';
  const mark=renderStickers?.(token(run.sticker),escapeHTML)??escapeHTML('['+stickers.get(run.sticker).label+']');
  return editing?'<span contenteditable="false" data-notice-sticker="'+run.sticker+'">'+mark+'</span>':mark;
 }
 let markup=escapeHTML(run.text).replace(/\n/g,'<br>');
 for(const [key,tag] of [['bold','strong'],['italic','em'],['underline','u'],['strike','s']])if(run[key])markup='<'+tag+'>'+markup+'</'+tag+'>';
 const color=noticeColor(run.color);
 if(color)markup='<span data-notice-color="'+color+'"'+(color.startsWith('#')?' style="--notice-text-color:'+color+'"':'')+'>'+markup+'</span>';
 return linkHTML(run.href,markup);
}

export function renderNoticeBody(content,{imageURL,renderStickers,editing=false}={}){
 let list='',markup='';
 const closeList=()=>{if(list){markup+='</'+list+'>';list='';}};
 for(const block of content.blocks){
  if(block.type!=='li'||list!==block.list)closeList();
  const align=alignments.includes(block.align)?block.align:'left';
  if(block.type==='hr'){markup+='<hr>';continue;}
  if(block.type==='image'){
   const width=Number.isInteger(block.width)&&block.width>=10&&block.width<=100?block.width:100;
   const picture='<img src="'+escapeHTML(imageURL(block.asset))+'" alt="'+escapeHTML(block.alt)+'" loading="'+(editing?'eager':'lazy')+'" draggable="false">';
   markup+='<figure class="official-rich-image" data-align="'+align+'" data-width="'+width+'"'+
    (editing?' contenteditable="false" data-notice-asset="'+escapeHTML(block.asset)+'" data-href="'+escapeHTML(noticeHref(block.href)||'')+'"':'')+
    ' style="--notice-image-width:'+width+'%">'+(editing?picture:noticeZoomButton(picture,block.alt)+
     (noticeHref(block.href)?linkHTML(block.href,'연결된 링크 열기'):'') )+'</figure>';
   continue;
  }
  if(!blockTypes.includes(block.type))continue;
  if(block.type==='li'&&!list){list=block.list==='ol'?'ol':'ul';markup+='<'+list+'>';}
  const thumbnail=block.type==='p'&&!editing&&giftThumbnail(block.thumbnail);
  if(thumbnail){
   markup+='<p class="official-gift-line"><img src="'+escapeHTML(thumbnail)+'" alt="" loading="lazy"><span>'+
    block.runs.map(r=>renderRun(r,renderStickers,false)).join('')+'</span></p>';
   continue;
  }
  markup+='<'+block.type+' data-align="'+align+'">'+(block.runs.map(r=>renderRun(r,renderStickers,editing)).join('')||'<br>')+'</'+block.type+'>';
 }
 closeList();
 return markup;
}

export function noticeZoomButton(picture,alt=''){
 return '<button type="button" class="official-rich-image-zoom" data-notice-image aria-label="'+
  escapeHTML(alt?'이미지 확대 · '+alt:'이미지 확대')+'">'+picture+'</button>';
}

export function openNoticeImage(event){
 if(event.defaultPrevented)return false;
 const trigger=event.target.closest?.('[data-notice-image]');
 const image=trigger?.querySelector('img');
 if(!image)return false;
 event.preventDefault();
 const dialog=document.createElement('dialog');
 dialog.className='official-notice-image-dialog';
 dialog.setAttribute('aria-label','공지 이미지 확대');
 const copy=image.cloneNode(false);
 copy.removeAttribute('loading');
 copy.removeAttribute('width');
 copy.removeAttribute('height');
 const close=document.createElement('button');
 close.type='button';close.textContent='닫기';close.onclick=()=>dialog.close();
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 dialog.addEventListener('close',()=>{dialog.remove();trigger.focus({preventScroll:true});},{once:true});
 dialog.append(close,copy);
 document.body.append(dialog);
 dialog.showModal();
 return true;
}

export function renderNoticeEntry(entry,{imageURL=asset=>noticeAssetURL(asset,entry.id.replace(/^campaign:/,'')),renderStickers}={}){
 const name='official-notice-'+escapeHTML(entry.id),date=new Date(Number(entry.created)*1000);
 const time=Number(entry.created)>0&&Number.isFinite(date.valueOf())?
  '<time class="welcome-guide-time" datetime="'+date.toISOString()+'">'+date.toLocaleString('ko-KR',
   {timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})+'</time>':'';
 return '<div class="official-notice-entry" data-notice-id="'+escapeHTML(entry.id)+'">'+time+
  '<article class="welcome-guide official-rich-notice" aria-labelledby="'+name+'"><div class="welcome-guide-greeting"><h2 id="'+name+'">'+
  (entry.test?'[테스트] ':'')+escapeHTML(entry.rich.title)+'</h2></div><div class="official-rich-body">'+
  renderNoticeBody(entry.rich,{imageURL,renderStickers})+'</div>'+(entry.edited_at?'<small class="official-notice-edited">수정됨</small>':'')+'</article></div>';
}
