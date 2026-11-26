
import {isAdmin,requireUser} from './auth.js';
import {fail,json,now,rate} from './db.js';
import {PERIOD_LABELS} from '../shared/decorations.js';
import {loadProductPreview,renderProductPreview} from './product-preview.js';
import {productFileRoute} from './product-assets.js';

const root='/api/product-review/';
const ttl=600;
const encoder=new TextEncoder();
const decoder=new TextDecoder();
const b64=data=>btoa(String.fromCharCode(...data)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unbase=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const ticketPattern=/^[A-Za-z0-9_-]{16,420}\.[A-Za-z0-9_-]{43}$/;

async function signingKey(env){
 const key=env.AIFECT_PRODUCT_REVIEW_KEY;
 if(typeof key!=='string'||key.length<32)fail(503,'앱 미리보기 서명 설정을 확인해 주세요.');
 return crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function makeTicket(env,value){
 const payload=b64(encoder.encode(JSON.stringify(value)));
 const signature=new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),encoder.encode(payload)));
 return payload+'.'+b64(signature);
}
async function verifyTicket(env,ticket){
 if(!ticketPattern.test(ticket))fail(404,'앱 미리보기 링크를 찾을 수 없습니다.');
 const [payload,signature]=ticket.split('.');
 const valid=await crypto.subtle.verify('HMAC',await signingKey(env),unbase(signature),encoder.encode(payload));
 if(!valid)fail(404,'앱 미리보기 링크를 찾을 수 없습니다.');
 const value=JSON.parse(decoder.decode(unbase(payload)));
 if(value.exp<=now()||value.exp>now()+ttl)fail(410,'앱 미리보기 링크가 만료되었습니다.');
 return value;
}

export async function createNativeProductReview(req,env,user){
 requireUser(user);if(!isAdmin(env,user))fail(403,'상품 미리보기 권한이 필요합니다.');
 if(req.method!=='POST')fail(405,'앱 미리보기 링크를 요청해 주세요.');
 const {id,version=null,surface,platform}=await req.json().catch(()=>null)??{};
 if(!['android','ios'].includes(platform))fail(400,'Android 또는 iOS를 선택해 주세요.');
 await rate(env,'native-product-review:'+user.id,30,600);
 const data=await loadProductPreview(env,id,version,surface),exp=now()+ttl;
 const ticket=await makeTicket(env,{id,version,surface,platform,rev:data.revision,exp});
 return json({open_url:'kr.co.aifect.app://product-review?ticket='+ticket,expires_at:exp},201);
}

function fixtureData(snapshot,claims,path){
 const gift=snapshot.gift,decor=snapshot.decor;
 const gallery={products:decor?[decor]:[],periods:PERIOD_LABELS};
 const wallet={balance:120000,free:{balance:10000},gifts:gift&&!gift.free?[gift]:[],silver_gifts:gift?.free?[gift]:[]};
 const period=Object.keys(decor?.periodPrices||{})[0];
 const item={id:'qa-entitlement',item_key:snapshot.id,source:'decoration_stock',stored:true,available:true,giftable:true,
  status:'UNUSED',period_code:period,permanent:period==='PERMANENT',expires_at:0,product:decor};
 const owned=gift?[{id:'qa-gift',gift_type:gift.id,gift_name:gift.name,image:gift.image,giftable:true,available:true,
  value:gift.gold??gift.silver,expires_at:0,grant_origin:null}]:[];
 const profile={id:'qa-profile-1',user_id:'qa-member-1',name:'아리아',public_id:'QAA0001',bio:'상품 적용 검수용 프로필입니다.',
  profile_frame:decor?.kind==='PROFILE_FRAME'?decor.sku:null,
  profile_frame_artwork:decor?.assetPaths?.overlay,
  profile_frame_display:decor?.kind==='PROFILE_FRAME'?{overlay:decor.assetPaths.overlay,effect:decor.assetPaths.effect,scale:1.5}:null};
 const created=1764115200;
 const chat=[{id:'qa-message-1',sender_id:profile.user_id,user_id:profile.user_id,profile_id:profile.id,name:profile.name,
  body:'오늘도 함께 들어요.',created,sequence:1},{id:'qa-message-2',sender_id:'qa-member-2',user_id:'qa-member-2',
  name:'소리',profile_id:'qa-profile-2',body:'좋아요!',created:created+2,sequence:2}];
 const surface=snapshot.surface,isRoom=/^(talk|karaoke)/.test(surface);
 const skins=snapshot.type==='theme'&&decor?decor.assetPaths:null;
 const names=[profile.name,'소리','코러스','별빛','은하','선율','라임','루나','하늘'];
 const members=isRoom?names.map((name,index)=>({...profile,name,id:'qa-member-'+(index+1),user_id:'qa-member-'+(index+1),
  profile_id:'qa-profile-'+(index+1),role:index===0?'host':'member',seat:index<8?index:null,muted:index===1&&surface.endsWith('-muted')})):null;
 const native_room=isRoom?{self:'qa-member-1',members,chat,room:{id:'qa-room',host_id:'qa-member-1',
  mode:surface.startsWith('karaoke')?'karaoke':'talk',title:surface.startsWith('karaoke')?'라이브 노래방':'토킹룸',
  settings_revision:1,max_members:30,theme_sku:skins?snapshot.id:'basic_dark',
  ...(skins?{theme:{sku:snapshot.id,assets:skins,expires_at:0,permanent:true,uiMode:surface.endsWith('-light')?'light':'dark'}}:{})},
  music:{queue:[],index:0,revision:1,volume:1,playing:false}}:null;
 return {surface,type:snapshot.type,platform:claims.platform,expires_at:claims.exp,
  catalog:gallery,wallet,profile,chat,item,player:{inventory:[],stored_decorations:decor?[item]:[],decorations:[],rewards:[]},owned,
  ...(isRoom?{room:path+'/room',native_room}:{})};
}

export async function nativeProductReviewRoute(req,env,path){
 if(!path.startsWith(root))return null;
 if(!['GET','HEAD'].includes(req.method))fail(405,'앱 미리보기는 조회만 지원합니다.');
 const [ticket,action,file,...extra]=path.slice(root.length).split('/');
 if(extra.length||!['data','room','asset'].includes(action)||(action!=='asset'&&file))fail(404,'앱 미리보기를 찾을 수 없습니다.');
 const claims=await verifyTicket(env,ticket),base=root+ticket;
 const data=await loadProductPreview(env,claims.id,claims.version,claims.surface,(role,asset)=>base+'/asset/'+role+'.'+asset.extension);
 if(claims.rev!==data.revision)fail(409,'상품 설정이 바뀌었습니다. 새 미리보기 링크를 요청해 주세요.');
 if(action==='data')return json(fixtureData(data,claims,base),200,{'referrer-policy':'no-referrer'});
 if(action==='room'){
  if(!/^(talk|karaoke)/.test(claims.surface)||claims.platform==='android'&&!claims.surface.startsWith('karaoke'))fail(404,'이 화면은 네이티브 렌더러가 필요합니다.');
  return renderProductPreview(req,env,data,true);
 }
 if(!claims.version||!/^[A-Za-z]+\.(png|webp|jpg|gif)$/.test(file||'')||!Object.values(data.base).includes(base+'/asset/'+file))
  fail(404,'미리보기 에셋을 찾을 수 없습니다.');
 return productFileRoute(req,env,'/api/admin/product-files/'+claims.id+'/'+claims.version+'/'+file,true);
}
