// Operator-approved subscription policy. Gift revenue follows its separate policy.
export const SUBSCRIPTION_REVENUE_POLICY=Object.freeze({
 version:'2026-10-05',
 basis:'paid_minus_refunds_actual_payment_fee_and_tax',
 creatorBP:5000,
 platformBP:5000,
});

const MAX_KRW=Math.floor(Number.MAX_SAFE_INTEGER/1000);
function amount(input,key){
 const value=input[key];
 if(!Object.hasOwn(input,key)||!Number.isSafeInteger(value)||value<0||value>MAX_KRW)throw new RangeError(`${key} must be an explicit nonnegative integer KRW amount within milli-won precision`);
 return value;
}

// paidKRW is the original captured amount; refundedKRW is the verified refund.
// All inputs are whole KRW. No fee or tax is estimated here: callers supply actual
// payment fees and tax applicable to the retained payment after refunds.
// A negative net requires reconciliation, not a creator payout.
// This helper calculates policy amounts only; it neither books nor pays revenue.
export function allocateSubscriptionRevenue(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Explicit subscription payment amounts are required');
 const paidKRW=amount(input,'paidKRW'),refundedKRW=amount(input,'refundedKRW');
 const paymentFeeKRW=amount(input,'paymentFeeKRW'),taxKRW=amount(input,'taxKRW');
 if(refundedKRW>paidKRW)throw new RangeError('refundedKRW cannot exceed paidKRW');
 const netKRW=paidKRW-refundedKRW-paymentFeeKRW-taxKRW;
 if(netKRW<0)throw new RangeError('Refunds, actual payment fees and tax cannot exceed the paid amount');
 const netMW=netKRW*1000;
 const creatorMW=Number(BigInt(netMW)*BigInt(SUBSCRIPTION_REVENUE_POLICY.creatorBP)/10000n);
 return Object.freeze({
  policyVersion:SUBSCRIPTION_REVENUE_POLICY.version,
  paidMW:paidKRW*1000,
  refundedMW:refundedKRW*1000,
  paymentFeeMW:paymentFeeKRW*1000,
  taxMW:taxKRW*1000,
  netMW,
  creatorMW,
  platformMW:netMW-creatorMW,
 });
}
