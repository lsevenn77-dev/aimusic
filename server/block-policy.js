// Personal discovery and public publication are independent scopes. Keep the
// interaction list intact even when a public read clears its content filters.
export function publicContentContext(env){
 return {...env,AIFECT_PUBLIC_CONTENT:true,AIFECT_INTERACTION_BLOCKED:env.AIFECT_INTERACTION_BLOCKED||env.AIFECT_BLOCKED||[],AIFECT_BLOCKED:[],AIFECT_BLOCKED_ARTISTS:[]};
}
export function publicContentRequest(req,url){
 const path=url.pathname,read=req.method==='GET'||req.method==='HEAD';
 if(read){
  if(path==='/api/catalog'&&['top','rising','releases','listens','covers','new'].includes(url.searchParams.get('chart'))&&url.searchParams.get('directory')!=='1')return true;
  if(['/api/cover-rankings','/api/community/rankings'].includes(path))return true;
  if(/^\/api\/tracks\/[\w-]+\/cover-pick$/.test(path))return true;
  if(/^\/api\/tracks\/[\w-]+\/covers$/.test(path)&&(url.searchParams.get('view')==='all'||!url.searchParams.has('view')&&url.searchParams.get('sort')!=='recent'))return true;
  if(path==='/api/playlists'&&!url.searchParams.has('home')&&!url.searchParams.has('q'))return true;
  if(/^\/api\/playlists\/[\w-]+$/.test(path)&&!['candidates','title-availability'].includes(path.split('/').at(-1)))return true;
  if(/^\/api\/tracks\/[\w-]+(?:\/lyrics\/(line|text))?$/.test(path))return true;
  if(/^\/api\/(tracks|producers)\/[\w-]+\/gifts$/.test(path))return true;
  if(/^\/media\/[\w-]+\/(cover|preview|stream|premium)$/.test(path))return true;
 }
 return req.method==='POST'&&/^\/api\/playback\/[\w-]+$/.test(path);
}
// All identifiers below are internal aliases, never request-supplied SQL.
export function artistBlockScope(env,artist='a.id',owner='p.user_id'){
 const users=env.AIFECT_BLOCKED||[],artists=env.AIFECT_BLOCKED_ARTISTS||[];
 return {sql:(users.length?` AND ${owner} NOT IN (SELECT value FROM json_each(?))`:'')+(artists.length?` AND ${artist} NOT IN (SELECT value FROM json_each(?))`:''),args:[...(users.length?[JSON.stringify(users)]:[]),...(artists.length?[JSON.stringify(artists)]:[])]};
}
export function trackBlockScope(env,t='t'){
 const users=env.AIFECT_BLOCKED||[],artists=env.AIFECT_BLOCKED_ARTISTS||[];
 return {
  sql:(users.length?` AND NOT EXISTS(SELECT 1 FROM json_each(?) b WHERE b.value IN (${t}.user_id,(SELECT p.user_id FROM producers p WHERE p.id=${t}.producer_id),(SELECT p.user_id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=${t}.artist_id)))`:'')+
   (artists.length?` AND (${t}.kind!='original' OR ${t}.artist_id NOT IN (SELECT value FROM json_each(?)))`:''),
  args:[...(users.length?[JSON.stringify(users)]:[]),...(artists.length?[JSON.stringify(artists)]:[])]
 };
}
