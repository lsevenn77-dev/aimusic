import {fail} from './db.js';
export const MAX_AUDIO=80*1024*1024;
export const originalKey=track=>track.original_key||`original/${track.id}.${track.original_ext}`;
export async function put(env,key,req,max,type){
 const len=Number(req.headers.get('content-length'));if(!len||len>max)fail(413,`파일 용량은 ${Math.round(max/1024/1024)}MB 이하여야 합니다.`);
 const stream=new FixedLengthStream(len);
 const pumping=req.body.pipeTo(stream.writable);
 await Promise.all([env.BUCKET.put(key,stream.readable,{httpMetadata:{contentType:type}}),pumping]);
}
export function parseRange(value,size){
 if(!value)return null;
 const m=/^bytes=(\d*)-(\d*)$/.exec(value);if(!m||(!m[1]&&!m[2]))return false;
 let start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));let end=m[1]?(m[2]?Number(m[2]):size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start)return false;
 end=Math.min(end,size-1);return {offset:start,length:end-start+1};
}
function imageCacheControl(req,isPublic,imageVersion){
 if(!isPublic)return 'private, no-store';
 if(!imageVersion)return 'public, max-age=3600';
 const requestedVersion=new URL(req.url).searchParams.get('v');
 if(!requestedVersion)return 'public, max-age=3600';
 // Routes serve the latest image. Never mark new bytes immutable under an old URL.
 return requestedVersion===imageVersion?'public, max-age=2592000, immutable':'public, max-age=0, must-revalidate';
}
function matchesEtag(value,etag){
 return value?.split(',').some(tag=>tag.trim()==='*'||tag.trim().replace(/^W\//,'')===etag);
}
export async function objectResponse(req,env,key,type,isPublic=false,{imageVersion}={}){
 const head=await env.BUCKET.head(key);if(!head)fail(404,'파일을 찾을 수 없습니다.');
 const image=type.startsWith('image/'),headers={'content-type':type,'accept-ranges':'bytes','cache-control':image?imageCacheControl(req,isPublic,imageVersion):isPublic?'public, max-age=3600':'private, no-store','x-content-type-options':'nosniff'};
 if(image&&isPublic){
  const etag=head.httpEtag||(head.etag?`"${head.etag}"`:null);
  if(etag){
   headers.etag=etag;
   if(['GET','HEAD'].includes(req.method)&&matchesEtag(req.headers.get('if-none-match'),etag))return new Response(null,{status:304,headers});
  }
 }
 const range=parseRange(req.headers.get('range'),head.size);if(range===false)return new Response(null,{status:416,headers:{'content-range':`bytes */${head.size}`,'cache-control':'private, no-store'}});
 headers['content-length']=String(range?.length||head.size);
 if(range)headers['content-range']=`bytes ${range.offset}-${range.offset+range.length-1}/${head.size}`;
 if(req.method==='HEAD')return new Response(null,{status:range?206:200,headers});
 const obj=await env.BUCKET.get(key,range?{range}:undefined);return new Response(obj.body,{status:range?206:200,headers});
}
