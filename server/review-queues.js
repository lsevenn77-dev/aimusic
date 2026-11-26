import {fail,now,one} from './db.js';
import {VISIBLE} from './catalog.js';

export const INACTIVE_DAYS=60,QUALITY_REPORT_THRESHOLD=3;
export const trackReviewFrom='FROM tracks t JOIN producers p ON p.id=t.producer_id';
export const pendingQualityReportsSQL=`(SELECT count(*) FROM track_reports r
 WHERE r.track_id=t.id AND r.reason='low_quality' AND r.status='pending')`;

export function trackReviewCandidates(at){
 const cutoff=at-INACTIVE_DAYS*86400;
 return {
  where:`${VISIBLE()} AND ((t.created<=? AND NOT EXISTS(
   SELECT 1 FROM listens l WHERE l.track_id=t.id AND l.qualified=1 AND l.started>?
  )) OR ${pendingQualityReportsSQL}>=?)`,
  args:[cutoff,cutoff,QUALITY_REPORT_THRESHOLD],
  cutoff
 };
}

export const commentReportFrom='FROM comment_reports r JOIN comments c ON c.id=r.comment_id';
export const pendingCommentReportSQL="r.status='pending' AND c.deleted_at=0";
export const dubbingReportFrom='FROM track_reports r JOIN dubbing_projects p ON p.id=r.dubbing_id';
// A rights appeal can still overturn an enforcement decision after the work is deleted.
export const openDubbingReportSQL="(r.status='appealed' OR (r.status='pending' AND p.deleted_at=0))";
export const openDubbingReportCountSQL=`(SELECT count(*) ${dubbingReportFrom} WHERE ${openDubbingReportSQL})`;

export function reviewCounts(env,at=now()){
 const {where,args}=trackReviewCandidates(at);
 return one(env,`SELECT
  (SELECT count(*) ${trackReviewFrom} WHERE ${where}) track_review_candidates,
  (SELECT count(*) ${commentReportFrom} WHERE ${pendingCommentReportSQL}) pending_comment_reports,
  ${openDubbingReportCountSQL} open_dubbing_reports`,...args);
}

export const REVIEW_PAGE_SIZE=100;
export function reviewCursor(params,alias){
 const cursor=params.get('cursor');
 if(cursor===null)return {where:'',args:[]};
 const match=/^(\d{1,12}):([\w-]{1,128})$/.exec(cursor);
 if(!match)fail(400,'목록 위치를 확인해 주세요.');
 return {where:`AND (${alias}.created,${alias}.id)>(?,?)`,args:[Number(match[1]),match[2]]};
}

export function reviewPage(results){
 const has_more=results.length>REVIEW_PAGE_SIZE;
 const items=results.slice(0,REVIEW_PAGE_SIZE),last=items.at(-1);
 return {items,has_more,next_cursor:has_more?last.created+':'+last.id:null};
}
