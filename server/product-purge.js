import {id,now,one,query,rows} from './db.js';
import {deletionDetails} from './product-deletion-policy.js';

const objectPrefix = 'product-media/';
const maxObjects = 5000;
const filesPerRun = 80;
const leaseSeconds = 300;
const objectKey = key=>typeof key==='string'&&/^product-media\/[a-zA-Z0-9_-]+\/[^/]/.test(key);

async function versionAssets(env,productId,type) {
  const versions = await rows(env,'SELECT * FROM product_asset_versions WHERE product_id=?',productId);
  const keys = new Set();
  const unknown = new Set();
  const history = [];
  if (!versions.length) return {keys,unknown,history};
  const dispatchVersions = await rows(env,`SELECT DISTINCT json_extract(line.value,'$.asset_version') id
   FROM gift_dispatches d CROSS JOIN json_each(d.plan) line
   WHERE d.confirmed_at IS NOT NULL AND json_extract(line.value,'$.product_id')=?`,productId);
  const used = new Set(dispatchVersions.map(row=>row.id));
  // Past gifts predating version snapshots can appear in activity or room
  // history. Keep their published thumbnails without retaining the versions.
  const giftReceipts = type==='gift'&&await one(env,`SELECT 1 found WHERE
   EXISTS(SELECT 1 FROM gift_inventory WHERE gift_type=?) OR EXISTS(SELECT 1 FROM gifts WHERE gift_type=?)
   OR EXISTS(SELECT 1 FROM free_gifts WHERE gift_type=?)`,productId,productId,productId);
  for (const version of versions) {
    const files = JSON.parse(version.files);
    for (const file of [...Object.values(files),...Object.values(JSON.parse(version.originals))]) {
      if (objectKey(file.key)) keys.add(file.key);
      else if (typeof file.key==='string') unknown.add(file.key);
    }
    if (version.published_at&&files.thumbnail&&(giftReceipts||used.has(version.id))) {
      history.push({version:version.id,file:files.thumbnail,published:version.published_at});
    }
  }
  return {keys,unknown,history};
}

async function referencedObjects(env,keys,exceptProduct=null) {
  if (!keys.length) return new Set();
  const references = await rows(env,`WITH candidates AS (SELECT value AS key FROM json_each(?))
   SELECT c.key FROM candidates c JOIN product_history_assets h ON h.object_key=c.key
   UNION
   SELECT c.key FROM product_asset_versions v CROSS JOIN json_each(v.files) f
   JOIN candidates c ON c.key=json_extract(f.value,'$.key') WHERE v.product_id IS NOT ?
   UNION
   SELECT c.key FROM product_asset_versions v CROSS JOIN json_each(v.originals) f
   JOIN candidates c ON c.key=json_extract(f.value,'$.key') WHERE v.product_id IS NOT ?`,
   JSON.stringify(keys),exceptProduct,exceptProduct);
  return new Set(references.map(row=>row.key));
}

export async function previewProductPurge(env,product) {
  const job = await one(env,'SELECT plan,snapshot,progress FROM product_deletions WHERE product_id=?',product.id);
  if (!job) return null;
  const {bundled=[]}=JSON.parse(job.snapshot);
  if (job.plan) {
    const {objects,retained}=JSON.parse(job.plan);
    const remaining=objects.slice(job.progress);
    const shared=await referencedObjects(env,remaining);
    return {remove:remaining.filter(key=>!shared.has(key)),retain:[...new Set([...bundled,...retained,...shared])],
      confirmed_assets:true};
  }
  const {keys,unknown,history}=await versionAssets(env,product.id,product.type);
  const shared=await referencedObjects(env,[...keys],product.id);
  const preserve=new Set([...bundled,...unknown,...shared,...history.map(entry=>entry.file.key)]);
  return {remove:[...keys].filter(key=>!preserve.has(key)),retain:[...preserve],confirmed_assets:false};
}

async function collectProductObjects(bucket,productId,keys) {
  const prefix=objectPrefix+productId+'/';
  let cursor;
  do {
    const page=await bucket.list({prefix,limit:500,cursor});
    for (const object of page.objects) if (object.key.startsWith(prefix)) keys.add(object.key);
    if (keys.size>maxObjects) throw new Error('한 상품의 상품 에셋이 정리 한도를 초과했습니다.');
    cursor=page.truncated?page.cursor:null;
  } while (cursor);
}

const hasLease = 'EXISTS(SELECT 1 FROM product_deletions WHERE product_id=? AND lease=? AND state=\'purging\')';

