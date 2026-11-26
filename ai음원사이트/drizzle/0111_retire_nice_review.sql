-- Retire the designated review account. Retain independently purchased time.
INSERT OR IGNORE INTO admin_audit(id,admin_id,action,target,created)
SELECT 'billing-review-retired:'||id,'runtime-operator','billing_review_retired',id,unixepoch()
FROM users WHERE id='91bb7d15-f1b8-4480-8ec0-6fe2edd6a118' AND provider='email';
--> statement-breakpoint
UPDATE users SET premium_until=MAX(
 COALESCE((SELECT MAX(expiry) FROM play_purchases WHERE user_id=users.id AND kind='subs'),0),
 COALESCE((SELECT MAX(p.entitlement_end) FROM billing_payments p JOIN billing_subscriptions s ON s.id=p.subscription_id WHERE s.user_id=users.id),0))
WHERE id='91bb7d15-f1b8-4480-8ec0-6fe2edd6a118' AND premium_until=1822453153
AND EXISTS(SELECT 1 FROM admin_audit WHERE action='premium_grant' AND json_valid(target) AND CASE WHEN json_valid(target) THEN json_extract(target,'$.user_id') END=users.id AND CASE WHEN json_valid(target) THEN json_extract(target,'$.until') END=users.premium_until);
--> statement-breakpoint
UPDATE play_purchases SET baseline_until=0 WHERE user_id='91bb7d15-f1b8-4480-8ec0-6fe2edd6a118' AND kind='subs' AND baseline_until=1822453153;
--> statement-breakpoint
UPDATE billing_subscriptions SET baseline_until=0 WHERE user_id='91bb7d15-f1b8-4480-8ec0-6fe2edd6a118' AND baseline_until=1822453153;
