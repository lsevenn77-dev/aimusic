export const PLAYER_RULES=Object.freeze([
 {kind:'publish',label:'제작곡 공개',xp:100,limit:'곡마다 한 번'},
 {kind:'cover',label:'커버 · 듀엣 공개',xp:60,limit:'곡마다 한 번'},
 {kind:'listen',label:'음악 감상',xp:10,limit:'하루 한 번 · 30초 또는 곡의 60% 감상'},
 {kind:'comment',label:'다른 사람의 음악에 댓글',xp:5,limit:'하루 한 번'},
 {kind:'crew_chat',label:'크루에서 대화',xp:5,limit:'하루 한 번'}
]);
export const PLAYER_ITEMS=Object.freeze({
 'crew-outline':{name:'기본 크루 액자',type:'frame',artwork:'/assets/crew-basic-v2.png',description:'푸른 빛과 실버 장식으로 이어지는 크루의 상징',membership:true,usage:'크루 가입 중 사용 가능 · 무료 지급'},
 'player-level-10':{name:'숲속 마법의 화관 · LV.10',type:'frame',artwork:'/assets/player-level-10-forest-v1.png',description:'레벨 10을 달성한 음악가에게 드리는 빛나는 숲의 화관',min_level:10,usage:'유저 레벨 10 달성 보상 · 영구 소장'},
 'crew-level-3':{name:'크루 LV.3 액자',type:'frame',artwork:'/assets/crew-level-3-v1.png',description:'크루와 함께 이룬 레벨 3의 푸른 왕관',membership:true,min_crew_level:3,usage:'크루 레벨 3 이상 가입 중 사용 가능'},
 'crew-level-4':{name:'크루 LV.4 액자',type:'frame',artwork:'/assets/crew-level-4-v1.png',description:'크루 레벨 4를 기념하는 크리스털 왕관',membership:true,min_crew_level:4,usage:'크루 레벨 4 이상 가입 중 사용 가능'},
 'crew-level-5':{name:'크루 LV.5 액자',type:'frame',artwork:'/assets/crew-level-5-v1.png',description:'최고 크루 레벨의 보석과 날개로 빛나는 왕관',membership:true,min_crew_level:5,usage:'크루 레벨 5 가입 중 사용 가능'}
});
export function playerProgress(value){
 const xp=Math.max(0,Math.floor(Number(value)||0));
 const level=Math.min(100,Math.floor((1+Math.sqrt(1+xp/12.5))/2));
 const floor=50*level*(level-1),next=level===100?null:50*level*(level+1);
 return {level,xp,level_xp:xp-floor,next_xp:next,remaining:next===null?0:next-xp,progress:next===null?1:(xp-floor)/(next-floor)};
}
