import {one,run,fail,json,rate} from './db.js';
import {requireUser} from './auth.js';
import {activePlaylistSQL,requireActivePlaylist} from './membership.js';
import {storeImage} from './images.js';
import {objectResponse} from './storage.js';

export async function playlistImageRoute(req,env,path,user){
 const match=path.match(/^\/(api\/playlists|media\/playlist)\/([\w-]+)\/image$/);if(!match)return null;
 const p=await one(env,`SELECT p.*,${activePlaylistSQL()} active FROM playlists p WHERE p.id=?`,match[2]);
 if(!p||((!p.is_public||!p.active)&&p.user_id!==user?.id))fail(404,'플레이리스트를 찾을 수 없습니다.');
 const key=v=>`images/playlist/${p.id}/${v}`;
 if(match[1]==='media/playlist'){
  if(!['GET','HEAD'].includes(req.method))fail(405,'지원하지 않는 요청입니다.');
  if(!p.image_version)fail(404,'플레이리스트 이미지가 없습니다.');
  // A public playlist can become private. Recheck access on every image request.
  return objectResponse(req,env,key(p.image_version),p.image_type,false);
 }
 requireUser(user);if(p.user_id!==user.id)fail(403,'내 플레이리스트 이미지만 변경할 수 있습니다.');
 await requireActivePlaylist(env,p);
 if(!['PUT','DELETE'].includes(req.method))fail(405,'지원하지 않는 요청입니다.');
 await rate(env,'playlist-image:'+user.id,30,3600);
 const image=req.method==='PUT'?await storeImage(req,env,'playlist',p.id):{version:'',type:''};
 try{await run(env,'UPDATE playlists SET image_version=?,image_type=? WHERE id=?',image.version,image.type,p.id);}
 catch(e){if(image.version)await env.BUCKET.delete(key(image.version));throw e;}
 if(p.image_version)await env.BUCKET.delete(key(p.image_version)).catch(()=>{});
 return json({ok:true,image_version:image.version});
}
