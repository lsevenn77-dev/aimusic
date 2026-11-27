import {escapeHTML as esc} from '../shared/site-info.js';
import {publicMusicRoute} from './public-music.js';
import {tryPublicOrigin} from './cafe24-origin.js';
import {catalogFilters, catalogResult, discoverTracks, catalogControls, musicIntro} from './public-catalog.js';
import {publicGuides} from './public-guides.js';
import {aboutIcon as icon} from './about-icons.js';
import {viewer} from './auth.js';
import {blockedContext} from './account-safety.js';

const discoveryPath = path => path==='/music' || Object.hasOwn(publicGuides,path);
function pageHeader(path) {
 const guide=path!=='/music';
 const navLink=(href,label,active)=>`<a href="${href}"${active?' aria-current="page"':''}>${label}</a>`;
 return `<a class="skip-content" href="#content">본문으로 이동</a><header class="about-header"><div class="about-wrap discover-header">
 <a class="legal-brand" href="/">AIFECT</a>
 <nav class="discover-nav" aria-label="주 메뉴">${navLink('/music','공개 음악',!guide)}${navLink(guide?path:'/guide/listening','이용 가이드',guide)}</nav>
 <a class="app-entry" href="/#home">앱 열기 ${icon('arrow-right')}</a></div></header>`;
}
function guideNav(path) {
 return `<nav class="guide-nav" aria-label="이용 가이드">${Object.entries(publicGuides).map(([url,g])=>`<a href="${url}"${url===path?' aria-current="page"':''}>${g.label}</a>`).join('')}</nav>`;
}
const stores=`<aside class="app-stores" aria-label="모바일 앱 다운로드"><span>AIFECT 앱 다운로드</span><div><a href="https://apps.apple.com/kr/app/id6819654764">App Store</a><a href="https://play.google.com/store/apps/details?id=kr.co.aifect.app">Google Play</a></div></aside>`;
// Decorate the shared public HTML envelope at Sites ingress, as /about does.
// The public renderer continues to supply canonical metadata, legal notices and footer.
function discoveryDocument(html,path,result) {
 const guide=publicGuides[path], page=guide||musicIntro;
 const title=result?.title || guide.title+' | AIFECT';
 const intro=`<div class="discover-intro"><h1>${page.title}</h1><p>${page.summary}</p></div>`;
 const body=guide?guideNav(path)+intro+guide.body():intro+catalogControls(result.filters)+`
 <p id="catalog-status" class="visually-hidden" role="status" aria-live="polite"></p>
 <section id="catalog-results" tabindex="-1" aria-label="공개 음악 검색 결과">${result.html}</section>`;
 let head=html.slice(0,html.indexOf('</head>'))
  .replace(/<title>[\s\S]*?<\/title>/,()=>`<title>${esc(title)}</title>`)
  .replace(/<meta name="description" content="[^"]*">/,()=>`<meta name="description" content="${esc(page.summary)}">`);
 if(result){
  head=head.replace(/<meta name="robots" content="[^"]*">/,'').replace(/<link rel="canonical" href="[^"]*">/,()=>`<link rel="canonical" href="${esc(result.canonical)}">`);
  if(result.noindex)head+='<meta name="robots" content="noindex,follow">';
  if(!head.includes('href="/cover-pick.css"'))head+='<link rel="stylesheet" href="/cover-pick.css">';
 }
 head+='<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&amp;family=Noto+Sans+KR:wght@400;500;600;700;800&amp;display=swap"><link rel="stylesheet" href="/ui-region-scale.css"><link rel="stylesheet" href="/about.css"><link rel="stylesheet" href="/public-discovery.css"><script defer src="/public-discovery.js"></script>';
 return head+'</head><body class="legal-site about-page public-discovery">'+pageHeader(path)+`<main id="content" class="about-wrap discover-main">${body}${stores}</main>`+html.slice(html.indexOf('<footer'));
}

export async function publicDiscoveryRoute(req,env,path) {
 if(!discoveryPath(path)||!['GET','HEAD'].includes(req.method))return null;
 let data={}, result;
 if(path==='/music'){
  const filters=catalogFilters(req.url);
  // Signed-in general search uses the same policy as the web/app search API.
  // Only rendered public cards go to the public origin, never the viewer identity.
  if(filters.q&&req.headers.get('cookie'))env=await blockedContext(env,await viewer(req,env));
  let tracks=[],failed=false;
  try{tracks=await discoverTracks(env,filters);}
  catch(error){console.error('Public catalogue read failed',error.message);failed=true;}
  data={tracks};
  result=catalogResult(tracks,filters,failed);
  if(req.headers.get('X-AIFECT-Results')==='1'){
   return new Response(req.method==='HEAD'?null:JSON.stringify(result),{status:result.status,headers:{
    'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'X-AIFECT-Results'
   }});
  }
 }
 const envelope=await tryPublicOrigin(req,env,path,undefined,data) ?? await publicMusicRoute(req,env,path,data);
 const headers=new Headers(envelope.headers);
 if(result)headers.set('vary','X-AIFECT-Results');
 const body=req.method==='HEAD'?null:discoveryDocument(await envelope.text(),path,result);
 return new Response(body,{status:result?.status??envelope.status,headers});
}
