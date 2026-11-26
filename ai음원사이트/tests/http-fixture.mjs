import {createServer} from 'node:http';
import {once} from 'node:events';
import worker from '../server/index.js';
import {fixture} from './fixture.mjs';

// Real loopback HTTP requests, with isolated SQLite and in-memory R2 adapters.
// No production credentials, .dev.vars, external service or persistent data.
export async function httpFixture(t){
 const originalStream=globalThis.FixedLengthStream;
 globalThis.FixedLengthStream=class extends TransformStream{constructor(length){let count=0;super({transform(chunk,controller){count+=chunk.byteLength;if(count>length)throw Error('Stream too long');controller.enqueue(chunk);},flush(){if(count!==length)throw Error('Stream length mismatch');}});}};
 const cleanup=[],f=await fixture({after:fn=>cleanup.push(fn)}),objects=new Map(),pending=new Set();
 const BUCKET={
  async put(key,body,options={}){const bytes=new Uint8Array(await new Response(body).arrayBuffer());objects.set(key,{bytes,httpMetadata:options.httpMetadata});return {key,size:bytes.length};},
  async head(key){const o=objects.get(key);return o?{key,size:o.bytes.length,httpMetadata:o.httpMetadata}:null;},
  async get(key,options={}){const o=objects.get(key);if(!o)return null;const r=options.range,bytes=r?o.bytes.slice(r.offset,r.offset+r.length):o.bytes;return {body:bytes,size:o.bytes.length,httpMetadata:o.httpMetadata};},
  async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);},
  async list({prefix=''}){return {objects:[...objects.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key})),truncated:false};}
 };
 const env={DB:f.DB,BUCKET,AUTH_PEPPER:'isolated-http-fixture-only',TRANSCODER_TOKEN:'local-transcoder-test'};
 let origin;
 const server=createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const part of req)chunks.push(part);
   const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const result=await worker.fetch(request,env,{waitUntil(p){pending.add(p);p.catch(()=>{}).finally(()=>pending.delete(p));}});
   res.statusCode=result.status;for(const [key,value] of result.headers)if(key!=='set-cookie')res.setHeader(key,value);
   const cookies=result.headers.getSetCookie();if(cookies.length)res.setHeader('set-cookie',cookies);
   res.end(Buffer.from(await result.arrayBuffer()));
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await Promise.allSettled([...pending]);for(const fn of cleanup)await fn();if(originalStream)globalThis.FixedLengthStream=originalStream;else delete globalThis.FixedLengthStream;});
 return {origin,...f};
}
