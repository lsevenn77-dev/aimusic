import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {convertV4MiniflareOptions,Miniflare} from 'miniflare';
import {verifyProductZip} from '../../authoring/product-assets.mjs';
import {processProductImage} from '../../ops/cafe24/product-media.mjs';
import {sha256} from '../../shared/product-asset-contract.js';
import {resolveProductTheme} from '../../shared/product-theme-layout.js';
import {hash} from '../../server/auth.js';
import worker from '../../server/index.js';
import {openProductZip} from '../../server/product-zip.js';
import {zipJson,zipParts} from '../../server/product-zip-write.js';
import {catalog,productById} from '../../server/product-catalog.js';
import {presentationHash,reviewBuilds,reviewPlan} from '../../server/product-reviews.js';
import {resolveRoomDecoration} from '../../server/room-decorations.js';

const root='/api/admin/products';
const sha=await hash('isolated-owner');
const sampleDirectory=new URL('../../authoring/samples/',import.meta.url);

async function runtime(t){
 const live=new Miniflare({...convertV4MiniflareOptions({name:'asset-qa',modules:true,script:'export default { fetch() { return new Response("asset-test"); } }',
  compatibilityDate:'2026-09-01',d1Databases:{DB:'asset-qa-d1'},r2Buckets:{BUCKET:'asset-qa-r2'}}),telemetry:{enabled:false}});
 t.after(()=>live.dispose());
 const [DB,BUCKET]=await Promise.all([live.getD1Database('DB'),live.getR2Bucket('BUCKET')]);
 const baseline=new DatabaseSync(':memory:');
 const migrations=new URL('../../drizzle/',import.meta.url);
 const files=(await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort();
 const assetMigration=files.find(name=>name.startsWith('0117_'));
 for(const name of files.filter(name=>name!==assetMigration))baseline.exec(await readFile(new URL(name,migrations),'utf8'));
 const schema=baseline.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
 baseline.close();
 for(let offset=0;offset<schema.length;offset+=35)await DB.batch(schema.slice(offset,offset+35).map(item=>DB.prepare(item.sql)));
 const legacyOwner=DB.prepare("INSERT INTO users(id,email,name,created) VALUES('isolated-owner','asset-qa@example.test','검수',1)");
 await legacyOwner.run();
 await DB.prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,'isolated-owner',unixepoch()+1800)").bind(sha).run();
 for(const sql of (await readFile(new URL(assetMigration,migrations),'utf8')).split('--> statement-breakpoint'))await DB.prepare(sql.trim()).run();
 const env={DB,BUCKET,ADMIN_USER_IDS:'isolated-owner',AIFECT_PRODUCT_EDITOR_IDS:'isolated-owner',
  CAFE24_ORIGIN_KEY:'isolated-decoder', AIFECT_PRODUCT_ANDROID_BUILD:'android-unit-fixture', AIFECT_PRODUCT_IOS_BUILD:'ios-unit-fixture',
  ASSETS:{fetch:async request=>new Response(new URL(request.url).pathname==='/aifect-shell.txt'?
   await readFile(new URL('../../dist/index.html',import.meta.url),'utf8'):null)}};
 const originalFetch=globalThis.fetch;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const u=new URL(url);
  if(u.hostname!=='billing.aifect.co.kr')return originalFetch(url,options);
  try{
   const result=await processProductImage(Buffer.from(options.body),u.pathname.split('/').at(-1));
   return new Response(result.body,{headers:{'content-type':result.type}});
  }catch{return new Response(null,{status:400});}
 });
 const call=(path,{method='GET',bytes,body,authorized=true,key=crypto.randomUUID()}={})=>{
  let payload=body&&JSON.stringify({...body,request_id:key});
  if(bytes){
   payload=new FormData();payload.set('package',new Blob([bytes],{type:'application/zip'}),'sample.zip');
   if(path!==root+'/inspect-package')payload.set('request_id',key);
   if(body)payload.set('definition',JSON.stringify(body));
  }
  return worker.fetch(new Request('https://aifect.test'+path,{method,body:payload,
   headers:{origin:'https://aifect.test',...(authorized?{cookie:'aifect_session=isolated-owner'}:{}),
    ...(bytes?{}:{'content-type':'application/json'})}}),env,{waitUntil(pending){pending.catch(()=>{});}});
 };
 return {env,call};
}

const create=(manifest)=>({action:'create',name:manifest.metadata.name,description:manifest.metadata.description,
 type:manifest.productType,currency:'G',distribution:'grant',eventOnly:false,
 uiMode:manifest.metadata.uiMode,options:manifest.productType==='gift'?{}:{P7D:0}});
async function expect(response,code){
 assert.equal(response.status,code,response.status===code?'':await response.text());
 return response.json();
}

