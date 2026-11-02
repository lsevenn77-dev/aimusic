import {validGenre,MOODS,genreFilterSQL} from '../shared/genres.js';
import {VISIBLE,trackList} from './catalog.js';
import {playlistSummaries} from './discovery.js';
import {namedArtistSQL} from './artist-identity.js';
import {publicNameSQL} from './identity.js';
import {activePlaylistSQL} from './membership.js';
import {one,rows,fail,json} from './db.js';
import {songSearchScope,songBlockScope} from './song-search.js';
import {searchRank} from './search-rank.js';

// Display labels never become text predicates for taxonomy searches.
export async function unifiedSearch(env,user,params){
 const q=(params.get('q')||'').trim().slice(0,100),genre=params.get('genre')||'',mood=params.get('mood')||'';
 if(genre&&!validGenre(genre))fail(400,'장르를 다시 선택해주세요.');
 if(mood&&!MOODS.some(m=>m.id===mood))fail(400,'분위기를 다시 선택해주세요.');
 if(!q&&!genre&&!mood)return json({tracks:[],artists:[],producers:[],playlists:[],recommended:[],counts:{tracks:0,artists:0,producers:0,playlists:0},has_more:false});
 const offset=Math.max(0,Math.min(100000,Math.trunc(Number(params.get('offset')))||0));
 const classified=!!(genre||mood),args=[];
 let where=VISIBLE()+" AND t.kind='original'";
 if(genre){where+=' AND '+genreFilterSQL();args.push(genre,genre);}
 if(mood){where+=' AND EXISTS(SELECT 1 FROM json_each(t.moods_json) jm WHERE jm.value=?)';args.push(mood);}
 const blocked=env.AIFECT_BLOCKED||[];
 const block=songBlockScope(blocked);where+=block.sql;args.push(...block.args);
 const from='FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id';
 const song=q?await songSearchScope(env,q,where,args):null;
 if(song){where=song.where;args.push(...song.args);}
 const matched=`SELECT t.id ${from} WHERE ${where}`;
 const artistFields=['artist.name','artist.bio'],producerFields=[publicNameSQL(),'m.code'],playlistFields=['p.name','p.description',publicNameSQL()];
 let artistRank=searchRank(q,artistFields,'',false),producerRank=searchRank(q,producerFields,'',false),playlistRank=searchRank(q,playlistFields,'',false);
 const artistBase=`${namedArtistSQL('artist.name')} AND EXISTS(SELECT 1 FROM tracks t WHERE t.artist_id=artist.id AND ${VISIBLE()} AND t.kind='original'${blocked.length?' AND t.user_id NOT IN ('+blocked.map(()=>'?').join(',')+')':''})`;
 const producerFrom='FROM users u JOIN public_profile_ids m ON m.user_id=u.id LEFT JOIN producers p ON p.user_id=u.id';
 const producerBase=`u.provider!='deleted'${blocked.length?' AND u.id NOT IN ('+blocked.map(()=>'?').join(',')+')':''}`;
 const playlistBase=`p.is_public=1 AND ${activePlaylistSQL()}${blocked.length?' AND p.user_id NOT IN ('+blocked.map(()=>'?').join(',')+')':''}`;
 const [artistLimit,producerLimit,playlistLimit]=q&&!classified&&!song?.exact?await Promise.all([
  one(env,`SELECT count(*) n FROM artists artist WHERE ${artistBase} AND ${artistRank.sql}<6`,...blocked,artistRank.plan),
  one(env,`SELECT count(*) n ${producerFrom} WHERE ${producerBase} AND ${producerRank.sql}<6`,...blocked,producerRank.plan),
  one(env,`SELECT count(*) n FROM playlists p JOIN users u ON u.id=p.user_id WHERE ${playlistBase} AND ${playlistRank.sql}<6`,...blocked,playlistRank.plan)
 ]):[{n:1},{n:1},{n:1}];
 if(!artistLimit.n)artistRank=searchRank(q,artistFields);
 if(!producerLimit.n)producerRank=searchRank(q,producerFields);
 if(!playlistLimit.n)playlistRank=searchRank(q,playlistFields);
 const artistWhere=classified?`${namedArtistSQL('artist.name')} AND artist.id IN (SELECT t.artist_id ${from} WHERE ${where})`:`${artistBase} AND ${artistRank.sql}<${artistLimit.n===0?7:6}`;
 const artistArgs=classified?args:[...blocked,artistRank.plan];
 const producerWhere=`${producerBase} AND `+(classified?`p.id IN (SELECT t.producer_id ${from} WHERE ${where})`:`${producerRank.sql}<${producerLimit.n===0?7:6}`);
 const producerArgs=classified?[...blocked,...args]:[...blocked,producerRank.plan];
 const playlistWhere=`${playlistBase} AND `+(classified?`EXISTS(SELECT 1 FROM playlist_tracks pt WHERE pt.playlist_id=p.id AND pt.track_id IN (${matched}))`:`${playlistRank.sql}<${playlistLimit.n===0?7:6}`);
 const playlistArgs=classified?[...blocked,...args]:[...blocked,playlistRank.plan];
 const trackSort=song?song.sort+',':'',trackArgs=song?[...args,...song.sortArgs]:args;
 const identitySort=(r)=>q&&!classified?r.sql+',':'';
 const identityArgs=(a,r)=>q&&!classified?[...a,r.plan]:a;
 const [tracks,recommended,artists,producers,playlists,counts]=await Promise.all([
  trackList({...env,AIFECT_BLOCKED:[]},where,trackArgs,trackSort+'t.created DESC,t.id',`100 OFFSET ${offset}`),
  trackList({...env,AIFECT_BLOCKED:[]},where,trackArgs,trackSort+'(plays+likes*3) DESC,t.created DESC,t.id',6),
  rows(env,`SELECT artist.*,(SELECT count(*) FROM follows f WHERE f.kind='artist' AND f.target_id=artist.id) followers FROM artists artist WHERE ${artistWhere} ORDER BY ${identitySort(artistRank)}artist.name LIMIT 100`,...identityArgs(artistArgs,artistRank)),
  rows(env,`SELECT p.id,u.id user_id,m.code public_id,${publicNameSQL()} name,COALESCE(p.bio,'') bio,COALESCE(p.image_version,'') image_version,(SELECT count(*) FROM follows f WHERE f.kind='producer' AND f.target_id=p.id) followers ${producerFrom} WHERE ${producerWhere} ORDER BY ${identitySort(producerRank)}name,u.id LIMIT 100`,...identityArgs(producerArgs,producerRank)),
  playlistSummaries(env,user?.id||'',playlistWhere,playlistArgs,identitySort(playlistRank)+'p.created DESC,p.id',100,identityArgs([],playlistRank)),
  Promise.all([
   one(env,`SELECT count(*) n ${from} WHERE ${where}`,...args),
   one(env,`SELECT count(*) n FROM artists artist WHERE ${artistWhere}`,...artistArgs),
   one(env,`SELECT count(*) n ${producerFrom} WHERE ${producerWhere}`,...producerArgs),
   one(env,`SELECT count(*) n FROM playlists p JOIN users u ON u.id=p.user_id WHERE ${playlistWhere}`,...playlistArgs)
  ])
 ]);
 const totals=Object.fromEntries(['tracks','artists','producers','playlists'].map((key,i)=>[key,counts[i].n]));
 return json({tracks,artists,producers,playlists,recommended,counts:totals,offset,...(song?.correction?{search_correction:song.correction}:{}),has_more:offset+tracks.length<totals.tracks});
}
