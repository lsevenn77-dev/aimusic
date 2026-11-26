import {practiceSession as baseSession} from './practice.js';
import {FISH} from './catalog.js';
import {TIERS} from './rules.js';
import {loadout} from './shore-gear.js';

const ranks = new Map(Object.keys(TIERS).map((id,index)=>[id,index]));
const fishRank = new Map(FISH.map(fish=>[fish.id,ranks.get(fish.tier)]));

export function practiceSession(info, draw, now) {
  return baseSession(info, async () => {
    const {rod,bait} = loadout();
    const first = await draw();
    let pick = first;
    if (Math.random() * 100 < rod.luck + (bait?.luck || 0)) {
      try {
        const extra = await draw();
        if (fishRank.get(extra.fish) > fishRank.get(first.fish)) pick = extra;
      } catch { /* The first practice encounter is already valid. */ }
    }
    return {...pick, waitMs:Math.max(1000, (first.waitMs ?? 1000) - (bait?.seconds || 0)*1000)};
  }, now);
}
