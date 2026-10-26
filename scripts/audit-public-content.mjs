// Read-only review of the same public HTML a signed-out visitor receives.
// Range probes fetch 32 bytes only: no playback event, statistics or DB writes.
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.argv[2]||'https://aifect.co.kr';
const output=process.argv[3]||'work/adsense/public-content.json';
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const get=async(path,options={})=>fetch(new URL(path,origin),{...options,signal:AbortSignal.timeout(20000)});
const home=await get('/'),homeHTML=await home.text(),main=homeHTML.match(/<main id="main"[\s\S]*?<\/main>/)?.[0]||'';
const sitemap=await get('/sitemap.xml'),xml=await sitemap.text();
const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>new URL(m[1]).pathname);
const pages=[];
for(const path of urls){
 const response=await get(path),html=await response.text();
 const item={path,status:response.status,title:text(html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1]||'')};
 if(path.startsWith('/music/')){
  item.description=text(html.match(/<h2>창작자의 곡 소개<\/h2><p class="public-story">([\s\S]*?)<\/p>/)?.[1]||'');
  item.needsCreatorDescription=item.description.length<30||/^[\d\s\p{P}\p{S}]+$/u.test(item.description);
  item.inlinePreview=html.includes('<audio');
  const media='/media/'+path.split('/').pop()+'/preview';
  const head=await get(media,{method:'HEAD'});item.mediaHeadStatus=head.status;
  const sample=await get(media,{headers:{Range:'bytes=0-31'}});item.mediaRangeStatus=sample.status;item.mediaType=sample.headers.get('content-type');
  await sample.body?.cancel();
 }
 pages.push(item);
}
const ads=await get('/ads.txt'),robots=await get('/robots.txt');
const report={checkedAt:new Date().toISOString(),origin,home:{status:home.status,initialMusicLinks:(main.match(/href="\/music\//g)||[]).length},adsTxt:{status:ads.status,body:await ads.text()},robots:{status:robots.status,body:await robots.text()},pages};
const {dirname}=await import('node:path');await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,pages:pages.length,tracks:pages.filter(p=>p.path.startsWith('/music/')).length,home:report.home,failedPages:pages.filter(p=>p.status!==200),failedMedia:pages.filter(p=>p.mediaHeadStatus&&p.mediaHeadStatus!==200).map(p=>p.path),descriptionReview:pages.filter(p=>p.needsCreatorDescription).map(p=>({title:p.title,description:p.description}))},null,2));
