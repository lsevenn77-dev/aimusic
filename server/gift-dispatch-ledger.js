import {fail,id,now,one,query,rows,str} from './db.js';
import {publicNameSQL} from './identity.js';
import {memberCsv,readMemberIds,recordNoticeAudit} from './notice-audience.js';
import {giftDispatchKey} from './gift-dispatch.js';
import {parseProductDeadline,productGrantExpiry} from './product-deadline.js';
import {bumpGiftArrivalVersion} from './notice-visibility.js';

import {dispatchRights} from './gift-dispatch-rights.js';

const line=`json_extract(d.plan,'$['||i.line||']')`;
const quantity=`json_extract(${line},'$.quantity')`;
const idsClause='i.dispatch_id IN (SELECT value FROM json_each(?))';
const emptyTotals={ready:0,used:0,expired:0,recalled:0,unavailable:0};
export async function dispatchProgress(env,key){
 return one(env,`SELECT
  (SELECT COUNT(*) FROM gift_dispatch_items WHERE dispatch_id=? AND state='pending') pending,
  (SELECT COUNT(*) FROM gift_dispatch_items WHERE dispatch_id=? AND state='failed') failed,
  (SELECT COUNT(*) FROM gift_dispatch_items a WHERE dispatch_id=? AND line=0 AND notice_state='pending'
   AND EXISTS (SELECT 1 FROM gift_dispatch_items g INDEXED BY gift_dispatch_member_line
    WHERE g.dispatch_id=a.dispatch_id AND g.user_id=a.user_id AND g.state='granted')) notices_pending,
  (SELECT COUNT(*) FROM gift_dispatch_items WHERE dispatch_id=? AND line=0 AND notice_state='failed') notices_failed`,key,key,key,key);
}

async function summaries(env,jobs){
 if(!jobs.length)return [];
 const keys=JSON.stringify(jobs.map(job=>job.id));
 const [totals,counts]=await Promise.all([
  rows(env,`SELECT i.dispatch_id,SUM(i.state='pending') pending,SUM(i.state='failed') failed,
   SUM(i.state='excluded') excluded,SUM(CASE WHEN i.state='granted' THEN ${quantity} ELSE 0 END) granted_units,
   COUNT(DISTINCT CASE WHEN i.state='granted' THEN i.user_id END) granted_members,
   SUM(i.line=0 AND i.notice_state='sent') notices_sent,SUM(i.line=0 AND i.notice_state='failed') notices_failed,
   SUM(CASE WHEN i.line=0 AND i.notice_state='pending' THEN EXISTS (
    SELECT 1 FROM gift_dispatch_items p INDEXED BY gift_dispatch_member_line
    WHERE p.dispatch_id=i.dispatch_id AND p.user_id=i.user_id AND p.state='granted') ELSE 0 END) notices_pending
   FROM gift_dispatch_items i JOIN gift_dispatches d ON d.id=i.dispatch_id
   WHERE ${idsClause} GROUP BY i.dispatch_id`,keys),
  rows(env,`${dispatchRights(idsClause)} SELECT dispatch_id,state,COUNT(*) qty FROM rights GROUP BY dispatch_id,state`,keys)
 ]);
 const rights=new Map(),byJob=new Map(totals.map(row=>[row.dispatch_id,row]));
 for(const {dispatch_id,state,qty} of counts){
  if(!rights.has(dispatch_id))rights.set(dispatch_id,{...emptyTotals});
  rights.get(dispatch_id)[state]=qty;
 }
 return jobs.map(job=>{
  const {check_id,plan,expires,confirmed_at,...visible}=job;
  const count=byJob.get(job.id),units=rights.get(job.id)??emptyTotals;
  const status=count.pending?'processing':!count.granted_units?'failed':units.recalled?
   (units.ready?'partly_recalled':'recalled'):count.failed?'partial':'complete';
  return {...visible,confirmed_at,products:JSON.parse(plan),...count,...units,status,push:'unavailable'};
 });
}

function historyDate(value){
 return productGrantExpiry(parseProductDeadline({mode:'date',date:value}),now());
}

