import {fail,id,now,one,query,rate,rows,str} from './db.js';
import {activeAudienceCheck,audienceCandidates,createAudienceCheck,eligibleNoticeMember,readAudience} from './notice-audience.js';
import {noticeTestMember} from './notice-campaigns.js';
import {catalog,grantable,GIFT_OPTION,PRODUCT_ID,VERSION_ID} from './product-catalog.js';
import {parseProductDeadline,productGrantExpiry} from './product-deadline.js';
import {permanentHeldSQL} from './decorations.js';
import {PERMANENT_PERIOD} from '../shared/decorations.js';
import {bumpGiftArrivalVersion} from './notice-visibility.js';

export const giftDispatchKey=value=>{
 if(typeof value!=='string'||!VERSION_ID.test(value))fail(400,'작업 번호를 확인해 주세요.');
 return value;
};

export async function giftDispatch(env,key,{preview=false}={}){
 const job=await one(env,'SELECT * FROM gift_dispatches WHERE id=? '+(preview?'':'AND confirmed_at IS NOT NULL'),giftDispatchKey(key));
 if(!job)fail(404,'선물 발송 작업을 찾을 수 없습니다.');
 return job;
}

export async function configuredGiftTestMember(env,actor){
 return env.AIFECT_GIFT_DISPATCH_TEST_MODE==='true'?noticeTestMember(env,actor):null;
}

const productValue=(line,key)=>'json_extract('+line+",'$."+key+"')";
const lineOf=(job,item)=>"json_extract("+job+".plan,'$['||"+item+".line||']')";
const duplicate=(uid,line)=>productValue(line,'option')+"='"+PERMANENT_PERIOD+"' AND "+
 permanentHeldSQL(uid,productValue(line,'product_id'));
const revisionChanged=line=>`COALESCE((SELECT revision FROM product_catalog p WHERE p.product_id=${productValue(line,'product_id')}),0)<>${productValue(line,'revision')}`;
const retiring=line=>`EXISTS(SELECT 1 FROM product_deletions p WHERE p.product_id=${productValue(line,'product_id')})`;
const confirmedBeforeRetirement=(line,job)=>`EXISTS(SELECT 1 FROM product_deletions p JOIN product_catalog c USING(product_id)
 WHERE p.product_id=${productValue(line,'product_id')} AND p.state IN ('pending','ready')
 AND ${job}.confirmed_at<=p.requested_at AND c.revision=${productValue(line,'revision')}+1)`;
const deadlineExpired=line=>`(${productValue(line,'fixed_until')}<=unixepoch() OR ${productValue(line,'season_ends_at')}<=unixepoch())`;
const deadlineAt=(line,at)=>{
 const fixed=productValue(line,'fixed_until'),season=productValue(line,'season_ends_at');
 const end=`CASE ${productValue(line,'deadline.mode')} WHEN 'days' THEN ${at}+${productValue(line,'deadline.days')}*86400 ELSE ${fixed} END`;
 return `CASE WHEN ${season} IS NULL THEN (${end}) ELSE min(COALESCE((${end}),${season}),${season}) END`;
};

function checkedDate(value,at){
 const end=productGrantExpiry(parseProductDeadline({mode:'date',date:value}),at);
 if(end<=at)fail(400,'오늘 이후의 종료일을 선택해 주세요.');
 return end;
}

