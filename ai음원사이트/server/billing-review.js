import {now} from './db.js';
export const reviewAccount=(env,user)=>!!user&&(env.BILLING_REVIEW_USER_IDS||'').split(',').map(x=>x.trim()).includes(user.id);
export const reviewAvailable=(env,user)=>reviewAccount(env,user)&&Number(env.BILLING_REVIEW_UNTIL)>now();
