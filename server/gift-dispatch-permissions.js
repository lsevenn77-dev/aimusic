import {isConsoleAdmin} from './admin-session.js';
import {fail} from './db.js';

export function giftDispatchPermissions(env,user){
 const assigned=key=>isConsoleAdmin(user)||(env[key]||'').split(',').some(value=>value.trim()===user.id);
 const writable=env.AIFECT_GIFT_DISPATCH_READ_ONLY!=='true';
 return {grant:writable&&assigned('AIFECT_GIFT_DISPATCH_OPERATOR_IDS'),
  adjust:writable&&assigned('AIFECT_GIFT_DISPATCH_ADJUSTER_IDS')};
}

export function requireGiftDispatchOrigin(req){
 if(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')
  fail(403,'같은 관리 화면에서 다시 실행해 주세요.');
}