async function checkedPlan(env,requested,origin,at){
 if(!Array.isArray(requested)||!requested.length||requested.some(x=>!x||typeof x.product_id!=='string'||!PRODUCT_ID.test(x.product_id)))
  fail(400,'실제 발송할 상품과 이용 옵션을 선택해 주세요.');
 const products=await catalog(env,requested.map(item=>item.product_id)),selected=new Set();
 return requested.map(item=>{
  const product=products.get(item.product_id),option=item.option,quantity=item.quantity;
  if(!product||!grantable(product)||!product.asset)fail(409,'현재 발송 가능한 상품을 다시 선택해 주세요.');
  if(product.revision!==item.revision)fail(409,'상품 정보가 변경되었습니다. 최신 상품을 확인해 주세요.');
  if(typeof option!=='string'||!Object.hasOwn(product.options,option)||(product.type==='gift'&&option!==GIFT_OPTION))
   fail(400,'상품의 실제 이용 옵션을 선택해 주세요.');
  if(!Number.isInteger(quantity)||quantity<1||quantity>100||(option===PERMANENT_PERIOD&&quantity!==1))
   fail(400,'발송 수량은 1~100개입니다. 영구 이용권은 회원당 한 개까지 발송할 수 있습니다.');
  const identity=product.id+':'+option;
  if(selected.has(identity))fail(400,'같은 상품과 옵션의 수량을 한 항목에 입력해 주세요.');
  selected.add(identity);
  const deadline=item.deadline==null?product.grantDeadline:parseProductDeadline(item.deadline);
  if(!deadline&&(origin==='event'||product.eventOnly))fail(400,'이벤트 발송에는 기한 또는 명시적인 기한 없음 선택이 필요합니다.');
  const fixed_until=deadline?.mode==='date'?checkedDate(deadline.date,at):null;
  if(item.season_date&&product.type==='gift')fail(400,'시즌 종료일은 장착형 상품에서 선택해 주세요.');
  const season_ends_at=item.season_date?checkedDate(item.season_date,at):null;
  if(fixed_until&&season_ends_at&&fixed_until>season_ends_at)fail(400,'사용 시작 기한은 시즌 종료일 이내로 입력해 주세요.');
  return {product_id:product.id,option,quantity,name:product.name,type:product.type,distribution:product.distribution,
   currency:product.currency,value:product.value??product.options[option],revision:product.revision,asset_version:product.activeVersion,
   thumbnail:product.asset.files.thumbnail??'',deadline,fixed_until,season_ends_at};
 });
}

export async function prepareGiftDispatch(env,actor,input){
 const at=now(),key=id(),origin=input.origin;
 if(!['admin','event'].includes(origin))fail(400,'발송 출처를 선택해 주세요.');
 if(input.push===true)fail(409,'선물 안내의 앱 푸시 연결을 확인해 주세요.');
 const reason=str(input.reason,300),message=str(input.message??'',1000,false);
 const test=input.test===true,member=test?await configuredGiftTestMember(env,actor):null;
 if(test&&!member)fail(403,'격리된 환경에 연결한 본인 검증 계정을 확인해 주세요.');
 const audience=test?{type:'test',ids:[member.id]}:readAudience(input.audience);
 const plan=await checkedPlan(env,input.products,origin,at);
 await rate(env,'gift-dispatch-preview:'+actor,60,3600);
 const check=await createAudienceCheck(env,actor,audience,{
  oldId:input.previous_check||null,duplicates:test?0:(input.audience.ids?.length??0)-audience.ids.length
 });
 if(!check.count)return {check,id:null,products:plan,quantity:0};
 await env.DB.batch([
  query(env,`DELETE FROM gift_dispatches WHERE id IN (SELECT id FROM gift_dispatches
   WHERE admin_id=? AND confirmed_at IS NULL AND expires<=? LIMIT 2)`,actor,at),
  query(env,`INSERT INTO gift_dispatches(id,admin_id,check_id,audience,target_count,plan,origin,reason,message,test,expires)
   VALUES(?,?,?,?,?,?,?,?,?,?,?)`,key,actor,check.id,audience.type,check.count,JSON.stringify(plan),origin,reason,message,+test,check.expires),
  query(env,`INSERT INTO gift_dispatch_items(id,dispatch_id,user_id,line,state,issue)
   SELECT lower(hex(randomblob(16))),?,m.user_id,p.key,
    CASE WHEN ${duplicate('m.user_id','p.value')} THEN 'excluded' ELSE 'pending' END,
    CASE WHEN ${duplicate('m.user_id','p.value')} THEN 'permanent_owned' END
   FROM notice_target_members m CROSS JOIN json_each(?) p WHERE m.check_id=?`,key,JSON.stringify(plan),check.id)
 ]);
 const counts=await rows(env,`SELECT line,SUM(state='excluded') excluded FROM gift_dispatch_items
  WHERE dispatch_id=? GROUP BY line ORDER BY line`,key);
 const products=plan.map((item,index)=>{
  const excluded=counts[index]?.excluded??0,recipients=check.count-excluded;
  return {...item,excluded,recipients,units:recipients*item.quantity,preview_until:productGrantExpiry(item.deadline,at)};
 });
 return {id:key,check,products,quantity:products.reduce((sum,p)=>sum+p.units,0),message,test,push:'unavailable'};
}

