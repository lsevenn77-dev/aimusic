import {requireUser} from './auth.js';
import {assertDubbingCreator} from './dubbing-access.js';
import {fail,json,rate} from './db.js';

const prefix='/api/dubbing/editor-drafts';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export async function dubbingEditorDraftRoute(req,env,path,user){
 if(path!==prefix&&!path.startsWith(prefix+'/'))return null;
 requireUser(user);
 const bucket=env.BUCKET;
 const folder='private-script-editors/'+encodeURIComponent(user.id)+'/';
 if(path===prefix&&req.method==='GET'){
  const cursor=new URL(req.url).searchParams.get('cursor')||undefined;
  const page=await bucket.list({prefix:folder,limit:100,include:['customMetadata'],cursor});
  return json({items:page.objects.filter(o=>o.customMetadata?.closed!=='1').map(o=>({id:o.key.slice(folder.length),title:o.customMetadata?.title||'',updated:o.uploaded})),cursor:page.truncated?page.cursor:null});
 }
 const id=path.slice(prefix.length+1);
 if(!uuid.test(id))fail(400,'작성본 번호를 확인해주세요.');
 const key=folder+id;
 if(req.method==='GET'){
  const item=await bucket.get(key);
  if(!item||item.customMetadata?.closed==='1')fail(404,'자동 저장된 작성본이 없어요.');
  return json({draft:await item.json(),etag:item.etag});
 }
 if(req.method!=='PUT')fail(405,'지원하지 않는 요청이에요.');
 await assertDubbingCreator(env,user.id);
 const data=await req.json(),draft=data.draft;
 if(data.etag!==null&&(typeof data.etag!=='string'||!(/^[a-f0-9-]{1,80}$/i.test(data.etag))))fail(400,'자동 저장 버전을 확인해주세요.');
 const closed=data.closed===true;
 if(!closed&&(draft?.id!==id||draft?.script?.version!==1||!Array.isArray(draft.script.scenes)||!Array.isArray(draft.script.lines)||!Array.isArray(draft.script.roles)||!Array.isArray(draft.script.soundCues)||!draft.options))fail(400,'작성 중인 대본을 확인해주세요.');
 if(!data.etag)await rate(env,'dubbing-editor-create:'+user.id,60,3600);
 const condition=new Headers(data.etag?{'If-Match':'"'+data.etag+'"'}:{'If-None-Match':'*'});
 const saved=await bucket.put(key,JSON.stringify(closed?{closed:true}:draft),{onlyIf:condition,httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'},customMetadata:{closed:closed?'1':'0',title:String(draft?.script?.title||'').slice(0,100)}});
 if(!saved)fail(409,'다른 기기에서 먼저 저장했어요. 내 편집본은 이 기기에 남아 있어요.');
 return json({etag:saved.etag});
}

