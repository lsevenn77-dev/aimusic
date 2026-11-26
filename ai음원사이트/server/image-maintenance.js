// Called by the authenticated transcoder. Only the selected, unmodified PNG version can be replaced.
import {one,fail,id,json} from './db.js';
import {encodeStaticImage,readImage} from './images.js';

const sources={
 track:{table:'tracks',version:'cover_version',type:'cover_type'},
 producer:{table:'producers',version:'image_version',type:'image_type'}
};
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

export async function replaceStoredPNG(req,env){
 const {kind,entityId,expectedVersion}=await req.json();
 if(!Object.hasOwn(sources,kind)||!uuid.test(entityId)||!uuid.test(expectedVersion))fail(400,'이미지 종류와 버전을 확인해 주세요.');
 const {table,version,type}=sources[kind];
 const row=await one(env,`SELECT ${version} AS version,${type} AS mime FROM ${table} WHERE id=?`,entityId);
 if(row?.version!==expectedVersion||row?.mime!=='image/png')return json({state:'skipped'});
 const prefix=`images/${kind}/${entityId}/`;
 const source=await env.BUCKET.get(prefix+expectedVersion);
 if(!source)fail(404,'원본 이미지를 찾을 수 없습니다.');
 const image=await readImage(new Response(source.body,{headers:{'content-type':'image/png'}}));
 const output=await encodeStaticImage(env,image);
 if(output.type!=='image/webp')return json({state:'animation'});
 const next=id(),key=prefix+next;
 await env.BUCKET.put(key,output.data,{httpMetadata:{contentType:output.type}});
 // Compare-and-swap so an overlapping photo edit or retry cannot overwrite a newer version.
 const saved=await one(env,`UPDATE ${table} SET ${version}=?,${type}=? WHERE id=? AND ${version}=? AND ${type}='image/png' RETURNING id`,next,output.type,entityId,expectedVersion);
 if(!saved){await env.BUCKET.delete(key);return json({state:'skipped'});}
 return json({state:'replaced',version:next,oldBytes:image.data.length,newBytes:output.data.length});
}
