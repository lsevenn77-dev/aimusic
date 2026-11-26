// Temporary, owner-authorized recovery export. Remove with the asset release.
// The production Worker never accepts SQL or writes to a database or object bucket here.
import {isMcpAdmin} from './admin-mcp-auth.js';

export const recoveryPath='/internal/product-recovery/';
export const objectPrefixes=['product-media/','product-evidence/'];
const ownerKey={kty:'EC',crv:'P-256',x:'oWn0XRjOYLFMyzMsRTfC08jv8NZtkaKCA4b0N4-lsb0',y:'MK5w-8f_lmbAvromBQ6GynUQUcvTT2lpHGTHPiaMiUk'};
const windowEnd=Date.parse('2026-11-26T20:00:00Z');
const context='AIFECT product recovery v1 / appgprj_6aa56aec3434819186f9a42d9a557520';
const encoder=new TextEncoder();
const headers={'cache-control':'private, no-store, max-age=0','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow'};
const output=(data,status=200)=>Response.json(data,{status,headers});
const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
const bytes=value=>Uint8Array.from(value.match(/../g)||[],n=>parseInt(n,16));
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const string=value=>"'"+value.replaceAll("'","''")+"'";
const jsonSizeLimit=10*1024*1024;
const identifier=/^[A-Za-z_][A-Za-z0-9_]*$/;

async function grantKey(env) {
  if(env.AIFECT_MCP_ENABLED!=='true'||!env.AIFECT_MCP_OWNER_ID||String(env.CAFE24_ORIGIN_KEY||'').length<32)return null;
  return crypto.subtle.importKey('raw',encoder.encode(env.CAFE24_ORIGIN_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}

export function recoveryAccess(publicKey=ownerKey,expiresAt=windowEnd,now=Date.now) {
  const scope=[context,publicKey.x,publicKey.y,expiresAt].join('\n');
  function grantMessage(env,end){return encoder.encode([scope,env.AIFECT_MCP_OWNER_ID,end].join('\n'));}
  async function grant(env,actor) {
    if(!isMcpAdmin(actor)||actor.id!=='sites:'+env.AIFECT_MCP_OWNER_ID||now()>=expiresAt)return null;
    const key=await grantKey(env);if(!key)return null;
    const end=Math.min(expiresAt,now()+15*60*1000);
    return {expires_at:end,proof:hex(await crypto.subtle.sign('HMAC',key,grantMessage(env,end)))};
  }
  async function allowed(req,env) {
    const url=new URL(req.url);
    if(req.method!=='GET'||url.origin!=='https://aifect.co.kr'||now()>=expiresAt)return false;
    const end=Number(req.headers.get('x-recovery-expiry')),at=Number(req.headers.get('x-recovery-time'));
    const proof=req.headers.get('x-recovery-owner')||'',signature=req.headers.get('x-recovery-signature')||'';
    if(!Number.isSafeInteger(end)||end<now()||end>expiresAt||end>now()+16*60*1000||!Number.isSafeInteger(at)||Math.abs(at-now())>60000||
       !/^[a-f0-9]{64}$/.test(proof)||!/^[a-f0-9]{128}$/.test(signature))return false;
    const key=await grantKey(env);if(!key||!await crypto.subtle.verify('HMAC',key,bytes(proof),grantMessage(env,end)))return false;
    const verification=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},verification,bytes(signature),
      encoder.encode(['GET',url.href,String(at),String(end),proof].join('\n')));
  }
  return {grant,allowed};
}

export const ownerRecovery=recoveryAccess();
const internalName=name=>name.startsWith('_cf_')||name.startsWith('sqlite_')&&name!=='sqlite_sequence';
async function schema(db) {
  const definitions=(await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY rowid").all()).results
    .filter(row=>!internalName(row.name)&&!internalName(row.tbl_name));
  const tableRows=definitions.filter(row=>row.type==='table');
  if(tableRows.some(row=>!identifier.test(row.name)||/^CREATE\s+VIRTUAL/i.test(row.sql)))throw Error('Unsupported table schema');
  const tableColumns=(await db.prepare("SELECT m.name tbl,p.name col,p.pk pk,p.hidden hidden FROM sqlite_schema m JOIN pragma_table_xinfo(m.name) p WHERE m.type='table' AND m.name NOT GLOB '_cf_*' AND (m.name NOT GLOB 'sqlite_*' OR m.name='sqlite_sequence') ORDER BY m.rowid,p.cid").all()).results;
  const tables=tableRows.map(({name,sql})=>{
    const columns=tableColumns.filter(c=>c.tbl===name&&!c.hidden);
    if(!columns.length)throw Error('No restorable columns');
    const names=columns.map(c=>c.col);
    const rowid=/\bWITHOUT\s+ROWID\b/i.test(sql)?null:['_rowid_','rowid','oid'].find(n=>!names.some(c=>c.toLowerCase()===n));
    if(!rowid&&!columns.some(c=>c.pk))throw Error('No stable row identity');
    return {name,columns:names,rowid:rowid||null,order:rowid?[rowid]:columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.col)};
  });
  const digest=hex(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(definitions))));
  return {definitions,tables,digest};
}

