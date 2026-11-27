import {DECORATIONS,PERIOD_LABELS,roomThemeProduct,frameDisplayAssets} from '../shared/decorations.js';
import {FREE_GIFT,GIFT_CATALOG,SILVER_GIFT_CATALOG,GOLD_KRW,giftById,silverGiftById} from '../shared/gifts.js';
import {fail,rows} from './db.js';
import {themeArtwork} from '../shared/product-asset-contract.js';

export const PRODUCT_TYPES=['gift','frame','theme'];
export const PERIODS=Object.keys(PERIOD_LABELS);
export const GIFT_OPTION='unit';
export const PRODUCT_ID=/^[a-zA-Z0-9_-]{1,80}$/;
export const VERSION_ID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function giftDefinition(gift,listed=true){
 const value=gift.gold??gift.silver;
 return {id:gift.id,type:'gift',name:gift.name,description:gift.description||'',currency:gift.free?'S':'G',
  options:{[GIFT_OPTION]:value},value,distribution:'shop',sale:listed,grant:listed,legacy:true,listed,
  asset:{mode:'static',renderer:'gift-standard',files:{base:gift.image,thumbnail:gift.image}},original:gift};
}

function decorationDefinition(product){
 const type=product.kind==='PROFILE_FRAME'?'frame':'theme',paths=product.assetPaths;
 const canvas=type==='frame'?frameDisplayAssets(paths.overlay,paths.effect):null;
 const files=canvas?{base:canvas.overlay,thumbnail:paths.thumbnail||paths.overlay,...(canvas.effect?{effect:canvas.effect}:{})}:
  {desktop:paths.roomDesktop,mobile:paths.roomMobile,roomCard:paths.roomCard,thumbnail:paths.roomCard};
 return {id:product.sku,type,name:product.name,description:'',currency:product.currency,options:product.periodPrices,
  value:null,distribution:'shop',sale:true,grant:false,legacy:true,listed:true,uiMode:product.uiMode,
  asset:{mode:product.motion==='LAYERED'?'layered':'static',
   renderer:type==='frame'?(paths.effect?'frame-overlay':'frame-static'):product.sku==='theme_christmas'?'christmas-v61':'room-background',files},
  original:product};
}

const legacy=new Map([
 ...[...GIFT_CATALOG,...SILVER_GIFT_CATALOG].map(g=>giftDefinition(g)),
 ...Object.values(DECORATIONS).map(decorationDefinition)
].map(p=>[p.id,p]));
// Installed clients can still send these historical choices. The new shop has
// never listed either as a managed item, and the basic silver unit is a reward.
const compatibility=new Map([giftById('note'),silverGiftById(FREE_GIFT.id)].map(g=>[g.id,giftDefinition(g,false)]));

export function legacyProduct(id){return legacy.get(id);}
export function assetUrl(product,version,role,file,privateAccess=false){
 const path=[product,version,role+'.'+file.extension].join('/');
 return privateAccess?'/api/admin/product-files/'+path:'/api/product-assets/'+path;
}

function entry(id,row){
 const base=legacy.get(id)||compatibility.get(id);
 if(row?.deletion_state==='deleted'||!base&&!row?.definition)return undefined;
 if(!row?.definition)return {...base,revision:0,archived:false,eventOnly:false,grantDeadline:null,activeVersion:null};
 const stored=JSON.parse(row.definition);
 if(stored.deletedAt)return undefined;
 const asset=row.asset_files?{...publishedVersionAsset(id,row.active_version,row.asset_mode,row.asset_renderer,row.asset_files,row.asset_package),
  originalUpload:!!row.asset_original_zip}:base?.asset??null;
 return {...base,...stored,id,revision:row.revision,asset,activeVersion:row.active_version,
  ...(row.deletion_state?{deletionState:row.deletion_state}:{})};
}

function publishedVersionAsset(id,version,mode,renderer,fileJSON,packageJSON){
 const files=Object.fromEntries(Object.entries(JSON.parse(fileJSON)).map(([role,file])=>[role,assetUrl(id,version,role,file)]));
 return {mode,renderer,files,themeArtwork:themeArtwork(packageJSON?JSON.parse(packageJSON).manifest:null,files)};
}

export async function publishedThemeVersions(env,pins){
 const keys=[...new Set(pins.filter(pin=>VERSION_ID.test(pin||'')))];
 if(!keys.length)return new Map();
 const versions=await rows(env,`SELECT product_id,id,mode,renderer,files,package_metadata FROM product_asset_versions
  WHERE published_at IS NOT NULL AND id IN (SELECT value FROM json_each(?))`,JSON.stringify(keys));
 return new Map(versions.map(row=>[row.product_id+'/'+row.id,publishedVersionAsset(row.product_id,row.id,row.mode,row.renderer,row.files,row.package_metadata)]));
}

// The canonical sources supply all existing SKUs. Only edited settings and
// genuinely new product definitions need rows.
export async function catalog(env,ids){
 const keys=ids&&[...new Set(ids.filter(key=>typeof key==='string'&&PRODUCT_ID.test(key)))];
 if(keys?.length===0)return new Map();
 const records=await rows(env,`WITH products AS (
    ${keys?'SELECT value AS product_id FROM json_each(?)':
      "SELECT product_id FROM product_catalog UNION SELECT product_id FROM product_deletions WHERE state='deleted'"}
   ) SELECT products.product_id,p.definition,p.revision,p.active_version,
    a.mode asset_mode,a.renderer asset_renderer,a.files asset_files,a.package_metadata asset_package,
    json_extract(a.originals,'$.package.sha256') asset_original_zip,d.state deletion_state
   FROM products LEFT JOIN product_catalog p USING(product_id)
   LEFT JOIN product_asset_versions a ON a.product_id=p.product_id AND a.id=p.active_version
   LEFT JOIN product_deletions d ON d.product_id=products.product_id
   ORDER BY products.product_id`,...(keys?[JSON.stringify(keys)]:[]));
 const overrides=new Map(records.map(record=>[record.product_id,record]));
 return new Map((keys||[...new Set([...legacy.keys(),...overrides.keys()])])
  .map(key=>[key,entry(key,overrides.get(key))]).filter(([,p])=>p));
}

