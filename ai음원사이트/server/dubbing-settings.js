import {one} from './db.js';
import {DUBBING_SOUND_GOLD} from '../shared/dubbing.js';
export async function dubbingSettings(env){const s=await one(env,"SELECT sound_gold,version,updated FROM dubbing_settings WHERE key='default'");return s?{soundGold:s.sound_gold,version:s.version,updated:s.updated}:{soundGold:DUBBING_SOUND_GOLD,version:0,updated:0};}
export const dubbingPriceSQL="COALESCE((SELECT sound_gold FROM dubbing_settings WHERE key='default'),50)";
