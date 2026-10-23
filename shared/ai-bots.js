export const BOT_CATEGORIES=['first','original','solo','duet','dubbing','general'];
export const BOT_STYLES=['warm','polite','cheerful'];
export const BOT_DEFAULTS=Object.freeze({enabled:false,comments:1,probability:100,gifts:true,giftMin:1,giftMax:2,commentMin:300,commentMax:900,giftDelayMin:600,giftDelayMax:1800,dailyComments:100,dailyGifts:200,creatorDaily:2,humanThreshold:3,newOnly:false,newPriority:true,kinds:['original','solo','duet','dubbing']});
const intros={first:['첫 작품 공개를 축하해요','첫 창작 활동의 시작을 응원해요','첫 작품을 등록해주셔서 반가워요','AIFECT에서의 첫걸음을 축하해요','첫 공개를 함께 축하할게요'],original:['새 음원 공개를 축하해요','새로운 음악 소식이 도착했네요','음악을 공개해주셔서 고마워요','새 작품 등록을 환영해요','또 하나의 음악 기록을 축하해요'],solo:['새 솔로 커버 등록을 축하해요','새로운 커버 소식이 반가워요','솔로 커버 활동을 응원해요','커버를 공개해주셔서 고마워요','나만의 커버 기록을 축하해요'],duet:['듀엣 완성을 축하해요','함께 만든 듀엣의 공개를 축하해요','두 사람의 창작 활동을 응원해요','새 듀엣 소식이 반가워요','함께 완성한 작품 등록을 환영해요'],dubbing:['더빙 완성을 축하해요','새 더빙 공개를 축하해요','함께한 더빙 작업을 응원해요','더빙 작품 등록이 반가워요','새로운 이야기의 공개를 환영해요'],general:['오늘의 창작 활동을 응원해요','새 작품 소식을 반갑게 맞이해요','창작의 기록을 남겨주셔서 고마워요','앞으로의 활동도 응원할게요','꾸준한 창작의 즐거움을 응원해요']};
const tails=['. 다음 창작도 즐겁게 이어가세요!','. 창작하는 하루를 응원할게요!','. 새로운 도전을 축하해요!','. AIFECT 공식 응원단이 마음을 전해요!'];
export const BOT_SEED_TEMPLATES=BOT_CATEGORIES.flatMap(category=>intros[category].flatMap((intro,i)=>tails.map((tail,j)=>({id:`seed-${category}-${i}-${j}`,category,style:BOT_STYLES[(i+j)%3],body:intro+tail}))));
export function botConfig(value){
 const d={...BOT_DEFAULTS,...value};
 for(const [k,min,max] of [['comments',0,2],['probability',0,100],['giftMin',1,20],['giftMax',1,20],['commentMin',0,86400],['commentMax',0,86400],['giftDelayMin',0,86400],['giftDelayMax',0,86400],['dailyComments',0,10000],['dailyGifts',0,20000],['creatorDaily',0,20],['humanThreshold',1,100]])if(!Number.isInteger(d[k])||d[k]<min||d[k]>max)throw new Error('설정 범위를 확인해주세요: '+k);
 for(const k of ['enabled','gifts','newOnly','newPriority'])if(typeof d[k]!=='boolean')throw new Error('설정 형식을 확인해주세요: '+k);
 if(d.giftMin>d.giftMax||d.commentMin>d.commentMax||d.giftDelayMin>d.giftDelayMax)throw new Error('최소값은 최대값보다 클 수 없어요.');
 if(!Array.isArray(d.kinds)||d.kinds.some(k=>!['original','solo','duet','dubbing'].includes(k)))throw new Error('작품 종류를 확인해주세요.');
 return Object.fromEntries(Object.keys(BOT_DEFAULTS).map(k=>[k,d[k]]));
}
