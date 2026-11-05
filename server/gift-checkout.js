// Shop checkout composes the existing gift ledger and notification transaction.
// Optional notes use the existing DM path (trimmed plain text, 2,000 characters).
import {one,query,id,now,str,fail,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {assertUnblocked} from './account-safety.js';
import {assertDmBody} from './dm-body.js';
import {giftRoute} from './gifts.js';
import {giftById,silverGiftById} from '../shared/gifts.js';

export async function giftCheckoutRoute(req,env,path,user){
 if(path!=='/api/gifts/checkout')return null;
 requireUser(user);if(req.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
 const b=await req.json();
 if(typeof b.profile_id!=='string'||typeof b.request_id!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(b.request_id))fail(400,'받는 회원과 요청 번호를 확인해주세요.');
 const p=await one(env,"SELECT p.id,p.user_id FROM producers p JOIN users u ON u.id=p.user_id WHERE p.id=? AND u.provider!='deleted' AND u.account_type='human'",b.profile_id||'');
 if(p?.user_id===user.id)fail(400,'본인에게는 선물할 수 없어요.');if(!p)fail(400,'선물할 다른 회원을 선택해주세요.');assertUnblocked(env,p.user_id);
 const note=b.message===undefined?'':str(b.message,2000,false);
 const previous=await one(env,"SELECT id FROM gifts WHERE sender_id=? AND request_id=? UNION ALL SELECT id FROM free_gifts WHERE sender_id=? AND request_id=?",user.id,b.request_id||'',user.id,b.request_id||'');
 const savedNote=await one(env,'SELECT body,recipient_id FROM direct_messages WHERE sender_id=? AND request_id=?',user.id,'gift:'+b.request_id);
 if(previous&&((savedNote?.body||'')!==note||(savedNote&&savedNote.recipient_id!==p.user_id)))fail(409,'이미 다른 메시지에 사용한 선물 요청이에요.');
 if(note){if(!previous)assertDmBody(note);if(!await one(env,'SELECT id FROM producers WHERE user_id=?',user.id))fail(409,'닉네임을 먼저 저장해주세요.');await rate(env,'dm:'+user.id,30,60);}
 // Append the note to the existing debit+gift batch: a note or gift failure
 // rolls back everything, and existing ledger request IDs govern retries.
 const scoped={...env,DB:{prepare:sql=>env.DB.prepare(sql),batch:statements=>env.DB.batch([...statements,...(note?[query(env,'INSERT INTO direct_messages(id,sender_id,recipient_id,body,request_id,created) VALUES(?,?,?,?,?,?)',id(),user.id,p.user_id,note,'gift:'+b.request_id,now())]:[])])}};
 const product=giftById(b.gift_type)||silverGiftById(b.gift_type);
 const source={type:'shop',id:product?.id||'gifts',title:product?.name||'골드 선물'};
 const response=await giftRoute(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(b)}),scoped,'/api/producers/'+p.id+'/gifts',user,source);
 return response||json({ok:false},404);
}
