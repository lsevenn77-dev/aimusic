export const CREW_LEVELS=[{level:1,xp:0,capacity:10},{level:2,xp:100,capacity:20},{level:3,xp:500,capacity:50},{level:4,xp:1500,capacity:100},{level:5,xp:3000,capacity:150}];
export const CREW_REWARDS={dailyChat:10,publishedTrack:1,receivedGold:1};
export function crewLevel(xp){const current=CREW_LEVELS.findLast(l=>xp>=l.xp)||CREW_LEVELS[0];return {...current,next_xp:CREW_LEVELS[current.level]?.xp??null};}

export const CREW_ROLES=Object.freeze({owner:'크루장',deputy:'부크루장',operator:'운영자',manager:'매니저',member:'크루원'});
