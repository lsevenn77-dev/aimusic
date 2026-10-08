import {Buffer} from 'node:buffer';

// Apple's verifier uses node-fetch v2 for OCSP. Use Workers' native transport
// while retaining the response.buffer() method and request timeout it expects.
export const Headers=globalThis.Headers;
export const Request=globalThis.Request;
export const Response=globalThis.Response;
export default async function appleFetch(url,options={}){
 const {timeout,signal,...init}=options;
 init.headers=new Headers(init.headers);
 if(!init.headers.has('User-Agent'))init.headers.set('User-Agent','node-fetch/1.0 (+https://github.com/bitinn/node-fetch)');
 // RFC 5019 section 5: short OCSP requests use a URL-encoded GET. Apple's
 // responders accept this from Workers and still return signed OCSP evidence.
 if(init.method==='POST'&&init.headers.get('Content-Type')==='application/ocsp-request'&&init.body instanceof Uint8Array){
  const endpoint=new URL(url);
  if(['http:','https:'].includes(endpoint.protocol)&&endpoint.hostname.endsWith('.apple.com')&&!endpoint.search&&!endpoint.hash){
   const getURL=String(url).replace(/\/$/,'')+'/'+encodeURIComponent(Buffer.from(init.body).toString('base64'));
   if(getURL.length<=255){url=getURL;init.method='GET';delete init.body;init.headers.delete('Content-Type');init.headers.delete('Content-Length');init.headers.set('Accept','application/ocsp-response');}
  }
 }
 const deadline=timeout>0?AbortSignal.timeout(timeout):null;
 if(signal||deadline)init.signal=signal&&deadline?AbortSignal.any([signal,deadline]):signal||deadline;
 const response=await globalThis.fetch(url,init);
 response.buffer=async()=>Buffer.from(await response.arrayBuffer());
 return response;
}
