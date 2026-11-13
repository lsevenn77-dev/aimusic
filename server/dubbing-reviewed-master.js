import {fail,json,one,query,now} from './db.js';
import {officialDubbingProducerId} from '../shared/dubbing-official.js';

// One-time import of the verified audio for the operator's private review copy.
const stage='09c19c23-f7ee-4bc3-a57a-bdb59f3f1817';
const root='512fb824-036c-452a-b603-c883b0619a29';
const sha256='a55bb871fb5ed53005d490d9a6966098d05c0dcb6b1769208168a0d74e7609a8';
const bytes=4699279;
export async function storeReviewedMaster(req,env,p,user){
 if(req.method!=='PUT'||user?.id!==officialDubbingProducerId||p.owner_id!==user.id||p.id!==stage||p.root_id!==root||p.visibility!=='private'||p.state!=='complete')fail(404,'작품을 찾을 수 없습니다.');
 if(Number(req.headers.get('content-length'))!==bytes||req.headers.get('content-type')!=='audio/mp4')fail(400,'검수본 형식을 확인해주세요.');
 const job=await one(env,"SELECT id,output_key,output_meta FROM dubbing_final_jobs WHERE project_id=? AND script_key=? AND state='ready'",stage,p.script_key);
 if(!job)fail(409,'대사 합성이 끝나지 않았습니다.');
 const body=await req.arrayBuffer();
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body)),byte=>byte.toString(16).padStart(2,'0')).join('');
 if(body.byteLength!==bytes||digest!==sha256)fail(400,'검수된 음원과 일치하지 않습니다.');
 const key='dubbing/'+user.id+'/'+stage+'/final/'+job.id+'-'+sha256+'.m4a';
 await env.BUCKET.put(key,body,{sha256:digest,httpMetadata:{contentType:'audio/mp4',cacheControl:'private, no-store'}});
 const meta={...JSON.parse(job.output_meta),duration:295.02,sampleRate:48000,peakDb:-4.0,bytes,sha256};
 const row=await query(env,`UPDATE dubbing_final_jobs SET output_key=?,output_meta=?,updated=? WHERE id=? AND output_key=? AND state='ready'
 AND EXISTS(SELECT 1 FROM dubbing_projects WHERE id=? AND script_key=? AND visibility='private' AND state='complete' AND deleted_at=0 AND owner_id=?) RETURNING id`,key,JSON.stringify(meta),now(),job.id,job.output_key,stage,p.script_key,user.id).first();
 if(!row)fail(409,'작품 상태가 바뀌었습니다.');
 return json({bytes,sha256});
}
