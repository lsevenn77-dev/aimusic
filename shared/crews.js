import {CREW_GROWTH_LEVELS,growthLevel} from './crew-growth.js';
export const CREW_LEVELS=CREW_GROWTH_LEVELS;
export const CREW_REWARDS={dailyChat:0,publishedTrack:0,receivedGold:0};
export const crewLevel=growthLevel;
const crewBadgeLevels=[10,9,8,6,4,2];
export function crewBadgeUrl(level){
 const tier=crewBadgeLevels.find(min=>level>=min)??1;
 return `/assets/crew-badges/lv${tier}.webp`;
}

export const CREW_ROLES=Object.freeze({owner:'크루장',deputy:'부크루장',operator:'운영자',manager:'매니저',member:'크루원'});
