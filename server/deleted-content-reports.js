import {query} from './db.js';

const targets={
 track:{table:'tracks',key:'track_id',deleted:"t.status='deleted'",reason:'삭제된 음원에 대한 신고를 종결했습니다.'},
 dubbing:{table:'dubbing_projects',key:'dubbing_id',deleted:'t.deleted_at>0',reason:'삭제된 더빙 작품에 대한 신고를 종결했습니다.'}
};

// Add these statements after the content update in the same D1 batch.
export function closeDeletedContentReports(env,kind,scope,args,actor,at){
 const {table,key,deleted,reason}=targets[kind];
 const pending=`status='pending' AND ${key} IN (SELECT t.id FROM ${table} t WHERE ${deleted} AND ${scope})`;
 return [
  query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created)
   SELECT lower(hex(randomblob(16))),?,'${kind}-report:auto-close',
    json_object('report_id',id,'${key}',${key},'decision','dismissed','reason',?),?
   FROM track_reports WHERE ${pending}`,actor,reason,at,...args),
  query(env,`UPDATE track_reports SET status='dismissed',decision=?,resolved_by=?,resolved_at=?,version=version+1
   WHERE ${pending}`,reason,actor,at,...args)
 ];
}
