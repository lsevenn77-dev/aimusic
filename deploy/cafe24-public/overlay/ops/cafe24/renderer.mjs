import {publicMusicRoute} from '../../server/public-music.js';
import {publicPageRoute} from '../../server/public-pages.js';
export async function render(target,data,shell){
 const url=new URL(target,'https://aifect.co.kr'),req=new Request(url);
 const env={ASSETS:{fetch(){return new Response(shell);}}};
 return await publicMusicRoute(req,env,url.pathname,data)||publicPageRoute(req,url.pathname);
}
