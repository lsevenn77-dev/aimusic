import {one,rows,query,id,now,json,fail,str,rate} from './db.js';
import {requireUser} from './auth.js';
import {storeImage} from './images.js';
import {objectResponse} from './storage.js';
import {auditCrew} from './crew-v3.js';
const staff=role=>['owner','deputy','manager','operator'].includes(role);
export async function crewNoticeRoute(req,env,path,user){
 const m=path.match(/^\/api\/crews\/([\w-]+)\/notices(?:\/([\w-]+))?$/),image=path.match(/^\/media\/crew-notice\/([\w-]+)$/),upload=path.match(/^\/api\/crews\/([\w-]+)\/notice-images$/);if(!m&&!image&&!upload)return null;
 let photo=image?await one(env,'SELECT * FROM crew_notice_images WHERE id=?',image[1]):null;
 if(image&&!photo)fail(404,'사진을 찾을 수 없어요.');
 const cid=m?.[1]||upload?.[1]||photo.crew_id,c=await one(env,'SELECT * FROM crews WHERE id=?',cid);if(!c)fail(404,'크루를 찾을 수 없어요.');
 const member=await one(env,'SELECT role FROM crew_members WHERE crew_id=? AND user_id=?',cid,user?.id||'');
 if(c.join_policy==='invite_only'&&!member)fail(403,'크루 회원만 볼 수 있어요.');
 if(image){if(!['GET','HEAD'].includes(req.method))fail(405,'조회만 가능합니다.');if(!await one(env,'SELECT 1 FROM crew_notices WHERE id=? AND crew_id=? AND deleted_at=0',photo.notice_id,cid)&&photo.author_id!==user?.id)fail(404,'사진을 찾을 수 없어요.');return objectResponse(req,env,photo.r2_key,photo.mime_type,false);}
 if(m&&req.method==='GET'&&!m[2]){const items=await rows(env,"SELECT n.*,p.name author_name FROM crew_notices n LEFT JOIN producers p ON p.user_id=n.author_id WHERE n.crew_id=? AND n.deleted_at=0 ORDER BY n.is_pinned DESC,n.created DESC,n.id DESC LIMIT 100",cid);for(const n of items){n.images=(await rows(env,'SELECT id FROM crew_notice_images WHERE notice_id=? ORDER BY sort_order,id',n.id)).map(i=>({id:i.id,url:'/media/crew-notice/'+i.id}));}return json({items,can_manage:staff(member?.role)});}
 requireUser(user);if(!staff(member?.role))fail(403,'크루장과 운영진만 공지를 관리할 수 있어요.');
 if(upload){if(req.method!=='PUT')fail(405,'업로드만 가능합니다.');await rate(env,'crew-notice-image:'+user.id,40,3600);const iid=id(),pic=await storeImage(req,env,'crew-notice',cid);await query(env,'INSERT INTO crew_notice_images(id,crew_id,author_id,r2_key,mime_type,created) VALUES(?,?,?,?,?,?)',iid,cid,user.id,`images/crew-notice/${cid}/${pic.version}`,pic.type,now()).run();return json({id:iid,url:'/media/crew-notice/'+iid},201);}
 const existing=m[2]?await one(env,'SELECT * FROM crew_notices WHERE id=? AND crew_id=? AND deleted_at=0',m[2],cid):null;if(m[2]&&!existing)fail(404,'공지를 찾을 수 없어요.');
 if(req.method==='DELETE'&&existing){await env.DB.batch([query(env,'UPDATE crew_notices SET deleted_at=?,updated=?,editor_id=? WHERE id=?',now(),now(),user.id,existing.id),auditCrew(env,cid,user.id,'notice_deleted',existing.id)]);return json({ok:true});}
 if(!['POST','PATCH'].includes(req.method)||req.method==='PATCH'&&!existing)fail(405,'지원하지 않는 요청입니다.');
 const b=await req.json(),title=str(b.title,80),body=str(b.body,2000),images=b.images||[],nid=existing?.id||id(),pin=b.is_pinned===true?1:0;
 if(!Array.isArray(images)||images.length>4||new Set(images).size!==images.length)fail(400,'이미지는 최대 4장까지 첨부해주세요.');
 for(const iid of images)if(!await one(env,'SELECT 1 FROM crew_notice_images WHERE id=? AND crew_id=? AND ((notice_id IS NULL AND author_id=?) OR notice_id=?)',iid,cid,user.id,nid))fail(403,'직접 업로드한 공지 이미지만 사용할 수 있어요.');
 const writes=[existing?query(env,'UPDATE crew_notices SET title=?,body=?,is_pinned=?,editor_id=?,updated=? WHERE id=? AND deleted_at=0',title,body,pin,user.id,now(),nid):query(env,'INSERT INTO crew_notices(id,crew_id,author_id,editor_id,title,body,is_pinned,created,updated) VALUES(?,?,?,?,?,?,?,?,?)',nid,cid,user.id,user.id,title,body,pin,now(),now()),query(env,'UPDATE crew_notice_images SET notice_id=NULL WHERE notice_id=?',nid)];
 images.forEach((iid,i)=>writes.push(query(env,'UPDATE crew_notice_images SET notice_id=?,sort_order=? WHERE id=?',nid,i,iid)));writes.push(auditCrew(env,cid,user.id,existing?'notice_updated':'notice_created',JSON.stringify({id:nid,title,body,images,pinned:pin})));
 if(!existing)writes.push(query(env,"INSERT OR IGNORE INTO activity_notifications(id,recipient,actor_id,kind,target,source_title,created) SELECT 'crew-notice:'||?||':'||user_id,user_id,?,'crew_notice',?,?,? FROM crew_members WHERE crew_id=? AND user_id!=?",nid,user.id,cid,title,now(),cid,user.id));
 try{await env.DB.batch(writes);}catch(e){if(/notice_pin_limit/.test(e.message))fail(409,'중요 공지는 최대 2개까지 고정할 수 있어요.');throw e;}return json({ok:true,id:nid});
}
