import {BASE_PRICES} from '../dist/crew-fishing/pricing.js';
import {SIZES} from '../dist/crew-fishing/rules.js';

// Build only from trusted source constants, never request data. Existing catch
// snapshots stay intact; all current appraisals use the same schedule as new fish.
const literal=value=>`'${value.replaceAll("'","''")}'`;
const prices=Object.entries(BASE_PRICES).map(([fish,price])=>`WHEN ${literal(fish)} THEN ${price}`).join(' ');
const grades=Object.entries(SIZES).map(([grade,size])=>`WHEN ${literal(grade)} THEN ${size.percent}`).join(' ');
export const FISH_VALUE_SQL=`COALESCE(CAST(ROUND((CASE fish ${prices} END)*(CASE grade ${grades} END)/100.0) AS INTEGER),amount)`;
