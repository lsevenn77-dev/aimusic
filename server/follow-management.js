import {one,rows,query,json,fail,now} from './db.js';
import {requireUser} from './auth.js';
import {assertUnblocked} from './account-safety.js';
import {publicNameSQL} from './identity.js';
import {namedArtistSQL} from './artist-identity.js';

const tabs=['followers','following','artists','blocks'];
const actor='(SELECT viewer FROM ctx)',owner='(SELECT owner FROM ctx)',artist='(SELECT artist FROM ctx)';
const personal=(left,right)=>`EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=${left} AND b.blocked_id=${right}) OR (b.user_id=${right} AND b.blocked_id=${left}))`;
export async function assertArtistInteraction(env,aid,uid){
 if(aid&&uid&&await one(env,'SELECT 1 FROM artist_follow_blocks WHERE artist_id=? AND user_id=?',aid,uid))fail(403,'이 아티스트와는 상호작용할 수 없어요.');
}
// This is the reverse personal follow edge; artist fans are a separate relationship.
export async function producerFollowsViewer(env,ownerId,viewerId){
 if(!viewerId||!ownerId||ownerId===viewerId)return false;
 return !!await one(env,"SELECT 1 FROM follows f JOIN producers viewer ON viewer.id=f.target_id WHERE f.kind='producer' AND f.user_id=? AND viewer.user_id=?",ownerId,viewerId);
}
async function scope(env,user,q){
 const tab=q.get('tab')||'followers',aid=q.get('artist')||'',requested=q.get('user');
 if(!tabs.includes(tab)||aid&&tab!=='artists')fail(400,'목록을 확인해주세요.');
 let uid=requested||user?.id,artistName='';
 if(aid){
  const a=await one(env,`SELECT a.name,p.user_id FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=? AND ${namedArtistSQL()}`,aid);
  if(!a||requested&&requested!==a.user_id)fail(404,'아티스트를 찾을 수 없어요.');
  uid=a.user_id;artistName=a.name;await assertArtistInteraction(env,aid,user?.id);
 }
 if(!uid)requireUser(user);
 assertUnblocked(env,uid);
 const member=await one(env,`SELECT ${publicNameSQL()} name FROM users u WHERE u.id=? AND u.provider!='deleted'`,uid);
 if(!member)fail(404,'회원을 찾을 수 없어요.');
 const own=uid===user?.id;
 if(!own&&(tab==='blocks'||tab==='artists'&&!aid))fail(403,'본인만 볼 수 있는 목록입니다.');
 return {tab,uid,aid,own,name:artistName||member.name,viewer:user?.id||'',kind:q.get('kind')||''};
}
// An edge identifies the displayed person/artist and, independently, its moderation scope.
function source(s){
 const received=`SELECT f.user_id uid,NULL aid,NULL scope,f.created FROM follows f WHERE (f.kind='producer' AND f.target_id=(SELECT id FROM producers WHERE user_id=${owner})) OR (f.kind='member' AND f.target_id=${owner})
 UNION ALL SELECT bot_id,NULL,NULL,created FROM ai_support_follows WHERE owner_id=${owner}`;
 const sent=`SELECT COALESCE(p.user_id,CASE WHEN f.kind='member' THEN f.target_id END,ap.user_id),a.id,NULL,f.created FROM follows f
 LEFT JOIN producers p ON f.kind='producer' AND p.id=f.target_id LEFT JOIN artists a ON f.kind='artist' AND a.id=f.target_id AND ${namedArtistSQL()} LEFT JOIN producers ap ON ap.id=a.producer_id
 WHERE f.user_id=${owner} ${s.kind==='artists'?"AND f.kind='artist'":s.kind==='producers'?"AND f.kind IN ('producer','member')":''}
 UNION ALL SELECT owner_id,NULL,NULL,created FROM ai_support_follows WHERE bot_id=${owner}`;
 const fans=`SELECT f.user_id,NULL,NULL,max(f.created) FROM artists a JOIN producers p ON p.id=a.producer_id JOIN follows f ON f.kind='artist' AND f.target_id=a.id WHERE p.user_id=${owner} AND ${namedArtistSQL()} AND (${artist}='' OR a.id=${artist}) AND NOT EXISTS(SELECT 1 FROM artist_follow_blocks b WHERE b.artist_id=a.id AND b.user_id=f.user_id) GROUP BY f.user_id`;
 const blocked=`SELECT blocked_id,NULL,NULL,created FROM user_blocks WHERE user_id=${actor}
 UNION ALL SELECT b.user_id,NULL,b.artist_id,b.created FROM artist_follow_blocks b JOIN artists a ON a.id=b.artist_id JOIN producers p ON p.id=a.producer_id WHERE b.direction='fan' AND p.user_id=${actor}
 UNION ALL SELECT p.user_id,a.id,NULL,b.created FROM artist_follow_blocks b JOIN artists a ON a.id=b.artist_id JOIN producers p ON p.id=a.producer_id WHERE b.direction='artist' AND b.user_id=${actor}`;
 return `WITH RECURSIVE ctx(viewer,owner,artist) AS (VALUES(?,?,?)),edges(uid,aid,scope,created) AS (${({followers:received,following:sent,artists:fans,blocks:blocked})[s.tab]}),
 people AS (SELECT CASE WHEN e.aid IS NOT NULL THEN 'a:'||e.aid WHEN e.scope IS NOT NULL THEN 's:'||e.scope||':'||u.id ELSE 'm:'||u.id END key,
 u.id uid,e.aid artist_id,e.scope,sa.name scope_name,p.id profile_id,(SELECT code FROM public_profile_ids WHERE user_id=u.id) public_id,CASE WHEN e.aid IS NULL THEN p.bio ELSE a.bio END bio,COALESCE(a.name,${publicNameSQL()}) name,COALESCE(a.image_version,p.image_version) image_version,
 max(e.created) created FROM edges e JOIN users u ON u.id=e.uid LEFT JOIN producers p ON p.user_id=u.id LEFT JOIN artists a ON a.id=e.aid LEFT JOIN artists sa ON sa.id=e.scope
 WHERE u.provider!='deleted' ${s.tab==='blocks'?'':`AND NOT ${personal(actor,'u.id')} AND NOT ${personal(owner,'u.id')} AND NOT EXISTS(SELECT 1 FROM artist_follow_blocks b WHERE b.artist_id=e.aid AND b.user_id IN (${actor},${owner}))`} GROUP BY key)`;
}
const binds=s=>[s.viewer,s.uid,s.aid];
export async function followCounts(env,uid,viewer,aid=''){
 const s={viewer:viewer||'',uid,aid};
 const count=tab=>one(env,source({...s,tab})+' SELECT count(*) n FROM people',...binds(s)).then(r=>r.n);
 return aid?{followers:await count('artists')}:Object.fromEntries(await Promise.all(['followers','following'].map(async tab=>[tab,await count(tab)])));
}
const cho='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function matchPattern(word){
 // GLOB character classes represent Hangul syllable ranges without DB extensions.
 return '*'+Array.from(word.toLowerCase(),c=>{
  const i=cho.indexOf(c);if(i>=0)return '['+c+String.fromCharCode(44032+i*588)+'-'+String.fromCharCode(44032+(i+1)*588-1)+']';
  return ({'*':'[*]','?':'[?]','[':'[[]'})[c]||c;
 }).join('')+'*';
}
// SQLite has no ICU collation in D1. Encode digit runs by significant length then digits;
// decomposing syllables also puts standalone Korean initials beside their syllable group.
const digit="substr(rest,1,1) GLOB '[0-9]'",run="substr(rest,1,length(rest)-length(ltrim(rest,'0123456789')))",significant=`coalesce(nullif(ltrim(${run},'0'),''),'0')`,cp='unicode(rest)-44032';
const sortKeys=`, sortkeys(key,rest,token) AS (
 SELECT key,lower(name),'' FROM matched UNION ALL SELECT key,CASE WHEN ${digit} THEN ltrim(rest,'0123456789') ELSE substr(rest,2) END,
 token||CASE WHEN ${digit} THEN '0'||printf('%04d',length(${significant}))||${significant}
 WHEN unicode(rest) BETWEEN 44032 AND 55203 THEN char(4352+(${cp})/588,4449+((${cp})%588)/28)||CASE WHEN (${cp})%28=0 THEN '' ELSE char(4519+(${cp})%28) END
 WHEN instr('${cho}',substr(rest,1,1))>0 THEN char(4351+instr('${cho}',substr(rest,1,1))) ELSE substr(rest,1,1) END FROM sortkeys WHERE rest!='')`;
