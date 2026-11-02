// Only public presentation data leaves Sites. No Cookie, Host, auth/user headers or arbitrary query parameters.
import { publicMusicRoute, readPublicMusicData } from './public-music.js';
import { publicPageRoute } from './public-pages.js';
export const publicPath = path => /^(?:\/|\/index\.html|\/music(?:\/[\w-]+)?|\/about|\/guide\/(?:listening|community|recording)|\/(?:pricing|terms|privacy|refund|contact|business)\/?)$/.test(path);
const base='https://billing.aifect.co.kr/aifect-origin/';
export const release=typeof __CAFE24_BUILD__==='string'?__CAFE24_BUILD__:'';
export async function originRequest(env, action, body, contentType, ms, fetcher=fetch, version=release){
 if(!env.CAFE24_ORIGIN_KEY||!version)return null;
 return fetcher(base+(action==='webp'?'v1':version)+'/'+action,{method:'POST',headers:{authorization:'Bearer '+env.CAFE24_ORIGIN_KEY,'content-type':contentType},body,redirect:'error',signal:AbortSignal.timeout(ms)});
}
export async function tryPublicOrigin(req,env,path,requestOrigin=originRequest){
 if(!env.CAFE24_ORIGIN_KEY||!publicPath(path)||!['GET','HEAD'].includes(req.method))return null;
 const url=new URL(req.url),q=new URLSearchParams();
 if(path==='/music')for(const key of ['q','genre','kind','page'])if(url.searchParams.has(key))q.set(key,url.searchParams.get(key).slice(0,100));
 const target=path+(q.size?'?'+q:'');
 const data=await readPublicMusicData(req,env,path);
 try{
  const r=await requestOrigin(env,'page',JSON.stringify({target,data}),'application/json',1800);
  if(r&&[200,404].includes(r.status)&&r.headers.get('x-aifect-rendered')==='1'){
   const h=new Headers({'x-aifect-web-origin':'cafe24','x-content-type-options':'nosniff'});
   for(const name of ['content-type','cache-control','content-security-policy'])if(r.headers.has(name))h.set(name,r.headers.get(name));
   const html=await r.text();
   if(html.startsWith('<!doctype html>')||html.startsWith('<!DOCTYPE html>'))return new Response(req.method==='HEAD'?null:html,{status:r.status,headers:h});
  }
 }catch{/* Retry only the local renderer using the already authorized public rows. */}
 return await publicMusicRoute(req,env,path,data)||publicPageRoute(req,path);
}