test('six author ZIPs traverse the Worker routes, isolated D1 and R2, decoder, preview and round trip',async t=>{
 const {env,call}=await runtime(t);
 const samples=(await readdir(sampleDirectory)).filter(name=>name.endsWith('.zip')).sort();
 assert.equal(samples.length,6);
 const registered=new Map();
 for(const sample of samples){
  const bytes=await readFile(new URL(sample,sampleDirectory)),digest=await sha256(bytes),parsed=await verifyProductZip(bytes),manifest=parsed.manifest;
  const inspected=await expect(await call(root+'/inspect-package',{method:'POST',bytes}),200);
  assert.equal(inspected.upload_sha256,digest);
  const request={method:'POST',bytes,body:create(manifest),key:crypto.randomUUID()};
  const draft=await expect(await call(root,request),201);
  assert.notEqual(draft.version_id,request.key);
  assert.equal((await expect(await call(root,request),200)).version_id,draft.version_id);
  const base=root+'/'+draft.id,version=base+'/versions/'+draft.version_id;
  const {product}=await expect(await call(base),200);
  assert.equal(product.activeVersion,null);assert.equal(product.sale,false);assert.equal(product.grant,false);
  const {version:record,review}=await expect(await call(version),200);
  assert.equal(record.source_status,'confirmed');assert.equal(record.upload_sha256,digest);
  assert.equal(record.registered_by,'isolated-owner');assert.ok(!review.ready);
  assert.equal((await call(record.downloads.original,{authorized:false})).status,403);
  const original=await call(record.downloads.original);
  assert.equal(original.status,200);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()),bytes);
  const {files,originals}=await env.DB.prepare('SELECT files,originals FROM product_asset_versions WHERE id=?').bind(record.id).first();
  for(const file of [...Object.values(JSON.parse(files)),...Object.values(JSON.parse(originals))]){
   const object=await env.BUCKET.get(file.key);
   assert.equal(await sha256(await object.arrayBuffer()),file.sha256);
  }
  for(const file of Object.values(record.files)){
   assert.equal((await call(file.url)).status,200);
   assert.equal((await call(file.url.replace('/api/admin/product-files/','/api/product-assets/'),{authorized:false})).status,404);
  }
  const surface=manifest.productType==='theme'?'talk-dark':manifest.productType==='gift'?'talk-seated':'talk';
  const preview=await call('/api/admin/product-preview?'+new URLSearchParams({id:draft.id,version:record.id,surface}));
  assert.equal(preview.status,200);
  assert.match(await preview.text(),/product-review-data/);
  assert.match(preview.headers.get('content-security-policy'),/connect-src 'none'/);
  const operating=await call(record.downloads.operating);assert.equal(operating.status,200);
  const copy=Buffer.from(await operating.arrayBuffer());
  const exported=await verifyProductZip(copy);
  assert.deepEqual(exported.manifest.originals,[]);
  assert.equal(exported.manifest.packageKind,'operating');
  const returned=await expect(await call(root,{method:'POST',bytes:copy,body:create(manifest)}),201);
  assert.equal((await expect(await call(root+'/'+returned.id+'/versions/'+returned.version_id),200)).version.source_status,'upload_only');
  assert.equal((await call(base,{method:'POST',body:{action:'activate',revision:1,version_id:record.id}})).status,409);
  const repeated=await expect(await call(base+'/versions',{method:'POST',bytes}),200);
  assert.equal(repeated.version_id,record.id);
  registered.set(sample,{draft,bytes,record,manifest,base});
  t.diagnostic(sample+' SHA-256 '+digest+' · D1/R2 저장 · 비공개 미리보기 · 업로드 ZIP 해시 · 운영 ZIP 재등록 확인');
 }
 const current=await catalog(env);
 assert.equal([...current.values()].filter(product=>!product.legacy).length,12);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) count FROM product_asset_versions').first()).count,12);
 assert.equal((await env.DB.prepare("SELECT COUNT(*) count FROM admin_audit WHERE action='product_asset_download'").first()).count,12);
 await t.test('the real API rejects incomplete packages and conflicts without changing storage',async()=>{
  const {bytes,draft,manifest,base}=registered.get('theme-static.zip');
  const reader=openProductZip(bytes),entries=new Map();
  for(const name of reader.files.keys())entries.set(name,await reader.read(name));
  const {assets,...fields}=manifest;
  const {roomCard,...incomplete}=assets;
  entries.set('manifest.json',zipJson({...fields,assets:incomplete}));
  const bad=Buffer.concat(zipParts(entries));
  assert.equal((await call(root+'/inspect-package',{method:'POST',bytes:bad})).status,400);
  assert.equal((await call(root+'/inspect-package',{method:'POST',bytes,authorized:false})).status,401);
  const [first,...rest]=manifest.files;
  entries.set('manifest.json',zipJson({...manifest,files:[{...first,sha256:'0'.repeat(64)},...rest]}));
  assert.equal((await call(root+'/inspect-package',{method:'POST',bytes:Buffer.concat(zipParts(entries))})).status,400);
  entries.set('manifest.json',zipJson({...manifest,renderer:{...manifest.renderer,version:2}}));
  assert.equal((await call(root+'/inspect-package',{method:'POST',bytes:Buffer.concat(zipParts(entries))})).status,400);
  entries.set('manifest.json',zipJson({...manifest,productId:'other-product'}));
  const wrong=Buffer.concat(zipParts(entries));
  assert.equal((await call(base+'/versions',{method:'POST',bytes:wrong})).status,400);
  entries.set('manifest.json',zipJson({...manifest,metadata:{...manifest.metadata,name:'같은 버전 다른 제작물'}}));
  const conflict=Buffer.concat(zipParts(entries));
  assert.equal((await call(base+'/versions',{method:'POST',bytes:conflict})).status,409);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) count FROM product_asset_versions WHERE product_id=?').bind(draft.id).first()).count,1);
 });
 await t.test('fixture reviews exercise the activation gate, room pin, rollback and bulk original download',async()=>{
  const {draft,manifest,bytes,base,record}=registered.get('theme-layered.zip');
  const reader=openProductZip(bytes),entries=new Map();
  for(const name of reader.files.keys())entries.set(name,await reader.read(name));
  entries.set('manifest.json',zipJson({...manifest,assetVersion:'2.0.1',productId:draft.id}));
  const replacement=Buffer.concat(zipParts(entries));
  const candidates=await Promise.all([call(base+'/versions',{method:'POST',bytes:replacement}),call(base+'/versions',{method:'POST',bytes:replacement})]);
  assert.deepEqual(candidates.map(result=>result.status).sort(),[200,201]);
  const [second,reused]=await Promise.all(candidates.map(result=>result.json()));
  assert.equal(reused.version_id,second.version_id);
  const product=await productById(env,draft.id),presentation=await presentationHash(product),builds=reviewBuilds(env);
  const reviews=Object.entries(builds).flatMap(([platform,build])=>reviewPlan(product,record.mode).flatMap(({surface})=>[record.id,second.version_id].map(version=>
   env.DB.prepare('INSERT INTO product_asset_reviews VALUES(?,?,?,?,?,?,1,1)').bind(draft.id,version,platform,surface,build,JSON.stringify({presentation})))));
  await env.DB.batch(reviews);
  const active=await expect(await call(base,{method:'POST',body:{action:'activate',revision:1,version_id:record.id}}),200);
  assert.equal(active.active_version,record.id);
  const p=await productById(env,draft.id);assert.equal(p.grant,false);assert.equal(p.sale,false);
  const art=p.asset.themeArtwork;
  assert.equal(resolveProductTheme(art,{width:1440,height:850,dpr:1.25}).role,'desktop');
  assert.equal(resolveProductTheme(art,{width:390,height:844,dpr:2,app:true}).role,'mobile');
  assert.equal(resolveProductTheme(art,{width:390,height:844,economy:true}).effect,null);
  // Only fixtures simulate operator approval and a pre-existing entitlement, never a live grant.
  await env.DB.prepare(`INSERT INTO player_inventory(id,user_id,item_key,source,source_ref,granted_at,expires_at,period_code)
   VALUES('room-entitlement','isolated-owner',?,'decoration','fixture',unixepoch(),0,'PERMANENT')`).bind(p.id).run();
  await env.DB.prepare(`INSERT INTO room_decorations(room_id,host_id,sku,revision,updated,inventory_id,asset_version)
   VALUES('test-room','isolated-owner',?,1,unixepoch(),'room-entitlement',?)`).bind(p.id,record.id).run();
  const transferred=await expect(await call(base,{method:'POST',body:{action:'activate',revision:2,version_id:second.version_id}}),200);
  assert.equal(transferred.active_version,second.version_id);
  const pinned=await resolveRoomDecoration(env,{id:'test-room',host_id:'isolated-owner',theme_sku:p.id,settings_revision:1});
  assert.equal(pinned.asset_version,record.id);
  assert.match(pinned.artwork.desktop.src,new RegExp(record.id));
  assert.equal((await expect(await call(base,{method:'POST',body:{action:'rollback',revision:3,version_id:record.id}}),200)).active_version,record.id);
  const bulk=await call(root+'/originals.zip',{method:'POST',body:{products:[p.id,'heart']}});
  assert.equal(bulk.status,200);
  const packed=openProductZip(new Uint8Array(await bulk.arrayBuffer()),{bundle:true});
  assert.deepEqual(Buffer.from(await packed.read(p.id+'-'+record.id+'.zip')),bytes);
  const report=JSON.parse(Buffer.from(await packed.read('download-report.json')));
  assert.deepEqual(report.results.map(item=>item.status),['included','excluded']);
 });
});
