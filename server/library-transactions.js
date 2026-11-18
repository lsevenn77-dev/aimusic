import {query,id,fail} from './db.js';

// D1 batch is one transaction. A CHECK guard aborts the complete batch when a
// concurrently changed revision, permission or source snapshot no longer matches.
export async function libraryTransaction(env,conditions,statements){
 const token=id();
 try{return await env.DB.batch([
  ...conditions.map(([sql,args=[]],i)=>query(env,`INSERT INTO library_write_guards(id,allowed) SELECT ?,CASE WHEN (${sql}) THEN 1 ELSE 0 END`,token+':'+i,...args)),
  ...statements,
  query(env,'DELETE FROM library_write_guards WHERE id LIKE ?',token+':%')
 ]);}catch(error){
  if(/library_guard_allowed|library_write_guards.allowed/.test(error.message))fail(409,'목록이나 콘텐츠 접근 권한이 변경됐어요. 다시 열어 확인해주세요.');
  if(/UNIQUE constraint failed: playlist_title_claims/.test(error.message))fail(409,'이미 사용 중인 플레이리스트 제목입니다.');
  throw error;
 }
}
export const pageParams=params=>({offset:Math.max(0,Math.floor(Number(params.get('offset'))||0)),limit:Math.max(1,Math.min(50,Math.floor(Number(params.get('limit'))||20)))});
