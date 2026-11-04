import {SIZES} from './rules.js';

// One fish, B size grade, KRW. Common appraisals are market-informed;
// rare and higher variants use the requested fictional collectible price bands.
// Policy and sources: docs/CREW_FISHING_PRICING_20261104.md.
export const BASE_PRICES=Object.freeze({
  'tidal-anchovy':200,
  'pebble-goby':2000,
  'kelp-wrasse':2500,
  'ring-bream':5000,
  'ribbon-halfbeak':2400,
  'sand-flounder':6000,
  'copper-mullet':8000,
  'stripe-perch':20000,
  'ember-clown':28500,
  'ink-catfish':10000,
  'sky-flyer':200000,
  'moon-puffer':350000,
  'coral-horse':450000,
  'lantern-angler':550000,
  'rose-scorpion':500000,
  'sail-marlin':800000,
  'lemon-box':400000,
  'velvet-ray':750000,
  'prism-butterfly':1300000,
  'comet-ribbon':1700000,
  'bell-barreleye':2300000,
  'aurora-sunfish':3200000,
  'clock-coelacanth':4000000,
  'crown-sturgeon':15000000,
  'eclipse-manta':25000000,
  'frost-drake':35000000,
  'galaxy-leviathan':250000000
});

export function fishValue(fish,grade,fallback=0){
  if(!Object.hasOwn(BASE_PRICES,fish)||!Object.hasOwn(SIZES,grade))return fallback;
  return Math.round(BASE_PRICES[fish]*SIZES[grade].percent/100);
}