async function sealProductAssets(env,job) {
  const {product_id,lease,type}=job;
  const {keys,unknown,history}=await versionAssets(env,product_id,type);
  await collectProductObjects(env.BUCKET,product_id,keys);
  const {bundled=[]}=JSON.parse(job.snapshot);
  const plan={objects:[...keys].sort(),retained:[...new Set([...bundled,...unknown,...history.map(item=>item.file.key)])]};
  // Freeze the manifest and detach operational version rows in one transaction,
  // restoring only the small route aliases used by past receipts.
  const [saved]=await env.DB.batch([
    query(env,'UPDATE product_deletions SET plan=? WHERE product_id=? AND lease=? AND plan IS NULL',
      JSON.stringify(plan),product_id,lease),
    query(env,`INSERT INTO product_history_assets(product_id,version_id,file,object_key,published_at)
     SELECT ?,json_extract(h.value,'$.version'),json_extract(h.value,'$.file'),json_extract(h.value,'$.file.key'),json_extract(h.value,'$.published')
     FROM json_each(?) h WHERE ${hasLease} ON CONFLICT DO NOTHING`,product_id,JSON.stringify(history),product_id,lease),
    query(env,`DELETE FROM product_asset_reviews WHERE product_id=? AND ${hasLease}`,product_id,product_id,lease),
    query(env,`DELETE FROM product_asset_versions WHERE product_id=? AND ${hasLease}`,product_id,product_id,lease),
    query(env,`UPDATE product_catalog SET active_version=NULL WHERE product_id=? AND ${hasLease}`,product_id,product_id,lease)
  ]);
  return saved.meta.changes?plan:null;
}

async function recordAssetProgress(env,job,removed,retained,next,complete) {
  const {product_id,lease,name,purge_actor,purge_request}=job;
  const at=now();
  const writes=[
    query(env,'UPDATE product_deletions SET progress=? WHERE product_id=? AND lease=? AND progress=?',
      next,product_id,lease,job.progress),
    query(env,`INSERT INTO admin_audit(id,admin_id,action,target,created)
     SELECT ?,?,'product_delete_assets',?,? WHERE changes()=1`,
      id(),purge_actor,JSON.stringify({product_id,name,purge_request,removed,retained,
        retained_review_evidence:true,result:'success'}),at)
  ];
  if (complete) writes.push(
    // Keep the existing legacy tombstone shape for older source revisions.
    query(env,`UPDATE product_catalog SET definition=json_object('deletedAt',?),active_version=NULL,
     revision=revision+1,last_request=?,updated=? WHERE product_id=? AND ${hasLease}`,
      at,purge_request,at,product_id,product_id,lease),
    query(env,`UPDATE product_deletions SET state='deleted',completed_at=?,lease=NULL,lease_until=0,
     snapshot=json_object('currency',json_extract(snapshot,'$.currency')),plan=NULL,progress=0
     WHERE product_id=? AND lease=?`,at,product_id,lease)
  );
  await env.DB.batch(writes);
}

async function purgeOne(env,productId) {
  const token=id();
  const job=await query(env,`UPDATE product_deletions SET lease=?,lease_until=?
   WHERE product_id=? AND state='purging' AND lease_until<=unixepoch() RETURNING *`,token,now()+leaseSeconds,productId).first();
  if (!job) return;
  try {
    const details=(await deletionDetails(env,[{id:productId,type:job.type}])).get(productId);
    if (!details.ready) {
      await markPurgeFailed(env,productId,token,details.reasons.map(reason=>reason.text).join(' · '));
      return;
    }
    if (!env.BUCKET) throw new Error('상품 저장소에 연결할 수 없습니다.');
    const plan=job.plan?JSON.parse(job.plan):await sealProductAssets(env,job);
    if (!plan) return;
    const end=Math.min(job.progress+filesPerRun,plan.objects.length);
    const batch=plan.objects.slice(job.progress,end);
    // Sealed versions cannot be copied or linked. Recheck every immutable key
    // immediately before deletion, including keys retained by other products.
    const references=await referencedObjects(env,batch);
    const removed=batch.filter(key=>!references.has(key));
    if (removed.length) await env.BUCKET.delete(removed);
    const retained=[...references,...(job.progress===0?plan.retained:[])];
    await recordAssetProgress(env,job,removed,[...new Set(retained)],end,end===plan.objects.length);
  } catch (error) {
    console.error('Product asset cleanup failed',productId,error.message);
    const reason=error.message==='상품 저장소에 연결할 수 없습니다.'||error.message==='한 상품의 상품 에셋이 정리 한도를 초과했습니다.'?
      error.message:'상품 에셋을 정리하지 못했습니다. 저장소를 확인한 뒤 다시 실행해 주세요.';
    await markPurgeFailed(env,productId,token,reason);
  } finally {
    await query(env,'UPDATE product_deletions SET lease=NULL,lease_until=0 WHERE product_id=? AND lease=?',productId,token).run();
  }
}

function markPurgeFailed(env,productId,lease,reason) {
  return query(env,`UPDATE product_deletions SET state='failed',last_error=?,checked_at=unixepoch()
    WHERE product_id=? AND lease=?`,reason,productId,lease).run();
}

export async function runProductPurgeJobs(env,ids=null) {
  if (ids?.length===0) return;
  const pending=await rows(env,`SELECT product_id FROM product_deletions WHERE state='purging' AND lease_until<=unixepoch()
   AND (? IS NULL OR product_id IN (SELECT value FROM json_each(?)))
   ORDER BY lease_until,requested_at,product_id LIMIT 3`,ids===null?null:1,JSON.stringify(ids));
  for (const job of pending) await purgeOne(env,job.product_id);
}
