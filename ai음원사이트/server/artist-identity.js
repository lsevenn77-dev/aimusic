import {one,run,id,now,str,fail} from './db.js';

// Keep legacy non-null artist foreign keys while treating placeholder profiles
// as an explicit choice to publish under the creator's public nickname.
export const namedArtistSQL=(name='a.name')=>`trim(${name}) NOT IN ('','없음','미등록','-','선택 안함','선택안함')`;
export const hasArtistName=name=>!!name&&!['','없음','미등록','-','선택 안함','선택안함'].includes(name.trim());
export async function chooseArtist(env,producerId,b,genre){
 const selected=b.artist_id&&b.artist_id!=='none';
 if(selected){
  const artist=await one(env,'SELECT id,name FROM artists WHERE producer_id=? AND id=?',producerId,str(b.artist_id,80));
  if(!artist)fail(404,'내 AI 아티스트를 선택해주세요.');
  return {...artist,selected:hasArtistName(artist.name)};
 }
 const name=b.artist_id==='none'?'없음':str(b.artist||'',60,false)||'없음';
 let artist=await one(env,'SELECT id,name FROM artists WHERE producer_id=? AND name=?',producerId,name);
 if(!artist){artist={id:id(),name};await run(env,'INSERT INTO artists(id,producer_id,name,bio,genre,created) VALUES(?,?,?,?,?,?)',artist.id,producerId,name,str(b.artist_bio||'',1000,false),genre,now());}
 return {...artist,selected:hasArtistName(name)};
}
