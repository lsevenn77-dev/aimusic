import {fail,id,json,now,one,query,rows} from './db.js';
import {eligibleNoticeMember,memberExclusion,normalizePublicCode,noticeMemberColumns,publicCode,resolveNoticeMembers} from './notice-audience.js';

const memberMatch=`FROM public_profile_ids m JOIN users u ON u.id=m.user_id
 WHERE ${eligibleNoticeMember} AND m.code=?`;
export const selectedNoticeTestTargets=`SELECT u.id,t.public_id FROM notice_test_recipients t
 JOIN public_profile_ids m ON m.code=t.public_id JOIN users u ON u.id=m.user_id
 WHERE t.selected=1 AND ${eligibleNoticeMember}`;
const recipientError={
 invalid_format:'회원 고유 ID 형식을 확인해 주세요.',
 not_found:'해당 회원 고유 ID를 찾을 수 없습니다.',
 withdrawn:'탈퇴한 회원입니다.',
 ai_account:'AI 활동 계정은 테스트 발송 대상에서 제외됩니다.'
};

export function readNoticeTestCodes(input){
 if(!Array.isArray(input)||!input.length||input.some(code=>typeof code!=='string'||!publicCode.test(code))||
    new Set(input).size!==input.length)fail(400,'선택한 테스트 수신 계정을 확인해 주세요.');
 return [...input].sort();
}

export async function listNoticeTestRecipients(env){
 const recipients=await rows(env,`SELECT ${noticeMemberColumns},t.selected,${memberExclusion} reason
  FROM notice_test_recipients t LEFT JOIN public_profile_ids m ON m.code=t.public_id
  LEFT JOIN users u ON u.id=m.user_id LEFT JOIN producers p ON p.user_id=u.id ORDER BY t.public_id`);
 return recipients.map(({id,selected,reason,...member})=>({
  ...member,selected:!!selected&&!reason,error:reason?recipientError[reason]:null
 }));
}

async function writeRecipient(env,actor,publicId,operation,at,statement){
 const [result]=await env.DB.batch([statement,
  query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created)
   SELECT ?,?,'notice:test_settings',?,? WHERE changes()=1`,id(),actor,JSON.stringify({public_id:publicId,operation}),at)
 ]);
 return !!result.meta.changes;
}

export async function addNoticeTestRecipient(env,actor,input){
 if(typeof input.public_id!=='string'||input.public_id.length>100)fail(400,'회원 고유 ID를 확인해 주세요.');
 const publicId=normalizePublicCode(input.public_id);
 if(!publicId)fail(400,'회원 고유 ID를 입력해 주세요.');
 const {members,excluded}=await resolveNoticeMembers(env,{codes:[publicId]});
 if(!members.length)fail(422,recipientError[excluded[0]?.reason]??recipientError.not_found);
 const at=now();
 const added=await writeRecipient(env,actor,publicId,'add',at,query(env,`INSERT INTO notice_test_recipients(public_id,updated_by,updated)
  SELECT m.code,?,? ${memberMatch} ON CONFLICT(public_id) DO NOTHING`,actor,at,publicId));
 if(!added){
  if(await one(env,'SELECT 1 FROM notice_test_recipients WHERE public_id=?',publicId))fail(409,'이미 등록된 테스트 수신 계정입니다.');
  fail(409,'회원 상태가 변경되었습니다. 다시 확인해 주세요.');
 }
 return json({test_recipients:await listNoticeTestRecipients(env)},201);
}

export async function selectNoticeTestRecipient(env,actor,publicId,input){
 if(typeof input.selected!=='boolean')fail(400,'테스트 수신 계정의 선택 여부를 확인해 주세요.');
 const selected=Number(input.selected),at=now();
 const changed=await writeRecipient(env,actor,publicId,input.selected?'select':'unselect',at,
  query(env,`UPDATE notice_test_recipients SET selected=?,updated_by=?,updated=? WHERE public_id=? AND selected<>?
   AND (?=0 OR EXISTS(SELECT 1 ${memberMatch}))`,selected,actor,at,publicId,selected,selected,publicId));
 const test_recipients=await listNoticeTestRecipients(env);
 if(!changed){
  const recipient=test_recipients.find(item=>item.public_id===publicId);
  if(!recipient)fail(404,'등록된 테스트 수신 계정을 찾을 수 없습니다.');
  if(input.selected&&recipient.error)fail(422,recipient.error);
 }
 return json({test_recipients});
}

export async function removeNoticeTestRecipient(env,actor,publicId){
 const at=now();
 await writeRecipient(env,actor,publicId,'remove',at,
  query(env,'DELETE FROM notice_test_recipients WHERE public_id=?',publicId));
 return json({test_recipients:await listNoticeTestRecipients(env)});
}