const nameOrder="CASE WHEN name GLOB '[가-힣ㄱ-ㅣᄀ-ᇿ]*' THEN 0 WHEN name GLOB '[A-Za-z]*' THEN 1 WHEN name GLOB '[0-9]*' THEN 2 ELSE 3 END,sk.token COLLATE BINARY,m.key";
async function list(env,s,q){
 const word=(q.get('q')||'').trim().normalize('NFC'),offset=Number(q.get('offset')||0),keys=q.get('keys')==='1',byName=q.get('sort')==='name'&&!keys;
 if(word.length>100||!Number.isSafeInteger(offset)||offset<0)fail(400,'검색 조건을 확인해주세요.');
 const cte=source(s),args=binds(s),pattern=matchPattern(word),limit=keys?500:50;
 const filtered=cte+', matched AS (SELECT * FROM people WHERE lower(name) GLOB ?)';
 const count=query(env,cte+' SELECT count(*) total,count(CASE WHEN lower(name) GLOB ? THEN 1 END) matched FROM people',...args,pattern);
 const after=q.get('after')||'';
 const page=query(env,filtered+(byName?sortKeys:'')+' SELECT '+(keys?'m.key,m.name':`m.*,COALESCE((SELECT sum(x.amount) FROM player_xp x WHERE x.user_id=m.uid),0) player_xp,
  (EXISTS(SELECT 1 FROM follows f WHERE f.user_id=${actor} AND ((m.artist_id IS NOT NULL AND f.kind='artist' AND f.target_id=m.artist_id) OR (m.artist_id IS NULL AND ((f.kind='producer' AND f.target_id=m.profile_id) OR (f.kind='member' AND f.target_id=m.uid))))) OR (m.artist_id IS NULL AND EXISTS(SELECT 1 FROM ai_support_follows bot WHERE bot.bot_id=${actor} AND bot.owner_id=m.uid))) following,
  (m.artist_id IS NULL AND ${actor}!='' AND (EXISTS(SELECT 1 FROM follows reverse WHERE reverse.user_id=m.uid AND
    ((reverse.kind='member' AND reverse.target_id=${actor}) OR (reverse.kind='producer' AND reverse.target_id=(SELECT id FROM producers WHERE user_id=${actor}))))
    OR EXISTS(SELECT 1 FROM ai_support_follows bot WHERE bot.bot_id=m.uid AND bot.owner_id=${actor}))) follows_viewer`)+
 ' FROM matched m '+(byName?"JOIN sortkeys sk ON sk.key=m.key AND sk.rest='' ":'')+(keys?'WHERE m.key>? ':'')+'ORDER BY '+(keys?'m.key':byName?nameOrder:q.get('sort')==='oldest'?'m.created ASC,m.key':'m.created DESC,m.key')+' LIMIT ? OFFSET ?',...args,pattern,...(keys?[after]:[]),limit+1,keys?0:offset);
 if(keys){const {results}=await page.all(),items=results.slice(0,limit);return json({items,next:results.length>limit?items.at(-1).key:null});}
 const [counts,pageData]=await env.DB.batch([count,page]),items=pageData.results.slice(0,limit),next=pageData.results.length>limit?(keys?items.at(-1).key:offset+limit):null;
 const artists=s.own&&s.tab==='artists'&&!keys&&!offset?await rows(env,`SELECT a.id,a.name,(SELECT count(*) FROM follows f JOIN users u ON u.id=f.user_id WHERE f.kind='artist' AND f.target_id=a.id AND u.provider!='deleted' AND NOT ${personal('p.user_id','u.id')} AND NOT EXISTS(SELECT 1 FROM artist_follow_blocks b WHERE b.artist_id=a.id AND b.user_id=u.id)) followers FROM artists a JOIN producers p ON p.id=a.producer_id WHERE p.user_id=? AND ${namedArtistSQL()} ORDER BY a.name,a.id`,s.uid):[];
 const totals=s.tab==='artists'?undefined:await followCounts(env,s.uid,s.viewer);
 return json({...counts.results[0],counts:totals,items,next,artists,own:s.own,owner:s.uid,name:s.name,manage:s.own&&(s.tab!=='artists'||!!s.aid)});
}
async function mutate(req,env,s){
 const b=await req.json(),keys=b.keys,op=b.action;
 const ops={followers:['remove','block','follow','unfollow'],following:['unfollow','block'],artists:['remove','block'],blocks:['unblock']};
 if(!s.own||!ops[s.tab].includes(op)||s.tab==='artists'&&!s.aid)fail(403,'이 목록을 관리할 수 없어요.');
 if(!Array.isArray(keys)||!keys.length||keys.length>80||new Set(keys).size!==keys.length||keys.some(k=>typeof k!=='string'||k.length>200))fail(400,'선택 대상을 확인해주세요.');
 const cte=source(s)+`, targets AS (SELECT * FROM people WHERE key IN (SELECT value FROM json_each(?)) AND ${owner}=${actor} ${s.tab==='artists'?`AND EXISTS(SELECT 1 FROM artists a JOIN producers p ON p.id=a.producer_id WHERE a.id=${artist} AND p.user_id=${actor})`:''}
 ${['block','follow'].includes(op)?`AND (uid!=${actor} OR artist_id IS NOT NULL)`:''}) `;
 const q=(sql,...args)=>query(env,cte+sql,...binds(s),JSON.stringify(keys),...args);
 const statements=[q('SELECT key,name FROM targets')];
 if(op==='remove'&&s.tab==='artists')statements.push(q(`DELETE FROM follows WHERE kind='artist' AND target_id=${artist} AND user_id IN (SELECT uid FROM targets)`));
 else if(op==='remove'){
  statements.push(q(`DELETE FROM follows WHERE ((kind='member' AND target_id=${actor}) OR (kind='producer' AND target_id=(SELECT id FROM producers WHERE user_id=${actor}))) AND user_id IN (SELECT uid FROM targets)`),q(`DELETE FROM ai_support_follows WHERE owner_id=${actor} AND bot_id IN (SELECT uid FROM targets)`));
 }else if(op==='follow')statements.push(q(`INSERT OR IGNORE INTO follows SELECT ${actor},CASE WHEN profile_id IS NULL THEN 'member' ELSE 'producer' END,coalesce(profile_id,uid),? FROM targets`,now()));
 else if(op==='unfollow')statements.push(
  q(`DELETE FROM follows WHERE user_id=${actor} AND (kind,target_id) IN (
    SELECT 'artist',artist_id FROM targets WHERE artist_id IS NOT NULL UNION ALL
    SELECT 'producer',profile_id FROM targets WHERE artist_id IS NULL UNION ALL
    SELECT 'member',uid FROM targets WHERE artist_id IS NULL)`),
  q(`DELETE FROM ai_support_follows WHERE bot_id=${actor} AND owner_id IN (SELECT uid FROM targets WHERE artist_id IS NULL)`));
 else if(op==='block'&&s.tab==='artists')statements.push(q(`INSERT OR IGNORE INTO artist_follow_blocks SELECT ${artist},uid,'fan',? FROM targets`,now()));
 else if(op==='block'){
  statements.push(q(`INSERT OR IGNORE INTO artist_follow_blocks SELECT artist_id,${actor},'artist',? FROM targets WHERE artist_id IS NOT NULL`,now()),q(`INSERT OR IGNORE INTO user_blocks SELECT ${actor},uid,? FROM targets WHERE artist_id IS NULL`,now()));
 }else if(op==='unblock'){
  statements.push(q(`DELETE FROM artist_follow_blocks WHERE (artist_id,user_id,direction) IN (SELECT scope,uid,'fan' FROM targets WHERE scope IS NOT NULL UNION ALL SELECT artist_id,${actor},'artist' FROM targets WHERE artist_id IS NOT NULL)`),q(`DELETE FROM user_blocks WHERE user_id=${actor} AND blocked_id IN (SELECT uid FROM targets WHERE scope IS NULL AND artist_id IS NULL)`));
 }
 const [verified]=await env.DB.batch(statements),ok=verified.results.map(r=>r.key);
 return json({ok,failed:keys.filter(k=>!ok.includes(k))});
}
export async function followManagement(req,env,path,user){
 if(path!=='/api/follow-management')return null;
 if(req.method==='POST')requireUser(user);
 const q=new URL(req.url).searchParams,s=await scope(env,user,q);
 if(req.method==='GET')return list(env,s,q);
 if(req.method==='POST')return mutate(req,env,s);
 fail(405,'지원하지 않는 요청입니다.');
}
