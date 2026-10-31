// Explicit, in-memory browser fixture only; not part of a deployed Worker.
export function seedFollowPreview(sql){
 const names=['가을','겨울노래','고운밤','나래','다온','미리내','별빛','소리','여울','유리','하늘','Echo2','echo10','20','3','♪모음'];
 for(let i=0;i<125;i++){
  const id='qa-fan-'+i,name=names[i]||'하늘'+(i-15);
  sql.prepare('INSERT INTO users(id,email,name,created) VALUES(?,?,?,0)').run(id,id+'@example.test',name);
  sql.prepare('INSERT INTO producers(id,user_id,name,created) VALUES(?,?,?,0)').run('qa-p-'+i,id,name);
  sql.prepare("INSERT INTO follows VALUES(?,'producer','producer',?)").run(id,2000000000-(i+1)*800);
  if(i%3===0)sql.prepare("INSERT INTO follows VALUES(?,'artist','artist',?)").run(id,i);
  if(i%6===0)sql.prepare("INSERT INTO follows VALUES(?,'artist','artist2',?)").run(id,i);
 }
}
