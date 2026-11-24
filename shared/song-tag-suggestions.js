// These labels describe words/themes in the title and lyrics, never audible genres.
// This normalizer is only for suggestions; uploader-authored tags remain free text.
export const SONG_TAG_LIMIT=8;
export const SONG_TAG_TITLE_LIMIT=120;
export const SONG_TAG_LYRICS_LIMIT=20000;
export const SONG_TAG_ANALYSIS_LIMIT=8000;

const rules=[
 ['첫사랑',/첫\s*사랑|\bfirst love\b/i],
 ['짝사랑',/짝\s*사랑|혼자만의\s*사랑|\bunrequited\b/i],
 ['고백',/고백|마음을\s*전하|\bconfess(?:ion)?\b/i],
 ['사랑',/사랑|\blove(?:d|s|r)?\b/i],
 ['설렘',/설레|설렘|두근|\bbutterflies\b/i],
 ['이별',/이별|헤어(?:지|진|져)|\b(?:breakup|break up|heartbreak)\b/i],
 ['그리움',/그리(?:워|움|운)|보고\s*싶|\b(?:miss you|missing you|longing)\b/i],
 ['재회',/재회|다시\s*만나|돌아와\s*줘|\b(?:reunion|meet again)\b/i],
 ['기다림',/기다(?:리|림|려)|\bwait(?:ing)?\b/i],
 ['추억',/추억|기억\s*속|그때|지난\s*날|\b(?:memories|memory|remember)\b/i],
 ['후회',/후회|미안|돌이킬\s*수|\bregret(?:s|ting)?\b/i],
 ['외로움',/외로|외롭|쓸쓸|홀로|\b(?:lonely|loneliness|alone)\b/i,/외롭지\s*않[\p{L}]*|외로움(?:이|은|도)?\s*없[\p{L}]*|\b(?:not|never)\s+(?:lonely|alone)\b/giu],
 ['슬픔',/슬프|슬픔|서러|서럽|\b(?:sad|sadness|sorrow)\b/i,/슬프지\s*않[\p{L}]*|슬픔(?:이|은|도)?\s*없[\p{L}]*|\b(?:not|never)\s+sad\b/giu],
 ['눈물',/눈물|울먹|\b(?:tears|crying)\b/i],
 ['위로',/위로|괜찮아|안아\s*줄|\b(?:comfort|console|it is okay|it's okay)\b/i],
 ['희망',/희망|포기하지|다시\s*일어나|\b(?:hope|hopeful)\b/i],
 ['용기',/용기|두려워하지|\b(?:courage|brave|bravery)\b/i],
 ['다짐',/다짐|약속|맹세|\b(?:promise|vow)\b/i],
 ['성장',/성장|어른이|자라(?:나|서)|\bgrow(?:ing)? up\b/i],
 ['자유',/자유|날아(?:가|올라)|\b(?:freedom|break free)\b/i],
 ['행복',/행복|기쁨|기뻐|\b(?:happy|happiness|joy)\b/i,/행복하지\s*않[\p{L}]*|\b(?:not|never)\s+happy\b/giu],
 ['평온함',/평온|고요|평화|\b(?:peaceful|peace|serenity)\b/i],
 ['따뜻함',/따뜻|포근|온기|\b(?:warmth|cozy)\b/i],
 ['분노',/분노|화가\s*나|미워|\b(?:anger|angry|rage)\b/i],
 ['불안',/불안|두려(?:움|워)|두렵|\b(?:anxious|fear|afraid)\b/i,/불안하지\s*않[\p{L}]*|두렵지\s*않[\p{L}]*|\b(?:not|never)\s+(?:anxious|afraid)\b/giu],
 ['허무함',/허무|공허|텅\s*빈|\b(?:emptiness|hollow)\b/i],
 ['자기성찰',/나를\s*돌아|내가\s*누군지|나는\s*누구|진짜\s*나|\b(?:who am i|self.reflection)\b/i],
 ['새로운 시작',/새로운?\s*시작|다시\s*시작|\b(?:new beginning|start again|fresh start)\b/i],
 ['우정',/우정|친구|\b(?:friend|friends|friendship)\b/i],
 ['가족',/가족|엄마|아빠|어머니|아버지|\b(?:family|mother|father|parents)\b/i],
 ['꿈',/꿈|\bdream(?:s|ing)?\b/i],
 ['도전',/도전|넘어서|한계(?:를|를\s*넘어)|\b(?:challenge|keep trying)\b/i],
 ['여행',/여행|낯선\s*길|길을\s*떠나|\b(?:journey|travel|trip)\b/i],
 ['작별',/작별|안녕히|잘\s*가|\b(?:goodbye|farewell)\b/i],
 ['상실',/상실|잃어버린|잃은|\b(?:loss|lost you)\b/i],
 ['아련함',/아련|아득한|\b(?:nostalgia|nostalgic|wistful)\b/i],
 ['새벽',/새벽|동틀|동이\s*트|\b(?:dawn|daybreak)\b/i],
 ['밤',/밤|\b(?:night|midnight)\b/i],
 ['달빛',/달빛|(?:^|[^\p{L}])달(?:$|[^\p{L}]|이|을|에)|\b(?:moon|moonlight)\b/iu],
 ['별빛',/별빛|(?:^|[^\p{L}])별(?:$|[^\p{L}]|이|을|들|처럼)|\b(?:stars|starlight)\b/iu],
 ['비',/(?:^|[^\p{L}])비(?:$|[^\p{L}]|가|는|를|에|와)|가랑비|빗(?:소리|방울|속|물)|장마|우산|소나기|\brain(?:y|ing)?\b/iu],
 ['눈',/눈이\s*내|흰\s*눈|하얀\s*눈|눈꽃|눈송이|눈\s*덮|\bsnow(?:y|ing)?\b/i],
 ['바다',/바다|파도|수평선|\b(?:sea|ocean|waves)\b/i],
 ['도시',/도시|네온|빌딩|\bcity\b/i],
 ['노을',/노을|해\s*질\s*녘|석양|\b(?:sunset|dusk)\b/i],
 ['봄',/(?:^|[\s,.!?])봄(?:$|[\s,.!?]|날|바람|비|밤|이|은|을|에)|벚꽃|\bspring\b/i],
 ['여름',/여름|한여름|\bsummer\b/i],
 ['가을',/가을|낙엽|\bautumn\b/i],
 ['겨울',/겨울|한겨울|\bwinter\b/i],
 ['꽃',/(?:^|[^\p{L}])꽃(?:$|[^\p{L}]|이|을|에|처럼)|봄꽃|들꽃|꽃잎|꽃향기|장미|벚꽃|\b(?:flower|flowers|rose|roses)\b/iu],
 ['숲',/숲|\bforest\b/i],
 ['바람',/바람이|바람을|바람에|바람처럼|산들바람|\b(?:wind|breeze)\b/i]
];

export const SONG_TAG_KEYWORDS=Object.freeze(rules.map(([tag])=>tag));
const canonical=new Map(SONG_TAG_KEYWORDS.map(tag=>[tag.replace(/\s+/g,''),tag]));

export function normalizeTags(values){
 if(!Array.isArray(values))return [];
 const tags=[];
 for(const value of values.slice(0,64)){
  if(typeof value!=='string'||value.length>40)continue;
  const key=value.normalize('NFKC').trim().replace(/^#+\s*/,'').replace(/\s+/g,'');
  const tag=canonical.get(key);
  if(tag&&!tags.includes(tag))tags.push(tag);
  if(tags.length===SONG_TAG_LIMIT)break;
 }
 return tags;
}

export function songTagInput({title='',lyrics=''}={}){
 const clean=(value,max)=>typeof value==='string'?value.normalize('NFKC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,max):'';
 return {title:clean(title,SONG_TAG_TITLE_LIMIT),lyrics:clean(lyrics,SONG_TAG_ANALYSIS_LIMIT)};
}

export function textTagSuggestions(input={}){
 const {title,lyrics}=songTagInput(input);
 if(!title&&!lyrics)return [];
 // Match only explicit text evidence. No default tags are added for sparse input.
 return rules.map(([tag,pattern,negated],order)=>{
  const t=negated?title.replace(negated,''):title;
  const l=negated?lyrics.replace(negated,''):lyrics;
  return {tag,score:(pattern.test(t)?3:0)+(pattern.test(l)?1:0),order};
 }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.order-b.order).slice(0,SONG_TAG_LIMIT).map(item=>item.tag);
}