const has=(state)=>`EXISTS (SELECT 1 FROM gift_dispatch_items k WHERE k.dispatch_id=d.id AND k.state='${state}')`;
const hasRecall=`(EXISTS (SELECT 1 FROM gift_dispatch_items k JOIN gift_inventory g ON g.dispatch_item=k.id
 WHERE k.dispatch_id=d.id AND g.recalled_at IS NOT NULL) OR EXISTS (SELECT 1 FROM gift_dispatch_items k
 JOIN player_inventory p ON p.dispatch_item=k.id WHERE k.dispatch_id=d.id AND p.revoked<>0
 AND NOT EXISTS(SELECT 1 FROM decoration_redemptions r WHERE r.inventory_id=p.id)))`;
const hasReady=`(EXISTS (SELECT 1 FROM gift_dispatch_items k JOIN gift_inventory g ON g.dispatch_item=k.id AND g.user_id=k.user_id
 JOIN users u ON u.id=g.user_id AND u.provider<>'deleted'
 WHERE k.dispatch_id=d.id AND g.recalled_at IS NULL AND g.used_at=0 AND (g.expires_at IS NULL OR g.expires_at>unixepoch()))
 OR EXISTS (SELECT 1 FROM gift_dispatch_items k JOIN player_inventory p ON p.dispatch_item=k.id AND p.user_id=k.user_id
 JOIN users u ON u.id=p.user_id AND u.provider<>'deleted'
 WHERE k.dispatch_id=d.id AND p.revoked=0 AND (p.redeem_before IS NULL OR p.redeem_before>unixepoch())
 AND (p.season_ends_at IS NULL OR p.season_ends_at>unixepoch())))`;
const historyStatus=`CASE WHEN ${has('pending')} THEN 'processing' WHEN NOT ${has('granted')} THEN 'failed'
 WHEN ${hasRecall} THEN CASE WHEN ${hasReady} THEN 'partly_recalled' ELSE 'recalled' END
 WHEN ${has('failed')} THEN 'partial' ELSE 'complete' END`;

export async function giftDispatchHistory(env,params){
 const filters=['d.confirmed_at IS NOT NULL','d.test=?'],args=[+(params.get('test')==='1')];
 const filter=(condition,...values)=>{filters.push(condition);args.push(...values);};
 const q=params.get('q')?.trim().slice(0,128);
 if(q)filter(`(instr(lower(d.id||' '||d.reason),lower(?))>0 OR
  EXISTS (SELECT 1 FROM json_each(d.plan) p WHERE instr(lower(json_extract(p.value,'$.name')),lower(?))>0))`,q,q);
 for(const key of ['admin_id','audience','origin']){
  const value=params.get(key);
  if(value)filter('d.'+key+'=?',str(value,128));
 }
 if(params.get('type'))filter("EXISTS(SELECT 1 FROM json_each(d.plan) WHERE json_extract(value,'$.type')=?)",params.get('type'));
 if(params.get('product_id'))filter("EXISTS(SELECT 1 FROM json_each(d.plan) WHERE json_extract(value,'$.product_id')=?)",params.get('product_id'));
 if(params.get('status'))filter('('+historyStatus+')=?',params.get('status'));
 if(params.get('from'))filter('d.confirmed_at>=?',historyDate(params.get('from'))-86400);
 if(params.get('to'))filter('d.confirmed_at<?',historyDate(params.get('to')));
 const cursor=params.get('after');
 if(cursor){
  const match=/^(\d{1,12})\/([0-9a-f-]{36})$/.exec(cursor);
  if(!match)fail(400,'발송 내역 위치를 다시 확인해 주세요.');
  filter('(d.confirmed_at,d.id)<(?,?)',Number(match[1]),match[2]);
 }
 const jobs=await rows(env,`SELECT d.* FROM gift_dispatches d WHERE ${filters.join(' AND ')}
  ORDER BY d.confirmed_at DESC,d.id DESC LIMIT 21`,...args);
 const page=jobs.slice(0,20),last=page.at(-1);
 return {jobs:await summaries(env,page),next:jobs.length>20?last.confirmed_at+'/'+last.id:null};
}

export async function giftDispatchDetail(env,job){
 const [data,adjustments]=await Promise.all([
  summaries(env,[job]),
  rows(env,`SELECT o.id,o.kind,o.admin_id,o.reason,o.scope,o.deadline,o.confirmed_at,
   COUNT(e.inventory_id) quantity,MIN(e.before_expires) earliest_before,MAX(e.before_expires) latest_before
   FROM gift_dispatch_adjustments o JOIN gift_dispatch_effects e ON e.adjustment_id=o.id
   WHERE o.dispatch_id=? AND o.confirmed_at IS NOT NULL GROUP BY o.id
   ORDER BY o.confirmed_at DESC,o.id DESC LIMIT 20`,job.id)
 ]);
 return {...data[0],adjustments};
}

