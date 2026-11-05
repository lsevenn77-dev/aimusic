import verifiedObjects from './data/iwinv-image-mirror.json' with {type:'json'};
import {fail,json} from './db.js';

const uploaded = new Set(verifiedObjects);
const imagePrefixes = ['images/', 'cover/', 'cover-source/', 'chat-images/', 'crew-chat-images/'];
const imagePath = /^(?:images\/(?:ai-bot-staging\/[a-f0-9]{64}|(?:track|producer|artist|banner|playlist|crew|crew-notice)\/[\w-]+\/(?:gallery\/|banner\/)?[\w-]+)|cover\/[\w-]+\.jpg|cover-source\/[\w-]+|(?:crew-)?chat-images\/[\w-]+\.webp)$/;
const imageTypes = new Set(['image/webp','image/jpeg','image/png','image/gif','image/avif']);
const maxBytes = 16 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8',{fatal:true});
const directBase = 'https://lseven7.cache.iwinv.net/Image/';
const pullBase = /^https:\/\/lseven7\.ext[1-5]\.cache\.iwinv\.net$/;
const idPattern = /^[a-f0-9]{64}$/;
const opaquePath = /^\/mirror\/v1\/([\w-]{39,750})\/([a-f0-9]{64})\.bin$/;
const notFound = () => new Response(null,{status:404,headers:{'cache-control':'private, no-store'}});
const toBase64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function fromBase64(value){
 if(!/^[\w-]+$/.test(value))throw new Error('invalid');
 return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),ch=>ch.charCodeAt(0));
}
function hex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function configured(env){
 const secret=env.AIFECT_IMAGE_MIRROR_SECRET;
 return typeof secret==='string' && secret.length>=32 && secret!==env.AIFECT_IMAGE_EXPORT_TOKEN;
}
async function material(env){
 const master=await crypto.subtle.importKey('raw',encoder.encode(env.AIFECT_IMAGE_MIRROR_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const derive=async(purpose,identity='')=>new Uint8Array(await crypto.subtle.sign('HMAC',master,encoder.encode(JSON.stringify(['aifect/image-mirror/v1',purpose,identity]))));
 const sealKey=await crypto.subtle.importKey('raw',await derive('handle-key'),'AES-GCM',false,['encrypt','decrypt']);
 return {derive,sealKey};
}
function describe(object,legacyType){
 if(!object || !imagePath.test(object.key) || !object.version || !Number.isSafeInteger(object.size) || object.size<1 || object.size>maxBytes)return null;
 const stored=object.httpMetadata?.contentType?.toLowerCase().split(';')[0].trim();
 const type=(!stored||stored==='application/octet-stream')?legacyType:stored;
 if(!imageTypes.has(type))return null;
 return {identity:JSON.stringify([object.key,object.version,object.size,type]),type};
}
async function packAes(key,iv,bytes){
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes));
 const packed=new Uint8Array(iv.length+encrypted.length);packed.set(iv);packed.set(encrypted,iv.length);return packed;
}
async function sealPath(keys,path,id){
 // The id commits to path, R2 upload version, size and type. Each handle IV
 // therefore encrypts exactly one immutable plaintext across retries/cache fills.
 const iv=(await keys.derive('handle-iv',id)).subarray(0,12);
 return toBase64(await packAes(keys.sealKey,iv,encoder.encode(path)));
}
async function openPath(keys,handle){
 if(typeof handle!=='string'||handle.length>750)return null;
 try{
  const bytes=fromBase64(handle);
  const path=decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12)},keys.sealKey,bytes.subarray(12)));
  return imagePath.test(path)?path:null;
 }catch{return null;}
}
function actualType(data){
 const bytes=new Uint8Array(data),ascii=(start,end)=>String.fromCharCode(...bytes.subarray(start,end));
 if(ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP')return 'image/webp';
 if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return 'image/jpeg';
 if(ascii(0,8)==='\x89PNG\r\n\x1a\n')return 'image/png';
 if(['GIF87a','GIF89a'].includes(ascii(0,6)))return 'image/gif';
 if(ascii(4,8)==='ftyp'){
  const boxEnd=bytes.length>=8?Math.min(new DataView(bytes.buffer).getUint32(0),bytes.length,256):0;
  for(let pos=8;pos+4<=boxEnd;pos+=4)if(pos!==12 && ['avif','avis'].includes(ascii(pos,pos+4)))return 'image/avif';
 }
 return null;
}
async function inspectMetadata(env,object){
 const meta=describe(object);
 if(meta||!object||!imagePath.test(object.key)||!object.version||!Number.isSafeInteger(object.size)||object.size<1||object.size>maxBytes)return meta;
 // Older cover uploads can have a generic content type. Read only their header
 // and never reinterpret objects with an explicitly non-image content type.
 const type=object.httpMetadata?.contentType?.split(';')[0].trim().toLowerCase();
 if(type && type!=='application/octet-stream')return null;
 const prefix=await env.BUCKET.get(object.key,{range:{offset:0,length:Math.min(256,object.size)}});
 if(!prefix)return null;
 if(prefix.version!==object.version){await prefix.body?.cancel();return null;}
 return describe(object,actualType(await prefix.arrayBuffer()));
}
export function wantsImageGrant(req,env){
 if(!configured(env) || (!uploaded.size && !pullBase.test(env.AIFECT_IMAGE_PULL_BASE||'')))return false;
 return req.method==='GET' && req.headers.get('x-aifect-image-mirror')==='1' && !req.headers.has('range') && new URL(req.url).pathname.startsWith('/media/');
}
export async function imageGrant(req,env,object,type){
 if(!wantsImageGrant(req,env))return null;
 const meta=await inspectMetadata(env,object);
 if(!meta || meta.type!==type)return null;
 const keys=await material(env),id=hex(await keys.derive('file-id',meta.identity));
 let url;
 if(uploaded.has(id))url=directBase+id+'.bin';
 else if(pullBase.test(env.AIFECT_IMAGE_PULL_BASE||'')){
  const handle=await sealPath(keys,object.key,id);
  url=env.AIFECT_IMAGE_PULL_BASE+'/mirror/v1/'+handle+'/'+id+'.bin';
 }else return null;
 return json({url,key:toBase64(await keys.derive('file-key',meta.identity)),type},200,{'vary':'X-Aifect-Image-Mirror, Cookie, Authorization','x-content-type-options':'nosniff'});
}
async function ciphertext(req,env,handle,id,origin){
 if(!configured(env)||!idPattern.test(id||''))return notFound();
 const keys=await material(env),path=await openPath(keys,handle);
 if(!path)return notFound();
 const head=await env.BUCKET.head(path),meta=await inspectMetadata(env,head);
 if(!meta || hex(await keys.derive('file-id',meta.identity))!==id)return origin?notFound():json({error:'Object changed or missing'},409);
 const headers={'content-type':'application/octet-stream','x-content-type-options':'nosniff','content-length':String(head.size+28),
  'cache-control':origin?'public, max-age=86400, immutable':'private, no-store'};
 if(origin)headers['access-control-allow-origin']='*';
 if(req.method==='HEAD')return new Response(null,{headers});
 const object=await env.BUCKET.get(path);
 if(describe(object,meta.type)?.identity!==meta.identity){await object?.body?.cancel();return origin?notFound():json({error:'Object changed or missing'},409);}
 const data=await object.arrayBuffer();
 if(data.byteLength!==head.size||actualType(data)!==meta.type)return origin?notFound():json({error:'Invalid image contents'},422);
 const key=await crypto.subtle.importKey('raw',await keys.derive('file-key',meta.identity),'AES-GCM',false,['encrypt']);
 const bytes=await packAes(key,crypto.getRandomValues(new Uint8Array(12)),data);
 return new Response(bytes,{headers});
}
export async function imageOriginRequest(req,env){
 const url=new URL(req.url),match=opaquePath.exec(url.pathname);
 if(!match || url.search || !['HEAD','GET'].includes(req.method) || req.headers.has('authorization') || req.headers.has('cookie'))return notFound();
 return ciphertext(req,env,match[1],match[2],true);
}
function pageCursor(raw){
 if(!raw)return [0,null];
 try{
  if(raw.length>5000)throw Error();
  const pair=JSON.parse(decoder.decode(fromBase64(raw)));
  if(!Array.isArray(pair)||pair.length!==2||!Number.isInteger(pair[0])||pair[0]<0||pair[0]>=imagePrefixes.length||!(pair[1]===null||typeof pair[1]==='string'))throw Error();
  return pair;
 }catch{fail(400,'Invalid cursor');}
}
async function inventory(env,rawCursor){
 const [index,cursor]=pageCursor(rawCursor);
 const result=await env.BUCKET.list({prefix:imagePrefixes[index],...(cursor?{cursor}:{}),limit:25,include:['httpMetadata']});
 const keys=await material(env),objects=[];
 for(const object of result.objects){
  const meta=await inspectMetadata(env,object);if(!meta)continue;
  const id=hex(await keys.derive('file-id',meta.identity));
  objects.push({id,handle:await sealPath(keys,object.key,id),size:object.size,type:meta.type});
 }
 const next=result.truncated?[index,result.cursor]:[index+1,null];
 return json({objects,nextCursor:next[0]<imagePrefixes.length?toBase64(encoder.encode(JSON.stringify(next))):null,skipped:result.objects.length-objects.length});
}
async function authorized(req,env){
 const token=env.AIFECT_IMAGE_EXPORT_TOKEN,header=req.headers.get('authorization')||'';
 if(!configured(env)||typeof token!=='string'||token.length<32||!header.startsWith('Bearer ')||header.length>1024)return false;
 // Verify fixed-length digests with WebCrypto's HMAC verification primitive.
 const key=await crypto.subtle.importKey('raw',encoder.encode(token),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 const mac=await crypto.subtle.sign('HMAC',key,encoder.encode(token));
 return crypto.subtle.verify('HMAC',key,mac,encoder.encode(header.slice(7)));
}
export async function imageExportRequest(req,env){
 if(!await authorized(req,env))return notFound();
 if(req.method!=='GET')return new Response(null,{status:405,headers:{allow:'GET','cache-control':'no-store'}});
 const url=new URL(req.url);
 if(url.pathname==='/internal/image-mirror/inventory')return inventory(env,url.searchParams.get('cursor'));
 if(url.pathname==='/internal/image-mirror/blob')return ciphertext(req,env,url.searchParams.get('handle'),url.searchParams.get('id'),false);
 return notFound();
}
