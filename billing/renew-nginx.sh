#!/bin/sh
# Refresh Nginx only after this endpoint's certificate is renewed.
set -eu
if [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/billing.aifect.co.kr ]; then
    nginx -t && systemctl reload nginx
fi