export async function giftDispatchMembers(env,job,params){
 const after=params.get('after')??'';
 if(after)readMemberIds([after]);
 const q=str(params.get('q')??'',128,false);
 const members=await rows(env,`SELECT i.user_id id,${publicNameSQL()} name,i.notice_state
  FROM gift_dispatch_items i LEFT JOIN users u ON u.id=i.user_id
  WHERE i.dispatch_id=? AND i.line=0 AND i.user_id>? AND (?='' OR instr(lower(i.user_id),lower(?))>0 OR
   instr(lower(${publicNameSQL()}),lower(?))>0) ORDER BY i.user_id LIMIT 31`,job.id,after,q,q,q);
 const page=members.slice(0,30);
 const selected=JSON.stringify(page.map(member=>member.id));
 const [items,rights]=await Promise.all([
  rows(env,`SELECT id,user_id,line,state,issue,granted_at,expires_at FROM gift_dispatch_items
   WHERE dispatch_id=? AND user_id IN (SELECT value FROM json_each(?)) ORDER BY user_id,line`,job.id,selected),
  rows(env,`${dispatchRights('i.dispatch_id=? AND i.user_id IN (SELECT value FROM json_each(?))')}
    SELECT item_id,state,expires_at,active_until,COUNT(*) quantity FROM rights GROUP BY item_id,state,expires_at,active_until`,job.id,selected)
 ]);
 const byMember=Map.groupBy(items,item=>item.user_id),byItem=Map.groupBy(rights,right=>right.item_id);
 return {members:page.map(m=>({...m,items:(byMember.get(m.id)??[]).map(i=>({...i,rights:byItem.get(i.id)??[]}))})),
  next:members.length>30?page.at(-1).id:null};
}

export async function giftDispatchCsv(env,actor,job){
 const members=await rows(env,`SELECT i.user_id id,${publicNameSQL()} name FROM gift_dispatch_items i
  LEFT JOIN users u ON u.id=i.user_id WHERE i.dispatch_id=? AND i.line=0 ORDER BY i.user_id`,job.id);
 await recordNoticeAudit(env,actor,'gift_dispatch:export',{dispatch_id:job.id,count:members.length});
 return memberCsv(members);
}

const scopedRights=dispatchRights('i.dispatch_id=? AND (? IS NULL OR i.user_id IN (SELECT value FROM json_each(?)))');
const eligible=`state='ready' AND (? IS NULL OR (expires_at IS NOT NULL AND expires_at<? AND
 (season_ends_at IS NULL OR season_ends_at>=?)))`;
const scopedArgs=op=>[op.dispatch_id,op.scope,op.scope];

export async function previewGiftAdjustment(env,actor,job,input){
 const kind=input.kind;
 if(!['recall','extend'].includes(kind))fail(400,'회수 또는 기한 연장을 선택해 주세요.');
 const scope=input.ids===null?null:JSON.stringify(readMemberIds(input.ids)),reason=str(input.reason,300),at=now(),key=id();
 const deadline=kind==='extend'?historyDate(input.date):null;
 if(deadline!==null&&deadline<=at)fail(400,'연장할 기한을 오늘 이후로 지정해 주세요.');
 const op={dispatch_id:job.id,scope,deadline};
 await env.DB.batch([
  query(env,`DELETE FROM gift_dispatch_adjustments WHERE id IN (SELECT id FROM gift_dispatch_adjustments
   WHERE dispatch_id=? AND confirmed_at IS NULL AND expires<=? LIMIT 2)`,job.id,at),
  query(env,`INSERT INTO gift_dispatch_adjustments(id,dispatch_id,admin_id,kind,scope,reason,deadline,expires)
   VALUES(?,?,?,?,?,?,?,?)`,key,job.id,actor,kind,scope,reason,deadline,at+15*60),
  query(env,`${scopedRights} INSERT INTO gift_dispatch_effects(adjustment_id,inventory_id,type,before_expires)
   SELECT ?,inventory_id,type,expires_at FROM rights WHERE ${eligible}`,...scopedArgs(op),key,deadline,deadline,deadline)
 ]);
 const [counts,summary]=await Promise.all([
  rows(env,`${scopedRights} SELECT state,COUNT(*) quantity FROM rights GROUP BY state`,...scopedArgs(op)),
  one(env,`SELECT COUNT(*) quantity,MIN(before_expires) earliest_before,MAX(before_expires) latest_before
   FROM gift_dispatch_effects WHERE adjustment_id=?`,key)
 ]);
 return {id:key,kind,reason,deadline,scope:scope===null?null:JSON.parse(scope),...emptyTotals,...Object.fromEntries(counts.map(r=>[r.state,r.quantity])),...summary};
}

