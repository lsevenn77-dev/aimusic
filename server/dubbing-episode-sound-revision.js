import {fail,json,one,query,now} from './db.js';
import {requireUser} from './auth.js';
import {officialDubbingProducerId} from '../shared/dubbing-official.js';

const episode='b7c81f9a-2182-4dc5-bcb2-6dc0aee0a899';
const bedBytes=959474, masterBytes=5657216;
const bedHash='5d9ce67d8ef3b108b31f04fe92d2c71a4480c243a9759da20346db460dace459';
const masterHash='7a069f43b982232e3e7cf7cc88461416ad3951e0057277bfd63cb63953a72edf';
const priorHash='a55bb871fb5ed53005d490d9a6966098d05c0dcb6b1769208168a0d74e7609a8';
const auditId='official-episode01:sound-v1';
const checkedUpdate="SELECT CASE WHEN changes()=1 THEN 1 ELSE abs(-9223372036854775808) END";

async function digest(bytes){
 const hashed=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 return Array.from(hashed,x=>x.toString(16).padStart(2,'0')).join('');
}

// Import the two approved immutable recordings together. Restrict this operation
// to the owner, this edition, these exact files and the verified previous master.
export async function officialEpisodeSoundRevision(req,env,p,user){
 requireUser(user);
 if(user.id!==officialDubbingProducerId||p.owner_id!==user.id||p.id!==episode||p.state!=='complete')fail(403,'이 작품의 공식 제작자만 교체할 수 있습니다.');
 if(req.method!=='PUT')fail(405,'PUT 요청이 필요합니다.');
 const base='dubbing/'+user.id+'/'+episode+'/sound-revisions/';
 const bedKey=base+bedHash+'.m4a',masterKey=base+masterHash+'.m4a';
 const jobs=await one(env,`SELECT f.id finalId,b.id bedId,f.output_key masterKey,b.output_key bedKey,
    f.output_meta masterMeta,b.output_meta bedMeta
  FROM dubbing_final_jobs f JOIN dubbing_sound_jobs b ON b.project_id=f.project_id AND b.script_key=f.script_key
  WHERE f.project_id=? AND f.script_key=? AND f.state='ready' AND b.state='ready'
    AND json_extract(f.manifest_json,'$.background')=b.output_key`,episode,p.script_key);
 if(!jobs)fail(409,'공개 음원 상태가 변경되었습니다.');
 if(jobs.masterKey===masterKey&&jobs.bedKey===bedKey)return json({ok:true,masterHash,bedHash});
 if(JSON.parse(jobs.masterMeta).sha256!==priorHash)fail(409,'기존 마스터가 변경되었습니다.');
 const expected=bedBytes+masterBytes;
 if(Number(req.headers.get('content-length'))!==expected||!req.body)fail(400,'파일 길이가 일치하지 않습니다.');
 const bytes=new Uint8Array(expected),reader=req.body.getReader();let offset=0;
 try{
  while(true){
   const {value,done}=await reader.read();if(done)break;
   if(offset+value.length>expected){await reader.cancel();fail(413,'파일 크기를 확인해주세요.');}
   bytes.set(value,offset);offset+=value.length;
  }
 }finally{reader.releaseLock();}
 const bed=bytes.subarray(0,bedBytes),master=bytes.subarray(bedBytes);
 if(offset!==expected||await digest(bed)!==bedHash||await digest(master)!==masterHash)fail(400,'검토한 음원과 일치하지 않습니다.');
 const options={httpMetadata:{contentType:'audio/mp4',cacheControl:'private, no-store'}};
 await Promise.all([env.BUCKET.put(bedKey,bed,options),env.BUCKET.put(masterKey,master,options)]);
 const at=now();
 const old={masterKey:jobs.masterKey,bedKey:jobs.bedKey,masterMeta:jobs.masterMeta,bedMeta:jobs.bedMeta};
 await env.DB.batch([
  query(env,`UPDATE dubbing_final_jobs SET output_key=?,manifest_json=json_set(manifest_json,'$.background',?),
   output_meta=json_set(output_meta,'$.sha256',?,'$.bytes',?,'$.peakDb',?,'$.sampleRate',48000,'$.duration',295.02),updated=?
   WHERE id=? AND state='ready' AND output_key=? AND json_extract(manifest_json,'$.background')=?`,
   masterKey,bedKey,masterHash,masterBytes,-1.685919,at,jobs.finalId,jobs.masterKey,jobs.bedKey),
  env.DB.prepare(checkedUpdate),
  query(env,`UPDATE dubbing_sound_jobs SET output_key=?,output_meta=json_set(COALESCE(output_meta,'{}'),'$.sha256',?,'$.bytes',?,
   '$.peakDb',?,'$.sampleRate',48000,'$.duration',295.02),updated=? WHERE id=? AND state='ready' AND output_key=?`,
   bedKey,bedHash,bedBytes,-1.347944,at,jobs.bedId,jobs.bedKey),
  env.DB.prepare(checkedUpdate),
  query(env,'INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES(?,?,?,?,?)',auditId,user.id,
   'dubbing_sound_revision',JSON.stringify({episode,old,masterKey,bedKey}),at)
 ]);
 return json({ok:true,masterHash,bedHash});
}
