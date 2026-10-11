export const PLAYER_RULES=Object.freeze([
 {kind:'publish',label:'제작곡 공개',xp:100,limit:'곡마다 한 번'},
 {kind:'cover',label:'커버 · 듀엣 공개',xp:60,limit:'곡마다 한 번'},
 {kind:'listen',label:'음악 감상',xp:10,limit:'하루 한 번 · 30초 또는 곡의 60% 감상'},
 {kind:'comment',label:'다른 사람의 음악에 댓글',xp:5,limit:'하루 한 번'},
 {kind:'crew_chat',label:'크루에서 대화',xp:5,limit:'하루 한 번'}
]);
export const PLAYER_ITEMS=Object.freeze({
 'crew-outline':{name:'기본 크루 액자',type:'frame',artwork:'/assets/crew-basic-v2.png',description:'푸른 빛과 실버 장식으로 이어지는 크루의 상징',membership:true}
});
export function playerProgress(value){
 const xp=Math.max(0,Math.floor(Number(value)||0));
 const level=Math.min(100,Math.floor((1+Math.sqrt(1+xp/12.5))/2));
 const floor=50*level*(level-1),next=level===100?null:50*level*(level+1);
 return {level,xp,level_xp:xp-floor,next_xp:next,remaining:next===null?0:next-xp,progress:next===null?1:(xp-floor)/(next-floor)};
}
