import {fail} from './db.js';

const verified = new WeakSet();
export const isMcpAdmin = user => !!user && verified.has(user);

// These headers are asserted by Sites Dispatch, never by an AIFECT cookie.
// Host this route ONLY behind Sites. A direct Worker origin must not expose it.
export function authenticateMcp(req, env) {
 const principal = req.headers.get('oai-authenticated-user-id');
 if (!principal || principal.length > 200 || /\s/.test(principal)) fail(401, 'ChatGPT 인증이 필요합니다.');
 if (env.AIFECT_MCP_ENABLED !== 'true' || !env.AIFECT_MCP_OWNER_ID || principal !== env.AIFECT_MCP_OWNER_ID) fail(403, '등록된 AIFECT 운영자만 사용할 수 있습니다.');
 const user = Object.freeze({id:'sites:'+principal, name:'AIFECT 관리자'});
 verified.add(user);
 return user;
}
