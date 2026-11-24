import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const stores={
 ios:'https://apps.apple.com/kr/app/id6819654764',
 android:'https://play.google.com/store/apps/details?id=kr.co.aifect.app'
};
const devices={
 iphone:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'},
 ipad:{userAgent:'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'},
 ipod:{userAgent:'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'},
 ipados:{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',platform:'MacIntel',maxTouchPoints:5},
 android:{userAgent:'Mozilla/5.0 (Linux; Android 16; SM-F741N) AppleWebKit/537.36 Chrome/142.0.0.0 Mobile Safari/537.36'},
 mac:{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',platform:'MacIntel',maxTouchPoints:0},
 windows:{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36',platform:'Win32',maxTouchPoints:10}
};
function context(device,inApp=false){
 const globals={inApp,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),icon:()=>'<svg></svg>'};
 if(device!==undefined)globals.navigator=device;
 const c=vm.createContext(globals);
 vm.runInContext(readFileSync(new URL('../dist/home.js',import.meta.url),'utf8'),c);
 return c;
}
function campaign(c){return vm.runInContext("homeBanners.find(b=>b.id==='app-download')",c);}
function classes(node){return String(node.attrs.class||'').split(/\s+/);}
// Inspect actual output nesting, so browser-invalid nested links and hidden
// focusable controls fail independently of the renderer's template structure.
function elements(html){
 const nodes=[],stack=[],voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
 for(const match of html.matchAll(/<(\/?)([a-z][\w:-]*)\b([^>]*)>/gi)){
  const [,closing,name,tail]=match,tag=name.toLowerCase();
  if(closing){const index=stack.findLastIndex(node=>node.tag===tag);if(index>=0)stack.length=index;continue;}
  const attrs=Object.fromEntries(Array.from(tail.matchAll(/([^\s=/'">]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g),m=>[m[1],m[2]??m[3]??m[4]??'']));
  const node={tag,attrs,parent:stack.at(-1)||null};nodes.push(node);
  if(!voidTags.has(tag)&&!tail.trimEnd().endsWith('/'))stack.push(node);
 }
 return nodes;
}
function verifyStoreLinks(nodes){
 const links=nodes.filter(node=>node.tag==='a'&&Object.hasOwn(node.attrs,'data-home-store'));
 assert.equal(links.length,2,'exactly one visible control for each store');
 assert.deepEqual(Object.fromEntries(links.map(link=>[link.attrs['data-home-store'],link.attrs.href])),stores);
 for(const link of links){
  assert.ok(link.attrs['aria-label']?.trim(),'store links have useful accessible names');
  for(let parent=link.parent;parent;parent=parent.parent){
   assert.ok(!['a','button'].includes(parent.tag),'store links must not be nested in another interactive control');
   assert.notEqual(parent.attrs['aria-hidden'],'true','store links must remain exposed to assistive technology');
  }
 }
 return links;
}

test('whole-banner destinations identify iOS, desktop-mode iPadOS and Android without guessing desktop devices',()=>{
 const c=context();
 for(const name of ['iphone','ipad','ipod','ipados'])assert.equal(c.homeAppStoreURL(devices[name]),stores.ios,name);
 assert.equal(c.homeAppStoreURL({userAgent:devices.ipados.userAgent,maxTouchPoints:5}),stores.ios,'iPadOS Macintosh UA without platform');
 assert.equal(c.homeAppStoreURL({platform:'MacIntel',maxTouchPoints:5}),stores.ios,'iPadOS platform with minimal UA');
 assert.equal(c.homeAppStoreURL(devices.android),stores.android);
 assert.equal(c.homeAppStoreURL({userAgent:'Mozilla/5.0',userAgentData:{platform:'Android'}}),stores.android,'reduced Android UA with client hints');
 for(const device of [devices.mac,devices.windows,{userAgent:'Mozilla/5.0 (X11; Linux x86_64)'},{userAgent:'Unknown mobile browser',maxTouchPoints:5},{}])assert.equal(c.homeAppStoreURL(device),'');
 assert.equal(c.homeAppStoreURL(),'','rendering without navigator must remain safe');
 assert.equal(context(devices.iphone).homeAppStoreURL(),stores.ios,'default reads the current navigator');
 assert.equal(context(devices.android).homeAppStoreURL(),stores.android);
});

test('public home adds one app-download campaign and native app home preserves its existing campaigns',()=>{
 const web=context(),native=context(devices.iphone,true);
 const webIds=Array.from(vm.runInContext('homeBanners',web),b=>b.id),nativeIds=Array.from(vm.runInContext('homeBanners',native),b=>b.id);
 assert.equal(webIds[0],'app-download');assert.equal(webIds.filter(id=>id==='app-download').length,1);
 assert.deepEqual(webIds.slice(1),['studio','play','participate','artists','karaoke','talking','crew','premium']);
 assert.deepEqual(nativeIds,webIds.slice(1));
 assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('homeAppStores',web))),stores);
 const b=campaign(web);
 assert.equal(b.title,'앱 다운로드');assert.equal(b.headline,'아이팩트 앱 지금 다운로드하세요');
 assert.equal(b.subtitle,'AI 음악 · 커버 · 더빙을 더 가까이.');assert.equal(b.cta,'앱 다운로드');
});

test('mobile whole-banner links choose the device store while the explicit store links retain their own destinations',()=>{
 for(const [device,destination] of [[devices.iphone,stores.ios],[devices.ipados,stores.ios],[devices.android,stores.android]]){
  const c=context(device),html=c.homeBannerHTML(campaign(c)),nodes=elements(html);
  const wrapper=nodes.find(n=>n.attrs['data-home-banner']==='app-download');
  assert.equal(wrapper?.tag,'div');assert.ok(classes(wrapper).includes('home-feature-slide'));assert.ok(classes(wrapper).includes('home-promo-link'));
  const hitareas=nodes.filter(node=>classes(node).includes('home-app-hitarea'));
  assert.equal(hitareas.length,1);assert.equal(hitareas[0].tag,'a');assert.equal(hitareas[0].attrs.href,destination);
  assert.ok(hitareas[0].attrs['aria-label']?.includes('다운로드'));
  const links=verifyStoreLinks(nodes);
  assert.equal(links[0].parent,links[1].parent,'the store links are siblings');
  assert.ok(classes(links[0].parent).includes('home-app-store-links'));
  assert.equal(nodes.filter(node=>node.tag==='a').length,3);
  assert.doesNotMatch(html,/출시 준비|준비 중|COMING SOON/);
 }
});

test('desktop and unknown devices expose a chooser button instead of an arbitrary automatic store redirect',()=>{
 for(const device of [devices.mac,devices.windows,{},undefined]){
  const c=context(device),nodes=elements(c.homeAppDownloadBannerHTML(campaign(c)));
  const hitarea=nodes.find(node=>classes(node).includes('home-app-hitarea'));
  assert.equal(hitarea?.tag,'button');assert.equal(hitarea.attrs.type,'button');
  assert.ok(Object.hasOwn(hitarea.attrs,'data-home-app-choose'));
  assert.ok(hitarea.attrs['aria-label']?.includes('다운로드'));
  assert.equal(hitarea.attrs.href,undefined);
  verifyStoreLinks(nodes);
  assert.equal(nodes.filter(node=>node.tag==='a').length,2);
 }
});

test('the existing dialog receives a clear download title and both real store destinations',()=>{
 const c=context(),html=c.homeAppDownloadDialogHTML();
 assert.match(html,/아이팩트 앱|AIFECT 앱/);assert.match(html,/다운로드/);
 const nodes=elements(html),links=nodes.filter(n=>n.tag==='a');
 assert.equal(links.length,2);
 assert.deepEqual(new Set(links.map(link=>link.attrs.href)),new Set(Object.values(stores)));
 assert.match(html,/Google Play/);assert.match(html,/App Store/);
 assert.doesNotMatch(html,/준비 중|출시 준비|COMING SOON/);
});

test('app campaign pictures and preceding-slide preloads use the same responsive assets',()=>{
 const c=context(devices.android),b=campaign(c),html=c.homeBannerHTML(b);
 const base='/assets/home-banners/app-download-20261124/';
 for(const width of [768,1536])assert.equal(c.homeBannerImage('app-download',width),base+'app-download-mobile-'+width+'.webp');
 const desktop=base+'app-download-desktop-1420.webp 1420w, '+base+'app-download-desktop-2840.webp 2840w';
 assert.equal(c.homeBannerDesktopSources('app-download'),desktop);
 const picture=html.match(/<picture\b[^>]*>[\s\S]*?<\/picture>/)?.[0];assert.ok(picture);
 const pictureNodes=elements(picture),source=pictureNodes.find(node=>node.tag==='source'),img=pictureNodes.find(node=>node.tag==='img');
 assert.equal(source.attrs.media,'(min-width: 801px)');assert.equal(source.attrs.srcset,desktop);
 assert.equal(img.attrs.src,c.homeBannerImage('app-download',1536));
 assert.equal(img.attrs.srcset,c.homeBannerImage('app-download',768)+' 768w, '+c.homeBannerImage('app-download',1536)+' 1536w');
 for(const previous of vm.runInContext("homeBanners.filter(b=>b.id==='studio'||b.id==='premium')",c)){
  const preloads=elements(c.homeBannerHTML(previous,b)).filter(node=>node.tag==='link'&&node.attrs.rel==='preload');
  assert.ok(preloads.some(node=>node.attrs.media==='(min-width: 801px)'&&node.attrs.imagesrcset===desktop),'desktop next-slide preload must use the new campaign');
  assert.ok(preloads.some(node=>node.attrs.media==='(max-width: 800px)'&&node.attrs.href===img.attrs.src),'mobile next-slide preload must use the new campaign');
 }
});