export async function confirmGiftAdjustment(env,actor,job,operationId){
 const key=giftDispatchKey(operationId),op=await one(env,
  'SELECT * FROM gift_dispatch_adjustments WHERE id=? AND dispatch_id=? AND admin_id=?',key,job.id,actor);
 if(!op)fail(404,'회수 또는 연장 확인을 찾을 수 없습니다.');
 const logKey='gift-adjustment:'+key;
 const result=async()=>one(env,`SELECT confirmed_at,(SELECT COUNT(*) FROM gift_dispatch_effects WHERE adjustment_id=?) quantity
  FROM gift_dispatch_adjustments WHERE id=? AND confirmed_at IS NOT NULL`,key,key);
 if(op.confirmed_at)return result();
 const pending=`EXISTS (SELECT 1 FROM gift_dispatch_adjustments WHERE id=? AND confirmed_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM admin_audit WHERE id=?)`;
 const effect=type=>`id IN (SELECT inventory_id FROM gift_dispatch_effects WHERE adjustment_id=? AND type='${type}')`;
 const stock=op.kind==='recall'?'revoked=1':'redeem_before=?';
 const gift=op.kind==='recall'?'recalled_at=?':'expires_at=?';
 const at=now();
 await env.DB.batch([
  query(env,`${scopedRights}, eligible_rights AS MATERIALIZED (
   SELECT type,inventory_id,expires_at FROM rights WHERE ${eligible}
  ), planned AS (SELECT type,inventory_id,before_expires FROM gift_dispatch_effects WHERE adjustment_id=?)
  UPDATE gift_dispatch_adjustments SET confirmed_at=? WHERE id=? AND expires>unixepoch() AND confirmed_at IS NULL
   AND (deadline IS NULL OR deadline>unixepoch()) AND EXISTS (SELECT 1 FROM planned)
   AND NOT EXISTS (SELECT * FROM eligible_rights EXCEPT SELECT * FROM planned)
   AND NOT EXISTS (SELECT * FROM planned EXCEPT SELECT * FROM eligible_rights)`,
   ...scopedArgs(op),op.deadline,op.deadline,op.deadline,key,at,key),
  query(env,`UPDATE gift_inventory SET ${gift} WHERE ${effect('gift')} AND ${pending}`,op.deadline??at,key,key,logKey),
  query(env,`UPDATE player_inventory SET ${stock} WHERE ${effect('decoration')} AND ${pending}`,
   ...(op.deadline!==null?[op.deadline]:[]),key,key,logKey),
  bumpGiftArrivalVersion(env,`SELECT i.dispatch_id,i.user_id FROM gift_dispatch_items i WHERE i.dispatch_id=?
   AND ${pending} AND (EXISTS(SELECT 1 FROM gift_inventory g JOIN gift_dispatch_effects e ON e.inventory_id=g.id
    WHERE g.dispatch_item=i.id AND e.adjustment_id=? AND e.type='gift')
    OR EXISTS(SELECT 1 FROM player_inventory p JOIN gift_dispatch_effects e ON e.inventory_id=p.id
    WHERE p.dispatch_item=i.id AND e.adjustment_id=? AND e.type='decoration'))`,job.id,key,logKey,key,key),
  query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created)
   SELECT ?,admin_id,'gift_dispatch:'||kind,json_object('dispatch_id',dispatch_id,'adjustment_id',id,
    'reason',reason,'deadline',deadline,'quantity',(SELECT COUNT(*) FROM gift_dispatch_effects WHERE adjustment_id=?)),confirmed_at
   FROM gift_dispatch_adjustments WHERE id=? AND confirmed_at IS NOT NULL ON CONFLICT(id) DO NOTHING`,logKey,key,key)
 ]);
 const confirmed=await result();
 if(!confirmed)fail(409,'보유 또는 사용 상태가 변경되었습니다. 대상 수량과 기한을 다시 확인해 주세요.');
 return confirmed;
}
