// Deliberately local and deterministic. Confidence is rule support, not a probability.
export const LYRIC_ANALYSIS_VERSION='ko-lyrics-2';
export const normalizeLyricTerm=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}\u200b-\u200d]/gu,'');
const tag=(id,category,label,aliases,query)=>({id,category,label,aliases:[label,...aliases.split('|').filter(Boolean)],query});
export const LYRIC_TAGS=[
 tag('love','theme','사랑','사랑노래|연애노래|연애감성|연인|사랑하는사람|사랑에빠졌을때|로맨틱|사랑할때',/사랑|연애|연인|로맨틱|love/),
 tag('breakup','theme','이별','이별노래|헤어진노래|헤어질때|실연|이별감성|헤어진사람|전남친생각|전여친생각|이별후듣는노래',/이별|헤어[진졌질지]|실연|전남친|전여친|헤어진(?:여자|남자)친구|breakup/),
 tag('crush','theme','짝사랑','짝사랑노래|혼자하는사랑|말못하는사랑|짝사랑하는사람마음',/짝사랑|혼자(?:하는|만의)사랑|말못하는사랑/),
 tag('confession','theme','고백','고백노래|고백하기전|마음을전하고싶어|사랑하는사람에게들려주고싶은노래',/고백|마음을전|사랑하는사람에게들려/),
 tag('reunion','theme','재회','다시만나고싶어|다시만난사랑|돌아온연인',/재회|다시만나|돌아온연인/),
 tag('lingering','theme','미련','잊지못하는사랑|잊지못해|못잊어|아직도너를',/미련|잊지못|못잊|아직도너/),
 tag('regret','theme','후회','후회하는사랑|미안한마음|돌이키고싶어',/후회|미안한마음|돌이키/),
 tag('friendship','theme','우정','친구노래|친구에게|함께한친구',/우정|친구(?:노래|에게|와|들)/),
 tag('family','theme','가족','엄마|아빠|어머니|아버지|가족사랑',/가족|엄마|아빠|어머니|아버지/),
 tag('encouragement','theme','응원','힘이되는노래|힘내|할수있어|용기를주는노래',/응원|힘내|힘이되는|할수있|용기를주/),
 tag('growth','theme','성장','어른이되는|성장통|나아가는노래',/성장|어른이되|성장통/),
 tag('dream','theme','꿈','꿈을향해|꿈꾸는노래|목표를향해',/꿈|목표/),
 tag('retry','theme','재도전','다시시작|새로운시작|다시일어나|다시시작하고싶을때',/재도전|다시시작|새로운시작|다시일어/),
 tag('memory','theme','추억','추억노래|옛사랑|그때그시절|오래된추억이생각나는노래',/추억|옛사랑|그때그시절|지난날|어린시절/),
 tag('daily','theme','일상','하루의이야기|평범한하루|퇴근길',/일상|평범한하루|퇴근길/),
 tag('life','theme','인생','삶의이야기|살아가는이야기|인생노래',/인생|삶의|살아가/),
 tag('freedom','theme','자유','자유롭게|떠나고싶어|자유로운영혼',/자유|자유롭게|떠나고싶/),
 tag('esteem','theme','자존감','나를사랑해|나다운삶|나답게|자기애',/자존감|나를사랑|나답게|자기애/),
 tag('longing','emotion','그리움','보고싶을때|그리운사람|생각나는사람|헤어진사람생각날때',/그리[움운워]|보고싶|생각나|생각날|생각나는|missyou/),
 tag('happy','emotion','행복','행복한노래|행복하고설레는노래|기분이좋을때',/행복|기분(?:이)?좋|happy/),
 tag('sad','emotion','슬픔','슬픈노래|슬픈이별노래|우울할때|울고싶어|기분이우울할때',/슬[픔픈퍼]|우울|울고싶|sad/),
 tag('flutter','emotion','설렘','설레는노래|두근두근|썸탈때|좋아하는사람|첫사랑',/설[렘레렌]|두근|썸|좋아하는사람|첫사랑/),
 tag('lonely','emotion','외로움','외로운노래|혼자일때|쓸쓸한노래|혼자듣는노래|새벽에혼자듣기좋은노래',/외로|외롭|혼자|쓸쓸|lonely/),
 tag('anger','emotion','분노','화날때|화나는노래|분노한마음',/분노|화날|화나는|화가나/),
 tag('joy','emotion','기쁨','기쁜날|기쁨을나누는|즐거운노래',/기쁨|기쁜|즐거/),
 tag('anxiety','emotion','불안','불안한마음|걱정많을때|두려울때',/불안|걱정|두려/),
 tag('peace','emotion','평온','마음의평화|평온한노래|마음이편안',/평온|평화|마음이편안/),
 tag('empty','emotion','공허함','공허한마음|허전할때|텅빈마음',/공허|허전|텅빈마음/),
 tag('tender','emotion','애틋함','애틋한사랑|애틋한마음|소중한사람',/애틋|소중한사람/),
 tag('courage','emotion','용기','용기내고싶어|용감한마음|두려움을넘어',/용기|용감|두려움을넘/),
 tag('thanks','emotion','감사','고마운사람|고마움을전하는|감사한마음',/감사|고마/),
 tag('comfort','emotion','위로','위로노래|힘들때듣는노래|지쳤을때|마음이힘들때|괜찮아|위로받고싶어|요즘너무힘들어서위로받고싶어',/위로|힘들|지쳤|지칠|괜찮아|위안/),
 tag('empathy','emotion','공감','내마음같은노래|마음을알아주는',/공감|내마음같|마음을알아/),
 tag('hope','emotion','희망','희망적인노래|내일은괜찮을거야|다시시작하고싶어',/희망|내일은괜찮|다시시작|새로운시작/),
 tag('despair','emotion','절망','절망적인마음|희망이없어|끝이없는어둠',/절망|희망이없|끝이없는어둠/),
 ...[['sentimental','감성적','감성적인노래'],['wistful','쓸쓸함','쓸쓸한가사'],['warm','따뜻함','따뜻한가사'],['bright','밝음','밝은가사'],['dark','어두움','어두운가사'],['romantic','낭만적','낭만적인가사'],['poetic','서정적','서정적인가사'],['playful','유쾌함','유쾌한가사'],['serious','진지함','진지한가사']].map(([id,label,alias])=>tag(id,'lyric_mood',label,alias,null)),
 ...[['after_breakup','이별했을 때','이별후'],['in_love','사랑에 빠졌을 때','사랑에빠진'],['alone','혼자 있고 싶을 때','혼자있고싶'],['need_comfort','위로받고 싶을 때','위로받고싶'],['good_day','기분이 좋을 때','기분좋은날'],['cry','울고 싶을 때','울고싶'],['reminisce','추억이 생각날 때','추억이생각'],['bedtime','잠들기 전','잠들기전|자기전|잠들때'],['dawn','새벽 감성','새벽감성|새벽에'],['rain','비 오는 날','비오는날|비가올때']].map(([id,label,aliases])=>tag(id,'situation',label,aliases,null))
];
export const LYRIC_TAG_BY_ID=new Map(LYRIC_TAGS.map(t=>[t.id,t]));
export function lyricPlainText(value){return String(value??'').slice(0,12000).normalize('NFKC').replace(/\[[^\]\n]*\]/g,'').replace(/<\d{1,3}:\d{2}(?:\.\d+)?>/g,'').replace(/\r\n?/g,'\n').trim();}
const rule=(id,tags,re,weight=.84,context=null)=>({id,tags:tags.split(','),re,weight,context});
const RULES=[
 rule('love-address','love',/(?:널|너를|당신을|그대를|너만|그대만)?사랑(?:해|한다|할게|하고|하는|했던|했지만|했어)|iloveyou/),
 rule('falling-in-love','love,in_love',/사랑에빠(?:져|졌|진)|너와연인이|fallinginlove/),
 rule('love-past','love,breakup,longing',/사랑했지만.{0,24}(?:헤어|이별|떠났)|(?:헤어졌|이별했).{0,24}사랑/),
 rule('past-affection','love,memory',/좋아했던사람|사랑했던날|좋았던우리/, .78),
 rule('parting','breakup',/헤어(?:졌|져|지자|진|질)|이별(?:했|하|한|을|이)|끝난우리|끝나버린사랑|we(?:brokeup|aresovertoday)/),
 rule('relationship-distance','breakup',/멀어지고|멀어져|끝나고있|끝났다고|끝날만해서끝|끝난(?:건|것|사람)|끝나는건|식어갔/, .82, /우린|우리|서로|네가|너를|사랑|마음|채팅방/),
 rule('cannot-forget','lingering,longing',/(?:널|너를|그댈|그대를)?잊지못|못잊(?:어|겠)|아직도너를|cantforgetyou|cannotforgetyou/),
 rule('missing','longing',/보고싶(?:어|다|은|었)|그리(?:워|운|웠)|imissyou/),
 rule('remember-person','longing',/네가생각나|네생각이나|네가생각날|너를생각해|네가있던자리/, .8),
 rule('kept-contact','lingering',/채팅방.{0,12}못지|연락기다렸|번호는그대로|버리지못한마음/, .78, /끝났|끝낸|네가|너를|그리|마음|전화|잊은/),
 rule('unrequited','crush, love',/혼자만(?:의|하는)사랑|짝사랑|말못한내마음|너는내마음을몰라|나만너를사랑/),
 rule('confess','confession,love',/고백(?:할|하|해|했)|내마음을(?:전할|받아)|좋아한다고말/),
 rule('reunite','reunion,love',/다시만난우리|다시너를만나|우리다시만나|내게돌아(?:와|온)/),
 rule('regret','regret',/후회(?:해|하|가|돼|했)|돌이킬수없|내가잘못했|너에게미안해/),
 rule('friend','friendship',/친구(?:야|들과함께|와함께)|우리(?:의)?우정|곁을지켜준친구/),
 rule('family','family',/(?:엄마|아빠|어머니|아버지|가족).{0,18}(?:고마|사랑|품|손|기다)|(?:고마|사랑).{0,18}(?:엄마|아빠|어머니|아버지)/),
 rule('cheer','encouragement,courage',/힘(?:을)?내|넌할수있|너는할수있|포기하지마|youcandoit|dontgiveup/),
 rule('growth','growth',/어른이되|조금씩자라|성장(?:해|하)|어제보다나은/),
 rule('own-progress','growth,encouragement',/내걸음으로여기까지|여기까지.{0,8}걸어왔|분명히걸어왔잖아/, .8),
 rule('dream','dream,hope',/꿈을(?:향해|꾸|이루|찾)|나의꿈|목표를향해|chase(?:my|your)dream/),
 rule('keep-dream','dream,hope',/작은꿈|꿈의조각/, .78, /꺼지지않|밝혀|버리지못|기다려|놓지않/),
 rule('restart','retry,hope,courage',/다시시작(?:할|해|하|하고|해볼)|다시일어(?:나|설)|새로운시작|startagain/),
 rule('memory','memory',/추억(?:이|을|은|속)|그때그시절|어린시절|함께했던날|지난날(?:을|이|의)|오래된사진/),
 rule('daily','daily',/퇴근길|출근길|평범한하루|오늘도같은길/),
 rule('life','life',/인생(?:은|의|을)|살아가는이유|삶(?:의|을|이란)|살아온날/),
 rule('freedom','freedom',/자유롭게|자유를찾|날개를펼쳐|누구도날가둘수없/),
 rule('esteem','esteem,courage',/나를사랑(?:해|할)|나답게살|나는소중|있는그대로의나/),
 rule('keep-self','esteem,courage',/나를놓지않|나만의걸음|내걸음으로/, .82),
 rule('happy','happy,joy',/행복(?:해|하|한|했)|기분이좋|너와웃(?:어|는)|imhappy/),
 rule('joy','joy',/기쁨(?:이|을|에)|기뻐|즐거(?:워|운)|웃음이피어/),
 rule('flutter','flutter',/두근(?:두근|거려|대)|설레(?:어|는|고)|설렌다|너만보면떨려/),
 rule('sad','sad',/슬(?:퍼|프다|픈|픔이)|눈물(?:이|을|만|나)|울고싶|우울(?:해|한)|imsad/),
 rule('hurt-feelings','sad',/마음.{0,8}아프|마음.{0,8}아픈|서로더아프|안괜찮(?:아|았)|눈물까지/, .8),
 rule('lonely','lonely',/외로(?:워|운|움)|외롭(?:다|고)|쓸쓸(?:해|한)|혼자남(?:아|은)|imalone|imlonely/),
 rule('empty-room','lonely',/아무도없는방|혼자먹는저녁/, .78, /네가없|숨겨둔|내가보여|그리|혼자|익숙/),
 rule('anger','anger',/분노(?:가|에|로)|화가나|너를원망|용서못해/),
 rule('anxiety','anxiety',/불안(?:해|한|하)|두려(?:워|운)|걱정(?:이|에|돼)|잠못이루/, .82),
 rule('afraid-feeling','anxiety',/무서웠어|무서운마음|마음이흔들/, .76),
 rule('peace','peace',/마음이편안|평온(?:한|해)|평화로운|고요한마음/),
 rule('empty','empty',/공허(?:해|한|함)|허전(?:해|한)|텅빈(?:내)?마음|아무것도남지않/),
 rule('tender','tender',/애틋(?:한|해)|소중한너|소중한그대|꼭안아줄/),
 rule('courage','courage',/용기를내|두려움을넘|겁내지않/),
 rule('thanks','thanks',/고마(?:워|운|웠)|감사(?:해|한|하)|thankyou/),
 rule('comfort','comfort,empathy',/괜찮아.{0,20}(?:울어도돼|쉬어도돼|네곁|내가)|울어도돼|내가안아줄|네잘못이아니야|youarenotalone|itsokaytocry/),
 rule('comfort-context','comfort,empathy',/괜찮아|쉬어도돼/, .8,/(?:힘들|지친|아파|눈물|울어|곁에|안아)/),
 rule('gentle-permission','comfort,empathy',/늦어도괜찮|쉬어가도돼|잠시쉬어도|잘하고있어|수고했어|애썼어|버텨줘서고마/, .8),
 rule('hope','hope',/희망(?:을|이|의)|내일은(?:괜찮|나아|빛)|빛나는내일|끝나지않은꿈/),
 rule('resilient-light','hope',/내안에불빛이남|언젠가는아침이올|다시빛을켜|나만의아침을맞/, .82, /어둠|밤|마음|놓지않|꺼지지않|비추|걸음|건너/),
 rule('despair','despair',/희망(?:이|은)?없|절망(?:속|에|이)|끝이없는어둠|살아갈이유가없/),
 rule('rain-context','rain',/비(?:가)?오는|빗소리|빗방울/, .82,/(?:그리|눈물|마음|창가|기억|혼자|너를)/),
 rule('dawn-context','dawn',/새벽|밤을새/, .82,/(?:그리|혼자|생각|눈물|마음|기억|별빛)/),
 rule('bedtime-context','bedtime',/잘자|잠들(?:어|기전)|눈을감아/, .82,/(?:편안|포근|꿈|쉬어|자장|안아)/)
];
// Negative statements and explicit irony suppress claims within the same clause.
const DENIALS={love:/(?:사랑.{0,5}(?:않|아니|못해)|안사랑|사랑은없|dontloveyou|donotloveyou)/,happy:/행복.{0,8}(?:않|아니)|행복한척|행복하겠니|행복하길|행복했으면|행복해보|happy.{0,5}not/,joy:/기쁘.{0,5}않|즐겁.{0,5}않|행복하길|행복했으면|행복해보/,hope:/희망.{0,5}없/,peace:/평온.{0,5}않|편안.{0,5}않/,longing:/보고싶지않|그립지않/,sad:/슬프지않|눈물(?:이|은)?아니|울지않/,lonely:/외롭지않|외로움.{0,5}아니/,thanks:/고맙지않/,comfort:/괜찮지않|안괜찮|괜찮은척|괜찮아보|괜찮은줄|괜찮아진건아니/};
const IRONY=/참(?:으로)?(?:행복|좋|즐거).{0,30}(?:눈물|거짓|지옥|척)|(?:행복|좋|즐거).{0,15}(?:반어|거짓말)/;
const STOP=new Set('나는 나를 내가 너는 너를 네가 우리 그대 당신 오늘 정말 너무 그냥 이제 아직 다시 모든 있는 없는 것처럼 그리고 하지만 사랑 노래 음악 마음 lyrics chorus verse intro outro the and you your are was were with that this for not dont cant'.split(' '));
const keywordStem=word=>word.replace(/(?:에서는|에게는|으로는|이라고|이라고는|처럼|에서|에게|으로|까지|부터|하고|했던|하는|하게|하며|들을|들이|은|는|이|가|을|를|에|의|도|와|과)$/u,'');
export function lyricKeywords(value){
 const words=lyricPlainText(value).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[],freq=new Map();
 for(const word of words){
  if(/^\d+$/.test(word))continue;
  const stem=keywordStem(word);
  for(const term of new Set([word,stem]))if(term.length>=2&&term.length<=24&&!STOP.has(term))freq.set(term,(freq.get(term)||0)+1);
 }
 return [...freq].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,160).map(([term,count])=>({term,weight:Math.min(4,count)}));
}
export function analyzeLyrics(value){
 const text=lyricPlainText(value),sentences=text.split(/[\n.!?。！？]+/u).map(s=>s.trim()).filter(Boolean).slice(0,500),support=new Map();
 const add=(id,weight,evidence)=>{id=id.trim();const old=support.get(id)||{id,weight:0,evidence:[]};old.weight=Math.max(old.weight,weight);if(old.evidence.length<8)old.evidence.push(evidence);support.set(id,old);};
 sentences.forEach((sentence,i)=>{
  // Split contrastive clauses; adjacent context is evidence only for context rules.
  const context=normalizeLyricTerm(sentences.slice(Math.max(0,i-2),i+3).join(' '));
  for(const clause of sentence.split(/[,;]|(?<=지만)|(?<=는데)/u)){
   const s=normalizeLyricTerm(clause);if(!s)continue;
   for(const r of RULES)if(r.re.test(s)&&(!r.context||r.context.test(context))){
    for(const raw of r.tags){const id=raw.trim();if(DENIALS[id]?.test(s)||(['happy','joy','love','comfort'].includes(id)&&IRONY.test(context)))continue;
     // Someone else's apparent happiness in a painful memory is not the singer's joy.
     if(['happy','joy'].includes(id)&&/(?:네가|너는|넌|너만).{0,8}(?:행복|웃)/.test(s)&&/아프|아픈|미워|밉|안괜찮/.test(context))continue;
     add(id,r.weight,{rule:r.id,line:i});}
   }
  }
  // A past romance plus explicit parting, possibly across adjacent lines.
  const s=normalizeLyricTerm(sentence);
  if(/사랑했/.test(s)&&/(?:헤어졌|이별|떠났)/.test(context)&&!DENIALS.love.test(s))for(const id of ['love','breakup','longing'])add(id,.84,{rule:'past-parting-context',line:i});
 });
 const has=id=>support.has(id),derive=(id,needs,weight=.76)=>{if(needs.every(has))add(id,weight,{rule:'supported:'+needs.join('+'),line:-1});};
 for(const [id,needs] of [['sentimental',['longing']],['wistful',['lonely']],['warm',['comfort']],['bright',['happy','joy']],['dark',['despair']],['romantic',['love','flutter']],['serious',['life']],['after_breakup',['breakup']],['in_love',['love','flutter']],['need_comfort',['comfort']],['good_day',['happy','joy']],['reminisce',['memory','longing']]])derive(id,needs);
 if(/혼자있고싶|혼자남고싶/.test(normalizeLyricTerm(text)))add('alone',.86,{rule:'explicit-alone',line:-1});
 if(/울고싶|실컷울/.test(normalizeLyricTerm(text))&&has('sad'))derive('cry',['sad']);
 if(/달빛|별빛|꽃잎/.test(text)&&has('longing'))derive('poetic',['longing'],.72);
 if(/장난|깔깔|웃음꽃/.test(text)&&has('joy'))derive('playful',['joy'],.74);
 const tags=[...support.values()].map(s=>({id:s.id,category:LYRIC_TAG_BY_ID.get(s.id).category,confidence:Math.min(.97,Number((s.weight+Math.min(3,new Set(s.evidence.map(e=>e.line)).size-1)*.025).toFixed(3))),evidence:s.evidence,role:'secondary'})).filter(t=>t.confidence>=.7).sort((a,b)=>b.confidence-a.confidence||a.id.localeCompare(b.id));
 tags.filter(t=>t.category==='theme').slice(0,3).forEach(t=>t.role='primary');
 return {version:LYRIC_ANALYSIS_VERSION,empty:!text,tags,keywords:lyricKeywords(text),sentence_count:sentences.length};
}
export function lyricSearchIntent(value){
 const q=normalizeLyricTerm(String(value??'').slice(0,100)),found=[];
 if(!q)return {tags:[],keywords:[]};
 for(const t of LYRIC_TAGS){
  const direct=q===normalizeLyricTerm(t.label),alias=t.aliases.some(a=>q.includes(normalizeLyricTerm(a))&&normalizeLyricTerm(a).length>=2);
  if(direct||alias||t.query?.test(q))found.push({id:t.id,direct});
 }
 // A situation's component tags improve recall; no recursive synonym expansion.
 const components={after_breakup:['breakup'],in_love:['love','flutter'],alone:['lonely'],need_comfort:['comfort'],good_day:['happy'],cry:['sad'],reminisce:['memory','longing']};
 for(const t of [...found])for(const id of components[t.id]||[])if(!found.some(t=>t.id===id))found.push({id,direct:false});
 const words=lyricPlainText(value).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
 const keywords=[...new Set(words.filter(w=>!STOP.has(w)).map(w=>keywordStem(w).length>=2?keywordStem(w):w).filter(w=>w.length>=2&&w.length<=24&&!STOP.has(w)&&!/^\d+$/.test(w)))].slice(0,6);
 return {tags:found.slice(0,12),keywords:found.length?[]:keywords};
}
