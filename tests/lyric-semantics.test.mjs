import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeLyrics,lyricSearchIntent,LYRIC_TAGS,lyricPlainText} from '../shared/lyric-semantics.js';
const ids=text=>analyzeLyrics(text).tags.map(t=>t.id);
const has=(text,...expected)=>{const tags=ids(text);for(const id of expected)assert.ok(tags.includes(id),JSON.stringify({text,id,tags}));};
test('context, mixed feelings, repetition, Korean and English',()=>{
 has('사랑했지만 헤어졌어','love','breakup','longing');
 has('널 잊지 못해\n너에게 미안해\n후회해','lingering','longing','regret');
 has('너를 사랑해\n두근두근 설렌다\n너와 행복해','love','flutter','happy','bright','in_love');
 has('헤어진 너를 보고 싶어\n눈물이 흘러 슬퍼','breakup','longing','sad');
 has('괜찮아 울어도 돼\n다시 시작할 거야','comfort','empathy','hope','retry');
 has('지친 너의 하루\n괜찮아\n내가 안아줄게','comfort');
 has('I miss you\n널 잊지 못해','longing','lingering');
 assert.ok(analyzeLyrics('너를 보고 싶어\n너를 보고 싶어').tags.find(t=>t.id==='longing').confidence>analyzeLyrics('너를 보고 싶어').tags.find(t=>t.id==='longing').confidence);
});
test('no unsupported labels from isolated words, negatives, irony or metadata',()=>{
 for(const text of ['', '[00:01.00] ', '사랑', '사랑 사랑 사랑', '사랑이라는 단어를 적었어', '사랑하지 않아', 'I do not love you'])assert.equal(ids(text).includes('love'),false,text);
 assert.equal(ids('행복하지 않아').includes('happy'),false);
 assert.equal(ids('참 행복해 눈물뿐인 지옥인데').includes('happy'),false);
 assert.equal(ids('새벽 네 시').includes('dawn'),false);
 assert.equal(ids('비가 오는 계절').includes('rain'),false);
 assert.equal(ids('너를 보고 싶어').includes('bedtime'),false);
 assert.ok(analyzeLyrics('사랑해').tags.every(t=>t.confidence>=.7));
 assert.ok(analyzeLyrics('사랑해').tags.filter(t=>t.role==='primary').length<=3);
 assert.ok(LYRIC_TAGS.every(t=>!['genre','tempo','sound_mood'].includes(t.category)));
});
test('situations need explicit supporting lyric context',()=>{
 has('새벽에 혼자 남아\n네가 보고 싶어','dawn','lonely');
 has('비가 오는 창가에\n너를 보고 싶어','rain');
 has('잘 자 포근한 꿈을 꿔','bedtime');
 has('울고 싶어 슬퍼','cry');
 assert.equal(lyricPlainText('[ar:someone]\n[00:01.00] 사랑해'),'사랑해');
});
test('natural-language, spacing, colloquial and compound search intent',()=>{
 const cases=[['헤어진 여자친구 생각날 때 듣는 노래',['breakup','longing']],['헤어진사람생각날때',['breakup','longing']],['이별 후 듣는 노래',['breakup']],['사랑하는 사람에게 들려주고 싶은 노래',['love','confession']],['요즘 너무 힘들어서 위로받고 싶어',['comfort']],['새벽에 혼자 듣기 좋은 노래',['dawn','lonely']],['짝사랑하는 사람 마음을 표현한 노래',['crush']],['오래된 추억이 생각나는 노래',['memory','longing']],['기분이 우울할 때 듣는 노래',['sad']],['다시 시작하고 싶을 때 듣는 노래',['retry','hope']],['행복하고 설레는 노래',['happy','flutter']],['슬픈 이별 노래',['sad','breakup']],['설레는 사랑 노래',['flutter','love']]];
 for(const [q,expected] of cases){const found=lyricSearchIntent(q).tags.map(t=>t.id);for(const id of expected)assert.ok(found.includes(id),JSON.stringify({q,id,found}));}
 assert.deepEqual(lyricSearchIntent('%').tags,[]);
 assert.equal(new Set(LYRIC_TAGS.map(t=>t.id)).size,LYRIC_TAGS.length);
});
test('relationship endings and resilience use contextual evidence without requiring category names',()=>{
 has('우리 사이가 차가워져\n멀어지고 있었어\n내 마음은 아픈데','breakup','sad');
 has('끝났다고 말했어\n우리 채팅방을 못 지웠어','breakup','lingering');
 has('아무도 없는 방\n숨겨 둔 마음이 보여','lonely');
 has('긴 밤을 지나\n언젠가는 아침이 올 거야\n나를 놓지 않을게','hope','esteem','courage');
 has('조금 늦어도 괜찮다고\n네게 말해 주고 싶어','comfort');
 assert.ok(!ids('도시가 멀어지고\n열차는 끝나고 있어').includes('breakup'));
});
test('wished-for or observed happiness and pretending to be okay are not positive feelings',()=>{
 const song='난 안 괜찮아\n네가 행복하길 바랐어\n행복해 보이는 네 모습\n왜 마음이 아픈 걸까\n우리는 괜찮은 척했어';
 has(song,'sad');for(const id of ['happy','joy','comfort','bright','good_day'])assert.ok(!ids(song).includes(id),id);
 const other='네가 행복해\n난 마음이 아픈데';assert.ok(!ids(other).includes('happy'));
 has('너와 함께 행복해\n기쁨이 가득해','happy','joy');
 assert.ok(!ids('엄마를 사랑해').includes('thanks'),'Family affection is not automatically gratitude');
});