function encoded(name) {
  const c=quote(name);
  return `CASE typeof(${c}) WHEN 'null' THEN 'n' WHEN 'text' THEN 't'||${c} WHEN 'integer' THEN 'i'||CAST(${c} AS TEXT) WHEN 'real' THEN 'r'||printf('%!.17g',${c}) ELSE 'b'||hex(${c}) END`;
}
function rowExpression(t){
  const cells=[...(t.rowid?[t.rowid]:[]),...t.columns].map(encoded),arrays=[];
  for(let i=0;i<cells.length;i+=16)arrays.push('json_array('+cells.slice(i,i+16).join(',')+')');
  return arrays.reduce((a,b)=>"rtrim("+a+",']')||','||substr("+b+",2)");
}
function limitBytes(t,from,count) {
  const order=t.order.map(quote).join(',');
  return 'SELECT '+rowExpression(t)+' AS record FROM '+quote(t.name)+' ORDER BY '+order+
    (count===null?'':' LIMIT '+count+' OFFSET '+from);
}
function combine(sql) {
  const groups=[];let current=[];
  for(const statement of sql){
    if(current.length&&(current.length>=5||current.join(' UNION ALL ').length+statement.length>85000)){groups.push(current.join(' UNION ALL '));current=[];}
    current.push(statement);
  }
  if(current.length)groups.push(current.join(' UNION ALL '));
  return groups;
}
async function select(db,parts) {
  const groups=combine(parts);
  if(!groups.length)return [];
  return (await db.batch(groups.map(sql=>db.prepare(sql)))).flatMap(group=>group.results);
}
async function database(url,env,action) {
  const db=env.DB.withSession('first-primary'), model=await schema(db);
  if(action==='schema')return output({...model,bookmark:db.getBookmark()});
  if(url.searchParams.get('schema')!==model.digest)return output({error:'Schema changed'},409);
  if(action==='sizes') {
    const sizes=await select(db,model.tables.map(t=>'SELECT '+string(t.name)+' AS t, COUNT(*) AS n, COALESCE(SUM(length(CAST(('+rowExpression(t)+') AS BLOB))+72),0) AS bytes FROM '+quote(t.name)));
    return output({sizes,bookmark:db.getBookmark()});
  }
  const raw=url.searchParams.get('tables')||'';
  const ids=raw==='all'?model.tables.map((_,i)=>i):raw.split(',').map(x=>/^\d{1,4}$/.test(x)?Number(x):-1);
  if(!ids.length||new Set(ids).size!==ids.length||ids.some(i=>!model.tables[i]))return output({error:'Invalid table selection'},400);
  const part=url.searchParams.has('from')||url.searchParams.has('count');
  const from=Number(url.searchParams.get('from')),count=Number(url.searchParams.get('count'));
  if(part&&(ids.length!==1||!Number.isSafeInteger(from)||from<0||!Number.isSafeInteger(count)||count<1||count>4096))return output({error:'Invalid range'},400);
  const make=t=>limitBytes(t,from,part?count:null);
  const selected=ids.map(i=>model.tables[i]);
  const measured=await select(db,selected.map(t=>'SELECT COALESCE(SUM(length(CAST(record AS BLOB))+72),0) AS bytes FROM ('+make(t)+')'));
  if(measured.reduce((n,r)=>n+r.bytes,0)>jsonSizeLimit)return output({error:'Choose smaller groups'},413);
  const records=await select(db,selected.map(t=>'SELECT '+string(t.name)+' AS t,record FROM ('+make(t)+')'));
  return output({records,bookmark:db.getBookmark(),schema:model.digest});
}
const describe=o=>({key:o.key,version:o.version,etag:o.etag,size:o.size,uploaded:o.uploaded,httpMetadata:o.httpMetadata||{},customMetadata:o.customMetadata||{},storageClass:o.storageClass,checksums:o.checksums?.toJSON?.()||{}});
export async function assetRecoveryRoute(req,env,access=ownerRecovery) {
  try {
    if(!await access.allowed(req,env))return output({error:'Unavailable'},404);
    const url=new URL(req.url),action=url.pathname.slice(recoveryPath.length);
    if(['schema','sizes','rows'].includes(action))return await database(url,env,action);
    if(action==='objects'){
      const prefix=url.searchParams.get('prefix'),cursor=url.searchParams.get('cursor')||undefined;
      if(!objectPrefixes.includes(prefix)||cursor?.length>4096)return output({error:'Invalid object listing'},400);
      const page=await env.BUCKET.list({prefix,cursor,limit:100,include:['httpMetadata','customMetadata']});
      return output({objects:page.objects.map(describe),cursor:page.truncated?page.cursor:null});
    }
    if(action==='object'){
      const key=url.searchParams.get('key')||'',etag=url.searchParams.get('etag')||'';
      if(!objectPrefixes.some(p=>key.startsWith(p))||key.includes('..')||!etag)return output({error:'Invalid object'},400);
      const object=await env.BUCKET.get(key,{onlyIf:{etagMatches:etag}});
      if(!object||!object.body)return output({error:'Object changed or missing'},409);
      return new Response(object.body,{headers:{...headers,'content-type':'application/octet-stream','content-length':String(object.size),'etag':object.httpEtag}});
    }
    return output({error:'Unavailable'},404);
  }catch(error){console.error('AIFECT owner recovery',error.name);return output({error:'Recovery read failed'},503);}
}
