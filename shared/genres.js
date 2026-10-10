export const GENRES=['K-POP','Pop','Dark Pop','Ballad','R&B','Soul','Hip-Hop','Rock','Alternative','Indie Pop','EDM','Electronic','Synth Pop','City Pop','Lo-fi','Jazz','Blues','Folk','Acoustic','Country','Classical','Ambient','Fusion','Korean Folklore Fusion','World Music','국악','트로트','J-POP','OST','Instrumental','Dance','Funk','Disco','Metal','Punk','Reggae','Latin','Reggaeton','Afrobeats','House','Techno','Trance','Drum & Bass','Trap','Gospel','New Age','Chillout','Cinematic','Orchestral','Children'];
export const validGenre=value=>typeof value==='string'&&value.trim().length>0&&value===value.trim()&&value.length<=80&&!/[\x00-\x1f\x7f]/.test(value);
export const MOODS=[
 {id:'comfort',name:'위로 · 감성',caption:'마음을 다독이는 음악',symbol:'heart'},
 {id:'energy',name:'기분 업',caption:'오늘의 에너지를 채워요',symbol:'sparkles'},
 {id:'focus',name:'집중',caption:'작업과 공부에 몰입할 때',symbol:'volume'},
 {id:'drive',name:'드라이브',caption:'길 위에서 만나는 사운드',symbol:'compass'},
 {id:'sleep',name:'잠들기 전',caption:'하루를 천천히 마무리해요',symbol:'clock'},
 {id:'workout',name:'운동',caption:'리듬에 맞춰 한 걸음 더',symbol:'chart'},
 {id:'romance',name:'설렘 · 사랑',caption:'마음이 가까워지는 순간',symbol:'heart'},
 {id:'nostalgia',name:'추억',caption:'다시 떠오르는 그때의 마음',symbol:'clock'},
 {id:'rain',name:'비 오는 날',caption:'차분하게 스며드는 음악',symbol:'heart'},
 {id:'night',name:'밤 · 새벽',caption:'깊어진 밤에 어울리는 음악',symbol:'clock'},
 {id:'party',name:'파티',caption:'함께 즐기는 신나는 리듬',symbol:'users'},
 {id:'meditation',name:'휴식 · 명상',caption:'잠시 숨을 고르는 시간',symbol:'compass'}
];
export const CLASSIFICATION_VERSION='music-v1';
export function parseList(value){if(Array.isArray(value))return value;try{const a=JSON.parse(value||'[]');return Array.isArray(a)?a:[];}catch{return [];}}
export function trackClassification(track){const gs=parseList(track.genres_json),ms=parseList(track.moods_json);return {...track,genres:gs.length?gs:track.genre?[track.genre]:[],moods:ms};}
export const genreFilterSQL=(alias='t')=>`(${alias}.genre=? OR EXISTS(SELECT 1 FROM json_each(${alias}.genres_json) jg WHERE jg.value=?))`;
export function normalizeClassification(value){
 const genres=[...new Set(parseList(value?.genres))],moods=[...new Set(parseList(value?.moods))];
 if(!genres.length||genres.length>3||genres.some(g=>!GENRES.includes(g))||moods.length>4||moods.some(m=>!MOODS.some(x=>x.id===m)))throw new Error('Invalid music classification');
 return {genres,moods,reason:String(value.reason||'').slice(0,600),suggested_genre:String(value.suggested_genre||'').slice(0,80)};
}
