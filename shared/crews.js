export const CREW_LEVELS=[{level:1,xp:0,capacity:10},{level:2,xp:100,capacity:20},{level:3,xp:500,capacity:50},{level:4,xp:1500,capacity:100},{level:5,xp:3000,capacity:150}];
export const CREW_REWARDS={dailyChat:10,publishedTrack:50};
export function crewLevel(xp){const current=CREW_LEVELS.findLast(l=>xp>=l.xp)||CREW_LEVELS[0];return {...current,next_xp:CREW_LEVELS[current.level]?.xp??null};}
