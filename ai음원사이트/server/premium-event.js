// Signup completion and the cutoff use Unix seconds. The entire last KST second is included.
export const eventEnd = Date.parse('2027-01-01T00:00:00+09:00') / 1000;

// All queries using these expressions alias the server-owned users row as u.
// Eligibility remains available to administrators after the promotion ends.
export const eventUntilSQL = `CASE WHEN u.account_type='human' AND u.provider!='deleted' AND u.created<${eventEnd} THEN ${eventEnd} ELSE 0 END`;
export const otherUntilSQL = 'MAX(u.premium_until,u.apple_premium_until)';
export const effectiveUntilSQL = `MAX(${otherUntilSQL},${eventUntilSQL})`;

export function resolvePremiumUntil(user, at) {
 const eventUntil = user.event_premium_until > at ? user.event_premium_until : 0;
 return Math.max(user.premium_until, user.apple_premium_until || 0, eventUntil);
}