export async function confirmGiftDispatch(env,actor,key){
 const job=await giftDispatch(env,key,{preview:true});
 if(job.admin_id!==actor)fail(403,'확인한 운영자만 발송을 시작할 수 있습니다.');
 if(job.confirmed_at)return job;
 const at=now(),check=await activeAudienceCheck(env,actor,job.check_id);
 if(job.test&&(await configuredGiftTestMember(env,actor))?.id!==check.audience.ids[0])
  fail(403,'격리 검증 계정 연결을 다시 확인해 주세요.');
 const current=audienceCandidates(check.audience,at),members='SELECT user_id FROM notice_target_members WHERE check_id=?';
 const line=lineOf('gift_dispatches','i');
 const [updated]=await env.DB.batch([
  query(env,`WITH current(id) AS (${current.sql})
   UPDATE gift_dispatches SET confirmed_at=? WHERE id=? AND confirmed_at IS NULL AND expires>unixepoch()
    AND EXISTS (SELECT 1 FROM notice_target_checks WHERE id=? AND owner_id=? AND expires>unixepoch())
    AND EXISTS (SELECT 1 FROM gift_dispatch_items WHERE dispatch_id=? AND state='pending')
    AND NOT EXISTS(SELECT id FROM current EXCEPT ${members})
    AND NOT EXISTS(${members} EXCEPT SELECT id FROM current)
    AND NOT EXISTS(SELECT 1 FROM json_each(plan) p WHERE ${revisionChanged('p.value')} OR ${retiring('p.value')} OR ${deadlineExpired('p.value')})
    AND NOT EXISTS(SELECT 1 FROM gift_dispatch_items i WHERE i.dispatch_id=gift_dispatches.id
     AND (i.state='excluded')<>(${duplicate('i.user_id',line)}))`,
   ...current.params,at,key,check.id,actor,key,check.id,check.id),
  query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created)
   SELECT ?,admin_id,'gift_dispatch:confirm',json_object('dispatch_id',id,'target_count',target_count,'test',test),confirmed_at
   FROM gift_dispatches WHERE id=? AND changes()=1`,'gift-dispatch:'+key,key)
 ]);
 const confirmed=await giftDispatch(env,key,{preview:true});
 if(!updated.meta.changes&&!confirmed.confirmed_at){
  fail(409,'회원 명단, 상품 또는 보유 상태가 변경되었습니다. 최종 확인을 다시 열어 주세요.');
 }
 return confirmed;
}

const batchRows=96;
const batchUnits=1200;
const unitsCTE='WITH RECURSIVE units(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM units WHERE n+1<100)';

export async function issueGiftDispatchBatch(env,job){
 const key=job.id,token=id(),line=lineOf('d','i');
 const selected=`FROM gift_dispatch_items i JOIN gift_dispatches d ON d.id=i.dispatch_id
  JOIN units ON units.n<${productValue(line,'quantity')} WHERE i.dispatch_id=? AND i.token=? AND i.state='granted'`;
 const terms=`json_object('origin',d.origin,'deadline',${productValue(line,'deadline')},'currency',${productValue(line,'currency')},
  'value',${productValue(line,'value')},'settlement','excluded','policy',1,'product_revision',${productValue(line,'revision')},
  'asset_version',${productValue(line,'asset_version')},'test',d.test)`;
 const [changed]=await env.DB.batch([
  query(env,`WITH next AS MATERIALIZED (
   SELECT i.id,${productValue(line,'quantity')} quantity FROM gift_dispatch_items i
   JOIN gift_dispatches d ON d.id=i.dispatch_id WHERE i.dispatch_id=? AND i.state='pending'
    AND d.confirmed_at IS NOT NULL ORDER BY i.id LIMIT ?
  ), budget AS (
   SELECT id,SUM(quantity) OVER (ORDER BY id) units FROM next
  ), checked AS MATERIALIZED (
   SELECT i.id,${deadlineAt(line,'unixepoch()')} expires_at,
    CASE WHEN NOT EXISTS(SELECT 1 FROM users u WHERE u.id=i.user_id AND ${eligibleNoticeMember}) THEN 'member_changed'
     WHEN (${revisionChanged(line)} OR ${retiring(line)}) AND NOT ${confirmedBeforeRetirement(line,'d')} THEN 'product_changed'
     WHEN ${deadlineExpired(line)} THEN 'deadline_expired'
     WHEN ${duplicate('i.user_id',line)} THEN 'permanent_owned' END issue
   FROM budget b JOIN gift_dispatch_items i ON i.id=b.id JOIN gift_dispatches d ON d.id=i.dispatch_id
   WHERE b.units<=?
  )
  UPDATE gift_dispatch_items AS item SET token=?,issue=c.issue,state=CASE WHEN c.issue IS NULL THEN 'granted' ELSE 'failed' END,
   granted_at=CASE WHEN c.issue IS NULL THEN unixepoch() END,expires_at=CASE WHEN c.issue IS NULL THEN c.expires_at END
  FROM checked c WHERE item.id=c.id AND item.state='pending'`,key,batchRows,batchUnits,token),
  query(env,`${unitsCTE} INSERT INTO gift_inventory
    (id,user_id,gift_type,gift_name,currency,value,source,request_id,unit,created,expires_at,grant_terms,dispatch_item)
   SELECT i.id||'-'||units.n,i.user_id,${productValue(line,'product_id')},${productValue(line,'name')},
    'reward',0,'reward','dispatch-'||i.id,units.n,i.granted_at,i.expires_at,${terms},i.id
   ${selected} AND ${productValue(line,'type')}='gift'`,key,token),
  query(env,`${unitsCTE} INSERT INTO player_inventory
    (id,user_id,item_key,source,source_ref,granted_at,period_code,redeem_before,season_ends_at,grant_terms,dispatch_item)
   SELECT i.id||'-'||units.n,i.user_id,${productValue(line,'product_id')},'decoration_stock',i.id||'-'||units.n,
    i.granted_at,${productValue(line,'option')},i.expires_at,${productValue(line,'season_ends_at')},${terms},i.id
    ${selected} AND ${productValue(line,'type')}<>'gift'`,key,token),
  bumpGiftArrivalVersion(env,"SELECT dispatch_id,user_id FROM gift_dispatch_items WHERE dispatch_id=? AND token=? AND state='granted'",key,token)
 ]);
 return changed.meta.changes;
}

export async function retryGiftDispatch(env,actor,job,requestKey,ids){
 const key='gift-dispatch:retry:'+giftDispatchKey(requestKey);
 const scope=ids===null?null:JSON.stringify(ids),target=JSON.stringify({dispatch_id:job.id,ids});
 await env.DB.batch([
  query(env,`UPDATE gift_dispatch_items AS i SET state='pending',issue=NULL WHERE dispatch_id=? AND state='failed'
   AND (? IS NULL OR user_id IN (SELECT value FROM json_each(?)))
   AND NOT EXISTS(SELECT 1 FROM gift_dispatches d WHERE d.id=i.dispatch_id AND ${retiring(lineOf('d','i'))})
   AND NOT EXISTS(SELECT 1 FROM admin_audit WHERE id=?)`,job.id,scope,scope,key),
  query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created)
   VALUES(?,?,'gift_dispatch:retry',?,?) ON CONFLICT(id) DO NOTHING`,key,actor,target,now())
 ]);
 const log=await one(env,'SELECT admin_id,target FROM admin_audit WHERE id=?',key);
 if(log.admin_id!==actor||log.target!==target)fail(409,'이미 다른 재시도에 사용된 요청 번호입니다.');
}
