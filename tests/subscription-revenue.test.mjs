import test from 'node:test';
import assert from 'node:assert/strict';
import {SUBSCRIPTION_REVENUE_POLICY,allocateSubscriptionRevenue} from '../shared/subscription-revenue.js';

const payment={paidKRW:5900,refundedKRW:0,paymentFeeKRW:195,taxKRW:536};
const conserve=allocation=>{
 assert.equal(allocation.creatorMW+allocation.platformMW,allocation.netMW);
 assert.equal(allocation.creatorMW+allocation.platformMW+allocation.refundedMW+allocation.paymentFeeMW+allocation.taxMW,allocation.paidMW);
 for(const [key,value] of Object.entries(allocation))if(key.endsWith('MW'))assert.ok(Number.isSafeInteger(value)&&value>=0,key);
};

test('the October 5 subscription policy allocates net revenue equally and is immutable',()=>{
 assert.deepEqual(SUBSCRIPTION_REVENUE_POLICY,{version:'2026-10-05',basis:'paid_minus_refunds_actual_payment_fee_and_tax',creatorBP:5000,platformBP:5000});
 assert.equal(SUBSCRIPTION_REVENUE_POLICY.creatorBP+SUBSCRIPTION_REVENUE_POLICY.platformBP,10000);
 assert.throws(()=>{SUBSCRIPTION_REVENUE_POLICY.creatorBP=7000;},TypeError);
});

test('5900 KRW minus explicitly supplied actual fee and tax preserves half-won earnings',()=>{
 const input={...payment},allocation=allocateSubscriptionRevenue(input);
 assert.deepEqual(allocation,{policyVersion:'2026-10-05',paidMW:5900000,refundedMW:0,paymentFeeMW:195000,taxMW:536000,netMW:5169000,creatorMW:2584500,platformMW:2584500});
 assert.deepEqual(input,payment);assert.ok(Object.isFrozen(allocation));conserve(allocation);
});

test('partial and full refunds use explicit remaining fee and tax, without repricing the payment',()=>{
 const partial=allocateSubscriptionRevenue({paidKRW:5900,refundedKRW:3000,paymentFeeKRW:135,taxKRW:264});
 assert.deepEqual([partial.netMW,partial.creatorMW,partial.platformMW],[2501000,1250500,1250500]);conserve(partial);
 const full=allocateSubscriptionRevenue({...payment,refundedKRW:5900,paymentFeeKRW:0,taxKRW:0});
 assert.deepEqual([full.netMW,full.creatorMW,full.platformMW],[0,0,0]);conserve(full);
 const historical=allocateSubscriptionRevenue({paidKRW:4900,refundedKRW:0,paymentFeeKRW:161,taxKRW:445});
 assert.equal(historical.paidMW,4900000);assert.equal(historical.netMW,4294000);conserve(historical);
});

test('actual payment fees are not inferred from price or a fixed provider percentage',()=>{
 const low=allocateSubscriptionRevenue({...payment,paymentFeeKRW:0});
 const high=allocateSubscriptionRevenue({...payment,paymentFeeKRW:590});
 assert.equal(low.netMW-high.netMW,590000);assert.equal(low.creatorMW-high.creatorMW,295000);
 conserve(low);conserve(high);
});

test('allocation conserves every payment across varied refunds, fees, tax and large safe amounts',()=>{
 for(const paidKRW of [0,1,9,10,99,5900,100001,Math.floor(Number.MAX_SAFE_INTEGER/1000)]){
  for(const refundedKRW of [0,Math.floor(paidKRW/3),paidKRW]){
   const retained=paidKRW-refundedKRW,paymentFeeKRW=Math.floor(retained/17),taxKRW=Math.floor(retained/11);
   const allocation=allocateSubscriptionRevenue({paidKRW,refundedKRW,paymentFeeKRW,taxKRW});
   assert.equal(allocation.creatorMW,allocation.platformMW);conserve(allocation);
  }
 }
});

test('every amount is required; strings, fractions, negative and unsafe amounts are rejected',()=>{
 for(const input of [undefined,null,[],5900])assert.throws(()=>allocateSubscriptionRevenue(input),TypeError);
 for(const key of Object.keys(payment)){
  const missing={...payment};delete missing[key];assert.throws(()=>allocateSubscriptionRevenue(missing),RangeError,key);
  for(const value of [undefined,null,'0',true,-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER,Math.floor(Number.MAX_SAFE_INTEGER/1000)+1])assert.throws(()=>allocateSubscriptionRevenue({...payment,[key]:value}),RangeError,`${key}: ${String(value)}`);
 }
});

test('over-refunds and negative net require reconciliation instead of allocating invented earnings',()=>{
 assert.throws(()=>allocateSubscriptionRevenue({...payment,refundedKRW:5901}),/cannot exceed/);
 assert.throws(()=>allocateSubscriptionRevenue({...payment,refundedKRW:5900}),/cannot exceed/);
 assert.throws(()=>allocateSubscriptionRevenue({...payment,paymentFeeKRW:5900}),/cannot exceed/);
 assert.throws(()=>allocateSubscriptionRevenue({...payment,taxKRW:5900}),/cannot exceed/);
 const zero=allocateSubscriptionRevenue({paidKRW:5900,refundedKRW:5000,paymentFeeKRW:400,taxKRW:500});
 assert.equal(zero.netMW,0);conserve(zero);
});
