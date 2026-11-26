import {fail,one} from './db.js';
import {isAdmin,requireUser} from './auth.js';
import {productById,PRODUCT_ID,VERSION_ID,giftRuntime,decorationRuntime} from './product-catalog.js';
import {describeProductVersion} from './product-assets.js';
import {reviewPlan} from './product-reviews.js';
import {themeArtwork} from '../shared/product-asset-contract.js';

const clientFiles=['genres-core','app','icons','membership','player-core','gifts-core','chat-ui','user-nickname','player-progress','gifts',
 'inventory','decorations','community-v3','voice-room-template','voice-rooms','voice-room-controls','room-layout','room-release','live-karaoke',
 'product-theme-layout','decoration-display','christmas-review','profile-preview','unified-search'];
const surfaceFiles={
 shop:['home'],
 my:['menu-integration','mypage'],
 messages:['chat-stickers','messages-ui','social-chat','improvements','chat-features','page-redesign']
};

export async function loadProductPreview(env,productId,versionId,surface,assetUrl){
 if(typeof productId!=='string')fail(400,'상품 ID를 확인해 주세요.');
 if(!PRODUCT_ID.test(productId))fail(404,'상품을 찾을 수 없습니다.');
 let product=await productById(env,productId);
 if(!product?.listed)fail(404,'상품을 찾을 수 없습니다.');
 const revision=product.revision;
 if(versionId){
  if(!VERSION_ID.test(versionId))fail(404,'에셋 버전을 찾을 수 없습니다.');
  const stored=await one(env,'SELECT * FROM product_asset_versions WHERE product_id=? AND id=?',productId,versionId);
  if(!stored)fail(404,'에셋 버전을 찾을 수 없습니다.');
  const version=describeProductVersion(stored);
  const files=Object.fromEntries(Object.entries(version.files).map(([role,file])=>[role,assetUrl?assetUrl(role,file):file.url]));
  product={...product,activeVersion:version.id,revision:Math.max(1,product.revision),
   asset:{mode:version.mode,renderer:version.renderer,files,themeArtwork:themeArtwork(version.package?.manifest,files)}};
 }
 if(!product.asset||!reviewPlan(product,product.asset.mode).some(item=>item.surface===surface))fail(404,'이 상품에서 볼 수 있는 미리보기 화면을 선택해 주세요.');
 return {id:product.id,revision,type:product.type,surface,gift:giftRuntime(product),decor:decorationRuntime(product),base:product.asset.files};
}

export async function productPreviewRoute(req,env,path,user){
 if(path!=='/api/admin/product-preview')return null;
 requireUser(user);if(!isAdmin(env,user))fail(403,'상품 미리보기 권한이 필요합니다.');
 if(req.method!=='GET')fail(405,'미리보기 조회만 지원합니다.');
 const p=new URL(req.url).searchParams;
 const data=await loadProductPreview(env,p.get('id')||'',p.get('version'),p.get('surface'));
 const platform=p.get('platform'),quality=p.get('quality'),dpr=Number(p.get('dpr'));
 return renderProductPreview(req,env,data,['android','ios'].includes(platform),{
  quality:['low','static'].includes(quality)?quality:'auto',dpr:dpr>=1&&dpr<=4?dpr:0});
}

export async function renderProductPreview(req,env,snapshot,nativeRoom=false,view={}){
 const url=new URL(req.url),surface=snapshot.surface;
 if(!env.ASSETS)fail(503,'서비스 화면 리소스를 불러올 수 없습니다.');
 const shell=await env.ASSETS.fetch(new Request(new URL('/aifect-shell.txt',url)));
 if(!shell.ok)fail(503,'서비스 화면 리소스를 불러올 수 없습니다.');
 const template=await shell.text();
 const styles=template.match(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi)?.join('\n')||'';
 const shellOpen=template.match(/<body\b[^>]*>[\s\S]*?<main id="main"[^>]*>/i)?.[0];
 if(!shellOpen)fail(503,'서비스 공통 화면을 불러올 수 없습니다.');
 const modal=template.match(/<dialog\b[^>]*\bid="dialog"[^>]*>[\s\S]*?<\/dialog>/i)?.[0];
 if(!modal)fail(503,'서비스 팝업 리소스를 불러올 수 없습니다.');
 const files=[...clientFiles,...(surfaceFiles[surface]||[]),'product-preview'];
 const data=JSON.stringify(snapshot).replaceAll('<','\\u003c');
 const html=`<!doctype html><html lang="ko" data-product-preview${nativeRoom?' data-aifect-native-room':''} data-preview-quality="${view.quality??'auto'}" data-preview-dpr="${view.dpr??0}"><head><meta charset="utf-8">
 <base href="/"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
 <title>상품 적용 미리보기 · AIFECT</title>${styles}<link rel="stylesheet" href="/product-preview.css"></head>
 ${shellOpen}</main></div><div class="player" hidden></div>${modal}<script id="product-review-data" type="application/json">${data}</script>
 ${files.map(name=>'<script defer src="/'+name+'.js"></script>').join('')}</body></html>`;
 return new Response(html,{headers:{
  'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; base-uri 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'none'; form-action 'none'; frame-ancestors 'self'",
  'permissions-policy':'camera=(), microphone=(), display-capture=(), payment=(), geolocation=()'
 }});
}
