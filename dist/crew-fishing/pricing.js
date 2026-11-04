import {FISH} from './catalog.js';
import {TIERS,SIZES} from './rules.js';

// One fish, B size grade, KRW. Market-informed game appraisals, not live quotes.
// Sources, size limitations and balance choices: docs/CREW_FISHING_PRICING_20261104.md.
const COMMON_PRICES = {
  'tidal-anchovy':200,
  'pebble-goby':2000,
  'kelp-wrasse':2500,
  'ring-bream':5000,
  'ribbon-halfbeak':2400,
  'sand-flounder':6000,
  'copper-mullet':8000,
  'stripe-perch':20000,
  'ember-clown':28500,
  'ink-catfish':10000
};
const common=FISH.filter(f=>f.tier==='common');
export const COMMON_REFERENCE=common.reduce((sum,f)=>sum+COMMON_PRICES[f.id],0)/common.length;

// Fictional species: zero-mean offsets preserve the old 5x / 5x / 10x / 10x
// ratios between tier averages while differentiating every species in a tier.
const OFFSETS = {
  'sky-flyer':-2000,'moon-puffer':-1500,'coral-horse':1000,'lantern-angler':-500,
  'rose-scorpion':500,'sail-marlin':2000,'lemon-box':-1000,'velvet-ray':1500,
  'prism-butterfly':-2000,'comet-ribbon':-1000,'bell-barreleye':0,
  'aurora-sunfish':1000,'clock-coelacanth':2000,
  'crown-sturgeon':-1500,'eclipse-manta':0,'frost-drake':1500,
  'galaxy-leviathan':0
};
export const BASE_PRICES=Object.freeze(Object.fromEntries(FISH.map(f=>[f.id,
  f.tier==='common'?COMMON_PRICES[f.id]:(COMMON_REFERENCE+OFFSETS[f.id])*TIERS[f.tier].multiplier
])));

export function fishValue(fish,grade,fallback=0){
  if(!Object.hasOwn(BASE_PRICES,fish)||!Object.hasOwn(SIZES,grade))return fallback;
  return Math.round(BASE_PRICES[fish]*SIZES[grade].percent/100);
}
