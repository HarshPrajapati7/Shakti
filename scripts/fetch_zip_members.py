"""Fetch only selected members of a remote ZIP archive using parallel HTTP range requests.

Why: PPG-DaLiA (UCI) and WESAD (sciebo) are multi-GB archives on slow, connection-dropping
servers, but training only needs the per-subject ``S*.pkl`` files. This tool:
  * creates a local file of the same size as the remote archive,
  * downloads only the byte ranges covering the central directory and the selected members,
  * runs chunks in parallel, retries every chunk, and records finished chunks in a sidecar
    JSON so it can be interrupted and resumed,
  * extracts the selected members with the standard ``zipfile`` module (CRC-checked).

Usage:
  python scripts/fetch_zip_members.py URL LOCAL.zip --list
  python scripts/fetch_zip_members.py URL LOCAL.zip --pattern "S\\d+\\.pkl$" --out DIR [--threads 8]
"""
import argparse
import json
import os
import re
import threading
import time
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed

CHUNK = 8 << 20  # 8 MiB
UA = {"User-Agent": "astra-health-fetch/1.0"}


def _open(url, start, end, timeout=60):
    req = urllib.request.Request(url, headers={**UA, "Range": f"bytes={start}-{end}"})
    return urllib.request.urlopen(req, timeout=timeout)


def remote_size(url):
    with _open(url, 0, 0) as r:
        cr = r.headers.get("Content-Range")
        if r.status != 206 or not cr:
            raise SystemExit(f"Server does not support range requests (status {r.status}).")
        return int(cr.split("/")[-1]), r.geturl()


def fetch_chunk(url, path, start, end, retries=30):
    pos = start
    for attempt in range(retries):
        try:
            with _open(url, pos, end) as r, open(path, "r+b") as f:
                if r.status != 206:
                    raise IOError(f"HTTP {r.status}")
                f.seek(pos)
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    f.write(b)
                    pos += len(b)
            if pos > end:
                return end - start + 1
        except Exception:  # network errors: back off and resume from current position
            time.sleep(min(30, 1.5 ** attempt))
    raise IOError(f"giving up on bytes {start}-{end}")


class ChunkLedger:
    def __init__(self, path, size):
        self.path, self.size, self.lock = path + ".chunks.json", size, threading.Lock()
        self.done = set()
        if os.path.exists(self.path):
            self.done = set(json.load(open(self.path))["done"])

    def mark(self, i):
        with self.lock:
            self.done.add(i)
            json.dump({"chunk": CHUNK, "size": self.size, "done": sorted(self.done)}, open(self.path, "w"))


def chunks_for(ranges, size):
    idx = set()
    for s, e in ranges:
        idx.update(range(s // CHUNK, min(e, size - 1) // CHUNK + 1))
    return sorted(idx)


def download(url, path, ranges, size, ledger, threads):
    todo = [i for i in chunks_for(ranges, size) if i not in ledger.done]
    total = len(todo) * CHUNK
    t0, got = time.time(), 0
    with ThreadPoolExecutor(threads) as ex:
        futs = {ex.submit(fetch_chunk, url, path, i * CHUNK, min(size, (i + 1) * CHUNK) - 1): i for i in todo}
        for fut in as_completed(futs):
            got += fut.result()
            ledger.mark(futs[fut])
            rate = got / max(1e-6, time.time() - t0) / 1e6
            print(f"  {got / 1e6:8.1f}/{total / 1e6:.1f} MB  {rate:5.2f} MB/s", flush=True)


def prepare_local(path, size, ledger):
    if not os.path.exists(path):
        open(path, "wb").close()
    cur = os.path.getsize(path)
    if not os.path.exists(ledger.path) and 0 < cur <= size:
        # a sequential partial download (e.g. from curl) is a valid prefix
        for i in range(cur // CHUNK):
            ledger.mark(i)
    if cur != size:
        with open(path, "r+b") as f:
            f.truncate(size)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("local")
    ap.add_argument("--pattern", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--threads", type=int, default=8)
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()

    size, url = remote_size(a.url)
    print(f"remote size {size / 1e9:.3f} GB  url {url}")
    ledger = ChunkLedger(a.local, size)
    prepare_local(a.local, size, ledger)
    download(url, a.local, [(max(0, size - (2 << 20)), size - 1)], size, ledger, a.threads)  # central directory

    zf = zipfile.ZipFile(a.local)
    infos = zf.infolist()
    if a.list or not a.pattern:
        for zi in infos:
            print(f"{zi.compress_size / 1e6:9.1f} MB  {zi.file_size / 1e6:9.1f} MB  {zi.filename}")
        return
    sel = [zi for zi in infos if re.search(a.pattern, zi.filename)]
    print(f"selected {len(sel)} members, {sum(z.compress_size for z in sel) / 1e9:.3f} GB compressed")
    ranges = [(z.header_offset, z.header_offset + 30 + len(z.filename.encode()) + 4096 + z.compress_size) for z in sel]
    download(url, a.local, ranges, size, ledger, a.threads)
    if a.out is None:  # keep members compressed inside the local zip; read them with zipfile later
        for z in sel:
            with zf.open(z) as src:  # CRC check of every selected member
                while src.read(16 << 20):
                    pass
        print("DONE (verified, not extracted)")
        return
    os.makedirs(a.out, exist_ok=True)
    for z in sel:
        dst = os.path.join(a.out, os.path.basename(z.filename))
        if os.path.exists(dst) and os.path.getsize(dst) == z.file_size:
            continue
        with zf.open(z) as src, open(dst + ".part", "wb") as f:
            while True:
                b = src.read(16 << 20)
                if not b:
                    break
                f.write(b)
        os.replace(dst + ".part", dst)
        print("extracted", dst)
    print("DONE")


if __name__ == "__main__":
    main()
