"""Export encrypted AIFECT image copies, then verify them after a Bigfile upload."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from getpass import getpass
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import build_opener, HTTPRedirectHandler, Request

ORIGIN = "https://aifect.co.kr"
CDN = "https://lseven7.cache.iwinv.net/Image/"
MAX_BYTES = 16 * 1024 * 1024 + 28


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def get(url, headers, limit):
    # Only call fixed service hosts. Never forward an export token on a redirect.
    request = Request(url, headers={**headers, "Accept-Encoding": "identity"})
    with build_opener(NoRedirect()).open(request, timeout=30) as response:
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("Response exceeds expected size")
        return data, response.headers


def atomic(path, data):
    tmp = path.with_suffix(path.suffix + ".part")
    tmp.write_bytes(data)
    tmp.replace(path)


def save_json(path, value):
    atomic(path, (json.dumps(value, indent=2) + "\n").encode())


def export_files(folder, token):
    files = folder / "files"
    files.mkdir(parents=True, exist_ok=True)
    record = folder / "export.json"
    previous = json.loads(record.read_text())["files"] if record.exists() else {}
    headers = {"Authorization": "Bearer " + token}
    receipt = {}
    skipped = changed = 0

    def download(item):
        ident = item["id"]
        if not re.fullmatch("[0-9a-f]{64}", ident):
            raise ValueError("Invalid object ID")
        size = item["size"] + 28
        if not 28 < size <= MAX_BYTES:
            raise ValueError("Invalid object size")
        file = files / (ident + ".bin")
        old = previous.get(ident)
        if old and file.exists() and file.stat().st_size == size:
            if hashlib.sha256(file.read_bytes()).hexdigest() == old:
                return ident, old
        query = urlencode({"id": ident, "handle": item["handle"]})
        try:
            body, meta = get(ORIGIN + "/internal/image-mirror/blob?" + query, headers, size)
        except HTTPError as error:
            if error.code in (409, 422):
                return ident, None
            raise
        if len(body) != size or meta.get_content_type() != "application/octet-stream":
            raise ValueError("Invalid ciphertext response")
        atomic(file, body)
        return ident, hashlib.sha256(body).hexdigest()

    cursor = None
    seen_cursors = set()
    with ThreadPoolExecutor(max_workers=3) as pool:
        while True:
            suffix = "?" + urlencode({"cursor": cursor}) if cursor else ""
            body, _ = get(ORIGIN + "/internal/image-mirror/inventory" + suffix, headers, 256 * 1024)
            page = json.loads(body)
            skipped += page["skipped"]
            for ident, digest in pool.map(download, page["objects"]):
                if digest is None:
                    changed += 1
                else:
                    receipt[ident] = digest
            cursor = page["nextCursor"]
            if not cursor:
                break
            if cursor in seen_cursors:
                raise ValueError("Repeated inventory cursor")
            seen_cursors.add(cursor)
    save_json(record, {"files": receipt, "skipped": skipped, "changed_or_invalid": changed})
    print(f"Exported {len(receipt)} images. Skipped {skipped}, changed or invalid {changed}.", flush=True)


def verify(folder):
    receipt = json.loads((folder / "export.json").read_text())["files"]
    def verified(pair):
        ident, digest = pair
        if not re.fullmatch("[0-9a-f]{64}", ident):
            raise ValueError("Invalid object ID")
        try:
            body, headers = get(CDN + ident + ".bin", {"Origin": ORIGIN}, MAX_BYTES)
            if (headers.get("Access-Control-Allow-Origin") in ("*", ORIGIN)
                    and hashlib.sha256(body).hexdigest() == digest):
                return ident
        except (OSError, ValueError):
            pass
        return None
    with ThreadPoolExecutor(max_workers=4) as pool:
        ids = sorted(x for x in pool.map(verified, receipt.items()) if x)
    save_json(folder / "verified.json", ids)
    print(f"Verified {len(ids)}/{len(receipt)} encrypted objects.", flush=True)
    return len(ids) == len(receipt)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["export", "verify"])
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    if args.action == "export":
        export_files(args.directory, os.environ.get("AIFECT_IMAGE_EXPORT_TOKEN") or getpass("Export token: "))
    else:
        raise SystemExit(0 if verify(args.directory) else 1)
