import {fail} from './db.js';
import {signedHeaders,identifier} from '../realtime/protocol.js';

export const voiceConfigured=env=>!!(env.VOICE_SERVICE_URL&&env.VOICE_BRIDGE_SECRET);
export async function voiceCall(env,actor,room,action,input={},socket=false) {
 if(!voiceConfigured(env))fail(503,'토킹룸 서비스 연결을 준비하고 있습니다.');
 const root=new URL(env.VOICE_SERVICE_URL);if(root.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(root.hostname))fail(503,'토킹룸 서버 주소를 확인해 주세요.');
 const path=`/rooms/${identifier(room)}/${action}`,body=JSON.stringify({actor,input}),headers=await signedHeaders(env.VOICE_BRIDGE_SECRET,path,body);
 if(socket){headers.upgrade='websocket';headers['x-voice-payload']=btoa(String.fromCharCode(...new TextEncoder().encode(body)));}
 const response=await fetch(new URL(path,root),{method:socket?'GET':'POST',headers,body:socket?undefined:body,redirect:'manual',...(!socket?{signal:AbortSignal.timeout(25000)}:{})});
 if(response.status>=300&&response.status<400)fail(502,'토킹룸 서버 주소가 변경되었습니다. 연결 설정을 확인해 주세요.');
 return response;
}
