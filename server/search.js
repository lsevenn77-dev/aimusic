import {validGenre,MOODS,genreFilterSQL} from '../shared/genres.js';
import {VISIBLE,trackList} from './catalog.js';
import {playlistSummaries} from './discovery.js';
import {namedArtistSQL} from './artist-identity.js';
import {publicNameSQL,producerNameSQL} from './identity.js';
import {activePlaylistSQL} from './membership.js';
import {one,rows,fail,json} from './db.js';

// Display labels never become text predicates for taxonomy searches.
export async function unifiedSearch(env,user,params){
 const q=(params.get('q')||'').trim().slice(0,100),genre=params.get('genre')||'',mood=params.get('mood')||'';
 if(genre&&!validGenre(genre))fail(400,'장르를 다시 선택해주세요.');
 if(mood&&!MOODS.some(m=>m.id===mood))fail(400,'분위기를 다시 선택해주세요.');
 if(!q&&!genre&&!mood)return json({tracks:[],artists:[],producers:[],playlists:[],recommended:[],counts:{tracks:0,artists:0,producers:0,playlists:0},has_more:false});
 const offset=Math.max(0,Math.min(100000,Math.trunc(Number(params.get('offset')))||0));
 const pattern='%'+q+'%',classified=!!(genre||mood),args=[];
 let where=VISIBLE()+" AND t.kind='original'";
 if(q){where+=` AND (t.title LIKE ? OR a.name LIKE ? OR (${producerNameSQL()}) LIKE ? OR (t.genre||t.genres_json) LIKE ? OR t.tags LIKE ?)`;args.push(...Array(5).fill(pattern));}
 if(genre){where+=' AND '+genreFilterSQL();args.push(genre,genre);}
 if(mood){where+=' AND EXISTS(SELECT 1 FROM json_each(t.moods_json) jm WHERE jm.value=?)';args.push(mood);}
 const blocked=env.AIFECT_BLOCKED||[];
 if(blocked.length){where+=' AND t.user_id NOT IN ('+blocked.map(()=>'?').join(',')+')';args.push(...blocked);}
 const from='FROM tracks t JOIN artists a ON a.id=t.artist_id JOIN producers p ON p.id=t.producer_id';
 const matched=`SELECT t.id ${from} WHERE ${where}`;
 const artistWhere=`${namedArtistSQL('artist.name')} AND `+(classified?`artist.id IN (SELECT t.artist_id ${from} WHERE ${where})`:`(artist.name LIKE ? OR artist.bio LIKE ?) AND EXISTS(SELECT 1 FROM tracks t WHERE t.artist_id=artist.id AND ${VISIBLE()} AND t.kind='original')`);
 const artistArgs=classified?args:[pattern,pattern];
 const producerWhere=`u.provider!='deleted' AND `+(classified?`p.id IN (SELECT t.producer_id ${from} WHERE ${where})`:`((${publicNameSQL()}) LIKE ? ESCAPE '\\' OR m.code=?)`);
 const producerArgs=classified?args:['%'+q.replace(/[\\%_]/g,'\\$&')+'%',q.toUpperCase()];
 const producerFrom='FROM users u JOIN public_profile_ids m ON m.user_id=u.id LEFT JOIN producers p ON p.user_id=u.id';
 const playlistWhere=`p.is_public=1 AND ${activePlaylistSQL()} AND `+(classified?`EXISTS(SELECT 1 FROM playlist_tracks pt WHERE pt.playlist_id=p.id AND pt.track_id IN (${matched}))`:`(p.name LIKE ? OR p.description LIKE ? OR ${publicNameSQL()} LIKE ?)`);
 const playlistArgs=classified?args:[pattern,pattern,pattern];
 const [tracks,recommended,artists,producers,playlists,counts]=await Promise.all([
  trackList(env,where,args,'t.created DESC,t.id',`100 OFFSET ${offset}`),
  trackList(env,where,args,'(plays+likes*3) DESC,t.created DESC,t.id',6),
  rows(env,`SELECT artist.*,(SELECT count(*) FROM follows f WHERE f.kind='artist' AND f.target_id=artist.id) followers FROM artists artist WHERE ${artistWhere} ORDER BY artist.name LIMIT 100`,...artistArgs),
  rows(env,`SELECT p.id,u.id user_id,m.code public_id,${publicNameSQL()} name,COALESCE(p.bio,'') bio,COALESCE(p.image_version,'') image_version,(SELECT count(*) FROM follows f WHERE f.kind='producer' AND f.target_id=p.id) followers ${producerFrom} WHERE ${producerWhere} ORDER BY name,u.id LIMIT 100`,...producerArgs),
  playlistSummaries(env,user?.id||'',playlistWhere,playlistArgs),
  Promise.all([
   one(env,`SELECT count(*) n ${from} WHERE ${where}`,...args),
   one(env,`SELECT count(*) n FROM artists artist WHERE ${artistWhere}`,...artistArgs),
   one(env,`SELECT count(*) n ${producerFrom} WHERE ${producerWhere}`,...producerArgs),
   one(env,`SELECT count(*) n FROM playlists p JOIN users u ON u.id=p.user_id WHERE ${playlistWhere}`,...playlistArgs)
  ])
 ]);
 const totals=Object.fromEntries(['tracks','artists','producers','playlists'].map((key,i)=>[key,counts[i].n]));
 return json({tracks,artists,producers,playlists,recommended,counts:totals,offset,has_more:offset+tracks.length<totals.tracks});
}
