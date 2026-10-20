// Shared by the existing Site Worker and the dedicated room Worker. No secrets in clients.
const encoder = new TextEncoder();
export function fault(status, message) { throw Object.assign(new Error(message), {status}); }
export const reply = (body, status = 200) => Response.json(body, {status, headers:{'cache-control':'no-store'}});
export function identifier(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)||['__proto__','prototype','constructor'].includes(value)) fault(400, '잘못된 식별자예요.'); return value; }
export function requestId(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,64}$/.test(value)) fault(400, '전송 요청을 다시 시작해주세요.'); return value; }
export function text(value, max) { if(typeof value!=='string'||!value.trim()||value.trim().length>max)fault(400,'입력 내용을 확인해주세요.'); return value.trim(); }
async function key(secret) { if(!secret || secret.length<32)fault(503,'토킹룸 연결 설정을 준비하고 있어요.'); return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']); }
const hex = data => Array.from(new Uint8Array(data), b=>b.toString(16).padStart(2,'0')).join('');
export async function signedHeaders(secret, path, body, timestamp = Date.now(), nonce = crypto.randomUUID()) {
 const signature = hex(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(`${timestamp}\n${nonce}\n${path}\n${body}`)));
 return {'content-type':'application/json','x-aifect-time':String(timestamp),'x-aifect-nonce':nonce,'x-aifect-signature':signature};
}
export async function verifyRequest(req, secret, body, now=Date.now()) {
 const timestamp=Number(req.headers.get('x-aifect-time')),nonce=req.headers.get('x-aifect-nonce')||'',signature=req.headers.get('x-aifect-signature')||'';
 if(!Number.isSafeInteger(timestamp)||Math.abs(now-timestamp)>30000||!/^[-\w]{16,64}$/.test(nonce)||!/^[0-9a-f]{64}$/.test(signature))fault(401,'서버 인증을 확인해주세요.');
 const bytes=Uint8Array.from(signature.match(/../g),x=>parseInt(x,16));
 if(!await crypto.subtle.verify('HMAC',await key(secret),bytes,encoder.encode(`${timestamp}\n${nonce}\n${new URL(req.url).pathname}\n${body}`)))fault(401,'서버 인증을 확인해주세요.');
 return {nonce,timestamp};
}
export function audioOffer(description, mid) {
 if(description?.type!=='offer'||typeof description.sdp!=='string'||description.sdp.length>24000)fault(400,'마이크 연결 정보를 확인해주세요.');
 const sections=description.sdp.split(/\r?\nm=/).slice(1);
 const directions=sections[0]?.match(/^a=(sendonly|recvonly|sendrecv|inactive)\r?$/gm)||[];
 if(sections.length!==1||!sections[0].startsWith('audio ')||!sections[0].includes('a=mid:'+mid+'\r\n')||directions.length!==1||!directions[0].includes('a=sendonly'))fault(400,'마이크 오디오만 송출할 수 있어요.');
 return {type:'offer',sdp:description.sdp};
}
export function audioAnswer(description,mids) {
 if(description?.type!=='answer'||typeof description.sdp!=='string'||description.sdp.length>24000)fault(400,'수신 연결 정보를 확인해주세요.');
 const sections=description.sdp.split(/\r?\nm=/).slice(1),seen=new Set();
 for(const section of sections){
  const mid=section.match(/(?:^|\n)a=mid:([^\r\n]+)/)?.[1];
  const directions=section.match(/^a=(sendonly|recvonly|sendrecv|inactive)\r?$/gm)||[];
  if(!section.startsWith('audio ')||!mids.includes(mid)||seen.has(mid)||directions.length!==1||!/(recvonly|inactive)/.test(directions[0]))fault(400,'청취 연결에서는 음성을 송출할 수 없어요.');
  seen.add(mid);
 }
 if(seen.size!==mids.length)fault(400,'수신 연결 정보를 확인해주세요.');
 return {type:'answer',sdp:description.sdp};
}