export async function productById(env,id){
 return (await catalog(env,[id])).get(id);
}

export const sold=product=>!!product&&product.distribution==='shop'&&product.sale&&!product.archived&&!product.deletePendingAt&&!product.deletionState;
export const grantable=product=>!!product?.grant&&!product.archived&&!product.deletePendingAt&&!product.deletionState;

export function assertProductAction(product,action){
 const legacyCompatibility=product?.type==='gift'&&product.legacy&&!product.listed&&!product.revision;
 if(action==='sale'?sold(product)||legacyCompatibility:grantable(product)||legacyCompatibility&&product.id===FREE_GIFT.id)return;
 fail(409,action==='sale'?'현재 판매 중인 상품이 아닙니다.':'현재 발송할 수 없는 상품입니다.');
}

// Insert each receipt/entitlement with this guard in the same D1 batch. A
// concurrent definition change aborts the entire purchase or operator grant.
export function productWriteGuard(product,value){
 if(!product)return {sql:'?',args:[value]};
 return {sql:`CASE WHEN COALESCE((SELECT revision FROM product_catalog WHERE product_id=?),0)=?
   AND NOT EXISTS(SELECT 1 FROM product_deletions WHERE product_id=?) THEN ? END`,
  args:[product.id,product.revision,product.id,value]};
}

export function giftRuntime(product){
 if(product?.type!=='gift')return undefined;
 if(!product.revision)return product.original;
 const value=product.options[GIFT_OPTION];
 return {id:product.id,name:product.name,image:product.asset?.files.thumbnail||'',
  ...(product.currency==='G'?{gold:value,price:value*GOLD_KRW,description:product.description}:{silver:value,free:true}),
  ...(product.eventOnly?{event_only:true}:{}),
  ...(product.activeVersion?{artwork:product.asset.files.fallback||product.asset.files.base,effect:product.asset.files.effect,
   ...(product.asset.mode==='animated'?{animation:product.asset.files.base}:{})}:{})};
}

export async function archivedGiftImages(env,ids){
 const missing=[...new Set(ids)];
 if(!missing.length)return new Map();
 const records=await rows(env,`WITH ranked AS (
  SELECT product_id,version_id,file,ROW_NUMBER() OVER(PARTITION BY product_id ORDER BY published_at DESC,version_id) position
  FROM product_history_assets WHERE product_id IN (SELECT value FROM json_each(?))
 ) SELECT product_id,version_id,file FROM ranked WHERE position=1`,JSON.stringify(missing));
 const byId=new Map(records.map(row=>[row.product_id,assetUrl(row.product_id,row.version_id,'thumbnail',JSON.parse(row.file))]));
 return new Map(missing.map(key=>[key,byId.get(key)??legacyProduct(key)?.asset.files.thumbnail]));
}

export function decorationRuntime(product){
 if(!product||product.type==='gift'||!product.asset)return undefined;
 if(!product.revision)return product.original;
 const {files,mode}=product.asset;
 const assetPaths=(!product.activeVersion&&product.original)?product.original.assetPaths:
  product.type==='frame'?{overlay:files.fallback||files.base,thumbnail:files.thumbnail,...(mode==='animated'?{effect:files.base}:files.effect?{effect:files.effect}:{})}:
  {roomDesktop:files.desktop,roomMobile:files.mobile,roomCard:files.roomCard||files.thumbnail,thumbnail:files.thumbnail,
   ...(files.app?{roomApp:files.app}:{}),...(files.desktopEffect?{desktopEffect:files.desktopEffect,mobileEffect:files.mobileEffect,appEffect:files.appEffect}:{})};
 return {...product.original,sku:product.id,name:product.name,kind:product.type==='frame'?'PROFILE_FRAME':'TALKING_ROOM_THEME',
  currency:product.currency,periodPrices:product.options,assetPaths,
  motion:mode==='animated'||mode==='layered'?'LAYERED':'STATIC',
  ...(product.activeVersion?{catalog_thumbnail:files.thumbnail}:{}),
  ...(product.type==='theme'&&product.asset.themeArtwork?{themeArtwork:product.asset.themeArtwork,assetVersion:product.activeVersion}:{}),
  ...(product.type==='theme'?{uiMode:product.uiMode}:{}),...(product.eventOnly?{event_only:true}:{})};
}

export async function catalogRoomTheme(env,sku,products,pin=null,versions){
 let item=products?products.get(sku):await productById(env,sku);
 if(pin!==null&&item&&pin!==item.activeVersion){
  const asset=pin?(versions??await publishedThemeVersions(env,[pin])).get(sku+'/'+pin):null;
  item={...item,activeVersion:asset?pin:null,asset:asset??legacyProduct(sku)?.asset};
 }
 const product=decorationRuntime(item);
 return product?.kind==='TALKING_ROOM_THEME'?product:roomThemeProduct(sku);
}
