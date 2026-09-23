# AIFECT direct NICEPAY billing

Sites runs the payment API and D1 ledger. The private worker on the existing
server invokes `/internal/billing/tick` every minute. It has only the worker
token; NICEPAY credentials and encrypted billing keys stay in Sites.

- Monthly price: KRW 4,900 including VAT.
- `BILLING_CHECKOUT_ENABLED` remains `false` until the merchant's recurring
  card billing application is approved. New subscriptions also require a recent
  worker heartbeat. Enabling new checkout does not schedule a test charge.
- Ambiguous payment results are looked up; the same order is never blindly
  charged again. A failed renewal does not grant another period.
- Cancellation ends renewal, retains the paid period, and expires the billing
  key after pending payments settle. Verified refunds end the refunded benefit.
- NICEPAY may send unsigned sample orders during webhook registration. These
  are acknowledged without creating a payment or granting access. Known orders
  require a valid signature and fresh gateway lookup with matching amount,
  currency, card method and subscription identity.

## Existing server deployment

Files live under `/root/aifect/billing`. Install `compose.yml` as
`/root/aifect/compose.billing.yml`, and a mode-600 `.env.billing` alongside it:

```
SITE_URL=https://aifect.co.kr
BILLING_WORKER_TOKEN=<same secret as Sites>
```

Start only the billing service:

```
docker compose -p aifect -f /root/aifect/compose.billing.yml up -d --build --no-deps billing
```

Other AIFECT workers use separate Compose files; never use `--remove-orphans`.
Container health checks require a successful signed tick in the last 240 seconds.

## Webhook relay

NICEPAY's Java HTTP client was blocked by the Sites edge before reaching the
application. `billing.aifect.co.kr` has an A record to the existing server,
58.121.85.196. Nginx accepts only `/nicepay`, forwarding POST bodies with a
service User-Agent to the native Sites hostname, with upstream TLS verification.
No authentication is removed from actual payment processing.

Register `https://billing.aifect.co.kr/nicepay` for **credit-card payments and
cancellations** in NICEPAY. `nginx.conf` is the endpoint configuration. Its
Let's Encrypt certificate is renewed via webroot; install `renew-nginx.sh` in
`/etc/letsencrypt/renewal-hooks/deploy/` to reload Nginx after that certificate
renews. Do not expose any other path or proxy arbitrary destinations.

## Launch and operations

On 2026-09-24, the payment-flow document was emailed to NICEPAY in reply to
the original contract email. NICEPAY had stated that card-company review had
not started because the document was missing. Acceptance of the new submission
and recurring billing approval are still pending. Confirm the added billing
contract and enabled card brands before enabling checkout. Real card
registration/charges have not been tested.

The merchant can cancel/refund payments in NICEPAY; signed notifications and
periodic lookups reconcile AIFECT access. Unknown outcomes stay pending for
review instead of issuing another charge. Never reset a pending order to
`created` without resolving its actual gateway result first.
