"""Private heartbeat and renewal caller. Payment credentials stay in Sites."""
import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
site = os.environ["SITE_URL"].rstrip("/")
token = os.environ["BILLING_WORKER_TOKEN"]
if site != "https://aifect.co.kr" or not token:
    raise SystemExit("Invalid billing worker configuration")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


opener = urllib.request.build_opener(NoRedirect)
last_log = 0
while True:
    started = time.monotonic()
    try:
        request = urllib.request.Request(
            site + "/internal/billing/tick",
            data=b"{}",
            method="POST",
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json",
                     "User-Agent": "AIFECT-Billing/1.0 (+https://aifect.co.kr)"},
        )
        with opener.open(request, timeout=120) as response:
            data = json.loads(response.read(4096))
            if response.status != 200 or data.get("ok") is not True:
                raise ValueError("Invalid worker response")
        with open("/tmp/last-success", "w", encoding="ascii") as health:
            health.write(str(time.time()))
        if data.get("processed") or started - last_log > 3600:
            logging.info("Billing tick OK; processed=%s", int(data.get("processed", 0)))
            last_log = started
    except urllib.error.HTTPError as error:
        logging.error("Billing tick failed; HTTP %s", error.code)
    except Exception as error:
        logging.error("Billing tick failed; %s", type(error).__name__)
    time.sleep(max(1, 60 - (time.monotonic() - started)))
